-- ============================================================
-- Pauta de contención física: la orden médica, no un incidente
-- puntual
--
-- Hasta ahora, "contención física" vivía como una incidencia más
-- (un registro puntual) y, por separado, los campos de sujeción de
-- la Hoja de Ítems eran de libre edición para todo el equipo, sin
-- ninguna conexión real con si un médico había pautado algo.
--
-- Esta tabla es la fuente de verdad: el médico pauta (crea) y retira
-- (pone fecha_fin) la contención; la Hoja de Ítems solo la MUESTRA.
-- ============================================================

begin;

create table public.pautas_contencion (
    id uuid primary key default gen_random_uuid(),
    ingreso_id uuid not null references public.ingresos(id) on delete cascade,
    -- Cada medida es su propia pauta independiente porque un paciente
    -- puede tener varias a la vez (p. ej. barandillas Y sensor de
    -- presión), y cada una la autoriza un médico por separado.
    tipo text not null check (tipo in (
        'cama_una_barra', 'cama_dos_barras', 'cama_sujecion_fisica',
        'cama_sensor_presion', 'cama_cota_cero',
        'sillon', 'silla_ruedas', 'contencion_manual', 'aislamiento'
    )),
    motivo text not null check (motivo in (
        'agitacion', 'riesgo_caida', 'retirada_vias', 'riesgo_fuga', 'otro'
    )),
    notas text,
    pautada_por_id uuid not null references public.profesionales(id),
    fecha_inicio timestamptz not null default now(),
    retirada_por_id uuid references public.profesionales(id),
    fecha_fin timestamptz,
    created_at timestamptz default now()
);

-- No se puede pautar dos veces el MISMO tipo de contención a la vez
-- para el mismo ingreso (sí se pueden tener, por ejemplo, sujeción de
-- cama Y de sillón activas simultáneamente — son tipos distintos).
create unique index pautas_contencion_activa_unica
  on public.pautas_contencion (ingreso_id, tipo)
  where fecha_fin is null;

-- Para consultar rápido "¿qué contenciones tiene activas este ingreso?"
create index pautas_contencion_ingreso_activa_idx
  on public.pautas_contencion (ingreso_id)
  where fecha_fin is null;

alter table public.pautas_contencion enable row level security;

-- Lectura: todo el equipo con ficha activa, igual que el resto de
-- datos clínicos — la Hoja de Ítems la muestra a todos.
create policy leer_autenticado on public.pautas_contencion
  for select to authenticated using (private.mi_rol() is not null);

-- Solo un médico puede pautar, y solo sobre un ingreso activo.
create policy pautar_contencion on public.pautas_contencion
  for insert to authenticated
  with check (
    private.mi_rol() = 'medico'
    and exists (select 1 from ingresos i where i.id = pautas_contencion.ingreso_id and i.estado = 'activo')
    and pautada_por_id = (select id from profesionales where user_id = auth.uid() limit 1)
  );

-- Solo un médico puede retirarla (poner fecha_fin).
create policy retirar_contencion on public.pautas_contencion
  for update to authenticated
  using (private.mi_rol() = 'medico')
  with check (private.mi_rol() = 'medico');

-- Una pauta ya creada no se puede "editar" en sus datos clave — solo
-- retirar. Si hiciera falta cambiar el tipo o el motivo, se retira la
-- pauta y se crea una nueva (así queda un rastro claro de qué pasó y
-- cuándo, en vez de reescribir la historia).
create function public.evitar_cambio_pauta_contencion() returns trigger
language plpgsql
as $$
begin
  if NEW.tipo is distinct from OLD.tipo
     or NEW.motivo is distinct from OLD.motivo
     or NEW.ingreso_id is distinct from OLD.ingreso_id
     or NEW.pautada_por_id is distinct from OLD.pautada_por_id
     or NEW.fecha_inicio is distinct from OLD.fecha_inicio then
    raise exception 'Una pauta de contención ya creada no se puede modificar, solo retirar. Para cambiar algo, retírala y crea una nueva.';
  end if;
  return NEW;
end;
$$;

create trigger bloquear_cambio_pauta_contencion
  before update on public.pautas_contencion
  for each row execute function public.evitar_cambio_pauta_contencion();

-- Mantiene sincronizados los campos de sujeción de items_paciente con
-- las pautas activas de verdad. Así la rejilla de la Hoja de Ítems y
-- la foto nocturna del histórico siguen funcionando exactamente igual
-- que antes, sin tocar ese código — solo que ahora "sujeción cama:
-- dos barras" en la rejilla significa de verdad que hay una pauta
-- médica activa, no un campo suelto que cualquiera podía marcar.
create function public.sincronizar_items_desde_pautas() returns trigger
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_ingreso_id uuid;
  v_cama text[];
  v_silla_ruedas text;
  v_sillon text;
begin
  v_ingreso_id := coalesce(NEW.ingreso_id, OLD.ingreso_id);

  select array_agg(
    case tipo
      when 'cama_una_barra' then 'una_barra'
      when 'cama_dos_barras' then 'dos_barras'
      when 'cama_sujecion_fisica' then 'sujecion_fisica'
      when 'cama_sensor_presion' then 'sensor_presion'
      when 'cama_cota_cero' then 'cota_cero'
    end
  ) filter (where tipo like 'cama_%')
  into v_cama
  from pautas_contencion
  where ingreso_id = v_ingreso_id and fecha_fin is null;

  select 'continuo' into v_silla_ruedas
  from pautas_contencion
  where ingreso_id = v_ingreso_id and tipo = 'silla_ruedas' and fecha_fin is null
  limit 1;

  select 'continuo' into v_sillon
  from pautas_contencion
  where ingreso_id = v_ingreso_id and tipo = 'sillon' and fecha_fin is null
  limit 1;

  update items_paciente
  set sujecion_cama = coalesce(v_cama, '{}'),
      sujecion_silla_ruedas = v_silla_ruedas,
      sujecion_sillon = v_sillon
  where ingreso_id = v_ingreso_id;

  return coalesce(NEW, OLD);
end;
$$;

create trigger sincronizar_items_tras_pauta
  after insert or update on public.pautas_contencion
  for each row execute function public.sincronizar_items_desde_pautas();

commit;
