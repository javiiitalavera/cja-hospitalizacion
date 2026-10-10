-- CJA Hospital — El semáforo de caídas entra en la copia diaria de la pauta (2026-10-10)
--
-- La hoja de turno enseña (e imprime) el color del semáforo de caídas de cada paciente.
-- Para que el histórico también lo conserve, la copia nocturna de la pauta lo guarda.
-- Las copias anteriores a este cambio no lo tienen: en esos días la hoja sale sin color.
--
-- Transaccional e idempotente. Requiere 20261010_admin_y_pauta_historico.sql.

begin;

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
      'via', (select v.via from public.pauta_via v where v.ingreso_id = i.id),
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

-- La copia de hoy se rehace ya, con el semáforo.
select public.generar_snapshot_pauta();

commit;
