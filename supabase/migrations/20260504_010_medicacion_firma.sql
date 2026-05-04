-- Migración: medicación estructurada en informe de alta + datos de firma en profesionales

-- 1. Campo JSON para medicación estructurada en informe_alta
alter table informe_alta
  add column if not exists medicacion_estructurada jsonb;

-- 2. Datos de firma en profesionales (para generar informes)
alter table profesionales
  add column if not exists colegiado text,
  add column if not exists especialidad text;
