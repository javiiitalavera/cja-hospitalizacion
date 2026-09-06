import { formatFechaLocal as fmt } from '../../lib/fechas'
import type { Periodo } from './tipos'

// ─── Rango del periodo elegido ──────────────────────────────────

export function calcularRango(periodo: Periodo, desdePersonalizado?: string, hastaPersonalizado?: string): { desde: string; hasta: string } {
  const hoy = new Date()
  const hoyStr = fmt(hoy)

  if (periodo === 'mes') {
    return { desde: fmt(new Date(hoy.getFullYear(), hoy.getMonth(), 1)), hasta: hoyStr }
  }
  if (periodo === 'trimestre') {
    const trimestre = Math.floor(hoy.getMonth() / 3)
    return { desde: fmt(new Date(hoy.getFullYear(), trimestre * 3, 1)), hasta: hoyStr }
  }
  if (periodo === 'anio') {
    return { desde: fmt(new Date(hoy.getFullYear(), 0, 1)), hasta: hoyStr }
  }
  if (periodo === 'todo') {
    // No hay un "desde" real — 2000-01-01 es, en la práctica, "desde
    // siempre" para una clínica que no existía entonces.
    return { desde: '2000-01-01', hasta: hoyStr }
  }
  // Personalizado
  return { desde: desdePersonalizado || hoyStr, hasta: hastaPersonalizado || hoyStr }
}

// Suma/resta días a una fecha "YYYY-MM-DD" sin líos de huso horario
// (se opera en UTC puro, ya que aquí solo importa la fecha civil).
function sumarDias(fechaISO: string, dias: number): string {
  const d = new Date(fechaISO + 'T00:00:00Z')
  d.setUTCDate(d.getUTCDate() + dias)
  return d.toISOString().slice(0, 10)
}

function diasEntre(desde: string, hasta: string): number {
  const a = new Date(desde + 'T00:00:00Z').getTime()
  const b = new Date(hasta + 'T00:00:00Z').getTime()
  return Math.round((b - a) / 86400000) + 1
}

// ─── Periodo de comparación — periodos naturales equivalentes ──
//
// Este mes: del día 1 hasta hoy, frente a los mismos días del mes
// anterior (si el mes anterior no llega a ese día, se usa su último
// día disponible — p. ej. 31 de enero comparado con 28/29 de
// febrero).
// Este trimestre: desde el inicio del trimestre hasta hoy, frente al
// mismo número de días transcurridos desde el inicio del trimestre
// anterior (aquí es un desplazamiento de días, no un día de mes
// concreto — los trimestres no tienen el problema de "el día no
// existe").
// Este año: 1 de enero hasta hoy, frente al mismo intervalo del año
// anterior (con el mismo ajuste de "último día disponible" para el
// 29 de febrero).
// Personalizado: el intervalo inmediatamente anterior, con el mismo
// número de días.
// Todo el historial: sin comparación.
export function calcularRangoComparacion(periodo: Periodo, desde: string, hasta: string): { desde: string; hasta: string } | null {
  if (periodo === 'todo') return null

  if (periodo === 'mes') {
    const d = new Date(hasta + 'T00:00:00Z')
    const anioAnt = d.getUTCMonth() === 0 ? d.getUTCFullYear() - 1 : d.getUTCFullYear()
    const mesAnt = d.getUTCMonth() === 0 ? 11 : d.getUTCMonth() - 1
    const ultimoDiaMesAnt = new Date(Date.UTC(anioAnt, mesAnt + 1, 0)).getUTCDate()
    const diaEquivalente = Math.min(d.getUTCDate(), ultimoDiaMesAnt)
    return {
      desde: fmt(new Date(Date.UTC(anioAnt, mesAnt, 1))),
      hasta: fmt(new Date(Date.UTC(anioAnt, mesAnt, diaEquivalente))),
    }
  }

  if (periodo === 'trimestre') {
    const inicioActual = new Date(desde + 'T00:00:00Z')
    const diasTranscurridos = diasEntre(desde, hasta)
    const inicioAnterior = new Date(Date.UTC(inicioActual.getUTCFullYear(), inicioActual.getUTCMonth() - 3, 1))
    return {
      desde: fmt(inicioAnterior),
      hasta: sumarDias(fmt(inicioAnterior), diasTranscurridos - 1),
    }
  }

  if (periodo === 'anio') {
    const d = new Date(hasta + 'T00:00:00Z')
    const anioAnt = d.getUTCFullYear() - 1
    // 29 de febrero en año bisiesto, comparado con un año que no lo
    // es: se usa el último día disponible de febrero (28).
    const diasEnFebreroAnt = new Date(Date.UTC(anioAnt, 2, 0)).getUTCDate()
    const dia = d.getUTCMonth() === 1 && d.getUTCDate() === 29 ? Math.min(29, diasEnFebreroAnt) : d.getUTCDate()
    return {
      desde: fmt(new Date(Date.UTC(anioAnt, 0, 1))),
      hasta: fmt(new Date(Date.UTC(anioAnt, d.getUTCMonth(), dia))),
    }
  }

  // Personalizado: el intervalo inmediatamente anterior, mismo nº de días.
  const dias = diasEntre(desde, hasta)
  return {
    desde: sumarDias(desde, -dias),
    hasta: sumarDias(desde, -1),
  }
}

// Variación simple entre dos valores — sin decidir aquí si "más" es
// bueno o malo: eso lo decide quien lee la cifra, no el color de un
// icono puesto sin pensar.
export function variacion(actual: number, anterior: number): { absoluta: number; pct: number | null } {
  const absoluta = actual - anterior
  const pct = anterior !== 0 ? Math.round((absoluta / anterior) * 1000) / 10 : null
  return { absoluta, pct }
}

export function etiquetaPeriodo(periodo: Periodo, desde: string, hasta: string): string {
  const map: Record<Periodo, string> = {
    mes: 'Este mes', trimestre: 'Este trimestre', anio: 'Este año',
    todo: 'Todo el historial', personalizado: `${desde} a ${hasta}`,
  }
  return map[periodo]
}
