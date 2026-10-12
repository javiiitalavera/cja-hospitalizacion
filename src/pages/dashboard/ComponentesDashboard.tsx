import { AlertCircle, RefreshCw } from 'lucide-react'
import { Cargando } from '../../components/Cargando'
import InfoIndicador from './InfoIndicador'
import type { ClaveDefinicion } from './definiciones'

// Los cuatro estados que puede tener cualquier apartado — nunca se
// convierte un fallo en un cero, ni un "sin datos todavía" se
// confunde con "no se pudo calcular".

export function EstadoCargando() {
  return <Cargando />
}

export function EstadoSinDatos({ mensaje = 'Sin datos para este periodo.' }: { mensaje?: string }) {
  return <p className="text-slate-500 text-sm py-6 text-center">{mensaje}</p>
}

export function EstadoError({ mensaje, onReintentar }: { mensaje: string; onReintentar: () => void }) {
  return (
    <div className="flex items-center justify-between gap-3 bg-red-50 border border-red-100 rounded-lg px-4 py-3">
      <div className="flex items-center gap-2 text-red-600 text-sm">
        <AlertCircle className="w-4 h-4 shrink-0" />
        <span>No se ha podido calcular este apartado: {mensaje}</span>
      </div>
      <button onClick={onReintentar} className="flex items-center gap-1 text-xs font-medium text-red-700 hover:text-red-800 shrink-0">
        <RefreshCw className="w-3.5 h-3.5" /> Reintentar
      </button>
    </div>
  )
}

export function TarjetaMetrica({ etiqueta, valor, subvalor, comparacion, onClick, info }: {
  etiqueta: string
  valor: string | number
  subvalor?: string
  // Texto neutro de comparación, sin color de "bueno/malo" — la
  // dirección del cambio no se puede juzgar en automático.
  comparacion?: string
  onClick?: () => void
  // Clave de la definición (definiciones.ts): añade el icono «i» con la fórmula del indicador.
  info?: ClaveDefinicion
}) {
  const Contenedor = onClick ? 'button' : 'div'
  const tarjeta = (
    <Contenedor
      onClick={onClick}
      className={`card p-4 text-left ${info ? 'block w-full h-full' : ''} ${onClick ? 'hover:border-primary-300 hover:bg-primary-50/20 transition-colors cursor-pointer' : ''}`}
    >
      <p className={`text-xs text-slate-500 font-medium ${info ? 'pr-6' : ''}`}>{etiqueta}</p>
      <p className="text-2xl font-bold text-slate-800 mt-1">{valor}</p>
      {subvalor && <p className="text-xs text-slate-500 mt-0.5">{subvalor}</p>}
      {comparacion && <p className="text-xs text-slate-500 mt-1.5">{comparacion}</p>}
    </Contenedor>
  )
  if (!info) return tarjeta
  // El icono va al lado de la tarjeta, no dentro: una tarjeta que se pulsa es un <button> y no puede contener otro.
  return (
    <div className="relative" data-tarjeta-info>
      {tarjeta}
      <span className="absolute top-2.5 right-2.5"><InfoIndicador clave={info} /></span>
    </div>
  )
}
