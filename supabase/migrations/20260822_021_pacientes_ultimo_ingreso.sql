-- ============================================================
-- Vista: pacientes con su último ingreso
--
-- Necesaria para poder ordenar y filtrar la pantalla de Pacientes
-- por datos que no viven en la tabla "pacientes" (fecha del último
-- ingreso, estado actual), sin el bug de filtrar en el navegador
-- después de paginar.
--
-- Es una vista normal (no materializada, no security definer), así
-- que las consultas sobre ella respetan el RLS de las tablas base
-- (pacientes, ingresos) exactamente igual que si se consultaran
-- directamente.
--
-- Re-ejecutable sin dar error.
-- ============================================================

begin;

drop view if exists pacientes_con_ultimo_ingreso;

create view pacientes_con_ultimo_ingreso as
select
  p.*,
  i.id as ingreso_id,
  i.estado as ingreso_estado,
  i.fecha_ingreso as ingreso_fecha_ingreso,
  i.fecha_alta as ingreso_fecha_alta,
  i.habitacion as ingreso_habitacion
from pacientes p
left join lateral (
  select * from ingresos i2
  where i2.paciente_id = p.id
  order by i2.fecha_ingreso desc
  limit 1
) i on true;

grant select on pacientes_con_ultimo_ingreso to authenticated;

commit;
