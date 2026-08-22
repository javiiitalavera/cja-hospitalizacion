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
