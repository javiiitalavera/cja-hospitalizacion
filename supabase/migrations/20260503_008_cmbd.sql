-- Tabla CMBD
create table if not exists cmbd (
  id uuid primary key default gen_random_uuid(),
  ingreso_id uuid references ingresos(id) on delete cascade unique not null,
  diagnostico_principal text,
  diagnostico_principal_desc text,
  diagnostico_secundario_1 text, diagnostico_secundario_1_desc text,
  diagnostico_secundario_2 text, diagnostico_secundario_2_desc text,
  diagnostico_secundario_3 text, diagnostico_secundario_3_desc text,
  diagnostico_secundario_4 text, diagnostico_secundario_4_desc text,
  procedimiento_1 text, procedimiento_1_desc text,
  procedimiento_2 text, procedimiento_2_desc text,
  procedimiento_3 text, procedimiento_3_desc text,
  procedimiento_4 text, procedimiento_4_desc text,
  circunstancia_alta text,
  notas text,
  completado boolean default false,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);
alter table cmbd disable row level security;
