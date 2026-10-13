-- CJA Hospital — Dashboard · Resumen: reingresos a 180 días (2026-10-21)
--
-- dashboard_resumen devuelve ahora también «reingresos_180d»: ingresos nuevos del periodo cuyo paciente tuvo un alta o
-- traslado en los 180 días anteriores. Incluye a los de 30 días («reingresos_30d», que no cambia de valor).
-- Se vuelve a sustituir la función (no cambia ninguna tabla).
--
-- Transaccional e idempotente.

begin;

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
  v_reingresos_180 integer;
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

  -- Ingresos nuevos del periodo que son reingresos: el mismo paciente (misma ficha) tuvo un alta o traslado en los
  -- 30 días anteriores (reingresos_30d) o en los 180 anteriores (reingresos_180d, que incluye a los de 30: son un
  -- subconjunto). Se cuenta INCLUIDO el mismo día si el alta fue realmente anterior al nuevo episodio (alta registrada
  -- antes de crear el reingreso). Con solo "<=" en la fecha, si los dos episodios se cierran el mismo día el primero
  -- contaría como reingreso del segundo; por eso el empate se resuelve con la hora real del alta.
  -- «dias» = días desde el alta previa MÁS RECIENTE hasta el nuevo ingreso.
  -- Es una proporción sobre ingresos, no la tasa clásica sobre altas: mira hacia atrás, así que no queda sesgada a
  -- la baja en los periodos recientes (un alta de hace un mes aún no ha tenido sus 180 días para reingresar).
  select count(*) filter (where r.dias <= 30), count(*)
  into v_reingresos, v_reingresos_180
  from public.ingresos i
  cross join lateral (
    select min(i.fecha_ingreso - previo.fecha_alta) as dias
    from public.ingresos previo
    where previo.paciente_id = i.paciente_id
      and previo.id <> i.id
      and previo.estado in ('alta', 'alta_traslado')
      and previo.fecha_alta >= i.fecha_ingreso - 180
      and (
        previo.fecha_alta < i.fecha_ingreso
        or (previo.fecha_alta = i.fecha_ingreso and previo.dado_de_alta_en <= i.created_at)
      )
  ) r
  where i.fecha_ingreso between p_desde and p_hasta
    and (p_medico_id is null or i.medico_responsable_id = p_medico_id)
    and r.dias is not null;

  -- Sin úlceras por presión (ver dashboard_seguridad): así la cifra
  -- coincide con la lista de Incidencias a la que lleva.
  select count(*) into v_incidencias
  from public.eventos e
  inner join public.ingresos i on i.id = e.ingreso_id
  where e.fecha between p_desde and p_hasta
    and e.tipo not in ('ulcera', 'infeccion_nosocomial')
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
    'reingresos_180d', v_reingresos_180,
    'incidencias_total', v_incidencias,
    'incidencias_tasa_1000', case when v_dias_estancia > 0 then round(v_incidencias::numeric / v_dias_estancia * 1000, 1) else null end
  );
end;
$$;
commit;
