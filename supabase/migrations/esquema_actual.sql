-- ============================================================
-- CJA Hospital — esquema completo de la base de datos
--
-- Nació ejecutando las 28 migraciones originales, en orden, contra un
-- PostgreSQL real, y extrayendo el esquema resultante directamente
-- del motor. Desde entonces se mantiene a mano según evoluciona la
-- aplicación — cada cambio se valida ejecutándolo de principio a fin
-- contra un PostgreSQL limpio antes de darlo por bueno, pero ya no es
-- una extracción literal del motor en cada edición.
--
-- Esa validación es contra un PostgreSQL limpio simulando auth.uid()
-- y pg_cron, no contra una instalación limpia de Supabase real de
-- principio a fin (crear proyecto, RLS, Edge Functions, cuenta de
-- administrador) — eso sigue siendo trabajo pendiente, documentado
-- en DOCUMENTACION_INSTALACION_Y_DESPLIEGUE.md.
--
-- OJO — NO ejecutar esto contra la base de datos de producción: ya
-- tiene todo esto creado. Este archivo sirve como referencia de cómo
-- es la base de datos hoy, y como punto de partida si algún día se
-- necesita montar un entorno nuevo desde cero (por ejemplo, uno de
-- pruebas). Los cambios reales a producción viajan en scripts sueltos
-- del mismo repositorio, no ejecutando este archivo completo.
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

-- Sin esto, cualquier función que llama a private.mi_rol() o
-- private.soy_admin() falla con "permission denied for schema
-- private" en una instalación limpia — comprobado de verdad. La base
-- real ya tenía este permiso puesto en algún momento anterior a este
-- archivo, lo que explica que nunca se hubiera notado aquí.
revoke all on schema private from public, anon;
grant usage on schema private to authenticated;


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
set search_path = ''
as $$
  select public.unaccent('public.unaccent', $1)
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
    -- Sube en cada guardado real; si al guardar no coincide con la
    -- que se leyó, es que alguien más guardó mientras tanto. Mismo
    -- principio que ya usan informe de ingreso, informe de alta,
    -- ítems y CMBD.
    version integer not null default 1,
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
    rol text not null check (rol in ('medico', 'enfermeria', 'auxiliar', 'tecnico')),
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
    -- Con hora real, a diferencia de fecha_alta — la pone
    -- dar_de_alta(), y se usa para calcular la ventana de 24h en la
    -- que un episodio se puede reabrir si se cerró por error.
    dado_de_alta_en timestamptz,
    habitacion integer check (habitacion >= 1 and habitacion <= 33),
    medico_responsable_id uuid references public.profesionales(id),
    motivo_ingreso text,
    estado text not null default 'activo' check (estado in ('activo', 'alta', 'alta_traslado', 'exitus')),
    created_at timestamptz default now(),
    constraint ingresos_fecha_alta_valida check (fecha_alta is null or fecha_alta >= fecha_ingreso),
    -- Confirmado de verdad que, sin esto, un ingreso se podía dejar
    -- en estado "alta" con fecha_alta y dado_de_alta_en en null
    -- directamente por la API, sin pasar por dar_de_alta().
    constraint ingresos_alta_coherente check (
        (estado = 'activo' and fecha_alta is null and dado_de_alta_en is null)
        or (estado <> 'activo' and fecha_alta is not null and dado_de_alta_en is not null)
    )
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
    -- barthel y lawton se han trasladado a escalas_clinicas, con
    -- ítems y cálculo automático en vez de un número suelto.
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
    -- Campos copiados del ingreso anterior (reingreso) que el médico todavía
    -- no ha revisado: vgi_*, tratamiento_ingreso_estructurado…
    campos_por_revisar text[] not null default '{}',
    -- Sube en cada guardado real; si al guardar no coincide con la
    -- que se leyó, es que alguien más guardó mientras tanto.
    version integer not null default 1,
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
    version integer not null default 1,
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
    vestido text check (vestido in ('autonomo', 'dependiente') or vestido is null),
    ducha text check (ducha in ('pie', 'sentado')),
    banio boolean default false,
    siestas boolean default false,
    -- Deambulación: tres niveles fijos de ayuda necesaria, no texto libre.
    deambulacion text check (deambulacion in ('autonomo', '1_persona', '2_personas') or deambulacion is null),
    ayudas_deambulacion text check (ayudas_deambulacion in ('ninguna', 'baston', 'andador_2r', 'andador_4r', 'silla_ruedas')),
    bipedestador boolean default false,
    grua boolean default false,
    cambios_posturales boolean default false,
    -- Grados reales del cabecero, no un simple sí/no.
    cabecero_grados text,
    ingestas text check (ingestas in ('autonomo', 'dependiente')),
    oxigenoterapia boolean default false,
    botella_noche boolean default false,
    colchon_antiescaras boolean default false,
    patucos_coderas boolean default false,
    -- Las contenciones (día/noche) viven en su propia tabla desde el
    -- rediseño de pautas — aquí ya no hay sujeción_cama/silla/sillón
    -- ni sensor_cama sueltos, para que no pueda haber un dato aquí
    -- que contradiga a la pauta real.
    timbre_habitacion boolean default false,
    objetos_calma text,
    alerta_conducta text[] default '{}' check (
        alerta_conducta <@ array['riesgo_autolitico', 'agresion_imprevisible', 'riesgo_fuga']::text[]
    ),
    -- Campo general de observaciones (antes era solo de sujeciones;
    -- se reaprovecha el mismo hueco con un propósito más amplio).
    observaciones text,
    semaforo_caidas text check (semaforo_caidas in ('verde', 'amarillo', 'naranja', 'rojo')),
    version integer not null default 1,
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
        'infeccion_nosocomial', 'agresividad_fisica', 'fuga'
    )),
    fecha date not null default current_date,
    hora time,
    turno text check (turno in ('manana', 'tarde', 'noche')),
    datos jsonb not null default '{}',
    notas text,
    registrado_por_id uuid references public.profesionales(id),
    -- Quién tocó la fila por última vez, y cuándo — distinto de
    -- registrado_por_id (el autor original, inmutable). Cualquier
    -- profesional asistencial puede completar una incidencia ajena
    -- en un turno posterior; esto deja constancia de quién lo hizo.
    actualizado_por_id uuid references public.profesionales(id),
    actualizado_en timestamptz,
    -- Para lo que se sabrá con certeza más adelante (una caída cuyas
    -- consecuencias se confirman días después) — sin exigir rellenar
    -- con un valor inventado con tal de poder guardar.
    estado text not null default 'completa' check (estado in ('pendiente', 'completa')),
    -- La habitación EN EL MOMENTO del suceso, no la actual del
    -- ingreso — si hay un traslado después, el histórico no debe
    -- cambiar de habitación con él. Se rellena sola (ver disparador
    -- fijar_habitacion_evento), nunca a mano.
    habitacion_evento integer check (habitacion_evento is null or (habitacion_evento >= 1 and habitacion_evento <= 33)),
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
    version integer not null default 1,
    created_at timestamptz default now(),
    updated_at timestamptz default now()
);

-- Escalas clínicas: Barthel, Lawton, NPI-Q (solo gravedad) y
-- GDS-FAST, una fila por ingreso y momento (ingreso/alta). Se
-- guardan las respuestas y el total calculado, no un número suelto
-- — así se puede ver de dónde sale cada puntuación.
create table public.escalas_clinicas (
    id uuid primary key default gen_random_uuid(),
    ingreso_id uuid not null references public.ingresos(id) on delete cascade,
    momento text not null check (momento in ('ingreso', 'alta')),

    barthel_respuestas jsonb,
    barthel_total integer check (barthel_total between 0 and 100),

    lawton_respuestas jsonb,
    lawton_total integer check (lawton_total between 0 and 8),

    -- Solo la gravedad (0-36), sin malestar del cuidador.
    npi_respuestas jsonb,
    npi_gravedad_total integer check (npi_gravedad_total between 0 and 36),

    -- GDS y FAST por separado a propósito — no son la misma escala
    -- ni se suman entre sí.
    gds_estadio integer check (gds_estadio between 1 and 7),
    fast_estadio text,

    version integer not null default 1,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now(),

    -- Una sola fila por ingreso y momento.
    unique (ingreso_id, momento)
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
    -- Opcionales, y solo las rellena el disparador de "eventos" por
    -- ahora — el resto de tablas sigue exactamente igual que antes.
    -- Sin esto, la auditoría solo sabía decir "algo cambió", nunca
    -- qué decía antes y qué dice después.
    valores_antes jsonb,
    valores_despues jsonb,
    fecha timestamptz not null default now()
);

-- Contención física: estado actual, un registro por ingreso. Dos ejes
-- independientes (día y noche), no un único campo.
--
-- "Nunca revisado" y "revisado, no hace falta nada" son cosas
-- DISTINTAS y se representan de forma distinta a propósito:
--   día:   null = nunca revisado; 'ninguna' = revisado, nada pautado
--   noche: null = nunca revisado; '{}' = revisado, nada pautado
create table public.contenciones (
    ingreso_id uuid primary key references public.ingresos(id) on delete cascade,
    dia text check (dia in (
        'ninguna', 'continua_seguridad', 'si_precisa_supervision', 'si_precisa_paciente'
    )),
    noche text[] check (
        noche <@ array['1_barra','2_barras','cota_cero','sensor_presion','contencion_fija','contencion_si_precisa']::text[]
    ),
    actualizado_por_id uuid references public.profesionales(id),
    actualizado_en timestamptz not null default now(),
    -- Confirmación médica: quién y cuándo, puestos siempre por el
    -- servidor. null = todavía sin confirmar.
    confirmado_por_id uuid references public.profesionales(id),
    confirmado_en timestamptz,
    -- Concurrencia: sube solo cuando cambia el contenido real (día o
    -- noche), no al confirmar. Guardar exige la versión que se leyó;
    -- si no coincide, alguien se adelantó.
    version integer not null default 1
);

-- Historial: una fila por cada cambio, para ver cómo ha evolucionado
-- la pauta de un paciente en el tiempo. Se rellena solo, vía
-- disparador (ver DISPARADORES más abajo) — nadie escribe aquí a mano.
create table public.contenciones_historial (
    id uuid primary key default gen_random_uuid(),
    ingreso_id uuid not null references public.ingresos(id) on delete cascade,
    dia text,
    noche text[],
    cambiado_por_id uuid references public.profesionales(id),
    cambiado_en timestamptz not null default now(),
    -- Qué pasó exactamente ('pauta_creada', 'pauta_modificada',
    -- 'confirmada', 'confirmacion_retirada') y quién lo hizo de
    -- verdad — sin esto, una confirmación quedaba atribuida a quien
    -- había registrado la pauta, no al médico que confirmó.
    tipo_accion text,
    actor_id uuid references public.profesionales(id)
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

grant execute on function private.mi_rol() to authenticated;
grant execute on function private.soy_admin() to authenticated;

-- ¿Tiene este rol, o es administrador? Un administrador puede hacer todo lo de los
-- demás roles. Las políticas y funciones que piden un rol concreto (médico,
-- enfermería) usan esto en vez de comparar mi_rol() directamente.
-- coalesce: sin sesión, mi_rol() es NULL y debe salir "false", no NULL.
create function private.tengo_rol(p_rol text) returns boolean
language sql stable
set search_path to ''
as $$
  select coalesce(private.mi_rol() = p_rol, false) or private.soy_admin();
$$;

grant execute on function private.tengo_rol(text) to authenticated;

-- "Hoy" según el reloj de la clínica (Madrid), no el de UTC. Entre las
-- 00:00 y las 02:00 de Navarra, current_date de Supabase todavía marca
-- el día anterior.
create or replace function private.hoy_madrid() returns date
language sql stable
set search_path to ''
as $$
  select (now() at time zone 'Europe/Madrid')::date;
$$;

-- Número de camas de la unidad: un único sitio donde cambiarlo. Hoy
-- hay una sola unidad de 33 camas.
create or replace function private.numero_camas() returns integer
language sql immutable
set search_path to ''
as $$
  select 33;
$$;

revoke execute on function private.hoy_madrid() from public, anon;
revoke execute on function private.numero_camas() from public, anon;
grant execute on function private.hoy_madrid() to authenticated;
grant execute on function private.numero_camas() to authenticated;

-- Impide cambiar el autor de una incidencia ya existente (una
-- política RLS no puede comparar el valor antes/después en un
-- UPDATE, así que esto se hace con un disparador).
create function public.evitar_cambio_autor_evento() returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if NEW.registrado_por_id is distinct from OLD.registrado_por_id then
    raise exception 'No se puede cambiar quién registró una incidencia ya existente.';
  end if;
  return NEW;
end;
$$;

-- Pone siempre actualizado_por_id/actualizado_en según quien hace el
-- cambio de verdad — nunca lo que mande el propio cliente.
create function public.fijar_actualizado_por_evento() returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  NEW.actualizado_por_id := (select id from public.profesionales where user_id = auth.uid() limit 1);
  NEW.actualizado_en := now();
  return NEW;
end;
$$;

-- Auditoría con valores de antes/después, solo para eventos — deja
-- constancia de qué decía la incidencia exactamente antes y después
-- de cada cambio, y quién fue, no solo que "alguien la tocó".
create function public.registrar_auditoria_eventos() returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  -- auth.uid() directamente, igual que registrar_auditoria() y las
  -- Edge Functions — antes guardaba profesionales.id, mientras que
  -- toda la pantalla de Auditoría busca por profesionales.user_id.
  -- Con ese desajuste, cualquier cambio de incidencia se veía sin
  -- autor identificable, aunque sí se había guardado uno.
  insert into public.auditoria (tabla, registro_id, accion, usuario_id, valores_antes, valores_despues)
  values (
    'eventos',
    coalesce(NEW.id, OLD.id),
    lower(TG_OP),
    auth.uid(),
    case when TG_OP = 'INSERT' then null else to_jsonb(OLD) end,
    case when TG_OP = 'DELETE' then null else to_jsonb(NEW) end
  );
  return coalesce(NEW, OLD);
end;
$$;

-- La habitación EN EL MOMENTO del suceso — si al insertar no se
-- indica, se toma la habitación actual del ingreso, y ya no se
-- vuelve a tocar (no hay disparador de "update" para esto: un
-- traslado posterior no debe reescribir el histórico).
create function public.fijar_habitacion_evento() returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  -- Se sobrescribe siempre, nunca se confía en lo que mande el
  -- cliente — confirmado de verdad que, antes, si el cliente mandaba
  -- un valor (no null), se aceptaba tal cual sin comprobar nada.
  --
  -- Salvedad honesta: si una incidencia se registra días después de
  -- ocurrida y el paciente ya ha cambiado de habitación, se guardará
  -- la habitación ACTUAL, no necesariamente aquella en la que ocurrió
  -- de verdad. No se añade más interfaz para este caso, poco
  -- frecuente, pero tampoco se esconde.
  select habitacion into NEW.habitacion_evento from public.ingresos where id = NEW.ingreso_id;
  return NEW;
end;
$$;

-- Genera (o actualiza si ya existe la de hoy) la foto diaria de
-- items_paciente de todos los ingresos activos. La invoca la tarea
-- programada de más abajo.
create function public.generar_snapshot_items() returns void
language plpgsql
set search_path = ''
as $$
begin
  -- Se guarda también la habitación de ESE momento (no solo los
  -- ítems), para que consultar un día antiguo muestre la habitación
  -- que tenía el paciente entonces, no la que tiene ahora si se ha
  -- cambiado de habitación después.
  --
  -- Y, desde ahora, también la contención de ese momento (día y
  -- noche) — antes no se guardaba en absoluto, así que el histórico
  -- siempre mostraba esas filas vacías, sin que "vacío" quisiera
  -- decir "no había contención": simplemente nunca se llegó a copiar.
  -- Confirmado por auditoría y reproducido de verdad antes de este
  -- arreglo.
  insert into public.items_historico (ingreso_id, fecha, datos)
  select
    ip.ingreso_id,
    current_date,
    row_to_json(ip)::jsonb
      || jsonb_build_object('_habitacion_snapshot', i.habitacion)
      || jsonb_build_object('_contencion_dia', c.dia, '_contencion_noche', c.noche)
  from public.items_paciente ip
  inner join public.ingresos i on i.id = ip.ingreso_id
  left join public.contenciones c on c.ingreso_id = ip.ingreso_id
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
set search_path to ''
as $$
declare
  v_registro_id uuid;
begin
  if (TG_OP = 'DELETE') then
    v_registro_id := OLD.id;
  else
    v_registro_id := NEW.id;
  end if;

  insert into public.auditoria (tabla, registro_id, accion, usuario_id)
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
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- Cada vez que se crea la pauta o cambia de verdad (día o noche),
-- queda una foto en el historial. El disparador que lo llama (ver
-- DISPARADORES) solo se activa en esos dos casos — "update of dia,
-- noche" en su propia definición, no una comprobación aquí dentro —
-- así que esta función no necesita adivinar qué pasó comparando
-- valores de antes y de después. Confirmar y retirar una
-- confirmación escriben su propia línea de historial directamente
-- (ver confirmar_contencion y retirar_confirmacion_contencion),
-- porque ya saben perfectamente qué están haciendo.
create function public.registrar_historial_contencion() returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  -- Al guardar, el formulario manda siempre día y noche, aunque no
  -- se haya tocado nada — así que un guardado sin cambios reales
  -- disparaba igualmente este trigger. Se compara con el valor
  -- anterior (igual que ya hace incrementar_version_contencion) para
  -- no registrar "Pauta modificada" cuando en realidad no cambió
  -- nada.
  if TG_OP = 'UPDATE' and NEW.dia is not distinct from OLD.dia and NEW.noche is not distinct from OLD.noche then
    return NEW;
  end if;

  insert into public.contenciones_historial (ingreso_id, dia, noche, cambiado_por_id, cambiado_en, tipo_accion, actor_id)
  values (
    NEW.ingreso_id, NEW.dia, NEW.noche, NEW.actualizado_por_id, NEW.actualizado_en,
    case when TG_OP = 'INSERT' then 'pauta_creada' else 'pauta_modificada' end,
    NEW.actualizado_por_id
  );
  return NEW;
end;
$$;

-- La hora de "actualizado_en" la pone siempre el servidor, nunca el
-- reloj del ordenador de quien guarda.
create function public.set_actualizado_en() returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.actualizado_en = now();
  return new;
end;
$$;

-- Sube la versión solo cuando cambia el contenido real (día o
-- noche), no al confirmar. Guardar exige la versión que se leyó; si
-- no coincide, alguien se adelantó — evita que dos personas se pisen
-- sin saberlo.
create function public.incrementar_version_contencion() returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if TG_OP = 'INSERT' then
    NEW.version := 1;
  elsif TG_OP = 'UPDATE' then
    if NEW.dia is distinct from OLD.dia or NEW.noche is distinct from OLD.noche then
      NEW.version := OLD.version + 1;
    else
      -- Ignora cualquier valor que mandara el cliente para "version"
      -- si el contenido no ha cambiado de verdad — sin esto, una
      -- llamada directa a la API podía poner version a lo que
      -- quisiera, confirmado por auditoría real contra Supabase.
      NEW.version := OLD.version;
    end if;
  end if;
  return NEW;
end;
$$;

-- Cambiar el contenido de la pauta invalida cualquier confirmación
-- anterior (lo puede disparar cualquiera del equipo). Fijar o retirar
-- una confirmación exige ser médico, y fijarla exige que sea uno
-- mismo — nunca "en nombre de" otro médico.
create function public.gestionar_confirmacion_contencion() returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor_actual uuid;
begin
  -- En un INSERT no hay ningún OLD con el que comparar, y la propia
  -- política de escritura ya exige confirmado_por_id = null al crear
  -- — no hay ninguna regla de confirmación que aplicar todavía aquí.
  -- Antes esto caía por defecto en la rama de "retirar confirmación",
  -- bloqueando a cualquiera que no fuera médico de registrar la
  -- primera pauta — confirmado por auditoría real contra Supabase.
  if TG_OP = 'INSERT' then
    NEW.confirmado_en := null;
    return NEW;
  end if;

  select id into v_actor_actual from public.profesionales where user_id = auth.uid() limit 1;

  if NEW.dia is distinct from OLD.dia or NEW.noche is distinct from OLD.noche then
    NEW.confirmado_por_id := null;
    NEW.confirmado_en := null;
    return NEW;
  end if;

  if NEW.confirmado_por_id is not distinct from OLD.confirmado_por_id then
    -- Nada de la confirmación cambia: se ignora cualquier valor que
    -- mandara el cliente para "confirmado_en" — solo puede cambiar de
    -- verdad cuando confirmado_por_id también cambia.
    NEW.confirmado_en := OLD.confirmado_en;
    return NEW;
  end if;

  if NEW.confirmado_por_id is not null then
    if not private.tengo_rol('medico') then
      raise exception 'Solo un médico puede confirmar una pauta de contención.';
    end if;
    if NEW.confirmado_por_id <> v_actor_actual then
      raise exception 'Solo puedes confirmar una pauta como tú mismo.';
    end if;
    NEW.confirmado_en := now();
  else
    if not private.tengo_rol('medico') then
      raise exception 'Solo un médico puede retirar una confirmación.';
    end if;
    NEW.confirmado_en := null;
  end if;

  return NEW;
end;
$$;

-- Confirmar y retirar viven en sus propias funciones, no en un
-- update() más de la tabla. Se ejecutan con privilegio propio
-- (security definer) precisamente para no tener que cumplir la
-- exigencia de "actualizado_por_id = quien edita" — correcta para
-- editar contenido, sin sentido para confirmar la pauta de otro. Toda
-- la autorización real vive dentro de la función: rol médico, uno
-- mismo, y la versión que se vio al abrir el modal.
create function public.confirmar_contencion(p_ingreso_id uuid, p_version_esperada integer)
returns public.contenciones
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid;
  v_resultado public.contenciones;
begin
  -- coalesce(...,'') en vez de comparar directo: para quien no tiene
  -- ninguna sesión, mi_rol() devuelve NULL, y "NULL <> 'medico'" no
  -- es verdadero ni falso — es NULL, y un "if" lo trata como falso,
  -- dejando pasar la comprobación sin querer. Confirmado que esto
  -- pasaba de verdad contra Supabase antes de este arreglo.
  if not private.tengo_rol('medico') then
    raise exception 'Solo un médico puede confirmar una pauta de contención.';
  end if;
  select id into v_actor from public.profesionales where user_id = auth.uid() limit 1;
  if v_actor is null then
    raise exception 'No se ha podido identificar tu sesión.';
  end if;

  -- Bandera de sesión para que el disparador de más abajo deje pasar
  -- este UPDATE en concreto — es la única vía autorizada para tocar
  -- confirmado_por_id.
  perform set_config('app.confirmacion_rpc', 'true', true);

  update public.contenciones c
  set confirmado_por_id = v_actor
  where c.ingreso_id = p_ingreso_id
    and c.version = p_version_esperada
    -- Episodio activo: no tiene sentido confirmar la pauta de un
    -- episodio ya cerrado. Confirmado de verdad que antes se podía.
    and exists (select 1 from public.ingresos i where i.id = c.ingreso_id and i.estado = 'activo')
    -- No se puede volver a confirmar algo ya confirmado — antes esto
    -- simplemente cambiaba quién figuraba como autor, sin aviso.
    and c.confirmado_por_id is null
  returning * into v_resultado;

  if not found then
    raise exception 'version_desactualizada';
  end if;

  insert into public.contenciones_historial (ingreso_id, dia, noche, cambiado_por_id, cambiado_en, tipo_accion, actor_id)
  values (v_resultado.ingreso_id, v_resultado.dia, v_resultado.noche, v_resultado.actualizado_por_id, now(), 'confirmada', v_actor);

  return v_resultado;
end;
$$;

create function public.retirar_confirmacion_contencion(p_ingreso_id uuid, p_version_esperada integer)
returns public.contenciones
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid;
  v_resultado public.contenciones;
begin
  if not private.tengo_rol('medico') then
    raise exception 'Solo un médico puede retirar una confirmación.';
  end if;
  select id into v_actor from public.profesionales where user_id = auth.uid() limit 1;
  if v_actor is null then
    raise exception 'No se ha podido identificar tu sesión.';
  end if;

  perform set_config('app.confirmacion_rpc', 'true', true);

  update public.contenciones c
  set confirmado_por_id = null
  where c.ingreso_id = p_ingreso_id
    and c.version = p_version_esperada
    and exists (select 1 from public.ingresos i where i.id = c.ingreso_id and i.estado = 'activo')
    -- Solo tiene sentido retirar una confirmación que exista de
    -- verdad — antes se podía "retirar" una que no existía.
    and c.confirmado_por_id is not null
  returning * into v_resultado;

  if not found then
    raise exception 'version_desactualizada';
  end if;

  insert into public.contenciones_historial (ingreso_id, dia, noche, cambiado_por_id, cambiado_en, tipo_accion, actor_id)
  values (v_resultado.ingreso_id, v_resultado.dia, v_resultado.noche, v_resultado.actualizado_por_id, now(), 'confirmacion_retirada', v_actor);

  return v_resultado;
end;
$$;


-- Alta de paciente nuevo: paciente + ingreso como una sola
-- operación transaccional, para que no pueda quedar un paciente
-- sin ingreso si algo falla a mitad (confirmado que pasaba de
-- verdad antes de esta función, reproducido contra la base real).
create or replace function public.crear_paciente_e_ingreso(
  p_paciente jsonb,
  p_habitacion int,
  p_fecha_ingreso date,
  p_medico_responsable_id uuid,
  p_motivo_ingreso text,
  p_forzar boolean default false
) returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_paciente_id uuid;
  v_ingreso_id uuid;
  v_existente record;
  v_nhc text := nullif(p_paciente->>'nhc', '');
  v_cipna text := nullif(p_paciente->>'cipna', '');
begin
  if p_habitacion is not null and exists (
    select 1 from public.ingresos where habitacion = p_habitacion and estado = 'activo'
  ) then
    raise exception using errcode = 'P0001', message = 'habitacion_ocupada';
  end if;

  -- A diferencia del duplicado por nombre, aquí no hay opción de
  -- forzar: dos historias clínicas con el mismo NHC o CIPNA es
  -- siempre un error de datos, nunca dos personas distintas de
  -- verdad. Encontrado por auditoría directa contra Supabase: dos
  -- pacientes de prueba compartían el mismo NHC sin que nada lo impidiera.
  if v_nhc is not null and exists (select 1 from public.pacientes where nhc = v_nhc) then
    raise exception using errcode = 'P0001', message = 'nhc_duplicado:' || v_nhc;
  end if;

  if v_cipna is not null and exists (select 1 from public.pacientes where cipna = v_cipna) then
    raise exception using errcode = 'P0001', message = 'cipna_duplicado:' || v_cipna;
  end if;

  if not p_forzar then
    select id, nombre, primer_apellido, segundo_apellido
    into v_existente
    from public.pacientes
    where nombre_normalizado = public.inmutable_unaccent(lower(p_paciente->>'nombre'))
      and primer_apellido_normalizado = public.inmutable_unaccent(lower(p_paciente->>'primer_apellido'))
      and segundo_apellido_normalizado = public.inmutable_unaccent(lower(coalesce(p_paciente->>'segundo_apellido', '')))
    limit 1;

    if found then
      raise exception using errcode = 'P0001', message =
        'posible_duplicado:' || v_existente.id || ':' ||
        v_existente.nombre || ' ' || v_existente.primer_apellido || ' ' || coalesce(v_existente.segundo_apellido, '');
    end if;
  end if;

  insert into public.pacientes (
    nombre, primer_apellido, segundo_apellido, cipna, nhc,
    fecha_nacimiento, sexo, dni, municipio, medico_cabecera,
    contacto_familiar_nombre, contacto_familiar_telefono
  ) values (
    p_paciente->>'nombre', p_paciente->>'primer_apellido', nullif(p_paciente->>'segundo_apellido', ''),
    v_cipna, v_nhc,
    nullif(p_paciente->>'fecha_nacimiento', '')::date, nullif(p_paciente->>'sexo', ''),
    nullif(p_paciente->>'dni', ''), nullif(p_paciente->>'municipio', ''), nullif(p_paciente->>'medico_cabecera', ''),
    nullif(p_paciente->>'contacto_familiar_nombre', ''), nullif(p_paciente->>'contacto_familiar_telefono', '')
  )
  returning id into v_paciente_id;

  insert into public.ingresos (paciente_id, fecha_ingreso, habitacion, medico_responsable_id, motivo_ingreso, estado)
  values (v_paciente_id, p_fecha_ingreso, p_habitacion, nullif(p_medico_responsable_id::text, '')::uuid, p_motivo_ingreso, 'activo')
  returning id into v_ingreso_id;

  return jsonb_build_object('paciente_id', v_paciente_id, 'ingreso_id', v_ingreso_id);
end;
$$;

-- security invoker: se ejecuta con los permisos de quien la llama, así
-- que sigue exigiendo las mismas políticas RLS de siempre para poder
-- insertar en pacientes e ingresos — no es una puerta trasera.
--
-- Ya fija su propio search_path (antes no podía: dependía de que
-- inmutable_unaccent() resolviera unaccent() con el search_path de
-- quien llama. Al cualificar esa llamada por esquema dentro de la
-- propia inmutable_unaccent(), esta función quedó libre para fijar
-- el suyo también).
revoke execute on function public.crear_paciente_e_ingreso(jsonb, int, date, uuid, text, boolean) from public, anon;
grant execute on function public.crear_paciente_e_ingreso(jsonb, int, date, uuid, text, boolean) to authenticated;

-- Compartida entre informe_ingreso, informe_alta, items_paciente y
-- cmbd: sube la versión en cada guardado real, ignorando cualquier
-- valor que mandara el cliente — si dos personas guardan casi a la
-- vez, la segunda ve que su versión ya no coincide y se avisa, en vez
-- de pisar el cambio de la primera en silencio.
create function public.incrementar_version_generico() returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if TG_OP = 'INSERT' then
    NEW.version := 1;
  else
    NEW.version := OLD.version + 1;
  end if;
  return NEW;
end;
$$;

-- El estado clínico del episodio, su fecha de alta y la marca temporal
-- forman una única transición. Solo dar_de_alta() y reabrir_episodio()
-- pueden modificar ese trío; una actualización REST directa no debe
-- cerrar ni reabrir episodios saltándose el CMBD y las comprobaciones.
create function public.impedir_cambio_estado_ingreso_directo() returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if (
       new.estado is distinct from old.estado
       or new.fecha_alta is distinct from old.fecha_alta
       or new.dado_de_alta_en is distinct from old.dado_de_alta_en
     )
     and coalesce(current_setting('app.cambio_estado_ingreso_rpc', true), '') <> 'true' then
    raise exception 'El alta o la reapertura de un episodio solo puede realizarse mediante dar_de_alta() o reabrir_episodio().';
  end if;
  return new;
end;
$$;


-- ────────────────────────────────────────────────────────────
-- DISPARADORES
-- ────────────────────────────────────────────────────────────

create trigger bloquear_cambio_autor_evento
    before update on public.eventos
    for each row execute function public.evitar_cambio_autor_evento();

create trigger fijar_actualizado_por
    before update on public.eventos
    for each row execute function public.fijar_actualizado_por_evento();

create trigger aud_eventos
    after insert or update or delete on public.eventos
    for each row execute function public.registrar_auditoria_eventos();

create trigger fijar_habitacion_evento
    before insert on public.eventos
    for each row execute function public.fijar_habitacion_evento();

create trigger aud_pacientes    after insert or update or delete on public.pacientes    for each row execute function public.registrar_auditoria();
create trigger aud_profesionales after insert or update or delete on public.profesionales for each row execute function public.registrar_auditoria();
create trigger aud_ingresos     after insert or update or delete on public.ingresos     for each row execute function public.registrar_auditoria();
create trigger aud_informe_ingreso after insert or update or delete on public.informe_ingreso for each row execute function public.registrar_auditoria();
create trigger aud_informe_alta after insert or update or delete on public.informe_alta for each row execute function public.registrar_auditoria();
create trigger aud_cmbd         after insert or update or delete on public.cmbd         for each row execute function public.registrar_auditoria();
create trigger aud_escalas_clinicas after insert or update or delete on public.escalas_clinicas for each row execute function public.registrar_auditoria();

create trigger impedir_cambio_estado_ingreso_directo
    before update on public.ingresos
    for each row execute function public.impedir_cambio_estado_ingreso_directo();

create trigger trg_items_updated         before update on public.items_paciente  for each row execute function public.update_updated_at();
create trigger trg_informe_ingreso_updated before update on public.informe_ingreso for each row execute function public.update_updated_at();
create trigger trg_informe_alta_updated  before update on public.informe_alta    for each row execute function public.update_updated_at();
create trigger trg_cmbd_updated          before update on public.cmbd            for each row execute function public.update_updated_at();
create trigger trg_escalas_clinicas_updated before update on public.escalas_clinicas for each row execute function public.update_updated_at();

create trigger incrementar_version before insert or update on public.informe_ingreso for each row execute function public.incrementar_version_generico();
create trigger incrementar_version before insert or update on public.informe_alta    for each row execute function public.incrementar_version_generico();
create trigger incrementar_version before insert or update on public.items_paciente  for each row execute function public.incrementar_version_generico();
create trigger incrementar_version before insert or update on public.cmbd            for each row execute function public.incrementar_version_generico();
create trigger incrementar_version before insert or update on public.pacientes       for each row execute function public.incrementar_version_generico();
create trigger incrementar_version before insert or update on public.escalas_clinicas for each row execute function public.incrementar_version_generico();

create trigger guardar_historial_tras_cambio
  after insert or update of dia, noche on public.contenciones
  for each row execute function public.registrar_historial_contencion();

-- Solo se dispara cuando cambia la pauta de verdad (dia/noche), igual
-- que el disparador del historial de arriba — confirmado de verdad
-- que, antes, confirmar o retirar una confirmación (que solo tocan
-- confirmado_por_id) también adelantaban esta fecha, como si la
-- pauta se hubiera modificado sin ser cierto.
create trigger fijar_actualizado_en
  before insert or update of dia, noche on public.contenciones
  for each row execute function public.set_actualizado_en();

-- Impide que una sesión autenticada normal escriba confirmado_por_id
-- directamente — solo confirmar_contencion()/retirar_confirmacion_
-- contencion() pueden, marcando antes una bandera de sesión. Sin
-- esto, un médico podía confirmar o retirar a mano sin dejar ningún
-- rastro en contenciones_historial — confirmado de verdad.
create function public.impedir_confirmacion_directa() returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.confirmado_por_id is distinct from old.confirmado_por_id
     and coalesce(current_setting('app.confirmacion_rpc', true), '') <> 'true' then
    raise exception 'La confirmación de una contención solo puede cambiar mediante confirmar_contencion() o retirar_confirmacion_contencion().';
  end if;
  return new;
end;
$$;

-- El prefijo "a_" es deliberado: PostgreSQL ejecuta los disparadores
-- del mismo tipo por orden alfabético. Esta comprobación debe ver el
-- valor anterior antes de que gestionar_confirmacion invalide una
-- confirmación al cambiar la pauta.
create trigger a_impedir_confirmacion_directa
  before update on public.contenciones
  for each row execute function public.impedir_confirmacion_directa();

create trigger incrementar_version
  before update on public.contenciones
  for each row execute function public.incrementar_version_contencion();

create trigger gestionar_confirmacion
  before insert or update on public.contenciones
  for each row execute function public.gestionar_confirmacion_contencion();


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
alter table public.escalas_clinicas enable row level security;
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
    using (private.tengo_rol('medico')) with check (private.tengo_rol('medico'));

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
    with check (private.tengo_rol('medico') and estado = 'activo');
create policy editar_ingreso on public.ingresos for update to authenticated
    using (private.tengo_rol('medico') and estado = 'activo')
    with check (private.tengo_rol('medico'));
-- Deliberadamente no existe una política de borrado para ingresos —
-- borrar un episodio activo eliminaría en cascada informes, ítems,
-- incidencias, escalas, CMBD y contenciones. Confirmado que antes sí
-- existía y permitía justo eso; se retira sin sustituir por nada,
-- reforzado más abajo con un revoke a nivel de tabla.

-- informe_ingreso: solo médico, SIN exigir episodio activo — el
-- informe de alta se apoya en sus antecedentes, alergias,
-- exploraciones y tratamiento; si se detecta un error después del
-- alta, tiene que poder corregirse.
create policy escribir_medico on public.informe_ingreso to authenticated
    using (private.tengo_rol('medico'))
    with check (private.tengo_rol('medico'));

-- informe_alta y cmbd: solo médico, SIN exigir que el episodio siga
-- activo. A diferencia del informe de ingreso, estos se redactan en
-- torno al propio momento del alta — a menudo después de confirmarla
-- — así que deben poder terminarse tras cerrar el episodio.
create policy escribir_medico on public.informe_alta to authenticated
    using (private.tengo_rol('medico')) with check (private.tengo_rol('medico'));
create policy escribir_medico on public.cmbd to authenticated
    using (private.tengo_rol('medico')) with check (private.tengo_rol('medico'));

-- escalas_clinicas: mismo criterio que informe_ingreso e
-- informe_alta — solo médicos, sin restricción por estado del
-- episodio.
create policy leer_autenticado on public.escalas_clinicas
    for select to authenticated using (private.mi_rol() is not null);
create policy escribir_medico on public.escalas_clinicas to authenticated
    using (private.tengo_rol('medico'))
    with check (private.tengo_rol('medico'));

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

-- Las políticas de arriba ("escribir_medico"/"escribir_equipo") no
-- especifican operación, así que PostgreSQL las trata como válidas
-- para INSERT, UPDATE y DELETE a la vez — confirmado de verdad que
-- un médico podía borrar cualquiera de estos seis registros clínicos
-- por la API, aunque la interfaz nunca lo ofrezca. Cada una de estas
-- tablas ya tiene su propia política de lectura separada
-- ("leer_autenticado"), así que revocar DELETE a nivel de tabla no
-- afecta a leer ni a crear/editar — basta con quitar el permiso de
-- tabla, sin reescribir ninguna política.
revoke delete on public.pacientes from authenticated;
revoke delete on public.informe_ingreso from authenticated;
revoke delete on public.informe_alta from authenticated;
revoke delete on public.cmbd from authenticated;
revoke delete on public.escalas_clinicas from authenticated;
revoke delete on public.items_paciente from authenticated;
revoke delete on public.ingresos from authenticated;

-- eventos (incidencias): todo el equipo asistencial, sin exigir
-- episodio activo — deben poder registrarse y editarse después del
-- cierre. Crear exige que el autor sea la propia sesión (no se puede
-- registrar una incidencia en nombre de otro), y editar no puede
-- cambiar quién la registró (ver el disparador de arriba).
create policy crear_evento on public.eventos for insert to authenticated
    with check (
        private.mi_rol() in ('medico', 'enfermeria', 'auxiliar', 'tecnico')
        and registrado_por_id = (select id from profesionales where user_id = auth.uid() limit 1)
    );
-- Editar y borrar: solo quien la registró, o un administrador (por
-- ejemplo, para corregir o borrar una incidencia dada de alta por
-- error). El resto del equipo puede seguir viéndolas todas, pero no
-- tocar las que no son suyas.
-- Editar ya no exige ser el autor ni admin, ni episodio activo —
-- cualquier profesional asistencial puede completar una incidencia
-- en un turno posterior o tras el cierre, es un registro compartido.
-- Borrar tampoco exige ya episodio activo — el botón de borrar en la
-- interfaz nunca lo comprobaba, así que aparecía igual en un episodio
-- cerrado y Supabase lo bloqueaba en silencio al intentarlo de
-- verdad. Sigue exigiendo ser el autor o un administrador.
create policy editar_evento on public.eventos for update to authenticated
    using (private.mi_rol() in ('medico', 'enfermeria', 'auxiliar', 'tecnico'))
    with check (private.mi_rol() in ('medico', 'enfermeria', 'auxiliar', 'tecnico'));
create policy borrar_evento on public.eventos for delete to authenticated
    using (
        private.mi_rol() in ('medico', 'enfermeria', 'auxiliar', 'tecnico')
        and (registrado_por_id = (select id from profesionales where user_id = auth.uid() limit 1) or private.soy_admin())
    );

-- contenciones: lectura para todo el equipo con ficha activa.
alter table public.contenciones enable row level security;
alter table public.contenciones_historial enable row level security;

create policy leer_autenticado on public.contenciones
    for select to authenticated using (private.mi_rol() is not null);

create policy leer_autenticado on public.contenciones_historial
    for select to authenticated using (private.mi_rol() is not null);
-- Sin política de escritura para contenciones_historial: solo se
-- escribe desde el disparador de arriba (SECURITY DEFINER); nadie
-- puede tocarlo a mano, ni siquiera un administrador.

-- Escritura: cualquier profesional asistencial puede pautar o
-- modificar, mientras el episodio siga activo. La orden verbal sigue
-- siendo del médico, pero no se restringe quién la introduce en la
-- aplicación (decisión explícita, no un descuido).
create policy escribir_equipo on public.contenciones
    for insert to authenticated
    with check (
        private.mi_rol() in ('medico', 'enfermeria', 'auxiliar', 'tecnico')
        and exists (select 1 from ingresos i where i.id = contenciones.ingreso_id and i.estado = 'activo')
        and actualizado_por_id = (select id from profesionales where user_id = auth.uid() limit 1)
        -- Confirmar solo pasa por confirmar_contencion(), nunca al
        -- crear la fila.
        and confirmado_por_id is null
    );

create policy modificar_equipo on public.contenciones
    for update to authenticated
    using (
        private.mi_rol() in ('medico', 'enfermeria', 'auxiliar', 'tecnico')
        and exists (select 1 from ingresos i where i.id = contenciones.ingreso_id and i.estado = 'activo')
    )
    with check (
        private.mi_rol() in ('medico', 'enfermeria', 'auxiliar', 'tecnico')
        and actualizado_por_id = (select id from profesionales where user_id = auth.uid() limit 1)
    );

-- confirmar_contencion() y retirar_confirmacion_contencion() son
-- security definer: se saltan esta política a propósito para su
-- propia escritura interna (ver su definición en FUNCIONES) — toda
-- la autorización real vive dentro de esas funciones.
--
-- El revoke explícito es imprescindible, no decorativo: Postgres
-- concede permiso de ejecución a PUBLIC (que incluye a "anon", quien
-- no tiene ninguna sesión) sobre cualquier función nueva, salvo que
-- se revoque a propósito. Confirmado reproduciéndolo de verdad: sin
-- este revoke, alguien sin sesión podía retirar la confirmación de
-- una contención real solo conociendo el ingreso.
revoke execute on function public.retirar_confirmacion_contencion(uuid, integer) from public, anon;
revoke execute on function public.confirmar_contencion(uuid, integer) from public, anon;
grant execute on function public.confirmar_contencion(uuid, integer) to authenticated;
grant execute on function public.retirar_confirmacion_contencion(uuid, integer) to authenticated;

-- Una única función transaccional para dar de alta: actualiza el
-- estado del ingreso y el motivo del CMBD a la vez, con los mismos
-- seis códigos que ya usa el propio CMBD (TIPALT) — una sola
-- elección del motivo, no dos preguntas separadas por lo mismo. Así
-- nunca queda un ingreso cerrado con el CMBD vacío o incompatible.
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
  if not private.tengo_rol('medico') then
    raise exception 'Solo un médico puede dar de alta.';
  end if;

  if p_fecha_alta is null or p_fecha_alta > private.hoy_madrid() then
    raise exception 'La fecha de alta no es válida.';
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

  if p_fecha_alta < (select fecha_ingreso from public.ingresos where id = p_ingreso_id) then
    raise exception 'La fecha de alta no puede ser anterior a la de ingreso.';
  end if;

  perform set_config('app.cambio_estado_ingreso_rpc', 'true', true);

  update public.ingresos
  set estado = v_estado, fecha_alta = p_fecha_alta, dado_de_alta_en = now()
  where id = p_ingreso_id and estado = 'activo'
  returning * into v_actualizado;

  if not found then
    raise exception 'Este episodio ya no está activo, o no existe.';
  end if;

  -- INSERT ... ON CONFLICT en vez de un UPDATE a ciegas: si el CMBD
  -- todavía no existía (un ingreso que nunca se llegó a abrir en esa
  -- pestaña), esto lo crea; si ya existía, lo actualiza. Confirmado
  -- de verdad que, antes, un UPDATE sobre una fila inexistente
  -- afectaba a cero filas y el alta se daba por buena igualmente,
  -- con el CMBD vacío para siempre.
  insert into public.cmbd (ingreso_id, circunstancia_alta)
  values (p_ingreso_id, p_circunstancia_alta)
  on conflict (ingreso_id) do update set circunstancia_alta = excluded.circunstancia_alta;

  return jsonb_build_object('estado', v_estado, 'fecha_alta', v_actualizado.fecha_alta);
end;
$$;

revoke execute on function public.dar_de_alta(uuid, date, text) from public, anon;
grant execute on function public.dar_de_alta(uuid, date, text) to authenticated;

-- Reabrir un episodio dado de alta por error — mismo permiso que dar
-- de alta (médico), dentro de las 24h siguientes. security definer
-- porque necesita escribir directamente en auditoria (nadie tiene
-- permiso de insertar ahí a mano, solo los disparadores) — por eso
-- las comprobaciones de quién puede hacerlo van explícitas aquí
-- dentro, no delegadas a RLS.
create or replace function public.reabrir_episodio(p_ingreso_id uuid) returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_ingreso public.ingresos;
begin
  if not private.tengo_rol('medico') then
    raise exception 'Solo un médico o un administrador puede reabrir un episodio.';
  end if;

  select * into v_ingreso from public.ingresos where id = p_ingreso_id;

  if v_ingreso is null then
    raise exception 'Ingreso no encontrado.';
  end if;

  if v_ingreso.estado = 'activo' then
    raise exception 'Este episodio ya está activo.';
  end if;

  if v_ingreso.dado_de_alta_en is null or now() - v_ingreso.dado_de_alta_en > interval '24 hours' then
    raise exception 'Solo se puede reabrir un episodio dentro de las 24 horas siguientes al alta.';
  end if;

  perform set_config('app.cambio_estado_ingreso_rpc', 'true', true);

  update public.ingresos
  set estado = 'activo', fecha_alta = null, dado_de_alta_en = null
  where id = p_ingreso_id;

  update public.cmbd
  set circunstancia_alta = null
  where ingreso_id = p_ingreso_id;

  -- Rastro explícito: el disparador genérico de auditoría ya registra
  -- el UPDATE de ingresos, pero solo como una edición cualquiera, sin
  -- guardar qué decía antes y qué dice después — esto sí lo hace, y
  -- deja claro que fue una reapertura, no un cambio distinto.
  insert into public.auditoria (tabla, registro_id, accion, usuario_id, valores_antes, valores_despues)
  values (
    'ingresos', p_ingreso_id, 'reapertura', auth.uid(),
    jsonb_build_object('estado', v_ingreso.estado, 'fecha_alta', v_ingreso.fecha_alta),
    jsonb_build_object('estado', 'activo', 'fecha_alta', null)
  );
end;
$$;

grant execute on function public.reabrir_episodio(uuid) to authenticated;
-- security definer (escribe directamente en auditoria) — se revoca
-- el permiso por defecto que Postgres concede a PUBLIC, igual que ya
-- se hizo para el resto de funciones con privilegios elevados.
revoke execute on function public.reabrir_episodio(uuid) from public, anon;

-- Lo mismo para las funciones que solo deben dispararse solas, nunca
-- llamarse a mano — señaladas por el Security Advisor de Supabase.
-- Confirmado antes que esto no era explotable de verdad (Postgres ya
-- impide llamar una función de disparador fuera de un disparador
-- real), pero conviene cerrar el permiso sobrante igualmente.
revoke execute on function public.fijar_actualizado_por_evento() from public, anon, authenticated;
revoke execute on function public.registrar_auditoria_eventos() from public, anon, authenticated;
revoke execute on function public.fijar_habitacion_evento() from public, anon, authenticated;
revoke execute on function public.registrar_auditoria() from public, anon, authenticated;
revoke execute on function public.registrar_historial_contencion() from public, anon, authenticated;
revoke execute on function public.gestionar_confirmacion_contencion() from public, anon, authenticated;
revoke execute on function public.impedir_confirmacion_directa() from public, anon, authenticated;
revoke execute on function public.impedir_cambio_estado_ingreso_directo() from public, anon, authenticated;


-- ────────────────────────────────────────────────────────────
-- ÍNDICES
-- ────────────────────────────────────────────────────────────

-- Impiden dos ingresos activos del mismo paciente, o dos pacientes
-- activos a la vez en la misma habitación. Parciales (solo sobre
-- estado='activo'): no afectan a episodios ya cerrados.
create unique index ingresos_paciente_activo_unico on public.ingresos (paciente_id) where estado = 'activo';
create unique index ingresos_habitacion_activa_unica on public.ingresos (habitacion) where estado = 'activo' and habitacion is not null;

-- ingresos (estado): lo consulta un "exists" en casi cada política de
-- escritura de la app — sin esto, cada INSERT/UPDATE/DELETE hace un
-- recorrido completo de la tabla.
create index ingresos_estado_idx on public.ingresos (estado);
-- ingresos (paciente_id, fecha_ingreso desc): lo usa la vista
-- pacientes_con_ultimo_ingreso (un "lateral join" que pide el último
-- ingreso de cada paciente) y las pantallas de Paciente/Dashboard.
create index ingresos_paciente_fecha_idx on public.ingresos (paciente_id, fecha_ingreso desc);

create index eventos_ingreso_idx on public.eventos (ingreso_id);
create index eventos_fecha_idx on public.eventos (fecha);
create index eventos_tipo_idx on public.eventos (tipo);
create index items_historico_fecha_idx on public.items_historico (fecha);
create index auditoria_tabla_registro_idx on public.auditoria (tabla, registro_id);
create index auditoria_fecha_idx on public.auditoria (fecha desc);
create index pacientes_nombre_normalizado_idx on public.pacientes (nombre_normalizado);

-- Únicos, pero solo cuando de verdad hay un valor que comparar —
-- muchos pacientes no tienen NHC o CIPNA asignado, y un "unique"
-- normal trataría dos campos en blanco como si fueran el mismo dato.
-- Encontrado por auditoría directa: dos pacientes de prueba
-- compartían el mismo NHC sin que nada lo impidiera — con datos
-- clínicos reales, ese mismo fallo sería mucho más grave.
create unique index if not exists pacientes_nhc_unico
  on public.pacientes (nhc)
  where nhc is not null and nhc <> '';

create unique index if not exists pacientes_cipna_unico
  on public.pacientes (cipna)
  where cipna is not null and cipna <> '';

create index pacientes_primer_apellido_normalizado_idx on public.pacientes (primer_apellido_normalizado);
create index contenciones_historial_ingreso_idx on public.contenciones_historial (ingreso_id, cambiado_en desc);
-- Nota: no hace falta un índice aparte en profesionales(user_id) ni
-- en items_historico(ingreso_id) — ya están cubiertos por el UNIQUE
-- de esa columna y por el UNIQUE compuesto (ingreso_id, fecha).


-- ────────────────────────────────────────────────────────────
-- TAREA PROGRAMADA
-- ────────────────────────────────────────────────────────────

-- Genera la foto diaria de items_paciente cada noche a las 23:00.
select cron.schedule('snapshot-items-diario', '0 23 * * *', 'select generar_snapshot_items()');

-- Y la de la pauta de cuidados, a la misma hora.
select cron.schedule('snapshot-pauta-diario', '0 23 * * *', 'select generar_snapshot_pauta()');


-- ────────────────────────────────────────────────────────────
-- DATOS INICIALES
-- ────────────────────────────────────────────────────────────

-- AJUSTAR ANTES DE USAR EN UNA INSTALACIÓN NUEVA: esto es solo un
-- ejemplo de arranque, no la lista real de personal de la clínica —
-- una plantilla genérica no debería llevar nombres reales de
-- personas concretas. Sustitúyase por el nombre real de quien vaya a
-- ser la primera persona administradora antes de ejecutar esto.
insert into public.profesionales (nombre, apellidos, rol) values
    ('Administrador', 'Inicial', 'medico');

update public.profesionales
set es_admin = true
where nombre = 'Administrador' and apellidos = 'Inicial';

commit;

-- ============================================================
-- Dashboard, primera fase — Resumen, Actividad, Seguridad y el
-- Explorador de episodios. Seis funciones independientes, cada una
-- con su propia responsabilidad, en vez de una única función
-- gigantesca. security invoker en todas salvo donde se indica.
--
-- Nota de honestidad: este archivo tiene varias transacciones
-- independientes (begin/commit), no una sola que envuelva todo el
-- fichero. Si esta sección fallara en una instalación limpia, el
-- esquema principal de más arriba ya habría quedado aplicado, en un
-- estado a medias. No se ha fusionado todo en una única transacción
-- todavía por evitar el riesgo de introducir un error nuevo al
-- reestructurar un archivo de este tamaño de una vez — queda anotado
-- como pendiente, no escondido.
-- ============================================================

begin;

-- ============================================================
-- Funciones del Dashboard (todas security invoker, solo administradores)
--
-- Convenciones comunes:
--   · "Hoy" es la fecha de Madrid (private.hoy_madrid()), no la de UTC.
--   · El número de camas sale de private.numero_camas().
--   · Un episodio ocupa cama desde el día de ingreso hasta el día
--     anterior al alta (el día de ingreso cuenta; el del alta, no).
--   · Contención "activa" = continua por seguridad (día) o contención
--     fija (noche). "Si precisa" = cualquier pauta "si precisa" que no
--     sea ya activa. Son excluyentes: un paciente cuenta en una sola.
-- ============================================================

create or replace function public.dashboard_situacion_actual(
  p_medico_id uuid default null
) returns jsonb
language plpgsql
security invoker
stable
set search_path = ''
as $$
declare
  v_hoy date := private.hoy_madrid();
  v_camas integer := private.numero_camas();
  v_activos integer;
  v_estancia_larga integer;
  v_semaforo_riesgo integer;
  v_contencion_activa integer;
  v_contencion_si_precisa integer;
  v_contencion_pendiente integer;
  v_incidencias_pendientes integer;
begin
  if not private.soy_admin() then
    raise exception 'Solo un administrador puede acceder al Dashboard.';
  end if;

  select count(*) into v_activos
  from public.ingresos i
  where i.estado = 'activo'
    and (p_medico_id is null or i.medico_responsable_id = p_medico_id);

  select count(*) into v_estancia_larga
  from public.ingresos i
  where i.estado = 'activo'
    and i.fecha_ingreso <= v_hoy - 60
    and (p_medico_id is null or i.medico_responsable_id = p_medico_id);

  select count(*) into v_semaforo_riesgo
  from public.ingresos i
  inner join public.items_paciente ip on ip.ingreso_id = i.id
  where i.estado = 'activo'
    and ip.semaforo_caidas in ('rojo', 'naranja')
    and (p_medico_id is null or i.medico_responsable_id = p_medico_id);

  -- Solo contención de verdad, no cualquier medida de seguridad
  -- nocturna (barras, cota cero, sensor de presión). Misma regla que
  -- severidadDia / severidadNoche en la aplicación: "activa" y "si
  -- precisa" son niveles distintos, y los dos necesitan confirmación.
  with pauta as (
    select
      (coalesce(c.dia = 'continua_seguridad', false)
        or coalesce('contencion_fija' = any(c.noche), false)) as activa,
      (coalesce(c.dia in ('si_precisa_supervision', 'si_precisa_paciente'), false)
        or coalesce('contencion_si_precisa' = any(c.noche), false)) as si_precisa,
      c.confirmado_por_id
    from public.ingresos i
    inner join public.contenciones c on c.ingreso_id = i.id
    where i.estado = 'activo'
      and (p_medico_id is null or i.medico_responsable_id = p_medico_id)
  )
  select
    count(*) filter (where activa),
    count(*) filter (where si_precisa and not activa),
    count(*) filter (where (activa or si_precisa) and confirmado_por_id is null)
  into v_contencion_activa, v_contencion_si_precisa, v_contencion_pendiente
  from pauta;

  -- Sin el filtro de "ingreso activo": una incidencia puede quedar
  -- pendiente de completar después del alta, y debe seguir contando
  -- como trabajo pendiente igualmente.
  -- Las úlceras por presión ya no son una incidencia: se registran en
  -- Curas y tienen su propio apartado en Seguridad. Se excluyen aquí
  -- (también los eventos antiguos de ese tipo) para que la cifra coincida
  -- con la lista de Incidencias.
  select count(*) into v_incidencias_pendientes
  from public.eventos e
  inner join public.ingresos i on i.id = e.ingreso_id
  where e.estado = 'pendiente'
    and e.tipo <> 'ulcera'
    and (p_medico_id is null or i.medico_responsable_id = p_medico_id);

  return jsonb_build_object(
    'pacientes_ingresados', v_activos,
    'ocupacion_actual_pct', round(v_activos::numeric / v_camas * 100, 1),
    'estancia_larga_60', v_estancia_larga,
    'semaforo_riesgo', v_semaforo_riesgo,
    'contencion_activa', v_contencion_activa,
    'contencion_si_precisa', v_contencion_si_precisa,
    'contencion_pendiente_confirmacion', v_contencion_pendiente,
    'incidencias_pendientes', v_incidencias_pendientes
  );
end;
$$;

create or replace function public.dashboard_resumen(
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
  v_camas integer := private.numero_camas();
  v_ingresos_nuevos integer;
  v_altas integer;
  v_traslados integer;
  v_exitus integer;
  v_dias_estancia bigint;
  v_ocupacion_media numeric;
  v_ocupacion_min numeric;
  v_ocupacion_max numeric;
  v_estancia_media numeric;
  v_estancia_mediana numeric;
  v_reingresos integer;
  v_incidencias integer;
begin
  if not private.soy_admin() then
    raise exception 'Solo un administrador puede acceder al Dashboard.';
  end if;
  if p_desde > p_hasta then
    raise exception 'La fecha "desde" no puede ser posterior a "hasta".';
  end if;

  select count(*) into v_ingresos_nuevos
  from public.ingresos i
  where i.fecha_ingreso between p_desde and p_hasta
    and (p_medico_id is null or i.medico_responsable_id = p_medico_id);

  select
    count(*) filter (where i.estado = 'alta'),
    count(*) filter (where i.estado = 'alta_traslado'),
    count(*) filter (where i.estado = 'exitus')
  into v_altas, v_traslados, v_exitus
  from public.ingresos i
  where i.fecha_alta between p_desde and p_hasta
    and (p_medico_id is null or i.medico_responsable_id = p_medico_id);

  select coalesce(sum(
    greatest(0, (least(coalesce(i.fecha_alta, p_hasta + 1), p_hasta + 1) - greatest(i.fecha_ingreso, p_desde)))
  ), 0) into v_dias_estancia
  from public.ingresos i
  where i.fecha_ingreso <= p_hasta
    and (i.fecha_alta is null or i.fecha_alta >= p_desde)
    and (p_medico_id is null or i.medico_responsable_id = p_medico_id);

  with dias as (
    select generate_series(p_desde, p_hasta, interval '1 day')::date as f
  ), ocupacion as (
    select d.f, count(i.id) as camas
    from dias d
    left join public.ingresos i
      on i.fecha_ingreso <= d.f
      and (i.fecha_alta > d.f or i.fecha_alta is null)
      and (p_medico_id is null or i.medico_responsable_id = p_medico_id)
    group by d.f
  )
  select avg(camas) / v_camas * 100, min(camas)::numeric / v_camas * 100, max(camas)::numeric / v_camas * 100
  into v_ocupacion_media, v_ocupacion_min, v_ocupacion_max
  from ocupacion;

  select
    avg(i.fecha_alta - i.fecha_ingreso),
    percentile_cont(0.5) within group (order by (i.fecha_alta - i.fecha_ingreso))
  into v_estancia_media, v_estancia_mediana
  from public.ingresos i
  where i.fecha_alta between p_desde and p_hasta
    and (p_medico_id is null or i.medico_responsable_id = p_medico_id);

  -- Ingresos nuevos del periodo que son reingresos: el mismo paciente
  -- (misma ficha) tuvo un alta o traslado en los 30 días anteriores.
  -- Es una proporción sobre ingresos, no la tasa clásica sobre altas.
  select count(*) into v_reingresos
  from public.ingresos i
  where i.fecha_ingreso between p_desde and p_hasta
    and (p_medico_id is null or i.medico_responsable_id = p_medico_id)
    and exists (
      select 1 from public.ingresos previo
      where previo.paciente_id = i.paciente_id
        and previo.id <> i.id
        and previo.estado in ('alta', 'alta_traslado')
        and previo.fecha_alta < i.fecha_ingreso
        and previo.fecha_alta >= i.fecha_ingreso - 30
    );

  -- Sin úlceras por presión (ver dashboard_seguridad): así la cifra
  -- coincide con la lista de Incidencias a la que lleva.
  select count(*) into v_incidencias
  from public.eventos e
  inner join public.ingresos i on i.id = e.ingreso_id
  where e.fecha between p_desde and p_hasta
    and e.tipo <> 'ulcera'
    and (p_medico_id is null or i.medico_responsable_id = p_medico_id);

  return jsonb_build_object(
    'ingresos_nuevos', v_ingresos_nuevos,
    'altas', v_altas,
    'traslados', v_traslados,
    'exitus', v_exitus,
    'salidas_totales', v_altas + v_traslados + v_exitus,
    'dias_estancia', v_dias_estancia,
    'ocupacion_media_pct', round(coalesce(v_ocupacion_media, 0), 1),
    'ocupacion_min_pct', round(coalesce(v_ocupacion_min, 0), 1),
    'ocupacion_max_pct', round(coalesce(v_ocupacion_max, 0), 1),
    'estancia_media_dias', round(coalesce(v_estancia_media, 0), 1),
    'estancia_mediana_dias', round(coalesce(v_estancia_mediana, 0), 1),
    'reingresos_30d', v_reingresos,
    'incidencias_total', v_incidencias,
    'incidencias_tasa_1000', case when v_dias_estancia > 0 then round(v_incidencias::numeric / v_dias_estancia * 1000, 1) else null end
  );
end;
$$;

create or replace function public.dashboard_series(
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
  v_dias_periodo integer;
  v_bucket text;
  v_ocupacion jsonb;
  v_movimientos jsonb;
begin
  if not private.soy_admin() then
    raise exception 'Solo un administrador puede acceder al Dashboard.';
  end if;
  if p_desde > p_hasta then
    raise exception 'La fecha "desde" no puede ser posterior a "hasta".';
  end if;

  v_dias_periodo := (p_hasta - p_desde) + 1;
  v_bucket := case
    when v_dias_periodo <= 31 then 'day'
    when v_dias_periodo <= 180 then 'week'
    else 'month'
  end;

  with dias as (
    select generate_series(p_desde, p_hasta, interval '1 day')::date as f
  )
  select jsonb_agg(jsonb_build_object('fecha', d.f, 'camas', (
    select count(*) from public.ingresos i
    where i.fecha_ingreso <= d.f
      and (i.fecha_alta > d.f or i.fecha_alta is null)
      and (p_medico_id is null or i.medico_responsable_id = p_medico_id)
  )) order by d.f)
  into v_ocupacion
  from dias d;

  -- Tramos naturales: las semanas empiezan en lunes y los meses el día
  -- 1. El primer y el último tramo se recortan al periodo elegido, así
  -- que pueden ser parciales, pero nunca se solapan ni dejan huecos.
  with periodos as (
    select generate_series(
      date_trunc(v_bucket, p_desde::timestamp),
      p_hasta::timestamp,
      ('1 ' || v_bucket)::interval
    ) as natural_inicio
  ), rangos as (
    select
      greatest(natural_inicio::date, p_desde) as inicio,
      least((natural_inicio + ('1 ' || v_bucket)::interval)::date - 1, p_hasta) as fin
    from periodos
  )
  select jsonb_agg(jsonb_build_object(
    'inicio', r.inicio,
    'fin', r.fin,
    'ingresos', (
      select count(*) from public.ingresos i
      where i.fecha_ingreso between r.inicio and r.fin
        and (p_medico_id is null or i.medico_responsable_id = p_medico_id)
    ),
    'salidas', (
      select count(*) from public.ingresos i
      where i.fecha_alta between r.inicio and r.fin
        and (p_medico_id is null or i.medico_responsable_id = p_medico_id)
    )
  ) order by r.inicio)
  into v_movimientos
  from rangos r;

  return jsonb_build_object(
    'agrupacion', v_bucket,
    'ocupacion_diaria', coalesce(v_ocupacion, '[]'::jsonb),
    'movimientos', coalesce(v_movimientos, '[]'::jsonb)
  );
end;
$$;

create or replace function public.dashboard_actividad_detalle(
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
  v_hoy date := private.hoy_madrid();
  v_distribucion_estancia jsonb;
  v_activos_30 integer;
  v_activos_60 integer;
  v_activos_90 integer;
  v_por_medico jsonb;
  v_por_sexo jsonb;
  v_edad_media numeric;
begin
  if not private.soy_admin() then
    raise exception 'Solo un administrador puede acceder al Dashboard.';
  end if;

  select jsonb_build_object(
    '0-15', count(*) filter (where (i.fecha_alta - i.fecha_ingreso) between 0 and 15),
    '16-30', count(*) filter (where (i.fecha_alta - i.fecha_ingreso) between 16 and 30),
    '31-60', count(*) filter (where (i.fecha_alta - i.fecha_ingreso) between 31 and 60),
    '61-90', count(*) filter (where (i.fecha_alta - i.fecha_ingreso) between 61 and 90),
    'mas_90', count(*) filter (where (i.fecha_alta - i.fecha_ingreso) > 90)
  ) into v_distribucion_estancia
  from public.ingresos i
  where i.fecha_alta between p_desde and p_hasta
    and (p_medico_id is null or i.medico_responsable_id = p_medico_id);

  select
    count(*) filter (where fecha_ingreso <= v_hoy - 30),
    count(*) filter (where fecha_ingreso <= v_hoy - 60),
    count(*) filter (where fecha_ingreso <= v_hoy - 90)
  into v_activos_30, v_activos_60, v_activos_90
  from public.ingresos
  where estado = 'activo'
    and (p_medico_id is null or medico_responsable_id = p_medico_id);

  select coalesce(jsonb_agg(jsonb_build_object(
    'medico_id', pr.id,
    'nombre', pr.nombre || ' ' || pr.apellidos,
    'ingresos', c.total
  ) order by c.total desc), '[]'::jsonb)
  into v_por_medico
  from (
    select medico_responsable_id, count(*) as total
    from public.ingresos
    where fecha_ingreso between p_desde and p_hasta
      and medico_responsable_id is not null
      and (p_medico_id is null or medico_responsable_id = p_medico_id)
    group by medico_responsable_id
  ) c
  inner join public.profesionales pr on pr.id = c.medico_responsable_id;

  -- Personas, no episodios: cada paciente con ingreso en el periodo
  -- cuenta una sola vez, con la edad de su primer ingreso del periodo.
  select
    jsonb_build_object(
      'hombre', count(*) filter (where t.sexo = 'hombre'),
      'mujer', count(*) filter (where t.sexo = 'mujer'),
      'otro', count(*) filter (where t.sexo = 'otro'),
      'sin_dato', count(*) filter (where t.sexo is null)
    ),
    avg(t.edad)
  into v_por_sexo, v_edad_media
  from (
    select distinct on (i.paciente_id)
      p.sexo,
      extract(year from age(i.fecha_ingreso, p.fecha_nacimiento)) as edad
    from public.ingresos i
    inner join public.pacientes p on p.id = i.paciente_id
    where i.fecha_ingreso between p_desde and p_hasta
      and (p_medico_id is null or i.medico_responsable_id = p_medico_id)
    order by i.paciente_id, i.fecha_ingreso
  ) t;

  return jsonb_build_object(
    'distribucion_estancia', v_distribucion_estancia,
    'activos_mas_30', v_activos_30,
    'activos_mas_60', v_activos_60,
    'activos_mas_90', v_activos_90,
    'por_medico', v_por_medico,
    'por_sexo', v_por_sexo,
    'edad_media', round(coalesce(v_edad_media, 0), 1)
  );
end;
$$;

create or replace function public.dashboard_seguridad(
  p_desde date,
  p_hasta date,
  p_medico_id uuid default null
) returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_dias_estancia bigint;
  v_por_tipo jsonb;
  v_caidas jsonb;
  v_ulceras jsonb;
  v_otras jsonb;
  v_contenciones jsonb;
begin
  if not private.soy_admin() then
    raise exception 'Solo un administrador puede acceder al Dashboard.';
  end if;
  if p_desde > p_hasta then
    raise exception 'La fecha "desde" no puede ser posterior a "hasta".';
  end if;

  select coalesce(sum(
    greatest(0, (least(coalesce(i.fecha_alta, p_hasta + 1), p_hasta + 1) - greatest(i.fecha_ingreso, p_desde)))
  ), 0) into v_dias_estancia
  from public.ingresos i
  where i.fecha_ingreso <= p_hasta
    and (i.fecha_alta is null or i.fecha_alta >= p_desde)
    and (p_medico_id is null or i.medico_responsable_id = p_medico_id);

  select coalesce(jsonb_agg(jsonb_build_object(
    'tipo', t.tipo,
    'total', t.total,
    'pacientes_afectados', t.pacientes,
    'pendientes', t.pendientes,
    'tasa_1000', case when v_dias_estancia > 0 then round(t.total::numeric / v_dias_estancia * 1000, 2) else null end
  ) order by t.total desc), '[]'::jsonb)
  into v_por_tipo
  from (
    select e.tipo, count(*) as total, count(distinct e.ingreso_id) as pacientes,
           count(*) filter (where e.estado = 'pendiente') as pendientes
    from public.eventos e
    inner join public.ingresos i on i.id = e.ingreso_id
    where e.fecha between p_desde and p_hasta
      and e.tipo <> 'ulcera'
      and (p_medico_id is null or i.medico_responsable_id = p_medico_id)
    group by e.tipo
  ) t;

  select jsonb_build_object(
    'total', count(*),
    'con_lesion', count(*) filter (where e.datos->>'con_lesion' = 'Sí'),
    'pendientes_valoracion', count(*) filter (where e.datos->>'con_lesion' = 'Pendiente de valoración'),
    'graves', count(*) filter (where e.datos->>'gravedad' = 'Grave' or e.datos->>'consecuencias' in ('Fractura', 'TCE')),
    'tasa_total_1000', case when v_dias_estancia > 0 then round(count(*)::numeric / v_dias_estancia * 1000, 2) else null end,
    'tasa_con_lesion_1000', case when v_dias_estancia > 0 then round(count(*) filter (where e.datos->>'con_lesion' = 'Sí')::numeric / v_dias_estancia * 1000, 2) else null end
  ) into v_caidas
  from public.eventos e
  inner join public.ingresos i on i.id = e.ingreso_id
  where e.tipo = 'caida' and e.fecha between p_desde and p_hasta
    and (p_medico_id is null or i.medico_responsable_id = p_medico_id);

  -- Úlceras por presión: salen de Curas (curas_lesiones con tipo 'upp'),
  -- no de las incidencias. Periodo = fecha de inicio/detección.
  --   producidas en el centro  -> origen 'centro'  (las que cuentan para la tasa)
  --   presentes al ingreso     -> origen 'fuera'
  --   sin origen indicado      -> origen null (pendiente de completar en Curas)
  -- Grado III-IV: el grado MÁXIMO que haya llegado a registrarse.
  with upp as (
    select l.id, l.ingreso_id, l.origen,
           (select max(case v.grado when 'I' then 1 when 'II' then 2 when 'III' then 3 when 'IV' then 4 end)
              from public.curas_valoraciones v where v.lesion_id = l.id) as grado_max
    from public.curas_lesiones l
    inner join public.ingresos i on i.id = l.ingreso_id
    where l.caracteristicas = 'upp'
      and l.fecha_inicio between p_desde and p_hasta
      and (p_medico_id is null or i.medico_responsable_id = p_medico_id)
  )
  select jsonb_build_object(
    'presentes_al_ingreso', count(*) filter (where origen = 'fuera'),
    'aparecidas_durante', count(*) filter (where origen = 'centro'),
    'sin_origen', count(*) filter (where origen is null),
    'grado_iii_iv', count(*) filter (where grado_max >= 3),
    'pacientes_afectados', count(distinct ingreso_id),
    'tasa_aparecidas_1000', case when v_dias_estancia > 0 then round(
      count(*) filter (where origen = 'centro')::numeric / v_dias_estancia * 1000, 2
    ) else null end
  ) into v_ulceras
  from upp;

  -- "Pendientes de completar" cuenta las incidencias pendientes de
  -- TODOS los tipos del periodo (también las caídas), igual que
  -- la tabla "por tipo" y que la lista que se abre al pulsarla. Los
  -- recuentos de cada tipo siguen filtrando por su tipo.
  select jsonb_build_object(
    'errores_medicacion', count(*) filter (where e.tipo = 'error_medicacion'),
    'efectos_adversos', count(*) filter (where e.tipo = 'efecto_adverso_medicacion'),
    'infecciones_nosocomiales', count(*) filter (where e.tipo = 'infeccion_nosocomial'),
    'agresiones', count(*) filter (where e.tipo = 'agresividad_fisica'),
    'fugas', count(*) filter (where e.tipo = 'fuga'),
    'pendientes_completar', count(*) filter (where e.estado = 'pendiente')
  ) into v_otras
  from public.eventos e
  inner join public.ingresos i on i.id = e.ingreso_id
  where e.fecha between p_desde and p_hasta
    and e.tipo <> 'ulcera'
    and (p_medico_id is null or i.medico_responsable_id = p_medico_id);

  with pauta as (
    select
      (coalesce(c.dia = 'continua_seguridad', false)
        or coalesce('contencion_fija' = any(c.noche), false)) as activa,
      (coalesce(c.dia in ('si_precisa_supervision', 'si_precisa_paciente'), false)
        or coalesce('contencion_si_precisa' = any(c.noche), false)) as si_precisa,
      c.confirmado_por_id
    from public.ingresos i2
    inner join public.contenciones c on c.ingreso_id = i2.id
    where i2.estado = 'activo'
      and (p_medico_id is null or i2.medico_responsable_id = p_medico_id)
  )
  select jsonb_build_object(
    'pacientes_con_contencion_activa', (select count(*) from pauta where activa),
    'pacientes_con_si_precisa', (select count(*) from pauta where si_precisa and not activa),
    'pendientes_confirmacion', (select count(*) from pauta where (activa or si_precisa) and confirmado_por_id is null),
    'cambios_pauta_periodo', (
      select count(*) from public.contenciones_historial ch
      inner join public.ingresos i2 on i2.id = ch.ingreso_id
      where ch.tipo_accion in ('pauta_creada', 'pauta_modificada')
        and (ch.cambiado_en at time zone 'Europe/Madrid')::date between p_desde and p_hasta
        and (p_medico_id is null or i2.medico_responsable_id = p_medico_id)
    )
  ) into v_contenciones;

  return jsonb_build_object(
    'por_tipo', v_por_tipo,
    'caidas', v_caidas,
    'ulceras', v_ulceras,
    'otras', v_otras,
    'contenciones', v_contenciones,
    'dias_estancia', v_dias_estancia
  );
end;
$$;

create or replace function public.buscar_episodios_dashboard(
  p_busqueda text default null,
  p_desde_ingreso date default null,
  p_hasta_ingreso date default null,
  p_desde_alta date default null,
  p_hasta_alta date default null,
  p_solapa_desde date default null,
  p_solapa_hasta date default null,
  p_estado text default null,
  p_medico_id uuid default null,
  p_estancia_min integer default null,
  p_estancia_max integer default null,
  p_con_incidencias boolean default null,
  p_tipo_incidencia text default null,
  p_orden text default 'fecha_ingreso',
  p_orden_dir text default 'desc',
  p_pagina integer default 1,
  p_por_pagina integer default 50,
  p_paginar boolean default true
) returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_total integer;
  v_filas jsonb;
  v_offset integer;
  v_limite integer;
  v_orden_col text;
  v_orden_dir text;
begin
  if not private.soy_admin() then
    raise exception 'Solo un administrador puede acceder al Dashboard.';
  end if;
  if p_estado is not null and p_estado not in ('activo', 'alta', 'alta_traslado', 'exitus') then
    raise exception 'Estado no reconocido: %', p_estado;
  end if;
  if p_tipo_incidencia is not null and p_con_incidencias is distinct from true then
    raise exception 'Para filtrar por tipo de incidencia, indica también "con incidencias".';
  end if;

  v_orden_col := case p_orden
    when 'paciente' then 'nombre_orden'
    when 'ingreso' then 'fecha_ingreso'
    when 'alta' then 'fecha_alta'
    when 'estancia' then 'dias_estancia'
    when 'medico' then 'medico_nombre'
    else 'fecha_ingreso'
  end;
  v_orden_dir := case when lower(coalesce(p_orden_dir, 'desc')) = 'asc' then 'asc' else 'desc' end;
  v_offset := greatest(0, (p_pagina - 1) * p_por_pagina);
  v_limite := case when p_paginar then p_por_pagina else null end;

  with base as (
    select
      i.id, i.fecha_ingreso, i.fecha_alta, i.estado, i.habitacion,
      p.nombre, p.primer_apellido, p.segundo_apellido, p.nhc,
      (p.primer_apellido || ' ' || coalesce(p.segundo_apellido, '') || ' ' || p.nombre) as nombre_orden,
      nullif(coalesce(m.nombre || ' ' || m.apellidos, ''), '') as medico_nombre,
      (case when i.fecha_alta is not null then i.fecha_alta - i.fecha_ingreso else private.hoy_madrid() - i.fecha_ingreso end) as dias_estancia,
      (select count(*) from public.eventos e where e.ingreso_id = i.id and e.tipo <> 'ulcera') as num_incidencias
    from public.ingresos i
    inner join public.pacientes p on p.id = i.paciente_id
    left join public.profesionales m on m.id = i.medico_responsable_id
    where
      (p_busqueda is null or (
        p.nombre || ' ' || p.primer_apellido || ' ' || coalesce(p.segundo_apellido, '') ilike '%' || p_busqueda || '%'
        or p.nhc ilike '%' || p_busqueda || '%'
      ))
      and (p_desde_ingreso is null or i.fecha_ingreso >= p_desde_ingreso)
      and (p_hasta_ingreso is null or i.fecha_ingreso <= p_hasta_ingreso)
      and (p_desde_alta is null or i.fecha_alta >= p_desde_alta)
      and (p_hasta_alta is null or i.fecha_alta <= p_hasta_alta)
      and (
        (p_solapa_desde is null and p_solapa_hasta is null) or (
          i.fecha_ingreso <= coalesce(p_solapa_hasta, 'infinity'::date)
          and (i.fecha_alta is null or i.fecha_alta >= coalesce(p_solapa_desde, '-infinity'::date))
        )
      )
      and (p_estado is null or i.estado = p_estado)
      and (p_medico_id is null or i.medico_responsable_id = p_medico_id)
      and (
        p_con_incidencias is null or (
          case when p_tipo_incidencia = 'ulcera'
            -- Úlceras por presión: viven en Curas, no en incidencias.
            then exists (select 1 from public.curas_lesiones l where l.ingreso_id = i.id and l.caracteristicas = 'upp')
            else (select count(*) from public.eventos e where e.ingreso_id = i.id and e.tipo <> 'ulcera'
                    and (p_tipo_incidencia is null or e.tipo = p_tipo_incidencia)) > 0
          end
        ) = p_con_incidencias
      )
  )
  select count(*) into v_total from base
  where (p_estancia_min is null or dias_estancia >= p_estancia_min)
    and (p_estancia_max is null or dias_estancia <= p_estancia_max);

  execute format(
    'with base as (
      select
        i.id, i.fecha_ingreso, i.fecha_alta, i.estado, i.habitacion,
        p.nombre, p.primer_apellido, p.segundo_apellido, p.nhc,
        (p.primer_apellido || '' '' || coalesce(p.segundo_apellido, '''') || '' '' || p.nombre) as nombre_orden,
        nullif(coalesce(m.nombre || '' '' || m.apellidos, ''''), '''') as medico_nombre,
        (case when i.fecha_alta is not null then i.fecha_alta - i.fecha_ingreso else private.hoy_madrid() - i.fecha_ingreso end) as dias_estancia,
        (select count(*) from public.eventos e where e.ingreso_id = i.id and e.tipo <> ''ulcera'') as num_incidencias
      from public.ingresos i
      inner join public.pacientes p on p.id = i.paciente_id
      left join public.profesionales m on m.id = i.medico_responsable_id
      where
        ($1::text is null or (
          p.nombre || '' '' || p.primer_apellido || '' '' || coalesce(p.segundo_apellido, '''') ilike ''%%'' || $1::text || ''%%''
          or p.nhc ilike ''%%'' || $1::text || ''%%''
        ))
        and ($2::date is null or i.fecha_ingreso >= $2::date)
        and ($3::date is null or i.fecha_ingreso <= $3::date)
        and ($4::date is null or i.fecha_alta >= $4::date)
        and ($5::date is null or i.fecha_alta <= $5::date)
        and (
          ($6::date is null and $7::date is null) or (
            i.fecha_ingreso <= coalesce($7::date, ''infinity''::date)
            and (i.fecha_alta is null or i.fecha_alta >= coalesce($6::date, ''-infinity''::date))
          )
        )
        and ($8::text is null or i.estado = $8::text)
        and ($9::uuid is null or i.medico_responsable_id = $9::uuid)
        and (
          $10::boolean is null or (
            case when $11::text = ''ulcera''
              then exists (select 1 from public.curas_lesiones l where l.ingreso_id = i.id and l.caracteristicas = ''upp'')
              else (select count(*) from public.eventos e where e.ingreso_id = i.id and e.tipo <> ''ulcera''
                      and ($11::text is null or e.tipo = $11::text)) > 0
            end
          ) = $10::boolean
        )
    )
    select coalesce(jsonb_agg(t), ''[]''::jsonb) from (
      select id, fecha_ingreso, fecha_alta, estado, habitacion, nhc,
             (primer_apellido || case when segundo_apellido is not null and segundo_apellido <> '''' then '' '' || segundo_apellido else '''' end || '', '' || nombre) as paciente,
             medico_nombre as medico, dias_estancia, num_incidencias
      from base
      where ($12::integer is null or dias_estancia >= $12::integer)
        and ($13::integer is null or dias_estancia <= $13::integer)
      order by %I %s nulls last
      limit $14 offset $15
    ) t',
    v_orden_col, v_orden_dir
  )
  using p_busqueda, p_desde_ingreso, p_hasta_ingreso, p_desde_alta, p_hasta_alta,
        p_solapa_desde, p_solapa_hasta, p_estado, p_medico_id,
        p_con_incidencias, p_tipo_incidencia, p_estancia_min, p_estancia_max,
        v_limite, v_offset
  into v_filas;

  return jsonb_build_object('total', v_total, 'filas', v_filas, 'pagina', p_pagina, 'por_pagina', p_por_pagina);
end;
$$;

revoke execute on function public.dashboard_situacion_actual(uuid) from public, anon;
revoke execute on function public.dashboard_resumen(date, date, uuid) from public, anon;
revoke execute on function public.dashboard_series(date, date, uuid) from public, anon;
revoke execute on function public.dashboard_actividad_detalle(date, date, uuid) from public, anon;
revoke execute on function public.dashboard_seguridad(date, date, uuid) from public, anon;
revoke execute on function public.buscar_episodios_dashboard(
  text, date, date, date, date, date, date, text, uuid, integer, integer, boolean, text, text, text, integer, integer, boolean
) from public, anon;

grant execute on function public.dashboard_situacion_actual(uuid) to authenticated;
grant execute on function public.dashboard_resumen(date, date, uuid) to authenticated;
grant execute on function public.dashboard_series(date, date, uuid) to authenticated;
grant execute on function public.dashboard_actividad_detalle(date, date, uuid) to authenticated;
grant execute on function public.dashboard_seguridad(date, date, uuid) to authenticated;
grant execute on function public.buscar_episodios_dashboard(
  text, date, date, date, date, date, date, text, uuid, integer, integer, boolean, text, text, text, integer, integer, boolean
) to authenticated;

-- ────────────────────────────────────────────────────────────
-- CURAS (módulo de enfermería, 2026-10-08)
-- Lesiones/cuidados de la piel por ingreso, su evolución (valoraciones)
-- y la marca diaria de "cura hecha" de la tabla semanal.
-- Migración incremental equivalente: 20261008_curas.sql
-- ────────────────────────────────────────────────────────────
-- Tablas
-- ────────────────────────────────────────────────────────────

-- Una lesión o cuidado concreto de la piel de un paciente durante un
-- ingreso. "cuidado_piel" cubre lo que no es una herida (piel atópica,
-- hongos en ingles, etc.), que en la hoja actual va mezclado.
create table if not exists public.curas_lesiones (
    id uuid primary key default gen_random_uuid(),
    ingreso_id uuid not null references public.ingresos(id) on delete cascade,
    caracteristicas text not null check (caracteristicas in (
        'upp',                 -- úlcera por presión
        'herida_quirurgica',
        'ulcera_vascular',
        'lesion_humedad',
        'desgarro_cutaneo',
        'herida_traumatica',
        'cuidado_piel',        -- piel atópica, intertrigo, micosis…
        'otra'
    )),
    localizacion text not null check (length(btrim(localizacion)) between 1 and 120),
    fecha_inicio date not null default private.hoy_madrid(),
    -- Fecha de curación. null = sigue activa.
    fecha_fin date,
    -- Dónde se produjo: base para saber cuántas UPP son del propio centro.
    origen text check (origen in ('centro', 'fuera')),
    notas text check (notas is null or length(notas) <= 2000),
    registrado_por_id uuid references public.profesionales(id),
    -- Si la lesión se creó al pasar una antigua incidencia "úlcera por
    -- presión" a Curas: de qué incidencia viene (para no duplicarla).
    evento_origen_id uuid unique references public.eventos(id) on delete set null,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now(),
    check (fecha_fin is null or fecha_fin >= fecha_inicio)
);

create index if not exists curas_lesiones_ingreso_idx on public.curas_lesiones (ingreso_id);
create index if not exists curas_lesiones_activas_idx on public.curas_lesiones (ingreso_id) where fecha_fin is null;

-- Cada valoración es una foto de la lesión en una fecha: cómo está y
-- qué cura lleva. La pauta VIGENTE de una lesión es la de su última
-- valoración (por fecha y, a igualdad, por orden de registro).
create table if not exists public.curas_valoraciones (
    id uuid primary key default gen_random_uuid(),
    lesion_id uuid not null references public.curas_lesiones(id) on delete cascade,
    fecha date not null default private.hoy_madrid(),
    medidas text check (medidas is null or length(medidas) <= 40),   -- "2 x 3" (cm x cm)
    grado text check (grado in ('I', 'II', 'III', 'IV', 'no_clasificable')),
    frotis boolean not null default false,
    tipo_cura text check (tipo_cura is null or length(btrim(tipo_cura)) between 1 and 300),
    frecuencia_horas integer check (frecuencia_horas is null or frecuencia_horas between 1 and 720),
    -- Días de la semana en que toca la cura: 1 = lunes … 7 = domingo.
    dias_semana smallint[] not null default '{}'
        check (dias_semana <@ array[1, 2, 3, 4, 5, 6, 7]::smallint[]),
    norton integer check (norton is null or norton between 5 and 20),
    braden integer check (braden is null or braden between 6 and 23),
    emina integer check (emina is null or emina between 0 and 15),
    notas text check (notas is null or length(notas) <= 2000),
    registrado_por_id uuid references public.profesionales(id),
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now()
);

create index if not exists curas_valoraciones_lesion_idx on public.curas_valoraciones (lesion_id, fecha desc, created_at desc);

-- La tabla semanal: se hizo o no se hizo la cura de un paciente un día.
-- Una fila por ingreso y día (no por lesión: es lo que refleja el papel).
create table if not exists public.curas_registro (
    id uuid primary key default gen_random_uuid(),
    ingreso_id uuid not null references public.ingresos(id) on delete cascade,
    fecha date not null,
    realizada_por_id uuid references public.profesionales(id),
    created_at timestamptz not null default now(),
    -- 'hecha' o 'no_realizada' (esta última exige un motivo)
    estado text not null default 'hecha' check (estado in ('hecha', 'no_realizada')),
    motivo text constraint curas_registro_motivo_largo_check check (motivo is null or length(motivo) <= 500),
    constraint curas_registro_motivo_check check (estado = 'hecha' or length(btrim(coalesce(motivo, ''))) > 0),
    unique (ingreso_id, fecha)
);

-- ────────────────────────────────────────────────────────────
-- DISPARADORES
-- ────────────────────────────────────────────────────────────

drop trigger if exists trg_curas_lesiones_updated on public.curas_lesiones;
create trigger trg_curas_lesiones_updated
    before update on public.curas_lesiones
    for each row execute function public.update_updated_at();

drop trigger if exists trg_curas_valoraciones_updated on public.curas_valoraciones;
create trigger trg_curas_valoraciones_updated
    before update on public.curas_valoraciones
    for each row execute function public.update_updated_at();

-- El autor (y a qué pertenece) un registro no se puede reescribir con
-- un UPDATE. Una función por tabla: PostgreSQL no admite leer en una
-- misma función campos que solo existen en una de las tablas.
create or replace function public.evitar_cambio_autor_lesion() returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if NEW.registrado_por_id is distinct from OLD.registrado_por_id then
    raise exception 'No se puede cambiar quién registró este dato.';
  end if;
  if NEW.ingreso_id is distinct from OLD.ingreso_id then
    raise exception 'Una lesión no se puede pasar a otro ingreso.';
  end if;
  return NEW;
end;
$$;

create or replace function public.evitar_cambio_autor_valoracion() returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if NEW.registrado_por_id is distinct from OLD.registrado_por_id then
    raise exception 'No se puede cambiar quién registró este dato.';
  end if;
  if NEW.lesion_id is distinct from OLD.lesion_id then
    raise exception 'Una valoración no se puede pasar a otra lesión.';
  end if;
  return NEW;
end;
$$;

create or replace function public.evitar_cambio_registro_cura() returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if NEW.realizada_por_id is distinct from OLD.realizada_por_id
     or NEW.ingreso_id is distinct from OLD.ingreso_id
     or NEW.fecha is distinct from OLD.fecha then
    raise exception 'No se puede cambiar quién ni cuándo se registró la cura.';
  end if;
  return NEW;
end;
$$;

drop trigger if exists evitar_cambio_autor on public.curas_lesiones;
create trigger evitar_cambio_autor before update on public.curas_lesiones
    for each row execute function public.evitar_cambio_autor_lesion();
drop trigger if exists evitar_cambio_autor on public.curas_valoraciones;
create trigger evitar_cambio_autor before update on public.curas_valoraciones
    for each row execute function public.evitar_cambio_autor_valoracion();
drop trigger if exists evitar_cambio_registro on public.curas_registro;
create trigger evitar_cambio_registro before update on public.curas_registro
    for each row execute function public.evitar_cambio_registro_cura();

revoke execute on function public.evitar_cambio_autor_lesion() from public, anon, authenticated;
revoke execute on function public.evitar_cambio_autor_valoracion() from public, anon, authenticated;
revoke execute on function public.evitar_cambio_registro_cura() from public, anon, authenticated;

-- Auditoría genérica (quién y cuándo), la misma que ya usan los informes.
drop trigger if exists aud_curas_lesiones on public.curas_lesiones;
create trigger aud_curas_lesiones
    after insert or update or delete on public.curas_lesiones
    for each row execute function public.registrar_auditoria();
drop trigger if exists aud_curas_valoraciones on public.curas_valoraciones;
create trigger aud_curas_valoraciones
    after insert or update or delete on public.curas_valoraciones
    for each row execute function public.registrar_auditoria();
drop trigger if exists aud_curas_registro on public.curas_registro;
create trigger aud_curas_registro
    after insert or update or delete on public.curas_registro
    for each row execute function public.registrar_auditoria();

-- ────────────────────────────────────────────────────────────
-- PERMISOS (RLS)
-- ────────────────────────────────────────────────────────────

alter table public.curas_lesiones enable row level security;
alter table public.curas_valoraciones enable row level security;
alter table public.curas_registro enable row level security;

revoke all on public.curas_lesiones, public.curas_valoraciones, public.curas_registro from public, anon;
grant select, insert, update, delete on public.curas_lesiones, public.curas_valoraciones, public.curas_registro to authenticated;

drop policy if exists leer_autenticado on public.curas_lesiones;
create policy leer_autenticado on public.curas_lesiones
    for select to authenticated using (private.mi_rol() is not null);
drop policy if exists leer_autenticado on public.curas_valoraciones;
create policy leer_autenticado on public.curas_valoraciones
    for select to authenticated using (private.mi_rol() is not null);
drop policy if exists leer_autenticado on public.curas_registro;
create policy leer_autenticado on public.curas_registro
    for select to authenticated using (private.mi_rol() is not null);

-- Lesiones: todo el equipo asistencial, solo con el episodio activo.
-- Crear exige que el autor sea la propia sesión.
drop policy if exists crear_lesion on public.curas_lesiones;
create policy crear_lesion on public.curas_lesiones for insert to authenticated
    with check (
        private.mi_rol() in ('medico', 'enfermeria', 'auxiliar', 'tecnico')
        and registrado_por_id = (select id from public.profesionales where user_id = auth.uid() limit 1)
        and exists (select 1 from public.ingresos i where i.id = curas_lesiones.ingreso_id and i.estado = 'activo')
    );
drop policy if exists editar_lesion on public.curas_lesiones;
create policy editar_lesion on public.curas_lesiones for update to authenticated
    using (
        private.mi_rol() in ('medico', 'enfermeria', 'auxiliar', 'tecnico')
        and exists (select 1 from public.ingresos i where i.id = curas_lesiones.ingreso_id and i.estado = 'activo')
    )
    with check (
        private.mi_rol() in ('medico', 'enfermeria', 'auxiliar', 'tecnico')
        and exists (select 1 from public.ingresos i where i.id = curas_lesiones.ingreso_id and i.estado = 'activo')
    );
-- Borrar (p. ej. una lesión creada por error): su autor o un administrador.
drop policy if exists borrar_lesion on public.curas_lesiones;
create policy borrar_lesion on public.curas_lesiones for delete to authenticated
    using (
        private.mi_rol() in ('medico', 'enfermeria', 'auxiliar', 'tecnico')
        and exists (select 1 from public.ingresos i where i.id = curas_lesiones.ingreso_id and i.estado = 'activo')
        and (registrado_por_id = (select id from public.profesionales where user_id = auth.uid() limit 1) or private.soy_admin())
    );

-- Valoraciones: mismas reglas, pasando por la lesión.
drop policy if exists crear_valoracion on public.curas_valoraciones;
create policy crear_valoracion on public.curas_valoraciones for insert to authenticated
    with check (
        private.mi_rol() in ('medico', 'enfermeria', 'auxiliar', 'tecnico')
        and registrado_por_id = (select id from public.profesionales where user_id = auth.uid() limit 1)
        and exists (
            select 1 from public.curas_lesiones l join public.ingresos i on i.id = l.ingreso_id
            where l.id = curas_valoraciones.lesion_id and i.estado = 'activo'
        )
    );
drop policy if exists editar_valoracion on public.curas_valoraciones;
create policy editar_valoracion on public.curas_valoraciones for update to authenticated
    using (
        private.mi_rol() in ('medico', 'enfermeria', 'auxiliar', 'tecnico')
        and exists (
            select 1 from public.curas_lesiones l join public.ingresos i on i.id = l.ingreso_id
            where l.id = curas_valoraciones.lesion_id and i.estado = 'activo'
        )
    )
    with check (
        private.mi_rol() in ('medico', 'enfermeria', 'auxiliar', 'tecnico')
        and exists (
            select 1 from public.curas_lesiones l join public.ingresos i on i.id = l.ingreso_id
            where l.id = curas_valoraciones.lesion_id and i.estado = 'activo'
        )
    );
drop policy if exists borrar_valoracion on public.curas_valoraciones;
create policy borrar_valoracion on public.curas_valoraciones for delete to authenticated
    using (
        private.mi_rol() in ('medico', 'enfermeria', 'auxiliar', 'tecnico')
        and exists (
            select 1 from public.curas_lesiones l join public.ingresos i on i.id = l.ingreso_id
            where l.id = curas_valoraciones.lesion_id and i.estado = 'activo'
        )
        and (registrado_por_id = (select id from public.profesionales where user_id = auth.uid() limit 1) or private.soy_admin())
    );

-- Registro semanal: marcar la cura de hoy o de un día pasado (nunca
-- futuro), solo con episodio activo. Desmarcar: quien la marcó o admin.
drop policy if exists crear_registro_cura on public.curas_registro;
create policy crear_registro_cura on public.curas_registro for insert to authenticated
    with check (
        private.mi_rol() in ('medico', 'enfermeria', 'auxiliar', 'tecnico')
        and realizada_por_id = (select id from public.profesionales where user_id = auth.uid() limit 1)
        and fecha <= private.hoy_madrid()
        and exists (select 1 from public.ingresos i where i.id = curas_registro.ingreso_id and i.estado = 'activo')
    );
drop policy if exists borrar_registro_cura on public.curas_registro;
create policy borrar_registro_cura on public.curas_registro for delete to authenticated
    using (
        private.mi_rol() in ('medico', 'enfermeria', 'auxiliar', 'tecnico')
        and exists (select 1 from public.ingresos i where i.id = curas_registro.ingreso_id and i.estado = 'activo')
        and (realizada_por_id = (select id from public.profesionales where user_id = auth.uid() limit 1) or private.soy_admin())
    );
-- (curas_registro no tiene política de UPDATE: no se edita, se marca o se desmarca.)


-- Las úlceras por presión ya no se registran como incidencia (se hace en
-- Curas). Los eventos antiguos de ese tipo se conservan, pero no se pueden
-- crear nuevos.
create or replace function public.impedir_evento_ulcera() returns trigger
language plpgsql
set search_path = ''
as $$
begin
  raise exception 'Las úlceras por presión ya no se registran como incidencia: se registran en Plan de cuidados → Curas.';
end;
$$;

drop trigger if exists impedir_evento_ulcera on public.eventos;
create trigger impedir_evento_ulcera
    before insert on public.eventos
    for each row when (NEW.tipo = 'ulcera')
    execute function public.impedir_evento_ulcera();
drop trigger if exists impedir_evento_ulcera_upd on public.eventos;
create trigger impedir_evento_ulcera_upd
    before update of tipo on public.eventos
    for each row when (NEW.tipo = 'ulcera' and OLD.tipo is distinct from 'ulcera')
    execute function public.impedir_evento_ulcera();

revoke execute on function public.impedir_evento_ulcera() from public, anon, authenticated;

-- ────────────────────────────────────────────────────────────
-- OTROS INFORMES / INFORMES PUNTUALES (2026-10-08)
-- Derivación a urgencias, estado actual, libre. Campos fijos, guardado
-- automático y Word; sin borradores ni firma.
-- Migración incremental equivalente: 20261008_informes_puntuales.sql
-- ────────────────────────────────────────────────────────────

-- ────────────────────────────────────────────────────────────
-- VALIDACIÓN DE LOS CAMPOS
-- ────────────────────────────────────────────────────────────

-- "campos" es un objeto JSON {nombre_del_campo: texto}. Un CHECK no admite
-- subconsultas, así que la comprobación vive en una función inmutable.
create or replace function private.campos_informe_validos(c jsonb) returns boolean
language plpgsql immutable
set search_path = ''
as $$
declare
  k text;
  v jsonb;
begin
  if c is null or jsonb_typeof(c) <> 'object' then return false; end if;
  if length(c::text) > 400000 then return false; end if;
  for k, v in select key, value from jsonb_each(c) loop
    if length(k) > 60 then return false; end if;
    if jsonb_typeof(v) <> 'string' then return false; end if;
    if length(v #>> '{}') > 30000 then return false; end if;
  end loop;
  return true;
end;
$$;

revoke execute on function private.campos_informe_validos(jsonb) from public, anon;
grant execute on function private.campos_informe_validos(jsonb) to authenticated;

-- ────────────────────────────────────────────────────────────
-- TABLA
-- ────────────────────────────────────────────────────────────

create table if not exists public.informes_puntuales (
    id uuid primary key default gen_random_uuid(),
    ingreso_id uuid not null references public.ingresos(id) on delete cascade,
    plantilla text not null check (plantilla in ('derivacion_urgencias', 'estado_actual', 'libre')),
    campos jsonb not null default '{}'::jsonb check (private.campos_informe_validos(campos)),
    version integer not null default 1,
    registrado_por_id uuid references public.profesionales(id),
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now()
);

create index if not exists informes_puntuales_ingreso_idx
    on public.informes_puntuales (ingreso_id, created_at desc);

-- ────────────────────────────────────────────────────────────
-- DISPARADORES
-- ────────────────────────────────────────────────────────────

-- Lo que identifica al informe no se puede reescribir con un UPDATE.
create or replace function public.evitar_cambio_informe_puntual() returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if NEW.ingreso_id is distinct from OLD.ingreso_id
     or NEW.plantilla is distinct from OLD.plantilla
     or NEW.registrado_por_id is distinct from OLD.registrado_por_id
     or NEW.created_at is distinct from OLD.created_at then
    raise exception 'Este dato del informe no se puede cambiar una vez creado.';
  end if;
  return NEW;
end;
$$;

revoke execute on function public.evitar_cambio_informe_puntual() from public, anon, authenticated;

drop trigger if exists evitar_cambio on public.informes_puntuales;
create trigger evitar_cambio before update on public.informes_puntuales
    for each row execute function public.evitar_cambio_informe_puntual();

drop trigger if exists trg_informes_puntuales_updated on public.informes_puntuales;
create trigger trg_informes_puntuales_updated before update on public.informes_puntuales
    for each row execute function public.update_updated_at();

-- Control de versiones (dos personas guardando a la vez), igual que
-- informe_ingreso e informe_alta.
drop trigger if exists incrementar_version on public.informes_puntuales;
create trigger incrementar_version before insert or update on public.informes_puntuales
    for each row execute function public.incrementar_version_generico();

drop trigger if exists aud_informes_puntuales on public.informes_puntuales;
create trigger aud_informes_puntuales
    after insert or update or delete on public.informes_puntuales
    for each row execute function public.registrar_auditoria();

-- ────────────────────────────────────────────────────────────
-- PERMISOS (RLS)
-- ────────────────────────────────────────────────────────────

alter table public.informes_puntuales enable row level security;

revoke all on public.informes_puntuales from public, anon;
grant select, insert, update, delete on public.informes_puntuales to authenticated;

drop policy if exists leer_autenticado on public.informes_puntuales;
create policy leer_autenticado on public.informes_puntuales
    for select to authenticated using (private.mi_rol() is not null);

-- Crear: un médico, a su nombre. Sin exigir episodio activo.
drop policy if exists crear_informe_puntual on public.informes_puntuales;
create policy crear_informe_puntual on public.informes_puntuales for insert to authenticated
    with check (
        private.tengo_rol('medico')
        and registrado_por_id = (select id from public.profesionales where user_id = auth.uid() limit 1)
    );

-- Editar y borrar (p. ej. uno creado por error): cualquier médico.
drop policy if exists editar_informe_puntual on public.informes_puntuales;
create policy editar_informe_puntual on public.informes_puntuales for update to authenticated
    using (private.tengo_rol('medico')) with check (private.tengo_rol('medico'));

drop policy if exists borrar_informe_puntual on public.informes_puntuales;
create policy borrar_informe_puntual on public.informes_puntuales for delete to authenticated
    using (private.tengo_rol('medico'));


-- ────────────────────────────────────────────────────────────
-- INFORME DE ENFERMERÍA (2026-10-09)
-- Continuidad de cuidados: un informe por ingreso, lo escribe solo
-- enfermería, lo lee todo el equipo.
-- Migración incremental equivalente: 20261009_informe_enfermeria.sql
-- ────────────────────────────────────────────────────────────
create table if not exists public.informe_enfermeria (
    id uuid primary key default gen_random_uuid(),
    ingreso_id uuid not null unique references public.ingresos(id) on delete cascade,
    campos jsonb not null default '{}'::jsonb check (private.campos_informe_validos(campos)),
    version integer not null default 1,
    elaborado_por_id uuid references public.profesionales(id),
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now()
);

-- ────────────────────────────────────────────────────────────
-- DISPARADORES
-- ────────────────────────────────────────────────────────────

-- Quién guarda es quien firma: se ignora lo que mande el cliente. El
-- ingreso al que pertenece el informe no se puede cambiar.
create or replace function public.preparar_informe_enfermeria() returns trigger
language plpgsql
set search_path = ''
as $$
declare
  yo uuid;
begin
  select p.id into yo from public.profesionales p where p.user_id = auth.uid() limit 1;
  if TG_OP = 'UPDATE' then
    if NEW.ingreso_id is distinct from OLD.ingreso_id or NEW.created_at is distinct from OLD.created_at then
      raise exception 'Este dato del informe no se puede cambiar una vez creado.';
    end if;
    NEW.elaborado_por_id := coalesce(yo, OLD.elaborado_por_id);
  else
    NEW.elaborado_por_id := yo;
  end if;
  return NEW;
end;
$$;

revoke execute on function public.preparar_informe_enfermeria() from public, anon, authenticated;

drop trigger if exists preparar on public.informe_enfermeria;
create trigger preparar before insert or update on public.informe_enfermeria
    for each row execute function public.preparar_informe_enfermeria();

drop trigger if exists trg_informe_enfermeria_updated on public.informe_enfermeria;
create trigger trg_informe_enfermeria_updated before update on public.informe_enfermeria
    for each row execute function public.update_updated_at();

drop trigger if exists incrementar_version on public.informe_enfermeria;
create trigger incrementar_version before insert or update on public.informe_enfermeria
    for each row execute function public.incrementar_version_generico();

drop trigger if exists aud_informe_enfermeria on public.informe_enfermeria;
create trigger aud_informe_enfermeria
    after insert or update or delete on public.informe_enfermeria
    for each row execute function public.registrar_auditoria();

-- ────────────────────────────────────────────────────────────
-- PERMISOS (RLS)
-- ────────────────────────────────────────────────────────────

alter table public.informe_enfermeria enable row level security;

revoke all on public.informe_enfermeria from public, anon;
grant select, insert, update on public.informe_enfermeria to authenticated;

drop policy if exists leer_autenticado on public.informe_enfermeria;
create policy leer_autenticado on public.informe_enfermeria
    for select to authenticated using (private.mi_rol() is not null);

drop policy if exists crear_enfermeria on public.informe_enfermeria;
create policy crear_enfermeria on public.informe_enfermeria for insert to authenticated
    with check (private.tengo_rol('enfermeria'));

drop policy if exists editar_enfermeria on public.informe_enfermeria;
create policy editar_enfermeria on public.informe_enfermeria for update to authenticated
    using (private.tengo_rol('enfermeria')) with check (private.tengo_rol('enfermeria'));



-- ────────────────────────────────────────────────────────────
-- PAUTA DE CUIDADOS (2026-10-10)
-- ────────────────────────────────────────────────────────────
-- Indicaciones de enfermería por turno y vía de cada paciente: sustituyen la
-- columna "CUIDADOS" de las hojas de trabajo de las auxiliares. Solo enfermería
-- (o un administrador) escribe, con el episodio activo. Ver Hojas de turno.

-- ────────────────────────────────────────────────────────────
-- TABLAS
-- ────────────────────────────────────────────────────────────

create table if not exists public.pauta_cuidados (
    id uuid primary key default gen_random_uuid(),
    ingreso_id uuid not null references public.ingresos(id) on delete cascade,
    texto text not null check (length(btrim(texto)) between 1 and 600),
    -- Turnos en los que aparece la indicación. Al menos uno.
    turnos text[] not null default array['manana', 'tarde', 'noche']
        check (turnos <@ array['manana', 'tarde', 'noche']::text[] and cardinality(turnos) >= 1),
    registrado_por_id uuid references public.profesionales(id),
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now()
);

create index if not exists pauta_cuidados_ingreso_idx on public.pauta_cuidados (ingreso_id, created_at);

create table if not exists public.pauta_via (
    id uuid primary key default gen_random_uuid(),
    ingreso_id uuid not null unique references public.ingresos(id) on delete cascade,
    via text not null check (via in ('venosa', 'subcutanea')),
    registrado_por_id uuid references public.profesionales(id),
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now()
);

-- ────────────────────────────────────────────────────────────
-- DISPARADORES
-- ────────────────────────────────────────────────────────────

-- Quién guarda queda registrado (se ignora lo que mande el cliente) y la
-- indicación no se puede pasar a otro ingreso. Una función sirve para las
-- dos tablas: solo usa campos que ambas tienen.
create or replace function public.preparar_pauta_cuidados() returns trigger
language plpgsql
set search_path = ''
as $$
declare
  yo uuid;
begin
  select p.id into yo from public.profesionales p where p.user_id = auth.uid() limit 1;
  if TG_OP = 'UPDATE' then
    if NEW.ingreso_id is distinct from OLD.ingreso_id then
      raise exception 'Una indicación no se puede pasar a otro ingreso.';
    end if;
    NEW.registrado_por_id := coalesce(yo, OLD.registrado_por_id);
  else
    NEW.registrado_por_id := yo;
  end if;
  return NEW;
end;
$$;

revoke execute on function public.preparar_pauta_cuidados() from public, anon, authenticated;

drop trigger if exists preparar on public.pauta_cuidados;
create trigger preparar before insert or update on public.pauta_cuidados
    for each row execute function public.preparar_pauta_cuidados();
drop trigger if exists preparar on public.pauta_via;
create trigger preparar before insert or update on public.pauta_via
    for each row execute function public.preparar_pauta_cuidados();

drop trigger if exists trg_pauta_cuidados_updated on public.pauta_cuidados;
create trigger trg_pauta_cuidados_updated before update on public.pauta_cuidados
    for each row execute function public.update_updated_at();
drop trigger if exists trg_pauta_via_updated on public.pauta_via;
create trigger trg_pauta_via_updated before update on public.pauta_via
    for each row execute function public.update_updated_at();

drop trigger if exists aud_pauta_cuidados on public.pauta_cuidados;
create trigger aud_pauta_cuidados
    after insert or update or delete on public.pauta_cuidados
    for each row execute function public.registrar_auditoria();
drop trigger if exists aud_pauta_via on public.pauta_via;
create trigger aud_pauta_via
    after insert or update or delete on public.pauta_via
    for each row execute function public.registrar_auditoria();

-- ────────────────────────────────────────────────────────────
-- PERMISOS (RLS)
-- ────────────────────────────────────────────────────────────

alter table public.pauta_cuidados enable row level security;
alter table public.pauta_via enable row level security;

revoke all on public.pauta_cuidados, public.pauta_via from public, anon;
grant select, insert, update, delete on public.pauta_cuidados, public.pauta_via to authenticated;

drop policy if exists leer_autenticado on public.pauta_cuidados;
create policy leer_autenticado on public.pauta_cuidados
    for select to authenticated using (private.mi_rol() is not null);
drop policy if exists leer_autenticado on public.pauta_via;
create policy leer_autenticado on public.pauta_via
    for select to authenticated using (private.mi_rol() is not null);

-- Solo enfermería, y solo con el episodio activo.
drop policy if exists crear_enfermeria on public.pauta_cuidados;
create policy crear_enfermeria on public.pauta_cuidados for insert to authenticated
    with check (
        private.tengo_rol('enfermeria')
        and exists (select 1 from public.ingresos i where i.id = pauta_cuidados.ingreso_id and i.estado = 'activo')
    );
drop policy if exists editar_enfermeria on public.pauta_cuidados;
create policy editar_enfermeria on public.pauta_cuidados for update to authenticated
    using (
        private.tengo_rol('enfermeria')
        and exists (select 1 from public.ingresos i where i.id = pauta_cuidados.ingreso_id and i.estado = 'activo')
    )
    with check (
        private.tengo_rol('enfermeria')
        and exists (select 1 from public.ingresos i where i.id = pauta_cuidados.ingreso_id and i.estado = 'activo')
    );
drop policy if exists borrar_enfermeria on public.pauta_cuidados;
create policy borrar_enfermeria on public.pauta_cuidados for delete to authenticated
    using (
        private.tengo_rol('enfermeria')
        and exists (select 1 from public.ingresos i where i.id = pauta_cuidados.ingreso_id and i.estado = 'activo')
    );

drop policy if exists crear_enfermeria on public.pauta_via;
create policy crear_enfermeria on public.pauta_via for insert to authenticated
    with check (
        private.tengo_rol('enfermeria')
        and exists (select 1 from public.ingresos i where i.id = pauta_via.ingreso_id and i.estado = 'activo')
    );
drop policy if exists editar_enfermeria on public.pauta_via;
create policy editar_enfermeria on public.pauta_via for update to authenticated
    using (
        private.tengo_rol('enfermeria')
        and exists (select 1 from public.ingresos i where i.id = pauta_via.ingreso_id and i.estado = 'activo')
    )
    with check (
        private.tengo_rol('enfermeria')
        and exists (select 1 from public.ingresos i where i.id = pauta_via.ingreso_id and i.estado = 'activo')
    );
drop policy if exists borrar_enfermeria on public.pauta_via;
create policy borrar_enfermeria on public.pauta_via for delete to authenticated
    using (
        private.tengo_rol('enfermeria')
        and exists (select 1 from public.ingresos i where i.id = pauta_via.ingreso_id and i.estado = 'activo')
    );


-- ────────────────────────────────────────────────────────────
-- HISTÓRICO DIARIO DE LA PAUTA DE CUIDADOS
-- ────────────────────────────────────────────────────────────
-- Igual que items_historico: una foto por ingreso y día, generada cada noche.
-- Guarda lo necesario para reconstruir la hoja de trabajo tal como estaba ese
-- día (pauta, vía, habitación, nombre y lo que sale de la Hoja de ítems y de
-- la contención), aunque después cambie el paciente de habitación o se edite.

create table if not exists public.pauta_historico (
    id uuid primary key default gen_random_uuid(),
    ingreso_id uuid not null references public.ingresos(id) on delete cascade,
    fecha date not null default current_date,
    datos jsonb not null default '{}',
    created_at timestamptz default now(),
    unique (ingreso_id, fecha)
);

create index if not exists pauta_historico_fecha_idx on public.pauta_historico (fecha);

alter table public.pauta_historico enable row level security;
revoke all on public.pauta_historico from public, anon;
grant select on public.pauta_historico to authenticated;

drop policy if exists leer_autenticado on public.pauta_historico;
create policy leer_autenticado on public.pauta_historico
    for select to authenticated using (private.mi_rol() is not null);

create function public.generar_snapshot_pauta() returns void
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

-- ── Marcas de fármacos que la app aprende (20261010_farmacos_alias.sql) ──
create table if not exists public.farmacos_alias (
    id uuid primary key default gen_random_uuid(),
    -- Lo que se escribe, en minúsculas y sin tildes ni dosis («ketyalix»).
    clave text not null unique check (clave = lower(btrim(clave)) and length(clave) between 3 and 80),
    -- Código ATC del principio activo (tiene que existir en el catálogo de la app).
    atc text not null check (atc ~ '^[A-Z][0-9]{2}([A-Z]{1,2}([0-9]{2})?)?$'),
    registrado_por_id uuid references public.profesionales(id),
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now()
);

create or replace function public.preparar_farmacos_alias() returns trigger
language plpgsql
set search_path = ''
as $$
declare
  yo uuid;
begin
  select p.id into yo from public.profesionales p where p.user_id = auth.uid() limit 1;
  NEW.registrado_por_id := coalesce(yo, case when TG_OP = 'UPDATE' then OLD.registrado_por_id end);
  return NEW;
end;
$$;

revoke execute on function public.preparar_farmacos_alias() from public, anon, authenticated;

drop trigger if exists preparar on public.farmacos_alias;
create trigger preparar before insert or update on public.farmacos_alias
    for each row execute function public.preparar_farmacos_alias();

drop trigger if exists trg_farmacos_alias_updated on public.farmacos_alias;
create trigger trg_farmacos_alias_updated before update on public.farmacos_alias
    for each row execute function public.update_updated_at();

drop trigger if exists aud_farmacos_alias on public.farmacos_alias;
create trigger aud_farmacos_alias
    after insert or update or delete on public.farmacos_alias
    for each row execute function public.registrar_auditoria();

alter table public.farmacos_alias enable row level security;

revoke all on public.farmacos_alias from public, anon;
grant select, insert, update, delete on public.farmacos_alias to authenticated;

drop policy if exists leer_autenticado on public.farmacos_alias;
create policy leer_autenticado on public.farmacos_alias
    for select to authenticated using (private.mi_rol() is not null);

drop policy if exists escribir_medico on public.farmacos_alias;
create policy escribir_medico on public.farmacos_alias for all to authenticated
    using (private.tengo_rol('medico')) with check (private.tengo_rol('medico'));

-- ── Auditoría v2 y registro de accesos (20261011_auditoria_v2.sql) ──
-- ────────────────────────────────────────────────────────────
-- 1. COLUMNAS NUEVAS
-- ────────────────────────────────────────────────────────────

alter table public.auditoria
    add column if not exists cambios jsonb,
    add column if not exists ingreso_id uuid,
    add column if not exists paciente_id uuid,
    add column if not exists nivel text not null default 'normal',
    add column if not exists fecha_fin timestamptz,
    add column if not exists n_cambios integer not null default 1;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'auditoria_nivel_check') then
    alter table public.auditoria add constraint auditoria_nivel_check check (nivel in ('normal', 'seguridad'));
  end if;
end $$;

create index if not exists auditoria_paciente_idx on public.auditoria (paciente_id, fecha desc);
create index if not exists auditoria_usuario_idx on public.auditoria (usuario_id, fecha desc);
create index if not exists auditoria_nivel_idx on public.auditoria (fecha desc) where nivel = 'seguridad';

-- ────────────────────────────────────────────────────────────
-- 2. FUNCIONES AUXILIARES (solo las usa el disparador)
-- ────────────────────────────────────────────────────────────

-- Un valor listo para guardar: los textos muy largos se recortan (con aviso) para que un informe entero
-- no se copie en cada cambio.
create or replace function public.auditoria_valor(v jsonb) returns jsonb
language plpgsql immutable
set search_path = ''
as $$
begin
  if v is null or jsonb_typeof(v) = 'null' then
    return 'null'::jsonb;
  elsif jsonb_typeof(v) = 'string' and length(v #>> '{}') > 4000 then
    return to_jsonb(left(v #>> '{}', 4000) || '… [recortado: ' || length(v #>> '{}') || ' caracteres]');
  elsif jsonb_typeof(v) in ('object', 'array') and length(v::text) > 8000 then
    return to_jsonb('[contenido largo: ' || length(v::text) || ' caracteres]'::text);
  end if;
  return v;
end;
$$;

-- Campos que cambian solos en cada guardado y no cuentan como un cambio.
create or replace function public.auditoria_diff(p_antes jsonb, p_despues jsonb, p_prefijo text default '') returns jsonb
language plpgsql immutable
set search_path = ''
as $$
declare
  r jsonb := '{}'::jsonb;
  k text;
  a jsonb;
  d jsonb;
begin
  for k in select jsonb_object_keys(coalesce(p_antes, '{}'::jsonb) || coalesce(p_despues, '{}'::jsonb)) loop
    a := coalesce(p_antes -> k, 'null'::jsonb);
    d := coalesce(p_despues -> k, 'null'::jsonb);
    if a = d then continue; end if;
    if p_prefijo = '' and k in ('updated_at', 'version', 'actualizado_en', 'actualizado_por_id', 'created_at') then continue; end if;
    -- Un nivel hacia dentro en los campos tipo objeto (informe de enfermería, otros informes:
    -- `campos` guarda cada apartado), para ver qué apartado cambió y no solo "campos".
    if p_prefijo = '' and jsonb_typeof(a) = 'object' and jsonb_typeof(d) = 'object' then
      r := r || public.auditoria_diff(a, d, k || '.');
    else
      r := r || jsonb_build_object(p_prefijo || k, jsonb_build_object('antes', public.auditoria_valor(a), 'despues', public.auditoria_valor(d)));
    end if;
  end loop;
  return r;
end;
$$;

revoke execute on function public.auditoria_valor(jsonb) from public, anon, authenticated;
revoke execute on function public.auditoria_diff(jsonb, jsonb, text) from public, anon, authenticated;

-- ────────────────────────────────────────────────────────────
-- 3. DISPARADOR GENÉRICO
-- ────────────────────────────────────────────────────────────

create or replace function public.registrar_auditoria() returns trigger
language plpgsql security definer
set search_path to ''
as $$
declare
  v_old jsonb;
  v_new jsonb;
  v_fila jsonb;
  v_registro uuid;
  v_ingreso uuid;
  v_paciente uuid;
  v_cambios jsonb;
  v_antes jsonb;
  v_nivel text := 'normal';
  v_yo uuid := auth.uid();
  v_prev public.auditoria;
  v_unido jsonb;
  campo text;
begin
  v_old := case when TG_OP <> 'INSERT' then to_jsonb(OLD) end;
  v_new := case when TG_OP <> 'DELETE' then to_jsonb(NEW) end;
  v_fila := coalesce(v_new, v_old);
  v_registro := coalesce(v_fila ->> 'id', v_fila ->> 'ingreso_id')::uuid;

  -- De qué paciente e ingreso es el cambio.
  if TG_TABLE_NAME = 'pacientes' then
    v_paciente := v_registro;
  elsif TG_TABLE_NAME = 'ingresos' then
    v_ingreso := v_registro;
    v_paciente := (v_fila ->> 'paciente_id')::uuid;
  elsif TG_TABLE_NAME <> 'profesionales' and TG_TABLE_NAME <> 'farmacos_alias' then
    v_ingreso := (v_fila ->> 'ingreso_id')::uuid;
    if v_ingreso is null and v_fila ? 'lesion_id' then
      select l.ingreso_id into v_ingreso from public.curas_lesiones l where l.id = (v_fila ->> 'lesion_id')::uuid;
    end if;
    if v_ingreso is not null then
      select i.paciente_id into v_paciente from public.ingresos i where i.id = v_ingreso;
    end if;
  end if;

  if TG_OP = 'UPDATE' then
    v_cambios := public.auditoria_diff(v_old, v_new);
    -- Un guardado que no cambia nada de verdad no es un cambio.
    if v_cambios = '{}'::jsonb then return NEW; end if;
    if TG_TABLE_NAME = 'profesionales' and v_cambios ?| array['rol', 'es_admin', 'activo', 'user_id'] then
      v_nivel := 'seguridad';
    end if;

    -- Guardados automáticos seguidos de la misma persona sobre el mismo registro: una sola fila.
    if v_yo is not null and TG_TABLE_NAME = any (array[
      'informe_ingreso', 'informe_alta', 'informes_puntuales', 'informe_enfermeria', 'cmbd',
      'escalas_clinicas', 'items_paciente', 'pauta_via', 'curas_valoraciones', 'curas_lesiones'
    ]) then
      select * into v_prev from public.auditoria
       where tabla = TG_TABLE_NAME and registro_id = v_registro
       order by id desc limit 1
       for update;
      if found
         and v_prev.accion = 'UPDATE'
         and v_prev.cambios is not null
         and v_prev.usuario_id is not distinct from v_yo
         and coalesce(v_prev.fecha_fin, v_prev.fecha) > now() - interval '30 minutes' then
        v_unido := v_prev.cambios;
        for campo in select jsonb_object_keys(v_cambios) loop
          if v_unido ? campo then
            if (v_unido -> campo -> 'antes') = (v_cambios -> campo -> 'despues') then
              v_unido := v_unido - campo;                    -- ha vuelto al valor de partida
            else
              v_unido := jsonb_set(v_unido, array[campo, 'despues'], v_cambios -> campo -> 'despues');
            end if;
          else
            v_unido := v_unido || jsonb_build_object(campo, v_cambios -> campo);
          end if;
        end loop;
        update public.auditoria
           set cambios = v_unido, fecha_fin = now(), n_cambios = n_cambios + 1
         where id = v_prev.id;
        return NEW;
      end if;
    end if;
  elsif TG_OP = 'DELETE' then
    -- Lo borrado se conserva (con los textos largos recortados).
    select coalesce(jsonb_object_agg(e.key, public.auditoria_valor(e.value)), '{}'::jsonb) into v_antes
      from jsonb_each(v_old) e;
  end if;

  if TG_TABLE_NAME = 'profesionales' and TG_OP in ('INSERT', 'DELETE') then
    v_nivel := 'seguridad';
  end if;

  insert into public.auditoria (tabla, registro_id, accion, usuario_id, cambios, valores_antes, ingreso_id, paciente_id, nivel)
  values (TG_TABLE_NAME, v_registro, TG_OP, v_yo, v_cambios, v_antes, v_ingreso, v_paciente, v_nivel);

  if TG_OP = 'DELETE' then
    return OLD;
  end if;
  return NEW;
end;
$$;

revoke execute on function public.registrar_auditoria() from public, anon, authenticated;

-- Incidencias: igual que antes (guardan la fila entera antes y después), y además de qué paciente son.
create or replace function public.registrar_auditoria_eventos() returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_ingreso uuid := coalesce(NEW.ingreso_id, OLD.ingreso_id);
  v_paciente uuid;
begin
  select i.paciente_id into v_paciente from public.ingresos i where i.id = v_ingreso;
  insert into public.auditoria (tabla, registro_id, accion, usuario_id, valores_antes, valores_despues, ingreso_id, paciente_id)
  values (
    'eventos',
    coalesce(NEW.id, OLD.id),
    lower(TG_OP),
    auth.uid(),
    case when TG_OP = 'INSERT' then null else to_jsonb(OLD) end,
    case when TG_OP = 'DELETE' then null else to_jsonb(NEW) end,
    v_ingreso,
    v_paciente
  );
  return coalesce(NEW, OLD);
end;
$$;

revoke execute on function public.registrar_auditoria_eventos() from public, anon, authenticated;

-- Reabrir un episodio: igual que antes, y con el paciente.
create or replace function public.reabrir_episodio(p_ingreso_id uuid) returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_ingreso public.ingresos;
begin
  if not private.tengo_rol('medico') then
    raise exception 'Solo un médico o un administrador puede reabrir un episodio.';
  end if;

  select * into v_ingreso from public.ingresos where id = p_ingreso_id;

  if v_ingreso is null then
    raise exception 'Ingreso no encontrado.';
  end if;

  if v_ingreso.estado = 'activo' then
    raise exception 'Este episodio ya está activo.';
  end if;

  if v_ingreso.dado_de_alta_en is null or now() - v_ingreso.dado_de_alta_en > interval '24 hours' then
    raise exception 'Solo se puede reabrir un episodio dentro de las 24 horas siguientes al alta.';
  end if;

  perform set_config('app.cambio_estado_ingreso_rpc', 'true', true);

  update public.ingresos
  set estado = 'activo', fecha_alta = null, dado_de_alta_en = null
  where id = p_ingreso_id;

  update public.cmbd
  set circunstancia_alta = null
  where ingreso_id = p_ingreso_id;

  insert into public.auditoria (tabla, registro_id, accion, usuario_id, valores_antes, valores_despues, ingreso_id, paciente_id)
  values (
    'ingresos', p_ingreso_id, 'reapertura', auth.uid(),
    jsonb_build_object('estado', v_ingreso.estado, 'fecha_alta', v_ingreso.fecha_alta),
    jsonb_build_object('estado', 'activo', 'fecha_alta', null),
    p_ingreso_id, v_ingreso.paciente_id
  );
end;
$$;

grant execute on function public.reabrir_episodio(uuid) to authenticated;

-- ────────────────────────────────────────────────────────────
-- 4. HOJA DE ÍTEMS AUDITADA
-- ────────────────────────────────────────────────────────────

drop trigger if exists aud_items_paciente on public.items_paciente;
create trigger aud_items_paciente
    after insert or update or delete on public.items_paciente
    for each row execute function public.registrar_auditoria();

-- ────────────────────────────────────────────────────────────
-- 5. LO YA REGISTRADO: PACIENTE E INGRESO (lo que se pueda saber)
-- ────────────────────────────────────────────────────────────

update public.auditoria a
   set ingreso_id = a.registro_id, paciente_id = i.paciente_id
  from public.ingresos i
 where a.tabla = 'ingresos' and a.ingreso_id is null and i.id = a.registro_id;

update public.auditoria
   set paciente_id = registro_id
 where tabla = 'pacientes' and paciente_id is null;

do $$
declare
  t text;
begin
  foreach t in array array[
    'informe_ingreso', 'informe_alta', 'informes_puntuales', 'informe_enfermeria', 'cmbd', 'escalas_clinicas',
    'eventos', 'pauta_cuidados', 'pauta_via', 'curas_lesiones', 'curas_registro'
  ] loop
    execute format(
      'update public.auditoria a set ingreso_id = x.ingreso_id, paciente_id = i.paciente_id
         from public.%I x join public.ingresos i on i.id = x.ingreso_id
        where a.tabla = %L and a.registro_id = x.id and a.ingreso_id is null', t, t);
  end loop;
end $$;

update public.auditoria a
   set ingreso_id = l.ingreso_id, paciente_id = i.paciente_id
  from public.curas_valoraciones v
  join public.curas_lesiones l on l.id = v.lesion_id
  join public.ingresos i on i.id = l.ingreso_id
 where a.tabla = 'curas_valoraciones' and a.registro_id = v.id and a.ingreso_id is null;

-- Incidencias ya borradas: el ingreso sigue en lo que se guardó.
update public.auditoria a
   set ingreso_id = (a.valores_antes ->> 'ingreso_id')::uuid, paciente_id = i.paciente_id
  from public.ingresos i
 where a.tabla = 'eventos' and a.ingreso_id is null
   and a.valores_antes ? 'ingreso_id' and i.id = (a.valores_antes ->> 'ingreso_id')::uuid;

-- ────────────────────────────────────────────────────────────
-- 6. REGISTRO DE ACCESOS
-- ────────────────────────────────────────────────────────────

create table if not exists public.registro_accesos (
    id bigserial primary key,
    fecha timestamptz not null default now(),
    usuario_id uuid,
    tipo text not null check (tipo in ('inicio_sesion', 'expediente', 'ficha_paciente', 'impresion', 'exportacion_word')),
    ingreso_id uuid,
    paciente_id uuid,
    detalle text check (detalle is null or length(detalle) <= 200)
);

create index if not exists registro_accesos_fecha_idx on public.registro_accesos (fecha desc);
create index if not exists registro_accesos_paciente_idx on public.registro_accesos (paciente_id, fecha desc);
create index if not exists registro_accesos_usuario_idx on public.registro_accesos (usuario_id, fecha desc);

-- Lo escribe la aplicación llamando a esta función, nunca a mano. Quién es lo pone el servidor.
-- Para no llenar el registro, una repetición idéntica (misma persona, tipo, paciente y detalle) dentro de
-- la ventana indicada no se vuelve a apuntar: 30 min para inicio de sesión, 10 para abrir expediente o ficha
-- y 1 para imprimir o exportar.
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
  if p_tipo is null or p_tipo not in ('inicio_sesion', 'expediente', 'ficha_paciente', 'impresion', 'exportacion_word') then
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

-- ────────────────────────────────────────────────────────────
-- 7. PERMISOS: SOLO LECTURA Y SOLO ADMINISTRADORES
-- ────────────────────────────────────────────────────────────

alter table public.registro_accesos enable row level security;

revoke all on public.registro_accesos from public, anon, authenticated;
grant select on public.registro_accesos to authenticated;
revoke all on public.auditoria from public, anon, authenticated;
grant select on public.auditoria to authenticated;

drop policy if exists accesos_leer_admin on public.registro_accesos;
create policy accesos_leer_admin on public.registro_accesos
    for select to authenticated using (private.soy_admin());


commit;
