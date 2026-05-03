-- Migración CMBD v2: añadir POAD, PROCEDENCIA y diagnósticos hasta D8
-- Los campos existentes se conservan

alter table cmbd
  -- POAD (presente al ingreso) para diagnóstico principal y secundarios existentes
  add column if not exists diagnostico_principal_poad boolean,
  add column if not exists diagnostico_secundario_1_poad boolean,
  add column if not exists diagnostico_secundario_2_poad boolean,
  add column if not exists diagnostico_secundario_3_poad boolean,
  add column if not exists diagnostico_secundario_4_poad boolean,

  -- Diagnósticos secundarios 5-8
  add column if not exists diagnostico_secundario_5 text,
  add column if not exists diagnostico_secundario_5_desc text,
  add column if not exists diagnostico_secundario_5_poad boolean,
  add column if not exists diagnostico_secundario_6 text,
  add column if not exists diagnostico_secundario_6_desc text,
  add column if not exists diagnostico_secundario_6_poad boolean,
  add column if not exists diagnostico_secundario_7 text,
  add column if not exists diagnostico_secundario_7_desc text,
  add column if not exists diagnostico_secundario_7_poad boolean,
  add column if not exists diagnostico_secundario_8 text,
  add column if not exists diagnostico_secundario_8_desc text,
  add column if not exists diagnostico_secundario_8_poad boolean,

  -- Procedimientos 5-8 adicionales
  add column if not exists procedimiento_5 text,
  add column if not exists procedimiento_5_desc text,
  add column if not exists procedimiento_6 text,
  add column if not exists procedimiento_6_desc text,
  add column if not exists procedimiento_7 text,
  add column if not exists procedimiento_7_desc text,
  add column if not exists procedimiento_8 text,
  add column if not exists procedimiento_8_desc text,

  -- Campos adicionales del CMBD
  add column if not exists procedencia text,  -- 10 (Atención Primaria) o 30 (Traslado)
  add column if not exists servicio text default 'GRT';
