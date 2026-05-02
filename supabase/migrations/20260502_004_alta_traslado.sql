-- Migración: añadir alta_traslado como estado válido de ingreso
alter table ingresos
  drop constraint if exists ingresos_estado_check;

alter table ingresos
  add constraint ingresos_estado_check
  check (estado in ('activo', 'alta', 'alta_traslado', 'exitus'));
