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
