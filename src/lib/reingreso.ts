// Informe de ingreso de un REINGRESO: qué se copia del ingreso anterior.
//
//  - Datos estables (antecedentes, alergias, personalidad previa…): se copian tal cual.
//  - Valoración geriátrica integral y tratamiento al ingreso: se copian como
//    punto de partida, pero son del episodio, así que quedan marcados "por
//    revisar" (campos_por_revisar) hasta que alguien los edite o los confirme.
//  - Lo propio del episodio (evolución, situación actual, exploraciones,
//    diagnóstico y plan): no se copia.

import type { FilaMedicacion } from '../types'

// Campos que se copian pero hay que revisar, con el nombre que ve el usuario.
export const CAMPOS_REVISAR: Record<string, string> = {
  vgi_social: 'VGI · Social',
  vgi_funcional: 'VGI · Funcional',
  vgi_cognitivo: 'VGI · Cognitivo',
  vgi_sensorial: 'VGI · Sensorial',
  vgi_nutricional: 'VGI · Nutricional',
  vgi_dolor: 'VGI · Dolor',
  vgi_otros: 'VGI · Otros síndromes geriátricos',
  tratamiento_ingreso_estructurado: 'Tratamiento al ingreso',
}

// Campos del informe anterior que NO se copian (propios de cada episodio o internos).
const NO_COPIAR = new Set([
  'id', 'ingreso_id', 'created_at', 'updated_at', 'version', 'campos_por_revisar',
  'evolucion', 'situacion_cognitivo', 'situacion_conductual', 'situacion_animico',
  'situacion_funcional', 'situacion_social',
  'exploracion_fisica', 'exploracion_neurologica', 'exploracion_psicopatologica', 'exploraciones_complementarias',
  'impresion_diagnostica', 'plan_objetivos', 'plan_medicacion', 'plan_otros_cuidados',
  'barthel', 'lawton',
])

function tieneContenido(v: unknown): boolean {
  if (v == null) return false
  if (typeof v === 'string') return v.trim() !== ''
  if (Array.isArray(v)) return v.some((f) => (typeof f === 'string' ? f.trim() !== '' : (f as FilaMedicacion)?.farmaco?.trim?.() !== ''))
  return true
}

export function informeBaseReingreso(anterior: Record<string, unknown>): Record<string, unknown> {
  const base: Record<string, unknown> = {}
  for (const [k, v] of Object.entries(anterior)) if (!NO_COPIAR.has(k)) base[k] = v
  const porRevisar = Object.keys(CAMPOS_REVISAR).filter((k) => tieneContenido(base[k]))
  // el texto libre antiguo del tratamiento (anterior a la tabla) va con la tabla
  if (tieneContenido(base.tratamiento_ingreso) && !porRevisar.includes('tratamiento_ingreso_estructurado')) {
    porRevisar.push('tratamiento_ingreso_estructurado')
  }
  base.campos_por_revisar = porRevisar
  return base
}
