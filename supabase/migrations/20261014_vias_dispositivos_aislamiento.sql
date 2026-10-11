-- CJA Hospital — Vías, sonda vesical, oxigenoterapia y aislamiento en la Hoja de ítems (2026-10-14)
--
-- Todo esto vive ahora en items_paciente (la Hoja de ítems), que es la única fuente: la Pauta de cuidados de la
-- ficha, las Hojas de turno y la Hoja de ítems leen y escriben las mismas columnas, así que no hay nada duplicado.
--
--   · vias            Vías y dispositivos de acceso (venosa, subcutánea, central, SNG, PEG, ostomía, traqueostomía).
--                     Sustituye a pauta_via, que solo admitía una vía (venosa o subcutánea).
--   · sonda_fecha / sonda_calibre             Detalle de la sonda vesical (casilla sonda_vesical, que ya existía).
--   · oxigeno_dispositivo / oxigeno_flujo     Detalle de la oxigenoterapia (casilla oxigenoterapia, que ya existía).
--   · aislamiento     Contacto y/o gotas.
--
-- Los detalles de la sonda y del oxígeno solo pueden tener valor si la casilla correspondiente está marcada.
-- Los datos de pauta_via se copian a vias. pauta_via se deja en su sitio (sin uso) para no perder su histórico
-- de auditoría; se podrá borrar más adelante.
--
-- Transaccional e idempotente. Requiere 20261010_pauta_cuidados.sql.

begin;

alter table public.items_paciente
    add column if not exists vias text[] not null default '{}',
    add column if not exists sonda_fecha date,
    add column if not exists sonda_calibre smallint,
    add column if not exists oxigeno_dispositivo text,
    add column if not exists oxigeno_flujo numeric(3, 1),
    add column if not exists aislamiento text[] not null default '{}';

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'items_vias_validas') then
    alter table public.items_paciente add constraint items_vias_validas check (
      vias <@ array['venosa', 'subcutanea', 'central', 'sng', 'peg', 'ostomia', 'traqueostomia']::text[]);
  end if;
  if not exists (select 1 from pg_constraint where conname = 'items_aislamiento_valido') then
    alter table public.items_paciente add constraint items_aislamiento_valido check (
      aislamiento <@ array['contacto', 'gotas']::text[]);
  end if;
  if not exists (select 1 from pg_constraint where conname = 'items_sonda_calibre_valido') then
    alter table public.items_paciente add constraint items_sonda_calibre_valido check (
      sonda_calibre is null or sonda_calibre between 6 and 30);
  end if;
  if not exists (select 1 from pg_constraint where conname = 'items_sonda_detalle_coherente') then
    alter table public.items_paciente add constraint items_sonda_detalle_coherente check (
      coalesce(sonda_vesical, false) or (sonda_fecha is null and sonda_calibre is null));
  end if;
  if not exists (select 1 from pg_constraint where conname = 'items_oxigeno_dispositivo_valido') then
    alter table public.items_paciente add constraint items_oxigeno_dispositivo_valido check (
      oxigeno_dispositivo is null or oxigeno_dispositivo in ('gafas', 'mascarilla', 'reservorio'));
  end if;
  if not exists (select 1 from pg_constraint where conname = 'items_oxigeno_flujo_valido') then
    alter table public.items_paciente add constraint items_oxigeno_flujo_valido check (
      oxigeno_flujo is null or (oxigeno_flujo > 0 and oxigeno_flujo <= 15));
  end if;
  if not exists (select 1 from pg_constraint where conname = 'items_oxigeno_detalle_coherente') then
    alter table public.items_paciente add constraint items_oxigeno_detalle_coherente check (
      coalesce(oxigenoterapia, false) or (oxigeno_dispositivo is null and oxigeno_flujo is null));
  end if;
end $$;

-- Las vías que ya estaban pautadas pasan a la Hoja de ítems. Si un ingreso aún no tuviera fila de ítems, se crea.
insert into public.items_paciente (ingreso_id)
select pv.ingreso_id from public.pauta_via pv
where not exists (select 1 from public.items_paciente ip where ip.ingreso_id = pv.ingreso_id)
on conflict (ingreso_id) do nothing;

update public.items_paciente ip
set vias = array[pv.via]
from public.pauta_via pv
where pv.ingreso_id = ip.ingreso_id and ip.vias = '{}';

comment on table public.pauta_via is 'Sin uso desde 20261014: las vías están en items_paciente.vias. Se conserva por su histórico de auditoría.';

-- La copia nocturna de la pauta guarda ahora todas las vías (lista) y el aislamiento. Las copias antiguas tienen
-- «via» (un solo valor): la aplicación entiende las dos formas.
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
      'semaforo', ip.semaforo_caidas,
      'vias', to_jsonb(coalesce(ip.vias, '{}'::text[])),
      'aislamiento', to_jsonb(coalesce(ip.aislamiento, '{}'::text[])),
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

commit;
