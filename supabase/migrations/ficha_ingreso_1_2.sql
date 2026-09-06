-- ============================================================
-- Ficha del ingreso, puntos 1 y 2 de la auditoría.
--
-- 1. Informe de ingreso pasa a ser editable por un médico incluso
--    con el episodio ya cerrado (el informe de alta se apoya en sus
--    antecedentes, alergias, exploraciones y tratamiento — si se
--    detecta un error después del alta, tiene que poder corregirse).
--    Incidencias pasa a poder registrarse y editarse tras el cierre.
--    Solo se toca "editar" y "crear" de incidencias — "borrar" se
--    deja exactamente como estaba (la auditoría no pedía cambiarlo,
--    y es más prudente no ampliar el borrado sin que se haya pedido).
--
-- 2. Una única función transaccional para dar de alta: actualiza el
--    estado del ingreso y el motivo del CMBD a la vez, para que
--    nunca quede un ingreso cerrado con el CMBD vacío o con un
--    motivo que no encaja.
--
-- Re-ejecutable sin dar error.
-- ============================================================

begin;

-- ── 1. RLS relajada ──────────────────────────────────────────

drop policy if exists escribir_medico on public.informe_ingreso;
create policy escribir_medico on public.informe_ingreso to authenticated
    using (private.mi_rol() = 'medico')
    with check (private.mi_rol() = 'medico');

drop policy if exists crear_evento on public.eventos;
create policy crear_evento on public.eventos for insert to authenticated
    with check (
        private.mi_rol() in ('medico', 'enfermeria', 'auxiliar', 'tecnico')
        and registrado_por_id = (select id from profesionales where user_id = auth.uid() limit 1)
    );

drop policy if exists editar_evento on public.eventos;
create policy editar_evento on public.eventos for update to authenticated
    using (private.mi_rol() in ('medico', 'enfermeria', 'auxiliar', 'tecnico'))
    with check (private.mi_rol() in ('medico', 'enfermeria', 'auxiliar', 'tecnico'));

-- borrar_evento se deja tal cual — sigue exigiendo episodio activo,
-- autor o admin, sin cambios.

-- ── 2. Dar de alta, de forma atómica ─────────────────────────

-- Los mismos seis códigos que ya usa el propio CMBD (TIPALT en
-- TabCMBD.tsx) — una sola elección, no dos preguntas separadas por
-- la misma cosa.
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

  update public.ingresos
  set estado = v_estado, fecha_alta = p_fecha_alta
  where id = p_ingreso_id and estado = 'activo'
  returning * into v_actualizado;

  if not found then
    raise exception 'Este episodio ya no está activo, o no existe.';
  end if;

  -- El CMBD ya existe siempre (se crea junto con el ingreso) — aquí
  -- solo se actualiza, nunca se inserta una fila nueva.
  update public.cmbd
  set circunstancia_alta = p_circunstancia_alta
  where ingreso_id = p_ingreso_id;

  return jsonb_build_object('estado', v_estado, 'fecha_alta', v_actualizado.fecha_alta);
end;
$$;

grant execute on function public.dar_de_alta(uuid, date, text) to authenticated;

commit;
