-- CJA Hospital — correcciones finales auditadas (2026-09-08)
--
-- Esta migración es incremental y está preparada para ejecutarse sobre el
-- proyecto Supabase actual. NO sustituye a esquema_actual.sql, que sigue
-- siendo exclusivamente una baseline para una base de datos vacía.

begin;

-- Estas RPC ya validan rol/RLS internamente, pero no necesitan conservar el
-- permiso EXECUTE que PostgreSQL concede a PUBLIC por defecto.
revoke execute on function public.crear_paciente_e_ingreso(jsonb, int, date, uuid, text, boolean)
  from public, anon;
grant execute on function public.crear_paciente_e_ingreso(jsonb, int, date, uuid, text, boolean)
  to authenticated;

-- 1. Una edición normal de una pauta confirmada debe invalidar la
-- confirmación, no fallar. PostgreSQL ejecuta por orden alfabético los
-- triggers BEFORE UPDATE del mismo tipo: el guard debe comprobar primero
-- lo que envió el cliente y gestionar_confirmacion puede limpiar después
-- la confirmación al detectar un cambio real de dia/noche.
drop trigger if exists impedir_confirmacion_directa on public.contenciones;
drop trigger if exists a_impedir_confirmacion_directa on public.contenciones;

create trigger a_impedir_confirmacion_directa
  before update on public.contenciones
  for each row execute function public.impedir_confirmacion_directa();

-- 2. El alta y la reapertura son transiciones completas: no se permite
-- cambiar directamente estado/fecha_alta/dado_de_alta_en por REST y dejar
-- el CMBD o la auditoría fuera de sincronía.
create or replace function public.impedir_cambio_estado_ingreso_directo()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if (
       new.estado is distinct from old.estado
       or new.fecha_alta is distinct from old.fecha_alta
       or new.dado_de_alta_en is distinct from old.dado_de_alta_en
     )
     and coalesce(current_setting('app.cambio_estado_ingreso_rpc', true), '') <> 'true' then
    raise exception 'El alta o la reapertura de un episodio solo puede realizarse mediante dar_de_alta() o reabrir_episodio().';
  end if;
  return new;
end;
$$;

drop trigger if exists impedir_cambio_estado_ingreso_directo on public.ingresos;

create trigger impedir_cambio_estado_ingreso_directo
  before update on public.ingresos
  for each row execute function public.impedir_cambio_estado_ingreso_directo();

revoke execute on function public.impedir_cambio_estado_ingreso_directo()
  from public, anon, authenticated;

create or replace function public.dar_de_alta(
  p_ingreso_id uuid,
  p_fecha_alta date,
  p_circunstancia_alta text
) returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_estado text;
  v_actualizado public.ingresos;
begin
  if coalesce(private.mi_rol(), '') <> 'medico' then
    raise exception 'Solo un médico puede dar de alta.';
  end if;

  if p_fecha_alta is null or p_fecha_alta > current_date then
    raise exception 'La fecha de alta no es válida.';
  end if;

  v_estado := case p_circunstancia_alta
    when '1' then 'alta'
    when '3' then 'alta'
    when '9' then 'alta'
    when '2' then 'alta_traslado'
    when '5' then 'alta_traslado'
    when '4' then 'exitus'
    else null
  end;

  if v_estado is null then
    raise exception 'Circunstancia de alta no reconocida.';
  end if;

  if p_fecha_alta < (select fecha_ingreso from public.ingresos where id = p_ingreso_id) then
    raise exception 'La fecha de alta no puede ser anterior a la de ingreso.';
  end if;

  perform set_config('app.cambio_estado_ingreso_rpc', 'true', true);

  update public.ingresos
  set estado = v_estado, fecha_alta = p_fecha_alta, dado_de_alta_en = now()
  where id = p_ingreso_id and estado = 'activo'
  returning * into v_actualizado;

  if not found then
    raise exception 'Este episodio ya no está activo, o no existe.';
  end if;

  insert into public.cmbd (ingreso_id, circunstancia_alta)
  values (p_ingreso_id, p_circunstancia_alta)
  on conflict (ingreso_id) do update
    set circunstancia_alta = excluded.circunstancia_alta;

  return jsonb_build_object('estado', v_estado, 'fecha_alta', v_actualizado.fecha_alta);
end;
$$;

revoke execute on function public.dar_de_alta(uuid, date, text) from public, anon;
grant execute on function public.dar_de_alta(uuid, date, text) to authenticated;

create or replace function public.reabrir_episodio(p_ingreso_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_ingreso public.ingresos;
begin
  if coalesce(private.mi_rol(), '') <> 'medico' and not private.soy_admin() then
    raise exception 'Solo un médico o un administrador puede reabrir un episodio.';
  end if;

  select * into v_ingreso from public.ingresos where id = p_ingreso_id;

  if v_ingreso is null then
    raise exception 'Ingreso no encontrado.';
  end if;

  if v_ingreso.estado = 'activo' then
    raise exception 'Este episodio ya está activo.';
  end if;

  if v_ingreso.dado_de_alta_en is null
     or now() - v_ingreso.dado_de_alta_en > interval '24 hours' then
    raise exception 'Solo se puede reabrir un episodio dentro de las 24 horas siguientes al alta.';
  end if;

  perform set_config('app.cambio_estado_ingreso_rpc', 'true', true);

  update public.ingresos
  set estado = 'activo', fecha_alta = null, dado_de_alta_en = null
  where id = p_ingreso_id;

  update public.cmbd
  set circunstancia_alta = null
  where ingreso_id = p_ingreso_id;

  insert into public.auditoria
    (tabla, registro_id, accion, usuario_id, valores_antes, valores_despues)
  values (
    'ingresos', p_ingreso_id, 'reapertura', auth.uid(),
    jsonb_build_object('estado', v_ingreso.estado, 'fecha_alta', v_ingreso.fecha_alta),
    jsonb_build_object('estado', 'activo', 'fecha_alta', null)
  );
end;
$$;

revoke execute on function public.reabrir_episodio(uuid) from public, anon;
grant execute on function public.reabrir_episodio(uuid) to authenticated;

commit;
