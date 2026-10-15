-- CJA Hospital — Registro de accesos: exportaciones a CSV (2026-10-22)
--
-- Auditoría → Accesos apuntaba quién exportaba a Word, pero no quién sacaba un CSV con datos de pacientes
-- (Incidencias → Histórico, Dashboard → Explorador de episodios, y la propia Auditoría). Se añade el tipo
-- «exportacion_csv» a la tabla y a la función que escribe en ella.
--
-- Transaccional e idempotente.

begin;

-- 1. La restricción de tipos permitidos (se busca por su contenido, sea cual sea el nombre que tenga).
do $$
declare
  v_nombre text;
begin
  for v_nombre in
    select c.conname
      from pg_constraint c
     where c.conrelid = 'public.registro_accesos'::regclass
       and c.contype = 'c'
       and pg_get_constraintdef(c.oid) ilike '%inicio_sesion%'
  loop
    execute format('alter table public.registro_accesos drop constraint %I', v_nombre);
  end loop;
end $$;

alter table public.registro_accesos
  add constraint registro_accesos_tipo_check
  check (tipo in ('inicio_sesion', 'expediente', 'ficha_paciente', 'impresion', 'exportacion_word', 'exportacion_csv'));

-- 2. La función que escribe en el registro.
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
  if p_tipo is null or p_tipo not in ('inicio_sesion', 'expediente', 'ficha_paciente', 'impresion', 'exportacion_word', 'exportacion_csv') then
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

commit;
