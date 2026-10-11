// Escrituras de la pauta de cuidados (indicaciones y vía). Las comparten la ficha del paciente y las
// Hojas de turno, para que las dos hagan exactamente lo mismo.
//
// Dos enfermeras pueden tener abierta la misma pauta: cada cambio se guarda solo si la fila sigue como se vio al
// cargarla (marca `updated_at` del servidor). Si alguien la tocó entre medias, no se pisa: se avisa con `conflicto`.

import { supabase } from '../../lib/supabase'
import type { IndicacionCuidado, Turno, ViaPaciente } from '../../types/pautaCuidados'

const COLUMNAS = 'id, ingreso_id, texto, turnos, created_at, updated_at'

export const MENSAJE_CONFLICTO_PAUTA =
  'Otra persona ha cambiado esta pauta mientras la tenías abierta, así que no se ha guardado tu cambio. Se ha cargado la versión actual: revísala y repite el cambio si sigue haciendo falta.'

export interface ResultadoPauta {
  error: string | null
  conflicto?: boolean
  actualizada?: string | null   // nueva marca `updated_at` de la fila tras guardar (null si ya no existe)
}

export async function anadirIndicacion(
  ingresoId: string, texto: string, turnos: Turno[],
): Promise<{ indicacion: IndicacionCuidado | null; error: string | null }> {
  const { data, error } = await supabase.from('pauta_cuidados')
    .insert({ ingreso_id: ingresoId, texto, turnos }).select(COLUMNAS).single()
  return { indicacion: error ? null : (data as IndicacionCuidado), error: error?.message ?? null }
}

// `base` = la marca `updated_at` que tenía la indicación al cargarla.
export async function cambiarIndicacion(
  id: string, cambios: { texto?: string; turnos?: Turno[] }, base: string | null | undefined,
): Promise<ResultadoPauta> {
  let q = supabase.from('pauta_cuidados').update(cambios).eq('id', id)
  q = base ? q.eq('updated_at', base) : q
  const { data, error } = await q.select('id, updated_at')
  if (error) return { error: error.message }
  if (!data || data.length === 0) return { error: MENSAJE_CONFLICTO_PAUTA, conflicto: true }
  return { error: null, actualizada: data[0].updated_at }
}

export async function borrarIndicacion(id: string, base: string | null | undefined): Promise<ResultadoPauta> {
  let q = supabase.from('pauta_cuidados').delete().eq('id', id)
  q = base ? q.eq('updated_at', base) : q
  const { data, error } = await q.select('id')
  if (error) return { error: error.message }
  if (!data || data.length === 0) return { error: MENSAJE_CONFLICTO_PAUTA, conflicto: true }
  return { error: null }
}

// Sin vía = se borra la fila. `base` = marca `updated_at` de la fila al cargarla (null si no había vía).
export async function guardarVia(
  ingresoId: string, via: ViaPaciente | null, base: string | null | undefined,
): Promise<ResultadoPauta> {
  if (!via) {
    if (!base) return { error: null, actualizada: null }
    const { data, error } = await supabase.from('pauta_via').delete()
      .eq('ingreso_id', ingresoId).eq('updated_at', base).select('id')
    if (error) return { error: error.message }
    if (!data || data.length === 0) return { error: MENSAJE_CONFLICTO_PAUTA, conflicto: true }
    return { error: null, actualizada: null }
  }
  if (!base) {
    // No había vía al cargar: se crea. Si otra persona la creó justo antes (ingreso_id es único), es un conflicto.
    const { data, error } = await supabase.from('pauta_via')
      .insert({ ingreso_id: ingresoId, via }).select('updated_at').single()
    if (error) return error.code === '23505' ? { error: MENSAJE_CONFLICTO_PAUTA, conflicto: true } : { error: error.message }
    return { error: null, actualizada: data.updated_at }
  }
  const { data, error } = await supabase.from('pauta_via').update({ via })
    .eq('ingreso_id', ingresoId).eq('updated_at', base).select('updated_at')
  if (error) return { error: error.message }
  if (!data || data.length === 0) return { error: MENSAJE_CONFLICTO_PAUTA, conflicto: true }
  return { error: null, actualizada: data[0].updated_at }
}
