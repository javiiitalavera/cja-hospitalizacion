import { useEffect, useState } from 'react'
import { useNavigate, Link } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { Plus, Search } from 'lucide-react'

interface PacienteRow {
  id: string
  nombre: string
  primer_apellido: string
  segundo_apellido?: string
  fecha_nacimiento?: string
  cipna?: string
  nhc?: string
  ultimo_ingreso?: {
    id: string
    estado: string
    fecha_ingreso: string
    fecha_alta?: string
    habitacion?: number
    medico_responsable?: { nombre: string }
  }
  total_ingresos: number
}

const ESTADO_LABEL: Record<string, string> = {
  activo: 'Ingresado', alta: 'Alta', alta_traslado: 'Traslado', exitus: 'Éxitus',
}
const ESTADO_COLOR: Record<string, string> = {
  activo: 'bg-emerald-100 text-emerald-700',
  alta: 'bg-slate-100 text-slate-500',
  alta_traslado: 'bg-blue-100 text-blue-600',
  exitus: 'bg-red-100 text-red-600',
}

function edad(fnac?: string) {
  if (!fnac) return null
  return Math.floor((Date.now() - new Date(fnac).getTime()) / 31557600000)
}

export default function Pacientes() {
  const [pacientes, setPacientes] = useState<PacienteRow[]>([])
  const [loading, setLoading] = useState(true)
  const [busqueda, setBusqueda] = useState('')
  const [filtroEstado, setFiltroEstado] = useState<'activo' | 'alta' | 'todos'>('todos')
  const navigate = useNavigate()

  useEffect(() => { fetchPacientes() }, [])

  async function fetchPacientes() {
    setLoading(true)

    // Fetch all patients with their ingresos
    const { data: pacientesData } = await supabase
      .from('pacientes')
      .select(`
        id, nombre, primer_apellido, segundo_apellido,
        fecha_nacimiento, cipna, nhc,
        ingresos(id, estado, fecha_ingreso, fecha_alta, habitacion,
          medico_responsable:profesionales(nombre))
      `)
      .order('primer_apellido')

    const rows: PacienteRow[] = (pacientesData ?? []).map((p: any) => {
      const ingresos = (p.ingresos ?? []).sort((a: any, b: any) =>
        new Date(b.fecha_ingreso).getTime() - new Date(a.fecha_ingreso).getTime()
      )
      const ultimo = ingresos[0] ?? null
      return {
        id: p.id,
        nombre: p.nombre,
        primer_apellido: p.primer_apellido,
        segundo_apellido: p.segundo_apellido,
        fecha_nacimiento: p.fecha_nacimiento,
        cipna: p.cipna,
        nhc: p.nhc,
        ultimo_ingreso: ultimo,
        total_ingresos: ingresos.length,
      }
    })

    setPacientes(rows)
    setLoading(false)
  }

  const filtrados = pacientes.filter(p => {
    // Filtro estado
    if (filtroEstado !== 'todos') {
      const estado = p.ultimo_ingreso?.estado
      if (filtroEstado === 'activo' && estado !== 'activo') return false
      if (filtroEstado === 'alta' && !['alta', 'alta_traslado', 'exitus'].includes(estado ?? '')) return false
    }
    // Búsqueda
    if (!busqueda.trim()) return true
    const q = busqueda.toLowerCase()
    const nombre = `${p.primer_apellido} ${p.segundo_apellido ?? ''} ${p.nombre}`.toLowerCase()
    return nombre.includes(q) || p.nhc?.toLowerCase().includes(q) || p.cipna?.toLowerCase().includes(q)
  })

  return (
    <div className="p-8">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-slate-800">Pacientes</h1>
          <p className="text-sm text-slate-400 mt-0.5">{filtrados.length} pacientes</p>
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
        {(['todos', 'activo', 'alta'] as const).map(e => (
          <button key={e} onClick={() => setFiltroEstado(e)}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
              filtroEstado === e ? 'bg-primary-600 text-white' : 'bg-white border text-slate-500 hover:bg-slate-50'
            }`}>
            {e === 'todos' ? 'Todos' : e === 'activo' ? 'Ingresados' : 'Altas / Éxitus'}
          </button>
        ))}
      </div>

      <div className="card overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b bg-slate-50">
              <th className="px-4 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-wide">Paciente</th>
              <th className="px-4 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-wide">Edad</th>
              <th className="px-4 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-wide">NHC / CIPNA</th>
              <th className="px-4 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-wide">Último ingreso</th>
              <th className="px-4 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-wide">Estado</th>
              <th className="px-4 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-wide">Ingresos</th>
              <th className="px-4 py-3 w-10"></th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {loading ? (
              <tr><td colSpan={7} className="px-4 py-12 text-center text-slate-400">Cargando…</td></tr>
            ) : filtrados.length === 0 ? (
              <tr><td colSpan={7} className="px-4 py-12 text-center text-slate-400">No hay resultados</td></tr>
            ) : filtrados.map(p => {
              const e = edad(p.fecha_nacimiento)
              const estado = p.ultimo_ingreso?.estado
              return (
                <tr key={p.id} className="hover:bg-slate-50 transition-colors cursor-pointer"
                  onClick={() => navigate(`/pacientes/${p.id}`)}>
                  <td className="px-4 py-3">
                    <p className="font-medium text-slate-800">
                      {p.primer_apellido} {p.segundo_apellido ?? ''}, {p.nombre}
                    </p>
                  </td>
                  <td className="px-4 py-3 text-slate-500 text-xs">{e != null ? `${e}a` : '—'}</td>
                  <td className="px-4 py-3 text-slate-400 text-xs font-mono">
                    {p.nhc ?? p.cipna ?? '—'}
                  </td>
                  <td className="px-4 py-3 text-slate-500 text-xs">
                    {p.ultimo_ingreso
                      ? new Date(p.ultimo_ingreso.fecha_ingreso).toLocaleDateString('es-ES')
                      : '—'}
                    {p.ultimo_ingreso?.habitacion && ` · Hab. ${p.ultimo_ingreso.habitacion}`}
                  </td>
                  <td className="px-4 py-3">
                    {estado ? (
                      <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${ESTADO_COLOR[estado] ?? 'bg-slate-100 text-slate-500'}`}>
                        {ESTADO_LABEL[estado] ?? estado}
                      </span>
                    ) : <span className="text-slate-300 text-xs">Sin ingresos</span>}
                  </td>
                  <td className="px-4 py-3 text-center">
                    {p.total_ingresos > 0 && (
                      <span className="text-xs text-slate-400">{p.total_ingresos}</span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-primary-600 text-xs font-medium">Ver →</td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </div>
  )
}
