import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { Search, FileText, LogOut, ArrowUpDown } from 'lucide-react'
import { ESTADO_INGRESO_LABEL as ESTADO_LABEL, ESTADO_INGRESO_COLOR as ESTADO_COLOR, nombreCompleto } from '../types'
import { quitarTildes } from '../lib/busqueda'

type TipoInforme = 'ingreso' | 'alta'
type EstadoInforme = 'sin_iniciar' | 'borrador'

interface InformeRow {
  id: string
  ingresoId: string
  tipo: TipoInforme
  fecha: string | null
  paciente: string
  nhc: string | null
  medico: string
  estadoIngreso: string
  estadoInforme: EstadoInforme
}

// Los campos que no cuentan como "contenido" al decidir si un informe
// está sin empezar o no — todo lo demás que devuelva la consulta sí.
const CAMPOS_NO_CONTENIDO = new Set(['id', 'ingreso_id', 'version', 'created_at', 'updated_at', 'ingreso'])

function estaVacio(fila: Record<string, any>): boolean {
  return Object.entries(fila).every(([clave, valor]) => {
    if (CAMPOS_NO_CONTENIDO.has(clave)) return true
    if (valor == null) return true
    if (typeof valor === 'string') return valor.trim() === ''
    if (Array.isArray(valor)) return valor.length === 0
    return false
  })
}

export function Informes() {
  const navigate = useNavigate()
  const [loading, setLoading] = useState(true)
  const [informes, setInformes] = useState<InformeRow[]>([])
  const [posibleTruncado, setPosibleTruncado] = useState(false)
  const [anios, setAnios] = useState<number[]>([])
  const [filtroAnio, setFiltroAnio] = useState<string>('todos')
  const [filtroTipo, setFiltroTipo] = useState<'todos' | TipoInforme>('todos')
  const [busqueda, setBusqueda] = useState('')
  const [orden, setOrden] = useState<'reciente' | 'antiguo'>('reciente')

  useEffect(() => { fetchInformes() }, [])

  async function fetchInformes() {
    setLoading(true)
    try {
      const [{ data: ing }, { data: alta }] = await Promise.all([
        supabase
          .from('informe_ingreso')
          .select(`
            *,
            ingreso:ingresos(id, fecha_ingreso, estado,
              medico_responsable:profesionales(nombre, apellidos),
              paciente:pacientes(nombre, primer_apellido, segundo_apellido, nhc))
          `)
          .limit(2000), // tope de seguridad: esta pantalla no pagina todavía
        supabase
          .from('informe_alta')
          .select(`
            *,
            ingreso:ingresos(id, fecha_alta, fecha_ingreso, estado,
              medico_responsable:profesionales(nombre, apellidos),
              paciente:pacientes(nombre, primer_apellido, segundo_apellido, nhc))
          `)
          .limit(2000),
      ])

      const rows: InformeRow[] = []

      ;(ing ?? []).forEach((r: any) => {
        const i = r.ingreso
        if (!i?.paciente) return
        rows.push({
          id: r.id,
          ingresoId: i.id,
          tipo: 'ingreso',
          fecha: i.fecha_ingreso,
          paciente: nombreCompleto(i.paciente),
          nhc: i.paciente.nhc ?? null,
          medico: i.medico_responsable ? `${i.medico_responsable.nombre} ${i.medico_responsable.apellidos}` : '—',
          estadoIngreso: i.estado,
          estadoInforme: estaVacio(r) ? 'sin_iniciar' : 'borrador',
        })
      })

      ;(alta ?? []).forEach((r: any) => {
        const i = r.ingreso
        if (!i?.paciente) return
        rows.push({
          id: r.id,
          ingresoId: i.id,
          tipo: 'alta',
          // Sin ".. ?? i.fecha_ingreso": un informe de alta que todavía
          // no se ha cerrado no tiene fecha de alta de verdad — antes
          // se sustituía por la fecha de ingreso, que no es la fecha
          // de este informe, es la del otro.
          fecha: i.fecha_alta ?? null,
          paciente: nombreCompleto(i.paciente),
          nhc: i.paciente.nhc ?? null,
          medico: i.medico_responsable ? `${i.medico_responsable.nombre} ${i.medico_responsable.apellidos}` : '—',
          estadoIngreso: i.estado,
          estadoInforme: estaVacio(r) ? 'sin_iniciar' : 'borrador',
        })
      })

      setInformes(rows)
      setPosibleTruncado((ing?.length ?? 0) >= 2000 || (alta?.length ?? 0) >= 2000)
      const aniosDisponibles = [...new Set(rows.filter(r => r.fecha).map(r => new Date(r.fecha!).getFullYear()))]
        .sort((a, b) => b - a)
      setAnios(aniosDisponibles)
    } finally {
      setLoading(false)
    }
  }

  let lista = informes
  if (filtroAnio !== 'todos') {
    lista = lista.filter(r => r.fecha && new Date(r.fecha).getFullYear() === Number(filtroAnio))
  }
  if (filtroTipo !== 'todos') {
    lista = lista.filter(r => r.tipo === filtroTipo)
  }
  if (busqueda.trim()) {
    const q = quitarTildes(busqueda.trim().toLowerCase())
    lista = lista.filter(r =>
      quitarTildes(r.paciente.toLowerCase()).includes(q) ||
      (r.nhc ?? '').toLowerCase().includes(q)
    )
  }
  lista = [...lista].sort((a, b) => {
    const fa = a.fecha ?? ''
    const fb = b.fecha ?? ''
    return orden === 'reciente' ? fb.localeCompare(fa) : fa.localeCompare(fb)
  })

  return (
    <div className="p-6 md:p-8">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-slate-800">Informes</h1>
        <p className="text-sm text-slate-400 mt-0.5">
          {loading ? '…' : `${lista.length} informe${lista.length !== 1 ? 's' : ''}`} · historial de informes de ingreso y alta
        </p>
        {posibleTruncado && (
          <p className="text-xs text-amber-600 bg-amber-50 border border-amber-100 rounded-lg px-3 py-1.5 mt-2 inline-block">
            El historial es muy grande: puede que falten los informes más antiguos. Filtra por año para acotar la búsqueda.
          </p>
        )}
      </div>

      <div className="flex gap-3 mb-5 flex-wrap items-center">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
          <input
            className="input pl-9"
            placeholder="Buscar por paciente o NHC…"
            value={busqueda}
            onChange={e => setBusqueda(e.target.value)}
          />
        </div>

        <select className="input py-2 text-sm w-auto" value={filtroAnio} onChange={e => setFiltroAnio(e.target.value)}>
          <option value="todos">Todos los años</option>
          {anios.map(a => <option key={a} value={a}>{a}</option>)}
        </select>

        {(['todos', 'ingreso', 'alta'] as const).map(t => (
          <button key={t} type="button"
            onClick={() => setFiltroTipo(t)}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
              filtroTipo === t ? 'bg-primary-600 text-white' : 'bg-white border text-slate-500 hover:bg-slate-50'
            }`}>
            {t === 'todos' ? 'Todos' : t === 'ingreso' ? 'Informes de ingreso' : 'Informes de alta'}
          </button>
        ))}

        <button
          type="button"
          onClick={() => setOrden(o => o === 'reciente' ? 'antiguo' : 'reciente')}
          className="flex items-center gap-1.5 text-xs text-slate-500 hover:text-slate-700 ml-auto"
        >
          <ArrowUpDown className="w-3.5 h-3.5" />
          {orden === 'reciente' ? 'Más recientes primero' : 'Más antiguos primero'}
        </button>
      </div>

      <div className="card overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b bg-slate-50">
              <th className="px-4 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-wide">Tipo</th>
              <th className="px-4 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-wide">Informe</th>
              <th className="px-4 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-wide">Paciente</th>
              <th className="px-4 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-wide">NHC</th>
              <th className="px-4 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-wide">Fecha</th>
              <th className="px-4 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-wide">Médico</th>
              <th className="px-4 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-wide">Estado</th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {loading ? (
              <tr><td colSpan={7} className="px-4 py-12 text-center text-slate-400">Cargando…</td></tr>
            ) : lista.length === 0 ? (
              <tr><td colSpan={7} className="px-4 py-12 text-center text-slate-400">No hay informes con estos filtros.</td></tr>
            ) : lista.map(r => (
              <tr key={`${r.tipo}-${r.id}`}
                className="hover:bg-slate-50 transition-colors cursor-pointer"
                onClick={() => navigate(`/ingresos/${r.ingresoId}?tab=${r.tipo}`)}>
                <td className="px-4 py-3">
                  <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium ${
                    r.tipo === 'ingreso' ? 'bg-primary-50 text-primary-700' : 'bg-slate-100 text-slate-600'
                  }`}>
                    {r.tipo === 'ingreso' ? <FileText className="w-3 h-3" /> : <LogOut className="w-3 h-3" />}
                    {r.tipo === 'ingreso' ? 'Ingreso' : 'Alta'}
                  </span>
                </td>
                <td className="px-4 py-3">
                  {/* Antes, un informe recién creado y todavía sin
                      escribir se veía exactamente igual que uno
                      terminado — no había forma de distinguirlos. */}
                  <span className={`text-xs font-medium ${r.estadoInforme === 'sin_iniciar' ? 'text-slate-400 italic' : 'text-amber-600'}`}>
                    {r.estadoInforme === 'sin_iniciar' ? 'Sin iniciar' : 'Borrador'}
                  </span>
                </td>
                <td className="px-4 py-3 font-medium text-slate-800">{r.paciente}</td>
                <td className="px-4 py-3 text-slate-500 text-xs font-mono">{r.nhc || <span className="text-slate-300">—</span>}</td>
                <td className="px-4 py-3 text-slate-500 text-xs">
                  {r.fecha ? new Date(r.fecha).toLocaleDateString('es-ES') : '—'}
                </td>
                <td className="px-4 py-3 text-slate-500 text-xs">{r.medico}</td>
                <td className="px-4 py-3">
                  <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${ESTADO_COLOR[r.estadoIngreso] ?? 'bg-slate-100 text-slate-500'}`}>
                    {ESTADO_LABEL[r.estadoIngreso] ?? r.estadoIngreso}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
