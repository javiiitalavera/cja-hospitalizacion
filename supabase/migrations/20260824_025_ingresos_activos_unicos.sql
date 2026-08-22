-- ============================================================
-- Impedir dos ingresos activos del mismo paciente, o dos pacientes
-- activos a la vez en la misma habitación
--
-- Hasta ahora esto solo se comprobaba en el frontend (mirar y luego
-- escribir), lo que deja una ventana de carrera real si dos personas
-- actúan casi a la vez. La garantía de verdad tiene que estar en la
-- base de datos.
--
-- Los índices son PARCIALES (solo sobre estado='activo'), así que no
-- afectan a episodios ya cerrados: un paciente puede tener tantos
-- ingresos de alta/éxitus/traslado como haga falta, solo no puede
-- tener dos ACTIVOS a la vez.
--
-- Re-ejecutable sin dar error.
-- ============================================================

begin;

create unique index if not exists ingresos_paciente_activo_unico
  on ingresos (paciente_id)
  where estado = 'activo';

create unique index if not exists ingresos_habitacion_activa_unica
  on ingresos (habitacion)
  where estado = 'activo' and habitacion is not null;

commit;
