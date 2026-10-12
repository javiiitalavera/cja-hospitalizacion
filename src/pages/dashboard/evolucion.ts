// Cálculos del apartado «Evolución clínica» del Dashboard: cómo cambian la conducta (NPI-Q, gravedad)
// y la autonomía (Barthel y Lawton) entre la valoración del ingreso y la del alta. Funciones puras,
// para poder comprobarlas aparte. Las escalas se muestran por separado: no se suman ni se convierten
// en una puntuación única.

export type ClaveEscala = 'npi' | 'barthel' | 'lawton'

export interface DefinicionEscala {
  clave: ClaveEscala
  etiqueta: string
  tema: 'Conducta' | 'Autonomía'
  rango: string                 // «0–36»
  campo: 'npi_gravedad_total' | 'barthel_total' | 'lawton_total'
  mejoraAlSubir: boolean        // Barthel y Lawton: más es más autónomo. NPI-Q: más es más síntomas.
  sentido: string               // frase corta para explicar la dirección
}

export const ESCALAS: DefinicionEscala[] = [
  { clave: 'npi', etiqueta: 'NPI-Q (gravedad)', tema: 'Conducta', rango: '0–36', campo: 'npi_gravedad_total', mejoraAlSubir: false, sentido: 'menos puntos = menos síntomas' },
  { clave: 'barthel', etiqueta: 'Barthel', tema: 'Autonomía', rango: '0–100', campo: 'barthel_total', mejoraAlSubir: true, sentido: 'más puntos = más autonomía' },
  { clave: 'lawton', etiqueta: 'Lawton', tema: 'Autonomía', rango: '0–8', campo: 'lawton_total', mejoraAlSubir: true, sentido: 'más puntos = más autonomía' },
]

export const COLUMNAS_EVOLUCION = 'escalas_clinicas(momento, barthel_total, lawton_total, npi_gravedad_total)'

export type Totales = Record<ClaveEscala, number | null>
// Un episodio (un alta). `null` = ese momento no tiene ninguna escala guardada.
export interface EpisodioEscalas { ingreso: Totales | null; alta: Totales | null }

function aTotales(f: Record<string, any>): Totales {
  const n = (x: unknown) => (typeof x === 'number' && Number.isFinite(x) ? x : null)
  return { npi: n(f.npi_gravedad_total), barthel: n(f.barthel_total), lawton: n(f.lawton_total) }
}

// Fila de la base de datos (un ingreso con sus escalas) → episodio.
export function episodioEscalasDesdeFila(f: Record<string, any>): EpisodioEscalas {
  const filas: Record<string, any>[] = Array.isArray(f.escalas_clinicas) ? f.escalas_clinicas : f.escalas_clinicas ? [f.escalas_clinicas] : []
  const de = (momento: 'ingreso' | 'alta') => {
    const fila = filas.find((x) => x.momento === momento)
    return fila ? aTotales(fila) : null
  }
  return { ingreso: de('ingreso'), alta: de('alta') }
}

// ─── Resumen del periodo ─────────────────────────────────────

export interface ResumenEscala {
  def: DefinicionEscala
  conIngreso: number            // altas con esta escala puntuada al ingreso
  conAlta: number               // … y al alta
  conAmbas: number              // … y en los dos momentos: solo estas se pueden comparar
  mediaIngreso: number | null   // medias sobre las que tienen ambas, para que los dos números sean comparables
  mediaAlta: number | null
  cambioMedio: number | null    // alta − ingreso
  cambioMediano: number | null
  mejoran: number
  igual: number
  empeoran: number
}

export interface ResumenEvolucion { altas: number; escalas: ResumenEscala[] }

function mediana(xs: number[]): number | null {
  if (xs.length === 0) return null
  const s = [...xs].sort((a, b) => a - b)
  const m = Math.floor(s.length / 2)
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2
}

export function resumenEvolucion(episodios: EpisodioEscalas[]): ResumenEvolucion {
  const escalas = ESCALAS.map((def): ResumenEscala => {
    let conIngreso = 0, conAlta = 0
    const pares: [number, number][] = []
    for (const e of episodios) {
      const i = e.ingreso?.[def.clave] ?? null
      const a = e.alta?.[def.clave] ?? null
      if (i != null) conIngreso++
      if (a != null) conAlta++
      if (i != null && a != null) pares.push([i, a])
    }
    const n = pares.length
    const dif = pares.map(([i, a]) => a - i)
    const sube = dif.filter((d) => d > 0).length
    const baja = dif.filter((d) => d < 0).length
    const suma = (xs: number[]) => xs.reduce((s, x) => s + x, 0)
    return {
      def, conIngreso, conAlta, conAmbas: n,
      mediaIngreso: n ? suma(pares.map((p) => p[0])) / n : null,
      mediaAlta: n ? suma(pares.map((p) => p[1])) / n : null,
      cambioMedio: n ? suma(dif) / n : null,
      cambioMediano: mediana(dif),
      mejoran: def.mejoraAlSubir ? sube : baja,
      igual: n - sube - baja,
      empeoran: def.mejoraAlSubir ? baja : sube,
    }
  })
  return { altas: episodios.length, escalas }
}
