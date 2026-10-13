import { useEffect, useRef, useState } from 'react'
import { useAvisoSalida } from '../lib/avisoSalida'
import { AlertCircle } from 'lucide-react'
import { TEXTO_ERROR, type EstadoGuardadoValor } from './IndicadorGuardado'

// Protección al salir + aviso de fallo. Ya no hay aviso verde de «Guardado»: cada pantalla enseña su estado con el
// indicador de siempre («Cambios sin guardar», «Guardando», «Guardado», «No se pudo guardar»). Lo único que sigue
// saliendo flotante es el fallo de guardado, porque el indicador puede quedar fuera de la pantalla y un cambio que no
// se ha guardado no puede pasar desapercibido.
export type EstadoAviso = 'inactivo' | 'pendiente' | 'guardando' | 'guardado' | 'error' | 'conflicto'

export function AvisoGuardado({ avisos }: {
  avisos: { estado: EstadoAviso; etiqueta: string; texto?: string; error?: string }[]
}) {
  // Protección al salir: mientras haya cambios sin guardar (pendientes del guardado automático, en
  // curso, con error o en conflicto), cerrar o recargar la pestaña pide confirmación. Sin esto, lo
  // escrito en el último segundo y medio antes de recargar se perdía sin aviso.
  const hayCambiosSinGuardar = avisos.some((a) => a.estado === 'pendiente' || a.estado === 'guardando' || a.estado === 'error' || a.estado === 'conflicto')
  useAvisoSalida(hayCambiosSinGuardar)

  const visibles = avisos.filter((a) => a.estado === 'error')
  if (visibles.length === 0) return null
  return (
    <div className="fixed bottom-5 right-5 z-[70] flex flex-col items-end gap-2 pointer-events-none" role="status" aria-live="polite">
      {visibles.map((a) => (
        <div key={a.etiqueta} className="flex items-center gap-2 bg-red-600 text-white text-sm font-medium rounded-lg shadow-lg px-4 py-2.5">
          <AlertCircle aria-hidden className="w-4 h-4 shrink-0" /> {TEXTO_ERROR} · {a.etiqueta}: {a.error || 'comprueba la conexión'}
        </div>
      ))}
    </div>
  )
}

// Para las pantallas que guardan con un clic (indicaciones, vías, aislamiento…): lleva el estado del último guardado
// para pintarlo con <IndicadorGuardado estado={estado} detalle={error} />. `empezar` al lanzar el guardado, `guardado`
// al terminar bien y `fallo` (con el motivo) si falla. El «Guardado» se apaga solo; el fallo se queda un rato más.
export function useAvisoGuardado(etiqueta: string, texto?: string) {
  const [aviso, setAviso] = useState<{ estado: EstadoAviso; error?: string }>({ estado: 'inactivo' })
  const temporizador = useRef<ReturnType<typeof setTimeout> | null>(null)
  useEffect(() => () => { if (temporizador.current) clearTimeout(temporizador.current) }, [])
  function mostrar(estado: EstadoAviso, error?: string) {
    if (temporizador.current) clearTimeout(temporizador.current)
    setAviso({ estado, error })
    if (estado === 'guardado' || estado === 'error') {
      temporizador.current = setTimeout(() => setAviso({ estado: 'inactivo' }), estado === 'error' ? 7000 : 2500)
    }
  }
  return {
    avisos: [{ estado: aviso.estado, etiqueta, texto, error: aviso.error }],
    estado: aviso.estado as EstadoGuardadoValor,
    error: aviso.error,
    empezar: () => mostrar('guardando'),
    guardado: () => mostrar('guardado'),
    fallo: (mensaje: string) => mostrar('error', mensaje),
  }
}
