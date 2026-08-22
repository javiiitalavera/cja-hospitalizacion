-- ============================================================
-- Helpers internos de RLS fuera del esquema público
--
-- mi_rol() y soy_admin() son funciones SECURITY DEFINER usadas
-- exclusivamente por las políticas RLS. Se mueven a un esquema
-- no expuesto por la Data API y se restringe su ejecución.
--
-- Esta migración es compatible tanto con:
--   • una BD nueva, donde las funciones aún están en public, como
--   • la BD actual, donde ya se movieron manualmente a private.
-- ============================================================

begin;

-- ── Esquema interno ─────────────────────────────────────────
create schema if not exists private;

revoke all on schema private from public, anon;
revoke create on schema private from authenticated;
grant usage on schema private to authenticated;

-- ── Mover las funciones solo si todavía están en public ─────
do $$
begin
  if to_regprocedure('public.mi_rol()') is not null
     and to_regprocedure('private.mi_rol()') is null then
    alter function public.mi_rol() set schema private;
  end if;

  if to_regprocedure('public.soy_admin()') is not null
     and to_regprocedure('private.soy_admin()') is null then
    alter function public.soy_admin() set schema private;
  end if;
end
$$;

-- ── Definición endurecida de los helpers ────────────────────
-- Un profesional inactivo deja de conservar permisos aunque su
-- sesión de Auth siga existiendo durante unos instantes.
create or replace function private.mi_rol()
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select p.rol
  from public.profesionales as p
  where p.user_id = auth.uid()
    and p.activo = true
  limit 1;
$$;

create or replace function private.soy_admin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(
    (
      select p.es_admin
      from public.profesionales as p
      where p.user_id = auth.uid()
        and p.activo = true
      limit 1
    ),
    false
  );
$$;

-- ── Permisos ────────────────────────────────────────────────
revoke execute on function private.mi_rol() from public, anon;
revoke execute on function private.soy_admin() from public, anon;

grant execute on function private.mi_rol() to authenticated;
grant execute on function private.soy_admin() to authenticated;

commit;
