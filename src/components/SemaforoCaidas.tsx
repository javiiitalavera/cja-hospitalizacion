// Selector del semáforo de caídas de un paciente. Lo puede cambiar cualquier profesional asistencial mientras el
// episodio siga activo (la misma regla que la Hoja de ítems, donde también se edita). Escribe solo la columna del
// semáforo en items_paciente, así que no pisa lo que otra persona haya cambiado en el resto de la hoja.

import { useState } from 'react'
import { supabase } from '../lib/supabase'
import { SEMAFORO_CAIDAS_COLOR } from '../types'

export const EVENTO_SEMAFORO = 'semaforo-caidas-cambiado'
export const SEMAFOROS = ['verde', 'amarillo', 'naranja', 'rojo'] as const

export async function guardarSemaforo(ingresoId: string, valor: string | null): Promise<string | null> {
  const { data, error } = await supabase.from('items_paciente').update({ semaforo_caidas: valor }).eq('ingreso_id', ingresoId).select('id')
  if (error) return 'No se pudo guardar el semáforo: ' + error.message
  if (!data || data.length === 0) return 'No se pudo guardar el semáforo: el episodio ya está cerrado o no tiene hoja de ítems.'
  // Para que otras partes de la pantalla abiertas a la vez (la cabecera de la ficha, por ejemplo) se pongan al día.
  window.dispatchEvent(new CustomEvent(EVENTO_SEMAFORO, { detail: { ingresoId, valor } }))
  return null
}

const MAYUS = (t: string) => t.charAt(0).toUpperCase() + t.slice(1)

export function SemaforoCaidas({
  ingresoId, valor, onCambio, variante = 'compacto',
}: {
  ingresoId: string
  valor: string | null
  onCambio: (nuevo: string | null) => void
  // «compacto»: cuatro puntos de color (cabecera de la ficha). «botones»: botones con el nombre del color.
  variante?: 'compacto' | 'botones'
}) {
  const [guardando, setGuardando] = useState(false)
  const [error, setError] = useState('')

  async function elegir(color: string) {
    if (guardando) return
    const nuevo = valor === color ? null : color   // pulsar el color activo lo quita
    setGuardando(true)
    setError('')
    const err = await guardarSemaforo(ingresoId, nuevo)
    setGuardando(false)
    if (err) { setError(err); return }
    onCambio(nuevo)
  }

  return (
    <div className="inline-flex flex-col gap-1">
      <div className={variante === 'botones' ? 'flex gap-2' : 'flex gap-1.5'} role="group" aria-label="Semáforo de caídas">
        {SEMAFOROS.map((color) => {
          const activo = valor === color
          const fondo = SEMAFORO_CAIDAS_COLOR[color]
          const texto = color === 'rojo' ? '#fff' : '#000'
          const nombre = `Semáforo de caídas ${color}`
          return variante === 'botones' ? (
            <button
              key={color}
              type="button"
              disabled={guardando}
              aria-pressed={activo}
              aria-label={nombre}
              onClick={() => elegir(color)}
              className={`flex-1 min-w-[4.5rem] py-1.5 rounded-lg text-xs font-semibold border-2 transition-all disabled:opacity-60 ${activo ? 'border-slate-700 scale-105' : 'border-transparent opacity-90 hover:opacity-100'}`}
              style={{ backgroundColor: fondo, color: texto }}
            >
              {MAYUS(color)}
            </button>
          ) : (
            <button
              key={color}
              type="button"
              disabled={guardando}
              aria-pressed={activo}
              aria-label={nombre}
              title={activo ? `${MAYUS(color)} (pulsa para quitarlo)` : MAYUS(color)}
              onClick={() => elegir(color)}
              className={`w-6 h-6 rounded-full border-2 transition-all disabled:opacity-60 ${activo ? 'border-slate-700 scale-110 shadow' : 'border-transparent opacity-50 hover:opacity-100'}`}
              style={{ backgroundColor: fondo }}
            />
          )
        })}
      </div>
      {error && <p className="text-xs text-red-600" role="alert">{error}</p>}
    </div>
  )
}
