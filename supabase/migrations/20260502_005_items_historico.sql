-- Migración: historial diario de hoja de ítems
create table items_historico (
  id uuid primary key default gen_random_uuid(),
  ingreso_id uuid not null references ingresos(id) on delete cascade,
  fecha date not null default current_date,
  datos jsonb not null default '{}'::jsonb,  -- snapshot completo de items_paciente
  created_at timestamptz default now(),
  unique(ingreso_id, fecha)  -- un snapshot por ingreso por día
);

create index items_historico_ingreso_idx on items_historico(ingreso_id);
create index items_historico_fecha_idx on items_historico(fecha);

alter table items_historico disable row level security;
