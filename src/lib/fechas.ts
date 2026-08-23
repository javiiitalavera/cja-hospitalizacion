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
// El patrón que se usaba antes en varios formularios,
// new Date().toISOString().split('T')[0], convierte primero a UTC. En
// España eso puede dar la fecha de AYER durante la madrugada (de 00:00 a
// 01:59 en invierno, o de 00:00 a 01:59 en verano), porque a esas horas
// el reloj UTC todavía marca el día anterior.
export function hoyLocal(): string {
  return formatFechaLocal(new Date())
}

// Edad aproximada en años a partir de la fecha de nacimiento. Es una
// aproximación por 365,25 días (no compara día/mes de cumpleaños),
// pero es la que ya usaba la app en varios sitios; se centraliza aquí
// en vez de mantenerla repetida.
//
// Admite una fecha de referencia opcional (por defecto, hoy). Esto
// importa en documentos: la edad de un informe de ingreso o de alta
// debe calcularse con la fecha de ESE episodio, no con la fecha en la
// que se vuelva a exportar el documento más adelante.
export function edad(fechaNacimiento?: string | null, fechaReferencia?: string | null): number | null {
  if (!fechaNacimiento) return null
  const referencia = fechaReferencia ? new Date(fechaReferencia).getTime() : Date.now()
  return Math.floor((referencia - new Date(fechaNacimiento).getTime()) / 31557600000)
}

// Días entre dos fechas (por defecto, hasta hoy si no hay fecha de fin).
// Antes existían dos variantes ligeramente distintas de esto mismo
// (diasIngresado / diasEstancia) en dos archivos distintos.
export function diasEntre(desde?: string | null, hasta?: string | null): number | null {
  if (!desde) return null
  const fin = hasta ? new Date(hasta) : new Date()
  return Math.round((fin.getTime() - new Date(desde).getTime()) / 86400000)
}
