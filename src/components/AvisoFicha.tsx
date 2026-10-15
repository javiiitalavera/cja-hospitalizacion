// Aviso de una pantalla o ficha: un único aspecto para todos (tamaño, relleno, radio), con cuatro tonos:
//   · «info»: dice algo que conviene saber y no pide hacer nada (solo lectura por rol, episodio cerrado, qué se hereda).
//   · «atencion»: pide atención o decisión (alguien más guardó, sección en construcción, cambios que quedan en Auditoría).
//   · «error»: algo ha fallado (no se pudo cargar o guardar).
//   · «exito»: confirmación de algo que se ha hecho.
// Si lleva una acción (un botón «Reintentar», por ejemplo), va a la derecha. Los mensajes sueltos de una sola línea
// pueden usar directamente las clases «aviso aviso-error» (definidas en index.css), que son las mismas.

import type { ElementType, ReactNode } from 'react'

const TONO = {
  info: 'aviso-info',
  atencion: 'aviso-atencion',
  error: 'aviso-error',
  exito: 'aviso-exito',
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
    <div role={tono === 'error' ? 'alert' : 'note'} className={`aviso ${TONO[tono]} flex items-center gap-2.5 ${className}`} {...resto}>
      {Icono && <Icono aria-hidden className="w-4 h-4 shrink-0" />}
      <div className="min-w-0 flex-1">{children}</div>
      {accion && <div className="shrink-0">{accion}</div>}
    </div>
  )
}
