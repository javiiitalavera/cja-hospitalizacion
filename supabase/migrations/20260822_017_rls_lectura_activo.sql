-- ============================================================
-- Cierre del hueco de lectura en el candado (RLS)
--
-- Hasta ahora, "leer_autenticado" dejaba leer a CUALQUIER cuenta de
-- Supabase Auth válida, exista o no una ficha de profesional enlazada
-- a ella (using (true)). Se corrige exigiendo un profesional activo.
--
-- Depende de la migración "016_private_rls_helpers": usa
-- private.mi_rol(), que ya comprueba activo = true. No se toca
-- ni se recrea esa función aquí, solo se usa.
--
-- Re-ejecutable sin dar error.
-- ============================================================

begin;

drop policy if exists leer_autenticado on profesionales;
drop policy if exists leer_autenticado on pacientes;
drop policy if exists leer_autenticado on ingresos;
drop policy if exists leer_autenticado on informe_ingreso;
drop policy if exists leer_autenticado on informe_alta;
drop policy if exists leer_autenticado on cmbd;
drop policy if exists leer_autenticado on items_paciente;
drop policy if exists leer_autenticado on eventos;
drop policy if exists leer_autenticado on items_historico;

create policy leer_autenticado on profesionales   for select to authenticated using (private.mi_rol() is not null);
create policy leer_autenticado on pacientes       for select to authenticated using (private.mi_rol() is not null);
create policy leer_autenticado on ingresos        for select to authenticated using (private.mi_rol() is not null);
create policy leer_autenticado on informe_ingreso for select to authenticated using (private.mi_rol() is not null);
create policy leer_autenticado on informe_alta    for select to authenticated using (private.mi_rol() is not null);
create policy leer_autenticado on cmbd            for select to authenticated using (private.mi_rol() is not null);
create policy leer_autenticado on items_paciente  for select to authenticated using (private.mi_rol() is not null);
create policy leer_autenticado on eventos         for select to authenticated using (private.mi_rol() is not null);
create policy leer_autenticado on items_historico for select to authenticated using (private.mi_rol() is not null);

commit;
