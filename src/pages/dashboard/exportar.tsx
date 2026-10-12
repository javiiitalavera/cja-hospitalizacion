// Exportación de los datos agregados de cada pestaña del Dashboard a un Excel (.xlsx).
//
// Cada pestaña (o cada apartado dentro de una pestaña) «aporta» sus tablas con useAporteExportacion; el botón común
// del Dashboard recoge lo aportado por lo que está en pantalla y genera un único libro:
//   · Hoja «Datos de la vista»: la pestaña, las fechas exactas, el médico, cuándo se generó y la base de cálculo
//     (cuántas salidas o episodios se han evaluado).
//   · Una hoja por tabla.
// Son cifras agregadas: no llevan nombres de pacientes (para listas con nombres está el Explorador).

import { createContext, useContext, useEffect } from 'react'
import * as XLSX from 'xlsx'
import type { ResumenPeriodo, SerieDashboard, SituacionActual } from './tipos'
import { DEFINICIONES, type ClaveDefinicion } from './definiciones'

export type Celda = string | number | null

export interface HojaExport {
  nombre: string            // nombre de la hoja de Excel (se ajusta a 31 caracteres)
  columnas: string[]
  filas: Celda[][]
  nota?: string             // se escribe debajo de la tabla
}

export interface AporteExport {
  orden: number                                       // posición entre los apartados de la misma pestaña
  base?: { etiqueta: string; valor: number | string }[]   // «Base de cálculo» de la hoja de cabecera
  hojas: HojaExport[]
  definiciones?: ClaveDefinicion[]                    // indicadores que enseña este apartado: van a la hoja «Definiciones»
}

export interface ContextoExportacion {
  vista: string                 // nombre de la pestaña, tal como se ve
  desde: string                 // aaaa-mm-dd
  hasta: string
  medico: string                // «Todos los médicos» o el nombre
  registrar: (id: string, aporte: AporteExport | null) => void
}

export const ContextoExportar = createContext<ContextoExportacion | null>(null)

// Registra (o retira, con null) lo que aporta un apartado. `aporte` debe ser estable entre renderizados
// (useMemo): cada cambio de identidad vuelve a registrarlo.
export function useAporteExportacion(id: string, aporte: AporteExport | null) {
  const ctx = useContext(ContextoExportar)
  const registrar = ctx?.registrar
  useEffect(() => {
    if (!registrar) return
    registrar(id, aporte)
    return () => registrar(id, null)
  }, [registrar, id, aporte])
}

// ─── Formato ─────────────────────────────────────────────────

export function fechaES(iso: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso)
  return m ? `${m[3]}/${m[2]}/${m[1]}` : iso
}

// «01/10/2026 – 12/10/2026 · Todos los médicos»
export function etiquetaIntervalo(desde: string, hasta: string, medico: string): string {
  return `${fechaES(desde)} – ${fechaES(hasta)} · ${medico}`
}

function nombreHoja(nombre: string, usados: Set<string>): string {
  const base = nombre.replace(/[\\/?*[\]:]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 31) || 'Hoja'
  let n = base, i = 2
  while (usados.has(n.toLowerCase())) {
    const sufijo = ` (${i++})`
    n = base.slice(0, 31 - sufijo.length) + sufijo
  }
  usados.add(n.toLowerCase())
  return n
}

// Las cifras con muchos decimales (medias, cambios) se redondean a 2 en el Excel; los enteros no cambian.
function redondear(c: Celda): Celda {
  return typeof c === 'number' && Number.isFinite(c) ? Math.round(c * 100) / 100 : c
}

function ajustarColumnas(filas: Celda[][]): { wch: number }[] {
  const ancho: number[] = []
  for (const f of filas) f.forEach((c, i) => { ancho[i] = Math.max(ancho[i] ?? 0, Math.min(60, String(c ?? '').length)) })
  return ancho.map((w) => ({ wch: Math.max(8, w + 2) }))
}

// Construye el libro (separado de la descarga para poder comprobarlo aparte).
export function construirLibro(ctx: Pick<ContextoExportacion, 'vista' | 'desde' | 'hasta' | 'medico'>, aportes: AporteExport[], ahora = new Date()): XLSX.WorkBook {
  const ordenados = [...aportes].sort((a, b) => a.orden - b.orden)
  const usados = new Set<string>()
  const wb = XLSX.utils.book_new()

  const cabecera = nombreHoja('Datos de la vista', usados)
  const hojasFinales = ordenados.flatMap((a) => a.hojas).map((h) => ({ h, nombre: nombreHoja(h.nombre, usados) }))
  const claves = [...new Set(ordenados.flatMap((a) => a.definiciones ?? []))]
  const hojaDef = claves.length > 0 ? nombreHoja('Definiciones', usados) : null
  const base = ordenados.flatMap((a) => a.base ?? [])
  const generado = `${ahora.toLocaleDateString('es-ES')} ${ahora.toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' })}`

  const filasCabecera: Celda[][] = [
    ['CJA Hospital · Dashboard'],
    [],
    ['Vista', ctx.vista],
    ['Desde', fechaES(ctx.desde)],
    ['Hasta', fechaES(ctx.hasta)],
    ['Médico', ctx.medico],
    ['Generado', generado],
    [],
    ['Base de cálculo'],
    ...(base.length > 0 ? base.map((b): Celda[] => [b.etiqueta, b.valor]) : [['(esta vista no usa una base de episodios)']]),
    [],
    ['Hojas incluidas'],
    ...hojasFinales.map(({ nombre }): Celda[] => [nombre]),
    ...(hojaDef ? [[hojaDef]] : []),
    [],
    ['Son cifras agregadas, sin datos identificativos de pacientes.'],
  ]
  const wsCab = XLSX.utils.aoa_to_sheet(filasCabecera)
  wsCab['!cols'] = ajustarColumnas(filasCabecera)
  XLSX.utils.book_append_sheet(wb, wsCab, cabecera)

  for (const { h, nombre } of hojasFinales) {
    const filas: Celda[][] = [h.columnas, ...h.filas.map((f) => f.map(redondear))]
    if (h.nota) filas.push([], [h.nota])
    const ws = XLSX.utils.aoa_to_sheet(filas)
    ws['!cols'] = ajustarColumnas([h.columnas, ...h.filas.map((f) => f.map(redondear))])
    XLSX.utils.book_append_sheet(wb, ws, nombre)
  }

  // Cómo se calcula cada indicador de la vista. El texto va en la última columna para que pueda extenderse a la derecha.
  if (hojaDef) {
    const filas: Celda[][] = [['Indicador', 'Apartado', 'Definición']]
    for (const k of claves) {
      const d = DEFINICIONES[k]
      filas.push([d.titulo, 'Qué cuenta', d.queCuenta], ['', 'Fórmula', d.formula])
      if (d.ojo) filas.push(['', 'Ojo', d.ojo])
    }
    const ws = XLSX.utils.aoa_to_sheet(filas)
    ws['!cols'] = [{ wch: 42 }, { wch: 12 }, { wch: 120 }]
    XLSX.utils.book_append_sheet(wb, ws, hojaDef)
  }
  return wb
}

export function nombreArchivo(vista: string, desde: string, hasta: string): string {
  const v = vista.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '')
  return `cja_${v}_${desde}_${hasta}.xlsx`
}

export function descargarExcel(ctx: Pick<ContextoExportacion, 'vista' | 'desde' | 'hasta' | 'medico'>, aportes: AporteExport[]) {
  XLSX.writeFile(construirLibro(ctx, aportes), nombreArchivo(ctx.vista, ctx.desde, ctx.hasta))
}

// Porcentaje con un decimal como número (para que Excel pueda operar con él); null si no hay base.
export function porcentajeNum(n: number, total: number): number | null {
  return total > 0 ? Math.round((n / total) * 1000) / 10 : null
}

// ─── Tablas que comparten varias pestañas ────────────────────


const INDICADORES_PERIODO: [string, keyof ResumenPeriodo][] = [
  ['Ingresos nuevos', 'ingresos_nuevos'],
  ['Altas', 'altas'],
  ['Traslados', 'traslados'],
  ['Éxitus', 'exitus'],
  ['Salidas totales (altas + traslados + éxitus)', 'salidas_totales'],
  ['Días-estancia', 'dias_estancia'],
  ['Ocupación media (%)', 'ocupacion_media_pct'],
  ['Ocupación mínima (%)', 'ocupacion_min_pct'],
  ['Ocupación máxima (%)', 'ocupacion_max_pct'],
  ['Estancia media (días)', 'estancia_media_dias'],
  ['Estancia mediana (días)', 'estancia_mediana_dias'],
  ['Ingresos que son reingresos (≤30 días)', 'reingresos_30d'],
  ['Incidencias (sin úlceras por presión)', 'incidencias_total'],
  ['Incidencias por 1.000 días-estancia', 'incidencias_tasa_1000'],
]

// Las medias de estancia no tienen sentido sin salidas: el SQL devuelve 0, aquí se deja la celda vacía.
const SIN_SALIDAS: (keyof ResumenPeriodo)[] = ['estancia_media_dias', 'estancia_mediana_dias']
function valorIndicador(r: ResumenPeriodo, k: keyof ResumenPeriodo): Celda {
  return SIN_SALIDAS.includes(k) && r.salidas_totales === 0 ? null : (r[k] ?? null)
}

// Una fila por indicador; con la columna «Periodo anterior» si se está comparando.
export function hojaIndicadoresPeriodo(r: ResumenPeriodo, anterior?: ResumenPeriodo | null, nombre = 'Actividad del periodo'): HojaExport {
  return {
    nombre,
    columnas: anterior ? ['Indicador', 'Valor', 'Periodo anterior'] : ['Indicador', 'Valor'],
    filas: INDICADORES_PERIODO.map(([et, k]) => anterior ? [et, valorIndicador(r, k), valorIndicador(anterior, k)] : [et, valorIndicador(r, k)]),
    nota: r.salidas_totales === 0 || anterior?.salidas_totales === 0 ? 'Celda vacía = sin datos suficientes (sin salidas en el periodo).' : undefined,
  }
}

export function hojasSeries(s: SerieDashboard): HojaExport[] {
  return [
    { nombre: 'Ocupación diaria', columnas: ['Fecha', 'Camas ocupadas'], filas: s.ocupacion_diaria.map((d) => [fechaES(d.fecha), d.camas]) },
    {
      nombre: 'Ingresos y salidas',
      columnas: ['Desde', 'Hasta', 'Ingresos', 'Salidas'],
      filas: s.movimientos.map((m) => [fechaES(m.inicio), fechaES(m.fin), m.ingresos, m.salidas]),
      nota: `Agrupado por ${s.agrupacion === 'day' ? 'día' : s.agrupacion === 'week' ? 'semana' : 'mes'}. Salidas = altas, traslados y éxitus.`,
    },
  ]
}

export function hojaSituacionActual(s: SituacionActual): HojaExport {
  return {
    nombre: 'Situación actual',
    columnas: ['Indicador', 'Valor'],
    filas: [
      ['Ingresados ahora', s.pacientes_ingresados],
      ['Ocupación actual (%)', s.ocupacion_actual_pct],
      ['Estancia ≥ 60 días', s.estancia_larga_60],
      ['Semáforo rojo/naranja', s.semaforo_riesgo],
      ['Con contención activa', s.contencion_activa],
      ['Con contención «si precisa»', s.contencion_si_precisa],
      ['Contención sin confirmar', s.contencion_pendiente_confirmacion],
      ['Incidencias pendientes', s.incidencias_pendientes],
    ],
    nota: 'A fecha de hoy: no cambia con el periodo; sí con el médico elegido.',
  }
}
