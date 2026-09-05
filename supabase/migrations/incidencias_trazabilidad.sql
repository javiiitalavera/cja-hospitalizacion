-- ============================================================
-- Incidencias: trazabilidad real, permisos separados, y estado de
-- pendiente/completa — auditoría muy completa, aplicada por partes.
--
-- 1. Editar deja de exigir ser el autor o admin — cualquier
--    profesional asistencial puede completar una incidencia en
--    turnos posteriores. Borrar sigue exigiendo ser el autor o admin,
--    sin cambios ahí.
-- 2. Se añaden actualizado_por_id/actualizado_en, puestos siempre por
--    el servidor según quien de verdad hace el cambio — nunca a
--    mano. registrado_por_id sigue inmutable, como ya estaba.
-- 3. Se añade un estado sencillo (pendiente/completa) para
--    incidencias cuyo desenlace se sabrá más adelante.
-- 4. Auditoría de verdad: cada alta, cambio y borrado de una
--    incidencia queda registrado con los valores de antes y de
--    después, no solo "algo cambió".
--
-- Re-ejecutable sin dar error.
-- ============================================================

begin;

alter table public.eventos add column if not exists actualizado_por_id uuid references public.profesionales(id);
alter table public.eventos add column if not exists actualizado_en timestamptz;
alter table public.eventos add column if not exists estado text not null default 'completa' check (estado in ('pendiente', 'completa'));

-- La auditoría general (tabla, registro, acción, usuario, fecha) no
-- guarda qué cambió exactamente — suficiente para la mayoría de
-- tablas, pero no para incidencias, donde sí importa poder ver qué
-- decía antes y qué dice después. Dos columnas nuevas, opcionales,
-- que solo rellena el disparador de eventos — el resto de tablas
-- sigue exactamente igual que hasta ahora.
alter table public.auditoria add column if not exists valores_antes jsonb;
alter table public.auditoria add column if not exists valores_despues jsonb;

-- Pone siempre actualizado_por_id/actualizado_en según quien hace el
-- cambio de verdad — nunca lo que mande el propio cliente. Se separa
-- de evitar_cambio_autor_evento (que ya existía y sigue igual)
-- porque son responsabilidades distintas: una impide cambiar el
-- autor original, esta otra fija quién tocó la fila por última vez.
create or replace function public.fijar_actualizado_por_evento() returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  NEW.actualizado_por_id := (select id from public.profesionales where user_id = auth.uid() limit 1);
  NEW.actualizado_en := now();
  return NEW;
end;
$$;

drop trigger if exists fijar_actualizado_por on public.eventos;
create trigger fijar_actualizado_por
  before update on public.eventos
  for each row execute function public.fijar_actualizado_por_evento();

-- Auditoría con valores de antes/después, solo para eventos —
-- confirma qué decía la incidencia exactamente antes y después de
-- cada cambio, y quién fue, no solo que "alguien la tocó".
create or replace function public.registrar_auditoria_eventos() returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_usuario uuid;
begin
  select id into v_usuario from public.profesionales where user_id = auth.uid() limit 1;
  insert into public.auditoria (tabla, registro_id, accion, usuario_id, valores_antes, valores_despues)
  values (
    'eventos',
    coalesce(NEW.id, OLD.id),
    lower(TG_OP),
    v_usuario,
    case when TG_OP = 'INSERT' then null else to_jsonb(OLD) end,
    case when TG_OP = 'DELETE' then null else to_jsonb(NEW) end
  );
  return coalesce(NEW, OLD);
end;
$$;

drop trigger if exists aud_eventos on public.eventos;
create trigger aud_eventos
  after insert or update or delete on public.eventos
  for each row execute function public.registrar_auditoria_eventos();

-- Editar: cualquier profesional asistencial, en un episodio activo —
-- ya no exige ser el autor ni admin. Borrar sigue exigiendo serlo,
-- sin ningún cambio respecto a como estaba.
drop policy if exists editar_evento on public.eventos;
create policy editar_evento on public.eventos for update to authenticated
    using (
        private.mi_rol() in ('medico', 'enfermeria', 'auxiliar', 'tecnico')
        and exists (select 1 from ingresos i where i.id = eventos.ingreso_id and i.estado = 'activo')
    )
    with check (
        private.mi_rol() in ('medico', 'enfermeria', 'auxiliar', 'tecnico')
        and exists (select 1 from ingresos i where i.id = eventos.ingreso_id and i.estado = 'activo')
    );

commit;
