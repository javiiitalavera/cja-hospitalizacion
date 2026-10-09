-- CJA Hospital — Informe de enfermería (2026-10-09)
--
-- "Continuidad de cuidados de enfermería": un único informe por ingreso,
-- con campos fijos agrupados (oxigenación, alimentación, continencia,
-- movilización, sueño, contenciones, piel, higiene, técnicas…).
--
--   * Solo enfermería (rol 'enfermeria') lo crea y lo edita. Todo el equipo
--     lo lee y lo puede exportar a Word.
--   * Se puede redactar con el episodio activo o ya cerrado (igual que los
--     informes de ingreso y de alta: se termina en torno al alta).
--   * "elaborado_por_id" lo rellena la propia base de datos con quien
--     guardó por última vez (no se puede falsificar desde el cliente);
--     es quien firma el Word.
--   * Control de versiones (dos personas guardando a la vez) y auditoría
--     genérica, como el resto de informes. Sin borrado.
--
-- Requiere haber ejecutado antes 20261008_informes_puntuales.sql (usa su
-- función private.campos_informe_validos). Transaccional e idempotente.

begin;

create table if not exists public.informe_enfermeria (
    id uuid primary key default gen_random_uuid(),
    ingreso_id uuid not null unique references public.ingresos(id) on delete cascade,
    campos jsonb not null default '{}'::jsonb check (private.campos_informe_validos(campos)),
    version integer not null default 1,
    elaborado_por_id uuid references public.profesionales(id),
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now()
);

-- ────────────────────────────────────────────────────────────
-- DISPARADORES
-- ────────────────────────────────────────────────────────────

-- Quién guarda es quien firma: se ignora lo que mande el cliente. El
-- ingreso al que pertenece el informe no se puede cambiar.
create or replace function public.preparar_informe_enfermeria() returns trigger
language plpgsql
set search_path = ''
as $$
declare
  yo uuid;
begin
  select p.id into yo from public.profesionales p where p.user_id = auth.uid() limit 1;
  if TG_OP = 'UPDATE' then
    if NEW.ingreso_id is distinct from OLD.ingreso_id or NEW.created_at is distinct from OLD.created_at then
      raise exception 'Este dato del informe no se puede cambiar una vez creado.';
    end if;
    NEW.elaborado_por_id := coalesce(yo, OLD.elaborado_por_id);
  else
    NEW.elaborado_por_id := yo;
  end if;
  return NEW;
end;
$$;

revoke execute on function public.preparar_informe_enfermeria() from public, anon, authenticated;

drop trigger if exists preparar on public.informe_enfermeria;
create trigger preparar before insert or update on public.informe_enfermeria
    for each row execute function public.preparar_informe_enfermeria();

drop trigger if exists trg_informe_enfermeria_updated on public.informe_enfermeria;
create trigger trg_informe_enfermeria_updated before update on public.informe_enfermeria
    for each row execute function public.update_updated_at();

drop trigger if exists incrementar_version on public.informe_enfermeria;
create trigger incrementar_version before insert or update on public.informe_enfermeria
    for each row execute function public.incrementar_version_generico();

drop trigger if exists aud_informe_enfermeria on public.informe_enfermeria;
create trigger aud_informe_enfermeria
    after insert or update or delete on public.informe_enfermeria
    for each row execute function public.registrar_auditoria();

-- ────────────────────────────────────────────────────────────
-- PERMISOS (RLS)
-- ────────────────────────────────────────────────────────────

alter table public.informe_enfermeria enable row level security;

revoke all on public.informe_enfermeria from public, anon;
grant select, insert, update on public.informe_enfermeria to authenticated;

drop policy if exists leer_autenticado on public.informe_enfermeria;
create policy leer_autenticado on public.informe_enfermeria
    for select to authenticated using (private.mi_rol() is not null);

drop policy if exists crear_enfermeria on public.informe_enfermeria;
create policy crear_enfermeria on public.informe_enfermeria for insert to authenticated
    with check (private.mi_rol() = 'enfermeria');

drop policy if exists editar_enfermeria on public.informe_enfermeria;
create policy editar_enfermeria on public.informe_enfermeria for update to authenticated
    using (private.mi_rol() = 'enfermeria') with check (private.mi_rol() = 'enfermeria');

commit;
