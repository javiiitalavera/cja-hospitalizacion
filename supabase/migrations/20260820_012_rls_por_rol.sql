-- ============================================================
-- Hito B: RLS (Row Level Security) + permisos por rol
--
-- Modelo:
--   • LECTURA  → cualquier profesional autenticado ve todo.
--   • ESCRITURA→ según el rol de quien edita:
--       - Ítems e incidencias .......... médico, enfermería, auxiliar
--       - Informes, CMBD, pacientes,
--         ingresos y profesionales ..... solo médico
--   • items_historico → la app solo lo lee; lo escribe el proceso
--     nocturno, que corre con privilegios y se salta el candado.
--
-- Es re-ejecutable: se puede volver a lanzar sin dar error.
-- ============================================================

begin;

-- ── Helper: rol del usuario que hace la petición ────────────
-- SECURITY DEFINER es importante: hace que la función lea la tabla
-- de profesionales saltándose el propio candado, lo que evita un
-- bucle infinito al comprobar las políticas de esa misma tabla.
create or replace function public.mi_rol()
returns text
language sql
stable
security definer
set search_path = public
as $$
  select rol from public.profesionales where user_id = auth.uid() limit 1;
$$;

grant execute on function public.mi_rol() to authenticated;

-- ── Activar el candado en las 9 tablas ──────────────────────
alter table profesionales   enable row level security;
alter table pacientes       enable row level security;
alter table ingresos        enable row level security;
alter table informe_ingreso enable row level security;
alter table informe_alta    enable row level security;
alter table cmbd            enable row level security;
alter table items_paciente  enable row level security;
alter table eventos         enable row level security;
alter table items_historico enable row level security;

-- ── LECTURA: todo profesional autenticado ve todo ───────────
drop policy if exists leer_autenticado on profesionales;
drop policy if exists leer_autenticado on pacientes;
drop policy if exists leer_autenticado on ingresos;
drop policy if exists leer_autenticado on informe_ingreso;
drop policy if exists leer_autenticado on informe_alta;
drop policy if exists leer_autenticado on cmbd;
drop policy if exists leer_autenticado on items_paciente;
drop policy if exists leer_autenticado on eventos;
drop policy if exists leer_autenticado on items_historico;

create policy leer_autenticado on profesionales   for select to authenticated using (true);
create policy leer_autenticado on pacientes        for select to authenticated using (true);
create policy leer_autenticado on ingresos         for select to authenticated using (true);
create policy leer_autenticado on informe_ingreso  for select to authenticated using (true);
create policy leer_autenticado on informe_alta     for select to authenticated using (true);
create policy leer_autenticado on cmbd             for select to authenticated using (true);
create policy leer_autenticado on items_paciente   for select to authenticated using (true);
create policy leer_autenticado on eventos          for select to authenticated using (true);
create policy leer_autenticado on items_historico  for select to authenticated using (true);

-- ── ESCRITURA solo médicos ──────────────────────────────────
-- (informes, CMBD, pacientes, ingresos y fichas de profesionales)
drop policy if exists escribir_medico on profesionales;
drop policy if exists escribir_medico on pacientes;
drop policy if exists escribir_medico on ingresos;
drop policy if exists escribir_medico on informe_ingreso;
drop policy if exists escribir_medico on informe_alta;
drop policy if exists escribir_medico on cmbd;

create policy escribir_medico on profesionales   for all to authenticated using (mi_rol() = 'medico') with check (mi_rol() = 'medico');
create policy escribir_medico on pacientes       for all to authenticated using (mi_rol() = 'medico') with check (mi_rol() = 'medico');
create policy escribir_medico on ingresos        for all to authenticated using (mi_rol() = 'medico') with check (mi_rol() = 'medico');
create policy escribir_medico on informe_ingreso for all to authenticated using (mi_rol() = 'medico') with check (mi_rol() = 'medico');
create policy escribir_medico on informe_alta    for all to authenticated using (mi_rol() = 'medico') with check (mi_rol() = 'medico');
create policy escribir_medico on cmbd            for all to authenticated using (mi_rol() = 'medico') with check (mi_rol() = 'medico');

-- ── ESCRITURA equipo (médico, enfermería, auxiliar) ─────────
-- (hoja de ítems e incidencias: el trabajo del día a día)
drop policy if exists escribir_equipo on items_paciente;
drop policy if exists escribir_equipo on eventos;

create policy escribir_equipo on items_paciente for all to authenticated
  using      (mi_rol() in ('medico','enfermeria','auxiliar'))
  with check (mi_rol() in ('medico','enfermeria','auxiliar'));
create policy escribir_equipo on eventos for all to authenticated
  using      (mi_rol() in ('medico','enfermeria','auxiliar'))
  with check (mi_rol() in ('medico','enfermeria','auxiliar'));

-- items_historico: sin política de escritura a propósito.
-- La app no escribe ahí; el snapshot nocturno se salta el candado.

commit;
