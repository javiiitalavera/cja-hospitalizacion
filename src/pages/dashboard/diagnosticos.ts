// Cálculos del apartado "Diagnósticos" del Dashboard, a partir de los códigos CIE-10-ES que el
// médico guarda en el CMBD al alta. Son funciones puras (sin acceso a datos) para poder
// comprobarlas aparte.

import { infoCIE10, normalizarCodigo } from '../../lib/cie10'

export const N_SECUNDARIOS = 8

// Un episodio (un alta) con sus códigos. `principal` vacío = todavía sin codificar.
export interface EpisodioDx {
  principal: string
  secundarios: string[]
  // descripciones tal como se guardaron, por si el código no está en la lista de frecuentes
  descripciones: Record<string, string>
}

export function codigoLimpio(c: string | null | undefined): string {
  return c ? normalizarCodigo(c) : ''
}

export function codigosDe(e: EpisodioDx): string[] {
  return [e.principal, ...e.secundarios].filter(Boolean)
}

// ─── Diagnósticos más frecuentes ─────────────────────────────

// Las demencias "sin alteración…" llevan una cláusula larguísima; en un gráfico basta con lo esencial.
function abreviar(d: string): string {
  return d.replace(/, sin alteración del comportamiento, alteración psicótica, alteración del estado de ánimo ni ansiedad$/, ', sin alteración del comportamiento')
}

export interface FilaFrecuencia { codigo: string; descripcion: string; n: number }

// `modo` 'principal': episodios en los que el código es el diagnóstico principal.
// `modo` 'todos': episodios en los que aparece en cualquier posición (cada episodio cuenta una vez).
export function masFrecuentes(episodios: EpisodioDx[], modo: 'principal' | 'todos', max = 15): FilaFrecuencia[] {
  const cuenta = new Map<string, number>()
  const descs = new Map<string, Map<string, number>>()
  for (const e of episodios) {
    const codigos = modo === 'principal' ? [e.principal].filter(Boolean) : [...new Set(codigosDe(e))]
    for (const c of codigos) {
      cuenta.set(c, (cuenta.get(c) ?? 0) + 1)
      const d = e.descripciones[c]
      if (d) {
        const m = descs.get(c) ?? new Map<string, number>()
        m.set(d, (m.get(d) ?? 0) + 1)
        descs.set(c, m)
      }
    }
  }
  return [...cuenta.entries()]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .slice(0, max)
    .map(([codigo, n]) => {
      const guardada = [...(descs.get(codigo) ?? [])].sort((a, b) => b[1] - a[1])[0]?.[0]
      return { codigo, descripcion: abreviar(infoCIE10(codigo)?.desc ?? guardada ?? ''), n }
    })
}

// ─── Demencias por tipo ──────────────────────────────────────

export type TipoDemencia =
  | 'alzheimer' | 'vascular' | 'mixta' | 'lewy' | 'frontotemporal' | 'parkinson' | 'otra_enfermedad' | 'no_especificada'

export const TIPOS_DEMENCIA: { clave: TipoDemencia; etiqueta: string; codigos: string }[] = [
  { clave: 'alzheimer', etiqueta: 'Enfermedad de Alzheimer', codigos: 'G30.x (+ F02.8x)' },
  { clave: 'vascular', etiqueta: 'Demencia vascular', codigos: 'F01.x' },
  { clave: 'mixta', etiqueta: 'Mixta (Alzheimer + vascular)', codigos: 'G30.x + F01.x' },
  { clave: 'lewy', etiqueta: 'Cuerpos de Lewy', codigos: 'G31.83' },
  { clave: 'frontotemporal', etiqueta: 'Frontotemporal', codigos: 'G31.01, G31.09' },
  { clave: 'parkinson', etiqueta: 'Demencia en enfermedad de Parkinson', codigos: 'G20.x + F02.8x' },
  { clave: 'otra_enfermedad', etiqueta: 'En otra enfermedad (o sin causa codificada)', codigos: 'F02.8x' },
  { clave: 'no_especificada', etiqueta: 'Demencia no especificada', codigos: 'F03.x' },
]

// Tipo de demencia de un episodio según TODOS sus códigos (principal y secundarios): lo habitual
// es G30.1 + F02.811, y es una sola demencia (Alzheimer), no dos. null = sin demencia codificada.
export function tipoDemencia(codigos: string[]): TipoDemencia | null {
  const cs = codigos.map((c) => c.toUpperCase())
  const hay = (re: RegExp) => cs.some((c) => re.test(c))
  const alz = hay(/^G30(\.|$)/)
  const vasc = hay(/^F01(\.|$)/)
  if (alz && vasc) return 'mixta'
  if (alz) return 'alzheimer'
  if (vasc) return 'vascular'
  if (hay(/^G31\.83$/)) return 'lewy'
  if (hay(/^G31\.0[19]$/)) return 'frontotemporal'
  const f02 = hay(/^F02(\.|$)/)
  if (f02 && hay(/^G20(\.|$)/)) return 'parkinson'
  if (f02) return 'otra_enfermedad'
  if (hay(/^F03(\.|$)/)) return 'no_especificada'
  return null
}

export interface ResumenDemencias {
  episodios: number                          // con diagnóstico principal codificado (la base del cálculo)
  conDemencia: number
  porTipo: { clave: TipoDemencia; n: number }[]   // en el orden de TIPOS_DEMENCIA, incluso los de 0
}

export function resumenDemencias(episodios: EpisodioDx[]): ResumenDemencias {
  const cuenta = new Map<TipoDemencia, number>()
  let con = 0
  for (const e of episodios) {
    const t = tipoDemencia(codigosDe(e))
    if (t) { con++; cuenta.set(t, (cuenta.get(t) ?? 0) + 1) }
  }
  return {
    episodios: episodios.length,
    conDemencia: con,
    porTipo: TIPOS_DEMENCIA.map(({ clave }) => ({ clave, n: cuenta.get(clave) ?? 0 })),
  }
}

// ─── Filas de la base de datos → episodios ───────────────────

export function episodioDesdeFila(cmbd: Record<string, any> | null | undefined): EpisodioDx | null {
  if (!cmbd) return null
  const principal = codigoLimpio(cmbd.diagnostico_principal)
  const descripciones: Record<string, string> = {}
  const guardar = (c: string, d: unknown) => { if (c && typeof d === 'string' && d.trim() && !descripciones[c]) descripciones[c] = d.trim() }
  guardar(principal, cmbd.diagnostico_principal_desc)
  const secundarios: string[] = []
  for (let n = 1; n <= N_SECUNDARIOS; n++) {
    const c = codigoLimpio(cmbd[`diagnostico_secundario_${n}`])
    if (!c) continue
    secundarios.push(c)
    guardar(c, cmbd[`diagnostico_secundario_${n}_desc`])
  }
  return { principal, secundarios, descripciones }
}

export const COLUMNAS_CMBD_DX: string = [
  'diagnostico_principal', 'diagnostico_principal_desc',
  ...Array.from({ length: N_SECUNDARIOS }, (_, i) => i + 1).flatMap((n) => [`diagnostico_secundario_${n}`, `diagnostico_secundario_${n}_desc`]),
].join(', ')
