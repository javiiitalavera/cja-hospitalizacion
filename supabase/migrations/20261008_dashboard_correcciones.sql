-- ============================================================
-- CJA Hospital — correcciones del Dashboard (auditoría del 08/10/2026)
--
-- ORDEN DE APLICACIÓN: primero subir y desplegar el código de la
-- aplicación (GitHub → Vercel) y DESPUÉS ejecutar este script en el
-- editor SQL de Supabase. La aplicación nueva funciona también con la
-- base antigua (salvo el filtro de médico en "Situación actual", que
-- solo tiene efecto con el script aplicado); al revés no: la
-- aplicación antigua enviaba un parámetro que estas funciones ya no
-- tienen.
--
-- Qué hace:
--  1. "Pendientes de completar" (Seguridad) cuenta las pendientes de
--     todos los tipos, no solo de cinco.
--  2. "Situación actual" admite el filtro de médico.
--  3. Contención "activa" y "si precisa" pasan a contarse por
--     separado (antes se sumaban bajo "activa").
--  4. (solo etiquetas, en la aplicación) Reingresos.
--  5. Los tramos semanales empiezan en lunes y los mensuales el día 1.
--  6. "Hoy" es la fecha de Madrid, no la de UTC, en el Dashboard, en
--     el Explorador y en la validación de la fecha de alta.
--  7. Edad media y sexo cuentan pacientes, no episodios.
--  8. El número de camas sale de private.numero_camas() y se retira
--     el filtro de estado que el Dashboard ya no usaba.
--
-- Es seguro ejecutarlo más de una vez.
-- ============================================================

begin;

-- "Hoy" según el reloj de la clínica (Madrid), no el de UTC. Entre las
-- 00:00 y las 02:00 de Navarra, current_date de Supabase todavía marca
-- el día anterior.
create or replace function private.hoy_madrid() returns date
language sql stable
set search_path to ''
as $$
  select (now() at time zone 'Europe/Madrid')::date;
$$;

-- Número de camas de la unidad: un único sitio donde cambiarlo. Hoy
-- hay una sola unidad de 33 camas.
create or replace function private.numero_camas() returns integer
language sql immutable
set search_path to ''
as $$
  select 33;
$$;

revoke execute on function private.hoy_madrid() from public, anon;
revoke execute on function private.numero_camas() from public, anon;
grant execute on function private.hoy_madrid() to authenticated;
grant execute on function private.numero_camas() to authenticated;

-- Firmas antiguas: desaparecen porque cambian los parámetros.
drop function if exists public.dashboard_situacion_actual();
drop function if exists public.dashboard_resumen(date, date, uuid, text);
drop function if exists public.dashboard_series(date, date, uuid, text);
drop function if exists public.dashboard_actividad_detalle(date, date, uuid, text);
drop function if exists public.dashboard_seguridad(date, date, uuid, text);

-- ============================================================
-- Funciones del Dashboard (todas security invoker, solo administradores)
--
-- Convenciones comunes:
--   · "Hoy" es la fecha de Madrid (private.hoy_madrid()), no la de UTC.
--   · El número de camas sale de private.numero_camas().
--   · Un episodio ocupa cama desde el día de ingreso hasta el día
--     anterior al alta (el día de ingreso cuenta; el del alta, no).
--   · Contención "activa" = continua por seguridad (día) o contención
--     fija (noche). "Si precisa" = cualquier pauta "si precisa" que no
--     sea ya activa. Son excluyentes: un paciente cuenta en una sola.
-- ============================================================

create or replace function public.dashboard_situacion_actual(
  p_medico_id uuid default null
) returns jsonb
language plpgsql
security invoker
stable
set search_path = ''
as $$
declare
  v_hoy date := private.hoy_madrid();
  v_camas integer := private.numero_camas();
  v_activos integer;
  v_estancia_larga integer;
  v_semaforo_riesgo integer;
  v_contencion_activa integer;
  v_contencion_si_precisa integer;
  v_contencion_pendiente integer;
  v_incidencias_pendientes integer;
begin
  if not private.soy_admin() then
    raise exception 'Solo un administrador puede acceder al Dashboard.';
  end if;

  select count(*) into v_activos
  from public.ingresos i
  where i.estado = 'activo'
    and (p_medico_id is null or i.medico_responsable_id = p_medico_id);

  select count(*) into v_estancia_larga
  from public.ingresos i
  where i.estado = 'activo'
    and i.fecha_ingreso <= v_hoy - 60
    and (p_medico_id is null or i.medico_responsable_id = p_medico_id);

  select count(*) into v_semaforo_riesgo
  from public.ingresos i
  inner join public.items_paciente ip on ip.ingreso_id = i.id
  where i.estado = 'activo'
    and ip.semaforo_caidas in ('rojo', 'naranja')
    and (p_medico_id is null or i.medico_responsable_id = p_medico_id);

  -- Solo contención de verdad, no cualquier medida de seguridad
  -- nocturna (barras, cota cero, sensor de presión). Misma regla que
  -- severidadDia / severidadNoche en la aplicación: "activa" y "si
  -- precisa" son niveles distintos, y los dos necesitan confirmación.
  with pauta as (
    select
      (coalesce(c.dia = 'continua_seguridad', false)
        or coalesce('contencion_fija' = any(c.noche), false)) as activa,
      (coalesce(c.dia in ('si_precisa_supervision', 'si_precisa_paciente'), false)
        or coalesce('contencion_si_precisa' = any(c.noche), false)) as si_precisa,
      c.confirmado_por_id
    from public.ingresos i
    inner join public.contenciones c on c.ingreso_id = i.id
    where i.estado = 'activo'
      and (p_medico_id is null or i.medico_responsable_id = p_medico_id)
  )
  select
    count(*) filter (where activa),
    count(*) filter (where si_precisa and not activa),
    count(*) filter (where (activa or si_precisa) and confirmado_por_id is null)
  into v_contencion_activa, v_contencion_si_precisa, v_contencion_pendiente
  from pauta;

  -- Sin el filtro de "ingreso activo": una incidencia puede quedar
  -- pendiente de completar después del alta, y debe seguir contando
  -- como trabajo pendiente igualmente.
  select count(*) into v_incidencias_pendientes
  from public.eventos e
  inner join public.ingresos i on i.id = e.ingreso_id
  where e.estado = 'pendiente'
    and (p_medico_id is null or i.medico_responsable_id = p_medico_id);

  return jsonb_build_object(
    'pacientes_ingresados', v_activos,
    'ocupacion_actual_pct', round(v_activos::numeric / v_camas * 100, 1),
    'estancia_larga_60', v_estancia_larga,
    'semaforo_riesgo', v_semaforo_riesgo,
    'contencion_activa', v_contencion_activa,
    'contencion_si_precisa', v_contencion_si_precisa,
    'contencion_pendiente_confirmacion', v_contencion_pendiente,
    'incidencias_pendientes', v_incidencias_pendientes
  );
end;
$$;

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
  -- (misma ficha) tuvo un alta o traslado en los 30 días anteriores.
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
        and previo.fecha_alta < i.fecha_ingreso
        and previo.fecha_alta >= i.fecha_ingreso - 30
    );

  select count(*) into v_incidencias
  from public.eventos e
  inner join public.ingresos i on i.id = e.ingreso_id
  where e.fecha between p_desde and p_hasta
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

create or replace function public.dashboard_series(
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
  v_dias_periodo integer;
  v_bucket text;
  v_ocupacion jsonb;
  v_movimientos jsonb;
begin
  if not private.soy_admin() then
    raise exception 'Solo un administrador puede acceder al Dashboard.';
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

  with dias as (
    select generate_series(p_desde, p_hasta, interval '1 day')::date as f
  )
  select jsonb_agg(jsonb_build_object('fecha', d.f, 'camas', (
    select count(*) from public.ingresos i
    where i.fecha_ingreso <= d.f
      and (i.fecha_alta > d.f or i.fecha_alta is null)
      and (p_medico_id is null or i.medico_responsable_id = p_medico_id)
  )) order by d.f)
  into v_ocupacion
  from dias d;

  -- Tramos naturales: las semanas empiezan en lunes y los meses el día
  -- 1. El primer y el último tramo se recortan al periodo elegido, así
  -- que pueden ser parciales, pero nunca se solapan ni dejan huecos.
  with periodos as (
    select generate_series(
      date_trunc(v_bucket, p_desde::timestamp),
      p_hasta::timestamp,
      ('1 ' || v_bucket)::interval
    ) as natural_inicio
  ), rangos as (
    select
      greatest(natural_inicio::date, p_desde) as inicio,
      least((natural_inicio + ('1 ' || v_bucket)::interval)::date - 1, p_hasta) as fin
    from periodos
  )
  select jsonb_agg(jsonb_build_object(
    'inicio', r.inicio,
    'fin', r.fin,
    'ingresos', (
      select count(*) from public.ingresos i
      where i.fecha_ingreso between r.inicio and r.fin
        and (p_medico_id is null or i.medico_responsable_id = p_medico_id)
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

create or replace function public.dashboard_actividad_detalle(
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
  v_hoy date := private.hoy_madrid();
  v_distribucion_estancia jsonb;
  v_activos_30 integer;
  v_activos_60 integer;
  v_activos_90 integer;
  v_por_medico jsonb;
  v_por_sexo jsonb;
  v_edad_media numeric;
begin
  if not private.soy_admin() then
    raise exception 'Solo un administrador puede acceder al Dashboard.';
  end if;

  select jsonb_build_object(
    '0-15', count(*) filter (where (i.fecha_alta - i.fecha_ingreso) between 0 and 15),
    '16-30', count(*) filter (where (i.fecha_alta - i.fecha_ingreso) between 16 and 30),
    '31-60', count(*) filter (where (i.fecha_alta - i.fecha_ingreso) between 31 and 60),
    '61-90', count(*) filter (where (i.fecha_alta - i.fecha_ingreso) between 61 and 90),
    'mas_90', count(*) filter (where (i.fecha_alta - i.fecha_ingreso) > 90)
  ) into v_distribucion_estancia
  from public.ingresos i
  where i.fecha_alta between p_desde and p_hasta
    and (p_medico_id is null or i.medico_responsable_id = p_medico_id);

  select
    count(*) filter (where fecha_ingreso <= v_hoy - 30),
    count(*) filter (where fecha_ingreso <= v_hoy - 60),
    count(*) filter (where fecha_ingreso <= v_hoy - 90)
  into v_activos_30, v_activos_60, v_activos_90
  from public.ingresos
  where estado = 'activo'
    and (p_medico_id is null or medico_responsable_id = p_medico_id);

  select coalesce(jsonb_agg(jsonb_build_object(
    'medico_id', pr.id,
    'nombre', pr.nombre || ' ' || pr.apellidos,
    'ingresos', c.total
  ) order by c.total desc), '[]'::jsonb)
  into v_por_medico
  from (
    select medico_responsable_id, count(*) as total
    from public.ingresos
    where fecha_ingreso between p_desde and p_hasta
      and medico_responsable_id is not null
      and (p_medico_id is null or medico_responsable_id = p_medico_id)
    group by medico_responsable_id
  ) c
  inner join public.profesionales pr on pr.id = c.medico_responsable_id;

  -- Personas, no episodios: cada paciente con ingreso en el periodo
  -- cuenta una sola vez, con la edad de su primer ingreso del periodo.
  select
    jsonb_build_object(
      'hombre', count(*) filter (where t.sexo = 'hombre'),
      'mujer', count(*) filter (where t.sexo = 'mujer'),
      'otro', count(*) filter (where t.sexo = 'otro'),
      'sin_dato', count(*) filter (where t.sexo is null)
    ),
    avg(t.edad)
  into v_por_sexo, v_edad_media
  from (
    select distinct on (i.paciente_id)
      p.sexo,
      extract(year from age(i.fecha_ingreso, p.fecha_nacimiento)) as edad
    from public.ingresos i
    inner join public.pacientes p on p.id = i.paciente_id
    where i.fecha_ingreso between p_desde and p_hasta
      and (p_medico_id is null or i.medico_responsable_id = p_medico_id)
    order by i.paciente_id, i.fecha_ingreso
  ) t;

  return jsonb_build_object(
    'distribucion_estancia', v_distribucion_estancia,
    'activos_mas_30', v_activos_30,
    'activos_mas_60', v_activos_60,
    'activos_mas_90', v_activos_90,
    'por_medico', v_por_medico,
    'por_sexo', v_por_sexo,
    'edad_media', round(coalesce(v_edad_media, 0), 1)
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
    select e.tipo, count(*) as total, count(distinct e.ingreso_id) as pacientes,
           count(*) filter (where e.estado = 'pendiente') as pendientes
    from public.eventos e
    inner join public.ingresos i on i.id = e.ingreso_id
    where e.fecha between p_desde and p_hasta
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

  select jsonb_build_object(
    'presentes_al_ingreso', count(*) filter (where e.datos->>'momento' = 'Al ingreso'),
    'aparecidas_durante', count(*) filter (where e.datos->>'momento' = 'Durante el ingreso'),
    'grado_iii_iv', count(*) filter (where e.datos->>'grado' in ('Grado III', 'Grado IV')),
    'tasa_aparecidas_1000', case when v_dias_estancia > 0 then round(
      count(*) filter (where e.datos->>'momento' = 'Durante el ingreso')::numeric / v_dias_estancia * 1000, 2
    ) else null end
  ) into v_ulceras
  from public.eventos e
  inner join public.ingresos i on i.id = e.ingreso_id
  where e.tipo = 'ulcera' and e.fecha between p_desde and p_hasta
    and (p_medico_id is null or i.medico_responsable_id = p_medico_id);

  -- "Pendientes de completar" cuenta las incidencias pendientes de
  -- TODOS los tipos del periodo (también caídas y úlceras), igual que
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

-- Explorador de episodios: misma función, con la fecha de Madrid.
create or replace function public.buscar_episodios_dashboard(
  p_busqueda text default null,
  p_desde_ingreso date default null,
  p_hasta_ingreso date default null,
  p_desde_alta date default null,
  p_hasta_alta date default null,
  p_solapa_desde date default null,
  p_solapa_hasta date default null,
  p_estado text default null,
  p_medico_id uuid default null,
  p_estancia_min integer default null,
  p_estancia_max integer default null,
  p_con_incidencias boolean default null,
  p_tipo_incidencia text default null,
  p_orden text default 'fecha_ingreso',
  p_orden_dir text default 'desc',
  p_pagina integer default 1,
  p_por_pagina integer default 50,
  p_paginar boolean default true
) returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_total integer;
  v_filas jsonb;
  v_offset integer;
  v_limite integer;
  v_orden_col text;
  v_orden_dir text;
begin
  if not private.soy_admin() then
    raise exception 'Solo un administrador puede acceder al Dashboard.';
  end if;
  if p_estado is not null and p_estado not in ('activo', 'alta', 'alta_traslado', 'exitus') then
    raise exception 'Estado no reconocido: %', p_estado;
  end if;
  if p_tipo_incidencia is not null and p_con_incidencias is distinct from true then
    raise exception 'Para filtrar por tipo de incidencia, indica también "con incidencias".';
  end if;

  v_orden_col := case p_orden
    when 'paciente' then 'nombre_orden'
    when 'ingreso' then 'fecha_ingreso'
    when 'alta' then 'fecha_alta'
    when 'estancia' then 'dias_estancia'
    when 'medico' then 'medico_nombre'
    else 'fecha_ingreso'
  end;
  v_orden_dir := case when lower(coalesce(p_orden_dir, 'desc')) = 'asc' then 'asc' else 'desc' end;
  v_offset := greatest(0, (p_pagina - 1) * p_por_pagina);
  v_limite := case when p_paginar then p_por_pagina else null end;

  with base as (
    select
      i.id, i.fecha_ingreso, i.fecha_alta, i.estado, i.habitacion,
      p.nombre, p.primer_apellido, p.segundo_apellido, p.nhc,
      (p.primer_apellido || ' ' || coalesce(p.segundo_apellido, '') || ' ' || p.nombre) as nombre_orden,
      nullif(coalesce(m.nombre || ' ' || m.apellidos, ''), '') as medico_nombre,
      (case when i.fecha_alta is not null then i.fecha_alta - i.fecha_ingreso else private.hoy_madrid() - i.fecha_ingreso end) as dias_estancia,
      (select count(*) from public.eventos e where e.ingreso_id = i.id) as num_incidencias
    from public.ingresos i
    inner join public.pacientes p on p.id = i.paciente_id
    left join public.profesionales m on m.id = i.medico_responsable_id
    where
      (p_busqueda is null or (
        p.nombre || ' ' || p.primer_apellido || ' ' || coalesce(p.segundo_apellido, '') ilike '%' || p_busqueda || '%'
        or p.nhc ilike '%' || p_busqueda || '%'
      ))
      and (p_desde_ingreso is null or i.fecha_ingreso >= p_desde_ingreso)
      and (p_hasta_ingreso is null or i.fecha_ingreso <= p_hasta_ingreso)
      and (p_desde_alta is null or i.fecha_alta >= p_desde_alta)
      and (p_hasta_alta is null or i.fecha_alta <= p_hasta_alta)
      and (
        (p_solapa_desde is null and p_solapa_hasta is null) or (
          i.fecha_ingreso <= coalesce(p_solapa_hasta, 'infinity'::date)
          and (i.fecha_alta is null or i.fecha_alta >= coalesce(p_solapa_desde, '-infinity'::date))
        )
      )
      and (p_estado is null or i.estado = p_estado)
      and (p_medico_id is null or i.medico_responsable_id = p_medico_id)
      and (
        p_con_incidencias is null or (
          (select count(*) from public.eventos e where e.ingreso_id = i.id
            and (p_tipo_incidencia is null or e.tipo = p_tipo_incidencia)) > 0
        ) = p_con_incidencias
      )
  )
  select count(*) into v_total from base
  where (p_estancia_min is null or dias_estancia >= p_estancia_min)
    and (p_estancia_max is null or dias_estancia <= p_estancia_max);

  execute format(
    'with base as (
      select
        i.id, i.fecha_ingreso, i.fecha_alta, i.estado, i.habitacion,
        p.nombre, p.primer_apellido, p.segundo_apellido, p.nhc,
        (p.primer_apellido || '' '' || coalesce(p.segundo_apellido, '''') || '' '' || p.nombre) as nombre_orden,
        nullif(coalesce(m.nombre || '' '' || m.apellidos, ''''), '''') as medico_nombre,
        (case when i.fecha_alta is not null then i.fecha_alta - i.fecha_ingreso else private.hoy_madrid() - i.fecha_ingreso end) as dias_estancia,
        (select count(*) from public.eventos e where e.ingreso_id = i.id) as num_incidencias
      from public.ingresos i
      inner join public.pacientes p on p.id = i.paciente_id
      left join public.profesionales m on m.id = i.medico_responsable_id
      where
        ($1::text is null or (
          p.nombre || '' '' || p.primer_apellido || '' '' || coalesce(p.segundo_apellido, '''') ilike ''%%'' || $1::text || ''%%''
          or p.nhc ilike ''%%'' || $1::text || ''%%''
        ))
        and ($2::date is null or i.fecha_ingreso >= $2::date)
        and ($3::date is null or i.fecha_ingreso <= $3::date)
        and ($4::date is null or i.fecha_alta >= $4::date)
        and ($5::date is null or i.fecha_alta <= $5::date)
        and (
          ($6::date is null and $7::date is null) or (
            i.fecha_ingreso <= coalesce($7::date, ''infinity''::date)
            and (i.fecha_alta is null or i.fecha_alta >= coalesce($6::date, ''-infinity''::date))
          )
        )
        and ($8::text is null or i.estado = $8::text)
        and ($9::uuid is null or i.medico_responsable_id = $9::uuid)
        and (
          $10::boolean is null or (
            (select count(*) from public.eventos e where e.ingreso_id = i.id
              and ($11::text is null or e.tipo = $11::text)) > 0
          ) = $10::boolean
        )
    )
    select coalesce(jsonb_agg(t), ''[]''::jsonb) from (
      select id, fecha_ingreso, fecha_alta, estado, habitacion, nhc,
             (primer_apellido || case when segundo_apellido is not null and segundo_apellido <> '''' then '' '' || segundo_apellido else '''' end || '', '' || nombre) as paciente,
             medico_nombre as medico, dias_estancia, num_incidencias
      from base
      where ($12::integer is null or dias_estancia >= $12::integer)
        and ($13::integer is null or dias_estancia <= $13::integer)
      order by %I %s nulls last
      limit $14 offset $15
    ) t',
    v_orden_col, v_orden_dir
  )
  using p_busqueda, p_desde_ingreso, p_hasta_ingreso, p_desde_alta, p_hasta_alta,
        p_solapa_desde, p_solapa_hasta, p_estado, p_medico_id,
        p_con_incidencias, p_tipo_incidencia, p_estancia_min, p_estancia_max,
        v_limite, v_offset
  into v_filas;

  return jsonb_build_object('total', v_total, 'filas', v_filas, 'pagina', p_pagina, 'por_pagina', p_por_pagina);
end;
$$;

-- dar_de_alta: la fecha de alta no puede ser posterior a HOY (Madrid).
create or replace function public.dar_de_alta(
  p_ingreso_id uuid,
  p_fecha_alta date,
  p_circunstancia_alta text
) returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_estado text;
  v_actualizado public.ingresos;
begin
  if coalesce(private.mi_rol(), '') <> 'medico' then
    raise exception 'Solo un médico puede dar de alta.';
  end if;

  if p_fecha_alta is null or p_fecha_alta > private.hoy_madrid() then
    raise exception 'La fecha de alta no es válida.';
  end if;

  v_estado := case p_circunstancia_alta
    when '1' then 'alta'            -- Domicilio
    when '3' then 'alta'            -- Alta voluntaria
    when '9' then 'alta'            -- Otras circunstancias / fuga / desconocido
    when '2' then 'alta_traslado'   -- Traslado a otro hospital
    when '5' then 'alta_traslado'   -- Traslado a centro sociosanitario
    when '4' then 'exitus'          -- Éxitus
    else null
  end;

  if v_estado is null then
    raise exception 'Circunstancia de alta no reconocida.';
  end if;

  if p_fecha_alta < (select fecha_ingreso from public.ingresos where id = p_ingreso_id) then
    raise exception 'La fecha de alta no puede ser anterior a la de ingreso.';
  end if;

  perform set_config('app.cambio_estado_ingreso_rpc', 'true', true);

  update public.ingresos
  set estado = v_estado, fecha_alta = p_fecha_alta, dado_de_alta_en = now()
  where id = p_ingreso_id and estado = 'activo'
  returning * into v_actualizado;

  if not found then
    raise exception 'Este episodio ya no está activo, o no existe.';
  end if;

  -- INSERT ... ON CONFLICT en vez de un UPDATE a ciegas: si el CMBD
  -- todavía no existía (un ingreso que nunca se llegó a abrir en esa
  -- pestaña), esto lo crea; si ya existía, lo actualiza. Confirmado
  -- de verdad que, antes, un UPDATE sobre una fila inexistente
  -- afectaba a cero filas y el alta se daba por buena igualmente,
  -- con el CMBD vacío para siempre.
  insert into public.cmbd (ingreso_id, circunstancia_alta)
  values (p_ingreso_id, p_circunstancia_alta)
  on conflict (ingreso_id) do update set circunstancia_alta = excluded.circunstancia_alta;

  return jsonb_build_object('estado', v_estado, 'fecha_alta', v_actualizado.fecha_alta);
end;
$$;


revoke execute on function public.dashboard_situacion_actual(uuid) from public, anon;
revoke execute on function public.dashboard_resumen(date, date, uuid) from public, anon;
revoke execute on function public.dashboard_series(date, date, uuid) from public, anon;
revoke execute on function public.dashboard_actividad_detalle(date, date, uuid) from public, anon;
revoke execute on function public.dashboard_seguridad(date, date, uuid) from public, anon;
revoke execute on function public.buscar_episodios_dashboard(
  text, date, date, date, date, date, date, text, uuid, integer, integer, boolean, text, text, text, integer, integer, boolean
) from public, anon;
revoke execute on function public.dar_de_alta(uuid, date, text) from public, anon;

grant execute on function public.dashboard_situacion_actual(uuid) to authenticated;
grant execute on function public.dashboard_resumen(date, date, uuid) to authenticated;
grant execute on function public.dashboard_series(date, date, uuid) to authenticated;
grant execute on function public.dashboard_actividad_detalle(date, date, uuid) to authenticated;
grant execute on function public.dashboard_seguridad(date, date, uuid) to authenticated;
grant execute on function public.buscar_episodios_dashboard(
  text, date, date, date, date, date, date, text, uuid, integer, integer, boolean, text, text, text, integer, integer, boolean
) to authenticated;
grant execute on function public.dar_de_alta(uuid, date, text) to authenticated;

commit;
