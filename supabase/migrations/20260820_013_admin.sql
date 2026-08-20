-- ============================================================
-- Rol de administrador: gestiona el personal (crear cuentas,
-- cambiar roles, dar de baja). Es independiente del rol clínico:
-- un administrador puede ser además médico, enfermería, etc.
--
-- Re-ejecutable sin dar error.
-- ============================================================

begin;

-- ── Marca de administrador en la ficha de profesional ───────
alter table profesionales
  add column if not exists es_admin boolean not null default false;

-- ── Primer administrador (arranque) ─────────────────────────
-- Debe existir al menos uno para poder gestionar el resto.
update profesionales
set es_admin = true
where nombre = 'Javier' and apellidos = 'González';

-- ── Helper: ¿el usuario actual es administrador? ────────────
-- SECURITY DEFINER para leer la tabla sin disparar su propio
-- candado (evita el bucle infinito en las políticas).
create or replace function public.soy_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(
    (select es_admin from public.profesionales where user_id = auth.uid() limit 1),
    false
  );
$$;

grant execute on function public.soy_admin() to authenticated;

-- ── Candado de la tabla de profesionales: solo administradores ──
-- Sustituye la regla anterior (que permitía a cualquier médico).
-- La lectura sigue abierta a todo el personal (política leer_autenticado).
drop policy if exists escribir_medico on profesionales;
drop policy if exists escribir_admin on profesionales;

create policy escribir_admin on profesionales for all to authenticated
  using      (soy_admin())
  with check (soy_admin());

commit;
