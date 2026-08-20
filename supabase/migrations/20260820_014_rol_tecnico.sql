-- ============================================================
-- "Técnico/a" pasa a tener los mismos permisos de escritura que
-- enfermería y auxiliar: puede editar la hoja de ítems y registrar
-- incidencias, pero no informes, CMBD ni pacientes.
--
-- Se rehacen las dos políticas de "equipo" añadiendo 'tecnico'.
-- Re-ejecutable sin dar error.
-- ============================================================

begin;

drop policy if exists escribir_equipo on items_paciente;
drop policy if exists escribir_equipo on eventos;

create policy escribir_equipo on items_paciente for all to authenticated
  using      (mi_rol() in ('medico','enfermeria','auxiliar','tecnico'))
  with check (mi_rol() in ('medico','enfermeria','auxiliar','tecnico'));

create policy escribir_equipo on eventos for all to authenticated
  using      (mi_rol() in ('medico','enfermeria','auxiliar','tecnico'))
  with check (mi_rol() in ('medico','enfermeria','auxiliar','tecnico'));

commit;
