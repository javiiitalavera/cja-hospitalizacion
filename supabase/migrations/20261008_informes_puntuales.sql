-- CJA Hospital — "Otros informes" (informes puntuales) (2026-10-08)
--
-- Además del informe de ingreso y el de alta, el médico puede redactar
-- informes sueltos durante el ingreso: derivación a urgencias, estado
-- actual (para trabajo social, familia o residencia) o un informe libre.
--
-- Funcionan igual que los de ingreso y alta: campos fijos según el tipo
-- de informe, guardado automático y exportación a Word. Sin borradores
-- ni firmas.
--
--   * Solo los médicos los crean y editan; el resto del equipo los lee.
--   * Se pueden redactar con el episodio activo o ya cerrado.
--   * Control de versiones (dos personas guardando a la vez) y auditoría
--     genérica, como el resto de informes.
--
-- Migración transaccional e idempotente (se puede ejecutar más de una
-- vez). Si en algún momento se ejecutó la primera versión de esta
-- migración (con borradores y firma), esa tabla se sustituye por la
-- nueva: solo contenía pruebas.

begin;

-- ────────────────────────────────────────────────────────────
-- LIMPIEZA DE LA PRIMERA VERSIÓN (solo si existe, con su forma antigua)
-- ────────────────────────────────────────────────────────────

do $$
begin
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'informes_puntuales' and column_name = 'estado'
  ) then
    drop table public.informes_puntuales cascade;
  end if;
end;
$$;

drop function if exists public.preparar_informe_puntual_nuevo();
drop function if exists public.controlar_informe_puntual();
drop function if exists private.secciones_informe_validas(jsonb);

-- ────────────────────────────────────────────────────────────
-- VALIDACIÓN DE LOS CAMPOS
-- ────────────────────────────────────────────────────────────

-- "campos" es un objeto JSON {nombre_del_campo: texto}. Un CHECK no admite
-- subconsultas, así que la comprobación vive en una función inmutable.
create or replace function private.campos_informe_validos(c jsonb) returns boolean
language plpgsql immutable
set search_path = ''
as $$
declare
  k text;
  v jsonb;
begin
  if c is null or jsonb_typeof(c) <> 'object' then return false; end if;
  if length(c::text) > 400000 then return false; end if;
  for k, v in select key, value from jsonb_each(c) loop
    if length(k) > 60 then return false; end if;
    if jsonb_typeof(v) <> 'string' then return false; end if;
    if length(v #>> '{}') > 30000 then return false; end if;
  end loop;
  return true;
end;
$$;

revoke execute on function private.campos_informe_validos(jsonb) from public, anon;
grant execute on function private.campos_informe_validos(jsonb) to authenticated;

-- ────────────────────────────────────────────────────────────
-- TABLA
-- ────────────────────────────────────────────────────────────

create table if not exists public.informes_puntuales (
    id uuid primary key default gen_random_uuid(),
    ingreso_id uuid not null references public.ingresos(id) on delete cascade,
    plantilla text not null check (plantilla in ('derivacion_urgencias', 'estado_actual', 'libre')),
    campos jsonb not null default '{}'::jsonb check (private.campos_informe_validos(campos)),
    version integer not null default 1,
    registrado_por_id uuid references public.profesionales(id),
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now()
);

create index if not exists informes_puntuales_ingreso_idx
    on public.informes_puntuales (ingreso_id, created_at desc);

-- ────────────────────────────────────────────────────────────
-- DISPARADORES
-- ────────────────────────────────────────────────────────────

-- Lo que identifica al informe no se puede reescribir con un UPDATE.
create or replace function public.evitar_cambio_informe_puntual() returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if NEW.ingreso_id is distinct from OLD.ingreso_id
     or NEW.plantilla is distinct from OLD.plantilla
     or NEW.registrado_por_id is distinct from OLD.registrado_por_id
     or NEW.created_at is distinct from OLD.created_at then
    raise exception 'Este dato del informe no se puede cambiar una vez creado.';
  end if;
  return NEW;
end;
$$;

revoke execute on function public.evitar_cambio_informe_puntual() from public, anon, authenticated;

drop trigger if exists evitar_cambio on public.informes_puntuales;
create trigger evitar_cambio before update on public.informes_puntuales
    for each row execute function public.evitar_cambio_informe_puntual();

drop trigger if exists trg_informes_puntuales_updated on public.informes_puntuales;
create trigger trg_informes_puntuales_updated before update on public.informes_puntuales
    for each row execute function public.update_updated_at();

-- Control de versiones (dos personas guardando a la vez), igual que
-- informe_ingreso e informe_alta.
drop trigger if exists incrementar_version on public.informes_puntuales;
create trigger incrementar_version before insert or update on public.informes_puntuales
    for each row execute function public.incrementar_version_generico();

drop trigger if exists aud_informes_puntuales on public.informes_puntuales;
create trigger aud_informes_puntuales
    after insert or update or delete on public.informes_puntuales
    for each row execute function public.registrar_auditoria();

-- ────────────────────────────────────────────────────────────
-- PERMISOS (RLS)
-- ────────────────────────────────────────────────────────────

alter table public.informes_puntuales enable row level security;

revoke all on public.informes_puntuales from public, anon;
grant select, insert, update, delete on public.informes_puntuales to authenticated;

drop policy if exists leer_autenticado on public.informes_puntuales;
create policy leer_autenticado on public.informes_puntuales
    for select to authenticated using (private.mi_rol() is not null);

-- Crear: un médico, a su nombre. Sin exigir episodio activo.
drop policy if exists crear_informe_puntual on public.informes_puntuales;
create policy crear_informe_puntual on public.informes_puntuales for insert to authenticated
    with check (
        private.mi_rol() = 'medico'
        and registrado_por_id = (select id from public.profesionales where user_id = auth.uid() limit 1)
    );

-- Editar y borrar (p. ej. uno creado por error): cualquier médico.
drop policy if exists editar_informe_puntual on public.informes_puntuales;
create policy editar_informe_puntual on public.informes_puntuales for update to authenticated
    using (private.mi_rol() = 'medico') with check (private.mi_rol() = 'medico');

drop policy if exists borrar_informe_puntual on public.informes_puntuales;
create policy borrar_informe_puntual on public.informes_puntuales for delete to authenticated
    using (private.mi_rol() = 'medico');

commit;
