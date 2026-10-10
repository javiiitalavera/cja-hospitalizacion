import type { ReactNode } from 'react'

// Cabecera de todas las pantallas: título, una línea que explica qué es la pantalla y, a la derecha,
// sus botones. Un único sitio para que todas se vean igual.
export function CabeceraPagina({ titulo, subtitulo, children, className = '' }: {
  titulo: string
  subtitulo?: ReactNode
  children?: ReactNode            // acciones (botones, filtros) a la derecha
  className?: string
}) {
  return (
    <div className={`flex items-start justify-between gap-3 flex-wrap mb-6 ${className}`}>
      <div className="min-w-0">
        <h1 className="text-2xl font-bold text-slate-800">{titulo}</h1>
        {subtitulo && <p className="text-sm text-slate-500 mt-0.5">{subtitulo}</p>}
      </div>
      {children && <div className="flex items-center gap-2 flex-wrap">{children}</div>}
    </div>
  )
}
