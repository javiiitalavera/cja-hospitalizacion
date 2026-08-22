-- ============================================================
-- La unidad tiene 33 habitaciones, no 32
--
-- La restricción original limitaba a 32; se corrige a 33.
-- Re-ejecutable sin dar error.
-- ============================================================

begin;

-- Buscamos el nombre real de la restricción en vez de suponerlo (los
-- nombres autogenerados por Postgres no siempre siguen el patrón
-- "tabla_columna_check" si la columna se creó o modificó de otra forma).
do $$
declare
  nombre_restriccion text;
begin
  select con.conname into nombre_restriccion
  from pg_constraint con
  join pg_class rel on rel.oid = con.conrelid
  where rel.relname = 'ingresos'
    and con.contype = 'c'
    and pg_get_constraintdef(con.oid) ilike '%habitacion%';

  if nombre_restriccion is not null then
    execute format('alter table ingresos drop constraint %I', nombre_restriccion);
  end if;
end $$;

alter table ingresos add constraint ingresos_habitacion_check
  check (habitacion >= 1 and habitacion <= 33);

commit;
