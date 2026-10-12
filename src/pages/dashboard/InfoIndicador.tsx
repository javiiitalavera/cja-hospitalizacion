// Icono «i» que explica cómo se calcula un indicador: qué cuenta, la fórmula y qué conviene tener en cuenta.
// Se abre al pasar el ratón por encima o al pulsarlo (con teclado: Intro o Espacio); al pulsar queda fijo hasta que se
// vuelve a pulsar, se pulsa fuera o se da a Escape. Funciona igual con el dedo. No usa el `title` del navegador (no se
// puede usar con teclado ni con el móvil). La ventana sale en un portal con posición fija: así no la recortan las
// tarjetas ni las tablas con desplazamiento.

import { useCallback, useEffect, useId, useLayoutEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { Info } from 'lucide-react'
import { DEFINICIONES, type ClaveDefinicion } from './definiciones'

const ANCHO_MAX = 340   // px
const MARGEN = 8        // px respecto al borde de la pantalla

export default function InfoIndicador({ clave }: { clave: ClaveDefinicion }) {
  const def = DEFINICIONES[clave]
  const id = useId()
  const boton = useRef<HTMLButtonElement>(null)
  const ventana = useRef<HTMLDivElement>(null)
  const retraso = useRef<number | undefined>(undefined)
  const [fijado, setFijado] = useState(false)
  const [encima, setEncima] = useState(false)
  const [pos, setPos] = useState<{ left: number; ancho: number; abajo: number; arriba: number } | null>(null)
  const visible = fijado || encima

  const calcular = useCallback(() => {
    const b = boton.current
    if (!b) return
    const r = b.getBoundingClientRect()
    const ancho = Math.min(ANCHO_MAX, window.innerWidth - MARGEN * 2)
    const left = Math.min(Math.max(MARGEN, r.left + r.width / 2 - ancho / 2), window.innerWidth - ancho - MARGEN)
    setPos({ left, ancho, abajo: r.bottom + 6, arriba: r.top - 6 })
  }, [])

  const cerrar = useCallback(() => { setFijado(false); setEncima(false) }, [])

  // Posición: debajo del icono; si no cabe y arriba sí, encima.
  useLayoutEffect(() => {
    if (!visible) { setPos(null); return }
    calcular()
  }, [visible, calcular])

  useLayoutEffect(() => {
    const el = ventana.current
    if (!visible || !pos || !el) return
    const alto = el.offsetHeight
    const cabeAbajo = pos.abajo + alto <= window.innerHeight - MARGEN
    el.style.top = `${cabeAbajo || pos.arriba - alto < MARGEN ? pos.abajo : pos.arriba - alto}px`
  }, [visible, pos])

  useEffect(() => {
    if (!visible) return
    const reposicionar = () => calcular()
    const fuera = (e: Event) => {
      const t = e.target as Node
      if (boton.current?.contains(t) || ventana.current?.contains(t)) return
      cerrar()
    }
    const tecla = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return
      cerrar()
      boton.current?.focus()
    }
    window.addEventListener('scroll', reposicionar, true)
    window.addEventListener('resize', reposicionar)
    document.addEventListener('mousedown', fuera)
    document.addEventListener('touchstart', fuera)
    document.addEventListener('keydown', tecla)
    return () => {
      window.removeEventListener('scroll', reposicionar, true)
      window.removeEventListener('resize', reposicionar)
      document.removeEventListener('mousedown', fuera)
      document.removeEventListener('touchstart', fuera)
      document.removeEventListener('keydown', tecla)
    }
  }, [visible, calcular, cerrar])

  useEffect(() => () => window.clearTimeout(retraso.current), [])

  // El ratón puede pasar del icono a la ventana sin que se cierre.
  // Solo con ratón de verdad: en pantallas táctiles el «pasar por encima» que simula el navegador deja la ventana abierta.
  const entrar = (e: React.PointerEvent) => {
    if (e.pointerType !== 'mouse') return
    window.clearTimeout(retraso.current); setEncima(true)
  }
  const salir = (e: React.PointerEvent) => {
    if (e.pointerType !== 'mouse') return
    window.clearTimeout(retraso.current); retraso.current = window.setTimeout(() => setEncima(false), 160)
  }

  return (
    <>
      <button
        ref={boton}
        type="button"
        data-info={clave}
        aria-label={`Cómo se calcula: ${def.titulo}`}
        aria-expanded={visible}
        aria-controls={visible ? id : undefined}
        onClick={(e) => {
          e.stopPropagation()
          if (fijado) cerrar()
          else setFijado(true)
        }}
        onPointerEnter={entrar}
        onPointerLeave={salir}
        className="inline-flex items-center justify-center w-5 h-5 -m-0.5 rounded-full align-middle text-slate-400 hover:text-primary-600 focus-visible:text-primary-600 focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary-500 shrink-0 cursor-help"
      >
        <Info className="w-3.5 h-3.5" aria-hidden="true" />
      </button>
      {visible && pos && createPortal(
        <div
          ref={ventana}
          id={id}
          role="dialog"
          aria-label={`Cómo se calcula: ${def.titulo}`}
          data-info-ventana={clave}
          tabIndex={-1}
          onPointerEnter={entrar}
          onPointerLeave={salir}
          style={{ position: 'fixed', left: pos.left, top: pos.abajo, width: pos.ancho, zIndex: 60 }}
          className="bg-white border border-slate-200 shadow-lg rounded-lg p-3 text-xs text-slate-700 normal-case font-normal text-left tracking-normal space-y-2 outline-none"
        >
          <p className="text-sm font-semibold text-slate-800">{def.titulo}</p>
          <div>
            <p className="font-semibold text-slate-500">Qué cuenta</p>
            <p>{def.queCuenta}</p>
          </div>
          <div>
            <p className="font-semibold text-slate-500">Fórmula</p>
            <p>{def.formula}</p>
          </div>
          {def.ojo && (
            <div>
              <p className="font-semibold text-slate-500">Ojo</p>
              <p>{def.ojo}</p>
            </div>
          )}
        </div>,
        document.body,
      )}
    </>
  )
}
