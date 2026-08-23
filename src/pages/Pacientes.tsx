import { useEffect, useState } from 'react'
import { useNavigate, Link } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { escaparBusquedaIlike } from '../lib/busqueda'
import { useAuth } from '../lib/AuthContext'
import { Plus, Search, ChevronLeft, ChevronRight, ArrowUpDown } from 'lucide-react'
import { ESTADO_INGRESO_LABEL as ESTADO_LABEL, ESTADO_INGRESO_COLOR as ESTADO_COLOR } from '../types'

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

const ORDEN_OPCIONES = [
  { valor: 'apellido', etiqueta: 'Apellidos', columna: 'primer_apellido', asc: true },
  { valor: 'nhc', etiqueta: 'Nº historia clínica', columna: 'nhc', asc: true },
  { valor: 'ultimo_ingreso', etiqueta: 'Fecha de último ingreso', columna: 'ingreso_fecha_ingreso', asc: false },
  { valor: 'estado', etiqueta: 'Estado actual', columna: 'ingreso_estado', asc: true },
] as const
type OrdenValor = typeof ORDEN_OPCIONES[number]['valor']

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
  const [orden, setOrden] = useState<OrdenValor>('apellido')
  const [pagina, setPagina] = useState(0)
  const navigate = useNavigate()

  useEffect(() => { fetchPacientes() }, [filtroEstado, busquedaActiva, orden, pagina])

  async function fetchPacientes() {
    setLoading(true)

    // Todo (filtro + orden + paginación) ocurre en la propia consulta,
    // sobre la vista que ya trae el último ingreso de cada paciente.
    // Así el número de resultados y las páginas son siempre correctos,
    // se filtre por lo que se filtre (antes, "Altas / Éxitus" filtraba
    // en el navegador DESPUÉS de paginar, y podía dar cifras erróneas).
    let query = supabase
      .from('pacientes_con_ultimo_ingreso')
      .select('id, nombre, primer_apellido, segundo_apellido, fecha_nacimiento, nhc, cipna, ingreso_id, ingreso_estado, ingreso_fecha_ingreso, ingreso_fecha_alta, ingreso_habitacion', { count: 'exact' })

    if (filtroEstado === 'activo') {
      query = query.eq('ingreso_estado', 'activo')
    } else if (filtroEstado === 'alta') {
      query = query.in('ingreso_estado', ['alta', 'alta_traslado', 'exitus'])
    }

    if (busquedaActiva.trim()) {
      const q = escaparBusquedaIlike(busquedaActiva.trim())
      query = query.or(`primer_apellido.ilike.${q},nombre.ilike.${q},nhc.ilike.${q},cipna.ilike.${q}`)
    }

    const opcion = ORDEN_OPCIONES.find(o => o.valor === orden)!
    query = query.order(opcion.columna, { ascending: opcion.asc, nullsFirst: false })
    query = query.range(pagina * PAGE_SIZE, (pagina + 1) * PAGE_SIZE - 1)

    const { data, count } = await query

    const rows: PacienteRow[] = (data ?? []).map((p: any) => ({
      id: p.id,
      nombre: p.nombre,
      primer_apellido: p.primer_apellido,
      segundo_apellido: p.segundo_apellido,
      fecha_nacimiento: p.fecha_nacimiento,
      nhc: p.nhc,
      cipna: p.cipna,
      ultimo_ingreso: p.ingreso_id
        ? {
            id: p.ingreso_id,
            estado: p.ingreso_estado,
            fecha_ingreso: p.ingreso_fecha_ingreso,
            fecha_alta: p.ingreso_fecha_alta,
            habitacion: p.ingreso_habitacion,
          }
        : undefined,
    }))

    setPacientes(rows)
    setTotal(count ?? 0)
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

      <div className="flex gap-3 mb-5 flex-wrap items-center">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
          <input
            className="input pl-9"
            placeholder="Apellido, nombre, NHC…"
            value={busqueda}
            onChange={e => setBusqueda(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') { setBusquedaActiva(busqueda); setPagina(0) } }}
            onBlur={() => { setBusquedaActiva(busqueda); setPagina(0) }}
          />
        </div>
        {(['activo', 'alta', 'todos'] as const).map(e => (
          <button key={e} type="button"
            onClick={() => { setFiltroEstado(e); setPagina(0) }}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
              filtroEstado === e ? 'bg-primary-600 text-white' : 'bg-white border text-slate-500 hover:bg-slate-50'
            }`}>
            {e === 'activo' ? 'Ingresados' : e === 'alta' ? 'Altas / Éxitus' : 'Todos'}
          </button>
        ))}
        <div className="flex items-center gap-1.5 ml-auto">
          <ArrowUpDown className="w-3.5 h-3.5 text-slate-400" />
          <select className="input py-1.5 text-sm w-auto" value={orden} onChange={e => { setOrden(e.target.value as OrdenValor); setPagina(0) }}>
            {ORDEN_OPCIONES.map(o => (
              <option key={o.valor} value={o.valor}>Ordenar por {o.etiqueta.toLowerCase()}</option>
            ))}
          </select>
        </div>
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
