-- ============================================================
-- Dashboard, vista Seguridad — tabla por tipo de incidencia, más los
-- indicadores específicos de caídas, úlceras, otras incidencias y
-- contenciones.
-- ============================================================

begin;

create or replace function public.dashboard_seguridad(
  p_desde date,
  p_hasta date,
  p_medico_id uuid default null,
  p_estado_filtro text default null
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
  if private.mi_rol() is null then
    raise exception 'No autorizado.';
  end if;
  if p_desde > p_hasta then
    raise exception 'La fecha "desde" no puede ser posterior a "hasta".';
  end if;

  -- Mismos días-estancia que dashboard_resumen, para que las tasas
  -- de las dos vistas siempre coincidan entre sí.
  select coalesce(sum(
    greatest(0, (least(coalesce(i.fecha_alta, p_hasta + 1), p_hasta + 1) - greatest(i.fecha_ingreso, p_desde)))
  ), 0) into v_dias_estancia
  from public.ingresos i
  where i.fecha_ingreso <= p_hasta
    and (i.fecha_alta is null or i.fecha_alta >= p_desde)
    and (p_medico_id is null or i.medico_responsable_id = p_medico_id)
    and (p_estado_filtro is null or i.estado = p_estado_filtro);

  -- Tabla por tipo: número, pacientes afectados, pendientes, tasa.
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
      and (p_estado_filtro is null or i.estado = p_estado_filtro)
    group by e.tipo
  ) t;

  -- Caídas
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
    and (p_medico_id is null or i.medico_responsable_id = p_medico_id)
    and (p_estado_filtro is null or i.estado = p_estado_filtro);

  -- Úlceras
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
    and (p_medico_id is null or i.medico_responsable_id = p_medico_id)
    and (p_estado_filtro is null or i.estado = p_estado_filtro);

  -- Otras incidencias
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
  where e.tipo in ('error_medicacion', 'efecto_adverso_medicacion', 'infeccion_nosocomial', 'agresividad_fisica', 'fuga')
    and e.fecha between p_desde and p_hasta
    and (p_medico_id is null or i.medico_responsable_id = p_medico_id)
    and (p_estado_filtro is null or i.estado = p_estado_filtro);

  -- Contenciones: solo lo pedido, sin días de exposición todavía.
  select jsonb_build_object(
    'pacientes_con_contencion_activa', (
      select count(*) from public.ingresos i2
      inner join public.contenciones c on c.ingreso_id = i2.id
      where i2.estado = 'activo'
        and (p_medico_id is null or i2.medico_responsable_id = p_medico_id)
        and (
          (c.dia is not null and c.dia <> 'ninguna')
          or (c.noche is not null and array_length(c.noche, 1) > 0)
        )
    ),
    'pendientes_confirmacion', (
      select count(*) from public.ingresos i2
      inner join public.contenciones c on c.ingreso_id = i2.id
      where i2.estado = 'activo'
        and (p_medico_id is null or i2.medico_responsable_id = p_medico_id)
        and c.confirmado_por_id is null
        and (
          c.dia = 'continua_seguridad' or c.dia in ('si_precisa_supervision', 'si_precisa_paciente')
          or 'contencion_fija' = any(c.noche) or 'contencion_si_precisa' = any(c.noche)
        )
    ),
    'cambios_pauta_periodo', (
      select count(*) from public.contenciones_historial ch
      inner join public.ingresos i2 on i2.id = ch.ingreso_id
      where ch.tipo_accion in ('pauta_creada', 'pauta_modificada')
        and ch.cambiado_en::date between p_desde and p_hasta
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

grant execute on function public.dashboard_seguridad(date, date, uuid, text) to authenticated;

commit;
