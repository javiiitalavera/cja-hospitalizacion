-- CJA Hospital — Auditoría v2 y registro de accesos (2026-10-11)
--
-- Hasta ahora la auditoría solo decía "alguien editó esta tabla": ni qué cambió, ni de qué paciente,
-- y los guardados automáticos de los informes (cada vez que se deja de escribir) llenaban el historial.
-- Esta migración:
--
--   1. Guarda QUÉ cambió: solo los campos que cambiaron, con su valor de antes y de después
--      (columna `cambios`). Una edición que no cambia nada ya no deja rastro.
--   2. Junta los guardados automáticos seguidos de la misma persona sobre el mismo registro
--      (hasta 30 minutos entre uno y otro) en una sola fila: `fecha` = primer cambio,
--      `fecha_fin` = último, `n_cambios` = cuántos guardados. Si al final vuelve al valor original,
--      el campo desaparece del resumen.
--   3. Guarda de qué paciente e ingreso es cada cambio (`paciente_id`, `ingreso_id`), para poder buscar
--      "todo lo que ha pasado con esta paciente" aunque luego se borre el registro.
--   4. Un borrado conserva el contenido borrado (en `valores_antes`).
--   5. Marca como `seguridad` los cambios de rol, administrador, alta/baja y cuenta del personal,
--      y las altas y bajas de personal.
--   6. Audita también la Hoja de ítems (items_paciente).
--   7. Registro de accesos (tabla `registro_accesos` + función `registrar_acceso`): quién abre un
--      expediente o una ficha, quién imprime o exporta a Word, y cuándo se inicia sesión.
--      Solo lo lee un administrador; nadie lo escribe a mano, solo la aplicación a través de la función.
--
-- La auditoría y el registro de accesos son de solo lectura para todos: se quitan también los permisos
-- de escritura directa de la tabla (antes solo los frenaba RLS).
--
-- Transaccional e idempotente (se puede ejecutar más de una vez).

begin;

-- ────────────────────────────────────────────────────────────
-- 1. COLUMNAS NUEVAS
-- ────────────────────────────────────────────────────────────

alter table public.auditoria
    add column if not exists cambios jsonb,
    add column if not exists ingreso_id uuid,
    add column if not exists paciente_id uuid,
    add column if not exists nivel text not null default 'normal',
    add column if not exists fecha_fin timestamptz,
    add column if not exists n_cambios integer not null default 1;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'auditoria_nivel_check') then
    alter table public.auditoria add constraint auditoria_nivel_check check (nivel in ('normal', 'seguridad'));
  end if;
end $$;

create index if not exists auditoria_paciente_idx on public.auditoria (paciente_id, fecha desc);
create index if not exists auditoria_usuario_idx on public.auditoria (usuario_id, fecha desc);
create index if not exists auditoria_nivel_idx on public.auditoria (fecha desc) where nivel = 'seguridad';

-- ────────────────────────────────────────────────────────────
-- 2. FUNCIONES AUXILIARES (solo las usa el disparador)
-- ────────────────────────────────────────────────────────────

-- Un valor listo para guardar: los textos muy largos se recortan (con aviso) para que un informe entero
-- no se copie en cada cambio.
create or replace function public.auditoria_valor(v jsonb) returns jsonb
language plpgsql immutable
set search_path = ''
as $$
begin
  if v is null or jsonb_typeof(v) = 'null' then
    return 'null'::jsonb;
  elsif jsonb_typeof(v) = 'string' and length(v #>> '{}') > 4000 then
    return to_jsonb(left(v #>> '{}', 4000) || '… [recortado: ' || length(v #>> '{}') || ' caracteres]');
  elsif jsonb_typeof(v) in ('object', 'array') and length(v::text) > 8000 then
    return to_jsonb('[contenido largo: ' || length(v::text) || ' caracteres]'::text);
  end if;
  return v;
end;
$$;

-- Campos que cambian solos en cada guardado y no cuentan como un cambio.
create or replace function public.auditoria_diff(p_antes jsonb, p_despues jsonb, p_prefijo text default '') returns jsonb
language plpgsql immutable
set search_path = ''
as $$
declare
  r jsonb := '{}'::jsonb;
  k text;
  a jsonb;
  d jsonb;
begin
  for k in select jsonb_object_keys(coalesce(p_antes, '{}'::jsonb) || coalesce(p_despues, '{}'::jsonb)) loop
    a := coalesce(p_antes -> k, 'null'::jsonb);
    d := coalesce(p_despues -> k, 'null'::jsonb);
    if a = d then continue; end if;
    if p_prefijo = '' and k in ('updated_at', 'version', 'actualizado_en', 'actualizado_por_id', 'created_at') then continue; end if;
    -- Un nivel hacia dentro en los campos tipo objeto (informe de enfermería, otros informes:
    -- `campos` guarda cada apartado), para ver qué apartado cambió y no solo "campos".
    if p_prefijo = '' and jsonb_typeof(a) = 'object' and jsonb_typeof(d) = 'object' then
      r := r || public.auditoria_diff(a, d, k || '.');
    else
      r := r || jsonb_build_object(p_prefijo || k, jsonb_build_object('antes', public.auditoria_valor(a), 'despues', public.auditoria_valor(d)));
    end if;
  end loop;
  return r;
end;
$$;

revoke execute on function public.auditoria_valor(jsonb) from public, anon, authenticated;
revoke execute on function public.auditoria_diff(jsonb, jsonb, text) from public, anon, authenticated;

-- ────────────────────────────────────────────────────────────
-- 3. DISPARADOR GENÉRICO
-- ────────────────────────────────────────────────────────────

create or replace function public.registrar_auditoria() returns trigger
language plpgsql security definer
set search_path to ''
as $$
declare
  v_old jsonb;
  v_new jsonb;
  v_fila jsonb;
  v_registro uuid;
  v_ingreso uuid;
  v_paciente uuid;
  v_cambios jsonb;
  v_antes jsonb;
  v_nivel text := 'normal';
  v_yo uuid := auth.uid();
  v_prev public.auditoria;
  v_unido jsonb;
  campo text;
begin
  v_old := case when TG_OP <> 'INSERT' then to_jsonb(OLD) end;
  v_new := case when TG_OP <> 'DELETE' then to_jsonb(NEW) end;
  v_fila := coalesce(v_new, v_old);
  v_registro := coalesce(v_fila ->> 'id', v_fila ->> 'ingreso_id')::uuid;

  -- De qué paciente e ingreso es el cambio.
  if TG_TABLE_NAME = 'pacientes' then
    v_paciente := v_registro;
  elsif TG_TABLE_NAME = 'ingresos' then
    v_ingreso := v_registro;
    v_paciente := (v_fila ->> 'paciente_id')::uuid;
  elsif TG_TABLE_NAME <> 'profesionales' and TG_TABLE_NAME <> 'farmacos_alias' then
    v_ingreso := (v_fila ->> 'ingreso_id')::uuid;
    if v_ingreso is null and v_fila ? 'lesion_id' then
      select l.ingreso_id into v_ingreso from public.curas_lesiones l where l.id = (v_fila ->> 'lesion_id')::uuid;
    end if;
    if v_ingreso is not null then
      select i.paciente_id into v_paciente from public.ingresos i where i.id = v_ingreso;
    end if;
  end if;

  if TG_OP = 'UPDATE' then
    v_cambios := public.auditoria_diff(v_old, v_new);
    -- Un guardado que no cambia nada de verdad no es un cambio.
    if v_cambios = '{}'::jsonb then return NEW; end if;
    if TG_TABLE_NAME = 'profesionales' and v_cambios ?| array['rol', 'es_admin', 'activo', 'user_id'] then
      v_nivel := 'seguridad';
    end if;

    -- Guardados automáticos seguidos de la misma persona sobre el mismo registro: una sola fila.
    if v_yo is not null and TG_TABLE_NAME = any (array[
      'informe_ingreso', 'informe_alta', 'informes_puntuales', 'informe_enfermeria', 'cmbd',
      'escalas_clinicas', 'items_paciente', 'pauta_via', 'curas_valoraciones', 'curas_lesiones'
    ]) then
      select * into v_prev from public.auditoria
       where tabla = TG_TABLE_NAME and registro_id = v_registro
       order by id desc limit 1
       for update;
      if found
         and v_prev.accion = 'UPDATE'
         and v_prev.cambios is not null
         and v_prev.usuario_id is not distinct from v_yo
         and coalesce(v_prev.fecha_fin, v_prev.fecha) > now() - interval '30 minutes' then
        v_unido := v_prev.cambios;
        for campo in select jsonb_object_keys(v_cambios) loop
          if v_unido ? campo then
            if (v_unido -> campo -> 'antes') = (v_cambios -> campo -> 'despues') then
              v_unido := v_unido - campo;                    -- ha vuelto al valor de partida
            else
              v_unido := jsonb_set(v_unido, array[campo, 'despues'], v_cambios -> campo -> 'despues');
            end if;
          else
            v_unido := v_unido || jsonb_build_object(campo, v_cambios -> campo);
          end if;
        end loop;
        update public.auditoria
           set cambios = v_unido, fecha_fin = now(), n_cambios = n_cambios + 1
         where id = v_prev.id;
        return NEW;
      end if;
    end if;
  elsif TG_OP = 'DELETE' then
    -- Lo borrado se conserva (con los textos largos recortados).
    select coalesce(jsonb_object_agg(e.key, public.auditoria_valor(e.value)), '{}'::jsonb) into v_antes
      from jsonb_each(v_old) e;
  end if;

  if TG_TABLE_NAME = 'profesionales' and TG_OP in ('INSERT', 'DELETE') then
    v_nivel := 'seguridad';
  end if;

  insert into public.auditoria (tabla, registro_id, accion, usuario_id, cambios, valores_antes, ingreso_id, paciente_id, nivel)
  values (TG_TABLE_NAME, v_registro, TG_OP, v_yo, v_cambios, v_antes, v_ingreso, v_paciente, v_nivel);

  if TG_OP = 'DELETE' then
    return OLD;
  end if;
  return NEW;
end;
$$;

revoke execute on function public.registrar_auditoria() from public, anon, authenticated;

-- Incidencias: igual que antes (guardan la fila entera antes y después), y además de qué paciente son.
create or replace function public.registrar_auditoria_eventos() returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_ingreso uuid := coalesce(NEW.ingreso_id, OLD.ingreso_id);
  v_paciente uuid;
begin
  select i.paciente_id into v_paciente from public.ingresos i where i.id = v_ingreso;
  insert into public.auditoria (tabla, registro_id, accion, usuario_id, valores_antes, valores_despues, ingreso_id, paciente_id)
  values (
    'eventos',
    coalesce(NEW.id, OLD.id),
    lower(TG_OP),
    auth.uid(),
    case when TG_OP = 'INSERT' then null else to_jsonb(OLD) end,
    case when TG_OP = 'DELETE' then null else to_jsonb(NEW) end,
    v_ingreso,
    v_paciente
  );
  return coalesce(NEW, OLD);
end;
$$;

revoke execute on function public.registrar_auditoria_eventos() from public, anon, authenticated;

-- Reabrir un episodio: igual que antes, y con el paciente.
create or replace function public.reabrir_episodio(p_ingreso_id uuid) returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_ingreso public.ingresos;
begin
  if not private.tengo_rol('medico') then
    raise exception 'Solo un médico o un administrador puede reabrir un episodio.';
  end if;

  select * into v_ingreso from public.ingresos where id = p_ingreso_id;

  if v_ingreso is null then
    raise exception 'Ingreso no encontrado.';
  end if;

  if v_ingreso.estado = 'activo' then
    raise exception 'Este episodio ya está activo.';
  end if;

  if v_ingreso.dado_de_alta_en is null or now() - v_ingreso.dado_de_alta_en > interval '24 hours' then
    raise exception 'Solo se puede reabrir un episodio dentro de las 24 horas siguientes al alta.';
  end if;

  perform set_config('app.cambio_estado_ingreso_rpc', 'true', true);

  update public.ingresos
  set estado = 'activo', fecha_alta = null, dado_de_alta_en = null
  where id = p_ingreso_id;

  update public.cmbd
  set circunstancia_alta = null
  where ingreso_id = p_ingreso_id;

  insert into public.auditoria (tabla, registro_id, accion, usuario_id, valores_antes, valores_despues, ingreso_id, paciente_id)
  values (
    'ingresos', p_ingreso_id, 'reapertura', auth.uid(),
    jsonb_build_object('estado', v_ingreso.estado, 'fecha_alta', v_ingreso.fecha_alta),
    jsonb_build_object('estado', 'activo', 'fecha_alta', null),
    p_ingreso_id, v_ingreso.paciente_id
  );
end;
$$;

grant execute on function public.reabrir_episodio(uuid) to authenticated;

-- ────────────────────────────────────────────────────────────
-- 4. HOJA DE ÍTEMS AUDITADA
-- ────────────────────────────────────────────────────────────

drop trigger if exists aud_items_paciente on public.items_paciente;
create trigger aud_items_paciente
    after insert or update or delete on public.items_paciente
    for each row execute function public.registrar_auditoria();

-- ────────────────────────────────────────────────────────────
-- 5. LO YA REGISTRADO: PACIENTE E INGRESO (lo que se pueda saber)
-- ────────────────────────────────────────────────────────────

update public.auditoria a
   set ingreso_id = a.registro_id, paciente_id = i.paciente_id
  from public.ingresos i
 where a.tabla = 'ingresos' and a.ingreso_id is null and i.id = a.registro_id;

update public.auditoria
   set paciente_id = registro_id
 where tabla = 'pacientes' and paciente_id is null;

do $$
declare
  t text;
begin
  foreach t in array array[
    'informe_ingreso', 'informe_alta', 'informes_puntuales', 'informe_enfermeria', 'cmbd', 'escalas_clinicas',
    'eventos', 'pauta_cuidados', 'pauta_via', 'curas_lesiones', 'curas_registro'
  ] loop
    execute format(
      'update public.auditoria a set ingreso_id = x.ingreso_id, paciente_id = i.paciente_id
         from public.%I x join public.ingresos i on i.id = x.ingreso_id
        where a.tabla = %L and a.registro_id = x.id and a.ingreso_id is null', t, t);
  end loop;
end $$;

update public.auditoria a
   set ingreso_id = l.ingreso_id, paciente_id = i.paciente_id
  from public.curas_valoraciones v
  join public.curas_lesiones l on l.id = v.lesion_id
  join public.ingresos i on i.id = l.ingreso_id
 where a.tabla = 'curas_valoraciones' and a.registro_id = v.id and a.ingreso_id is null;

-- Incidencias ya borradas: el ingreso sigue en lo que se guardó.
update public.auditoria a
   set ingreso_id = (a.valores_antes ->> 'ingreso_id')::uuid, paciente_id = i.paciente_id
  from public.ingresos i
 where a.tabla = 'eventos' and a.ingreso_id is null
   and a.valores_antes ? 'ingreso_id' and i.id = (a.valores_antes ->> 'ingreso_id')::uuid;

-- ────────────────────────────────────────────────────────────
-- 6. REGISTRO DE ACCESOS
-- ────────────────────────────────────────────────────────────

create table if not exists public.registro_accesos (
    id bigserial primary key,
    fecha timestamptz not null default now(),
    usuario_id uuid,
    tipo text not null check (tipo in ('inicio_sesion', 'expediente', 'ficha_paciente', 'impresion', 'exportacion_word')),
    ingreso_id uuid,
    paciente_id uuid,
    detalle text check (detalle is null or length(detalle) <= 200)
);

create index if not exists registro_accesos_fecha_idx on public.registro_accesos (fecha desc);
create index if not exists registro_accesos_paciente_idx on public.registro_accesos (paciente_id, fecha desc);
create index if not exists registro_accesos_usuario_idx on public.registro_accesos (usuario_id, fecha desc);

-- Lo escribe la aplicación llamando a esta función, nunca a mano. Quién es lo pone el servidor.
-- Para no llenar el registro, una repetición idéntica (misma persona, tipo, paciente y detalle) dentro de
-- la ventana indicada no se vuelve a apuntar: 30 min para inicio de sesión, 10 para abrir expediente o ficha
-- y 1 para imprimir o exportar.
create or replace function public.registrar_acceso(
    p_tipo text,
    p_ingreso_id uuid default null,
    p_paciente_id uuid default null,
    p_detalle text default null
) returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_yo uuid := auth.uid();
  v_paciente uuid := p_paciente_id;
  v_detalle text := nullif(left(btrim(coalesce(p_detalle, '')), 200), '');
  v_ventana interval;
begin
  -- Sin sesión o sin ficha de profesional activa no hay nada que apuntar.
  if v_yo is null or private.mi_rol() is null then
    return;
  end if;
  if p_tipo is null or p_tipo not in ('inicio_sesion', 'expediente', 'ficha_paciente', 'impresion', 'exportacion_word') then
    raise exception 'Tipo de acceso no válido.';
  end if;

  if v_paciente is null and p_ingreso_id is not null then
    select i.paciente_id into v_paciente from public.ingresos i where i.id = p_ingreso_id;
  end if;

  v_ventana := case p_tipo
    when 'inicio_sesion' then interval '30 minutes'
    when 'expediente' then interval '10 minutes'
    when 'ficha_paciente' then interval '10 minutes'
    else interval '1 minute'
  end;

  if exists (
    select 1 from public.registro_accesos r
     where r.usuario_id = v_yo
       and r.tipo = p_tipo
       and r.ingreso_id is not distinct from p_ingreso_id
       and r.paciente_id is not distinct from v_paciente
       and r.detalle is not distinct from v_detalle
       and r.fecha > now() - v_ventana
  ) then
    return;
  end if;

  insert into public.registro_accesos (usuario_id, tipo, ingreso_id, paciente_id, detalle)
  values (v_yo, p_tipo, p_ingreso_id, v_paciente, v_detalle);
end;
$$;

revoke execute on function public.registrar_acceso(text, uuid, uuid, text) from public, anon;
grant execute on function public.registrar_acceso(text, uuid, uuid, text) to authenticated;

-- ────────────────────────────────────────────────────────────
-- 7. PERMISOS: SOLO LECTURA Y SOLO ADMINISTRADORES
-- ────────────────────────────────────────────────────────────

alter table public.registro_accesos enable row level security;

revoke all on public.registro_accesos from public, anon, authenticated;
grant select on public.registro_accesos to authenticated;
revoke all on public.auditoria from public, anon, authenticated;
grant select on public.auditoria to authenticated;

drop policy if exists accesos_leer_admin on public.registro_accesos;
create policy accesos_leer_admin on public.registro_accesos
    for select to authenticated using (private.soy_admin());

commit;
