-- ============================================================
-- CJA HOSPITALIZACIÓN — Schema inicial
-- Pegar completo en Supabase SQL Editor y ejecutar
-- ============================================================

-- Extensión para UUIDs
create extension if not exists "pgcrypto";

-- ============================================================
-- PROFESIONALES
-- ============================================================
create table profesionales (
  id uuid primary key default gen_random_uuid(),
  nombre text not null,
  apellidos text not null,
  rol text not null check (rol in ('medico', 'enfermeria', 'auxiliar', 'administrativo', 'tecnico')),
  activo boolean not null default true,
  created_at timestamptz default now()
);

-- ============================================================
-- PACIENTES
-- ============================================================
create table pacientes (
  id uuid primary key default gen_random_uuid(),
  cipna text,
  nhc text,
  nombre text not null,
  primer_apellido text not null,
  segundo_apellido text,
  fecha_nacimiento date,
  sexo text check (sexo in ('hombre', 'mujer', 'otro')),
  dni text,
  municipio text,
  medico_cabecera text,
  contacto_familiar_nombre text,
  contacto_familiar_telefono text,
  created_at timestamptz default now()
);

-- ============================================================
-- INGRESOS
-- ============================================================
create table ingresos (
  id uuid primary key default gen_random_uuid(),
  paciente_id uuid not null references pacientes(id),
  fecha_ingreso date not null,
  fecha_alta date,
  habitacion integer check (habitacion >= 1 and habitacion <= 32),
  medico_responsable_id uuid references profesionales(id),
  motivo_ingreso text,
  estado text not null default 'activo' check (estado in ('activo', 'alta', 'exitus')),
  created_at timestamptz default now()
);

-- ============================================================
-- INFORME DE INGRESO
-- ============================================================
create table informe_ingreso (
  id uuid primary key default gen_random_uuid(),
  ingreso_id uuid not null unique references ingresos(id) on delete cascade,

  -- Antecedentes
  alergias text,
  antecedentes_medicos text,
  antecedentes_quirurgicos text,
  antecedentes_familiares text,

  -- Tratamiento al ingreso
  tratamiento_ingreso text,

  -- Valoración Geriátrica Integral
  vgi_social text,
  vgi_funcional text,
  barthel integer check (barthel >= 0 and barthel <= 100),
  lawton integer check (lawton >= 0 and lawton <= 8),
  vgi_cognitivo text,
  vgi_sensorial text,
  vgi_nutricional text,
  vgi_dolor text,
  vgi_otros text,

  -- Enfermedad actual
  personalidad_previa text,
  evolucion text,
  situacion_cognitivo text,
  situacion_conductual text,
  situacion_animico text,
  situacion_funcional text,
  situacion_social text,

  -- Exploraciones
  exploracion_fisica text,
  exploracion_neurologica text,
  exploracion_psicopatologica text,
  exploraciones_complementarias text,

  -- Diagnóstico y plan
  impresion_diagnostica text,
  plan_objetivos text,
  plan_medicacion text,
  plan_otros_cuidados text,

  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- ============================================================
-- INFORME DE ALTA
-- ============================================================
create table informe_alta (
  id uuid primary key default gen_random_uuid(),
  ingreso_id uuid not null unique references ingresos(id) on delete cascade,

  -- Exploraciones durante el ingreso
  exploraciones_durante_ingreso text,
  estudio_neuropsicologico text,
  informe_fisioterapia text,
  informe_terapia_ocupacional text,

  -- Evolución y diagnósticos
  evolucion_clinica text,
  juicios_clinicos text,

  -- Tratamiento al alta
  recomendaciones_conductuales text,
  cuidados_enfermeria text,
  medicacion_alta text,
  otras_recomendaciones text,

  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- ============================================================
-- HOJA DE ÍTEMS
-- ============================================================
create table items_paciente (
  id uuid primary key default gen_random_uuid(),
  ingreso_id uuid not null unique references ingresos(id) on delete cascade,

  -- Dependencia
  dependencia_avd integer check (dependencia_avd in (1, 2)),

  -- Continencia
  panial_dia text check (panial_dia in ('ninguno', 'BP', 'CA')),
  panial_noche text check (panial_noche in ('ninguno', 'BP', 'CA', 'CA+malla')),
  colector boolean default false,
  sonda_vesical boolean default false,

  -- Prótesis
  dentadura text check (dentadura in ('ninguna', 'superior', 'inferior', 'completa', 'fija', 'puente')),
  audifonos text check (audifonos in ('ninguno', 'derecho', 'izquierdo', 'ambos')),
  gafas text check (gafas in ('no', 'si', 'solo_tv')),

  -- Cuidados básicos
  higiene text check (higiene in ('lavabo', 'cama')),
  vestido text,
  ducha text check (ducha in ('pie', 'sentado')),
  banio boolean default false,
  siestas boolean default false,

  -- Movilidad
  deambulacion text,
  ayudas_deambulacion text check (ayudas_deambulacion in ('ninguna', 'baston', 'andador_2r', 'andador_4r', 'silla_ruedas')),
  bipedestador boolean default false,
  grua boolean default false,
  cambios_posturales boolean default false,
  cama_45 boolean default false,

  -- Nutrición
  ingestas text check (ingestas in ('autonomo', 'dependiente')),
  oxigenoterapia boolean default false,
  botella_noche boolean default false,

  -- Contenciones (arrays de texto para selección múltiple)
  sujecion_cama text[] default '{}',
  sujecion_silla_ruedas text[] default '{}',
  sujecion_sillon text[] default '{}',
  colchon_antiescaras boolean default false,
  patucos_coderas boolean default false,
  sensor_cama boolean default false,

  -- Observaciones de sujeciones
  motivo_sujecion text[] default '{}',   -- categorías 1-6
  observaciones_sujeciones text,

  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- ============================================================
-- EVENTOS
-- ============================================================
create table eventos (
  id uuid primary key default gen_random_uuid(),
  ingreso_id uuid not null references ingresos(id) on delete cascade,
  fecha date not null default current_date,
  tipo text not null check (tipo in (
    'caida', 'ulcera', 'infeccion_nosocomial',
    'agresion', 'autoagresion', 'elopement', 'otro'
  )),
  descripcion text,
  consecuencias text,
  medidas_tomadas text,
  registrado_por_id uuid references profesionales(id),
  created_at timestamptz default now()
);

-- ============================================================
-- CMBD (campos ministerio — expandir en fase posterior)
-- ============================================================
create table cmbd (
  id uuid primary key default gen_random_uuid(),
  ingreso_id uuid not null unique references ingresos(id) on delete cascade,

  -- Identificación
  comunidad_autonoma text default 'Navarra',
  centro_codigo text,
  anio integer,

  -- Datos del episodio
  tipo_ingreso text,
  circunstancia_alta text,
  dias_estancia integer,

  -- Diagnósticos CIE-10
  diagnostico_principal text,
  diagnosticos_secundarios text[],
  procedimientos text[],

  -- Datos sociodemográficos (algunos se heredan del paciente)
  financiacion text,

  observaciones text,
  completado boolean default false,

  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- ============================================================
-- TRIGGERS para updated_at automático
-- ============================================================
create or replace function update_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

create trigger trg_informe_ingreso_updated
  before update on informe_ingreso
  for each row execute function update_updated_at();

create trigger trg_informe_alta_updated
  before update on informe_alta
  for each row execute function update_updated_at();

create trigger trg_items_updated
  before update on items_paciente
  for each row execute function update_updated_at();

create trigger trg_cmbd_updated
  before update on cmbd
  for each row execute function update_updated_at();

-- ============================================================
-- DATOS INICIALES — Profesionales
-- ============================================================
insert into profesionales (nombre, apellidos, rol) values
  ('Ana', '', 'medico'),
  ('Kevin', '', 'medico'),
  ('Javier', 'González Gómez', 'medico');
