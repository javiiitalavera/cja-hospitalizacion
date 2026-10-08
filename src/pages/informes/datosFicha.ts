// Punto de partida de un informe nuevo. SOLO se lee del informe de
// ingreso, del informe de alta y de las escalas que se completan en
// ellos; nada de Hoja de ítems, CMBD, curas ni contacto familiar.
// Se copia al crear el informe y a partir de ahí es texto editable.

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

interface Fuentes {
  informeIngreso: Partial<InformeIngreso> | null
  informeAlta: Partial<InformeAlta> | null
  escalaIngreso: EscalaClinica | null
  escalaAlta: EscalaClinica | null
}

// Función pura: de las fuentes al objeto de campos de la plantilla.
export function camposIniciales(plantilla: PlantillaId, f: Fuentes): Record<string, string> {
  if (plantilla !== 'estado_actual') return {}
  const ii = (f.informeIngreso ?? {}) as Record<string, unknown>
  const ia = f.informeAlta
  const campos: Record<string, string> = {}
  for (const c of plantillaPorId('estado_actual').campos) {
    const v = ii[c.key]
    if (typeof v === 'string' && v.trim()) campos[c.key] = v
  }
  const tratamiento =
    textoMedicacion(ia?.medicacion_estructurada) ||
    textoMedicacion(f.informeIngreso?.tratamiento_ingreso_estructurado)
  if (tratamiento) campos.tratamiento = tratamiento
  const escalas = textoEscalas(f.escalaIngreso, f.escalaAlta)
  if (escalas) campos.escalas = escalas
  if (limpio(ia?.evolucion_clinica)) campos.evolucion_clinica = ia!.evolucion_clinica!
  if (limpio(ia?.juicios_clinicos)) campos.diagnosticos = ia!.juicios_clinicos!
  return campos
}

export async function cargarCamposIniciales(ingresoId: string, plantilla: PlantillaId): Promise<Record<string, string>> {
  if (plantilla !== 'estado_actual') return {}
  const [ii, ia, ei, ea] = await Promise.all([
    supabase.from('informe_ingreso').select('*').eq('ingreso_id', ingresoId).maybeSingle(),
    supabase.from('informe_alta').select('*').eq('ingreso_id', ingresoId).maybeSingle(),
    supabase.from('escalas_clinicas').select('*').eq('ingreso_id', ingresoId).eq('momento', 'ingreso').maybeSingle(),
    supabase.from('escalas_clinicas').select('*').eq('ingreso_id', ingresoId).eq('momento', 'alta').maybeSingle(),
  ])
  return camposIniciales(plantilla, {
    informeIngreso: (ii.data as Partial<InformeIngreso>) ?? null,
    informeAlta: (ia.data as Partial<InformeAlta>) ?? null,
    escalaIngreso: (ei.data as EscalaClinica) ?? null,
    escalaAlta: (ea.data as EscalaClinica) ?? null,
  })
}
