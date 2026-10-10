-- CJA Hospital — El motivo del alta del CMBD tiene que cuadrar con el estado del episodio (2026-10-12)
--
-- Hasta ahora cmbd.circunstancia_alta se podía cambiar a mano en la pestaña CMBD sin tocar el estado del
-- ingreso. Resultado comprobado: un episodio en estado «alta» con «Éxitus» en el CMBD; el Dashboard contaba
-- una alta, el fichero del CMBD decía que el paciente había fallecido.
--
-- Regla que impone esta migración (la misma que ya aplica dar_de_alta()):
--   · Episodio activo         → el motivo del alta tiene que estar vacío.
--   · Episodio dado de alta   → el motivo tiene que corresponder a su estado:
--        1 Domicilio, 3 Alta voluntaria, 9 Otras   → «alta»
--        2 Traslado a otro hospital, 5 Sociosanitario → «alta_traslado»
--        4 Éxitus                                  → «exitus»
--     Sí se puede cambiar entre los de un mismo estado (de 1 a 3, por ejemplo).
--   · dar_de_alta() y reabrir_episodio() quedan exentos (ya lo fijan ellos de forma coherente).
--
-- Solo se valida cuando el valor CAMBIA: un guardado automático que reenvía el mismo valor no falla.
-- Transaccional e idempotente.

begin;

-- Estado del episodio que corresponde a cada motivo de alta. Un único sitio en SQL; dar_de_alta()
-- tiene su propia copia de esta tabla (no se ha tocado) y src/lib/alta.ts la suya: si cambia una,
-- cambian las tres.
create or replace function private.estado_segun_circunstancia(p_codigo text) returns text
language sql immutable
set search_path = ''
as $$
  select case p_codigo
    when '1' then 'alta'
    when '3' then 'alta'
    when '9' then 'alta'
    when '2' then 'alta_traslado'
    when '5' then 'alta_traslado'
    when '4' then 'exitus'
    else null
  end;
$$;

revoke execute on function private.estado_segun_circunstancia(text) from public, anon;
grant execute on function private.estado_segun_circunstancia(text) to authenticated;

-- Limpieza previa (antes de crear el disparador): en un episodio ACTIVO no puede haber motivo de alta.
-- Eran elecciones hechas con antelación en la pestaña CMBD; al dar de alta se vuelve a fijar de todos modos.
update public.cmbd c
set circunstancia_alta = null
from public.ingresos i
where i.id = c.ingreso_id
  and i.estado = 'activo'
  and c.circunstancia_alta is not null;

create or replace function public.validar_circunstancia_alta_cmbd() returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_estado text;
begin
  -- dar_de_alta() y reabrir_episodio() marcan la transacción: ellos ya dejan todo coherente.
  if coalesce(current_setting('app.cambio_estado_ingreso_rpc', true), '') = 'true' then
    return new;
  end if;

  -- Sin cambio en este campo no hay nada que validar (guardados automáticos que reenvían la fila entera).
  if tg_op = 'UPDATE' and new.circunstancia_alta is not distinct from old.circunstancia_alta then
    return new;
  end if;

  -- Vaciarlo se permite: deja el CMBD incompleto, no incoherente.
  if new.circunstancia_alta is null then
    return new;
  end if;

  select i.estado into v_estado from public.ingresos i where i.id = new.ingreso_id;

  if v_estado = 'activo' then
    raise exception 'El motivo del alta se registra al dar de alta al paciente, no antes.';
  end if;

  if v_estado is distinct from private.estado_segun_circunstancia(new.circunstancia_alta) then
    raise exception 'El motivo del alta (%) no corresponde al estado del episodio (%).',
      new.circunstancia_alta, v_estado;
  end if;

  return new;
end;
$$;

revoke execute on function public.validar_circunstancia_alta_cmbd() from public, anon, authenticated;

drop trigger if exists validar_circunstancia_alta on public.cmbd;
create trigger validar_circunstancia_alta
  before insert or update on public.cmbd
  for each row execute function public.validar_circunstancia_alta_cmbd();

commit;
