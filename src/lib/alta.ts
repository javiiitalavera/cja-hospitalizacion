// Los mismos seis códigos que exige el CMBD (TIPALT) — una sola
// elección del motivo del alta, no dos preguntas separadas por la
// misma cosa. El mapeo a estado del ingreso vive aquí también, para
// que el modal de "Dar de alta" y el CMBD nunca puedan desincronizarse.

export const TIPALT_LABEL: Record<string, string> = {
  '1': 'Domicilio',
  '2': 'Traslado a otro hospital',
  '3': 'Alta voluntaria',
  '4': 'Éxitus',
  '5': 'Traslado a centro sociosanitario',
  '9': 'Otras circunstancias / fuga / desconocido',
}

export function estadoSegunCircunstancia(codigo: string): 'alta' | 'alta_traslado' | 'exitus' | null {
  if (codigo === '1' || codigo === '3' || codigo === '9') return 'alta'
  if (codigo === '2' || codigo === '5') return 'alta_traslado'
  if (codigo === '4') return 'exitus'
  return null
}
