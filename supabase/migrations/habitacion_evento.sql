-- ============================================================
-- La habitación de una incidencia se obtenía siempre del ingreso
-- actual — si el paciente se trasladaba de habitación después, el
-- registro histórico "cambiaba" de habitación con él, aunque la
-- incidencia hubiera pasado en la anterior. Se guarda ahora una foto
-- fija en el momento de crear la incidencia, que ya no se mueve.
--
-- Re-ejecutable sin dar error.
-- ============================================================

begin;

alter table public.eventos add column if not exists habitacion_evento integer;

create or replace function public.fijar_habitacion_evento() returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if NEW.habitacion_evento is null then
    select habitacion into NEW.habitacion_evento from public.ingresos where id = NEW.ingreso_id;
  end if;
  return NEW;
end;
$$;

drop trigger if exists fijar_habitacion_evento on public.eventos;
create trigger fijar_habitacion_evento
  before insert on public.eventos
  for each row execute function public.fijar_habitacion_evento();

-- Para las incidencias ya existentes, se rellena una vez con la
-- habitación actual — es la mejor aproximación posible a estas
-- alturas, ya que no se guardó en su momento.
update public.eventos set habitacion_evento = (
  select habitacion from public.ingresos where ingresos.id = eventos.ingreso_id
) where habitacion_evento is null;

commit;
