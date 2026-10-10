-- CJA Hospital — Administrador con todos los permisos + histórico de la pauta de cuidados (2026-10-10)
--
--   1. private.tengo_rol(rol): "tiene ese rol o es administrador". Las políticas y
--      funciones que pedían ser médico o enfermería ahora lo usan, así que un
--      administrador puede hacer todo lo de los demás roles (escribir informes
--      médicos, el informe de enfermería, la pauta de cuidados, confirmar
--      contenciones, dar de alta…). Quien lo hace queda registrado con su nombre.
--   2. pauta_historico: foto diaria de la pauta de cuidados (como items_historico),
--      con tarea programada a las 23:00, y una primera foto al ejecutar esto.
--
-- Requiere haber ejecutado antes 20261010_pauta_cuidados.sql.
-- Transaccional e idempotente (se puede ejecutar más de una vez).

begin;

-- ────────────────────────────────────────────────────────────
-- 1. ADMINISTRADOR = TODOS LOS ROLES
-- ────────────────────────────────────────────────────────────

create or replace function private.tengo_rol(p_rol text) returns boolean
language sql stable
set search_path to ''
as $$
  select coalesce(private.mi_rol() = p_rol, false) or private.soy_admin();
$$;

grant execute on function private.tengo_rol(text) to authenticated;

-- Políticas de médico
alter policy escribir_medico on public.pacientes
    using (private.tengo_rol('medico')) with check (private.tengo_rol('medico'));
alter policy escribir_medico on public.informe_ingreso
    using (private.tengo_rol('medico')) with check (private.tengo_rol('medico'));
alter policy escribir_medico on public.informe_alta
    using (private.tengo_rol('medico')) with check (private.tengo_rol('medico'));
alter policy escribir_medico on public.cmbd
    using (private.tengo_rol('medico')) with check (private.tengo_rol('medico'));
alter policy escribir_medico on public.escalas_clinicas
    using (private.tengo_rol('medico')) with check (private.tengo_rol('medico'));

alter policy crear_ingreso on public.ingresos
    with check (private.tengo_rol('medico') and estado = 'activo');
alter policy editar_ingreso on public.ingresos
    using (private.tengo_rol('medico') and estado = 'activo')
    with check (private.tengo_rol('medico'));

alter policy crear_informe_puntual on public.informes_puntuales
    with check (
        private.tengo_rol('medico')
        and registrado_por_id = (select id from public.profesionales where user_id = auth.uid() limit 1)
    );
alter policy editar_informe_puntual on public.informes_puntuales
    using (private.tengo_rol('medico')) with check (private.tengo_rol('medico'));
alter policy borrar_informe_puntual on public.informes_puntuales
    using (private.tengo_rol('medico'));

-- Políticas de enfermería
alter policy crear_enfermeria on public.informe_enfermeria
    with check (private.tengo_rol('enfermeria'));
alter policy editar_enfermeria on public.informe_enfermeria
    using (private.tengo_rol('enfermeria')) with check (private.tengo_rol('enfermeria'));

alter policy crear_enfermeria on public.pauta_cuidados
    with check (
        private.tengo_rol('enfermeria')
        and exists (select 1 from public.ingresos i where i.id = pauta_cuidados.ingreso_id and i.estado = 'activo')
    );
alter policy editar_enfermeria on public.pauta_cuidados
    using (
        private.tengo_rol('enfermeria')
        and exists (select 1 from public.ingresos i where i.id = pauta_cuidados.ingreso_id and i.estado = 'activo')
    )
    with check (
        private.tengo_rol('enfermeria')
        and exists (select 1 from public.ingresos i where i.id = pauta_cuidados.ingreso_id and i.estado = 'activo')
    );
alter policy borrar_enfermeria on public.pauta_cuidados
    using (
        private.tengo_rol('enfermeria')
        and exists (select 1 from public.ingresos i where i.id = pauta_cuidados.ingreso_id and i.estado = 'activo')
    );

alter policy crear_enfermeria on public.pauta_via
    with check (
        private.tengo_rol('enfermeria')
        and exists (select 1 from public.ingresos i where i.id = pauta_via.ingreso_id and i.estado = 'activo')
    );
alter policy editar_enfermeria on public.pauta_via
    using (
        private.tengo_rol('enfermeria')
        and exists (select 1 from public.ingresos i where i.id = pauta_via.ingreso_id and i.estado = 'activo')
    )
    with check (
        private.tengo_rol('enfermeria')
        and exists (select 1 from public.ingresos i where i.id = pauta_via.ingreso_id and i.estado = 'activo')
    );
alter policy borrar_enfermeria on public.pauta_via
    using (
        private.tengo_rol('enfermeria')
        and exists (select 1 from public.ingresos i where i.id = pauta_via.ingreso_id and i.estado = 'activo')
    );

-- Funciones que exigían ser médico (confirmar o retirar la confirmación de una
-- pauta de contención, dar de alta, reabrir un episodio).
create or replace function public.gestionar_confirmacion_contencion() returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor_actual uuid;
begin
  -- En un INSERT no hay ningún OLD con el que comparar, y la propia
  -- política de escritura ya exige confirmado_por_id = null al crear
  -- — no hay ninguna regla de confirmación que aplicar todavía aquí.
  -- Antes esto caía por defecto en la rama de "retirar confirmación",
  -- bloqueando a cualquiera que no fuera médico de registrar la
  -- primera pauta — confirmado por auditoría real contra Supabase.
  if TG_OP = 'INSERT' then
    NEW.confirmado_en := null;
    return NEW;
  end if;

  select id into v_actor_actual from public.profesionales where user_id = auth.uid() limit 1;

  if NEW.dia is distinct from OLD.dia or NEW.noche is distinct from OLD.noche then
    NEW.confirmado_por_id := null;
    NEW.confirmado_en := null;
    return NEW;
  end if;

  if NEW.confirmado_por_id is not distinct from OLD.confirmado_por_id then
    -- Nada de la confirmación cambia: se ignora cualquier valor que
    -- mandara el cliente para "confirmado_en" — solo puede cambiar de
    -- verdad cuando confirmado_por_id también cambia.
    NEW.confirmado_en := OLD.confirmado_en;
    return NEW;
  end if;

  if NEW.confirmado_por_id is not null then
    if not private.tengo_rol('medico') then
      raise exception 'Solo un médico puede confirmar una pauta de contención.';
    end if;
    if NEW.confirmado_por_id <> v_actor_actual then
      raise exception 'Solo puedes confirmar una pauta como tú mismo.';
    end if;
    NEW.confirmado_en := now();
  else
    if not private.tengo_rol('medico') then
      raise exception 'Solo un médico puede retirar una confirmación.';
    end if;
    NEW.confirmado_en := null;
  end if;

  return NEW;
end;
$$;

create or replace function public.confirmar_contencion(p_ingreso_id uuid, p_version_esperada integer)
returns public.contenciones
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid;
  v_resultado public.contenciones;
begin
  -- coalesce(...,'') en vez de comparar directo: para quien no tiene
  -- ninguna sesión, mi_rol() devuelve NULL, y "NULL <> 'medico'" no
  -- es verdadero ni falso — es NULL, y un "if" lo trata como falso,
  -- dejando pasar la comprobación sin querer. Confirmado que esto
  -- pasaba de verdad contra Supabase antes de este arreglo.
  if not private.tengo_rol('medico') then
    raise exception 'Solo un médico puede confirmar una pauta de contención.';
  end if;
  select id into v_actor from public.profesionales where user_id = auth.uid() limit 1;
  if v_actor is null then
    raise exception 'No se ha podido identificar tu sesión.';
  end if;

  -- Bandera de sesión para que el disparador de más abajo deje pasar
  -- este UPDATE en concreto — es la única vía autorizada para tocar
  -- confirmado_por_id.
  perform set_config('app.confirmacion_rpc', 'true', true);

  update public.contenciones c
  set confirmado_por_id = v_actor
  where c.ingreso_id = p_ingreso_id
    and c.version = p_version_esperada
    -- Episodio activo: no tiene sentido confirmar la pauta de un
    -- episodio ya cerrado. Confirmado de verdad que antes se podía.
    and exists (select 1 from public.ingresos i where i.id = c.ingreso_id and i.estado = 'activo')
    -- No se puede volver a confirmar algo ya confirmado — antes esto
    -- simplemente cambiaba quién figuraba como autor, sin aviso.
    and c.confirmado_por_id is null
  returning * into v_resultado;

  if not found then
    raise exception 'version_desactualizada';
  end if;

  insert into public.contenciones_historial (ingreso_id, dia, noche, cambiado_por_id, cambiado_en, tipo_accion, actor_id)
  values (v_resultado.ingreso_id, v_resultado.dia, v_resultado.noche, v_resultado.actualizado_por_id, now(), 'confirmada', v_actor);

  return v_resultado;
end;
$$;

create or replace function public.retirar_confirmacion_contencion(p_ingreso_id uuid, p_version_esperada integer)
returns public.contenciones
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid;
  v_resultado public.contenciones;
begin
  if not private.tengo_rol('medico') then
    raise exception 'Solo un médico puede retirar una confirmación.';
  end if;
  select id into v_actor from public.profesionales where user_id = auth.uid() limit 1;
  if v_actor is null then
    raise exception 'No se ha podido identificar tu sesión.';
  end if;

  perform set_config('app.confirmacion_rpc', 'true', true);

  update public.contenciones c
  set confirmado_por_id = null
  where c.ingreso_id = p_ingreso_id
    and c.version = p_version_esperada
    and exists (select 1 from public.ingresos i where i.id = c.ingreso_id and i.estado = 'activo')
    -- Solo tiene sentido retirar una confirmación que exista de
    -- verdad — antes se podía "retirar" una que no existía.
    and c.confirmado_por_id is not null
  returning * into v_resultado;

  if not found then
    raise exception 'version_desactualizada';
  end if;

  insert into public.contenciones_historial (ingreso_id, dia, noche, cambiado_por_id, cambiado_en, tipo_accion, actor_id)
  values (v_resultado.ingreso_id, v_resultado.dia, v_resultado.noche, v_resultado.actualizado_por_id, now(), 'confirmacion_retirada', v_actor);

  return v_resultado;
end;
$$;

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
  if not private.tengo_rol('medico') then
    raise exception 'Solo un médico puede dar de alta.';
  end if;

  if p_fecha_alta is null or p_fecha_alta > private.hoy_madrid() then
    raise exception 'La fecha de alta no es válida.';
  end if;

  v_estado := case p_circunstancia_alta
    when '1' then 'alta'            -- Domicilio
    when '3' then 'alta'            -- Alta voluntaria
    when '9' then 'alta'            -- Otras circunstancias / fuga / desconocido
    when '2' then 'alta_traslado'   -- Traslado a otro hospital
    when '5' then 'alta_traslado'   -- Traslado a centro sociosanitario
    when '4' then 'exitus'          -- Éxitus
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

  -- INSERT ... ON CONFLICT en vez de un UPDATE a ciegas: si el CMBD
  -- todavía no existía (un ingreso que nunca se llegó a abrir en esa
  -- pestaña), esto lo crea; si ya existía, lo actualiza. Confirmado
  -- de verdad que, antes, un UPDATE sobre una fila inexistente
  -- afectaba a cero filas y el alta se daba por buena igualmente,
  -- con el CMBD vacío para siempre.
  insert into public.cmbd (ingreso_id, circunstancia_alta)
  values (p_ingreso_id, p_circunstancia_alta)
  on conflict (ingreso_id) do update set circunstancia_alta = excluded.circunstancia_alta;

  return jsonb_build_object('estado', v_estado, 'fecha_alta', v_actualizado.fecha_alta);
end;
$$;

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

  -- Rastro explícito: el disparador genérico de auditoría ya registra
  -- el UPDATE de ingresos, pero solo como una edición cualquiera, sin
  -- guardar qué decía antes y qué dice después — esto sí lo hace, y
  -- deja claro que fue una reapertura, no un cambio distinto.
  insert into public.auditoria (tabla, registro_id, accion, usuario_id, valores_antes, valores_despues)
  values (
    'ingresos', p_ingreso_id, 'reapertura', auth.uid(),
    jsonb_build_object('estado', v_ingreso.estado, 'fecha_alta', v_ingreso.fecha_alta),
    jsonb_build_object('estado', 'activo', 'fecha_alta', null)
  );
end;
$$;

-- ────────────────────────────────────────────────────────────
-- HISTÓRICO DIARIO DE LA PAUTA DE CUIDADOS
-- ────────────────────────────────────────────────────────────
-- Igual que items_historico: una foto por ingreso y día, generada cada noche.
-- Guarda lo necesario para reconstruir la hoja de trabajo tal como estaba ese
-- día (pauta, vía, habitación, nombre y lo que sale de la Hoja de ítems y de
-- la contención), aunque después cambie el paciente de habitación o se edite.

create table if not exists public.pauta_historico (
    id uuid primary key default gen_random_uuid(),
    ingreso_id uuid not null references public.ingresos(id) on delete cascade,
    fecha date not null default current_date,
    datos jsonb not null default '{}',
    created_at timestamptz default now(),
    unique (ingreso_id, fecha)
);

create index if not exists pauta_historico_fecha_idx on public.pauta_historico (fecha);

alter table public.pauta_historico enable row level security;
revoke all on public.pauta_historico from public, anon;
grant select on public.pauta_historico to authenticated;

drop policy if exists leer_autenticado on public.pauta_historico;
create policy leer_autenticado on public.pauta_historico
    for select to authenticated using (private.mi_rol() is not null);

create or replace function public.generar_snapshot_pauta() returns void
language plpgsql
set search_path = ''
as $$
begin
  insert into public.pauta_historico (ingreso_id, fecha, datos)
  select
    i.id,
    current_date,
    jsonb_build_object(
      'habitacion', i.habitacion,
      'nombre', p.nombre,
      'primer_apellido', p.primer_apellido,
      'via', (select v.via from public.pauta_via v where v.ingreso_id = i.id),
      'indicaciones', coalesce((
        select jsonb_agg(jsonb_build_object('texto', c.texto, 'turnos', c.turnos) order by c.created_at)
        from public.pauta_cuidados c where c.ingreso_id = i.id
      ), '[]'::jsonb),
      'sonda_vesical', coalesce(ip.sonda_vesical, false),
      'colector', coalesce(ip.colector, false),
      'alerta_conducta', to_jsonb(coalesce(ip.alerta_conducta, '{}'::text[])),
      'objetos_calma', ip.objetos_calma,
      'contencion_dia', ct.dia,
      'contencion_noche', to_jsonb(ct.noche)
    )
  from public.ingresos i
  inner join public.pacientes p on p.id = i.paciente_id
  left join public.items_paciente ip on ip.ingreso_id = i.id
  left join public.contenciones ct on ct.ingreso_id = i.id
  where i.estado = 'activo'
  on conflict (ingreso_id, fecha)
  do update set datos = excluded.datos;
end;
$$;

-- Tarea programada: cada noche a las 23:00, igual que la foto de ítems.
select cron.unschedule(jobid) from cron.job where jobname = 'snapshot-pauta-diario';
select cron.schedule('snapshot-pauta-diario', '0 23 * * *', 'select generar_snapshot_pauta()');

-- Primera foto, con lo que hay ahora.
select public.generar_snapshot_pauta();

commit;
