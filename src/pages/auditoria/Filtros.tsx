import type { ReactNode } from 'react'
import { BuscadorPaciente } from './BuscadorPaciente'
import type { Personal } from './personal'

// Los filtros que comparten Cambios y Accesos: persona, paciente y fechas. Lo propio de cada pestaña va en `hijos`.
export function BarraFiltros<F extends { usuario: string; paciente: { id: string; nombre: string } | null; desde: string; hasta: string }>({
  filtros, onChange, personal, hijos, hayFiltros, onLimpiar,
}: {
  filtros: F
  onChange: (f: F) => void
  personal: Personal
  hijos?: ReactNode
  hayFiltros: boolean
  onLimpiar: () => void
}) {
  return (
    <div className="card p-4 mb-4">
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {hijos}
        <div>
          <label className="label">Persona</label>
          <select className="input" value={filtros.usuario} onChange={(e) => onChange({ ...filtros, usuario: e.target.value })}>
            <option value="">Todas</option>
            {personal.lista.map((p) => <option key={p.userId} value={p.userId}>{p.nombre}</option>)}
          </select>
        </div>
        <div>
          <label className="label">Paciente</label>
          <BuscadorPaciente valor={filtros.paciente} onChange={(p) => onChange({ ...filtros, paciente: p })} />
        </div>
        <div>
          <label className="label">Desde</label>
          <input type="date" className="input" value={filtros.desde} max={filtros.hasta || undefined}
            onChange={(e) => onChange({ ...filtros, desde: e.target.value })} />
        </div>
        <div>
          <label className="label">Hasta</label>
          <input type="date" className="input" value={filtros.hasta} min={filtros.desde || undefined}
            onChange={(e) => onChange({ ...filtros, hasta: e.target.value })} />
        </div>
      </div>
      {hayFiltros && (
        <div className="mt-3">
          <button type="button" onClick={onLimpiar} className="text-xs text-primary-600 hover:text-primary-800 font-medium">Quitar todos los filtros</button>
        </div>
      )}
    </div>
  )
}

export function AvisoError({ texto, onReintentar, color = 'rojo' }: { texto: string; onReintentar: () => void; color?: 'rojo' | 'ambar' }) {
  const clases = color === 'rojo' ? 'bg-red-50 text-red-600 border-red-100' : 'bg-amber-50 text-amber-700 border-amber-100'
  return (
    <div className={`text-sm rounded-lg px-3 py-2 border flex items-center justify-between gap-3 ${clases}`}>
      <span>{texto}</span>
      <button onClick={onReintentar} className="btn-secondary text-xs shrink-0">Reintentar</button>
    </div>
  )
}

export const formatoFecha = (iso: string) =>
  new Date(iso).toLocaleString('es-ES', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })

export const formatoHora = (iso: string) => new Date(iso).toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' })
