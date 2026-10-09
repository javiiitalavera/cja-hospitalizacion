import { AlertCircle, Check } from 'lucide-react'

// Aviso flotante de guardado. El indicador de arriba del informe se queda fuera de la pantalla
// en cuanto se baja a rellenar el final (o a pulsar «Guardar ahora»), así que el aviso va fijo
// en la esquina de la pantalla. Solo aparece al terminar un guardado (o si falla): el estado
// vuelve solo a «inactivo» a los pocos segundos y el aviso desaparece.
export type EstadoAviso = 'inactivo' | 'pendiente' | 'guardando' | 'guardado' | 'error' | 'conflicto'

export function AvisoGuardado({ avisos }: {
  avisos: { estado: EstadoAviso; etiqueta: string; texto?: string; error?: string }[]
}) {
  const visibles = avisos.filter((a) => a.estado === 'guardado' || a.estado === 'error')
  if (visibles.length === 0) return null
  return (
    <div className="fixed bottom-5 right-5 z-[70] flex flex-col items-end gap-2 pointer-events-none" role="status" aria-live="polite">
      {visibles.map((a) => a.estado === 'guardado' ? (
        <div key={a.etiqueta} className="flex items-center gap-2 bg-emerald-600 text-white text-sm font-medium rounded-lg shadow-lg px-4 py-2.5">
          <Check className="w-4 h-4" /> {a.texto ?? `${a.etiqueta} guardado`}
        </div>
      ) : (
        <div key={a.etiqueta} className="flex items-center gap-2 bg-red-600 text-white text-sm font-medium rounded-lg shadow-lg px-4 py-2.5">
          <AlertCircle className="w-4 h-4 shrink-0" /> No se ha podido guardar ({a.etiqueta.toLowerCase()}){a.error ? `: ${a.error}` : ' — comprueba la conexión'}
        </div>
      ))}
    </div>
  )
}
