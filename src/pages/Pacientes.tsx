import { useEffect, useState } from 'react'
import { useNavigate, Link } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useAuth } from '../lib/AuthContext'
import { Plus, Search, ChevronLeft, ChevronRight } from 'lucide-react'

interface PacienteRow {
  id: string
  nombre: string
  primer_apellido: string
  segundo_apellido?: string
  fecha_nacimiento?: string
  nhc?: string
  cipna?: string
  ultimo_ingreso?: {
    id: string
    estado: string
    fecha_ingreso: string
    fecha_alta?: string
    habitacion?: number
  }
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

const PAGE_SIZE = 50

export default function Pacientes() {
  const { rol } = useAuth()
  const esMedico = rol === 'medico'
  const [pacientes, setPacientes] = useState<PacienteRow[]>([])
  const [total, setTotal] = useState(0)
  const [loading, setLoading] = useState(true)
  const [busqueda, setBusqueda] = useState('')
  const [busquedaActiva, setBusquedaActiva] = useState('')
  const [filtroEstado, setFiltroEstado] = useState<'activo' | 'alta' | 'todos'>('activo')
  const [pagina, setPagina] = useState(0)
  const navigate = useNavigate()

  useEffect(() => { setPagina(0) }, [filtroEstado, busquedaActiva])
  useEffect(() => { fetchPacientes() }, [filtroEstado, busquedaActiva, pagina])

  async function fetchPacientes() {
    setLoading(true)

    if (filtroEstado === 'activo') {
      // Query directa sobre ingresos activos — rápida y acotada (máx 33 filas)
      let query = supabase
        .from('ingresos')
        .select('id, estado, fecha_ingreso, fecha_alta, habitacion, paciente:pacientes(id, nombre, primer_apellido, segundo_apellido, fecha_nacimiento, nhc, cipna)', { count: 'exact' })
        .eq('estado', 'activo')
        .order('habitacion', { ascending: true })

      const { data, count } = await query
      let rows = (data ?? []).map((ing: any) => ({
        id: ing.paciente.id,
        nombre: ing.paciente.nombre,
        primer_apellido: ing.paciente.primer_apellido,
        segundo_apellido: ing.paciente.segundo_apellido,
        fecha_nacimiento: ing.paciente.fecha_nacimiento,
        nhc: ing.paciente.nhc,
        cipna: ing.paciente.cipna,
        ultimo_ingreso: { id: ing.id, estado: ing.estado, fecha_ingreso: ing.fecha_ingreso, fecha_alta: ing.fecha_alta, habitacion: ing.habitacion },
      })) as PacienteRow[]

      if (busquedaActiva.trim()) {
        const q = busquedaActiva.toLowerCase()
        rows = rows.filter(p => {
          const nombre = `${p.primer_apellido} ${p.segundo_apellido ?? ''} ${p.nombre}`.toLowerCase()
          return nombre.includes(q) || p.nhc?.toLowerCase().includes(q) || p.cipna?.toLowerCase().includes(q)
        })
      }

      setPacientes(rows)
      setTotal(busquedaActiva.trim() ? rows.length : (count ?? 0))
    } else {
      // Todos / altas — paginado desde tabla pacientes
      let query = supabase
        .from('pacientes')
        .select('id, nombre, primer_apellido, segundo_apellido, fecha_nacimiento, nhc, cipna', { count: 'exact' })
        .order('primer_apellido')

      if (busquedaActiva.trim()) {
        const q = busquedaActiva.trim()
        query = query.or(`primer_apellido.ilike.%${q}%,nombre.ilike.%${q}%,nhc.ilike.%${q}%,cipna.ilike.%${q}%`)
      }

      query = query.range(pagina * PAGE_SIZE, (pagina + 1) * PAGE_SIZE - 1)
      const { data: pacs, count } = await query

      if (!pacs || pacs.length === 0) {
        setPacientes([])
        setTotal(count ?? 0)
        setLoading(false)
        return
      }

      // Un solo fetch para el último ingreso de todos los pacientes de la página
      const ids = pacs.map((p: any) => p.id)
      const { data: ingresos } = await supabase
        .from('ingresos')
        .select('id, estado, fecha_ingreso, fecha_alta, habitacion, paciente_id')
        .in('paciente_id', ids)
        .order('fecha_ingreso', { ascending: false })

      const ultimoMap: Record<string, any> = {}
      for (const ing of (ingresos ?? [])) {
        if (!ultimoMap[ing.paciente_id]) ultimoMap[ing.paciente_id] = ing
      }

      let rows: PacienteRow[] = pacs.map((p: any) => ({
        id: p.id,
        nombre: p.nombre,
        primer_apellido: p.primer_apellido,
        segundo_apellido: p.segundo_apellido,
        fecha_nacimiento: p.fecha_nacimiento,
        nhc: p.nhc,
        cipna: p.cipna,
        ultimo_ingreso: ultimoMap[p.id] ?? undefined,
      }))

      if (filtroEstado === 'alta') {
        rows = rows.filter(p => ['alta', 'alta_traslado', 'exitus'].includes(p.ultimo_ingreso?.estado ?? ''))
      }

      setPacientes(rows)
      setTotal(count ?? 0)
    }

    setLoading(false)
  }

  const totalPaginas = Math.ceil(total / PAGE_SIZE)

  return (
    <div className="p-8">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-slate-800">Pacientes</h1>
          <p className="text-sm text-slate-400 mt-0.5">
            {loading ? '…' : `${total} resultado${total !== 1 ? 's' : ''}`}
          </p>
        </div>
        {esMedico && (
          <Link to="/pacientes/nuevo" className="btn-primary">
            <Plus className="w-4 h-4" /> Nuevo ingreso
          </Link>
        )}
      </div>

      <div className="flex gap-3 mb-5 flex-wrap">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
          <input
            className="input pl-9"
            placeholder="Apellido, nombre, NHC…"
            value={busqueda}
            onChange={e => setBusqueda(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && setBusquedaActiva(busqueda)}
            onBlur={() => setBusquedaActiva(busqueda)}
          />
        </div>
        {(['activo', 'alta', 'todos'] as const).map(e => (
          <button key={e} type="button"
            onClick={() => setFiltroEstado(e)}
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
              <th className="px-4 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-wide">Paciente</th>
              <th className="px-4 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-wide">Edad</th>
              <th className="px-4 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-wide">NHC</th>
              <th className="px-4 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-wide">Último ingreso</th>
              <th className="px-4 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-wide">Estado</th>
              <th className="px-4 py-3 w-10"></th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {loading ? (
              <tr><td colSpan={6} className="px-4 py-12 text-center text-slate-400">Cargando…</td></tr>
            ) : pacientes.length === 0 ? (
              <tr><td colSpan={6} className="px-4 py-12 text-center text-slate-400">No hay resultados</td></tr>
            ) : pacientes.map(p => {
              const e = edad(p.fecha_nacimiento)
              const estado = p.ultimo_ingreso?.estado
              const identificador = p.nhc ?? p.cipna
              const esCipna = !p.nhc && !!p.cipna
              return (
                <tr key={p.id}
                  className="hover:bg-slate-50 transition-colors cursor-pointer"
                  onClick={() => navigate(`/pacientes/${p.id}`)}>
                  <td className="px-4 py-3">
                    <p className="font-medium text-slate-800">
                      {p.primer_apellido}{p.segundo_apellido ? ' ' + p.segundo_apellido : ''}, {p.nombre}
                    </p>
                  </td>
                  <td className="px-4 py-3 text-slate-500 text-xs">{e != null ? `${e}a` : '—'}</td>
                  <td className="px-4 py-3 text-xs">
                    {identificador ? (
                      <>
                        <span className="font-mono text-slate-700">{identificador}</span>
                        {esCipna && <span className="text-slate-400 ml-1 text-[10px]">CIPNA</span>}
                      </>
                    ) : <span className="text-slate-300">—</span>}
                  </td>
                  <td className="px-4 py-3 text-slate-500 text-xs">
                    {p.ultimo_ingreso ? (
                      <>
                        {new Date(p.ultimo_ingreso.fecha_ingreso).toLocaleDateString('es-ES')}
                        {p.ultimo_ingreso.habitacion && (
                          <span className="text-slate-400"> · Hab. {p.ultimo_ingreso.habitacion}</span>
                        )}
                      </>
                    ) : <span className="text-slate-300">—</span>}
                  </td>
                  <td className="px-4 py-3">
                    {estado ? (
                      <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${ESTADO_COLOR[estado] ?? 'bg-slate-100 text-slate-500'}`}>
                        {ESTADO_LABEL[estado] ?? estado}
                      </span>
                    ) : <span className="text-slate-300 text-xs">Sin ingresos</span>}
                  </td>
                  <td className="px-4 py-3 text-primary-600 text-xs font-medium">Ver →</td>
                </tr>
              )
            })}
          </tbody>
        </table>

        {totalPaginas > 1 && (
          <div className="px-4 py-3 border-t bg-slate-50 flex items-center justify-between">
            <p className="text-xs text-slate-400">
              Página {pagina + 1} de {totalPaginas} · {total} pacientes
            </p>
            <div className="flex gap-2">
              <button type="button"
                onClick={() => setPagina(p => Math.max(0, p - 1))}
                disabled={pagina === 0}
                className="btn-secondary text-xs py-1.5 disabled:opacity-40">
                <ChevronLeft className="w-3.5 h-3.5" /> Anterior
              </button>
              <button type="button"
                onClick={() => setPagina(p => Math.min(totalPaginas - 1, p + 1))}
                disabled={pagina >= totalPaginas - 1}
                className="btn-secondary text-xs py-1.5 disabled:opacity-40">
                Siguiente <ChevronRight className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
