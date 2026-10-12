# CJA Hospital

CJA Hospital es una aplicación web en desarrollo para apoyar el trabajo de una
unidad de hospitalización psicogeriátrica. Complementa a Aegerus en los procesos
que actualmente necesitan un registro más estructurado: episodios, informes de
ingreso y alta, escalas clínicas, hoja de ítems, contenciones, incidencias, CMBD,
auditoría y seguimiento de actividad, con un Dashboard de indicadores para
administradores que se puede exportar a Excel.

El repositorio contiene únicamente código y datos de configuración de ejemplo.
La aplicación se está validando todavía con datos ficticios y no debe
considerarse preparada para datos clínicos reales hasta completar la revisión
técnica, organizativa y de protección de datos de la clínica.

## Tecnología

- React, TypeScript y Vite para el frontend.
- Supabase para PostgreSQL, autenticación, RLS y Edge Functions.
- Vercel para el despliegue del frontend.

## Puesta en marcha local

Requisitos: Git, npm y una versión de Node.js compatible con Vite 8 (Node
20.19+, 22.12+ o una versión posterior compatible).

```bash
git clone https://github.com/javiiitalavera/cja-hospitalizacion.git
cd cja-hospitalizacion
npm ci
cp .env.example .env
npm run dev
```

Hay que completar `.env` con la URL y la clave pública del proyecto Supabase.
El archivo `.env` real no debe incorporarse al repositorio.

Para verificar el frontend de producción:

```bash
npm run build
```

## Base de datos

- `supabase/migrations/esquema_actual.sql` es una baseline destinada
  exclusivamente a una base de datos vacía. **No debe ejecutarse sobre el
  proyecto Supabase actual.**
- `supabase/migrations/20260908_correcciones_finales.sql` es la migración
  incremental preparada para aplicar las correcciones finales de esta ronda al
  proyecto actual, preferiblemente después de probarla en un entorno separado.
- Los cambios posteriores se entregan como migraciones fechadas
  (`supabase/migrations/aaaammdd_nombre.sql`, la última a fecha de esta revisión
  es `20261019_dashboard_ulceras_no_clasificables.sql`). Cada una se ejecuta una
  sola vez, en el SQL Editor y en orden de fecha, y `esquema_actual.sql` se
  mantiene sincronizado con todas ellas.
- Las políticas RLS, funciones SQL, disparadores e índices están documentados
  dentro de esos archivos.

## Dashboard

El Dashboard (solo administradores) reúne indicadores de actividad, diagnósticos,
evolución clínica, medicación, seguridad y demora al alta, más un explorador de
episodios. Los cálculos pesados son funciones SQL `security invoker`
(`dashboard_*`, `buscar_episodios_dashboard`) y el resto se calcula en el
cliente a partir de las salidas del periodo.

- Cada indicador no evidente lleva un icono «i» con qué cuenta, su fórmula y
  lo que no incluye. Esas definiciones están en un único archivo,
  `src/pages/dashboard/definiciones.ts`: si cambia un cálculo, hay que cambiar
  ahí su texto.
- «Exportar datos de esta vista» genera un Excel con las cifras agregadas de la
  pestaña (sin nombres de pacientes), el intervalo exacto de fechas, la base de
  cálculo y una hoja «Definiciones». Cada pestaña aporta sus tablas con
  `useAporteExportacion` (`src/pages/dashboard/exportar.tsx`).
- Convenios de lectura: «salidas» son altas, traslados y éxitus por fecha de
  alta; los promedios sin datos suficientes se muestran como «—», no como 0; en
  Medicación, un informe con la medicación sin tocar queda fuera de los cálculos
  y una lista vacía cuenta como «sin medicación» (0 fármacos).

## Edge Functions

Las funciones administrativas utilizadas por la pestaña Personal están en
`supabase/functions/`. La clave `SUPABASE_SERVICE_ROLE_KEY` pertenece al entorno
de Supabase y nunca debe copiarse al frontend, a una variable `VITE_*` ni al
repositorio.

## Documentación técnica

La guía completa de instalación, despliegue, arranque de la primera cuenta
administradora y comprobaciones posteriores está en
[`DOCUMENTACION_INSTALACION_Y_DESPLIEGUE.md`](DOCUMENTACION_INSTALACION_Y_DESPLIEGUE.md).

Limitaciones conocidas de esta fase: la instalación limpia de Supabase todavía
no está automatizada con CLI/CI y `npm run lint` conserva deuda técnica, aunque
el build de producción sí debe completarse correctamente. `npm audit --omit=dev`
mantiene además un aviso alto sin corrección publicada en `xlsx`; actualmente
esa biblioteca solo genera exportaciones (CMBD y datos agregados del Dashboard)
y no procesa archivos aportados por usuarios.
