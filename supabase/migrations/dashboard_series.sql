-- ============================================================
-- Series temporales para los dos gráficos de Resumen: ocupación día
-- a día, e ingresos/salidas agrupados según la duración elegida.
--
-- Agrupación automática, según pide el punto 5:
--   hasta 31 días  -> diaria
--   32 a 180 días  -> semanal
--   más de 180 días -> mensual
-- ============================================================

begin;

create or replace function public.dashboard_series(
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
  v_dias_periodo integer;
  v_bucket text;
  v_ocupacion jsonb;
  v_movimientos jsonb;
begin
  if private.mi_rol() is null then
    raise exception 'No autorizado.';
  end if;
  if p_desde > p_hasta then
    raise exception 'La fecha "desde" no puede ser posterior a "hasta".';
  end if;

  v_dias_periodo := (p_hasta - p_desde) + 1;
  v_bucket := case
    when v_dias_periodo <= 31 then 'day'
    when v_dias_periodo <= 180 then 'week'
    else 'month'
  end;

  -- Ocupación: siempre día a día (es una foto diaria, agregarla no
  -- tendría sentido) — el frontend decide si dibuja cada punto o
  -- solo una muestra, sin perder la fuente diaria real.
  with dias as (
    select generate_series(p_desde, p_hasta, interval '1 day')::date as f
  )
  select jsonb_agg(jsonb_build_object('fecha', d.f, 'camas', (
    select count(*) from public.ingresos i
    where i.fecha_ingreso <= d.f
      and (i.fecha_alta > d.f or i.fecha_alta is null)
      and (p_medico_id is null or i.medico_responsable_id = p_medico_id)
      and (p_estado_filtro is null or i.estado = p_estado_filtro)
  )) order by d.f)
  into v_ocupacion
  from dias d;

  -- Ingresos y salidas, agrupados por el bucket calculado.
  with periodos as (
    select generate_series(p_desde, p_hasta, ('1 ' || v_bucket)::interval) as inicio
  ), rangos as (
    select
      inicio::date as inicio,
      least(
        (case v_bucket
          when 'day' then inicio + interval '1 day'
          when 'week' then inicio + interval '1 week'
          else inicio + interval '1 month'
        end)::date - 1,
        p_hasta
      ) as fin
    from periodos
  )
  select jsonb_agg(jsonb_build_object(
    'inicio', r.inicio,
    'fin', r.fin,
    'ingresos', (
      select count(*) from public.ingresos i
      where i.fecha_ingreso between r.inicio and r.fin
        and (p_medico_id is null or i.medico_responsable_id = p_medico_id)
        and (p_estado_filtro is null or i.estado = p_estado_filtro)
    ),
    'salidas', (
      select count(*) from public.ingresos i
      where i.fecha_alta between r.inicio and r.fin
        and (p_medico_id is null or i.medico_responsable_id = p_medico_id)
    )
  ) order by r.inicio)
  into v_movimientos
  from rangos r;

  return jsonb_build_object(
    'agrupacion', v_bucket,
    'ocupacion_diaria', coalesce(v_ocupacion, '[]'::jsonb),
    'movimientos', coalesce(v_movimientos, '[]'::jsonb)
  );
end;
$$;

grant execute on function public.dashboard_series(date, date, uuid, text) to authenticated;

commit;
