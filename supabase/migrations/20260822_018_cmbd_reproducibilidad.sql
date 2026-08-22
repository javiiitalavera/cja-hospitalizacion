-- ============================================================
-- Corrección de reproducibilidad del CMBD
--
-- La migración 001 ya creaba la tabla "cmbd" con un esquema antiguo.
-- La 008 intentaba crear la versión nueva con "create table if not
-- exists", pero como la tabla ya existía, PostgreSQL no hizo nada:
-- ninguna de esas columnas se llegó a añadir. Solo la 009 (que usa
-- "alter table ... add column if not exists", correcto) sí surtió
-- efecto.
--
-- Resultado: una base de datos nueva creada desde las migraciones,
-- en el orden 001→008→009, NO tendría el esquema que el frontend
-- (TabCMBD.tsx) espera. Esta migración lo corrige añadiendo lo que
-- faltaba.
--
-- Como todavía no hay datos reales de pacientes, se retiran también
-- las columnas del esquema antiguo (array) que ya no se usan, en
-- vez de dejarlas como basura sin uso.
--
-- Re-ejecutable sin dar error.
-- ============================================================

begin;

-- ── Añadir lo que la 008 debería haber creado ───────────────
alter table cmbd
  add column if not exists diagnostico_principal_desc text,
  add column if not exists diagnostico_secundario_1 text,
  add column if not exists diagnostico_secundario_1_desc text,
  add column if not exists diagnostico_secundario_2 text,
  add column if not exists diagnostico_secundario_2_desc text,
  add column if not exists diagnostico_secundario_3 text,
  add column if not exists diagnostico_secundario_3_desc text,
  add column if not exists diagnostico_secundario_4 text,
  add column if not exists diagnostico_secundario_4_desc text,
  add column if not exists procedimiento_1 text,
  add column if not exists procedimiento_1_desc text,
  add column if not exists procedimiento_2 text,
  add column if not exists procedimiento_2_desc text,
  add column if not exists procedimiento_3 text,
  add column if not exists procedimiento_3_desc text,
  add column if not exists procedimiento_4 text,
  add column if not exists procedimiento_4_desc text,
  add column if not exists notas text;

-- ── Retirar el esquema antiguo (arrays), no usado por el frontend ──
-- Solo son seguras de borrar porque todavía no hay datos reales.
alter table cmbd
  drop column if exists diagnosticos_secundarios,
  drop column if exists procedimientos,
  drop column if exists observaciones,
  drop column if exists comunidad_autonoma,
  drop column if exists centro_codigo,
  drop column if exists anio,
  drop column if exists tipo_ingreso,
  drop column if exists dias_estancia,
  drop column if exists financiacion;

commit;
