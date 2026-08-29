-- ============================================================
-- Rediseño de la Hoja de Ítems
--
-- 1. Deambulación pasa de texto libre a tres opciones fijas.
-- 2. "Cama 45º" (sí/no) se sustituye por los grados reales del
--    cabecero, como campo nuevo — se elimina el viejo booleano.
-- 3. Campos nuevos: timbre en habitación, objetos de calma, alerta
--    de conducta (varias marcas combinables).
-- 4. "observaciones_sujeciones" se reaprovecha como campo general de
--    observaciones — no se crea una columna nueva al lado de una que
--    ya no se usaba para nada.
-- 5. Se eliminan las columnas de sujeción sueltas (sujecion_cama,
--    sujecion_silla_ruedas, sujecion_sillon, sensor_cama,
--    motivo_sujecion): quedan completamente sustituidas por la pauta
--    de contención día/noche, que ya es la fuente de verdad desde
--    hace unos días. Mantenerlas sería dejar un dato muerto que
--    además podría contradecir a la pauta real.
--
-- Sin datos reales de pacientes todavía, así que no hay migración de
-- datos que hacer — se puede cortar limpio.
-- ============================================================

begin;

-- 1. Deambulación: tres opciones fijas
update public.items_paciente
  set deambulacion = null
  where deambulacion is not null
    and deambulacion not in ('autonomo', '1_persona', '2_personas');

alter table public.items_paciente
  add constraint items_paciente_deambulacion_check
  check (deambulacion in ('autonomo', '1_persona', '2_personas') or deambulacion is null);

-- 2. Cabecero elevado: grados reales, no un simple sí/no
alter table public.items_paciente add column if not exists cabecero_grados text;
alter table public.items_paciente drop column if exists cama_45;

-- 3. Campos nuevos
alter table public.items_paciente add column if not exists timbre_habitacion boolean default false;
alter table public.items_paciente add column if not exists objetos_calma text;
alter table public.items_paciente add column if not exists alerta_conducta text[] default '{}'
  check (alerta_conducta <@ array['riesgo_autolitico', 'agresion_imprevisible', 'riesgo_fuga']::text[]);

-- 4. Observaciones: se reaprovecha la columna, con nombre más claro
alter table public.items_paciente rename column observaciones_sujeciones to observaciones;

-- 5. Fuera las columnas de sujeción sueltas — sustituidas por la
-- pauta de contención día/noche.
alter table public.items_paciente drop column if exists sujecion_cama;
alter table public.items_paciente drop column if exists sujecion_silla_ruedas;
alter table public.items_paciente drop column if exists sujecion_sillon;
alter table public.items_paciente drop column if exists sensor_cama;
alter table public.items_paciente drop column if exists motivo_sujecion;

commit;
