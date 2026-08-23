-- ============================================================
-- Todo ingreso nace "activo": exigirlo también al CREARLO
--
-- La política de "ingresos" comprobaba estado='activo' para poder
-- EDITAR un ingreso (USING), pero el WITH CHECK —que es lo único que
-- se evalúa al CREAR uno— solo exigía ser médico, sin comprobar el
-- estado. Un médico podría, en teoría, crear directamente un ingreso
-- ya en estado 'alta' o 'exitus', saltándose el invariante "todo
-- episodio nace activo" (la propia intención declarada en el
-- comentario de la migración anterior).
--
-- Aquí no basta con añadir sin más "estado = 'activo'" al WITH CHECK,
-- porque WITH CHECK también valida el resultado de un UPDATE, y la
-- propia transición de "dar de alta" cambia el estado A OTRA COSA —
-- eso rompería el alta. Por eso se separa en política de INSERT
-- (exige nacer activo) y de UPDATE (permite el resultado que sea,
-- siempre que el ingreso YA estuviera activo antes del cambio).
--
-- Re-ejecutable sin dar error.
-- ============================================================

begin;

drop policy if exists escribir_medico on ingresos;

create policy crear_ingreso on ingresos for insert to authenticated
  with check (private.mi_rol() = 'medico' and estado = 'activo');

create policy editar_ingreso on ingresos for update to authenticated
  using (private.mi_rol() = 'medico' and estado = 'activo')
  with check (private.mi_rol() = 'medico');

create policy borrar_ingreso on ingresos for delete to authenticated
  using (private.mi_rol() = 'medico' and estado = 'activo');

commit;
