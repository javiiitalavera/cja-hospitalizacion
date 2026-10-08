-- CJA Hospital — las úlceras por presión pasan de Incidencias a Curas (2026-10-08)
--
-- Qué hace:
--   1. Pasa a Curas las incidencias antiguas de "úlcera por presión" (una
--      lesión + una valoración por cada una). Las incidencias originales NO
--      se borran, solo dejan de mostrarse y de contarse. Se puede ejecutar
--      más de una vez: no duplica.
--   2. Impide registrar nuevas úlceras como incidencia (se hace en Curas).
--   3. El Dashboard pasa a contar las úlceras desde Curas:
--        - Seguridad > Úlceras por presión: producidas en el centro,
--          presentes al ingreso, sin origen indicado, grado III-IV, tasa.
--        - Las cifras de incidencias (Resumen y Seguridad) ya no incluyen
--          las úlceras, para que coincidan con la lista de Incidencias.
--        - El Explorador de episodios, al filtrar por "Úlcera por presión",
--          busca en Curas.
--
-- Requiere haber ejecutado antes 20261008_curas.sql.
-- Las funciones del Dashboard conservan su firma: la web antigua sigue
-- funcionando mientras se despliega la nueva.

begin;

alter table public.curas_lesiones
    add column if not exists evento_origen_id uuid unique references public.eventos(id) on delete set null;

-- 1. Paso de las incidencias antiguas a Curas
with origen as (
  select e.id as evento_id, e.ingreso_id, e.fecha, e.notas, e.registrado_por_id, e.created_at, e.datos
  from public.eventos e
  where e.tipo = 'ulcera'
    and not exists (select 1 from public.curas_lesiones l where l.evento_origen_id = e.id)
), nuevas as (
  insert into public.curas_lesiones
    (ingreso_id, caracteristicas, localizacion, fecha_inicio, origen, notas, registrado_por_id, evento_origen_id, created_at)
  select o.ingreso_id, 'upp',
         left(coalesce(nullif(btrim(o.datos->>'localizacion'), ''), 'Sin indicar'), 120),
         o.fecha,
         case o.datos->>'momento' when 'Al ingreso' then 'fuera' when 'Durante el ingreso' then 'centro' end,
         left(o.notas, 2000),
         o.registrado_por_id, o.evento_id, o.created_at
  from origen o
  returning id, evento_origen_id
)
insert into public.curas_valoraciones (lesion_id, fecha, medidas, grado, registrado_por_id, created_at)
select n.id, o.fecha,
       left(nullif(btrim(o.datos->>'tamano'), ''), 40),
       case o.datos->>'grado' when 'Grado I' then 'I' when 'Grado II' then 'II' when 'Grado III' then 'III' when 'Grado IV' then 'IV' end,
       o.registrado_por_id, o.created_at
from nuevas n
inner join origen o on o.evento_id = n.evento_origen_id
where o.datos->>'grado' is not null or nullif(btrim(o.datos->>'tamano'), '') is not null;

-- 2. No se pueden registrar nuevas úlceras como incidencia
create or replace function public.impedir_evento_ulcera() returns trigger
language plpgsql
set search_path = ''
as $$
begin
  raise exception 'Las úlceras por presión ya no se registran como incidencia: se registran en Plan de cuidados → Curas.';
end;
$$;

drop trigger if exists impedir_evento_ulcera on public.eventos;
create trigger impedir_evento_ulcera
    before insert on public.eventos
    for each row when (NEW.tipo = 'ulcera')
    execute function public.impedir_evento_ulcera();
drop trigger if exists impedir_evento_ulcera_upd on public.eventos;
create trigger impedir_evento_ulcera_upd
    before update of tipo on public.eventos
    for each row when (NEW.tipo = 'ulcera' and OLD.tipo is distinct from 'ulcera')
    execute function public.impedir_evento_ulcera();

revoke execute on function public.impedir_evento_ulcera() from public, anon, authenticated;

-- 3. Funciones del Dashboard (misma firma que antes)
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
  -- Las úlceras por presión ya no son una incidencia: se registran en
  -- Curas y tienen su propio apartado en Seguridad. Se excluyen aquí
  -- (también los eventos antiguos de ese tipo) para que la cifra coincida
  -- con la lista de Incidencias.
  select count(*) into v_incidencias_pendientes
  from public.eventos e
  inner join public.ingresos i on i.id = e.ingreso_id
  where e.estado = 'pendiente'
    and e.tipo <> 'ulcera'
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
    select e.tipo, count(*) as total, count(distinct e.ingreso_id) as pacientes,
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
    select l.id, l.ingreso_id, l.origen,
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
    'pacientes_afectados', count(distinct ingreso_id),
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
      (select count(*) from public.eventos e where e.ingreso_id = i.id and e.tipo <> 'ulcera') as num_incidencias
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
          case when p_tipo_incidencia = 'ulcera'
            -- Úlceras por presión: viven en Curas, no en incidencias.
            then exists (select 1 from public.curas_lesiones l where l.ingreso_id = i.id and l.caracteristicas = 'upp')
            else (select count(*) from public.eventos e where e.ingreso_id = i.id and e.tipo <> 'ulcera'
                    and (p_tipo_incidencia is null or e.tipo = p_tipo_incidencia)) > 0
          end
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
        (select count(*) from public.eventos e where e.ingreso_id = i.id and e.tipo <> ''ulcera'') as num_incidencias
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
            case when $11::text = ''ulcera''
              then exists (select 1 from public.curas_lesiones l where l.ingreso_id = i.id and l.caracteristicas = ''upp'')
              else (select count(*) from public.eventos e where e.ingreso_id = i.id and e.tipo <> ''ulcera''
                      and ($11::text is null or e.tipo = $11::text)) > 0
            end
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

revoke execute on function public.dashboard_situacion_actual(uuid) from public, anon;
revoke execute on function public.dashboard_resumen(date, date, uuid) from public, anon;
revoke execute on function public.dashboard_seguridad(date, date, uuid) from public, anon;
revoke execute on function public.buscar_episodios_dashboard(
  text, date, date, date, date, date, date, text, uuid, integer, integer, boolean, text, text, text, integer, integer, boolean
) from public, anon;
grant execute on function public.dashboard_situacion_actual(uuid) to authenticated;
grant execute on function public.dashboard_resumen(date, date, uuid) to authenticated;
grant execute on function public.dashboard_seguridad(date, date, uuid) to authenticated;
grant execute on function public.buscar_episodios_dashboard(
  text, date, date, date, date, date, date, text, uuid, integer, integer, boolean, text, text, text, integer, integer, boolean
) to authenticated;

commit;

-- Resultado: cuántas úlceras antiguas hay ya en Curas.
select count(*) as ulceras_antiguas_pasadas_a_curas from public.curas_lesiones where evento_origen_id is not null;
