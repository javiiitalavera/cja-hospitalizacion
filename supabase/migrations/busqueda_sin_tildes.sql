-- ============================================================
-- Búsqueda de pacientes insensible a tildes
--
-- Hasta ahora, buscar "gonzalez" sin tilde no encontraba a
-- "González". ILIKE en PostgreSQL es sensible a acentos por defecto.
--
-- unaccent() resuelve esto, pero no se puede usar directamente en una
-- columna generada porque no está marcada IMMUTABLE (aunque en la
-- práctica el diccionario de acentos no cambia). El truco estándar y
-- ampliamente documentado es envolverla en una función propia que sí
-- se declara IMMUTABLE.
--
-- Re-ejecutable sin dar error.
-- ============================================================

begin;

create extension if not exists unaccent;

create or replace function public.inmutable_unaccent(text)
returns text
language sql immutable parallel safe
as $$
  select unaccent('unaccent', $1)
$$;

-- Columnas generadas automáticamente por la propia base de datos:
-- se recalculan solas cada vez que cambia nombre/primer_apellido,
-- no hace falta tocarlas desde la aplicación.
alter table public.pacientes
  add column if not exists nombre_normalizado text
  generated always as (public.inmutable_unaccent(lower(nombre))) stored;

alter table public.pacientes
  add column if not exists primer_apellido_normalizado text
  generated always as (public.inmutable_unaccent(lower(primer_apellido))) stored;

alter table public.pacientes
  add column if not exists segundo_apellido_normalizado text
  generated always as (public.inmutable_unaccent(lower(coalesce(segundo_apellido, '')))) stored;

-- Índices para que la búsqueda siga siendo rápida según crezca el
-- historial de pacientes.
create index if not exists pacientes_nombre_normalizado_idx on public.pacientes (nombre_normalizado);
create index if not exists pacientes_primer_apellido_normalizado_idx on public.pacientes (primer_apellido_normalizado);

-- La pantalla de Pacientes consulta esta vista, no la tabla
-- directamente: hay que exponer en ella las columnas nuevas también.
-- Los campos nuevos van al FINAL para no romper el orden que ya
-- espera el resto de la aplicación.
create or replace view public.pacientes_con_ultimo_ingreso
with (security_invoker = true) as
select
    p.id, p.cipna, p.nhc, p.nombre, p.primer_apellido, p.segundo_apellido,
    p.fecha_nacimiento, p.sexo, p.dni, p.municipio, p.medico_cabecera,
    p.contacto_familiar_nombre, p.contacto_familiar_telefono, p.created_at,
    i.id as ingreso_id,
    i.estado as ingreso_estado,
    i.fecha_ingreso as ingreso_fecha_ingreso,
    i.fecha_alta as ingreso_fecha_alta,
    i.habitacion as ingreso_habitacion,
    p.nombre_normalizado,
    p.primer_apellido_normalizado,
    p.segundo_apellido_normalizado
from public.pacientes p
left join lateral (
    select i2.id, i2.paciente_id, i2.fecha_ingreso, i2.fecha_alta, i2.habitacion,
           i2.medico_responsable_id, i2.motivo_ingreso, i2.estado, i2.created_at
    from public.ingresos i2
    where i2.paciente_id = p.id
    order by i2.fecha_ingreso desc
    limit 1
) i on true;

commit;
