// De dónde sale el contenido de un informe. SOLO se lee del informe de
// ingreso, del informe de alta y de las escalas que se completan en ellos;
// nada de Hoja de ítems, CMBD, curas ni contacto familiar.
//
//  - Al CREAR el informe se copia un punto de partida (evolución clínica y
//    diagnósticos del informe de alta) que luego se edita.
//  - Al EXPORTAR se leen los campos heredados (informe de ingreso, con la
//    medicación y las escalas más recientes): así el Word siempre refleja
//    la ficha de hoy y no hay datos duplicados que se queden desfasados.

import { supabase } from '../../lib/supabase'
import type { FilaMedicacion, InformeAlta, InformeIngreso } from '../../types'
import type { EscalaClinica } from '../../types/escalas'
import { TOMAS } from '../ingreso/TablaMedicacion'
import { plantillaPorId } from './plantillas'
import type { PlantillaId } from './plantillas'

const limpio = (s?: string | null) => (s ?? '').trim()

export function textoMedicacion(filas: FilaMedicacion[] | null | undefined): string {
  return (filas ?? [])
    .filter((f) => limpio(f.farmaco))
    .map((f) => {
      const tomas = TOMAS
        .map((t) => (limpio(f[t.key]) ? `${t.label.toLowerCase()} ${limpio(f[t.key])}` : ''))
        .filter(Boolean)
        .join(', ')
      return `${limpio(f.farmaco)}${limpio(f.dosis) ? ' ' + limpio(f.dosis) : ''}${tomas ? ` (${tomas})` : ''}${limpio(f.observaciones) ? ` — ${limpio(f.observaciones)}` : ''}`
    })
    .join('\n')
}

function resumenEscala(e: EscalaClinica | null): string {
  if (!e) return ''
  const p: string[] = []
  if (e.barthel_total != null) p.push(`Barthel ${e.barthel_total}/100`)
  if (e.lawton_total != null) p.push(`Lawton ${e.lawton_total}/8`)
  if (e.npi_gravedad_total != null) p.push(`NPI-Q (gravedad) ${e.npi_gravedad_total}/36`)
  if (e.gds_estadio) p.push(`GDS ${e.gds_estadio}`)
  if (e.fast_estadio) p.push(`FAST ${e.fast_estadio}`)
  return p.join(' · ')
}

export function textoEscalas(ingreso: EscalaClinica | null, alta: EscalaClinica | null): string {
  const a = resumenEscala(alta)
  const i = resumenEscala(ingreso)
  return [a && `Al alta: ${a}`, i && `Al ingreso: ${i}`].filter(Boolean).join('\n')
}

export interface Fuentes {
  informeIngreso: Partial<InformeIngreso> | null
  informeAlta: Partial<InformeAlta> | null
  escalaIngreso: EscalaClinica | null
  escalaAlta: EscalaClinica | null
}

// Punto de partida al crear el informe (funciones puras).
export function camposIniciales(plantilla: PlantillaId, f: Fuentes): Record<string, string> {
  if (plantilla !== 'estado_actual') return {}
  const ia = f.informeAlta
  const campos: Record<string, string> = {}
  if (limpio(ia?.evolucion_clinica)) campos.evolucion_clinica = ia!.evolucion_clinica!
  if (limpio(ia?.juicios_clinicos)) campos.diagnosticos = ia!.juicios_clinicos!
  return campos
}

// Campos heredados, tal y como están ahora en los informes de ingreso y alta.
export function camposHeredados(plantilla: PlantillaId, f: Fuentes): Record<string, string> {
  const heredados = plantillaPorId(plantilla).heredados
  if (!heredados) return {}
  const ii = (f.informeIngreso ?? {}) as Record<string, unknown>
  const campos: Record<string, string> = {}
  for (const c of heredados) {
    const v = ii[c.key]
    if (typeof v === 'string' && v.trim()) campos[c.key] = v
  }
  const tratamiento =
    textoMedicacion(f.informeAlta?.medicacion_estructurada) ||
    textoMedicacion(f.informeIngreso?.tratamiento_ingreso_estructurado)
  if (tratamiento) campos.tratamiento = tratamiento
  const escalas = textoEscalas(f.escalaIngreso, f.escalaAlta)
  if (escalas) campos.escalas = escalas
  return campos
}

async function cargarFuentes(ingresoId: string): Promise<Fuentes> {
  const [ii, ia, ei, ea] = await Promise.all([
    supabase.from('informe_ingreso').select('*').eq('ingreso_id', ingresoId).maybeSingle(),
    supabase.from('informe_alta').select('*').eq('ingreso_id', ingresoId).maybeSingle(),
    supabase.from('escalas_clinicas').select('*').eq('ingreso_id', ingresoId).eq('momento', 'ingreso').maybeSingle(),
    supabase.from('escalas_clinicas').select('*').eq('ingreso_id', ingresoId).eq('momento', 'alta').maybeSingle(),
  ])
  const error = ii.error ?? ia.error ?? ei.error ?? ea.error
  if (error) throw new Error(error.message)
  return {
    informeIngreso: (ii.data as Partial<InformeIngreso>) ?? null,
    informeAlta: (ia.data as Partial<InformeAlta>) ?? null,
    escalaIngreso: (ei.data as EscalaClinica) ?? null,
    escalaAlta: (ea.data as EscalaClinica) ?? null,
  }
}

export async function cargarCamposIniciales(ingresoId: string, plantilla: PlantillaId): Promise<Record<string, string>> {
  if (plantilla !== 'estado_actual') return {}
  return camposIniciales(plantilla, await cargarFuentes(ingresoId))
}

export async function cargarCamposHeredados(ingresoId: string, plantilla: PlantillaId): Promise<Record<string, string>> {
  if (!plantillaPorId(plantilla).heredados) return {}
  return camposHeredados(plantilla, await cargarFuentes(ingresoId))
}
