// Filas y celdas «clicables». Navegar o abrir algo desde el teclado exige un enlace o un botón de verdad, así que en
// cada fila hay uno dentro de la celda principal (el nombre, normalmente). Pulsar en cualquier otra parte de la fila
// sigue haciendo lo mismo, pero solo como comodidad para el ratón: esta función evita que, al pulsar el enlace o el
// botón de dentro, la acción se ejecute dos veces (el clic sube hasta la fila).

import type { MouseEvent } from 'react'

const CONTROLES = 'a,button,input,select,textarea,label,summary,[role="button"]'

export function atajoDeRaton(accion: () => void) {
  return (e: MouseEvent) => {
    if ((e.target as HTMLElement).closest(CONTROLES)) return
    accion()
  }
}

// Clases del anillo de foco de los enlaces y botones que van dentro de una celda.
export const FOCO_CELDA = 'focus:outline-none focus-visible:ring-2 focus-visible:ring-primary-400 rounded'
