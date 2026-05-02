-- Migración: añadir semáforo de caídas a items_paciente
alter table items_paciente
  add column if not exists semaforo_caidas text
  check (semaforo_caidas in ('verde', 'amarillo', 'naranja', 'rojo'));
