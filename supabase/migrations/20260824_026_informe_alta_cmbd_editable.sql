-- ============================================================
-- El informe de alta y el CMBD deben poder terminarse DESPUÉS
-- de confirmar el alta, no solo antes
--
-- La migración 019 exigía que el ingreso siguiera "activo" para poder
-- escribir en informe_alta y cmbd, con la misma lógica que el resto
-- de datos clínicos del episodio. Pero estos dos documentos se
-- redactan justo en torno al momento del alta —a menudo después de
-- confirmarla—, así que esa exigencia los bloqueaba antes de que se
-- pudieran terminar. Se corrige para que sigan editables por un
-- médico sin importar si el episodio ya está cerrado.
--
-- El resto de tablas (items_paciente, eventos, informe_ingreso, y el
-- propio ingreso) SIGUEN exigiendo episodio activo: esas sí son datos
-- de "lo que pasó durante el ingreso" y no deben tocarse después.
--
-- Re-ejecutable sin dar error.
-- ============================================================

begin;

drop policy if exists escribir_medico on informe_alta;
drop policy if exists escribir_medico on cmbd;

create policy escribir_medico on informe_alta for all to authenticated
  using (private.mi_rol() = 'medico')
  with check (private.mi_rol() = 'medico');

create policy escribir_medico on cmbd for all to authenticated
  using (private.mi_rol() = 'medico')
  with check (private.mi_rol() = 'medico');

commit;
