// ¿Tiene contenido un informe? Un único sitio para la pantalla Informes y
// para los avisos de Inicio, de modo que "sin iniciar" signifique lo mismo
// en las dos.

// Los campos que no cuentan como "contenido" al decidir si un informe
// está sin empezar o no — todo lo demás que devuelva la consulta sí.
const CAMPOS_NO_CONTENIDO = new Set(['id', 'ingreso_id', 'version', 'created_at', 'updated_at', 'ingreso', 'campos_por_revisar'])

export function estaVacio(fila: Record<string, unknown>): boolean {
  return Object.entries(fila).every(([clave, valor]) => {
    if (CAMPOS_NO_CONTENIDO.has(clave)) return true
    if (valor == null) return true
    if (typeof valor === 'string') return valor.trim() === ''
    if (Array.isArray(valor)) return valor.length === 0
    return false
  })
}
