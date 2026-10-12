// Aviso de la ficha del paciente: un único aspecto para todos (antes había cuatro: ámbar grande, ámbar pequeño, azul
// pequeño y uno a todo el ancho). Solo hay dos tonos:
//   · «info»: dice algo que conviene saber y no pide hacer nada (solo lectura por rol, episodio cerrado, qué se hereda).
//   · «atencion»: pide atención o decisión (alguien más guardó, sección en construcción, cambios que quedan en Auditoría).
// Mismo tamaño de letra, mismo relleno y mismo radio. Si lleva una acción (un botón), va a la derecha.

import type { ElementType, ReactNode } from 'react'

const TONO = {
  info: 'bg-slate-100 border-slate-200 text-slate-700',
  atencion: 'bg-amber-50 border-amber-200 text-amber-800',
} as const

export function AvisoFicha({ tono = 'info', icono: Icono, accion, children, className = '', ...resto }: {
  tono?: keyof typeof TONO
  icono?: ElementType<{ className?: string; 'aria-hidden'?: boolean }>
  accion?: ReactNode
  children: ReactNode
  className?: string
  'data-testid'?: string
}) {
  return (
    <div role="note" className={`flex items-center gap-2.5 text-sm leading-snug rounded-lg border px-4 py-2.5 ${TONO[tono]} ${className}`} {...resto}>
      {Icono && <Icono aria-hidden className="w-4 h-4 shrink-0" />}
      <div className="min-w-0 flex-1">{children}</div>
      {accion && <div className="shrink-0">{accion}</div>}
    </div>
  )
}
