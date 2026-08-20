-- ============================================================
-- Enlace entre cuentas de acceso (Supabase Auth) y profesionales
-- Hito A: autenticación. NO activa RLS todavía (eso es el Hito B).
-- ============================================================

-- Cada profesional podrá tener una cuenta de acceso enlazada.
-- on delete set null: si se borra la cuenta, la ficha del profesional
-- se conserva (solo pierde el enlace).
alter table profesionales
  add column if not exists user_id uuid unique references auth.users(id) on delete set null;

-- Índice para resolver rápido "¿qué profesional es esta cuenta?"
create index if not exists profesionales_user_id_idx on profesionales(user_id);

-- ── Cómo enlazar una cuenta con su profesional ──────────────
-- 1) Crea la cuenta en Supabase → Authentication → Users → Add user
--    (correo + contraseña). Copia su UID.
-- 2) Enlázala a la ficha correspondiente, por ejemplo:
--
--    update profesionales
--    set user_id = 'UID-DE-LA-CUENTA'
--    where nombre = 'Javier' and apellidos = 'González Gómez';
--
-- Repite para cada profesional.
