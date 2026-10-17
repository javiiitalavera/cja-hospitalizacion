-- CJA Hospital — Dashboard · Contenciones: correcciones (2026-10-25)
--
-- Reemplaza public.dashboard_contenciones (ya desplegada con 20261024) con tres ajustes. No cambia tablas ni datos.
--  1) Un alta con fecha retroactiva ya no alarga la contención más allá del alta: el tramo acaba en la fecha de alta y se
--     cuenta como «por alta», no como retirada, aunque se hubiera registrado un cambio de pauta posterior.
--  2) «Al ingreso» (contención al ingreso frente al alta) mira solo los 3 primeros días (día de ingreso y los dos
--     siguientes), como dice la definición en pantalla; antes incluía también el cuarto.
--  3) Solo comentario: la hora repetida del cambio de horario de otoño (2:00-3:00) es ambigua porque los sucesos guardan
--     fecha y hora sin zona. Pasa una noche al año y solo afecta si en esa misma hora cambia la pauta; no se corrige.
--
-- Requiere 20261024 (usa private.categoria_contencion). Transaccional e idempotente.

begin;

-- Dashboard · Contenciones. Reconstruye, día a día, la pauta de contención de cada episodio a partir del historial de
-- cambios (contenciones_historial): una pauta vale desde el día en que se registró hasta el día en que se cambió. Los
-- días anteriores al primer registro de un episodio cuentan como «sin registro»: no se sabe qué había, y no se da por
-- «ninguna». Un día de un episodio cuenta si el paciente estaba ingresado esa noche (ingreso ≤ día < alta), igual que la
-- ocupación del Dashboard. Las fechas se toman en hora de Madrid.
create or replace function public.dashboard_contenciones(
  p_desde date,
  p_hasta date,
  p_medico_id uuid default null
) returns jsonb
language plpgsql
security invoker
stable
set search_path = ''
as $$
declare
  c_umbral constant integer := 30;          -- días de contención activa seguidos a partir de los cuales se avisa
  c_ventana_ingreso constant integer := 3;  -- la primera pauta cuenta «al ingreso» si se registró en estos días
  v_hoy date := (now() at time zone 'Europe/Madrid')::date;
  v_bucket text;
  v_resultado jsonb;
begin
  if not private.soy_admin() then
    raise exception 'Solo un administrador puede acceder al Dashboard.';
  end if;
  if p_desde > p_hasta then
    raise exception 'La fecha "desde" no puede ser posterior a "hasta".';
  end if;

  v_bucket := case
    when (p_hasta - p_desde) + 1 <= 31 then 'day'
    when (p_hasta - p_desde) + 1 <= 180 then 'week'
    else 'month'
  end;

  with
  -- Episodios que se solapan con el periodo o siguen abiertos (los abiertos hacen falta para saber desde cuándo llevan
  -- la contención).
  ep as (
    select i.id, i.paciente_id, i.habitacion, i.estado, i.fecha_ingreso, i.fecha_alta
    from public.ingresos i
    where i.fecha_ingreso <= greatest(p_hasta, v_hoy)
      and (i.fecha_alta is null or i.fecha_alta >= p_desde)
      and (p_medico_id is null or i.medico_responsable_id = p_medico_id)
  ),
  -- Cada cambio de pauta, con el día en que se hizo. Las confirmaciones no cambian la pauta y no se cuentan.
  est0 as (
    select h.id, h.ingreso_id, h.cambiado_en, h.dia, h.noche,
           (h.cambiado_en at time zone 'Europe/Madrid')::date as desde
    from public.contenciones_historial h
    where h.ingreso_id in (select id from ep)
      and (h.tipo_accion is null or h.tipo_accion in ('pauta_creada', 'pauta_modificada'))
  ),
  est1 as (
    select e.*, lead(e.desde) over (partition by e.ingreso_id order by e.cambiado_en, e.id) as siguiente
    from est0 e
  ),
  -- Si una pauta se cambia dos veces el mismo día, vale la última: la anterior no llega a durar ningún día.
  est as (
    select * from est1 where siguiente is distinct from desde
  ),
  dias as (
    select generate_series(p_desde, p_hasta, interval '1 day')::date as d
  ),
  -- Un registro por paciente y día ingresado, con la pauta que había al terminar ese día.
  pd as (
    select ep.id as ingreso_id, dias.d, e.dia, e.noche,
           private.categoria_contencion(e.dia, e.noche) as cat
    from dias
    inner join ep on ep.fecha_ingreso <= dias.d and (ep.fecha_alta is null or ep.fecha_alta > dias.d)
    left join est e on e.ingreso_id = ep.id and e.desde <= dias.d and (e.siguiente is null or e.siguiente > dias.d)
  ),
  rangos as (
    select greatest(x.natural_inicio::date, p_desde) as inicio,
           least((x.natural_inicio + ('1 ' || v_bucket)::interval)::date - 1, p_hasta) as fin
    from (
      select generate_series(date_trunc(v_bucket, p_desde::timestamp), p_hasta::timestamp, ('1 ' || v_bucket)::interval) as natural_inicio
    ) x
  ),
  -- Tramos seguidos de contención activa (en cualquiera de los dos ejes), unidos aunque pasen de «día» a «noche».
  tramos0 as (
    select e.ingreso_id, e.id, e.cambiado_en, e.desde, e.siguiente, ep.estado,
           private.categoria_contencion(e.dia, e.noche) = 'activa' as activa,
           -- Un tramo no pasa de la fecha de alta, aunque después se registrara un cambio de pauta (alta retroactiva).
           least(coalesce(e.siguiente, case when ep.estado = 'activo' then v_hoy + 1 else ep.fecha_alta end),
                 coalesce(ep.fecha_alta, 'infinity'::date)) as hasta,
           (e.siguiente is null or (ep.estado <> 'activo' and e.siguiente >= ep.fecha_alta)) as fin_por_alta
    from est e
    inner join ep on ep.id = e.ingreso_id
  ),
  tramos1 as (
    select t.*,
           case when t.activa is not distinct from lag(t.activa) over w then 0 else 1 end as nuevo
    from tramos0 t
    where t.hasta > t.desde
    window w as (partition by t.ingreso_id order by t.desde, t.cambiado_en, t.id)
  ),
  tramos2 as (
    select t.*, sum(t.nuevo) over (partition by t.ingreso_id order by t.desde, t.cambiado_en, t.id) as grupo
    from tramos1 t
  ),
  islas as (
    select t.ingreso_id, t.grupo, min(t.desde) as desde, max(t.hasta) as hasta,
           case
             when bool_or(t.siguiente is null) and max(t.estado) = 'activo' then 'vigente'
             when bool_or(t.fin_por_alta) then 'alta'
             else 'retirada'
           end as cierre
    from tramos2 t
    where t.activa
    group by t.ingreso_id, t.grupo
  ),
  islas_n as (
    select i.*, (i.hasta - i.desde) as dias from islas i
  ),
  -- Caídas y agresiones físicas, con la pauta que había en el momento (la última registrada antes). Sin hora, se toma
  -- el final de ese día. Limitación conocida: el suceso guarda fecha y hora locales sin zona, así que la hora repetida
  -- al acabar el horario de verano (2:00-3:00 de la última noche de octubre) es ambigua y se toma la segunda vez.
  ev as (
    select e.id, e.tipo, e.ingreso_id, e.datos,
           ((e.fecha + coalesce(e.hora, time '23:59:59'))::timestamp at time zone 'Europe/Madrid') as momento,
           coalesce(e.turno, case
             when e.hora is null then null
             when e.hora >= time '08:00' and e.hora < time '15:00' then 'manana'
             when e.hora >= time '15:00' and e.hora < time '22:00' then 'tarde'
             else 'noche'
           end) as turno
    from public.eventos e
    inner join public.ingresos i on i.id = e.ingreso_id
    where e.tipo in ('caida', 'agresividad_fisica')
      and e.fecha between p_desde and p_hasta
      and (p_medico_id is null or i.medico_responsable_id = p_medico_id)
  ),
  ev2 as (
    select ev.id, ev.tipo, ev.datos, ev.turno, s.dia, s.noche, (s.id is not null) as hay_pauta,
           case when ev.turno = 'noche' then 'noche' when ev.turno in ('manana', 'tarde') then 'dia' end as franja
    from ev
    left join lateral (
      select h.id, h.dia, h.noche
      from public.contenciones_historial h
      where h.ingreso_id = ev.ingreso_id
        and (h.tipo_accion is null or h.tipo_accion in ('pauta_creada', 'pauta_modificada'))
        and h.cambiado_en <= ev.momento
      order by h.cambiado_en desc, h.id desc
      limit 1
    ) s on true
  ),
  -- true = contención activa en esa franja; false = pauta registrada sin ella; null = sin pauta registrada.
  ev3 as (
    select e.*,
           case
             when e.franja = 'dia' then case when e.dia is null then null else e.dia = 'continua_seguridad' end
             when e.franja = 'noche' then case when e.noche is null then null else coalesce('contencion_fija' = any(e.noche), false) end
           end as expuesto
    from ev2 e
  ),
  -- Para cada franja: días de paciente con y sin contención activa (los días sin registro quedan fuera).
  expo as (
    select f.franja, f.expuesto, count(*) as dias
    from (
      select 'dia'::text as franja, (p.dia = 'continua_seguridad') as expuesto from pd p where p.dia is not null
      union all
      select 'noche', coalesce('contencion_fija' = any(p.noche), false) from pd p where p.noche is not null
    ) f
    group by f.franja, f.expuesto
  ),
  altas as (
    select ep.id, ep.fecha_ingreso, ep.fecha_alta
    from ep
    where ep.estado <> 'activo' and ep.fecha_alta between p_desde and p_hasta
  ),
  altas_cat as (
    select a.id,
           private.categoria_contencion(i.dia, i.noche) as al_ingreso,
           private.categoria_contencion(f.dia, f.noche) as al_alta
    from altas a
    left join lateral (
      select e.dia, e.noche from est0 e
      where e.ingreso_id = a.id and e.desde < a.fecha_ingreso + c_ventana_ingreso
      order by e.cambiado_en, e.id limit 1
    ) i on true
    left join lateral (
      select e.dia, e.noche from est0 e
      where e.ingreso_id = a.id and e.desde <= a.fecha_alta
      order by e.cambiado_en desc, e.id desc limit 1
    ) f on true
  )
  select jsonb_build_object(
    'agrupacion', v_bucket,
    'umbral_dias', c_umbral,
    'ventana_ingreso_dias', c_ventana_ingreso,

    -- 1) Evolución: días de paciente por categoría en cada tramo del periodo.
    'serie', coalesce((
      select jsonb_agg(jsonb_build_object(
        'inicio', r.inicio, 'fin', r.fin,
        'dias_paciente', x.total,
        'dias_activa', x.activa,
        'dias_si_precisa', x.si_precisa,
        'dias_sin_dato', x.sin_dato
      ) order by r.inicio)
      from rangos r
      cross join lateral (
        select count(*) as total,
               count(*) filter (where p.cat = 'activa') as activa,
               count(*) filter (where p.cat = 'si_precisa') as si_precisa,
               count(*) filter (where p.cat = 'sin_dato') as sin_dato
        from pd p where p.d between r.inicio and r.fin
      ) x
    ), '[]'::jsonb),

    -- 2) Medidas, de día y de noche (la noche admite varias a la vez, así que se solapan).
    'medidas', jsonb_build_object(
      'dias_paciente', (select count(*) from pd),
      'dia_sin_dato', (select count(*) from pd where dia is null),
      'noche_sin_dato', (select count(*) from pd where noche is null),
      'dia', coalesce((
        select jsonb_agg(jsonb_build_object('clave', m.dia, 'dias', m.dias, 'pacientes', m.pacientes) order by m.orden)
        from (
          select p.dia, count(*) as dias, count(distinct p.ingreso_id) as pacientes,
                 case p.dia when 'continua_seguridad' then 1 when 'si_precisa_supervision' then 2 when 'si_precisa_paciente' then 3 else 4 end as orden
          from pd p where p.dia is not null group by p.dia
        ) m
      ), '[]'::jsonb),
      'noche', coalesce((
        select jsonb_agg(jsonb_build_object('clave', m.clave, 'dias', m.dias, 'pacientes', m.pacientes) order by m.orden)
        from (
          select u.clave, count(*) as dias, count(distinct u.ingreso_id) as pacientes,
                 case u.clave when 'contencion_fija' then 1 when 'contencion_si_precisa' then 2 when '1_barra' then 3
                   when '2_barras' then 4 when 'cota_cero' then 5 when 'sensor_presion' then 6 else 7 end as orden
          from (
            select p.ingreso_id, unnest(p.noche) as clave from pd p where p.noche is not null and cardinality(p.noche) > 0
            union all
            select p.ingreso_id, 'ninguna' from pd p where p.noche is not null and cardinality(p.noche) = 0
          ) u
          group by u.clave
        ) m
      ), '[]'::jsonb),
      -- Noches: con contención (fija o si precisa) / solo medidas de seguridad o alternativas / sin nada pautado.
      'noche_resumen', jsonb_build_object(
        'con_contencion', (select count(*) from pd where noche && array['contencion_fija', 'contencion_si_precisa']::text[]),
        'solo_alternativas', (select count(*) from pd where cardinality(noche) > 0 and not (noche && array['contencion_fija', 'contencion_si_precisa']::text[])),
        'sin_nada', (select count(*) from pd where noche is not null and cardinality(noche) = 0)
      )
    ),

    -- 3) Duración de la contención activa.
    'duracion', jsonb_build_object(
      'vigentes', coalesce((
        select jsonb_agg(jsonb_build_object(
          'ingreso_id', i.ingreso_id,
          'paciente', (p.primer_apellido || case when p.segundo_apellido is not null and p.segundo_apellido <> '' then ' ' || p.segundo_apellido else '' end || ', ' || p.nombre),
          'habitacion', ep.habitacion,
          'desde', i.desde,
          'dias', i.dias
        ) order by i.dias desc, p.primer_apellido)
        from islas_n i
        inner join ep on ep.id = i.ingreso_id
        inner join public.pacientes p on p.id = ep.paciente_id
        where i.cierre = 'vigente'
      ), '[]'::jsonb),
      'terminadas', (
        select jsonb_build_object(
          'n', count(*),
          'mediana', round((percentile_cont(0.5) within group (order by i.dias))::numeric, 1),
          'media', round(avg(i.dias)::numeric, 1),
          'maximo', max(i.dias),
          'mas_del_umbral', count(*) filter (where i.dias > c_umbral)
        )
        from islas_n i
        where i.cierre = 'retirada' and i.hasta between p_desde and p_hasta
      )
    ),

    -- 5) Caídas y agresiones físicas según hubiera o no contención activa en ese momento.
    'sucesos', jsonb_build_object(
      'tipos', (
        select coalesce(jsonb_object_agg(t.tipo, jsonb_build_object(
          'total', t.total,
          'sin_turno', t.sin_turno,
          'sin_pauta', t.sin_pauta,
          'con_sujecion_declarada', t.sujecion
        )), '{}'::jsonb)
        from (
          select e.tipo, count(*) as total,
                 count(*) filter (where e.franja is null) as sin_turno,
                 count(*) filter (where e.franja is not null and e.expuesto is null) as sin_pauta,
                 count(*) filter (where e.datos->>'circunstancias' = 'Con sujeción activa') as sujecion
          from ev3 e group by e.tipo
        ) t
      ),
      'franjas', (
        select jsonb_agg(jsonb_build_object(
          'tipo', t.tipo, 'franja', t.franja, 'con_contencion', t.expuesto,
          'sucesos', coalesce(c.n, 0), 'dias', coalesce(x.dias, 0)
        ) order by t.tipo, t.franja, t.expuesto desc)
        from (
          select a.tipo, f.franja, v.expuesto
          from (values ('caida'), ('agresividad_fisica')) a(tipo)
          cross join (values ('dia'), ('noche')) f(franja)
          cross join (values (true), (false)) v(expuesto)
        ) t
        left join (
          select e.tipo, e.franja, e.expuesto, count(*) as n
          from ev3 e where e.franja is not null and e.expuesto is not null
          group by e.tipo, e.franja, e.expuesto
        ) c on c.tipo = t.tipo and c.franja = t.franja and c.expuesto = t.expuesto
        left join expo x on x.franja = t.franja and x.expuesto = t.expuesto
      )
    ),

    -- 6) Contención al ingreso frente a la que había al irse (altas, traslados y exitus del periodo).
    'ingreso_vs_alta', jsonb_build_object(
      'altas', (select count(*) from altas),
      'combinaciones', coalesce((
        select jsonb_agg(jsonb_build_object('al_ingreso', c.al_ingreso, 'al_alta', c.al_alta, 'n', c.n) order by c.al_ingreso, c.al_alta)
        from (
          select coalesce(a.al_ingreso, 'sin_dato') as al_ingreso, coalesce(a.al_alta, 'sin_dato') as al_alta, count(*) as n
          from altas_cat a group by 1, 2
        ) c
      ), '[]'::jsonb)
    )
  ) into v_resultado;

  return v_resultado;
end;
$$;

revoke execute on function private.categoria_contencion(text, text[]) from public, anon;
revoke execute on function public.dashboard_contenciones(date, date, uuid) from public, anon;
grant execute on function private.categoria_contencion(text, text[]) to authenticated;
grant execute on function public.dashboard_contenciones(date, date, uuid) to authenticated;

commit;
