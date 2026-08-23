-- ============================================================
-- CJA Hospital — esquema completo de la base de datos
--
-- Este archivo sustituye a las 28 migraciones anteriores. No es un
-- resumen escrito a mano: se generó ejecutando las 28 migraciones
-- originales, en orden, contra un PostgreSQL real, y extrayendo el
-- esquema resultante directamente del motor — así se garantiza que
-- refleja el estado final exacto, sin conjeturas.
--
-- OJO — NO ejecutar esto contra la base de datos de producción: ya
-- tiene todo esto creado. Este archivo sirve como referencia de cómo
-- es la base de datos hoy, y como punto de partida si algún día se
-- necesita montar un entorno nuevo desde cero (por ejemplo, uno de
-- pruebas).
--
-- Generado: 23 de agosto de 2026.
-- ============================================================

begin;

-- ────────────────────────────────────────────────────────────
-- EXTENSIONES Y ESQUEMAS
-- ────────────────────────────────────────────────────────────

create extension if not exists pgcrypto;
create extension if not exists pg_cron;
create extension if not exists unaccent;

-- Esquema para funciones auxiliares de RLS. Separado de "public" para
-- que no sean invocables directamente por el cliente (solo se usan
-- dentro de las políticas de seguridad de las tablas).
create schema if not exists private;


-- ────────────────────────────────────────────────────────────
-- TABLAS
-- ────────────────────────────────────────────────────────────

-- Envoltorio de unaccent() marcado como IMMUTABLE: unaccent() en sí
-- no lo está (aunque en la práctica el diccionario de acentos no
-- cambia), y una columna generada exige que su expresión sí lo sea.
-- Se define aquí, antes de "pacientes", porque las columnas
-- generadas de esa tabla la necesitan ya creada.
create function public.inmutable_unaccent(text)
returns text
language sql immutable parallel safe
as $$
  select unaccent('unaccent', $1)
$$;

-- Pacientes: identidad y datos que no cambian entre ingresos. Las
-- columnas *_normalizado las calcula sola la base de datos (sin
-- tildes, en minúsculas) para poder buscar sin que importe si el
-- usuario escribe la tilde o no.
create table public.pacientes (
    id uuid primary key default gen_random_uuid(),
    cipna text,
    nhc text,
    nombre text not null,
    primer_apellido text not null,
    segundo_apellido text,
    fecha_nacimiento date,
    sexo text check (sexo in ('hombre', 'mujer', 'otro')),
    dni text,
    municipio text,
    medico_cabecera text,
    contacto_familiar_nombre text,
    contacto_familiar_telefono text,
    created_at timestamptz default now(),
    nombre_normalizado text generated always as (public.inmutable_unaccent(lower(nombre))) stored,
    primer_apellido_normalizado text generated always as (public.inmutable_unaccent(lower(primer_apellido))) stored,
    segundo_apellido_normalizado text generated always as (public.inmutable_unaccent(lower(coalesce(segundo_apellido, '')))) stored
);

-- Profesionales: personal de la unidad. user_id enlaza con la cuenta
-- de acceso (auth.users) cuando la tiene; puede ser null (ficha sin
-- cuenta todavía).
create table public.profesionales (
    id uuid primary key default gen_random_uuid(),
    nombre text not null,
    apellidos text not null,
    rol text not null check (rol in ('medico', 'enfermeria', 'auxiliar', 'administrativo', 'tecnico')),
    activo boolean not null default true,
    created_at timestamptz default now(),
    colegiado text,
    especialidad text,
    user_id uuid unique references auth.users(id) on delete set null,
    es_admin boolean not null default false
);

-- Ingresos: cada episodio de hospitalización. Un paciente puede tener
-- varios a lo largo del tiempo, pero nunca dos ACTIVOS a la vez, ni
-- compartir habitación con otro ingreso activo (índices únicos más
-- abajo).
create table public.ingresos (
    id uuid primary key default gen_random_uuid(),
    paciente_id uuid not null references public.pacientes(id),
    fecha_ingreso date not null,
    fecha_alta date,
    habitacion integer check (habitacion >= 1 and habitacion <= 33),
    medico_responsable_id uuid references public.profesionales(id),
    motivo_ingreso text,
    estado text not null default 'activo' check (estado in ('activo', 'alta', 'alta_traslado', 'exitus')),
    created_at timestamptz default now()
);

-- Informe de ingreso: un único informe por ingreso.
create table public.informe_ingreso (
    id uuid primary key default gen_random_uuid(),
    ingreso_id uuid not null unique references public.ingresos(id) on delete cascade,
    alergias text,
    antecedentes_medicos text,
    antecedentes_quirurgicos text,
    antecedentes_familiares text,
    tratamiento_ingreso text,
    tratamiento_ingreso_estructurado jsonb,
    vgi_social text,
    vgi_funcional text,
    barthel integer check (barthel >= 0 and barthel <= 100),
    lawton integer check (lawton >= 0 and lawton <= 8),
    vgi_cognitivo text,
    vgi_sensorial text,
    vgi_nutricional text,
    vgi_dolor text,
    vgi_otros text,
    personalidad_previa text,
    evolucion text,
    situacion_cognitivo text,
    situacion_conductual text,
    situacion_animico text,
    situacion_funcional text,
    situacion_social text,
    exploracion_fisica text,
    exploracion_neurologica text,
    exploracion_psicopatologica text,
    exploraciones_complementarias text,
    impresion_diagnostica text,
    plan_objetivos text,
    plan_medicacion text,
    plan_otros_cuidados text,
    created_at timestamptz default now(),
    updated_at timestamptz default now()
);

-- Informe de alta: un único informe por ingreso. La medicación
-- estructurada se pre-rellena desde el tratamiento de ingreso, pero
-- vive en su propia columna, editable de forma independiente.
create table public.informe_alta (
    id uuid primary key default gen_random_uuid(),
    ingreso_id uuid not null unique references public.ingresos(id) on delete cascade,
    exploraciones_durante_ingreso text,
    estudio_neuropsicologico text,
    informe_fisioterapia text,
    informe_terapia_ocupacional text,
    evolucion_clinica text,
    juicios_clinicos text,
    medicacion_estructurada jsonb,
    recomendaciones_conductuales text,
    cuidados_enfermeria text,
    medicacion_alta text,
    otras_recomendaciones text,
    created_at timestamptz default now(),
    updated_at timestamptz default now()
);

-- Ítems de cuidado diario: un único registro "vivo" por ingreso (la
-- foto de ahora mismo). El histórico día a día vive en items_historico.
create table public.items_paciente (
    id uuid primary key default gen_random_uuid(),
    ingreso_id uuid not null unique references public.ingresos(id) on delete cascade,
    dependencia_avd integer check (dependencia_avd in (1, 2)),
    panial_dia text check (panial_dia in ('ninguno', 'BP', 'CA')),
    panial_noche text check (panial_noche in ('ninguno', 'BP', 'CA', 'CA+malla')),
    colector boolean default false,
    sonda_vesical boolean default false,
    dentadura text check (dentadura in ('ninguna', 'superior', 'inferior', 'completa', 'fija', 'puente')),
    audifonos text check (audifonos in ('ninguno', 'derecho', 'izquierdo', 'ambos')),
    gafas text check (gafas in ('no', 'si', 'solo_tv')),
    higiene text check (higiene in ('lavabo', 'cama')),
    vestido text,
    ducha text check (ducha in ('pie', 'sentado')),
    banio boolean default false,
    siestas boolean default false,
    deambulacion text,
    ayudas_deambulacion text check (ayudas_deambulacion in ('ninguna', 'baston', 'andador_2r', 'andador_4r', 'silla_ruedas')),
    bipedestador boolean default false,
    grua boolean default false,
    cambios_posturales boolean default false,
    cama_45 boolean default false,
    ingestas text check (ingestas in ('autonomo', 'dependiente')),
    oxigenoterapia boolean default false,
    botella_noche boolean default false,
    sujecion_cama text[] default '{}',
    sujecion_silla_ruedas text check (sujecion_silla_ruedas in ('no', 'si_precisa', 'continuo') or sujecion_silla_ruedas is null),
    sujecion_sillon text check (sujecion_sillon in ('no', 'si_precisa', 'continuo') or sujecion_sillon is null),
    colchon_antiescaras boolean default false,
    patucos_coderas boolean default false,
    sensor_cama boolean default false,
    motivo_sujecion text[] default '{}',
    observaciones_sujeciones text,
    semaforo_caidas text check (semaforo_caidas in ('verde', 'amarillo', 'naranja', 'rojo')),
    created_at timestamptz default now(),
    updated_at timestamptz default now()
);

-- Histórico diario de items_paciente: una fila por ingreso y día,
-- generada automáticamente cada noche (ver tarea programada al final).
create table public.items_historico (
    id uuid primary key default gen_random_uuid(),
    ingreso_id uuid not null references public.ingresos(id) on delete cascade,
    fecha date not null default current_date,
    datos jsonb not null default '{}',
    created_at timestamptz default now(),
    unique (ingreso_id, fecha)
);

-- Incidencias del episodio (caídas, úlceras, contenciones físicas...).
create table public.eventos (
    id uuid primary key default gen_random_uuid(),
    ingreso_id uuid not null references public.ingresos(id) on delete cascade,
    tipo text not null check (tipo in (
        'caida', 'ulcera', 'error_medicacion', 'efecto_adverso_medicacion',
        'infeccion_nosocomial', 'contencion_fisica', 'agresividad_fisica', 'fuga'
    )),
    fecha date not null default current_date,
    hora time,
    turno text check (turno in ('manana', 'tarde', 'noche')),
    datos jsonb not null default '{}',
    notas text,
    registrado_por_id uuid references public.profesionales(id),
    created_at timestamptz default now()
);

-- CMBD: conjunto mínimo básico de datos para el envío regulatorio al
-- alta. Un único registro por ingreso.
create table public.cmbd (
    id uuid primary key default gen_random_uuid(),
    ingreso_id uuid not null unique references public.ingresos(id) on delete cascade,
    circunstancia_alta text,
    diagnostico_principal text,
    diagnostico_principal_desc text,
    diagnostico_principal_poad boolean,
    diagnostico_secundario_1 text,
    diagnostico_secundario_1_desc text,
    diagnostico_secundario_1_poad boolean,
    diagnostico_secundario_2 text,
    diagnostico_secundario_2_desc text,
    diagnostico_secundario_2_poad boolean,
    diagnostico_secundario_3 text,
    diagnostico_secundario_3_desc text,
    diagnostico_secundario_3_poad boolean,
    diagnostico_secundario_4 text,
    diagnostico_secundario_4_desc text,
    diagnostico_secundario_4_poad boolean,
    diagnostico_secundario_5 text,
    diagnostico_secundario_5_desc text,
    diagnostico_secundario_5_poad boolean,
    diagnostico_secundario_6 text,
    diagnostico_secundario_6_desc text,
    diagnostico_secundario_6_poad boolean,
    diagnostico_secundario_7 text,
    diagnostico_secundario_7_desc text,
    diagnostico_secundario_7_poad boolean,
    diagnostico_secundario_8 text,
    diagnostico_secundario_8_desc text,
    diagnostico_secundario_8_poad boolean,
    procedimiento_1 text,
    procedimiento_1_desc text,
    procedimiento_2 text,
    procedimiento_2_desc text,
    procedimiento_3 text,
    procedimiento_3_desc text,
    procedimiento_4 text,
    procedimiento_4_desc text,
    procedimiento_5 text,
    procedimiento_5_desc text,
    procedimiento_6 text,
    procedimiento_6_desc text,
    procedimiento_7 text,
    procedimiento_7_desc text,
    procedimiento_8 text,
    procedimiento_8_desc text,
    procedencia text,
    servicio text default 'GRT',
    notas text,
    completado boolean default false,
    created_at timestamptz default now(),
    updated_at timestamptz default now()
);

-- Auditoría: quién cambió qué y cuándo, en las tablas clínicas
-- sensibles. Solo un administrador puede leerla; nadie puede editarla
-- ni borrarla directamente (no hay política de escritura para nadie).
create table public.auditoria (
    id bigserial primary key,
    tabla text not null,
    registro_id uuid,
    accion text not null,
    usuario_id uuid,
    fecha timestamptz not null default now()
);


-- ────────────────────────────────────────────────────────────
-- VISTA
-- ────────────────────────────────────────────────────────────

-- Pacientes con los datos de su último ingreso, para listar/filtrar/
-- ordenar por estado y fecha desde la propia consulta (sin traer todo
-- y filtrar en el navegador). security_invoker=true es imprescindible:
-- sin él, la vista se ejecuta con los permisos de quien la creó (que
-- se salta su propio RLS como dueño de las tablas), no con los del
-- usuario que consulta — dejaría leer datos de pacientes a cualquier
-- cuenta autenticada, tenga o no ficha de profesional.
create view public.pacientes_con_ultimo_ingreso
with (security_invoker = true) as
select
    p.id, p.cipna, p.nhc, p.nombre, p.primer_apellido, p.segundo_apellido,
    p.fecha_nacimiento, p.sexo, p.dni, p.municipio, p.medico_cabecera,
    p.contacto_familiar_nombre, p.contacto_familiar_telefono, p.created_at,
    i.id as ingreso_id,
    i.estado as ingreso_estado,
    i.fecha_ingreso as ingreso_fecha_ingreso,
    i.fecha_alta as ingreso_fecha_alta,
    i.habitacion as ingreso_habitacion,
    p.nombre_normalizado,
    p.primer_apellido_normalizado,
    p.segundo_apellido_normalizado
from public.pacientes p
left join lateral (
    select i2.id, i2.paciente_id, i2.fecha_ingreso, i2.fecha_alta, i2.habitacion,
           i2.medico_responsable_id, i2.motivo_ingreso, i2.estado, i2.created_at
    from public.ingresos i2
    where i2.paciente_id = p.id
    order by i2.fecha_ingreso desc
    limit 1
) i on true;


-- ────────────────────────────────────────────────────────────
-- FUNCIONES
-- ────────────────────────────────────────────────────────────

-- El rol del usuario autenticado actual, o null si no tiene ficha
-- activa. SECURITY DEFINER + search_path vacío: se ejecuta con
-- permisos propios (no los de quien llama) y no se puede engañar
-- manipulando el search_path de la sesión.
create function private.mi_rol() returns text
language sql stable security definer
set search_path to ''
as $$
  select p.rol
  from public.profesionales as p
  where p.user_id = auth.uid()
    and p.activo = true
  limit 1;
$$;

-- Si el usuario autenticado actual es administrador.
create function private.soy_admin() returns boolean
language sql stable security definer
set search_path to ''
as $$
  select coalesce(
    (
      select p.es_admin
      from public.profesionales as p
      where p.user_id = auth.uid()
        and p.activo = true
      limit 1
    ),
    false
  );
$$;

-- Impide cambiar el autor de una incidencia ya existente (una
-- política RLS no puede comparar el valor antes/después en un
-- UPDATE, así que esto se hace con un disparador).
create function public.evitar_cambio_autor_evento() returns trigger
language plpgsql
as $$
begin
  if NEW.registrado_por_id is distinct from OLD.registrado_por_id then
    raise exception 'No se puede cambiar quién registró una incidencia ya existente.';
  end if;
  return NEW;
end;
$$;

-- Genera (o actualiza si ya existe la de hoy) la foto diaria de
-- items_paciente de todos los ingresos activos. La invoca la tarea
-- programada de más abajo.
create function public.generar_snapshot_items() returns void
language plpgsql
as $$
begin
  insert into items_historico (ingreso_id, fecha, datos)
  select
    ip.ingreso_id,
    current_date,
    row_to_json(ip)::jsonb
  from items_paciente ip
  inner join ingresos i on i.id = ip.ingreso_id
  where i.estado = 'activo'
  on conflict (ingreso_id, fecha)
  do update set datos = excluded.datos;
end;
$$;

-- Registra en auditoria cada INSERT/UPDATE/DELETE de las tablas a las
-- que se engancha (ver disparadores más abajo). SECURITY DEFINER para
-- poder escribir en auditoria aunque el usuario no tenga permiso
-- directo de escritura sobre ella.
create function public.registrar_auditoria() returns trigger
language plpgsql security definer
set search_path to 'public'
as $$
declare
  v_registro_id uuid;
begin
  if (TG_OP = 'DELETE') then
    v_registro_id := OLD.id;
  else
    v_registro_id := NEW.id;
  end if;

  insert into auditoria (tabla, registro_id, accion, usuario_id)
  values (TG_TABLE_NAME, v_registro_id, TG_OP, auth.uid());

  if (TG_OP = 'DELETE') then
    return OLD;
  end if;
  return NEW;
end;
$$;

-- Actualiza updated_at automáticamente en cada UPDATE.
create function public.update_updated_at() returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;


-- ────────────────────────────────────────────────────────────
-- DISPARADORES
-- ────────────────────────────────────────────────────────────

create trigger bloquear_cambio_autor_evento
    before update on public.eventos
    for each row execute function public.evitar_cambio_autor_evento();

create trigger aud_pacientes    after insert or update or delete on public.pacientes    for each row execute function public.registrar_auditoria();
create trigger aud_profesionales after insert or update or delete on public.profesionales for each row execute function public.registrar_auditoria();
create trigger aud_ingresos     after insert or update or delete on public.ingresos     for each row execute function public.registrar_auditoria();
create trigger aud_informe_ingreso after insert or update or delete on public.informe_ingreso for each row execute function public.registrar_auditoria();
create trigger aud_informe_alta after insert or update or delete on public.informe_alta for each row execute function public.registrar_auditoria();
create trigger aud_cmbd         after insert or update or delete on public.cmbd         for each row execute function public.registrar_auditoria();

create trigger trg_items_updated         before update on public.items_paciente  for each row execute function public.update_updated_at();
create trigger trg_informe_ingreso_updated before update on public.informe_ingreso for each row execute function public.update_updated_at();
create trigger trg_informe_alta_updated  before update on public.informe_alta    for each row execute function public.update_updated_at();
create trigger trg_cmbd_updated          before update on public.cmbd            for each row execute function public.update_updated_at();


-- ────────────────────────────────────────────────────────────
-- SEGURIDAD A NIVEL DE FILA (RLS)
-- ────────────────────────────────────────────────────────────

alter table public.pacientes enable row level security;
alter table public.profesionales enable row level security;
alter table public.ingresos enable row level security;
alter table public.informe_ingreso enable row level security;
alter table public.informe_alta enable row level security;
alter table public.items_paciente enable row level security;
alter table public.items_historico enable row level security;
alter table public.eventos enable row level security;
alter table public.cmbd enable row level security;
alter table public.auditoria enable row level security;

-- Lectura: cualquier cuenta con ficha de profesional activa (mi_rol()
-- no es null). Sin ficha, o con ficha dada de baja, no se lee nada.
create policy leer_autenticado on public.pacientes        for select to authenticated using (private.mi_rol() is not null);
create policy leer_autenticado on public.profesionales     for select to authenticated using (private.mi_rol() is not null);
create policy leer_autenticado on public.ingresos          for select to authenticated using (private.mi_rol() is not null);
create policy leer_autenticado on public.informe_ingreso   for select to authenticated using (private.mi_rol() is not null);
create policy leer_autenticado on public.informe_alta      for select to authenticated using (private.mi_rol() is not null);
create policy leer_autenticado on public.items_paciente    for select to authenticated using (private.mi_rol() is not null);
create policy leer_autenticado on public.items_historico   for select to authenticated using (private.mi_rol() is not null);
create policy leer_autenticado on public.eventos           for select to authenticated using (private.mi_rol() is not null);
create policy leer_autenticado on public.cmbd              for select to authenticated using (private.mi_rol() is not null);

-- auditoria: solo lectura, y solo para administradores. Nadie tiene
-- permiso de escritura directa (solo se escribe vía disparador,
-- que corre con permisos propios).
create policy auditoria_leer_admin on public.auditoria for select to authenticated using (private.soy_admin());

-- pacientes: solo médico.
create policy escribir_medico on public.pacientes to authenticated
    using (private.mi_rol() = 'medico') with check (private.mi_rol() = 'medico');

-- profesionales: solo administrador (crear/dar de baja/eliminar
-- fichas pasa por las Edge Functions, que usan service_role, pero la
-- política queda igualmente como candado de fondo).
create policy escribir_admin on public.profesionales to authenticated
    using (private.soy_admin()) with check (private.soy_admin());

-- ingresos: solo médico. Crear exige nacer "activo" (no se puede
-- insertar ya en estado de alta/éxitus, saltándose el flujo real).
-- Editar exige que siga activo ANTES del cambio (episodios cerrados
-- son de solo lectura), pero el resultado puede ser cualquier estado
-- — así funciona la propia transición de "dar de alta".
create policy crear_ingreso on public.ingresos for insert to authenticated
    with check (private.mi_rol() = 'medico' and estado = 'activo');
create policy editar_ingreso on public.ingresos for update to authenticated
    using (private.mi_rol() = 'medico' and estado = 'activo')
    with check (private.mi_rol() = 'medico');
create policy borrar_ingreso on public.ingresos for delete to authenticated
    using (private.mi_rol() = 'medico' and estado = 'activo');

-- informe_ingreso: solo médico, y solo mientras el episodio siga
-- activo (es el registro de lo que pasó durante el ingreso).
create policy escribir_medico on public.informe_ingreso to authenticated
    using (
        private.mi_rol() = 'medico'
        and exists (select 1 from ingresos i where i.id = informe_ingreso.ingreso_id and i.estado = 'activo')
    )
    with check (
        private.mi_rol() = 'medico'
        and exists (select 1 from ingresos i where i.id = informe_ingreso.ingreso_id and i.estado = 'activo')
    );

-- informe_alta y cmbd: solo médico, SIN exigir que el episodio siga
-- activo. A diferencia del informe de ingreso, estos se redactan en
-- torno al propio momento del alta — a menudo después de confirmarla
-- — así que deben poder terminarse tras cerrar el episodio.
create policy escribir_medico on public.informe_alta to authenticated
    using (private.mi_rol() = 'medico') with check (private.mi_rol() = 'medico');
create policy escribir_medico on public.cmbd to authenticated
    using (private.mi_rol() = 'medico') with check (private.mi_rol() = 'medico');

-- items_paciente: todo el equipo asistencial, mientras el episodio
-- siga activo.
create policy escribir_equipo on public.items_paciente to authenticated
    using (
        private.mi_rol() in ('medico', 'enfermeria', 'auxiliar', 'tecnico')
        and exists (select 1 from ingresos i where i.id = items_paciente.ingreso_id and i.estado = 'activo')
    )
    with check (
        private.mi_rol() in ('medico', 'enfermeria', 'auxiliar', 'tecnico')
        and exists (select 1 from ingresos i where i.id = items_paciente.ingreso_id and i.estado = 'activo')
    );

-- eventos (incidencias): todo el equipo asistencial, mientras el
-- episodio siga activo. Crear exige que el autor sea la propia sesión
-- (no se puede registrar una incidencia en nombre de otro), y editar
-- no puede cambiar quién la registró (ver el disparador de arriba).
create policy crear_evento on public.eventos for insert to authenticated
    with check (
        private.mi_rol() in ('medico', 'enfermeria', 'auxiliar', 'tecnico')
        and exists (select 1 from ingresos i where i.id = eventos.ingreso_id and i.estado = 'activo')
        and registrado_por_id = (select id from profesionales where user_id = auth.uid() limit 1)
    );
create policy editar_evento on public.eventos for update to authenticated
    using (
        private.mi_rol() in ('medico', 'enfermeria', 'auxiliar', 'tecnico')
        and exists (select 1 from ingresos i where i.id = eventos.ingreso_id and i.estado = 'activo')
    )
    with check (
        private.mi_rol() in ('medico', 'enfermeria', 'auxiliar', 'tecnico')
        and exists (select 1 from ingresos i where i.id = eventos.ingreso_id and i.estado = 'activo')
    );
create policy borrar_evento on public.eventos for delete to authenticated
    using (
        private.mi_rol() in ('medico', 'enfermeria', 'auxiliar', 'tecnico')
        and exists (select 1 from ingresos i where i.id = eventos.ingreso_id and i.estado = 'activo')
    );


-- ────────────────────────────────────────────────────────────
-- ÍNDICES
-- ────────────────────────────────────────────────────────────

-- Impiden dos ingresos activos del mismo paciente, o dos pacientes
-- activos a la vez en la misma habitación. Parciales (solo sobre
-- estado='activo'): no afectan a episodios ya cerrados.
create unique index ingresos_paciente_activo_unico on public.ingresos (paciente_id) where estado = 'activo';
create unique index ingresos_habitacion_activa_unica on public.ingresos (habitacion) where estado = 'activo' and habitacion is not null;

create index eventos_ingreso_idx on public.eventos (ingreso_id);
create index eventos_fecha_idx on public.eventos (fecha);
create index eventos_tipo_idx on public.eventos (tipo);
create index items_historico_ingreso_idx on public.items_historico (ingreso_id);
create index items_historico_fecha_idx on public.items_historico (fecha);
create index auditoria_tabla_registro_idx on public.auditoria (tabla, registro_id);
create index auditoria_fecha_idx on public.auditoria (fecha desc);
create index profesionales_user_id_idx on public.profesionales (user_id);
create index pacientes_nombre_normalizado_idx on public.pacientes (nombre_normalizado);
create index pacientes_primer_apellido_normalizado_idx on public.pacientes (primer_apellido_normalizado);


-- ────────────────────────────────────────────────────────────
-- TAREA PROGRAMADA
-- ────────────────────────────────────────────────────────────

-- Genera la foto diaria de items_paciente cada noche a las 23:00.
select cron.schedule('snapshot-items-diario', '0 23 * * *', 'select generar_snapshot_items()');


-- ────────────────────────────────────────────────────────────
-- DATOS INICIALES
-- ────────────────────────────────────────────────────────────

-- Tres profesionales de arranque; Javier queda como administrador
-- (necesario para poder gestionar al resto del personal desde el
-- primer momento). El "ilike" es deliberado: no exige coincidencia
-- exacta de apellidos, así el arranque no depende de que el nombre
-- se escriba exactamente igual en el futuro.
insert into public.profesionales (nombre, apellidos, rol) values
    ('Ana', '', 'medico'),
    ('Kevin', '', 'medico'),
    ('Javier', 'González Gómez', 'medico');

update public.profesionales
set es_admin = true
where nombre = 'Javier' and apellidos ilike 'González%';

commit;
