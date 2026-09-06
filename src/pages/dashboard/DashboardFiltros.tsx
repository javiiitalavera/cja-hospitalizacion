import { useEffect, useState } from 'react'
import { supabase } from '../../lib/supabase'
import type { Filtros, Periodo } from './tipos'
import { RotateCcw } from 'lucide-react'

export function DashboardFiltros({ filtros, onCambiar, mostrarComparar }: {
  filtros: Filtros
  onCambiar: (f: Filtros) => void
  // "Comparar" solo tiene sentido donde de verdad se usa — Actividad
  // y Seguridad mostraban el selector y lo ignoraban por completo.
  mostrarComparar: boolean
}) {
  const [medicos, setMedicos] = useState<{ id: string; nombre: string; apellidos: string }[]>([])

  useEffect(() => {
    supabase.from('profesionales').select('id, nombre, apellidos').eq('rol', 'medico').order('apellidos')
      .then(({ data }) => setMedicos(data ?? []))
  }, [])

  function set(cambios: Partial<Filtros>) {
    onCambiar({ ...filtros, ...cambios })
  }

  function restablecer() {
    onCambiar({ periodo: 'mes', desde: '', hasta: '', medicoId: null, comparar: false })
  }

  const periodos: { valor: Periodo; etiqueta: string }[] = [
    { valor: 'mes', etiqueta: 'Este mes' },
    { valor: 'trimestre', etiqueta: 'Este trimestre' },
    { valor: 'anio', etiqueta: 'Este año' },
    { valor: 'todo', etiqueta: 'Todo el historial' },
    { valor: 'personalizado', etiqueta: 'Personalizado' },
  ]

  return (
    <div className="card p-4 space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        {periodos.map((p) => (
          <button
            key={p.valor}
            onClick={() => set({ periodo: p.valor })}
            className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
              filtros.periodo === p.valor ? 'bg-primary-600 text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
            }`}
          >
            {p.etiqueta}
          </button>
        ))}
      </div>

      {filtros.periodo === 'personalizado' && (
        <div className="flex items-center gap-2">
          <input type="date" className="input py-1.5" value={filtros.desde} onChange={(e) => set({ desde: e.target.value })} />
          <span className="text-slate-400 text-sm">a</span>
          <input type="date" className="input py-1.5" value={filtros.hasta} onChange={(e) => set({ hasta: e.target.value })} />
        </div>
      )}

      <div className="flex flex-wrap items-center gap-2">
        <select className="input py-1.5 max-w-[220px]" value={filtros.medicoId ?? ''} onChange={(e) => set({ medicoId: e.target.value || null })}>
          <option value="">Todos los médicos</option>
          {medicos.map((m) => <option key={m.id} value={m.id}>{m.nombre} {m.apellidos}</option>)}
        </select>

        {mostrarComparar && (
          <>
            <label className="flex items-center gap-1.5 text-xs text-slate-600 cursor-pointer px-2">
              <input type="checkbox" checked={filtros.comparar} onChange={(e) => set({ comparar: e.target.checked })} />
              Comparar con el periodo anterior
            </label>

            {/* Antes esta condición estaba invertida: el aviso salía
                precisamente cuando SÍ había comparación disponible,
                y se callaba cuando de verdad no la había. */}
            {filtros.periodo === 'todo' && filtros.comparar && (
              <span className="text-[11px] text-slate-400 italic">
                (sin comparación disponible en "Todo el historial")
              </span>
            )}
          </>
        )}

        <button onClick={restablecer} className="flex items-center gap-1 text-xs text-slate-400 hover:text-slate-600 ml-auto">
          <RotateCcw className="w-3.5 h-3.5" /> Restablecer filtros
        </button>
      </div>
    </div>
  )
}
