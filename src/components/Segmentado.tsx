import type { ElementType, ReactNode } from 'react'

// Selector de vistas de una pantalla (Filas/Tarjetas, Cambios/Accesos, Pacientes/Informes, Mañana/Tarde/Noche…).
// Es el ÚNICO estilo para elegir entre varias vistas de la misma pantalla; las pestañas subrayadas quedan para las
// fichas (PestanasFicha). Va justo debajo del encabezado de la pantalla.
export interface OpcionSegmentada<T extends string> {
  clave: T
  etiqueta: ReactNode
  icono?: ElementType<{ className?: string }>
  aviso?: number                 // contador ámbar a la derecha de la etiqueta (pendientes)
  avisoTitulo?: string
  deshabilitada?: boolean
  titulo?: string                // texto al pasar el ratón
}

export function Segmentado<T extends string>({ opciones, valor, onChange, etiqueta, comoPestanas = false, className = '' }: {
  opciones: readonly OpcionSegmentada<T>[]
  valor: T
  onChange: (clave: T) => void
  etiqueta: string               // para lectores de pantalla («Qué consultar», «Vista»…)
  comoPestanas?: boolean         // true si cada opción abre un panel distinto (subpestañas de una ficha)
  className?: string
}) {
  return (
    <div className={`segmentado ${className}`} role={comoPestanas ? 'tablist' : 'group'} aria-label={etiqueta}>
      {opciones.map((o) => {
        const activa = o.clave === valor
        const Icono = o.icono
        return (
          <button
            key={o.clave}
            type="button"
            disabled={o.deshabilitada}
            title={o.titulo}
            onClick={() => { if (!activa && !o.deshabilitada) onChange(o.clave) }}
            {...(comoPestanas ? { role: 'tab', 'aria-selected': activa } : { 'aria-pressed': activa })}
            className={`segmentado-btn ${activa ? 'activo' : ''} ${o.deshabilitada ? 'opacity-50 cursor-not-allowed' : ''}`}
          >
            {Icono && <Icono className="w-3.5 h-3.5" />}
            {o.etiqueta}
            {!!o.aviso && o.aviso > 0 && (
              <span className="min-w-[1.25rem] px-1.5 rounded-full bg-amber-100 text-amber-700 text-xs font-semibold text-center" title={o.avisoTitulo}>
                {o.aviso}
              </span>
            )}
          </button>
        )
      })}
    </div>
  )
}
