// Estado de un ingreso (Ingresado, Alta, Traslado, Éxitus) como punto de color + texto, en vez de una píldora rellena.
// El punto lleva el color; el texto siempre va en gris oscuro, así que la lista se lee de un vistazo sin parecer un árbol de Navidad.

import type { ReactNode } from 'react'
import { ESTADO_INGRESO_LABEL, ESTADO_INGRESO_PUNTO } from '../types'

export function EstadoIngreso({ estado, children, className = '' }: {
  estado: string
  children?: ReactNode          // texto a mostrar; por defecto, la etiqueta del estado
  className?: string
}) {
  return (
    <span className={`inline-flex items-center gap-1.5 font-medium text-slate-700 ${className}`}>
      <span aria-hidden className={`w-2 h-2 rounded-full shrink-0 ${ESTADO_INGRESO_PUNTO[estado] ?? 'bg-slate-400'}`} />
      {children ?? ESTADO_INGRESO_LABEL[estado] ?? estado}
    </span>
  )
}
