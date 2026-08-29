-- ============================================================
-- "Vestido" pasa de texto libre a dos opciones fijas: autónomo o
-- dependiente — igual que ya se hizo con deambulación.
--
-- Sin datos reales de pacientes todavía, así que no hay que migrar
-- ningún valor existente; cualquier texto que no encaje se pone a
-- null por seguridad antes de aplicar la restricción.
-- ============================================================

begin;

update public.items_paciente
  set vestido = null
  where vestido is not null
    and vestido not in ('autonomo', 'dependiente');

alter table public.items_paciente
  add constraint items_paciente_vestido_check
  check (vestido in ('autonomo', 'dependiente') or vestido is null);

commit;
