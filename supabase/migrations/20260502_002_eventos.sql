-- ============================================================
-- MIGRACIÓN: Módulo de eventos
-- Ejecutar en Supabase SQL Editor
-- ============================================================

-- Borrar tabla anterior (era placeholder)
drop table if exists eventos;

-- Nueva tabla con estructura flexible
create table eventos (
  id uuid primary key default gen_random_uuid(),
  ingreso_id uuid not null references ingresos(id) on delete cascade,
  tipo text not null check (tipo in (
    'caida',
    'ulcera',
    'error_medicacion',
    'efecto_adverso_medicacion',
    'infeccion_nosocomial',
    'contencion_fisica',
    'agresividad_fisica',
    'fuga'
  )),
  fecha date not null default current_date,
  hora time,
  turno text check (turno in ('manana', 'tarde', 'noche')),
  datos jsonb not null default '{}'::jsonb,  -- campos específicos por tipo
  notas text,                                 -- campo libre adicional
  registrado_por_id uuid references profesionales(id),
  created_at timestamptz default now()
);

-- Índices para dashboard y análisis
create index eventos_tipo_idx on eventos(tipo);
create index eventos_fecha_idx on eventos(fecha);
create index eventos_ingreso_idx on eventos(ingreso_id);

-- Deshabilitar RLS (coherente con el resto de tablas)
alter table eventos disable row level security;
