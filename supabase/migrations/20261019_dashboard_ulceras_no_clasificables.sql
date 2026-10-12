-- CJA Hospital — Dashboard · Seguridad: úlceras «sin grado» y «no clasificables» por separado (2026-10-19)
--
-- Se vuelve a sustituir dashboard_seguridad (no cambia ninguna tabla). Antes ulceras.sin_grado juntaba dos situaciones
-- distintas; ahora:
--   · ulceras.sin_grado: úlceras por presión del periodo sin ninguna valoración con grado (trabajo pendiente).
--   · ulceras.grado_no_clasificable: úlceras valoradas como «no clasificable» y sin ningún otro grado (no es trabajo pendiente).
--
-- Transaccional e idempotente.

begin;

create or replace function public.dashboard_seguridad(
  p_desde date,
  p_hasta date,
  p_medico_id uuid default null
) returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_dias_estancia bigint;
  v_por_tipo jsonb;
  v_caidas jsonb;
  v_ulceras jsonb;
  v_otras jsonb;
  v_contenciones jsonb;
begin
  if not private.soy_admin() then
    raise exception 'Solo un administrador puede acceder al Dashboard.';
  end if;
  if p_desde > p_hasta then
    raise exception 'La fecha "desde" no puede ser posterior a "hasta".';
  end if;

  select coalesce(sum(
    greatest(0, (least(coalesce(i.fecha_alta, p_hasta + 1), p_hasta + 1) - greatest(i.fecha_ingreso, p_desde)))
  ), 0) into v_dias_estancia
  from public.ingresos i
  where i.fecha_ingreso <= p_hasta
    and (i.fecha_alta is null or i.fecha_alta >= p_desde)
    and (p_medico_id is null or i.medico_responsable_id = p_medico_id);

  select coalesce(jsonb_agg(jsonb_build_object(
    'tipo', t.tipo,
    'total', t.total,
    'pacientes_afectados', t.pacientes,
    'pendientes', t.pendientes,
    'tasa_1000', case when v_dias_estancia > 0 then round(t.total::numeric / v_dias_estancia * 1000, 2) else null end
  ) order by t.total desc), '[]'::jsonb)
  into v_por_tipo
  from (
    select e.tipo, count(*) as total, count(distinct i.paciente_id) as pacientes,
           count(*) filter (where e.estado = 'pendiente') as pendientes
    from public.eventos e
    inner join public.ingresos i on i.id = e.ingreso_id
    where e.fecha between p_desde and p_hasta
      and e.tipo not in ('ulcera', 'infeccion_nosocomial')
      and (p_medico_id is null or i.medico_responsable_id = p_medico_id)
    group by e.tipo
  ) t;

  select jsonb_build_object(
    'total', count(*),
    'con_lesion', count(*) filter (where e.datos->>'con_lesion' = 'Sí'),
    'pendientes_valoracion', count(*) filter (where e.datos->>'con_lesion' = 'Pendiente de valoración'),
    'graves', count(*) filter (where e.datos->>'gravedad' = 'Grave' or e.datos->>'consecuencias' in ('Fractura', 'TCE')),
    'tasa_total_1000', case when v_dias_estancia > 0 then round(count(*)::numeric / v_dias_estancia * 1000, 2) else null end,
    'tasa_con_lesion_1000', case when v_dias_estancia > 0 then round(count(*) filter (where e.datos->>'con_lesion' = 'Sí')::numeric / v_dias_estancia * 1000, 2) else null end
  ) into v_caidas
  from public.eventos e
  inner join public.ingresos i on i.id = e.ingreso_id
  where e.tipo = 'caida' and e.fecha between p_desde and p_hasta
    and (p_medico_id is null or i.medico_responsable_id = p_medico_id);

  -- Pacientes con 2 o más caídas en el periodo (cuenta por paciente, aunque tenga más de un episodio). Cada fila lleva el
  -- episodio de su caída más reciente, para poder abrir su ficha.
  with rep as (
    select (array_agg(i.id order by e.fecha desc, i.fecha_ingreso desc))[1] as ingreso_id,
           (p.primer_apellido || case when p.segundo_apellido is not null and p.segundo_apellido <> '' then ' ' || p.segundo_apellido else '' end
             || ', ' || p.nombre) as paciente,
           count(*) as caidas
    from public.eventos e
    inner join public.ingresos i on i.id = e.ingreso_id
    inner join public.pacientes p on p.id = i.paciente_id
    where e.tipo = 'caida' and e.fecha between p_desde and p_hasta
      and (p_medico_id is null or i.medico_responsable_id = p_medico_id)
    group by p.id, p.primer_apellido, p.segundo_apellido, p.nombre
    having count(*) >= 2
  )
  select v_caidas || jsonb_build_object(
    'pacientes_con_caidas_repetidas', (select count(*) from rep),
    'repetidas', coalesce((select jsonb_agg(jsonb_build_object('ingreso_id', r.ingreso_id, 'paciente', r.paciente, 'caidas', r.caidas)
                                            order by r.caidas desc, r.paciente) from rep r), '[]'::jsonb)
  ) into v_caidas;

  -- Úlceras por presión: salen de Curas (curas_lesiones con tipo 'upp'),
  -- no de las incidencias. Periodo = fecha de inicio/detección.
  --   producidas en el centro  -> origen 'centro'  (las que cuentan para la tasa)
  --   presentes al ingreso     -> origen 'fuera'
  --   sin origen indicado      -> origen null (pendiente de completar en Curas)
  -- Grado III-IV: el grado MÁXIMO que haya llegado a registrarse. «Sin grado» = trabajo pendiente: ninguna valoración
  -- con grado (no hay valoración, o ninguna lo tiene escrito). «No clasificable» se cuenta aparte: ya se valoró y no se puede graduar.
  with upp as (
    select l.id, l.ingreso_id, i.paciente_id, l.origen,
           (select max(case v.grado when 'I' then 1 when 'II' then 2 when 'III' then 3 when 'IV' then 4 end)
              from public.curas_valoraciones v where v.lesion_id = l.id) as grado_max,
           exists (select 1 from public.curas_valoraciones v where v.lesion_id = l.id and v.grado = 'no_clasificable') as no_clasificable
    from public.curas_lesiones l
    inner join public.ingresos i on i.id = l.ingreso_id
    where l.caracteristicas = 'upp'
      and l.fecha_inicio between p_desde and p_hasta
      and (p_medico_id is null or i.medico_responsable_id = p_medico_id)
  )
  select jsonb_build_object(
    'presentes_al_ingreso', count(*) filter (where origen = 'fuera'),
    'aparecidas_durante', count(*) filter (where origen = 'centro'),
    'sin_origen', count(*) filter (where origen is null),
    'grado_iii_iv', count(*) filter (where grado_max >= 3),
    'sin_grado', count(*) filter (where grado_max is null and not no_clasificable),
    'grado_no_clasificable', count(*) filter (where grado_max is null and no_clasificable),
    'pacientes_afectados', count(distinct paciente_id),
    'tasa_aparecidas_1000', case when v_dias_estancia > 0 then round(
      count(*) filter (where origen = 'centro')::numeric / v_dias_estancia * 1000, 2
    ) else null end
  ) into v_ulceras
  from upp;

  -- "Pendientes de completar" cuenta las incidencias pendientes de
  -- TODOS los tipos del periodo (también las caídas), igual que
  -- la tabla "por tipo" y que la lista que se abre al pulsarla. Los
  -- recuentos de cada tipo siguen filtrando por su tipo.
  select jsonb_build_object(
    'errores_medicacion', count(*) filter (where e.tipo = 'error_medicacion'),
    'efectos_adversos', count(*) filter (where e.tipo = 'efecto_adverso_medicacion'),
    'agresiones', count(*) filter (where e.tipo = 'agresividad_fisica'),
    'fugas', count(*) filter (where e.tipo = 'fuga'),
    'atragantamientos', count(*) filter (where e.tipo = 'atragantamiento'),
    'derivaciones_urgencias', count(*) filter (where e.datos->>'derivacion' = 'Urgencias, sin ingreso'),
    'ingresos_hospitalarios', count(*) filter (where e.datos->>'derivacion' = 'Ingreso hospitalario'),
    'pendientes_completar', count(*) filter (where e.estado = 'pendiente')
  ) into v_otras
  from public.eventos e
  inner join public.ingresos i on i.id = e.ingreso_id
  where e.fecha between p_desde and p_hasta
    and e.tipo not in ('ulcera', 'infeccion_nosocomial')
    and (p_medico_id is null or i.medico_responsable_id = p_medico_id);

  -- Infecciones nosocomiales: ya no son una incidencia, se anotan a mano en el CMBD (casilla del episodio). Cuenta los
  -- episodios del periodo (los que se solapan con él) con la casilla marcada, así la cifra coincide con la lista del Explorador.
  v_otras := v_otras || jsonb_build_object('infecciones_nosocomiales', (
    select count(*)
    from public.cmbd cm
    inner join public.ingresos i on i.id = cm.ingreso_id
    where cm.infeccion_nosocomial is true
      and i.fecha_ingreso <= p_hasta
      and (i.fecha_alta is null or i.fecha_alta >= p_desde)
      and (p_medico_id is null or i.medico_responsable_id = p_medico_id)
  ));

  with pauta as (
    select
      (coalesce(c.dia = 'continua_seguridad', false)
        or coalesce('contencion_fija' = any(c.noche), false)) as activa,
      (coalesce(c.dia in ('si_precisa_supervision', 'si_precisa_paciente'), false)
        or coalesce('contencion_si_precisa' = any(c.noche), false)) as si_precisa,
      c.confirmado_por_id
    from public.ingresos i2
    inner join public.contenciones c on c.ingreso_id = i2.id
    where i2.estado = 'activo'
      and (p_medico_id is null or i2.medico_responsable_id = p_medico_id)
  )
  select jsonb_build_object(
    'pacientes_con_contencion_activa', (select count(*) from pauta where activa),
    'pacientes_con_si_precisa', (select count(*) from pauta where si_precisa and not activa),
    'pendientes_confirmacion', (select count(*) from pauta where (activa or si_precisa) and confirmado_por_id is null),
    -- Denominador del porcentaje: todos los pacientes ingresados hoy, tengan o no pauta de contención.
    'pacientes_ingresados', (
      select count(*) from public.ingresos i3
      where i3.estado = 'activo' and (p_medico_id is null or i3.medico_responsable_id = p_medico_id)
    )
  ) into v_contenciones;

  return jsonb_build_object(
    'por_tipo', v_por_tipo,
    'caidas', v_caidas,
    'ulceras', v_ulceras,
    'otras', v_otras,
    'contenciones', v_contenciones,
    'dias_estancia', v_dias_estancia
  );
end;
$$;

commit;
