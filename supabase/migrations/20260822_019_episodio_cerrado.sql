-- ============================================================
-- Episodio cerrado = solo lectura (a nivel de base de datos)
--
-- Hasta ahora, un ingreso ya dado de alta (o traslado/éxitus) seguía
-- totalmente editable: se podían seguir añadiendo incidencias,
-- tocando la hoja de ítems o modificando informes de un episodio
-- cerrado hace meses. Esta migración lo impide en el candado mismo,
-- no solo en la pantalla.
--
-- Regla: para escribir en items_paciente, eventos, informe_ingreso,
-- informe_alta o cmbd, el ingreso relacionado debe estar "activo".
-- Para el propio ingreso: solo se puede modificar mientras SU
-- estado actual sea "activo" (esto permite la propia transición de
-- alta, que parte de un ingreso activo, pero bloquea tocarlo después).
--
-- Re-ejecutable sin dar error.
-- ============================================================

begin;

-- ── items_paciente y eventos (equipo: médico/enfermería/auxiliar/técnico) ──
drop policy if exists escribir_equipo on items_paciente;
drop policy if exists escribir_equipo on eventos;

create policy escribir_equipo on items_paciente for all to authenticated
  using (
    private.mi_rol() in ('medico','enfermeria','auxiliar','tecnico')
    and exists (select 1 from ingresos i where i.id = items_paciente.ingreso_id and i.estado = 'activo')
  )
  with check (
    private.mi_rol() in ('medico','enfermeria','auxiliar','tecnico')
    and exists (select 1 from ingresos i where i.id = items_paciente.ingreso_id and i.estado = 'activo')
  );

create policy escribir_equipo on eventos for all to authenticated
  using (
    private.mi_rol() in ('medico','enfermeria','auxiliar','tecnico')
    and exists (select 1 from ingresos i where i.id = eventos.ingreso_id and i.estado = 'activo')
  )
  with check (
    private.mi_rol() in ('medico','enfermeria','auxiliar','tecnico')
    and exists (select 1 from ingresos i where i.id = eventos.ingreso_id and i.estado = 'activo')
  );

-- ── Informes y CMBD (solo médico) ───────────────────────────
drop policy if exists escribir_medico on informe_ingreso;
drop policy if exists escribir_medico on informe_alta;
drop policy if exists escribir_medico on cmbd;

create policy escribir_medico on informe_ingreso for all to authenticated
  using (
    private.mi_rol() = 'medico'
    and exists (select 1 from ingresos i where i.id = informe_ingreso.ingreso_id and i.estado = 'activo')
  )
  with check (
    private.mi_rol() = 'medico'
    and exists (select 1 from ingresos i where i.id = informe_ingreso.ingreso_id and i.estado = 'activo')
  );

create policy escribir_medico on informe_alta for all to authenticated
  using (
    private.mi_rol() = 'medico'
    and exists (select 1 from ingresos i where i.id = informe_alta.ingreso_id and i.estado = 'activo')
  )
  with check (
    private.mi_rol() = 'medico'
    and exists (select 1 from ingresos i where i.id = informe_alta.ingreso_id and i.estado = 'activo')
  );

create policy escribir_medico on cmbd for all to authenticated
  using (
    private.mi_rol() = 'medico'
    and exists (select 1 from ingresos i where i.id = cmbd.ingreso_id and i.estado = 'activo')
  )
  with check (
    private.mi_rol() = 'medico'
    and exists (select 1 from ingresos i where i.id = cmbd.ingreso_id and i.estado = 'activo')
  );

-- ── El propio ingreso: editable solo mientras esté activo ───
-- "using" comprueba el estado ANTES del cambio: permite la propia
-- transición activo → alta/exitus/traslado, pero no tocar nada
-- después de esa transición.
drop policy if exists escribir_medico on ingresos;

create policy escribir_medico on ingresos for all to authenticated
  using (private.mi_rol() = 'medico' and estado = 'activo')
  with check (private.mi_rol() = 'medico');

commit;
