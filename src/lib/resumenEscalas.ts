// Texto que resume las escalas calculadas, para insertar en los campos de la
// valoración geriátrica integral del informe de ingreso. Solo las escalas del
// INGRESO: las del alta no se insertan en ningún campo (van en su tabla).

import type { EscalaClinica } from '../types/escalas'

export function textoEscalasFuncional(e: EscalaClinica | null | undefined): string {
  if (!e) return ''
  const p: string[] = []
  if (e.barthel_total != null) p.push(`Índice de Barthel: ${e.barthel_total}/100`)
  if (e.lawton_total != null) p.push(`Índice de Lawton: ${e.lawton_total}/8`)
  return p.join('. ') + (p.length ? '.' : '')
}

export function textoEscalasCognitivo(e: EscalaClinica | null | undefined): string {
  if (!e) return ''
  const p: string[] = []
  if (e.gds_estadio) p.push(`GDS ${e.gds_estadio}`)
  if (e.fast_estadio) p.push(`FAST ${e.fast_estadio}`)
  return p.join(' · ')
}

// Añade `resumen` al final del texto actual (en otra línea), salvo que ya esté.
export function añadirResumen(actual: string | null | undefined, resumen: string): string {
  const base = (actual ?? '').trimEnd()
  if (!resumen || base.includes(resumen)) return actual ?? ''
  return base ? `${base}\n${resumen}` : resumen
}
