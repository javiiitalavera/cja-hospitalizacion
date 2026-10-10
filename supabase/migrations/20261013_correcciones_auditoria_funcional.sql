-- CJA Hospital — Correcciones tras la auditoría funcional de ChatGPT (2026-10-13)
--
--  E02  Pacientes: un paciente reingresado el mismo día que su alta aparecía como «alta». La vista que
--       elige el último episodio solo ordenaba por fecha de ingreso: con empate podía devolver el cerrado.
--       Ahora: primero el activo, luego fecha, creación e id.
--  E05  Dashboard: el reingreso el mismo día del alta no contaba como reingreso. Ahora cuenta si el alta
--       fue realmente anterior (hora del alta <= hora de creación del nuevo episodio).
--  E09  Dashboard · Seguridad: «Pacientes afectados» contaba episodios, no personas. Ahora cuenta
--       pacientes distintos (en incidencias por tipo y en úlceras). El recuento de eventos no cambia.
--
-- Se reemplazan la vista y dos funciones (create or replace: se conservan permisos y dependencias).
-- Transaccional e idempotente.

begin;

create or replace view public.pacientes_con_ultimo_ingreso
with (security_invoker = true) as
select
    p.id, p.cipna, p.nhc, p.nombre, p.primer_apellido, p.segundo_apellido,
    p.fecha_nacimiento, p.sexo, p.dni, p.municipio, p.medico_cabecera,
    p.contacto_familiar_nombre, p.contacto_familiar_telefono, p.created_at,
    i.id as ingreso_id,
    i.estado as ingreso_estado,
    i.fecha_ingreso as ingreso_fecha_ingreso,
    i.fecha_alta as ingreso_fecha_alta,
    i.habitacion as ingreso_habitacion,
    p.nombre_normalizado,
    p.primer_apellido_normalizado,
    p.segundo_apellido_normalizado
from public.pacientes p
left join lateral (
    select i2.id, i2.paciente_id, i2.fecha_ingreso, i2.fecha_alta, i2.habitacion,
           i2.medico_responsable_id, i2.motivo_ingreso, i2.estado, i2.created_at
    from public.ingresos i2
    where i2.paciente_id = p.id
    -- Desempate: dos episodios el mismo día (alta y reingreso) tenían el mismo criterio y la vista
    -- podía devolver el ya cerrado. Primero el activo (el listado de Pacientes tiene que coincidir con
    -- Inicio y Dashboard, que cuentan los activos), después el más reciente por fecha, creación e id.
    order by (i2.estado = 'activo') desc, i2.fecha_ingreso desc, i2.created_at desc nulls last, i2.id desc
    limit 1
) i on true;

create or replace function public.dashboard_resumen(
  p_desde date,
  p_hasta date,
  p_medico_id uuid default null
) returns jsonb
language plpgsql
security invoker
stable
set search_path = ''
as $$
declare
  v_camas integer := private.numero_camas();
  v_ingresos_nuevos integer;
  v_altas integer;
  v_traslados integer;
  v_exitus integer;
  v_dias_estancia bigint;
  v_ocupacion_media numeric;
  v_ocupacion_min numeric;
  v_ocupacion_max numeric;
  v_estancia_media numeric;
  v_estancia_mediana numeric;
  v_reingresos integer;
  v_incidencias integer;
begin
  if not private.soy_admin() then
    raise exception 'Solo un administrador puede acceder al Dashboard.';
  end if;
  if p_desde > p_hasta then
    raise exception 'La fecha "desde" no puede ser posterior a "hasta".';
  end if;

  select count(*) into v_ingresos_nuevos
  from public.ingresos i
  where i.fecha_ingreso between p_desde and p_hasta
    and (p_medico_id is null or i.medico_responsable_id = p_medico_id);

  select
    count(*) filter (where i.estado = 'alta'),
    count(*) filter (where i.estado = 'alta_traslado'),
    count(*) filter (where i.estado = 'exitus')
  into v_altas, v_traslados, v_exitus
  from public.ingresos i
  where i.fecha_alta between p_desde and p_hasta
    and (p_medico_id is null or i.medico_responsable_id = p_medico_id);

  select coalesce(sum(
    greatest(0, (least(coalesce(i.fecha_alta, p_hasta + 1), p_hasta + 1) - greatest(i.fecha_ingreso, p_desde)))
  ), 0) into v_dias_estancia
  from public.ingresos i
  where i.fecha_ingreso <= p_hasta
    and (i.fecha_alta is null or i.fecha_alta >= p_desde)
    and (p_medico_id is null or i.medico_responsable_id = p_medico_id);

  with dias as (
    select generate_series(p_desde, p_hasta, interval '1 day')::date as f
  ), ocupacion as (
    select d.f, count(i.id) as camas
    from dias d
    left join public.ingresos i
      on i.fecha_ingreso <= d.f
      and (i.fecha_alta > d.f or i.fecha_alta is null)
      and (p_medico_id is null or i.medico_responsable_id = p_medico_id)
    group by d.f
  )
  select avg(camas) / v_camas * 100, min(camas)::numeric / v_camas * 100, max(camas)::numeric / v_camas * 100
  into v_ocupacion_media, v_ocupacion_min, v_ocupacion_max
  from ocupacion;

  select
    avg(i.fecha_alta - i.fecha_ingreso),
    percentile_cont(0.5) within group (order by (i.fecha_alta - i.fecha_ingreso))
  into v_estancia_media, v_estancia_mediana
  from public.ingresos i
  where i.fecha_alta between p_desde and p_hasta
    and (p_medico_id is null or i.medico_responsable_id = p_medico_id);

  -- Ingresos nuevos del periodo que son reingresos: el mismo paciente
  -- (misma ficha) tuvo un alta o traslado en los 30 días anteriores,
  -- INCLUIDO el mismo día si el alta fue realmente anterior al nuevo episodio
  -- (alta registrada antes de crear el reingreso). Con solo "<=" en la fecha, si
  -- los dos episodios se cierran el mismo día el primero contaría como reingreso
  -- del segundo; por eso el empate se resuelve con la hora real del alta.
  -- Es una proporción sobre ingresos, no la tasa clásica sobre altas.
  select count(*) into v_reingresos
  from public.ingresos i
  where i.fecha_ingreso between p_desde and p_hasta
    and (p_medico_id is null or i.medico_responsable_id = p_medico_id)
    and exists (
      select 1 from public.ingresos previo
      where previo.paciente_id = i.paciente_id
        and previo.id <> i.id
        and previo.estado in ('alta', 'alta_traslado')
        and previo.fecha_alta >= i.fecha_ingreso - 30
        and (
          previo.fecha_alta < i.fecha_ingreso
          or (previo.fecha_alta = i.fecha_ingreso and previo.dado_de_alta_en <= i.created_at)
        )
    );

  -- Sin úlceras por presión (ver dashboard_seguridad): así la cifra
  -- coincide con la lista de Incidencias a la que lleva.
  select count(*) into v_incidencias
  from public.eventos e
  inner join public.ingresos i on i.id = e.ingreso_id
  where e.fecha between p_desde and p_hasta
    and e.tipo <> 'ulcera'
    and (p_medico_id is null or i.medico_responsable_id = p_medico_id);

  return jsonb_build_object(
    'ingresos_nuevos', v_ingresos_nuevos,
    'altas', v_altas,
    'traslados', v_traslados,
    'exitus', v_exitus,
    'salidas_totales', v_altas + v_traslados + v_exitus,
    'dias_estancia', v_dias_estancia,
    'ocupacion_media_pct', round(coalesce(v_ocupacion_media, 0), 1),
    'ocupacion_min_pct', round(coalesce(v_ocupacion_min, 0), 1),
    'ocupacion_max_pct', round(coalesce(v_ocupacion_max, 0), 1),
    'estancia_media_dias', round(coalesce(v_estancia_media, 0), 1),
    'estancia_mediana_dias', round(coalesce(v_estancia_mediana, 0), 1),
    'reingresos_30d', v_reingresos,
    'incidencias_total', v_incidencias,
    'incidencias_tasa_1000', case when v_dias_estancia > 0 then round(v_incidencias::numeric / v_dias_estancia * 1000, 1) else null end
  );
end;
$$;

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
