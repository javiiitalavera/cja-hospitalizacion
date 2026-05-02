import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import type { Ingreso } from '../types'
import { Plus, Search } from 'lucide-react'

const ESTADO_LABEL: Record<string, string> = {
  activo: 'Ingresado', alta: 'Alta', alta_traslado: 'Traslado', exitus: 'Éxitus',
}
const ESTADO_COLOR: Record<string, string> = {
  activo: 'bg-emerald-100 text-emerald-700',
  alta: 'bg-slate-100 text-slate-500',
  alta_traslado: 'bg-blue-100 text-blue-600',
  exitus: 'bg-red-100 text-red-600',
}

export default function Pacientes() {
  const [ingresos, setIngresos] = useState<Ingreso[]>([])
  const [loading, setLoading] = useState(true)
  const [busqueda, setBusqueda] = useState('')
  const [filtroEstado, setFiltroEstado] = useState<'activo' | 'alta' | 'todos'>('activo')

  useEffect(() => { fetchIngresos() }, [filtroEstado])

  async function fetchIngresos() {
    setLoading(true)
    let query = supabase
      .from('ingresos')
      .select('*, paciente:pacientes(*), medico_responsable:profesionales(*)')
      .order('fecha_ingreso', { ascending: false })

    if (filtroEstado !== 'todos') {
      query = filtroEstado === 'alta'
        ? query.in('estado', ['alta', 'alta_traslado', 'exitus'])
        : query.eq('estado', filtroEstado)
    }

    const { data } = await query
    setIngresos((data as Ingreso[]) ?? [])
    setLoading(false)
  }

  const filtrados = ingresos.filter(i => {
    if (!busqueda.trim()) return true
    const q = busqueda.toLowerCase()
    const nombre = `${i.paciente?.primer_apellido ?? ''} ${i.paciente?.segundo_apellido ?? ''} ${i.paciente?.nombre ?? ''}`.toLowerCase()
    const nhc = (i.paciente as any)?.nhc?.toLowerCase() ?? ''
    const cipna = (i.paciente as any)?.cipna?.toLowerCase() ?? ''
    return nombre.includes(q) || nhc.includes(q) || cipna.includes(q) || i.habitacion?.toString().includes(q)
  })

  return (
    <div className="p-8">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-slate-800">Pacientes</h1>
          <p className="text-sm text-slate-400 mt-0.5">{filtrados.length} registros</p>
        </div>
        <Link to="/pacientes/nuevo" className="btn-primary">
          <Plus className="w-4 h-4" /> Nuevo ingreso
        </Link>
      </div>

      <div className="flex gap-3 mb-5">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
          <input className="input pl-9" placeholder="Nombre, apellido, NHC, CIPNA…"
            value={busqueda} onChange={e => setBusqueda(e.target.value)} />
        </div>
        {(['activo', 'alta', 'todos'] as const).map(e => (
          <button key={e} onClick={() => setFiltroEstado(e)}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
              filtroEstado === e ? 'bg-primary-600 text-white' : 'bg-white border text-slate-500 hover:bg-slate-50'
            }`}>
            {e === 'activo' ? 'Ingresados' : e === 'alta' ? 'Altas / Éxitus' : 'Todos'}
          </button>
        ))}
      </div>

      <div className="card overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b bg-slate-50">
              <th className="px-4 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-wide w-16">Hab.</th>
              <th className="px-4 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-wide">Paciente</th>
              <th className="px-4 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-wide">Médico</th>
              <th className="px-4 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-wide">Ingreso</th>
              <th className="px-4 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-wide">Alta</th>
              <th className="px-4 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-wide">Estado</th>
              <th className="px-4 py-3 w-10"></th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {loading ? (
              <tr><td colSpan={7} className="px-4 py-12 text-center text-slate-400">Cargando…</td></tr>
            ) : filtrados.length === 0 ? (
              <tr><td colSpan={7} className="px-4 py-12 text-center text-slate-400">No hay resultados</td></tr>
            ) : filtrados.map(i => (
              <tr key={i.id} className="hover:bg-slate-50 transition-colors">
                <td className="px-4 py-3">
                  <div className="flex items-center justify-center w-8 h-8 bg-primary-50 text-primary-700 font-bold text-xs rounded-lg">
                    {i.habitacion ?? '—'}
                  </div>
                </td>
                <td className="px-4 py-3">
                  <p className="font-medium text-slate-800">
                    {i.paciente?.primer_apellido} {(i.paciente as any)?.segundo_apellido ?? ''}, {i.paciente?.nombre}
                  </p>
                  <p className="text-xs text-slate-400">{(i.paciente as any)?.cipna ?? (i.paciente as any)?.nhc ?? '—'}</p>
                </td>
                <td className="px-4 py-3 text-slate-600">{i.medico_responsable?.nombre ?? '—'}</td>
                <td className="px-4 py-3 text-slate-500 text-xs">
                  {i.fecha_ingreso ? new Date(i.fecha_ingreso).toLocaleDateString('es-ES') : '—'}
                </td>
                <td className="px-4 py-3 text-slate-500 text-xs">
                  {i.fecha_alta ? new Date(i.fecha_alta).toLocaleDateString('es-ES') : '—'}
                </td>
                <td className="px-4 py-3">
                  <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${ESTADO_COLOR[i.estado] ?? 'bg-slate-100 text-slate-500'}`}>
                    {ESTADO_LABEL[i.estado] ?? i.estado}
                  </span>
                </td>
                <td className="px-4 py-3">
                  <Link to={`/pacientes/${i.id}`} className="text-primary-600 hover:text-primary-800 font-medium text-xs">
                    Ver →
                  </Link>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
