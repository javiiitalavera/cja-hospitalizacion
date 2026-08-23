// Prepara un texto de búsqueda para usarlo dentro de un filtro
// .or(...ilike...) de PostgREST/Supabase.
//
// Sin esto, un texto con comas o paréntesis (p. ej. "Sánchez (Juan)")
// rompe la sintaxis del filtro .or(), y "100%" se interpretaría con el
// "%" como comodín de ILIKE en vez de cómo texto literal.
//
// La documentación de PostgREST indica que un valor con caracteres
// reservados debe envolverse entre comillas dobles, escapando dentro
// cualquier barra invertida o comilla doble que el propio texto tenga.
export function escaparBusquedaIlike(q: string): string {
  const escapado = q.replace(/\\/g, '\\\\').replace(/"/g, '\\"')
  return `"%${escapado}%"`
}

// Quita tildes/diacríticos de un texto ("González" -> "Gonzalez"),
// para buscar sin que importe si el usuario escribió la tilde o no.
// Debe dar el mismo resultado que unaccent() en PostgreSQL, porque se
// compara contra columnas ya normalizadas del mismo modo en la base
// de datos — si un lado quita tildes y el otro no, la búsqueda deja
// de encontrar coincidencias en uno de los dos sentidos.
export function quitarTildes(q: string): string {
  return q.normalize('NFD').replace(/[\u0300-\u036f]/g, '')
}
