import { useEffect, type ElementType, type ReactNode } from 'react'

// Pestañas subrayadas de una ficha (paciente, ingreso): van pegadas al borde inferior de la cabecera de la ficha.
// En pantallas estrechas se desplazan de lado y la pestaña activa se mantiene a la vista.
// (Para elegir entre vistas de una pantalla normal se usa Segmentado, no esto.)
export interface PestanaFicha {
  id: string
  label: string
  icon: ElementType<{ className?: string }>
  extra?: ReactNode              // p. ej. la etiqueta «en construcción»
}

export function PestanasFicha({ pestanas, activa, onChange }: {
  pestanas: readonly PestanaFicha[]
  activa: string
  onChange: (id: string) => void
}) {
  useEffect(() => {
    document.querySelector('[data-pestanas-ficha] [aria-selected="true"]')?.scrollIntoView?.({ block: 'nearest', inline: 'nearest' })
  }, [activa])
  return (
    <div className="flex gap-1 mt-4 -mb-4 pestanas-scroll" role="tablist" data-pestanas-ficha>
      {pestanas.map(({ id, label, icon: Icon, extra }) => (
        <button
          key={id}
          type="button"
          role="tab"
          aria-selected={activa === id}
          onClick={() => onChange(id)}
          className={`flex items-center gap-1.5 px-4 py-2.5 text-sm font-medium border-b-2 transition-colors shrink-0 whitespace-nowrap ${
            activa === id ? 'border-primary-600 text-primary-700' : 'border-transparent text-slate-500 hover:text-slate-700'
          }`}
        >
          <Icon className="w-3.5 h-3.5" />
          {label}
          {extra}
        </button>
      ))}
    </div>
  )
}
