# Cómo aplicar este paquete

Los archivos del paquete conservan la misma estructura de carpetas que el
repositorio. Copia cada uno sobre su ruta equivalente.

## 1. Código y recursos

Sustituye o añade:

- `README.md`
- `DOCUMENTACION_INSTALACION_Y_DESPLIEGUE.md`
- `package.json`
- `package-lock.json`
- `public/plantilla_ingreso.docx`
- `public/plantilla_alta.docx`
- `supabase/migrations/esquema_actual.sql`
- `supabase/migrations/20260908_correcciones_finales.sql`

Después, desde la raíz del proyecto:

```bash
npm ci
npm run build
```

Las plantillas Word mantienen la cabecera y el formato que utiliza la
aplicación, pero ya no contienen texto clínico de muestra, firma, número de
colegiado ni metadatos personales.

## 2. Base de datos actual

En el SQL Editor del proyecto Supabase actual ejecuta **solamente**:

`supabase/migrations/20260908_correcciones_finales.sql`

No ejecutes `esquema_actual.sql` sobre ese proyecto: es una baseline para una
base vacía y contiene operaciones de creación completa.

La migración incremental realiza dos cambios:

1. permite editar una pauta de contención confirmada e invalida correctamente
   la confirmación anterior;
2. impide cerrar o reabrir un episodio mediante una actualización directa y
   obliga a utilizar `dar_de_alta()` o `reabrir_episodio()`.

No es necesario volver a desplegar las Edge Functions para estos cambios.

## 3. Comprobación funcional mínima

Con datos ficticios:

1. confirma una pauta de contención y edita después su contenido; el guardado
   debe funcionar y la confirmación debe desaparecer;
2. da de alta un episodio desde la aplicación; debe cerrarse y el CMBD debe
   conservar la circunstancia de alta;
3. reabre ese episodio dentro de las 24 horas; debe volver a estado activo y
   quedar constancia en Auditoría;
4. exporta un informe de ingreso y uno de alta; ambos documentos deben mantener
   la cabecera y mostrar solo los datos generados por la aplicación.
