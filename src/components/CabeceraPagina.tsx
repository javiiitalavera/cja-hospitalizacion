import type { ReactNode } from 'react'
import { ChevronLeft } from 'lucide-react'

// Cabecera de todas las pantallas: título, una línea que explica qué es la pantalla y, a la derecha,
// sus botones. Un único sitio para que todas se vean igual.
//
// Orden de los botones (siempre el mismo): primero los de apoyo (Actualizar, Histórico, Imprimir…) y, a la derecha del
// todo, la acción principal de la pantalla (la única en azul, si la hay).
export function CabeceraPagina({ titulo, subtitulo, children, className = '', onVolver }: {
  titulo: string
  subtitulo?: ReactNode
  children?: ReactNode            // acciones (botones, filtros) a la derecha
  className?: string
  onVolver?: () => void           // flecha «atrás» a la izquierda del título (pantallas de formulario)
}) {
  return (
    <div className={`flex items-start justify-between gap-3 flex-wrap mb-6 ${className}`}>
      <div className="min-w-0 flex items-start gap-3">
        {onVolver && (
          <button type="button" onClick={onVolver} aria-label="Volver" className="text-slate-500 hover:text-slate-700 p-1 -ml-1 mt-0.5">
            <ChevronLeft className="w-5 h-5" />
          </button>
        )}
        <div className="min-w-0">
          <h1 className="text-2xl font-bold text-slate-800">{titulo}</h1>
          {subtitulo && <p className="text-sm text-slate-500 mt-0.5">{subtitulo}</p>}
        </div>
      </div>
      {children && <div className="flex items-center gap-2 flex-wrap ml-auto">{children}</div>}
    </div>
  )
}
