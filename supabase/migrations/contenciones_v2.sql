-- ============================================================
-- Contención física — rediseño completo: día y noche por separado
--
-- Sustituye por completo al sistema de "pautas_contencion" de hace
-- unos días (9 tipos unificados). Aquella tabla es reciente y no
-- tiene datos reales todavía, así que se elimina sin más — no hay
-- ninguna migración de datos que hacer.
--
-- Modelo nuevo, dos ejes independientes por ingreso:
--   día:   una sola opción de cuatro (ninguna / continua por
--          seguridad / si precisa asistencial / si precisa paciente)
--   noche: varias a la vez de seis medidas posibles (barras, cota
--          cero, sensor, contención fija, contención si precisa)
--
-- "Nunca revisado" y "revisado, no hace falta nada" son cosas
-- DISTINTAS y se representan de forma distinta a propósito:
--   - día:   null = nunca revisado; 'ninguna' = revisado, nada pautado
--   - noche: null = nunca revisado; '{}' (array vacío) = revisado, nada
-- Así el frontend puede avisar "esto no se ha mirado todavía" en vez
-- de mostrar simplemente "no hay contención" en los dos casos, que
-- son informaciones muy distintas para el equipo.
--
-- Cualquier profesional puede pautar o modificar (la orden verbal
-- sigue siendo del médico, pero no se restringe quién la introduce
-- en la aplicación). Se sigue guardando quién hizo cada cambio.
-- ============================================================

begin;

-- ── Fuera el sistema anterior ───────────────────────────────
drop trigger if exists sincronizar_items_tras_pauta on pautas_contencion;
drop function if exists public.sincronizar_items_desde_pautas();
drop trigger if exists bloquear_cambio_pauta_contencion on pautas_contencion;
drop function if exists public.evitar_cambio_pauta_contencion();
drop table if exists public.pautas_contencion;

-- ── Estado actual (un registro por ingreso) ─────────────────
create table public.contenciones (
    ingreso_id uuid primary key references public.ingresos(id) on delete cascade,
    dia text check (dia in (
        'ninguna', 'continua_seguridad', 'si_precisa_asistencial', 'si_precisa_paciente'
    )),
    noche text[] check (
        noche <@ array['1_barra','2_barras','cota_cero','sensor_presion','contencion_fija','contencion_si_precisa']::text[]
    ),
    actualizado_por_id uuid references public.profesionales(id),
    actualizado_en timestamptz not null default now()
);

-- ── Historial: una fila por cada cambio, para poder ver cómo ha
-- ido evolucionando la pauta de un paciente a lo largo del tiempo.
create table public.contenciones_historial (
    id uuid primary key default gen_random_uuid(),
    ingreso_id uuid not null references public.ingresos(id) on delete cascade,
    dia text,
    noche text[],
    cambiado_por_id uuid references public.profesionales(id),
    cambiado_en timestamptz not null default now()
);

create index contenciones_historial_ingreso_idx on public.contenciones_historial (ingreso_id, cambiado_en desc);

-- Cada vez que se crea o cambia el estado actual, queda una foto en
-- el historial. Así el historial no depende de que nadie se acuerde
-- de registrarlo aparte — es automático y no se puede saltar.
create function public.registrar_historial_contencion() returns trigger
language plpgsql
security definer
set search_path to 'public'
as $$
begin
  insert into contenciones_historial (ingreso_id, dia, noche, cambiado_por_id, cambiado_en)
  values (NEW.ingreso_id, NEW.dia, NEW.noche, NEW.actualizado_por_id, NEW.actualizado_en);
  return NEW;
end;
$$;

create trigger guardar_historial_tras_cambio
  after insert or update on public.contenciones
  for each row execute function public.registrar_historial_contencion();

-- ── Seguridad ────────────────────────────────────────────────
alter table public.contenciones enable row level security;
alter table public.contenciones_historial enable row level security;

create policy leer_autenticado on public.contenciones
  for select to authenticated using (private.mi_rol() is not null);

create policy leer_autenticado on public.contenciones_historial
  for select to authenticated using (private.mi_rol() is not null);
-- Sin política de escritura para contenciones_historial: solo se
-- escribe desde el disparador de arriba (SECURITY DEFINER), nadie
-- puede tocarlo directamente ni siquiera un administrador.

-- Cualquier profesional asistencial puede pautar/modificar, mientras
-- el episodio siga activo. registrado como quien tiene la sesión.
create policy escribir_equipo on public.contenciones
  for insert to authenticated
  with check (
    private.mi_rol() in ('medico', 'enfermeria', 'auxiliar', 'tecnico')
    and exists (select 1 from ingresos i where i.id = contenciones.ingreso_id and i.estado = 'activo')
    and actualizado_por_id = (select id from profesionales where user_id = auth.uid() limit 1)
  );

create policy modificar_equipo on public.contenciones
  for update to authenticated
  using (
    private.mi_rol() in ('medico', 'enfermeria', 'auxiliar', 'tecnico')
    and exists (select 1 from ingresos i where i.id = contenciones.ingreso_id and i.estado = 'activo')
  )
  with check (
    private.mi_rol() in ('medico', 'enfermeria', 'auxiliar', 'tecnico')
    and actualizado_por_id = (select id from profesionales where user_id = auth.uid() limit 1)
  );

commit;
