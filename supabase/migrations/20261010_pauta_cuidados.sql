-- CJA Hospital — Pauta de cuidados (2026-10-10)
--
-- Sustituye la columna "CUIDADOS" de las hojas de trabajo de mañana, tarde y
-- noche de las auxiliares (hoy en un Excel con los nombres escritos a mano):
--
--   1. pauta_cuidados: una fila por indicación de enfermería ("mantenerla
--      abrigada", "llevar en el primer turno de comidas", "paseo tarde con
--      andador"…), con los turnos en los que vale (mañana / tarde / noche).
--      Se escribe una sola vez y sale en las hojas de los turnos marcados.
--   2. pauta_via: si el paciente lleva vía venosa o subcutánea. Sin fila =
--      no lleva vía.
--
-- Permisos: leer cualquier profesional activo; escribir SOLO enfermería
-- (rol 'enfermeria') y solo mientras el episodio esté activo.
-- Auditoría genérica (quién y cuándo), como el resto de tablas asistenciales.
--
-- Transaccional e idempotente (se puede ejecutar más de una vez).

begin;

-- ────────────────────────────────────────────────────────────
-- TABLAS
-- ────────────────────────────────────────────────────────────

create table if not exists public.pauta_cuidados (
    id uuid primary key default gen_random_uuid(),
    ingreso_id uuid not null references public.ingresos(id) on delete cascade,
    texto text not null check (length(btrim(texto)) between 1 and 600),
    -- Turnos en los que aparece la indicación. Al menos uno.
    turnos text[] not null default array['manana', 'tarde', 'noche']
        check (turnos <@ array['manana', 'tarde', 'noche']::text[] and cardinality(turnos) >= 1),
    registrado_por_id uuid references public.profesionales(id),
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now()
);

create index if not exists pauta_cuidados_ingreso_idx on public.pauta_cuidados (ingreso_id, created_at);

create table if not exists public.pauta_via (
    id uuid primary key default gen_random_uuid(),
    ingreso_id uuid not null unique references public.ingresos(id) on delete cascade,
    via text not null check (via in ('venosa', 'subcutanea')),
    registrado_por_id uuid references public.profesionales(id),
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now()
);

-- ────────────────────────────────────────────────────────────
-- DISPARADORES
-- ────────────────────────────────────────────────────────────

-- Quién guarda queda registrado (se ignora lo que mande el cliente) y la
-- indicación no se puede pasar a otro ingreso. Una función sirve para las
-- dos tablas: solo usa campos que ambas tienen.
create or replace function public.preparar_pauta_cuidados() returns trigger
language plpgsql
set search_path = ''
as $$
declare
  yo uuid;
begin
  select p.id into yo from public.profesionales p where p.user_id = auth.uid() limit 1;
  if TG_OP = 'UPDATE' then
    if NEW.ingreso_id is distinct from OLD.ingreso_id then
      raise exception 'Una indicación no se puede pasar a otro ingreso.';
    end if;
    NEW.registrado_por_id := coalesce(yo, OLD.registrado_por_id);
  else
    NEW.registrado_por_id := yo;
  end if;
  return NEW;
end;
$$;

revoke execute on function public.preparar_pauta_cuidados() from public, anon, authenticated;

drop trigger if exists preparar on public.pauta_cuidados;
create trigger preparar before insert or update on public.pauta_cuidados
    for each row execute function public.preparar_pauta_cuidados();
drop trigger if exists preparar on public.pauta_via;
create trigger preparar before insert or update on public.pauta_via
    for each row execute function public.preparar_pauta_cuidados();

drop trigger if exists trg_pauta_cuidados_updated on public.pauta_cuidados;
create trigger trg_pauta_cuidados_updated before update on public.pauta_cuidados
    for each row execute function public.update_updated_at();
drop trigger if exists trg_pauta_via_updated on public.pauta_via;
create trigger trg_pauta_via_updated before update on public.pauta_via
    for each row execute function public.update_updated_at();

drop trigger if exists aud_pauta_cuidados on public.pauta_cuidados;
create trigger aud_pauta_cuidados
    after insert or update or delete on public.pauta_cuidados
    for each row execute function public.registrar_auditoria();
drop trigger if exists aud_pauta_via on public.pauta_via;
create trigger aud_pauta_via
    after insert or update or delete on public.pauta_via
    for each row execute function public.registrar_auditoria();

-- ────────────────────────────────────────────────────────────
-- PERMISOS (RLS)
-- ────────────────────────────────────────────────────────────

alter table public.pauta_cuidados enable row level security;
alter table public.pauta_via enable row level security;

revoke all on public.pauta_cuidados, public.pauta_via from public, anon;
grant select, insert, update, delete on public.pauta_cuidados, public.pauta_via to authenticated;

drop policy if exists leer_autenticado on public.pauta_cuidados;
create policy leer_autenticado on public.pauta_cuidados
    for select to authenticated using (private.mi_rol() is not null);
drop policy if exists leer_autenticado on public.pauta_via;
create policy leer_autenticado on public.pauta_via
    for select to authenticated using (private.mi_rol() is not null);

-- Solo enfermería, y solo con el episodio activo.
drop policy if exists crear_enfermeria on public.pauta_cuidados;
create policy crear_enfermeria on public.pauta_cuidados for insert to authenticated
    with check (
        private.mi_rol() = 'enfermeria'
        and exists (select 1 from public.ingresos i where i.id = pauta_cuidados.ingreso_id and i.estado = 'activo')
    );
drop policy if exists editar_enfermeria on public.pauta_cuidados;
create policy editar_enfermeria on public.pauta_cuidados for update to authenticated
    using (
        private.mi_rol() = 'enfermeria'
        and exists (select 1 from public.ingresos i where i.id = pauta_cuidados.ingreso_id and i.estado = 'activo')
    )
    with check (
        private.mi_rol() = 'enfermeria'
        and exists (select 1 from public.ingresos i where i.id = pauta_cuidados.ingreso_id and i.estado = 'activo')
    );
drop policy if exists borrar_enfermeria on public.pauta_cuidados;
create policy borrar_enfermeria on public.pauta_cuidados for delete to authenticated
    using (
        private.mi_rol() = 'enfermeria'
        and exists (select 1 from public.ingresos i where i.id = pauta_cuidados.ingreso_id and i.estado = 'activo')
    );

drop policy if exists crear_enfermeria on public.pauta_via;
create policy crear_enfermeria on public.pauta_via for insert to authenticated
    with check (
        private.mi_rol() = 'enfermeria'
        and exists (select 1 from public.ingresos i where i.id = pauta_via.ingreso_id and i.estado = 'activo')
    );
drop policy if exists editar_enfermeria on public.pauta_via;
create policy editar_enfermeria on public.pauta_via for update to authenticated
    using (
        private.mi_rol() = 'enfermeria'
        and exists (select 1 from public.ingresos i where i.id = pauta_via.ingreso_id and i.estado = 'activo')
    )
    with check (
        private.mi_rol() = 'enfermeria'
        and exists (select 1 from public.ingresos i where i.id = pauta_via.ingreso_id and i.estado = 'activo')
    );
drop policy if exists borrar_enfermeria on public.pauta_via;
create policy borrar_enfermeria on public.pauta_via for delete to authenticated
    using (
        private.mi_rol() = 'enfermeria'
        and exists (select 1 from public.ingresos i where i.id = pauta_via.ingreso_id and i.estado = 'activo')
    );

commit;
