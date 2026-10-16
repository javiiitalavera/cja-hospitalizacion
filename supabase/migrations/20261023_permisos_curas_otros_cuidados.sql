-- CJA Hospital — Permisos: Curas y piel / Otros cuidados y Hojas de turno (2026-10-23)
--
-- Curas y piel (lesiones, evoluciones y marcas de cura): escriben médicos y enfermería (y la administración).
--   Auxiliares y técnicos pasan a solo lectura. Antes escribía todo el equipo asistencial.
-- Otros cuidados y Hojas de turno (indicaciones para las auxiliares, pauta_cuidados y pauta_via): escriben médicos,
--   enfermería y técnicos (y la administración). Las auxiliares, que son quienes las leen, no escriben.
--   Antes escribía solo enfermería.
-- Borrar sigue siendo del autor o de un administrador, como hasta ahora.
--
-- Transaccional e idempotente.

begin;

create or replace function private.puede_curar() returns boolean
language sql stable
set search_path to ''
as $$
  select private.tengo_rol('medico') or private.tengo_rol('enfermeria');
$$;

create or replace function private.puede_indicar_cuidados() returns boolean
language sql stable
set search_path to ''
as $$
  select private.puede_curar() or coalesce(private.mi_rol() = 'tecnico', false);
$$;

revoke execute on function private.puede_curar() from public, anon;
revoke execute on function private.puede_indicar_cuidados() from public, anon;
grant execute on function private.puede_curar() to authenticated;
grant execute on function private.puede_indicar_cuidados() to authenticated;

-- ── Curas y piel ──────────────────────────────────────────────
-- Lesiones: médicos y enfermería (y administración), solo con el episodio activo.
-- Crear exige que el autor sea la propia sesión.
drop policy if exists crear_lesion on public.curas_lesiones;
create policy crear_lesion on public.curas_lesiones for insert to authenticated
    with check (
        private.puede_curar()
        and registrado_por_id = (select id from public.profesionales where user_id = auth.uid() limit 1)
        and exists (select 1 from public.ingresos i where i.id = curas_lesiones.ingreso_id and i.estado = 'activo')
    );
drop policy if exists editar_lesion on public.curas_lesiones;
create policy editar_lesion on public.curas_lesiones for update to authenticated
    using (
        private.puede_curar()
        and exists (select 1 from public.ingresos i where i.id = curas_lesiones.ingreso_id and i.estado = 'activo')
    )
    with check (
        private.puede_curar()
        and exists (select 1 from public.ingresos i where i.id = curas_lesiones.ingreso_id and i.estado = 'activo')
    );
-- Borrar (p. ej. una lesión creada por error): su autor o un administrador.
drop policy if exists borrar_lesion on public.curas_lesiones;
create policy borrar_lesion on public.curas_lesiones for delete to authenticated
    using (
        private.puede_curar()
        and exists (select 1 from public.ingresos i where i.id = curas_lesiones.ingreso_id and i.estado = 'activo')
        and (registrado_por_id = (select id from public.profesionales where user_id = auth.uid() limit 1) or private.soy_admin())
    );

-- Valoraciones: mismas reglas, pasando por la lesión.
drop policy if exists crear_valoracion on public.curas_valoraciones;
create policy crear_valoracion on public.curas_valoraciones for insert to authenticated
    with check (
        private.puede_curar()
        and registrado_por_id = (select id from public.profesionales where user_id = auth.uid() limit 1)
        and exists (
            select 1 from public.curas_lesiones l join public.ingresos i on i.id = l.ingreso_id
            where l.id = curas_valoraciones.lesion_id and i.estado = 'activo'
        )
    );
drop policy if exists editar_valoracion on public.curas_valoraciones;
create policy editar_valoracion on public.curas_valoraciones for update to authenticated
    using (
        private.puede_curar()
        and exists (
            select 1 from public.curas_lesiones l join public.ingresos i on i.id = l.ingreso_id
            where l.id = curas_valoraciones.lesion_id and i.estado = 'activo'
        )
    )
    with check (
        private.puede_curar()
        and exists (
            select 1 from public.curas_lesiones l join public.ingresos i on i.id = l.ingreso_id
            where l.id = curas_valoraciones.lesion_id and i.estado = 'activo'
        )
    );
drop policy if exists borrar_valoracion on public.curas_valoraciones;
create policy borrar_valoracion on public.curas_valoraciones for delete to authenticated
    using (
        private.puede_curar()
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
        private.puede_curar()
        and realizada_por_id = (select id from public.profesionales where user_id = auth.uid() limit 1)
        and fecha <= private.hoy_madrid()
        and exists (select 1 from public.ingresos i where i.id = curas_registro.ingreso_id and i.estado = 'activo')
    );
drop policy if exists borrar_registro_cura on public.curas_registro;
create policy borrar_registro_cura on public.curas_registro for delete to authenticated
    using (
        private.puede_curar()
        and exists (select 1 from public.ingresos i where i.id = curas_registro.ingreso_id and i.estado = 'activo')
        and (realizada_por_id = (select id from public.profesionales where user_id = auth.uid() limit 1) or private.soy_admin())
    );
-- (curas_registro no tiene política de UPDATE: no se edita, se marca o se desmarca.)

-- ── Otros cuidados y Hojas de turno ───────────────────────────
-- Las políticas con el nombre antiguo (…_enfermeria) se retiran y se crean otras con el nombre nuevo.
drop policy if exists crear_enfermeria on public.pauta_cuidados;
drop policy if exists editar_enfermeria on public.pauta_cuidados;
drop policy if exists borrar_enfermeria on public.pauta_cuidados;
drop policy if exists crear_enfermeria on public.pauta_via;
drop policy if exists editar_enfermeria on public.pauta_via;
drop policy if exists borrar_enfermeria on public.pauta_via;

-- Médicos, enfermería y técnicos (y administración), solo con el episodio activo.
drop policy if exists crear_indicacion on public.pauta_cuidados;
create policy crear_indicacion on public.pauta_cuidados for insert to authenticated
    with check (
        private.puede_indicar_cuidados()
        and exists (select 1 from public.ingresos i where i.id = pauta_cuidados.ingreso_id and i.estado = 'activo')
    );
drop policy if exists editar_indicacion on public.pauta_cuidados;
create policy editar_indicacion on public.pauta_cuidados for update to authenticated
    using (
        private.puede_indicar_cuidados()
        and exists (select 1 from public.ingresos i where i.id = pauta_cuidados.ingreso_id and i.estado = 'activo')
    )
    with check (
        private.puede_indicar_cuidados()
        and exists (select 1 from public.ingresos i where i.id = pauta_cuidados.ingreso_id and i.estado = 'activo')
    );
drop policy if exists borrar_indicacion on public.pauta_cuidados;
create policy borrar_indicacion on public.pauta_cuidados for delete to authenticated
    using (
        private.puede_indicar_cuidados()
        and exists (select 1 from public.ingresos i where i.id = pauta_cuidados.ingreso_id and i.estado = 'activo')
    );

drop policy if exists crear_indicacion on public.pauta_via;
create policy crear_indicacion on public.pauta_via for insert to authenticated
    with check (
        private.puede_indicar_cuidados()
        and exists (select 1 from public.ingresos i where i.id = pauta_via.ingreso_id and i.estado = 'activo')
    );
drop policy if exists editar_indicacion on public.pauta_via;
create policy editar_indicacion on public.pauta_via for update to authenticated
    using (
        private.puede_indicar_cuidados()
        and exists (select 1 from public.ingresos i where i.id = pauta_via.ingreso_id and i.estado = 'activo')
    )
    with check (
        private.puede_indicar_cuidados()
        and exists (select 1 from public.ingresos i where i.id = pauta_via.ingreso_id and i.estado = 'activo')
    );
drop policy if exists borrar_indicacion on public.pauta_via;
create policy borrar_indicacion on public.pauta_via for delete to authenticated
    using (
        private.puede_indicar_cuidados()
        and exists (select 1 from public.ingresos i where i.id = pauta_via.ingreso_id and i.estado = 'activo')
    );


commit;
