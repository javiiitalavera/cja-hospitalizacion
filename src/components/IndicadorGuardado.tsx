// Indicador de guardado único para toda la aplicación. Antes cada pantalla decía una cosa distinta («Error al
// guardar», «✗ Error al guardar», «No se ha podido guardar»…) y era difícil saber si lo escrito estaba a salvo.
// Ahora solo hay cuatro estados, con las mismas palabras y la misma forma en todas partes:
//   Cambios sin guardar → Guardando → Guardado        (y, si falla, «No se pudo guardar»)
// Sirve igual para el guardado manual (botón), el automático (a los segundos de dejar de escribir) y el inmediato
// (al pulsar o al salir del campo): lo que cambia es cuándo se pasa de «pendiente» a «guardando», no cómo se dice.

import { AlertCircle, Check } from 'lucide-react'

export type EstadoGuardadoValor = 'inactivo' | 'pendiente' | 'guardando' | 'guardado' | 'error' | 'conflicto'

export const TEXTO_PENDIENTE = 'Cambios sin guardar'
export const TEXTO_GUARDANDO = 'Guardando'
export const TEXTO_GUARDADO = 'Guardado'
export const TEXTO_ERROR = 'No se pudo guardar'

export function IndicadorGuardado({ estado, detalle, className = '' }: {
  estado: EstadoGuardadoValor
  // Motivo del fallo (si se conoce); si no, se sugiere revisar la conexión.
  detalle?: string
  className?: string
}) {
  // El conflicto se explica con su propio aviso ámbar (con el botón «Ver lo más reciente»); aquí no se pinta nada.
  let contenido: React.ReactNode = null
  if (estado === 'inactivo' || estado === 'conflicto') {
    contenido = null
  } else if (estado === 'pendiente') {
    contenido = <><span aria-hidden className="w-1.5 h-1.5 rounded-full bg-slate-400" />{TEXTO_PENDIENTE}</>
  } else if (estado === 'guardando') {
    contenido = <><span aria-hidden className="w-1.5 h-1.5 rounded-full bg-amber-400 animate-pulse" />{TEXTO_GUARDANDO}</>
  } else if (estado === 'guardado') {
    contenido = <span className="inline-flex items-center gap-1 text-emerald-700"><Check aria-hidden className="w-3.5 h-3.5" />{TEXTO_GUARDADO}</span>
  } else {
    contenido = (
      <span className="inline-flex items-center gap-1 text-red-600 font-semibold">
        <AlertCircle aria-hidden className="w-3.5 h-3.5 shrink-0" />{TEXTO_ERROR}
        <span className="font-normal">· {detalle || 'comprueba la conexión'}</span>
      </span>
    )
  }
  return (
    <span role="status" aria-live="polite" data-estado-guardado={estado} className={`inline-flex items-center gap-1.5 text-xs text-slate-500 ${className}`}>
      {contenido}
    </span>
  )
}
