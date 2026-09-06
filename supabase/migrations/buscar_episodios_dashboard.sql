-- ============================================================
-- Explorador de episodios: búsqueda histórica paginada en servidor.
--
-- Devuelve un único jsonb (total + filas), no un conjunto de filas —
-- así nunca choca con el límite de 1.000 filas que PostgREST aplica
-- a las consultas normales: para la API, esto es "una fila" (un
-- único valor jsonb), por muchos episodios que lleve dentro.
--
-- Solo el ORDER BY necesita SQL dinámico (el nombre de columna no se
-- puede parametrizar de otra forma) — y solo puede tomar uno de los
-- cinco valores ya validados en el CASE de más abajo, así que no hay
-- riesgo de inyección. Todo lo demás son parámetros normales.
--
-- p_paginar = false devuelve TODOS los resultados filtrados, sin
-- paginar — es lo que usan la exportación a CSV y la impresión.
-- ============================================================

begin;

create or replace function public.buscar_episodios_dashboard(
  p_busqueda text default null,              -- paciente o NHC
  p_desde_ingreso date default null,
  p_hasta_ingreso date default null,
  p_desde_alta date default null,
  p_hasta_alta date default null,
  p_solapa_desde date default null,          -- episodios que solapen este periodo
  p_solapa_hasta date default null,
  p_estado text default null,
  p_medico_id uuid default null,
  p_estancia_min integer default null,
  p_estancia_max integer default null,
  p_con_incidencias boolean default null,
  p_tipo_incidencia text default null,
  p_orden text default 'fecha_ingreso',      -- paciente | ingreso | alta | estancia | medico
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
  if private.mi_rol() is null then
    raise exception 'No autorizado.';
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
      (case when i.fecha_alta is not null then i.fecha_alta - i.fecha_ingreso else current_date - i.fecha_ingreso end) as dias_estancia,
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

  -- El WHERE es idéntico al de arriba — se repite porque una CTE no
  -- se puede "compartir" entre dos consultas independientes, pero es
  -- SQL estático y seguro en las dos, no una cadena construida a
  -- mano: solo el ORDER BY final necesita ser dinámico.
  execute format(
    'with base as (
      select
        i.id, i.fecha_ingreso, i.fecha_alta, i.estado, i.habitacion,
        p.nombre, p.primer_apellido, p.segundo_apellido, p.nhc,
        (p.primer_apellido || '' '' || coalesce(p.segundo_apellido, '''') || '' '' || p.nombre) as nombre_orden,
        nullif(coalesce(m.nombre || '' '' || m.apellidos, ''''), '''') as medico_nombre,
        (case when i.fecha_alta is not null then i.fecha_alta - i.fecha_ingreso else current_date - i.fecha_ingreso end) as dias_estancia,
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

grant execute on function public.buscar_episodios_dashboard(
  text, date, date, date, date, date, date, text, uuid, integer, integer, boolean, text, text, text, integer, integer, boolean
) to authenticated;

commit;
