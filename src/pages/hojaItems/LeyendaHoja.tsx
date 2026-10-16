// Botón «Leyenda» de la Hoja de ítems: abre una ventana con lo que significa cada abreviatura de la hoja.
// Solo existe en pantalla; la impresión se genera aparte (imprimir.ts) y no la incluye. Se cierra al pulsar fuera,
// con Escape o volviendo a pulsar el botón. Sale en un portal con posición fija para que no la recorte nada.

import { useCallback, useEffect, useId, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { BookOpen, X } from 'lucide-react'
import { LEYENDA_HOJA } from './constantes'

const MARGEN = 8
const ANCHO_MAX = 640

export default function LeyendaHoja() {
  const id = useId()
  const boton = useRef<HTMLButtonElement>(null)
  const ventana = useRef<HTMLDivElement>(null)
  const [abierta, setAbierta] = useState(false)
  const [pos, setPos] = useState<{ top: number; left: number; ancho: number; alto: number } | null>(null)

  const calcular = useCallback(() => {
    const b = boton.current
    if (!b) return
    const r = b.getBoundingClientRect()
    const ancho = Math.min(ANCHO_MAX, window.innerWidth - MARGEN * 2)
    const left = Math.min(Math.max(MARGEN, r.right - ancho), window.innerWidth - ancho - MARGEN)
    const top = r.bottom + 6
    setPos({ top, left, ancho, alto: Math.max(160, window.innerHeight - top - MARGEN) })
  }, [])

  const alternar = () => {
    if (abierta) { setAbierta(false); return }
    calcular()
    setAbierta(true)
  }

  useEffect(() => {
    if (!abierta) return
    const fuera = (e: Event) => {
      const t = e.target as Node
      if (boton.current?.contains(t) || ventana.current?.contains(t)) return
      setAbierta(false)
    }
    const tecla = (e: KeyboardEvent) => { if (e.key === 'Escape') { setAbierta(false); boton.current?.focus() } }
    window.addEventListener('resize', calcular)
    document.addEventListener('mousedown', fuera)
    document.addEventListener('touchstart', fuera)
    document.addEventListener('keydown', tecla)
    return () => {
      window.removeEventListener('resize', calcular)
      document.removeEventListener('mousedown', fuera)
      document.removeEventListener('touchstart', fuera)
      document.removeEventListener('keydown', tecla)
    }
  }, [abierta, calcular])

  return (
    <>
      <button
        ref={boton}
        type="button"
        data-leyenda-hoja
        aria-expanded={abierta}
        aria-controls={abierta ? id : undefined}
        onClick={alternar}
        className={`btn-secondary ${abierta ? 'bg-slate-100' : ''}`}
      >
        <BookOpen className="w-4 h-4" aria-hidden="true" />
        Leyenda
      </button>
      {abierta && pos && createPortal(
        <div
          ref={ventana}
          id={id}
          role="dialog"
          aria-label="Leyenda de la hoja de ítems"
          data-leyenda-ventana
          style={{ position: 'fixed', top: pos.top, left: pos.left, width: pos.ancho, maxHeight: pos.alto, zIndex: 60 }}
          className="bg-white border border-slate-200 shadow-lg rounded-lg p-4 text-xs text-slate-700 overflow-y-auto"
        >
          <div className="flex items-start justify-between gap-3 mb-3">
            <div>
              <p className="text-sm font-semibold text-slate-800">Leyenda de la hoja</p>
              <p className="text-slate-500">Qué significa cada abreviatura. No se imprime.</p>
            </div>
            <button type="button" onClick={() => setAbierta(false)} aria-label="Cerrar la leyenda" className="p-1 -m-1 text-slate-400 hover:text-slate-600">
              <X className="w-4 h-4" aria-hidden="true" />
            </button>
          </div>
          <div className="grid gap-x-6 gap-y-3 sm:grid-cols-2">
            {LEYENDA_HOJA.map((g) => (
              <section key={g.titulo} className="break-inside-avoid">
                <h3 className="font-semibold text-slate-500 mb-1">{g.titulo}</h3>
                <dl className="space-y-0.5">
                  {g.items.map((it) => (
                    <div key={g.titulo + it.codigo} className="flex gap-2">
                      <dt className="font-mono font-semibold text-slate-800 shrink-0 min-w-[3.25rem]">{it.codigo}</dt>
                      <dd>{it.significado}</dd>
                    </div>
                  ))}
                </dl>
                {g.nota && <p className="text-slate-500 mt-1">{g.nota}</p>}
              </section>
            ))}
          </div>
        </div>,
        document.body,
      )}
    </>
  )
}
