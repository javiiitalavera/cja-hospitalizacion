-- Migración: medicación estructurada en informe de alta + datos de firma en profesionales

-- 1. Campo JSON para medicación estructurada en informe_alta
alter table informe_alta
  add column if not exists medicacion_estructurada jsonb;

-- 2. Datos de firma en profesionales (para generar informes)
alter table profesionales
  add column if not exists colegiado text,
  add column if not exists especialidad text;

-- Medicación estructurada en informe_ingreso (tratamiento al ingreso + plan medicación)
alter table informe_ingreso
  add column if not exists tratamiento_ingreso_estructurado jsonb,
  add column if not exists plan_medicacion_estructurado jsonb;
