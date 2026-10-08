-- CJA Hospital — "Otros informes" (informes puntuales) (2026-10-08)
--
-- Además del informe de ingreso y el de alta (rígidos, uno por episodio),
-- el médico necesita redactar informes sueltos durante el ingreso:
-- derivación a urgencias, valoración de recursos para la trabajadora
-- social, estado actual para la familia o una residencia, o un informe
-- libre. Cada informe es una lista de secciones editables
-- (título + texto) que arrancan de una plantilla.
--
--   * Solo los médicos los crean y editan; el resto del equipo los lee.
--   * Se pueden redactar con el episodio activo o ya cerrado (igual que
--     el informe de alta).
--   * Estados: borrador (editable) → firmado (inmutable). Para corregir
--     un informe firmado se crea una nueva versión (otro informe que
--     "reemplaza_a" el anterior); el firmado nunca se toca.
--   * Quién firma y cuándo lo pone el servidor, no el navegador.
--   * Auditoría genérica (quién y cuándo), como el resto de informes.
--
-- Migración incremental, transaccional e idempotente (se puede ejecutar
-- más de una vez).

begin;

-- ────────────────────────────────────────────────────────────
-- VALIDACIÓN DE LAS SECCIONES
-- ────────────────────────────────────────────────────────────

-- "secciones" es un array JSON de objetos {titulo, texto, origen?}.
-- Un CHECK no admite subconsultas, así que la comprobación vive en una
-- función inmutable. "origen" (opcional) indica de qué dato de la ficha
-- se rellenó la sección, para poder volver a rellenarla.
create or replace function private.secciones_informe_validas(s jsonb) returns boolean
language plpgsql immutable
set search_path = ''
as $$
declare
  e jsonb;
begin
  if s is null or jsonb_typeof(s) <> 'array' then return false; end if;
  if jsonb_array_length(s) > 40 then return false; end if;
  if length(s::text) > 400000 then return false; end if;
  for e in select value from jsonb_array_elements(s) loop
    if jsonb_typeof(e) <> 'object' then return false; end if;
    if jsonb_typeof(e->'titulo') is distinct from 'string' then return false; end if;
    if jsonb_typeof(e->'texto') is distinct from 'string' then return false; end if;
    if length(e->>'titulo') > 200 or length(e->>'texto') > 20000 then return false; end if;
    if e ? 'origen' and jsonb_typeof(e->'origen') not in ('string', 'null') then return false; end if;
    if e ? 'origen' and jsonb_typeof(e->'origen') = 'string' and length(e->>'origen') > 60 then return false; end if;
  end loop;
  return true;
end;
$$;

revoke execute on function private.secciones_informe_validas(jsonb) from public, anon;
grant execute on function private.secciones_informe_validas(jsonb) to authenticated;

-- ────────────────────────────────────────────────────────────
-- TABLA
-- ────────────────────────────────────────────────────────────

create table if not exists public.informes_puntuales (
    id uuid primary key default gen_random_uuid(),
    ingreso_id uuid not null references public.ingresos(id) on delete cascade,
    plantilla text not null check (plantilla in (
        'derivacion_urgencias',
        'trabajo_social',
        'estado_actual',
        'libre'
    )),
    titulo text not null check (length(btrim(titulo)) between 1 and 200),
    destinatario text check (destinatario is null or length(destinatario) <= 300),
    fecha date not null default private.hoy_madrid(),
    secciones jsonb not null default '[]'::jsonb
        check (private.secciones_informe_validas(secciones)),
    estado text not null default 'borrador' check (estado in ('borrador', 'firmado')),
    firmado_por_id uuid references public.profesionales(id),
    firmado_en timestamptz,
    -- Si es una nueva versión de un informe ya firmado, cuál reemplaza.
    reemplaza_a_id uuid references public.informes_puntuales(id) on delete set null,
    version integer not null default 1,
    registrado_por_id uuid references public.profesionales(id),
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now(),
    check ((estado = 'firmado') = (firmado_en is not null and firmado_por_id is not null))
);

create index if not exists informes_puntuales_ingreso_idx
    on public.informes_puntuales (ingreso_id, created_at desc);

-- ────────────────────────────────────────────────────────────
-- DISPARADORES
-- ────────────────────────────────────────────────────────────

-- Al crear: siempre nace como borrador y sin firma, mande lo que mande
-- el navegador.
create or replace function public.preparar_informe_puntual_nuevo() returns trigger
language plpgsql
set search_path = ''
as $$
begin
  NEW.estado := 'borrador';
  NEW.firmado_por_id := null;
  NEW.firmado_en := null;
  return NEW;
end;
$$;

-- Al modificar: un informe firmado no se toca; lo que identifica al
-- informe no cambia; y la firma la pone el servidor.
create or replace function public.controlar_informe_puntual() returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_prof uuid;
begin
  if OLD.estado = 'firmado' then
    raise exception 'Un informe firmado no se puede modificar: crea una nueva versión.';
  end if;

  if NEW.ingreso_id is distinct from OLD.ingreso_id
     or NEW.plantilla is distinct from OLD.plantilla
     or NEW.registrado_por_id is distinct from OLD.registrado_por_id
     or NEW.reemplaza_a_id is distinct from OLD.reemplaza_a_id
     or NEW.created_at is distinct from OLD.created_at then
    raise exception 'Este dato del informe no se puede cambiar una vez creado.';
  end if;

  if NEW.estado = 'firmado' then
    select id into v_prof from public.profesionales
      where user_id = auth.uid() and activo = true and rol = 'medico' limit 1;
    if v_prof is null then
      raise exception 'Solo un médico puede firmar un informe.';
    end if;
    if not exists (
      select 1 from jsonb_array_elements(NEW.secciones) s
      where length(btrim(s->>'texto')) > 0
    ) then
      raise exception 'No se puede firmar un informe sin contenido.';
    end if;
    NEW.firmado_por_id := v_prof;
    NEW.firmado_en := now();
  else
    NEW.firmado_por_id := null;
    NEW.firmado_en := null;
  end if;
  return NEW;
end;
$$;

revoke execute on function public.preparar_informe_puntual_nuevo() from public, anon, authenticated;
revoke execute on function public.controlar_informe_puntual() from public, anon, authenticated;

drop trigger if exists preparar_nuevo on public.informes_puntuales;
create trigger preparar_nuevo before insert on public.informes_puntuales
    for each row execute function public.preparar_informe_puntual_nuevo();

drop trigger if exists controlar_cambios on public.informes_puntuales;
create trigger controlar_cambios before update on public.informes_puntuales
    for each row execute function public.controlar_informe_puntual();

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

-- Editar / firmar: un médico, y solo mientras es borrador.
drop policy if exists editar_informe_puntual on public.informes_puntuales;
create policy editar_informe_puntual on public.informes_puntuales for update to authenticated
    using (private.mi_rol() = 'medico' and estado = 'borrador')
    with check (private.mi_rol() = 'medico');

-- Borrar: solo borradores, y solo su autor o un administrador. Un
-- informe firmado se conserva siempre.
drop policy if exists borrar_informe_puntual on public.informes_puntuales;
create policy borrar_informe_puntual on public.informes_puntuales for delete to authenticated
    using (
        private.mi_rol() = 'medico'
        and estado = 'borrador'
        and (registrado_por_id = (select id from public.profesionales where user_id = auth.uid() limit 1) or private.soy_admin())
    );

commit;
