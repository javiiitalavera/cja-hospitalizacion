import { supabase } from './supabase'

export interface ContencionResumen {
  dia: string | null
  noche: string[] | null
  // Necesario para saber si hace falta avisar de "pendiente de
  // confirmar" — la severidad sola no basta, también hay que saber
  // si ya la confirmó un médico.
  confirmado_por_id: string | null
}

// "Dame el mapa ingreso_id -> contención para esta lista de
// ingresos" — esta misma consulta y el mismo bucle de armar el mapa
// estaban copiados, casi letra por letra, en Inicio y en Hoja de
// Ítems. Un único sitio que lo hace, para que un cambio futuro (por
// ejemplo, un campo nuevo que haga falta) no se quede aplicado en
// una pantalla y olvidado en la otra.
export async function fetchContencionesPorIngreso(
  ids: string[]
): Promise<{ mapa: Record<string, ContencionResumen>; error: string | null }> {
  if (ids.length === 0) return { mapa: {}, error: null }

  const { data, error } = await supabase
    .from('contenciones')
    .select('ingreso_id, dia, noche, confirmado_por_id')
    .in('ingreso_id', ids)

  if (error) return { mapa: {}, error: error.message }

  const mapa: Record<string, ContencionResumen> = {}
  ;(data ?? []).forEach((c: any) => {
    mapa[c.ingreso_id] = { dia: c.dia, noche: c.noche, confirmado_por_id: c.confirmado_por_id }
  })

  return { mapa, error: null }
}
