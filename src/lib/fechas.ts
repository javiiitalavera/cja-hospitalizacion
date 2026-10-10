// Formatea cualquier fecha (no solo "hoy") en AAAA-MM-DD según sus
// componentes LOCALES, sin pasar por UTC. Útil para fechas ya calculadas
// (inicio de mes, de trimestre, de año…), no solo para "hoy".
export function formatFechaLocal(d: Date): string {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

// Fecha "de hoy" en formato AAAA-MM-DD, según el reloj LOCAL, no UTC.
//
// new Date().toISOString() convierte primero a UTC antes de formatear.
// En España eso puede dar la fecha de AYER durante la madrugada (de
// 00:00 a 01:59, tanto en invierno como en verano), porque a esas
// horas el reloj UTC todavía marca el día anterior. Por eso esta
// función nunca pasa por UTC.
export function hoyLocal(): string {
  return formatFechaLocal(new Date())
}

// Edad en años CUMPLIDOS (cumpleaños civil): compara año, mes y día, no milisegundos.
//
// La versión anterior dividía entre 365,25 días y redondeaba hacia abajo, y el día del cumpleaños
// a veces daba un año menos (nacido el 10/10/1945, ingreso el 10/10/2026: decía 80, y son 81).
//
// Admite una fecha de referencia opcional (por defecto, hoy). Esto importa en documentos: la edad
// de un informe de ingreso o de alta debe calcularse con la fecha de ESE episodio, no con la fecha
// en la que se vuelva a exportar el documento más adelante.
export function edad(fechaNacimiento?: string | null, fechaReferencia?: string | null): number | null {
  if (!fechaNacimiento) return null
  const [a, m, d] = fechaNacimiento.slice(0, 10).split('-').map(Number)
  const [A, M, D] = (fechaReferencia ? fechaReferencia.slice(0, 10) : hoyLocal()).split('-').map(Number)
  if ([a, m, d, A, M, D].some((n) => Number.isNaN(n))) return null
  return A - a - (M < m || (M === m && D < d) ? 1 : 0)
}

// Días entre dos fechas (por defecto, hasta hoy si no hay fecha de fin).
// Un único sitio para esto: lo usan el tiempo de estancia del paciente
// y los días transcurridos desde el ingreso, entre otros.
export function diasEntre(desde?: string | null, hasta?: string | null): number | null {
  if (!desde) return null
  const fin = hasta ? new Date(hasta) : new Date()
  return Math.round((fin.getTime() - new Date(desde).getTime()) / 86400000)
}
