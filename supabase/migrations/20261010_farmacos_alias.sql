-- CJA Hospital — Marcas de fármacos que la app aprende (2026-10-10)
--
-- El catálogo de fármacos de la app (src/lib/farmacos_atc.txt) no puede traer todas las marcas
-- comerciales. Cuando alguien escribe una que no se reconoce (p. ej. «Ketyalix»), en la pestaña de
-- medicación aparece «asignar principio activo»: se elige «quetiapina» y la app guarda aquí la
-- equivalencia «ketyalix → N05AH04» para que, a partir de ese momento, la reconozca todo el mundo.
--
-- Permisos: leer cualquier profesional activo; escribir médicos y administración.
-- Auditoría genérica (quién y cuándo). Transaccional e idempotente.

begin;

create table if not exists public.farmacos_alias (
    id uuid primary key default gen_random_uuid(),
    -- Lo que se escribe, en minúsculas y sin tildes ni dosis («ketyalix»).
    clave text not null unique check (clave = lower(btrim(clave)) and length(clave) between 3 and 80),
    -- Código ATC del principio activo (tiene que existir en el catálogo de la app).
    atc text not null check (atc ~ '^[A-Z][0-9]{2}([A-Z]{1,2}([0-9]{2})?)?$'),
    registrado_por_id uuid references public.profesionales(id),
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now()
);

create or replace function public.preparar_farmacos_alias() returns trigger
language plpgsql
set search_path = ''
as $$
declare
  yo uuid;
begin
  select p.id into yo from public.profesionales p where p.user_id = auth.uid() limit 1;
  NEW.registrado_por_id := coalesce(yo, case when TG_OP = 'UPDATE' then OLD.registrado_por_id end);
  return NEW;
end;
$$;

revoke execute on function public.preparar_farmacos_alias() from public, anon, authenticated;

drop trigger if exists preparar on public.farmacos_alias;
create trigger preparar before insert or update on public.farmacos_alias
    for each row execute function public.preparar_farmacos_alias();

drop trigger if exists trg_farmacos_alias_updated on public.farmacos_alias;
create trigger trg_farmacos_alias_updated before update on public.farmacos_alias
    for each row execute function public.update_updated_at();

drop trigger if exists aud_farmacos_alias on public.farmacos_alias;
create trigger aud_farmacos_alias
    after insert or update or delete on public.farmacos_alias
    for each row execute function public.registrar_auditoria();

alter table public.farmacos_alias enable row level security;

revoke all on public.farmacos_alias from public, anon;
grant select, insert, update, delete on public.farmacos_alias to authenticated;

drop policy if exists leer_autenticado on public.farmacos_alias;
create policy leer_autenticado on public.farmacos_alias
    for select to authenticated using (private.mi_rol() is not null);

drop policy if exists escribir_medico on public.farmacos_alias;
create policy escribir_medico on public.farmacos_alias for all to authenticated
    using (private.tengo_rol('medico')) with check (private.tengo_rol('medico'));

commit;
