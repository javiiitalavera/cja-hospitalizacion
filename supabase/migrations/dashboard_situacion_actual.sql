-- ============================================================
-- Dashboard, primera fase — vista Resumen.
--
-- Tres funciones independientes, cada una con su propia
-- responsabilidad, para no acabar con una única función gigantesca:
--
--   dashboard_situacion_actual()   — a fecha de hoy, no depende de
--                                    ningún filtro de periodo.
--   dashboard_resumen(...)         — actividad de un periodo, con
--                                    filtros de médico/estado.
--   dashboard_series(...)          — ocupación e ingresos/salidas
--                                    día a día, para los dos gráficos.
--
-- security invoker en las tres: respetan las RLS ya existentes
-- (private.mi_rol() is not null para leer), no hace falta saltárselas
-- para agregar datos que cualquier profesional ya puede leer fila a
-- fila.
--
-- Re-ejecutable sin dar error.
-- ============================================================

begin;

-- ── Situación actual: independiente de cualquier periodo ────────

create or replace function public.dashboard_situacion_actual()
returns jsonb
language plpgsql
security invoker
stable
set search_path = ''
as $$
declare
  v_activos integer;
  v_estancia_larga integer;
  v_semaforo_riesgo integer;
  v_contencion_activa integer;
  v_contencion_pendiente integer;
  v_incidencias_pendientes integer;
begin
  if private.mi_rol() is null then
    raise exception 'No autorizado.';
  end if;

  select count(*) into v_activos from public.ingresos where estado = 'activo';

  select count(*) into v_estancia_larga
  from public.ingresos
  where estado = 'activo' and fecha_ingreso <= current_date - 60;

  select count(*) into v_semaforo_riesgo
  from public.ingresos i
  inner join public.items_paciente ip on ip.ingreso_id = i.id
  where i.estado = 'activo' and ip.semaforo_caidas in ('rojo', 'naranja');

  -- Misma definición que necesitaConfirmacion() en el frontend
  -- (types/contenciones.ts) — "activa" es dia=continua_seguridad o
  -- si_precisa_*, o noche con contencion_fija o contencion_si_precisa.
  -- "Alguna contención activa" es más amplio: cualquier pauta real,
  -- incluidas las de solo seguridad (barras, sensor...).
  select count(*) into v_contencion_activa
  from public.ingresos i
  inner join public.contenciones c on c.ingreso_id = i.id
  where i.estado = 'activo'
    and (
      (c.dia is not null and c.dia <> 'ninguna')
      or (c.noche is not null and array_length(c.noche, 1) > 0)
    );

  select count(*) into v_contencion_pendiente
  from public.ingresos i
  inner join public.contenciones c on c.ingreso_id = i.id
  where i.estado = 'activo'
    and c.confirmado_por_id is null
    and (
      c.dia = 'continua_seguridad' or c.dia in ('si_precisa_supervision', 'si_precisa_paciente')
      or 'contencion_fija' = any(c.noche) or 'contencion_si_precisa' = any(c.noche)
    );

  select count(*) into v_incidencias_pendientes
  from public.eventos e
  inner join public.ingresos i on i.id = e.ingreso_id
  where e.estado = 'pendiente' and i.estado = 'activo';

  return jsonb_build_object(
    'pacientes_ingresados', v_activos,
    'ocupacion_actual_pct', round(v_activos::numeric / 33 * 100, 1),
    'estancia_larga_60', v_estancia_larga,
    'semaforo_riesgo', v_semaforo_riesgo,
    'contencion_activa', v_contencion_activa,
    'contencion_pendiente_confirmacion', v_contencion_pendiente,
    'incidencias_pendientes', v_incidencias_pendientes
  );
end;
$$;

grant execute on function public.dashboard_situacion_actual() to authenticated;

commit;
