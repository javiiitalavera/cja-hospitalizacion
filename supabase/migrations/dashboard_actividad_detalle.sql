-- ============================================================
-- Dashboard, vista Actividad y ocupación — lo que dashboard_resumen
-- todavía no calcula: distribución de estancia por bandas, episodios
-- activos de larga duración, reparto por médico, y edad/sexo como
-- información secundaria (nunca como indicador principal).
--
-- Los episodios activos de larga duración se calculan a fecha de
-- HOY, no del periodo — un episodio "lleva más de 60 días abierto"
-- es un hecho del presente, con independencia del periodo que se
-- esté mirando; por eso no usa p_desde/p_hasta para ese cálculo en
-- concreto, aunque sí respeta el filtro de médico.
-- ============================================================

begin;

create or replace function public.dashboard_actividad_detalle(
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
  v_distribucion_estancia jsonb;
  v_activos_30 integer;
  v_activos_60 integer;
  v_activos_90 integer;
  v_por_medico jsonb;
  v_por_sexo jsonb;
  v_edad_media numeric;
begin
  if private.mi_rol() is null then
    raise exception 'No autorizado.';
  end if;

  -- Distribución de estancia: episodios cuya salida cayó en el
  -- periodo, agrupados en las bandas ya definidas.
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
    count(*) filter (where fecha_ingreso <= current_date - 30),
    count(*) filter (where fecha_ingreso <= current_date - 60),
    count(*) filter (where fecha_ingreso <= current_date - 90)
  into v_activos_30, v_activos_60, v_activos_90
  from public.ingresos
  where estado = 'activo'
    and (p_medico_id is null or medico_responsable_id = p_medico_id);

  -- Reparto de ingresos nuevos del periodo por médico responsable —
  -- un recuento, no una medida de productividad: el propio Dashboard
  -- no debe presentarlo como tal.
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
      and (p_estado_filtro is null or estado = p_estado_filtro)
    group by medico_responsable_id
  ) c
  inner join public.profesionales pr on pr.id = c.medico_responsable_id;

  -- Edad y sexo: información secundaria sobre los ingresos nuevos
  -- del periodo, nunca presentada como indicador principal.
  select
    jsonb_build_object(
      'hombre', count(*) filter (where p.sexo = 'hombre'),
      'mujer', count(*) filter (where p.sexo = 'mujer'),
      'otro', count(*) filter (where p.sexo = 'otro'),
      'sin_dato', count(*) filter (where p.sexo is null)
    ),
    avg(extract(year from age(i.fecha_ingreso, p.fecha_nacimiento)))
  into v_por_sexo, v_edad_media
  from public.ingresos i
  inner join public.pacientes p on p.id = i.paciente_id
  where i.fecha_ingreso between p_desde and p_hasta
    and (p_medico_id is null or i.medico_responsable_id = p_medico_id)
    and (p_estado_filtro is null or i.estado = p_estado_filtro);

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

grant execute on function public.dashboard_actividad_detalle(date, date, uuid, text) to authenticated;

commit;
