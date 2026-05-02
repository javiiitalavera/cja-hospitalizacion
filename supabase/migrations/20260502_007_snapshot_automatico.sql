-- ============================================================
-- Snapshot automático diario de hoja de ítems a las 00:00
-- Requiere extensión pg_cron (disponible en Supabase)
-- ============================================================

-- 1. Habilitar pg_cron (solo necesario una vez)
create extension if not exists pg_cron;

-- 2. Función que genera el snapshot
create or replace function generar_snapshot_items()
returns void
language plpgsql
as $$
begin
  insert into items_historico (ingreso_id, fecha, datos)
  select
    ip.ingreso_id,
    current_date,
    row_to_json(ip)::jsonb
  from items_paciente ip
  inner join ingresos i on i.id = ip.ingreso_id
  where i.estado = 'activo'
  on conflict (ingreso_id, fecha)
  do update set datos = excluded.datos;
end;
$$;

-- 3. Programar el cron a las 00:00 hora UTC (02:00 en verano, 01:00 en invierno España)
-- Ajusta la hora si quieres que sea exactamente medianoche española:
-- En verano (CEST, UTC+2): usar '0 22 * * *' (22:00 UTC = 00:00 CEST)
-- En invierno (CET, UTC+1): usar '0 23 * * *' (23:00 UTC = 00:00 CET)
-- Esta versión usa 23:00 UTC (válida todo el año como aproximación)
select cron.schedule(
  'snapshot-items-diario',
  '0 23 * * *',
  'select generar_snapshot_items()'
);

-- Para verificar que está programado:
-- select * from cron.job;

-- Para eliminar el job si necesitas cambiarlo:
-- select cron.unschedule('snapshot-items-diario');
