# CJA Hospital

CJA Hospital es una aplicación web en desarrollo para apoyar el trabajo de una
unidad de hospitalización psicogeriátrica. Complementa a Aegerus en los procesos
que actualmente necesitan un registro más estructurado: episodios, informes de
ingreso y alta, escalas clínicas, hoja de ítems, contenciones, incidencias, CMBD,
auditoría y seguimiento de actividad.

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
- Las políticas RLS, funciones SQL, disparadores e índices están documentados
  dentro de esos archivos.

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
esa biblioteca solo genera exportaciones CMBD y no procesa archivos aportados
por usuarios.
