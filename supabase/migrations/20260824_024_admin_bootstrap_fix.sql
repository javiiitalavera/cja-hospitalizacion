-- ============================================================
-- Corrección: el arranque del primer administrador dependía de que
-- "apellidos" coincidiera EXACTAMENTE con 'González', pero la semilla
-- de la migración 001 usa 'González Gómez'. En una base de datos
-- nueva construida solo desde las migraciones, el UPDATE de la 013
-- no encontraría ninguna fila y no habría ningún administrador.
--
-- Esto no afecta a la base de datos real (donde "apellidos" ya es
-- exactamente 'González' y el arranque ya funcionó), pero se corrige
-- para que una instalación nueva sea reproducible.
--
-- Reejecutable sin dar error: si Javier ya es admin, no hace nada.
-- ============================================================

begin;

update profesionales
set es_admin = true
where nombre = 'Javier' and apellidos ilike 'González%';

commit;
