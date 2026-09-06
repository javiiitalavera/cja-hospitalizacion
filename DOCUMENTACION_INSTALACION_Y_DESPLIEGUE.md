# CJA Hospital — instalación y despliegue

## 1. Propósito y estado actual

CJA Hospital es una aplicación web construida con React, TypeScript y Vite. Utiliza Supabase para PostgreSQL, autenticación, Row Level Security (RLS) y Edge Functions, y Vercel para publicar el frontend.

Esta guía documenta el estado del repositorio en el commit `f6ec153` del 6 de septiembre de 2026. Su objetivo inmediato es permitir que una persona técnica entienda cómo está desplegada la aplicación y qué necesita para reconstruirla. No sustituye todavía a una instalación automatizada ni autoriza a ejecutar el esquema sobre la base de datos en uso.

Estado verificado:

- `npm ci` instala correctamente las dependencias desde `package-lock.json`.
- `npm run build` genera correctamente el frontend de producción.
- La configuración necesaria del frontend está representada en `.env.example`.
- El esquema pretendido de la base de datos está reunido en `supabase/migrations/esquema_actual.sql`.
- Las siete Edge Functions utilizadas por la pantalla Personal están incluidas en `supabase/functions/`.
- La reconstrucción completa de un Supabase vacío aún no está automatizada ni se ha convertido en un flujo reproducible mediante Supabase CLI.
- `npm run lint` no está limpio actualmente: en este commit devuelve 186 errores y 17 avisos. Esto no impide el build, pero debe constar como deuda técnica y no debe presentarse el lint como una comprobación superada.

## 2. Estructura relevante

```text
.
├── src/                              # Aplicación React
├── public/                           # Recursos públicos y plantillas Word
├── supabase/
│   ├── functions/                    # Edge Functions
│   └── migrations/
│       └── esquema_actual.sql        # Esquema completo para una BD vacía
├── .env.example                      # Variables públicas necesarias
├── package.json
├── package-lock.json
└── vercel.json                       # Reescritura de rutas para la SPA
```

En el estado actual no existen:

- `supabase/config.toml`;
- una dependencia de Supabase CLI fijada en `package.json`;
- un historial incremental de migraciones con nombres timestamp;
- datos ficticios de prueba o cuentas de prueba automatizadas;
- pruebas automáticas de RLS;
- un proceso CI que reconstruya la base y ejecute la regresión.

Por ello, `esquema_actual.sql` debe tratarse como una **foto de referencia para una base vacía**, no como una migración que pueda aplicarse sobre producción.

## 3. Requisitos del frontend

- Git.
- Node.js `20.19.x`, `22.12.0` o posterior dentro de una rama compatible. Vite 8 no admite Node 21 ni las primeras versiones de Node 22.
- npm.
- Un proyecto Supabase ya configurado.

## 4. Ejecución local del frontend

```bash
git clone https://github.com/javiiitalavera/cja-hospitalizacion.git
cd cja-hospitalizacion
npm ci
cp .env.example .env
```

Completar `.env` con los datos públicos del proyecto Supabase:

```dotenv
VITE_SUPABASE_URL=https://<project-ref>.supabase.co
VITE_SUPABASE_ANON_KEY=<clave-publica-anon-o-publishable>
```

Después:

```bash
npm run dev
```

La URL local la mostrará Vite en la consola.

Comprobación del build:

```bash
npm run build
```

El resultado se genera en `dist/`.

### Reglas sobre secretos

- `.env` no debe incorporarse a Git; ya está excluido por `.gitignore`.
- `VITE_SUPABASE_URL` y la clave pública son visibles necesariamente en el navegador y su seguridad depende de las políticas RLS.
- La clave `service_role` no debe añadirse nunca al frontend, a variables `VITE_*`, al repositorio ni a Vercel.
- No se deben incluir datos clínicos reales en el repositorio, en datos de prueba ni en capturas de la documentación.

## 5. Despliegue del frontend en Vercel

1. Importar el repositorio de GitHub en Vercel.
2. Seleccionar Vite como framework, si no se detecta automáticamente.
3. Utilizar `npm run build` como comando de build y `dist` como directorio de salida.
4. Crear en Vercel las variables:
   - `VITE_SUPABASE_URL`;
   - `VITE_SUPABASE_ANON_KEY`.
5. Desplegar.

`vercel.json` reescribe las rutas de la aplicación a `index.html`. Es necesario para que rutas internas como las fichas de pacientes o ingresos sigan funcionando al recargar directamente la página.

Tras cambiar cualquiera de las dos variables hay que volver a desplegar el frontend, porque Vite las incorpora durante el build.

## 6. Base de datos Supabase

### 6.1. Qué contiene el esquema

`supabase/migrations/esquema_actual.sql` contiene, para una base vacía:

- extensiones `pgcrypto`, `pg_cron` y `unaccent`;
- tablas clínicas y administrativas;
- funciones y RPC utilizadas por el frontend;
- disparadores de auditoría, versionado y contenciones;
- políticas RLS y permisos;
- índices y restricciones de unicidad;
- tarea nocturna `snapshot-items-diario`;
- funciones del Dashboard y explorador de episodios;
- tres fichas iniciales de profesionales, una de ellas marcada como administradora.

### 6.2. Advertencia crítica

**No ejecutar `esquema_actual.sql` sobre el proyecto Supabase actual.** El propio archivo crea tablas, funciones, políticas y disparadores desde cero. Su destino es exclusivamente un proyecto vacío de prueba o una reconstrucción futura planificada.

La base alojada actualmente sigue siendo la fuente efectiva de verdad. El archivo SQL es la representación que pretende reproducirla, pero esa equivalencia deberá confirmarse mediante una instalación limpia y una comparación contra el esquema remoto antes de una migración real.

### 6.3. Arranque manual en un proyecto vacío

Este procedimiento se documenta para una futura prueba controlada; todavía no está automatizado:

1. Crear un proyecto Supabase vacío destinado a pruebas.
2. Abrir SQL Editor.
3. Ejecutar una sola vez y completo `supabase/migrations/esquema_actual.sql`.
4. Confirmar que la transacción finaliza sin errores.
5. Verificar al menos:
   - tablas de `public`;
   - políticas RLS activas;
   - funciones RPC;
   - disparadores;
   - tarea programada `snapshot-items-diario`.
6. Crear y enlazar la primera cuenta administradora como se explica a continuación.
7. Desplegar las Edge Functions.
8. Configurar el frontend contra ese proyecto y ejecutar la regresión funcional.

## 7. Creación de la primera cuenta administradora

El esquema crea fichas en `public.profesionales`, pero no puede crear de forma segura una contraseña ni una cuenta real en `auth.users`. Una de esas fichas queda marcada con `es_admin = true` y `user_id = null`.

Procedimiento manual inicial:

1. En Supabase, ir a Authentication → Users.
2. Crear la cuenta de la persona que será administradora inicial y guardar su UUID.
3. Localizar la ficha administradora creada por el esquema:

```sql
select id, nombre, apellidos, rol, activo, es_admin, user_id
from public.profesionales
where es_admin = true;
```

4. Enlazar esa ficha con la cuenta de Auth. Sustituir ambos UUID; no ejecutar literalmente los marcadores:

```sql
update public.profesionales
set user_id = '<UUID_DE_AUTH>'::uuid,
    activo = true,
    es_admin = true
where id = '<UUID_DE_LA_FICHA>'::uuid
  and user_id is null;
```

5. Verificar el enlace:

```sql
select p.id, p.nombre, p.apellidos, p.rol, p.activo, p.es_admin,
       p.user_id, u.email
from public.profesionales p
join auth.users u on u.id = p.user_id
where p.es_admin = true;
```

6. Iniciar sesión en la aplicación. A partir de ese momento, la persona administradora puede gestionar el resto de fichas y cuentas desde Personal.

No deben existir dos fichas vinculadas a la misma cuenta. La columna `profesionales.user_id` tiene una restricción `unique` que lo impide.

## 8. Edge Functions

El repositorio contiene estas funciones:

| Función | Finalidad |
| --- | --- |
| `acceso-profesional` | Dar de baja o reactivar el acceso sin borrar la trazabilidad. |
| `cambiar-email-profesional` | Cambiar el correo de una cuenta ya enlazada. |
| `crear-cuenta-existente` | Crear una cuenta Auth para una ficha de profesional ya existente. |
| `crear-profesional` | Crear conjuntamente cuenta Auth y ficha profesional. |
| `eliminar-profesional` | Eliminar entradas de prueba o erróneas cuando no tienen registros clínicos asociados. |
| `listar-accesos` | Mostrar correo y último acceso en Personal. |
| `restablecer-password` | Establecer una contraseña nueva y registrar la actuación en auditoría. |

Todas revalidan la sesión de quien llama y comprueban en servidor que sea una persona administradora activa. Utilizan `SUPABASE_SERVICE_ROLE_KEY` solo dentro del entorno de ejecución de Supabase.

Para desplegarlas se necesita Supabase CLI autenticada. El CLI todavía no es una dependencia del repositorio y tampoco existe `supabase/config.toml`; por tanto, en el estado actual debe instalarse por separado e indicarse expresamente el proyecto de destino:

```bash
supabase login
supabase functions deploy --project-ref <PROJECT_REF>
```

Ese comando despliega todas las carpetas encontradas en `supabase/functions/`. Antes de ejecutarlo se debe comprobar dos veces el `PROJECT_REF`, ya que el repositorio no fija por sí solo si el destino es pruebas o producción.

En Supabase alojado, `SUPABASE_URL`, `SUPABASE_ANON_KEY` y `SUPABASE_SERVICE_ROLE_KEY` son secretos proporcionados por el propio proyecto a las Edge Functions. No deben copiarse al código.

Después del despliegue hay que comprobar desde la aplicación que:

- una persona no administradora recibe una denegación;
- una administradora puede listar accesos;
- crear, enlazar, cambiar correo, restablecer contraseña y dar de baja funcionan;
- no queda una cuenta Auth huérfana si falla la creación de la ficha;
- no puede eliminarse un profesional con registros clínicos asociados.

## 9. Configuración de Supabase no representada todavía en Git

Antes de una migración o reconstrucción definitiva debe inventariarse la configuración del Dashboard que no está contenida en `esquema_actual.sql`, especialmente:

- región y plan del proyecto;
- configuración de Authentication;
- URLs del sitio y redirecciones permitidas;
- política de contraseñas, duración de sesiones y MFA, si se utiliza;
- protección CAPTCHA, si se mantiene activada;
- límites de correo y proveedor SMTP, si se utiliza;
- secretos adicionales de Edge Functions;
- integraciones, copias y tareas externas;
- variables configuradas en Vercel.

No se deben anotar valores secretos en este documento. Basta con registrar dónde están configurados, quién es responsable y cuándo se comprobaron por última vez.

## 10. Comprobación mínima tras un despliegue

1. Abrir la URL pública y recargar una ruta interna.
2. Comprobar que una cuenta sin ficha profesional no entra en la aplicación.
3. Iniciar sesión con una cuenta válida de cada rol.
4. Verificar lectura y escritura según las políticas RLS de cada rol.
5. Ejecutar un recorrido completo con datos ficticios:
   - crear paciente e ingreso;
   - informe de ingreso y escalas;
   - contención y confirmación médica;
   - hoja de ítems;
   - incidencia, edición y eliminación conforme a permisos;
   - informe de alta y CMBD;
   - cerrar y, dentro del plazo previsto, reabrir el episodio;
   - consultar Auditoría y Dashboard.
6. Confirmar que las siete acciones administrativas de Personal responden correctamente.
7. Eliminar los datos y cuentas ficticias creados para la prueba cuando sea seguro hacerlo.

## 11. Trabajo que se deja expresamente para una fase posterior

Antes de usar datos clínicos reales o trasladar la aplicación a infraestructura de la clínica se debe realizar una ronda específica para:

1. Inicializar formalmente Supabase CLI y añadir `supabase/config.toml`.
2. Obtener y revisar una baseline desde el esquema alojado real.
3. Conciliar esa baseline con `esquema_actual.sql`.
4. Separar del esquema las fichas nominales de profesionales que hoy se crean como datos iniciales y definir un procedimiento genérico para el primer administrador.
5. Adoptar migraciones timestamp para los cambios posteriores.
6. Crear datos ficticios reproducibles, sin información personal.
7. Automatizar `db reset`, pruebas RLS por rol y regresiones críticas.
8. Desplegar las Edge Functions en un entorno de prueba.
9. Ejecutar la instalación completa desde cero y documentar el resultado.
10. Preparar el plan de transferencia o migración, regeneración de claves y cambio de variables de Vercel.

Esta fase no requiere necesariamente una cuenta Pro para las pruebas locales. Sí debe completarse antes de introducir datos reales o efectuar el cambio de titularidad, y no debe improvisarse el mismo día de la migración.
