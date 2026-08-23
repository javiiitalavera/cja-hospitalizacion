-- ============================================================
-- Tres correcciones a la base de datos real:
--
-- 1. La fecha de alta ya no puede ser anterior a la de ingreso.
-- 2. El histórico diario de ítems empieza a guardar también la
--    habitación de ese momento (los días ya capturados no se pueden
--    corregir con carácter retroactivo: ese dato nunca se guardó).
-- 3. Se retira 'administrativo' del rol permitido — nunca se usa en
--    la práctica (el rol "técnico" ya cubre a fisios, terapeutas,
--    psicólogos y trabajo social), y así vuelve a coincidir con el
--    tipo Rol de la aplicación.
--
-- Re-ejecutable sin dar error.
-- ============================================================

-- 1. Fecha de alta válida
begin;
alter table public.ingresos drop constraint if exists ingresos_fecha_alta_valida;
alter table public.ingresos add constraint ingresos_fecha_alta_valida
  check (fecha_alta is null or fecha_alta >= fecha_ingreso);
commit;

-- 2. Habitación capturada en cada foto diaria
begin;
create or replace function public.generar_snapshot_items() returns void
language plpgsql
as $$
begin
  insert into items_historico (ingreso_id, fecha, datos)
  select
    ip.ingreso_id,
    current_date,
    row_to_json(ip)::jsonb || jsonb_build_object('_habitacion_snapshot', i.habitacion)
  from items_paciente ip
  inner join ingresos i on i.id = ip.ingreso_id
  where i.estado = 'activo'
  on conflict (ingreso_id, fecha)
  do update set datos = excluded.datos;
end;
$$;
commit;

-- 3. Quitar 'administrativo' del rol permitido — en transacción aparte,
-- con comprobación previa: si por lo que sea hay alguna ficha real con
-- ese rol, se avisa y no se toca nada, en vez de fallar sin explicar
-- por qué (y sin arrastrar en el mismo fallo las dos correcciones de
-- arriba, que son independientes de esta).
do $$
begin
  if exists (select 1 from public.profesionales where rol = 'administrativo') then
    raise notice 'Hay al menos una ficha con rol administrativo — no se ha tocado la restricción. Cambia primero esas fichas a otro rol.';
  else
    alter table public.profesionales drop constraint if exists profesionales_rol_check;
    alter table public.profesionales add constraint profesionales_rol_check
      check (rol in ('medico', 'enfermeria', 'auxiliar', 'tecnico'));
  end if;
end $$;
