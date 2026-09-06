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
-- OJO — NO ejecutar esto contra la base de datos de producción: ya
-- tiene todo esto creado. Este archivo sirve como referencia de cómo
-- es la base de datos hoy, y como punto de partida si algún día se
-- necesita montar un entorno nuevo desde cero (por ejemplo, uno de
-- pruebas). Los cambios reales a producción viajan en scripts sueltos
-- (ver la carpeta de scripts ya aplicados), no ejecutando este archivo.
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
    constraint ingresos_fecha_alta_valida check (fecha_alta is null or fecha_alta >= fecha_ingreso)
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
    habitacion_evento integer,
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
  if NEW.habitacion_evento is null then
    select habitacion into NEW.habitacion_evento from public.ingresos where id = NEW.ingreso_id;
  end if;
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
    if private.mi_rol() <> 'medico' then
      raise exception 'Solo un médico puede confirmar una pauta de contención.';
    end if;
    if NEW.confirmado_por_id <> v_actor_actual then
      raise exception 'Solo puedes confirmar una pauta como tú mismo.';
    end if;
    NEW.confirmado_en := now();
  else
    if private.mi_rol() <> 'medico' then
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
  if coalesce(private.mi_rol(), '') <> 'medico' then
    raise exception 'Solo un médico puede confirmar una pauta de contención.';
  end if;
  select id into v_actor from public.profesionales where user_id = auth.uid() limit 1;
  if v_actor is null then
    raise exception 'No se ha podido identificar tu sesión.';
  end if;

  update public.contenciones
  set confirmado_por_id = v_actor
  where ingreso_id = p_ingreso_id and version = p_version_esperada
  returning * into v_resultado;

  if not found then
    raise exception 'version_desactualizada';
  end if;

  insert into public.contenciones_historial (ingreso_id, dia, noche, cambiado_por_id, cambiado_en, tipo_accion, actor_id)
  values (v_resultado.ingreso_id, v_resultado.dia, v_resultado.noche, v_resultado.actualizado_por_id, v_resultado.actualizado_en, 'confirmada', v_actor);

  return v_resultado;
end;
$$;

create function public.retirar_confirmacion_contencion(p_ingreso_id uuid)
returns public.contenciones
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid;
  v_resultado public.contenciones;
begin
  if coalesce(private.mi_rol(), '') <> 'medico' then
    raise exception 'Solo un médico puede retirar una confirmación.';
  end if;
  select id into v_actor from public.profesionales where user_id = auth.uid() limit 1;

  update public.contenciones
  set confirmado_por_id = null
  where ingreso_id = p_ingreso_id
  returning * into v_resultado;

  if not found then
    raise exception 'No existe esa contención.';
  end if;

  insert into public.contenciones_historial (ingreso_id, dia, noche, cambiado_por_id, cambiado_en, tipo_accion, actor_id)
  values (v_resultado.ingreso_id, v_resultado.dia, v_resultado.noche, v_resultado.actualizado_por_id, v_resultado.actualizado_en, 'confirmacion_retirada', v_actor);

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
  -- pacientes reales compartían el mismo NHC sin que nada lo impidiera.
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

create trigger fijar_actualizado_en
  before insert or update on public.contenciones
  for each row execute function public.set_actualizado_en();

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

-- informe_ingreso: solo médico, SIN exigir episodio activo — el
-- informe de alta se apoya en sus antecedentes, alergias,
-- exploraciones y tratamiento; si se detecta un error después del
-- alta, tiene que poder corregirse.
create policy escribir_medico on public.informe_ingreso to authenticated
    using (private.mi_rol() = 'medico')
    with check (private.mi_rol() = 'medico');

-- informe_alta y cmbd: solo médico, SIN exigir que el episodio siga
-- activo. A diferencia del informe de ingreso, estos se redactan en
-- torno al propio momento del alta — a menudo después de confirmarla
-- — así que deben poder terminarse tras cerrar el episodio.
create policy escribir_medico on public.informe_alta to authenticated
    using (private.mi_rol() = 'medico') with check (private.mi_rol() = 'medico');
create policy escribir_medico on public.cmbd to authenticated
    using (private.mi_rol() = 'medico') with check (private.mi_rol() = 'medico');

-- escalas_clinicas: mismo criterio que informe_ingreso e
-- informe_alta — solo médicos, sin restricción por estado del
-- episodio.
create policy leer_autenticado on public.escalas_clinicas
    for select to authenticated using (private.mi_rol() is not null);
create policy escribir_medico on public.escalas_clinicas to authenticated
    using (private.mi_rol() = 'medico')
    with check (private.mi_rol() = 'medico');

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
revoke execute on function public.retirar_confirmacion_contencion(uuid) from public, anon;
revoke execute on function public.confirmar_contencion(uuid, integer) from public, anon;
grant execute on function public.confirmar_contencion(uuid, integer) to authenticated;
grant execute on function public.retirar_confirmacion_contencion(uuid) to authenticated;

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
  set estado = v_estado, fecha_alta = p_fecha_alta, dado_de_alta_en = now()
  where id = p_ingreso_id and estado = 'activo'
  returning * into v_actualizado;

  if not found then
    raise exception 'Este episodio ya no está activo, o no existe.';
  end if;

  update public.cmbd
  set circunstancia_alta = p_circunstancia_alta
  where ingreso_id = p_ingreso_id;

  return jsonb_build_object('estado', v_estado, 'fecha_alta', v_actualizado.fecha_alta);
end;
$$;

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
  if coalesce(private.mi_rol(), '') <> 'medico' and not private.soy_admin() then
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
-- Encontrado por auditoría directa: dos pacientes reales compartían
-- el mismo NHC sin que nada lo impidiera.
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

-- ============================================================
-- Dashboard, primera fase — Resumen, Actividad, Seguridad y el
-- Explorador de episodios. Seis funciones independientes, cada una
-- con su propia responsabilidad, en vez de una única función
-- gigantesca. security invoker en todas salvo donde se indica.
-- ============================================================

begin;

create or replace function public.dashboard_situacion_actual()
returns jsonb
language plpgsql
security invoker
stable
set search_path = ''
as $$
declare
  v_activos integer;
  v_estancia_larga integer;
  v_semaforo_riesgo integer;
  v_contencion_activa integer;
  v_contencion_pendiente integer;
  v_incidencias_pendientes integer;
begin
  if private.mi_rol() is null then
    raise exception 'No autorizado.';
  end if;

  select count(*) into v_activos from public.ingresos where estado = 'activo';

  select count(*) into v_estancia_larga
  from public.ingresos
  where estado = 'activo' and fecha_ingreso <= current_date - 60;

  select count(*) into v_semaforo_riesgo
  from public.ingresos i
  inner join public.items_paciente ip on ip.ingreso_id = i.id
  where i.estado = 'activo' and ip.semaforo_caidas in ('rojo', 'naranja');

  select count(*) into v_contencion_activa
  from public.ingresos i
  inner join public.contenciones c on c.ingreso_id = i.id
  where i.estado = 'activo'
    and (
      (c.dia is not null and c.dia <> 'ninguna')
      or (c.noche is not null and array_length(c.noche, 1) > 0)
    );

  select count(*) into v_contencion_pendiente
  from public.ingresos i
  inner join public.contenciones c on c.ingreso_id = i.id
  where i.estado = 'activo'
    and c.confirmado_por_id is null
    and (
      c.dia = 'continua_seguridad' or c.dia in ('si_precisa_supervision', 'si_precisa_paciente')
      or 'contencion_fija' = any(c.noche) or 'contencion_si_precisa' = any(c.noche)
    );

  -- Sin el filtro de "ingreso activo": una incidencia puede quedar
  -- pendiente de completar después del alta, y debe seguir contando
  -- como trabajo pendiente igualmente.
  select count(*) into v_incidencias_pendientes
  from public.eventos e
  where e.estado = 'pendiente';

  return jsonb_build_object(
    'pacientes_ingresados', v_activos,
    'ocupacion_actual_pct', round(v_activos::numeric / 33 * 100, 1),
    'estancia_larga_60', v_estancia_larga,
    'semaforo_riesgo', v_semaforo_riesgo,
    'contencion_activa', v_contencion_activa,
    'contencion_pendiente_confirmacion', v_contencion_pendiente,
    'incidencias_pendientes', v_incidencias_pendientes
  );
end;
$$;

grant execute on function public.dashboard_situacion_actual() to authenticated;

create or replace function public.dashboard_resumen(
  p_desde date,
  p_hasta date,
  p_medico_id uuid default null,
  p_estado_filtro text default null
) returns jsonb
language plpgsql
security invoker
stable
set search_path = ''
as $$
declare
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
  if private.mi_rol() is null then
    raise exception 'No autorizado.';
  end if;
  if p_desde > p_hasta then
    raise exception 'La fecha "desde" no puede ser posterior a "hasta".';
  end if;
  if p_estado_filtro is not null and p_estado_filtro not in ('activo', 'alta', 'alta_traslado', 'exitus') then
    raise exception 'Estado de filtro no reconocido: %', p_estado_filtro;
  end if;

  select count(*) into v_ingresos_nuevos
  from public.ingresos i
  where i.fecha_ingreso between p_desde and p_hasta
    and (p_medico_id is null or i.medico_responsable_id = p_medico_id)
    and (p_estado_filtro is null or i.estado = p_estado_filtro);

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
    and (p_medico_id is null or i.medico_responsable_id = p_medico_id)
    and (p_estado_filtro is null or i.estado = p_estado_filtro);

  with dias as (
    select generate_series(p_desde, p_hasta, interval '1 day')::date as f
  ), ocupacion as (
    select d.f, count(i.id) as camas
    from dias d
    left join public.ingresos i
      on i.fecha_ingreso <= d.f
      and (i.fecha_alta > d.f or i.fecha_alta is null)
      and (p_medico_id is null or i.medico_responsable_id = p_medico_id)
      and (p_estado_filtro is null or i.estado = p_estado_filtro)
    group by d.f
  )
  select avg(camas) / 33 * 100, min(camas) / 33.0 * 100, max(camas) / 33.0 * 100
  into v_ocupacion_media, v_ocupacion_min, v_ocupacion_max
  from ocupacion;

  select
    avg(i.fecha_alta - i.fecha_ingreso),
    percentile_cont(0.5) within group (order by (i.fecha_alta - i.fecha_ingreso))
  into v_estancia_media, v_estancia_mediana
  from public.ingresos i
  where i.fecha_alta between p_desde and p_hasta
    and (p_medico_id is null or i.medico_responsable_id = p_medico_id);

  select count(*) into v_reingresos
  from public.ingresos i
  where i.fecha_ingreso between p_desde and p_hasta
    and (p_medico_id is null or i.medico_responsable_id = p_medico_id)
    and (p_estado_filtro is null or i.estado = p_estado_filtro)
    and exists (
      select 1 from public.ingresos previo
      where previo.paciente_id = i.paciente_id
        and previo.id <> i.id
        and previo.estado in ('alta', 'alta_traslado')
        and previo.fecha_alta < i.fecha_ingreso
        and previo.fecha_alta >= i.fecha_ingreso - 30
    );

  select count(*) into v_incidencias
  from public.eventos e
  inner join public.ingresos i on i.id = e.ingreso_id
  where e.fecha between p_desde and p_hasta
    and (p_medico_id is null or i.medico_responsable_id = p_medico_id)
    and (p_estado_filtro is null or i.estado = p_estado_filtro);

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

grant execute on function public.dashboard_resumen(date, date, uuid, text) to authenticated;

create or replace function public.dashboard_series(
  p_desde date,
  p_hasta date,
  p_medico_id uuid default null,
  p_estado_filtro text default null
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
  if private.mi_rol() is null then
    raise exception 'No autorizado.';
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
      and (p_estado_filtro is null or i.estado = p_estado_filtro)
  )) order by d.f)
  into v_ocupacion
  from dias d;

  with periodos as (
    select generate_series(p_desde, p_hasta, ('1 ' || v_bucket)::interval) as inicio
  ), rangos as (
    select
      inicio::date as inicio,
      least(
        (case v_bucket
          when 'day' then inicio + interval '1 day'
          when 'week' then inicio + interval '1 week'
          else inicio + interval '1 month'
        end)::date - 1,
        p_hasta
      ) as fin
    from periodos
  )
  select jsonb_agg(jsonb_build_object(
    'inicio', r.inicio,
    'fin', r.fin,
    'ingresos', (
      select count(*) from public.ingresos i
      where i.fecha_ingreso between r.inicio and r.fin
        and (p_medico_id is null or i.medico_responsable_id = p_medico_id)
        and (p_estado_filtro is null or i.estado = p_estado_filtro)
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

grant execute on function public.dashboard_series(date, date, uuid, text) to authenticated;

create or replace function public.dashboard_actividad_detalle(
  p_desde date,
  p_hasta date,
  p_medico_id uuid default null,
  p_estado_filtro text default null
) returns jsonb
language plpgsql
security invoker
stable
set search_path = ''
as $$
declare
  v_distribucion_estancia jsonb;
  v_activos_30 integer;
  v_activos_60 integer;
  v_activos_90 integer;
  v_por_medico jsonb;
  v_por_sexo jsonb;
  v_edad_media numeric;
begin
  if private.mi_rol() is null then
    raise exception 'No autorizado.';
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
    count(*) filter (where fecha_ingreso <= current_date - 30),
    count(*) filter (where fecha_ingreso <= current_date - 60),
    count(*) filter (where fecha_ingreso <= current_date - 90)
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
      and (p_estado_filtro is null or estado = p_estado_filtro)
    group by medico_responsable_id
  ) c
  inner join public.profesionales pr on pr.id = c.medico_responsable_id;

  select
    jsonb_build_object(
      'hombre', count(*) filter (where p.sexo = 'hombre'),
      'mujer', count(*) filter (where p.sexo = 'mujer'),
      'otro', count(*) filter (where p.sexo = 'otro'),
      'sin_dato', count(*) filter (where p.sexo is null)
    ),
    avg(extract(year from age(i.fecha_ingreso, p.fecha_nacimiento)))
  into v_por_sexo, v_edad_media
  from public.ingresos i
  inner join public.pacientes p on p.id = i.paciente_id
  where i.fecha_ingreso between p_desde and p_hasta
    and (p_medico_id is null or i.medico_responsable_id = p_medico_id)
    and (p_estado_filtro is null or i.estado = p_estado_filtro);

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

grant execute on function public.dashboard_actividad_detalle(date, date, uuid, text) to authenticated;

create or replace function public.dashboard_seguridad(
  p_desde date,
  p_hasta date,
  p_medico_id uuid default null,
  p_estado_filtro text default null
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
  if private.mi_rol() is null then
    raise exception 'No autorizado.';
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
    and (p_medico_id is null or i.medico_responsable_id = p_medico_id)
    and (p_estado_filtro is null or i.estado = p_estado_filtro);

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
      and (p_medico_id is null or i.medico_responsable_id = p_medico_id)
      and (p_estado_filtro is null or i.estado = p_estado_filtro)
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
    and (p_medico_id is null or i.medico_responsable_id = p_medico_id)
    and (p_estado_filtro is null or i.estado = p_estado_filtro);

  select jsonb_build_object(
    'presentes_al_ingreso', count(*) filter (where e.datos->>'momento' = 'Al ingreso'),
    'aparecidas_durante', count(*) filter (where e.datos->>'momento' = 'Durante el ingreso'),
    'grado_iii_iv', count(*) filter (where e.datos->>'grado' in ('Grado III', 'Grado IV')),
    'tasa_aparecidas_1000', case when v_dias_estancia > 0 then round(
      count(*) filter (where e.datos->>'momento' = 'Durante el ingreso')::numeric / v_dias_estancia * 1000, 2
    ) else null end
  ) into v_ulceras
  from public.eventos e
  inner join public.ingresos i on i.id = e.ingreso_id
  where e.tipo = 'ulcera' and e.fecha between p_desde and p_hasta
    and (p_medico_id is null or i.medico_responsable_id = p_medico_id)
    and (p_estado_filtro is null or i.estado = p_estado_filtro);

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
  where e.tipo in ('error_medicacion', 'efecto_adverso_medicacion', 'infeccion_nosocomial', 'agresividad_fisica', 'fuga')
    and e.fecha between p_desde and p_hasta
    and (p_medico_id is null or i.medico_responsable_id = p_medico_id)
    and (p_estado_filtro is null or i.estado = p_estado_filtro);

  select jsonb_build_object(
    'pacientes_con_contencion_activa', (
      select count(*) from public.ingresos i2
      inner join public.contenciones c on c.ingreso_id = i2.id
      where i2.estado = 'activo'
        and (p_medico_id is null or i2.medico_responsable_id = p_medico_id)
        and (
          (c.dia is not null and c.dia <> 'ninguna')
          or (c.noche is not null and array_length(c.noche, 1) > 0)
        )
    ),
    'pendientes_confirmacion', (
      select count(*) from public.ingresos i2
      inner join public.contenciones c on c.ingreso_id = i2.id
      where i2.estado = 'activo'
        and (p_medico_id is null or i2.medico_responsable_id = p_medico_id)
        and c.confirmado_por_id is null
        and (
          c.dia = 'continua_seguridad' or c.dia in ('si_precisa_supervision', 'si_precisa_paciente')
          or 'contencion_fija' = any(c.noche) or 'contencion_si_precisa' = any(c.noche)
        )
    ),
    'cambios_pauta_periodo', (
      select count(*) from public.contenciones_historial ch
      inner join public.ingresos i2 on i2.id = ch.ingreso_id
      where ch.tipo_accion in ('pauta_creada', 'pauta_modificada')
        and ch.cambiado_en::date between p_desde and p_hasta
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

grant execute on function public.dashboard_seguridad(date, date, uuid, text) to authenticated;

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
  if private.mi_rol() is null then
    raise exception 'No autorizado.';
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
      (case when i.fecha_alta is not null then i.fecha_alta - i.fecha_ingreso else current_date - i.fecha_ingreso end) as dias_estancia,
      (select count(*) from public.eventos e where e.ingreso_id = i.id) as num_incidencias
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
          (select count(*) from public.eventos e where e.ingreso_id = i.id
            and (p_tipo_incidencia is null or e.tipo = p_tipo_incidencia)) > 0
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
        (case when i.fecha_alta is not null then i.fecha_alta - i.fecha_ingreso else current_date - i.fecha_ingreso end) as dias_estancia,
        (select count(*) from public.eventos e where e.ingreso_id = i.id) as num_incidencias
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
            (select count(*) from public.eventos e where e.ingreso_id = i.id
              and ($11::text is null or e.tipo = $11::text)) > 0
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

grant execute on function public.buscar_episodios_dashboard(
  text, date, date, date, date, date, date, text, uuid, integer, integer, boolean, text, text, text, integer, integer, boolean
) to authenticated;

commit;

-- Las seis funciones del Dashboard son security invoker y ya
-- comprueban private.mi_rol() — no hay fuga de datos —, pero se
-- quedaron con el permiso de ejecución por defecto que Postgres
-- concede a PUBLIC. Se revoca, igual que el resto de funciones
-- sensibles del proyecto.
begin;

revoke execute on function public.dashboard_situacion_actual() from public, anon;
revoke execute on function public.dashboard_resumen(date, date, uuid, text) from public, anon;
revoke execute on function public.dashboard_series(date, date, uuid, text) from public, anon;
revoke execute on function public.dashboard_actividad_detalle(date, date, uuid, text) from public, anon;
revoke execute on function public.dashboard_seguridad(date, date, uuid, text) from public, anon;
revoke execute on function public.buscar_episodios_dashboard(
  text, date, date, date, date, date, date, text, uuid, integer, integer, boolean, text, text, text, integer, integer, boolean
) from public, anon;

commit;
