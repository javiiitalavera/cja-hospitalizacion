-- ============================================================
-- CRÍTICO: la vista pacientes_con_ultimo_ingreso se saltaba el RLS
--
-- Una vista normal en PostgreSQL se ejecuta con los permisos de quien
-- la creó (en Supabase, el propietario de las tablas, que como dueño
-- se salta su propio RLS), no con los del usuario que consulta.
-- Confirmado por prueba directa: sin este ajuste, la vista devolvía
-- filas que la tabla, con el mismo usuario, correctamente rechazaba.
--
-- security_invoker = true hace que la vista ejecute con los permisos
-- de quien consulta, heredando el RLS real de las tablas base.
--
-- Re-ejecutable sin dar error.
-- ============================================================

begin;

alter view pacientes_con_ultimo_ingreso set (security_invoker = true);

commit;
