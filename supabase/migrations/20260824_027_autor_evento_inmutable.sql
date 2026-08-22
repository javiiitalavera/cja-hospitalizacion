-- ============================================================
-- El autor de una incidencia no se puede cambiar al editarla
--
-- La política de UPDATE sobre "eventos" comprueba rol y episodio
-- activo, pero no impide que, mediante la API directa (no desde la
-- pantalla, que nunca lo permite), alguien cambie registrado_por_id
-- de una incidencia ya existente y se la atribuya a otra persona.
--
-- Una política RLS no puede comparar el valor "antes" y "después" en
-- un UPDATE (solo ve el resultado final), así que se usa un disparador,
-- que sí tiene acceso a ambos.
--
-- Re-ejecutable sin dar error.
-- ============================================================

begin;

create or replace function evitar_cambio_autor_evento()
returns trigger
language plpgsql
as $$
begin
  if NEW.registrado_por_id is distinct from OLD.registrado_por_id then
    raise exception 'No se puede cambiar quién registró una incidencia ya existente.';
  end if;
  return NEW;
end;
$$;

drop trigger if exists bloquear_cambio_autor_evento on eventos;
create trigger bloquear_cambio_autor_evento
  before update on eventos
  for each row
  execute function evitar_cambio_autor_evento();

commit;
