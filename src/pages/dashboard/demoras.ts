// Cálculos de «Demora al alta» del Dashboard. Los datos salen del CMBD (cmbd.demora_alta, demora_alta_motivo y
// demora_alta_dias), que se rellena a mano al alta. Funciones puras, para poder comprobarlas aparte.

import { MOTIVOS_DEMORA, type MotivoDemora } from '../../lib/demora'

export const COLUMNAS_DEMORA = 'id, cmbd(demora_alta, demora_alta_motivo, demora_alta_dias)'

// Un episodio (una salida: alta o traslado). `demora`: true = hubo, false = no hubo, null = sin valorar (o sin CMBD).
export interface AltaDemora { demora: boolean | null; motivo: string | null; dias: number | null }

export function altaDemoraDesdeFila(f: Record<string, any>): AltaDemora {
  const c = Array.isArray(f.cmbd) ? f.cmbd[0] : f.cmbd
  const dias = typeof c?.demora_alta_dias === 'number' && Number.isFinite(c.demora_alta_dias) ? c.demora_alta_dias : null
  return { demora: typeof c?.demora_alta === 'boolean' ? c.demora_alta : null, motivo: c?.demora_alta_motivo ?? null, dias }
}

export interface FilaMotivo { clave: string; etiqueta: string; pacientes: number; dias: number; conDias: number }

export interface ResumenDemora {
  altas: number                       // salidas evaluadas (el Dashboard excluye los éxitus)
  valoradas: number                   // con la pregunta contestada (sí o no): la base del porcentaje
  conDemora: number
  sinDemora: number
  sinValorar: number                  // altas con la casilla sin contestar
  conDemoraSinDias: number            // con demora pero sin los días escritos: no entran en la media ni la mediana
  mediaDias: number | null
  medianaDias: number | null
  diasTotales: number
  porMotivo: FilaMotivo[]             // de más a menos pacientes
}

export function mediana(xs: number[]): number | null {
  if (xs.length === 0) return null
  const s = [...xs].sort((a, b) => a - b)
  const m = Math.floor(s.length / 2)
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2
}

export function resumenDemora(altas: AltaDemora[]): ResumenDemora {
  const dias: number[] = []
  const motivos = new Map<string, FilaMotivo>()
  let con = 0, sin = 0, sinValorar = 0, sinDias = 0
  for (const a of altas) {
    if (a.demora == null) { sinValorar++; continue }
    if (!a.demora) { sin++; continue }
    con++
    if (a.dias == null) sinDias++
    else dias.push(a.dias)
    const clave = a.motivo ?? 'sin_motivo'
    const f = motivos.get(clave) ?? {
      clave, etiqueta: clave === 'sin_motivo' ? 'Sin motivo indicado' : MOTIVOS_DEMORA[clave as MotivoDemora] ?? clave,
      pacientes: 0, dias: 0, conDias: 0,
    }
    f.pacientes++
    if (a.dias != null) { f.dias += a.dias; f.conDias++ }
    motivos.set(clave, f)
  }
  const total = dias.reduce((s, d) => s + d, 0)
  return {
    altas: altas.length, valoradas: con + sin, conDemora: con, sinDemora: sin, sinValorar, conDemoraSinDias: sinDias,
    mediaDias: dias.length ? total / dias.length : null,
    medianaDias: mediana(dias),
    diasTotales: total,
    porMotivo: [...motivos.values()].sort((a, b) => b.pacientes - a.pacientes || b.dias - a.dias),
  }
}
