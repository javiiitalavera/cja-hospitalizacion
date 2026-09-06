-- ============================================================
-- Actividad del periodo — fórmulas exactamente como se definieron:
--
-- Días-estancia: cuenta el día de ingreso, excluye el día de alta.
--   inicio = máximo(fecha_ingreso, desde)
--   final  = mínimo(fecha_alta, hasta+1) si hay alta, si no hasta+1
--   resultado = máximo(0, final - inicio)
--
-- Ocupación diaria: fecha_ingreso <= fecha AND (fecha_alta > fecha OR
-- fecha_alta IS NULL) — un episodio ocupa cama esa fecha.
--
-- Estancia media/mediana: episodios cuya SALIDA (fecha_alta) cayó
-- dentro del periodo, no los que ingresaron en él.
--
-- Reingresos: de los ingresos NUEVOS del periodo (denominador),
-- cuántos tienen otro episodio del mismo paciente en alta/traslado,
-- con alta anterior al nuevo ingreso, ≤30 días de diferencia.
-- ============================================================

begin;

create or replace function public.dashboard_resumen(
  p_desde date,
  p_hasta date,
  p_medico_id uuid default null,
  p_estado_filtro text default null
) returns jsonb
language plpgsql
security invoker
stable
set search_path = ''
as $$
declare
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
  if private.mi_rol() is null then
    raise exception 'No autorizado.';
  end if;
  if p_desde > p_hasta then
    raise exception 'La fecha "desde" no puede ser posterior a "hasta".';
  end if;
  if p_estado_filtro is not null and p_estado_filtro not in ('activo', 'alta', 'alta_traslado', 'exitus') then
    raise exception 'Estado de filtro no reconocido: %', p_estado_filtro;
  end if;

  select count(*) into v_ingresos_nuevos
  from public.ingresos i
  where i.fecha_ingreso between p_desde and p_hasta
    and (p_medico_id is null or i.medico_responsable_id = p_medico_id)
    and (p_estado_filtro is null or i.estado = p_estado_filtro);

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
    and (p_medico_id is null or i.medico_responsable_id = p_medico_id)
    and (p_estado_filtro is null or i.estado = p_estado_filtro);

  with dias as (
    select generate_series(p_desde, p_hasta, interval '1 day')::date as f
  ), ocupacion as (
    select d.f, count(i.id) as camas
    from dias d
    left join public.ingresos i
      on i.fecha_ingreso <= d.f
      and (i.fecha_alta > d.f or i.fecha_alta is null)
      and (p_medico_id is null or i.medico_responsable_id = p_medico_id)
      and (p_estado_filtro is null or i.estado = p_estado_filtro)
    group by d.f
  )
  select avg(camas) / 33 * 100, min(camas) / 33.0 * 100, max(camas) / 33.0 * 100
  into v_ocupacion_media, v_ocupacion_min, v_ocupacion_max
  from ocupacion;

  select
    avg(i.fecha_alta - i.fecha_ingreso),
    percentile_cont(0.5) within group (order by (i.fecha_alta - i.fecha_ingreso))
  into v_estancia_media, v_estancia_mediana
  from public.ingresos i
  where i.fecha_alta between p_desde and p_hasta
    and (p_medico_id is null or i.medico_responsable_id = p_medico_id);

  select count(*) into v_reingresos
  from public.ingresos i
  where i.fecha_ingreso between p_desde and p_hasta
    and (p_medico_id is null or i.medico_responsable_id = p_medico_id)
    and (p_estado_filtro is null or i.estado = p_estado_filtro)
    and exists (
      select 1 from public.ingresos previo
      where previo.paciente_id = i.paciente_id
        and previo.id <> i.id
        and previo.estado in ('alta', 'alta_traslado')
        and previo.fecha_alta < i.fecha_ingreso
        and previo.fecha_alta >= i.fecha_ingreso - 30
    );

  select count(*) into v_incidencias
  from public.eventos e
  inner join public.ingresos i on i.id = e.ingreso_id
  where e.fecha between p_desde and p_hasta
    and (p_medico_id is null or i.medico_responsable_id = p_medico_id)
    and (p_estado_filtro is null or i.estado = p_estado_filtro);

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

grant execute on function public.dashboard_resumen(date, date, uuid, text) to authenticated;

commit;
