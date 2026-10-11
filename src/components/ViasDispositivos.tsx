// Selectores de aislamiento, vías, sonda vesical y oxigenoterapia. Los usan la Pauta de cuidados de la ficha, la
// Hoja de ítems (ficha y panel lateral): los tres escriben las mismas columnas de items_paciente, así que lo que
// se marca en uno se ve en los demás. Cada selector avisa con `onCambio` de las columnas que hay que guardar.

import { useEffect, useState } from 'react'
import {
  AISLAMIENTOS, DISPOSITIVOS_OXIGENO, VIAS, cambiosDispositivo,
  type Aislamiento, type DatosDispositivos, type Via,
} from '../types/pautaCuidados'
import { hoyLocal } from '../lib/fechas'

interface Props {
  datos: DatosDispositivos
  onCambio: (cambios: DatosDispositivos) => void
  deshabilitado?: boolean
}

const chip = (activo: boolean, deshabilitado?: boolean) =>
  `text-sm px-3 py-1.5 rounded-lg border transition-colors ${
    activo ? 'bg-primary-50 border-primary-300 text-primary-800 font-semibold' : 'bg-white border-slate-200 text-slate-500'
  } ${deshabilitado ? 'cursor-default' : 'hover:border-primary-300'}`

function alternar<T extends string>(lista: readonly T[] | null | undefined, valor: T, orden: readonly T[]): T[] {
  const actual = lista ?? []
  const siguiente = actual.includes(valor) ? actual.filter((x) => x !== valor) : [...actual, valor]
  return orden.filter((x) => siguiente.includes(x))
}

export function SelectorAislamiento({ datos, onCambio, deshabilitado }: Props) {
  const orden = AISLAMIENTOS.map((a) => a.clave)
  return (
    <div className="flex flex-wrap items-center gap-2">
      {AISLAMIENTOS.map((a) => {
        const activo = (datos.aislamiento ?? []).includes(a.clave)
        return (
          <button key={a.clave} type="button" disabled={deshabilitado} aria-pressed={activo} className={chip(activo, deshabilitado)}
            onClick={() => onCambio({ aislamiento: alternar<Aislamiento>(datos.aislamiento, a.clave, orden) })}>
            {a.etiqueta}
          </button>
        )
      })}
      {(datos.aislamiento ?? []).length === 0 && <span className="text-xs text-slate-500">Sin aislamiento</span>}
    </div>
  )
}

export function SelectorVias({ datos, onCambio, deshabilitado }: Props) {
  const orden = VIAS.map((v) => v.clave)
  return (
    <div className="flex flex-wrap items-center gap-2">
      {VIAS.map((v) => {
        const activo = (datos.vias ?? []).includes(v.clave)
        return (
          <button key={v.clave} type="button" disabled={deshabilitado} aria-pressed={activo} className={chip(activo, deshabilitado)}
            onClick={() => onCambio({ vias: alternar<Via>(datos.vias, v.clave, orden) })}>
            {v.etiqueta}
          </button>
        )
      })}
      {(datos.vias ?? []).length === 0 && <span className="text-xs text-slate-500">No lleva vías</span>}
    </div>
  )
}

// Número o fecha que se guarda al salir del campo (o con Enter), no en cada tecla: en una fecha, mientras se teclea
// el día o el año ya hay fechas «válidas» a medias (año 0002…), y guardar entonces impedía terminar de escribirla.
// Si el valor no es válido se avisa y se vuelve al anterior.
function CampoDetalle({ etiqueta, tipo, valor, deshabilitado, onGuardar, ancho, ...extra }: {
  etiqueta: string
  tipo: 'date' | 'number'
  valor: string | number | null | undefined
  deshabilitado?: boolean
  onGuardar: (texto: string) => string | null     // devuelve un mensaje de error, o null si se aceptó
  ancho?: string
  min?: number | string; max?: number | string; step?: number
}) {
  const [texto, setTexto] = useState(valor == null ? '' : String(valor))
  const [error, setError] = useState('')
  useEffect(() => { setTexto(valor == null ? '' : String(valor)); setError('') }, [valor])
  function confirmar(t: string) {
    if (t === (valor == null ? '' : String(valor))) return
    const e = onGuardar(t)
    setError(e ?? '')
    if (e) setTexto(valor == null ? '' : String(valor))
  }
  return (
    <label className="block">
      <span className="label">{etiqueta}</span>
      <input
        type={tipo}
        className={`input ${ancho ?? ''}`}
        value={texto}
        disabled={deshabilitado}
        onChange={(e) => setTexto(e.target.value)}
        onBlur={() => confirmar(texto)}
        onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); confirmar(texto) } }}
        {...extra}
      />
      {error && <span className="block text-xs text-red-600 mt-0.5">{error}</span>}
    </label>
  )
}

const interruptor = (activo: boolean, deshabilitado?: boolean) =>
  `relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-colors ${activo ? 'bg-primary-600' : 'bg-slate-300'} ${deshabilitado ? 'opacity-60' : ''}`

export function BloqueSonda({ datos, onCambio, deshabilitado }: Props) {
  const activa = !!datos.sonda_vesical
  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-3">
        <span className="text-sm font-medium text-slate-800">Sonda vesical</span>
        <button type="button" role="switch" aria-checked={activa} aria-label="Sonda vesical" disabled={deshabilitado} className={interruptor(activa, deshabilitado)}
          onClick={() => onCambio(cambiosDispositivo('sonda_vesical', !activa))}>
          <span className={`inline-block h-5 w-5 transform rounded-full bg-white shadow transition-transform ${activa ? 'translate-x-5' : 'translate-x-0.5'}`} />
        </button>
      </div>
      {activa && (
        <div className="grid grid-cols-2 gap-3">
          <CampoDetalle
            etiqueta="Colocada el" tipo="date" valor={datos.sonda_fecha} deshabilitado={deshabilitado} max={hoyLocal()}
            onGuardar={(t) => {
              if (t && t < '1990-01-01') return 'Fecha no válida.'
              if (t > hoyLocal()) return 'La fecha no puede ser futura.'
              onCambio({ sonda_fecha: t || null }); return null
            }}
          />
          <CampoDetalle
            etiqueta="Calibre (Ch)" tipo="number" valor={datos.sonda_calibre} deshabilitado={deshabilitado} min={6} max={30} step={1}
            onGuardar={(t) => {
              if (t.trim() === '') { onCambio({ sonda_calibre: null }); return null }
              const n = Number(t)
              if (!Number.isInteger(n) || n < 6 || n > 30) return 'Entre 6 y 30.'
              onCambio({ sonda_calibre: n }); return null
            }}
          />
        </div>
      )}
    </div>
  )
}

export function BloqueOxigeno({ datos, onCambio, deshabilitado }: Props) {
  const activo = !!datos.oxigenoterapia
  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-3">
        <span className="text-sm font-medium text-slate-800">Oxigenoterapia</span>
        <button type="button" role="switch" aria-checked={activo} aria-label="Oxigenoterapia" disabled={deshabilitado} className={interruptor(activo, deshabilitado)}
          onClick={() => onCambio(cambiosDispositivo('oxigenoterapia', !activo))}>
          <span className={`inline-block h-5 w-5 transform rounded-full bg-white shadow transition-transform ${activo ? 'translate-x-5' : 'translate-x-0.5'}`} />
        </button>
      </div>
      {activo && (
        <div className="space-y-3">
          <div className="flex flex-wrap gap-2">
            {DISPOSITIVOS_OXIGENO.map((d) => {
              const elegido = datos.oxigeno_dispositivo === d.clave
              return (
                <button key={d.clave} type="button" disabled={deshabilitado} aria-pressed={elegido} className={chip(elegido, deshabilitado)}
                  onClick={() => onCambio({ oxigeno_dispositivo: elegido ? null : d.clave })}>
                  {d.etiqueta}
                </button>
              )
            })}
          </div>
          <div className="max-w-[10rem]">
            <CampoDetalle
              etiqueta="Flujo (l/min)" tipo="number" valor={datos.oxigeno_flujo} deshabilitado={deshabilitado} min={0.5} max={15} step={0.5}
              onGuardar={(t) => {
                if (t.trim() === '') { onCambio({ oxigeno_flujo: null }); return null }
                const n = Number(t.replace(',', '.'))
                if (!Number.isFinite(n) || n <= 0 || n > 15) return 'Entre 0,5 y 15.'
                onCambio({ oxigeno_flujo: Math.round(n * 10) / 10 }); return null
              }}
            />
          </div>
        </div>
      )}
    </div>
  )
}
