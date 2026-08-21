-- ============================================================
-- Auditoría de cambios
--
-- Registra automáticamente quién crea, edita o borra en las tablas
-- clínicas sensibles, y cuándo. Se hace con un disparador (trigger)
-- en la base de datos, así que captura TODO cambio venga de donde
-- venga y no se puede saltar desde la app.
--
-- Guarda: tabla, id del registro, acción, quién y cuándo. (No guarda
-- el contenido completo antes/después para mantenerlo ligero; se puede
-- ampliar más adelante si se quiere ver el detalle de qué cambió.)
--
-- Re-ejecutable sin dar error.
-- ============================================================

begin;

-- ── Tabla de auditoría ──────────────────────────────────────
create table if not exists auditoria (
  id          bigserial primary key,
  tabla       text not null,
  registro_id uuid,
  accion      text not null,               -- INSERT / UPDATE / DELETE
  usuario_id  uuid,                         -- quién lo hizo (null si fue el sistema)
  fecha       timestamptz not null default now()
);

create index if not exists auditoria_fecha_idx on auditoria(fecha desc);
create index if not exists auditoria_tabla_registro_idx on auditoria(tabla, registro_id);

-- ── Función del disparador ──────────────────────────────────
-- SECURITY DEFINER para poder escribir en auditoria saltándose su
-- propio candado (nadie puede escribir la auditoría a mano, solo esto).
create or replace function registrar_auditoria()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_registro_id uuid;
begin
  if (TG_OP = 'DELETE') then
    v_registro_id := OLD.id;
  else
    v_registro_id := NEW.id;
  end if;

  insert into auditoria (tabla, registro_id, accion, usuario_id)
  values (TG_TABLE_NAME, v_registro_id, TG_OP, auth.uid());

  if (TG_OP = 'DELETE') then
    return OLD;
  end if;
  return NEW;
end;
$$;

-- ── Aplicar el disparador a las tablas sensibles ────────────
drop trigger if exists aud_pacientes       on pacientes;
drop trigger if exists aud_ingresos        on ingresos;
drop trigger if exists aud_informe_ingreso on informe_ingreso;
drop trigger if exists aud_informe_alta    on informe_alta;
drop trigger if exists aud_cmbd            on cmbd;
drop trigger if exists aud_profesionales   on profesionales;

create trigger aud_pacientes       after insert or update or delete on pacientes       for each row execute function registrar_auditoria();
create trigger aud_ingresos        after insert or update or delete on ingresos        for each row execute function registrar_auditoria();
create trigger aud_informe_ingreso after insert or update or delete on informe_ingreso for each row execute function registrar_auditoria();
create trigger aud_informe_alta    after insert or update or delete on informe_alta    for each row execute function registrar_auditoria();
create trigger aud_cmbd            after insert or update or delete on cmbd            for each row execute function registrar_auditoria();
create trigger aud_profesionales   after insert or update or delete on profesionales   for each row execute function registrar_auditoria();

-- ── Candado de la tabla de auditoría ────────────────────────
-- Solo los administradores la LEEN; nadie la modifica a mano
-- (el disparador escribe saltándose el candado por ser SECURITY DEFINER).
alter table auditoria enable row level security;

-- A nivel de permisos: los usuarios solo pueden LEER (nunca escribir),
-- y encima RLS lo restringe a administradores. El disparador escribe
-- por su cuenta (SECURITY DEFINER), así que sigue funcionando.
revoke all on auditoria from anon, authenticated;
grant select on auditoria to authenticated;

drop policy if exists auditoria_leer_admin on auditoria;
create policy auditoria_leer_admin on auditoria for select to authenticated using (soy_admin());

commit;
