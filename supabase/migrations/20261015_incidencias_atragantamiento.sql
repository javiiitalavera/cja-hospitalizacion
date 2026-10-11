-- CJA Hospital — Incidencias: atragantamiento y derivación a urgencias/hospital (2026-10-15)
--
--   · Nuevo tipo de incidencia «atragantamiento» (eventos.tipo).
--   · Los campos nuevos (derivación, caída presenciada y mecanismo, y los del atragantamiento) viven dentro de
--     eventos.datos (jsonb), así que no necesitan columnas.
--   · dashboard_seguridad cuenta los atragantamientos y las derivaciones: 'atragantamientos',
--     'derivaciones_urgencias' (urgencias sin ingreso) e 'ingresos_hospitalarios' dentro de «otras».
--
-- Transaccional e idempotente.

begin;

-- El CHECK del tipo se sustituye por otro que incluye el nuevo. Se busca por su contenido, no por su nombre.
do $$
declare r record;
begin
  for r in
    select conname from pg_constraint
    where conrelid = 'public.eventos'::regclass and contype = 'c'
      and pg_get_constraintdef(oid) like '%infeccion_nosocomial%'
  loop
    execute format('alter table public.eventos drop constraint %I', r.conname);
  end loop;
  alter table public.eventos add constraint eventos_tipo_check check (tipo in (
    'caida', 'ulcera', 'error_medicacion', 'efecto_adverso_medicacion',
    'infeccion_nosocomial', 'agresividad_fisica', 'fuga', 'atragantamiento'
  ));
end $$;

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
      and e.tipo <> 'ulcera'
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

  -- Úlceras por presión: salen de Curas (curas_lesiones con tipo 'upp'),
  -- no de las incidencias. Periodo = fecha de inicio/detección.
  --   producidas en el centro  -> origen 'centro'  (las que cuentan para la tasa)
  --   presentes al ingreso     -> origen 'fuera'
  --   sin origen indicado      -> origen null (pendiente de completar en Curas)
  -- Grado III-IV: el grado MÁXIMO que haya llegado a registrarse.
  with upp as (
    select l.id, l.ingreso_id, i.paciente_id, l.origen,
           (select max(case v.grado when 'I' then 1 when 'II' then 2 when 'III' then 3 when 'IV' then 4 end)
              from public.curas_valoraciones v where v.lesion_id = l.id) as grado_max
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
    'infecciones_nosocomiales', count(*) filter (where e.tipo = 'infeccion_nosocomial'),
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
    and e.tipo <> 'ulcera'
    and (p_medico_id is null or i.medico_responsable_id = p_medico_id);

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
    'cambios_pauta_periodo', (
      select count(*) from public.contenciones_historial ch
      inner join public.ingresos i2 on i2.id = ch.ingreso_id
      where ch.tipo_accion in ('pauta_creada', 'pauta_modificada')
        and (ch.cambiado_en at time zone 'Europe/Madrid')::date between p_desde and p_hasta
        and (p_medico_id is null or i2.medico_responsable_id = p_medico_id)
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
