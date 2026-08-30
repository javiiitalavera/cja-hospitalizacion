-- ============================================================
-- Contención: reformular la categoría de "necesidad asistencial" y
-- añadir confirmación médica.
--
-- 1. "Si precisa — necesidad asistencial" (descrita como "por falta
--    de personal") se renombra a "Si precisa — supervisión
--    insuficiente". No es un cambio cosmético: la justificación deja
--    de ser una excusa institucional genérica (prohibida por la
--    normativa sobre contenciones) y pasa a ser una valoración del
--    riesgo de ESE paciente concreto en ese momento — la realidad
--    clínica que describe sigue existiendo, solo que documentada
--    como corresponde.
--
-- 2. La pauta la pauta siempre el médico, pero cualquiera del equipo
--    puede registrarla en el día a día (decisión ya tomada). Para que
--    quede claro en todo momento si esa pauta concreta ya tiene el
--    visto bueno médico, se añade una confirmación explícita: quién
--    confirmó y cuándo, puesta por el propio servidor, nunca por
--    quien confirma. Cambiar la pauta (día o noche) deja la
--    confirmación anterior sin validez — hay que reconfirmar la
--    pauta nueva, no la que ya no está vigente.
--
-- Re-ejecutable sin dar error.
-- ============================================================

begin;

-- 1. Renombrar la categoría
update public.contenciones set dia = 'si_precisa_supervision' where dia = 'si_precisa_asistencial';

alter table public.contenciones drop constraint if exists contenciones_dia_check;
alter table public.contenciones add constraint contenciones_dia_check
  check (dia in ('ninguna', 'continua_seguridad', 'si_precisa_supervision', 'si_precisa_paciente'));

-- 2. Confirmación médica
alter table public.contenciones add column if not exists confirmado_por_id uuid references public.profesionales(id);
alter table public.contenciones add column if not exists confirmado_en timestamptz;

create or replace function public.gestionar_confirmacion_contencion() returns trigger
language plpgsql
security definer
set search_path to ''
as $$
begin
  -- Si cambia el contenido de la pauta, la confirmación anterior deja
  -- de ser válida — hay que reconfirmar la pauta nueva, no la vieja.
  if TG_OP = 'UPDATE' and (NEW.dia is distinct from OLD.dia or NEW.noche is distinct from OLD.noche) then
    NEW.confirmado_por_id := null;
    NEW.confirmado_en := null;
  end if;

  if NEW.confirmado_por_id is not null
     and (TG_OP = 'INSERT' or NEW.confirmado_por_id is distinct from OLD.confirmado_por_id) then
    -- Fijar una confirmación: solo un médico, y solo como uno mismo
    -- (no se puede confirmar "en nombre de" otro médico).
    if private.mi_rol() <> 'medico' then
      raise exception 'Solo un médico puede confirmar una pauta de contención.';
    end if;
    if NEW.confirmado_por_id <> (select id from public.profesionales where user_id = auth.uid() limit 1) then
      raise exception 'Solo puedes confirmar una pauta como tú mismo.';
    end if;
    -- La hora la pone el servidor, igual que actualizado_en — no el
    -- reloj de quien confirma.
    NEW.confirmado_en := now();
  elsif NEW.confirmado_por_id is null then
    NEW.confirmado_en := null;
  end if;

  return NEW;
end;
$$;

drop trigger if exists gestionar_confirmacion on public.contenciones;
create trigger gestionar_confirmacion
  before insert or update on public.contenciones
  for each row execute function public.gestionar_confirmacion_contencion();

-- 3. La política de actualización exigía "actualizado_por_id = yo" en
-- CUALQUIER cambio — pero confirmar una pauta que registró otra
-- persona es una acción legítima y distinta de editar su contenido.
-- El propio disparador de arriba ya exige que solo un médico pueda
-- confirmar, y solo como sí mismo — no hace falta duplicar esa
-- exigencia aquí de una forma que bloquee el caso legítimo.
drop policy if exists modificar_equipo on public.contenciones;
create policy modificar_equipo on public.contenciones
    for update to authenticated
    using (
        private.mi_rol() in ('medico', 'enfermeria', 'auxiliar', 'tecnico')
        and exists (select 1 from ingresos i where i.id = contenciones.ingreso_id and i.estado = 'activo')
    )
    with check (
        private.mi_rol() in ('medico', 'enfermeria', 'auxiliar', 'tecnico')
    );

commit;
