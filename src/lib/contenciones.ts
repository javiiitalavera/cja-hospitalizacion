import { supabase } from './supabase'

export interface ContencionResumen {
  dia: string | null
  noche: string[] | null
}

// "Dame el mapa ingreso_id -> contención para esta lista de
// ingresos" — esta misma consulta y el mismo bucle de armar el mapa
// estaban copiados, casi letra por letra, en Inicio y en Hoja de
// Ítems. Unificado aquí para que un cambio futuro (un campo más, una
// condición distinta) solo haya que hacerlo una vez.
//
// La página de Incidencias NO usa esto: su consulta parte al revés,
// desde la propia tabla de contenciones, no desde una lista de
// ingresos ya conocida — forzarla a esta misma forma habría
// complicado más de lo que habría simplificado.
export async function fetchContencionesPorIngreso(
  ids: string[]
): Promise<{ mapa: Record<string, ContencionResumen>; error: string | null }> {
  if (ids.length === 0) return { mapa: {}, error: null }

  const { data, error } = await supabase
    .from('contenciones')
    .select('ingreso_id, dia, noche')
    .in('ingreso_id', ids)

  if (error) return { mapa: {}, error: error.message }

  const mapa: Record<string, ContencionResumen> = {}
  ;(data ?? []).forEach((c: any) => {
    mapa[c.ingreso_id] = { dia: c.dia, noche: c.noche }
  })
  return { mapa, error: null }
}
