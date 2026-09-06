import { AlertCircle, RefreshCw } from 'lucide-react'

// Los cuatro estados que puede tener cualquier apartado — nunca se
// convierte un fallo en un cero, ni un "sin datos todavía" se
// confunde con "no se pudo calcular".

export function EstadoCargando() {
  return <p className="text-slate-400 text-sm py-6 text-center">Cargando…</p>
}

export function EstadoSinDatos({ mensaje = 'Sin datos para este periodo.' }: { mensaje?: string }) {
  return <p className="text-slate-400 text-sm py-6 text-center">{mensaje}</p>
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

export function TarjetaMetrica({ etiqueta, valor, subvalor, comparacion, onClick }: {
  etiqueta: string
  valor: string | number
  subvalor?: string
  // Texto neutro de comparación, sin color de "bueno/malo" — la
  // dirección del cambio no se puede juzgar en automático.
  comparacion?: string
  onClick?: () => void
}) {
  const Contenedor = onClick ? 'button' : 'div'
  return (
    <Contenedor
      onClick={onClick}
      className={`card p-4 text-left ${onClick ? 'hover:border-primary-300 hover:bg-primary-50/20 transition-colors cursor-pointer' : ''}`}
    >
      <p className="text-xs text-slate-400 font-medium">{etiqueta}</p>
      <p className="text-2xl font-bold text-slate-800 mt-1">{valor}</p>
      {subvalor && <p className="text-xs text-slate-400 mt-0.5">{subvalor}</p>}
      {comparacion && <p className="text-xs text-slate-500 mt-1.5">{comparacion}</p>}
    </Contenedor>
  )
}
