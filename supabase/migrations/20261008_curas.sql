-- CJA Hospital — módulo de Curas (2026-10-08)
--
-- Sustituye a las hojas en papel/Word de enfermería:
--   1. "Tabla cuidados": qué cura/cuidado lleva cada paciente y dónde
--      → curas_lesiones (una fila por lesión o cuidado) + su pauta
--        vigente, que sale de la última valoración.
--   2. "Tabla curas semanal": un check por paciente y día
--      → curas_registro.
--   3. "Evolución": historial de valoraciones de cada lesión (como la
--      pantalla de úlceras de Aegerus: medidas, grado, tipo de cura,
--      frecuencia, Norton / Braden / EMINA)
--      → curas_valoraciones.
--
-- Migración incremental, transaccional e idempotente (se puede ejecutar
-- más de una vez). Permisos, igual que items/incidencias: leer cualquier
-- profesional activo; escribir todo el equipo asistencial, solo mientras
-- el episodio esté activo.

begin;

-- ────────────────────────────────────────────────────────────
-- TABLAS
-- ────────────────────────────────────────────────────────────

-- Una lesión o cuidado concreto de la piel de un paciente durante un
-- ingreso. "cuidado_piel" cubre lo que no es una herida (piel atópica,
-- hongos en ingles, etc.), que en la hoja actual va mezclado.
create table if not exists public.curas_lesiones (
    id uuid primary key default gen_random_uuid(),
    ingreso_id uuid not null references public.ingresos(id) on delete cascade,
    caracteristicas text not null check (caracteristicas in (
        'upp',                 -- úlcera por presión
        'herida_quirurgica',
        'ulcera_vascular',
        'lesion_humedad',
        'desgarro_cutaneo',
        'herida_traumatica',
        'cuidado_piel',        -- piel atópica, intertrigo, micosis…
        'otra'
    )),
    localizacion text not null check (length(btrim(localizacion)) between 1 and 120),
    fecha_inicio date not null default private.hoy_madrid(),
    -- Fecha de curación. null = sigue activa.
    fecha_fin date,
    -- Dónde se produjo: base para saber cuántas UPP son del propio centro.
    origen text check (origen in ('centro', 'fuera')),
    notas text check (notas is null or length(notas) <= 2000),
    registrado_por_id uuid references public.profesionales(id),
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now(),
    check (fecha_fin is null or fecha_fin >= fecha_inicio)
);

create index if not exists curas_lesiones_ingreso_idx on public.curas_lesiones (ingreso_id);
create index if not exists curas_lesiones_activas_idx on public.curas_lesiones (ingreso_id) where fecha_fin is null;

-- Cada valoración es una foto de la lesión en una fecha: cómo está y
-- qué cura lleva. La pauta VIGENTE de una lesión es la de su última
-- valoración (por fecha y, a igualdad, por orden de registro).
create table if not exists public.curas_valoraciones (
    id uuid primary key default gen_random_uuid(),
    lesion_id uuid not null references public.curas_lesiones(id) on delete cascade,
    fecha date not null default private.hoy_madrid(),
    medidas text check (medidas is null or length(medidas) <= 40),   -- "2 x 3" (cm x cm)
    grado text check (grado in ('I', 'II', 'III', 'IV', 'no_clasificable')),
    frotis boolean not null default false,
    tipo_cura text check (tipo_cura is null or length(btrim(tipo_cura)) between 1 and 300),
    frecuencia_horas integer check (frecuencia_horas is null or frecuencia_horas between 1 and 720),
    -- Días de la semana en que toca la cura: 1 = lunes … 7 = domingo.
    dias_semana smallint[] not null default '{}'
        check (dias_semana <@ array[1, 2, 3, 4, 5, 6, 7]::smallint[]),
    norton integer check (norton is null or norton between 5 and 20),
    braden integer check (braden is null or braden between 6 and 23),
    emina integer check (emina is null or emina between 0 and 15),
    notas text check (notas is null or length(notas) <= 2000),
    registrado_por_id uuid references public.profesionales(id),
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now()
);

create index if not exists curas_valoraciones_lesion_idx on public.curas_valoraciones (lesion_id, fecha desc, created_at desc);

-- La tabla semanal: se hizo o no se hizo la cura de un paciente un día.
-- Una fila por ingreso y día (no por lesión: es lo que refleja el papel).
create table if not exists public.curas_registro (
    id uuid primary key default gen_random_uuid(),
    ingreso_id uuid not null references public.ingresos(id) on delete cascade,
    fecha date not null,
    realizada_por_id uuid references public.profesionales(id),
    created_at timestamptz not null default now(),
    unique (ingreso_id, fecha)
);

-- ────────────────────────────────────────────────────────────
-- DISPARADORES
-- ────────────────────────────────────────────────────────────

drop trigger if exists trg_curas_lesiones_updated on public.curas_lesiones;
create trigger trg_curas_lesiones_updated
    before update on public.curas_lesiones
    for each row execute function public.update_updated_at();

drop trigger if exists trg_curas_valoraciones_updated on public.curas_valoraciones;
create trigger trg_curas_valoraciones_updated
    before update on public.curas_valoraciones
    for each row execute function public.update_updated_at();

-- El autor (y a qué pertenece) un registro no se puede reescribir con
-- un UPDATE. Una función por tabla: PostgreSQL no admite leer en una
-- misma función campos que solo existen en una de las tablas.
create or replace function public.evitar_cambio_autor_lesion() returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if NEW.registrado_por_id is distinct from OLD.registrado_por_id then
    raise exception 'No se puede cambiar quién registró este dato.';
  end if;
  if NEW.ingreso_id is distinct from OLD.ingreso_id then
    raise exception 'Una lesión no se puede pasar a otro ingreso.';
  end if;
  return NEW;
end;
$$;

create or replace function public.evitar_cambio_autor_valoracion() returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if NEW.registrado_por_id is distinct from OLD.registrado_por_id then
    raise exception 'No se puede cambiar quién registró este dato.';
  end if;
  if NEW.lesion_id is distinct from OLD.lesion_id then
    raise exception 'Una valoración no se puede pasar a otra lesión.';
  end if;
  return NEW;
end;
$$;

create or replace function public.evitar_cambio_registro_cura() returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if NEW.realizada_por_id is distinct from OLD.realizada_por_id
     or NEW.ingreso_id is distinct from OLD.ingreso_id
     or NEW.fecha is distinct from OLD.fecha then
    raise exception 'No se puede cambiar quién ni cuándo se registró la cura.';
  end if;
  return NEW;
end;
$$;

drop trigger if exists evitar_cambio_autor on public.curas_lesiones;
create trigger evitar_cambio_autor before update on public.curas_lesiones
    for each row execute function public.evitar_cambio_autor_lesion();
drop trigger if exists evitar_cambio_autor on public.curas_valoraciones;
create trigger evitar_cambio_autor before update on public.curas_valoraciones
    for each row execute function public.evitar_cambio_autor_valoracion();
drop trigger if exists evitar_cambio_registro on public.curas_registro;
create trigger evitar_cambio_registro before update on public.curas_registro
    for each row execute function public.evitar_cambio_registro_cura();

-- Limpieza por si se aplicó una versión anterior de esta migración.
drop trigger if exists evitar_cambio_autor on public.curas_registro;
drop function if exists public.evitar_cambio_autor_curas();

revoke execute on function public.evitar_cambio_autor_lesion() from public, anon, authenticated;
revoke execute on function public.evitar_cambio_autor_valoracion() from public, anon, authenticated;
revoke execute on function public.evitar_cambio_registro_cura() from public, anon, authenticated;

-- Auditoría genérica (quién y cuándo), la misma que ya usan los informes.
drop trigger if exists aud_curas_lesiones on public.curas_lesiones;
create trigger aud_curas_lesiones
    after insert or update or delete on public.curas_lesiones
    for each row execute function public.registrar_auditoria();
drop trigger if exists aud_curas_valoraciones on public.curas_valoraciones;
create trigger aud_curas_valoraciones
    after insert or update or delete on public.curas_valoraciones
    for each row execute function public.registrar_auditoria();
drop trigger if exists aud_curas_registro on public.curas_registro;
create trigger aud_curas_registro
    after insert or update or delete on public.curas_registro
    for each row execute function public.registrar_auditoria();

-- ────────────────────────────────────────────────────────────
-- PERMISOS (RLS)
-- ────────────────────────────────────────────────────────────

alter table public.curas_lesiones enable row level security;
alter table public.curas_valoraciones enable row level security;
alter table public.curas_registro enable row level security;

revoke all on public.curas_lesiones, public.curas_valoraciones, public.curas_registro from public, anon;
grant select, insert, update, delete on public.curas_lesiones, public.curas_valoraciones, public.curas_registro to authenticated;

drop policy if exists leer_autenticado on public.curas_lesiones;
create policy leer_autenticado on public.curas_lesiones
    for select to authenticated using (private.mi_rol() is not null);
drop policy if exists leer_autenticado on public.curas_valoraciones;
create policy leer_autenticado on public.curas_valoraciones
    for select to authenticated using (private.mi_rol() is not null);
drop policy if exists leer_autenticado on public.curas_registro;
create policy leer_autenticado on public.curas_registro
    for select to authenticated using (private.mi_rol() is not null);

-- Lesiones: todo el equipo asistencial, solo con el episodio activo.
-- Crear exige que el autor sea la propia sesión.
drop policy if exists crear_lesion on public.curas_lesiones;
create policy crear_lesion on public.curas_lesiones for insert to authenticated
    with check (
        private.mi_rol() in ('medico', 'enfermeria', 'auxiliar', 'tecnico')
        and registrado_por_id = (select id from public.profesionales where user_id = auth.uid() limit 1)
        and exists (select 1 from public.ingresos i where i.id = curas_lesiones.ingreso_id and i.estado = 'activo')
    );
drop policy if exists editar_lesion on public.curas_lesiones;
create policy editar_lesion on public.curas_lesiones for update to authenticated
    using (
        private.mi_rol() in ('medico', 'enfermeria', 'auxiliar', 'tecnico')
        and exists (select 1 from public.ingresos i where i.id = curas_lesiones.ingreso_id and i.estado = 'activo')
    )
    with check (
        private.mi_rol() in ('medico', 'enfermeria', 'auxiliar', 'tecnico')
        and exists (select 1 from public.ingresos i where i.id = curas_lesiones.ingreso_id and i.estado = 'activo')
    );
-- Borrar (p. ej. una lesión creada por error): su autor o un administrador.
drop policy if exists borrar_lesion on public.curas_lesiones;
create policy borrar_lesion on public.curas_lesiones for delete to authenticated
    using (
        private.mi_rol() in ('medico', 'enfermeria', 'auxiliar', 'tecnico')
        and exists (select 1 from public.ingresos i where i.id = curas_lesiones.ingreso_id and i.estado = 'activo')
        and (registrado_por_id = (select id from public.profesionales where user_id = auth.uid() limit 1) or private.soy_admin())
    );

-- Valoraciones: mismas reglas, pasando por la lesión.
drop policy if exists crear_valoracion on public.curas_valoraciones;
create policy crear_valoracion on public.curas_valoraciones for insert to authenticated
    with check (
        private.mi_rol() in ('medico', 'enfermeria', 'auxiliar', 'tecnico')
        and registrado_por_id = (select id from public.profesionales where user_id = auth.uid() limit 1)
        and exists (
            select 1 from public.curas_lesiones l join public.ingresos i on i.id = l.ingreso_id
            where l.id = curas_valoraciones.lesion_id and i.estado = 'activo'
        )
    );
drop policy if exists editar_valoracion on public.curas_valoraciones;
create policy editar_valoracion on public.curas_valoraciones for update to authenticated
    using (
        private.mi_rol() in ('medico', 'enfermeria', 'auxiliar', 'tecnico')
        and exists (
            select 1 from public.curas_lesiones l join public.ingresos i on i.id = l.ingreso_id
            where l.id = curas_valoraciones.lesion_id and i.estado = 'activo'
        )
    )
    with check (
        private.mi_rol() in ('medico', 'enfermeria', 'auxiliar', 'tecnico')
        and exists (
            select 1 from public.curas_lesiones l join public.ingresos i on i.id = l.ingreso_id
            where l.id = curas_valoraciones.lesion_id and i.estado = 'activo'
        )
    );
drop policy if exists borrar_valoracion on public.curas_valoraciones;
create policy borrar_valoracion on public.curas_valoraciones for delete to authenticated
    using (
        private.mi_rol() in ('medico', 'enfermeria', 'auxiliar', 'tecnico')
        and exists (
            select 1 from public.curas_lesiones l join public.ingresos i on i.id = l.ingreso_id
            where l.id = curas_valoraciones.lesion_id and i.estado = 'activo'
        )
        and (registrado_por_id = (select id from public.profesionales where user_id = auth.uid() limit 1) or private.soy_admin())
    );

-- Registro semanal: marcar la cura de hoy o de un día pasado (nunca
-- futuro), solo con episodio activo. Desmarcar: quien la marcó o admin.
drop policy if exists crear_registro_cura on public.curas_registro;
create policy crear_registro_cura on public.curas_registro for insert to authenticated
    with check (
        private.mi_rol() in ('medico', 'enfermeria', 'auxiliar', 'tecnico')
        and realizada_por_id = (select id from public.profesionales where user_id = auth.uid() limit 1)
        and fecha <= private.hoy_madrid()
        and exists (select 1 from public.ingresos i where i.id = curas_registro.ingreso_id and i.estado = 'activo')
    );
drop policy if exists borrar_registro_cura on public.curas_registro;
create policy borrar_registro_cura on public.curas_registro for delete to authenticated
    using (
        private.mi_rol() in ('medico', 'enfermeria', 'auxiliar', 'tecnico')
        and exists (select 1 from public.ingresos i where i.id = curas_registro.ingreso_id and i.estado = 'activo')
        and (realizada_por_id = (select id from public.profesionales where user_id = auth.uid() limit 1) or private.soy_admin())
    );
-- (curas_registro no tiene política de UPDATE: no se edita, se marca o se desmarca.)

commit;
