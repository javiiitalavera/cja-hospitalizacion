// Escrituras de la pauta de cuidados (indicaciones y vía). Las comparten la ficha del paciente y las
// Hojas de turno, para que las dos hagan exactamente lo mismo. Devuelven el mensaje de error, o null si fue bien.

import { supabase } from '../../lib/supabase'
import type { IndicacionCuidado, Turno, ViaPaciente } from '../../types/pautaCuidados'

const COLUMNAS = 'id, ingreso_id, texto, turnos, created_at'

export async function anadirIndicacion(
  ingresoId: string, texto: string, turnos: Turno[],
): Promise<{ indicacion: IndicacionCuidado | null; error: string | null }> {
  const { data, error } = await supabase.from('pauta_cuidados')
    .insert({ ingreso_id: ingresoId, texto, turnos }).select(COLUMNAS).single()
  return { indicacion: error ? null : (data as IndicacionCuidado), error: error?.message ?? null }
}

export async function cambiarIndicacion(id: string, cambios: { texto?: string; turnos?: Turno[] }): Promise<string | null> {
  const { error } = await supabase.from('pauta_cuidados').update(cambios).eq('id', id)
  return error?.message ?? null
}

export const cambiarTextoIndicacion = (id: string, texto: string) => cambiarIndicacion(id, { texto })
export const cambiarTurnosIndicacion = (id: string, turnos: Turno[]) => cambiarIndicacion(id, { turnos })

export async function borrarIndicacion(id: string): Promise<string | null> {
  const { error } = await supabase.from('pauta_cuidados').delete().eq('id', id)
  return error?.message ?? null
}

// Sin vía = se borra la fila.
export async function guardarVia(ingresoId: string, via: ViaPaciente | null): Promise<string | null> {
  const { error } = via
    ? await supabase.from('pauta_via').upsert({ ingreso_id: ingresoId, via }, { onConflict: 'ingreso_id' })
    : await supabase.from('pauta_via').delete().eq('ingreso_id', ingresoId)
  return error?.message ?? null
}
