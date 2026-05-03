import { useEffect, useState, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, Legend,
} from 'recharts'
import {
  AlertTriangle, Calendar, ChevronDown, X,
  Pencil, Trash2, TrendingUp, TrendingDown, Minus, Download,
} from 'lucide-react'
import FormularioEvento from '../components/FormularioEvento'
import {
  TIPO_EVENTO_LABEL, TIPO_EVENTO_COLOR,
  TURNO_LABEL, CAMPOS_POR_TIPO,
  type TipoEvento, type Evento,
} from '../types/eventos'

// ─── CONSTANTES ────────────────────────────────────────────────

const TIPOS_ORDEN: TipoEvento[] = [
  'caida', 'ulcera', 'contencion_fisica', 'agresividad_fisica',
  'fuga', 'infeccion_nosocomial', 'error_medicacion', 'efecto_adverso_medicacion',
]

// Colores para el gráfico de líneas (uno por tipo)
const LINEA_COLOR: Record<TipoEvento, string> = {
  caida: '#f97316',
  ulcera: '#ef4444',
  error_medicacion: '#a855f7',
  efecto_adverso_medicacion: '#ec4899',
  infeccion_nosocomial: '#eab308',
  contencion_fisica: '#3b82f6',
  agresividad_fisica: '#f43f5e',
  fuga: '#64748b',
}

// ─── HELPERS ──────────────────────────────────────────────────

function getDesde(periodo: string): string {
  const now = new Date()
  if (periodo === 'mes')       return new Date(now.getFullYear(), now.getMonth(), 1).toISOString().split('T')[0]
  if (periodo === 'trimestre') return new Date(now.getFullYear(), Math.floor(now.getMonth() / 3) * 3, 1).toISOString().split('T')[0]
  if (periodo === 'semestre')  return new Date(now.getFullYear(), now.getMonth() >= 6 ? 6 : 0, 1).toISOString().split('T')[0]
  if (periodo === 'anio')      return new Date(now.getFullYear(), 0, 1).toISOString().split('T')[0]
  return '2020-01-01'
}

function getPeriodoAnterior(periodo: string): [string, string] {
  const now = new Date()
  if (periodo === 'mes') {
    const ini = new Date(now.getFullYear(), now.getMonth() - 1, 1)
    const fin = new Date(now.getFullYear(), now.getMonth(), 0)
    return [ini.toISOString().split('T')[0], fin.toISOString().split('T')[0]]
  }
  if (periodo === 'trimestre') {
    const q = Math.floor(now.getMonth() / 3)
    const ini = new Date(now.getFullYear(), (q - 1) * 3, 1)
    const fin = new Date(now.getFullYear(), q * 3, 0)
    return [ini.toISOString().split('T')[0], fin.toISOString().split('T')[0]]
  }
  if (periodo === 'anio') {
    return [`${now.getFullYear() - 1}-01-01`, `${now.getFullYear() - 1}-12-31`]
  }
  return ['2020-01-01', getDesde(periodo)]
}

function mesLabel(ym: string) {
  return new Date(ym + '-01').toLocaleDateString('es-ES', { month: 'short', year: '2-digit' })
}

function variacion(actual: number, anterior: number): 'up' | 'down' | 'equal' {
  if (anterior === 0) return actual > 0 ? 'up' : 'equal'
  const pct = (actual - anterior) / anterior
  if (pct > 0.1) return 'up'
  if (pct < -0.1) return 'down'
  return 'equal'
}

// ─── SUBCOMPONENTES ────────────────────────────────────────────

function PeriodoSelector({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const [open, setOpen] = useState(false)
  const opciones = [
    { v: 'mes', l: 'Este mes' },
    { v: 'trimestre', l: 'Este trimestre' },
    { v: 'semestre', l: 'Este semestre' },
    { v: 'anio', l: 'Este año' },
    { v: 'todo', l: 'Todo el historial' },
  ]
  const label = opciones.find(o => o.v === value)?.l ?? value

  return (
    <div className="relative">
      <button onClick={() => setOpen(v => !v)} className="btn-secondary gap-2">
        <Calendar className="w-4 h-4" />
        {label}
        <ChevronDown className="w-3.5 h-3.5" />
      </button>
      {open && (
        <div className="absolute right-0 top-full mt-1 bg-white border rounded-xl shadow-lg z-10 overflow-hidden min-w-[170px]">
          {opciones.map(({ v, l }) => (
            <button key={v} onClick={() => { onChange(v); setOpen(false) }}
              className={`w-full text-left px-4 py-2.5 text-sm hover:bg-slate-50 transition-colors ${value === v ? 'text-primary-700 font-semibold' : 'text-slate-600'}`}>
              {l}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

function KpiCard({ tipo, n, nAnterior, tasa }: {
  tipo: TipoEvento; n: number; nAnterior: number; tasa: string
}) {
  const var_ = variacion(n, nAnterior)
  const colorClass = TIPO_EVENTO_COLOR[tipo]
  const pctDiff = nAnterior === 0
    ? null
    : Math.round(Math.abs((n - nAnterior) / nAnterior) * 100)

  return (
    <div className="card p-4 flex flex-col gap-2">
      <div className="flex items-start justify-between gap-2">
        <span className={`px-2 py-0.5 rounded-full text-xs font-semibold ${colorClass}`}>
          {TIPO_EVENTO_LABEL[tipo]}
        </span>
        {var_ === 'up' && (
          <span className="flex items-center gap-0.5 text-xs font-semibold text-red-600">
            <TrendingUp className="w-3.5 h-3.5" />
            {pctDiff != null ? `+${pctDiff}%` : ''}
          </span>
        )}
        {var_ === 'down' && (
          <span className="flex items-center gap-0.5 text-xs font-semibold text-emerald-600">
            <TrendingDown className="w-3.5 h-3.5" />
            {pctDiff != null ? `-${pctDiff}%` : ''}
          </span>
        )}
        {var_ === 'equal' && (
          <span className="flex items-center gap-0.5 text-xs text-slate-400">
            <Minus className="w-3.5 h-3.5" />
          </span>
        )}
      </div>
      <div>
        <p className="text-3xl font-bold text-slate-800 leading-none">{n}</p>
        <p className="text-xs text-slate-400 mt-1">{tasa} / 100 estancias</p>
      </div>
    </div>
  )
}

// ─── PÁGINA PRINCIPAL ─────────────────────────────────────────

export function Eventos() {
  const navigate = useNavigate()

  // ── Estado análisis ───────────────────────────────────────
  const [periodo, setPeriodo] = useState('trimestre')
  const [loadingAnalisis, setLoadingAnalisis] = useState(true)
  const [eventosActual, setEventosActual] = useState<any[]>([])
  const [eventosAnterior, setEventosAnterior] = useState<any[]>([])
  const [diasEstanciaActual, setDiasEstanciaActual] = useState(0)
  const [tiposVisibles, setTiposVisibles] = useState<Set<TipoEvento>>(new Set(TIPOS_ORDEN))

  // ── Estado listado ────────────────────────────────────────
  const [loadingLista, setLoadingLista] = useState(true)
  const [eventosLista, setEventosLista] = useState<any[]>([])
  const [filtroTipo, setFiltroTipo] = useState('')
  const [filtroDesde, setFiltroDesde] = useState('')
  const [filtroHasta, setFiltroHasta] = useState('')
  const [filtroPaciente, setFiltroPaciente] = useState('')
  const [modalEvento, setModalEvento] = useState<Evento | null>(null)
  const [editandoEvento, setEditandoEvento] = useState<Evento | null>(null)

  // ── Fetch análisis ────────────────────────────────────────
  useEffect(() => {
    fetchAnalisis()
  }, [periodo])

  async function fetchAnalisis() {
    setLoadingAnalisis(true)
    const desde = getDesde(periodo)
    const [iniAnt, finAnt] = getPeriodoAnterior(periodo)

    const [
      { data: evAct },
      { data: evAnt },
      { data: ings },
    ] = await Promise.all([
      supabase.from('eventos')
        .select('tipo, fecha, ingreso:ingresos(medico_responsable:profesionales(nombre,apellidos))')
        .gte('fecha', desde),
      supabase.from('eventos').select('tipo, fecha').gte('fecha', iniAnt).lte('fecha', finAnt),
      supabase.from('ingresos')
        .select('fecha_ingreso, fecha_alta, estado, medico_responsable:profesionales(nombre,apellidos)')
        .gte('fecha_ingreso', desde),
    ])

    setEventosActual(evAct ?? [])
    setEventosAnterior(evAnt ?? [])

    // Calcular días-estancia del periodo
    const hoy = new Date()
    const desdeDate = new Date(desde)
    const dias = (ings ?? []).reduce((sum: number, ing: any) => {
      const ini = new Date(Math.max(new Date(ing.fecha_ingreso).getTime(), desdeDate.getTime()))
      const fin = ing.fecha_alta ? new Date(ing.fecha_alta) : hoy
      const d = Math.max(0, Math.round((fin.getTime() - ini.getTime()) / 86400000))
      return sum + d
    }, 0)
    setDiasEstanciaActual(dias)
    setLoadingAnalisis(false)
  }

  // ── Fetch listado ─────────────────────────────────────────
  useEffect(() => {
    fetchLista()
  }, [filtroTipo, filtroDesde, filtroHasta])

  async function fetchLista() {
    setLoadingLista(true)
    let query = supabase
      .from('eventos')
      .select('*, registrado_por:profesionales(nombre,apellidos), ingreso:ingresos(habitacion, paciente:pacientes(nombre,primer_apellido))')
      .order('fecha', { ascending: false })
      .order('created_at', { ascending: false })
    if (filtroTipo)  query = query.eq('tipo', filtroTipo)
    if (filtroDesde) query = query.gte('fecha', filtroDesde)
    if (filtroHasta) query = query.lte('fecha', filtroHasta)
    const { data } = await query
    let list = data ?? []
    if (filtroPaciente.trim()) {
      const q = filtroPaciente.toLowerCase()
      list = list.filter((ev: any) => {
        const p = ev.ingreso?.paciente
        return p && `${p.primer_apellido} ${p.nombre}`.toLowerCase().includes(q)
      })
    }
    setEventosLista(list)
    setLoadingLista(false)
  }

  function handleBuscar() { setLoadingLista(true); fetchLista() }

  async function eliminarEvento(id: string) {
    if (!confirm('¿Eliminar este evento? Esta acción no se puede deshacer.')) return
    await supabase.from('eventos').delete().eq('id', id)
    setModalEvento(null)
    fetchLista()
    fetchAnalisis()
  }

  // ── Datos derivados para análisis ─────────────────────────

  const kpis = useMemo(() => TIPOS_ORDEN.map(tipo => {
    const n = eventosActual.filter(e => e.tipo === tipo).length
    const nAnt = eventosAnterior.filter(e => e.tipo === tipo).length
    const tasa = diasEstanciaActual > 0
      ? (n / diasEstanciaActual * 100).toFixed(1)
      : '—'
    return { tipo, n, nAnterior: nAnt, tasa }
  }), [eventosActual, eventosAnterior, diasEstanciaActual])

  // Datos para el gráfico de tendencia — agrupa por mes y tipo
  const tendenciaData = useMemo(() => {
    const map: Record<string, Record<TipoEvento, number>> = {}
    eventosActual.forEach((e: any) => {
      const mes = (e.fecha as string).slice(0, 7)
      if (!map[mes]) map[mes] = {} as Record<TipoEvento, number>
      map[mes][e.tipo as TipoEvento] = (map[mes][e.tipo as TipoEvento] ?? 0) + 1
    })
    return Object.entries(map)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([ym, counts]) => ({
        mes: mesLabel(ym),
        ...counts,
      }))
  }, [eventosActual])

  const totalActual = eventosActual.length
  const totalAnterior = eventosAnterior.length

  // Análisis por médico: eventos agrupados por médico responsable del ingreso
  const medicoData = useMemo(() => {
    const map: Record<string, { eventos: number; tipos: Partial<Record<TipoEvento, number>> }> = {}
    eventosActual.forEach((e: any) => {
      const med = e.ingreso?.medico_responsable
      const nombre = med ? `${med.nombre} ${med.apellidos}` : 'Sin asignar'
      if (!map[nombre]) map[nombre] = { eventos: 0, tipos: {} }
      map[nombre].eventos++
      map[nombre].tipos[e.tipo as TipoEvento] = (map[nombre].tipos[e.tipo as TipoEvento] ?? 0) + 1
    })
    return Object.entries(map)
      .map(([nombre, d]) => ({ nombre, ...d }))
      .sort((a, b) => b.eventos - a.eventos)
  }, [eventosActual])

  // Exportación CSV del listado actual
  function exportarCSV() {
    const ESTADO_LABEL: Record<string, string> = {
      manana: 'Mañana', tarde: 'Tarde', noche: 'Noche',
    }
    const filas = eventosLista.map((ev: any) => {
      const p = ev.ingreso?.paciente
      const paciente = p ? `${p.primer_apellido}, ${p.nombre}` : ''
      const campos = CAMPOS_POR_TIPO[ev.tipo as TipoEvento] ?? []
      const datosStr = campos
        .map(c => `${c.label}: ${ev.datos?.[c.key] ?? ''}`)
        .join(' | ')
      return [
        ev.fecha,
        ev.hora?.slice(0, 5) ?? '',
        ev.turno ? (ESTADO_LABEL[ev.turno] ?? ev.turno) : '',
        TIPO_EVENTO_LABEL[ev.tipo as TipoEvento] ?? ev.tipo,
        paciente,
        ev.ingreso?.habitacion ?? '',
        datosStr,
        ev.notas ?? '',
        ev.registrado_por ? `${ev.registrado_por.nombre} ${ev.registrado_por.apellidos}` : '',
      ].map(v => `"${String(v).replace(/"/g, '""')}"`).join(',')
    })
    const cabecera = ['Fecha', 'Hora', 'Turno', 'Tipo', 'Paciente', 'Habitación', 'Datos específicos', 'Notas', 'Registrado por']
      .map(v => `"${v}"`).join(',')
    const csv = '\uFEFF' + [cabecera, ...filas].join('\r\n')
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `eventos_${new Date().toISOString().split('T')[0]}.csv`
    a.click()
    URL.revokeObjectURL(url)
  }

  function toggleTipo(tipo: TipoEvento) {
    setTiposVisibles(prev => {
      const next = new Set(prev)
      next.has(tipo) ? next.delete(tipo) : next.add(tipo)
      return next
    })
  }

  // ── Render ────────────────────────────────────────────────

  return (
    <div className="p-6 space-y-6">

      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-800">Eventos adversos</h1>
          <p className="text-sm text-slate-400 mt-0.5">Seguimiento de incidencias y seguridad del paciente</p>
        </div>
        <PeriodoSelector value={periodo} onChange={setPeriodo} />
      </div>

      {/* ── BLOQUE ANÁLISIS ── */}
      {loadingAnalisis ? (
        <div className="text-slate-400 text-center py-10">Cargando análisis…</div>
      ) : (
        <>
          {/* KPI resumen total */}
          <div className="grid grid-cols-3 gap-3">
            <div className="card p-4 col-span-1">
              <p className="text-xs font-bold uppercase tracking-widest text-primary-600 mb-1">Total eventos</p>
              <p className="text-4xl font-bold text-slate-800">{totalActual}</p>
              <p className="text-xs text-slate-400 mt-1">
                {totalAnterior > 0
                  ? `Periodo anterior: ${totalAnterior} (${totalActual > totalAnterior ? '+' : ''}${totalActual - totalAnterior})`
                  : 'Sin datos periodo anterior'}
              </p>
            </div>
            <div className="card p-4 col-span-1">
              <p className="text-xs font-bold uppercase tracking-widest text-primary-600 mb-1">Días-estancia</p>
              <p className="text-4xl font-bold text-slate-800">{diasEstanciaActual}</p>
              <p className="text-xs text-slate-400 mt-1">Base para calcular tasas</p>
            </div>
            <div className="card p-4 col-span-1">
              <p className="text-xs font-bold uppercase tracking-widest text-primary-600 mb-1">Tasa global</p>
              <p className="text-4xl font-bold text-slate-800">
                {diasEstanciaActual > 0 ? (totalActual / diasEstanciaActual * 100).toFixed(2) : '—'}
              </p>
              <p className="text-xs text-slate-400 mt-1">Eventos / 100 días-estancia</p>
            </div>
          </div>

          {/* KPIs por tipo */}
          <section>
            <p className="section-title">Por tipo de evento</p>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              {kpis.map(k => (
                <KpiCard key={k.tipo} {...k} />
              ))}
            </div>
          </section>

          {/* Análisis por médico */}
          {medicoData.length > 0 && (
            <section>
              <p className="section-title">Por médico responsable</p>
              <div className="card overflow-hidden">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b bg-slate-50">
                      <th className="px-4 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-wide">Médico</th>
                      <th className="px-4 py-3 text-center text-xs font-semibold text-slate-500 uppercase tracking-wide">Total</th>
                      {TIPOS_ORDEN.map(t => (
                        <th key={t} className="px-3 py-3 text-center text-xs font-semibold text-slate-400 uppercase tracking-wide hidden md:table-cell">
                          {TIPO_EVENTO_LABEL[t].split(' ')[0]}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y">
                    {medicoData.map(m => (
                      <tr key={m.nombre} className="hover:bg-slate-50">
                        <td className="px-4 py-2.5 font-medium text-slate-800">{m.nombre}</td>
                        <td className="px-4 py-2.5 text-center font-bold text-slate-800">{m.eventos}</td>
                        {TIPOS_ORDEN.map(t => (
                          <td key={t} className="px-3 py-2.5 text-center text-slate-500 hidden md:table-cell">
                            {m.tipos[t] ? (
                              <span className={`px-1.5 py-0.5 rounded text-xs font-semibold ${TIPO_EVENTO_COLOR[t]}`}>
                                {m.tipos[t]}
                              </span>
                            ) : (
                              <span className="text-slate-200">—</span>
                            )}
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
          )}

          {/* Gráfico de tendencia */}
          {tendenciaData.length > 1 && (
            <section>
              <div className="flex items-center justify-between mb-3">
                <p className="section-title mb-0">Tendencia temporal</p>
                <div className="flex flex-wrap gap-1.5">
                  {TIPOS_ORDEN.map(tipo => (
                    <button
                      key={tipo}
                      onClick={() => toggleTipo(tipo)}
                      className={`px-2 py-0.5 rounded-full text-xs font-medium border transition-opacity ${
                        tiposVisibles.has(tipo) ? TIPO_EVENTO_COLOR[tipo] : 'bg-slate-100 text-slate-400 border-slate-200'
                      }`}
                    >
                      {TIPO_EVENTO_LABEL[tipo]}
                    </button>
                  ))}
                </div>
              </div>
              <div className="card p-5">
                <ResponsiveContainer width="100%" height={260}>
                  <LineChart data={tendenciaData}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="mes" tick={{ fontSize: 11 }} />
                    <YAxis tick={{ fontSize: 11 }} allowDecimals={false} />
                    <Tooltip />
                    <Legend wrapperStyle={{ fontSize: 11 }} />
                    {TIPOS_ORDEN.filter(t => tiposVisibles.has(t)).map(tipo => (
                      <Line
                        key={tipo}
                        type="monotone"
                        dataKey={tipo}
                        name={TIPO_EVENTO_LABEL[tipo]}
                        stroke={LINEA_COLOR[tipo]}
                        strokeWidth={2}
                        dot={{ r: 3 }}
                        connectNulls
                      />
                    ))}
                  </LineChart>
                </ResponsiveContainer>
              </div>
            </section>
          )}

          {tendenciaData.length <= 1 && totalActual > 0 && (
            <div className="card p-5 text-center text-slate-400 text-sm">
              Se necesitan datos de al menos 2 meses para mostrar la tendencia temporal.
            </div>
          )}
        </>
      )}

      {/* ── BLOQUE LISTADO ── */}
      <section>
        <div className="flex items-center justify-between mb-0">
          <p className="section-title mb-0">Registro de eventos</p>
          <button onClick={exportarCSV} disabled={eventosLista.length === 0}
            className="btn-secondary text-xs py-1.5 gap-1.5 disabled:opacity-40 disabled:cursor-not-allowed">
            <Download className="w-3.5 h-3.5" />
            Exportar CSV ({eventosLista.length})
          </button>
        </div>

        {/* Filtros */}
        <div className="card p-4 mb-4">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <div>
              <label className="label">Tipo</label>
              <select className="input" value={filtroTipo} onChange={e => setFiltroTipo(e.target.value)}>
                <option value="">Todos</option>
                {TIPOS_ORDEN.map(k => (
                  <option key={k} value={k}>{TIPO_EVENTO_LABEL[k]}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="label">Paciente</label>
              <input className="input" placeholder="Buscar por apellido…" value={filtroPaciente}
                onChange={e => setFiltroPaciente(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && handleBuscar()} />
            </div>
            <div>
              <label className="label">Desde</label>
              <input type="date" className="input" value={filtroDesde} onChange={e => setFiltroDesde(e.target.value)} />
            </div>
            <div>
              <label className="label">Hasta</label>
              <input type="date" className="input" value={filtroHasta} onChange={e => setFiltroHasta(e.target.value)} />
            </div>
          </div>
          <div className="flex justify-between items-center mt-3">
            <p className="text-xs text-slate-400">{eventosLista.length} resultado{eventosLista.length !== 1 ? 's' : ''}</p>
            <div className="flex gap-2">
              <button onClick={() => { setFiltroTipo(''); setFiltroDesde(''); setFiltroHasta(''); setFiltroPaciente('') }}
                className="btn-secondary text-xs py-1.5">
                Limpiar
              </button>
              <button onClick={handleBuscar} className="btn-primary text-xs py-1.5">
                Buscar
              </button>
            </div>
          </div>
        </div>

        {/* Lista */}
        {loadingLista ? (
          <div className="text-slate-400 text-center py-10">Cargando…</div>
        ) : eventosLista.length === 0 ? (
          <div className="card p-10 text-center text-slate-400 text-sm">No hay eventos con estos filtros.</div>
        ) : (
          <div className="space-y-2">
            {eventosLista.map((ev: any) => {
              const p = ev.ingreso?.paciente
              const hab = ev.ingreso?.habitacion
              const colorClass = TIPO_EVENTO_COLOR[ev.tipo as TipoEvento] ?? 'bg-slate-100 text-slate-600'
              return (
                <div key={ev.id}
                  className="card p-4 cursor-pointer hover:shadow-md transition-shadow"
                  onClick={() => setModalEvento(ev)}>
                  <div className="flex items-start gap-3">
                    <span className={`px-2 py-0.5 rounded-full text-xs font-semibold shrink-0 mt-0.5 ${colorClass}`}>
                      {TIPO_EVENTO_LABEL[ev.tipo as TipoEvento] ?? ev.tipo}
                    </span>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-medium text-sm text-slate-800">
                          {p ? `${p.primer_apellido}, ${p.nombre}` : '—'}
                        </span>
                        {hab && <span className="text-xs text-slate-400">Hab. {hab}</span>}
                      </div>
                      {Object.entries(ev.datos ?? {}).length > 0 && (
                        <div className="flex flex-wrap gap-x-4 gap-y-0.5 mt-1">
                          {Object.entries(ev.datos).map(([k, v]: any) => {
                            const campo = CAMPOS_POR_TIPO[ev.tipo as TipoEvento]?.find(c => c.key === k)
                            return (
                              <span key={k} className="text-xs text-slate-500">
                                <span className="capitalize">{campo?.label ?? k.replace(/_/g, ' ')}: </span>
                                <span className="font-medium text-slate-700">{v}</span>
                              </span>
                            )
                          })}
                        </div>
                      )}
                      {ev.notas && (
                        <p className="text-xs text-slate-500 italic mt-1 truncate">{ev.notas}</p>
                      )}
                    </div>
                    <div className="text-right shrink-0">
                      <p className="text-xs font-medium text-slate-600">
                        {new Date(ev.fecha).toLocaleDateString('es-ES')}
                        {ev.hora && ` · ${ev.hora.slice(0, 5)}`}
                      </p>
                      {ev.turno && (
                        <p className="text-xs text-slate-400">{TURNO_LABEL[ev.turno] ?? ev.turno}</p>
                      )}
                      {ev.registrado_por && (
                        <p className="text-xs text-slate-400 mt-1">
                          {ev.registrado_por.nombre} {ev.registrado_por.apellidos}
                        </p>
                      )}
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </section>

      {/* Modal detalle evento */}
      {modalEvento && !editandoEvento && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4"
          onClick={() => setModalEvento(null)}>
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md p-6"
            onClick={e => e.stopPropagation()}>
            <div className="flex justify-between items-start mb-4">
              <span className={`px-2 py-0.5 rounded-full text-xs font-semibold ${TIPO_EVENTO_COLOR[modalEvento.tipo] ?? 'bg-slate-100'}`}>
                {TIPO_EVENTO_LABEL[modalEvento.tipo] ?? modalEvento.tipo}
              </span>
              <button onClick={() => setModalEvento(null)} className="text-slate-400 hover:text-slate-600">
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="space-y-2 text-sm mb-5">
              {modalEvento.ingreso?.paciente && (
                <p>
                  <span className="font-medium">Paciente: </span>
                  <button
                    onClick={() => navigate(`/ingresos/${modalEvento.ingreso_id}`)}
                    className="text-primary-600 hover:underline">
                    {modalEvento.ingreso.paciente.primer_apellido}, {modalEvento.ingreso.paciente.nombre}
                  </button>
                </p>
              )}
              <p>
                <span className="font-medium">Fecha: </span>
                {new Date(modalEvento.fecha).toLocaleDateString('es-ES')}
                {modalEvento.hora && ` · ${modalEvento.hora.slice(0, 5)}`}
                {modalEvento.turno && ` · Turno ${TURNO_LABEL[modalEvento.turno] ?? modalEvento.turno}`}
              </p>
              {Object.entries(modalEvento.datos ?? {}).map(([k, v]: any) => {
                const campo = CAMPOS_POR_TIPO[modalEvento.tipo]?.find(c => c.key === k)
                return (
                  <p key={k}>
                    <span className="font-medium capitalize">{campo?.label ?? k.replace(/_/g, ' ')}: </span>{v}
                  </p>
                )
              })}
              {modalEvento.notas && (
                <p><span className="font-medium">Notas: </span>{modalEvento.notas}</p>
              )}
              {modalEvento.registrado_por && (
                <p className="text-slate-400 text-xs pt-2 border-t">
                  Registrado por {modalEvento.registrado_por.nombre} {modalEvento.registrado_por.apellidos}
                </p>
              )}
            </div>
            <div className="flex gap-2 pt-4 border-t">
              <button onClick={() => eliminarEvento(modalEvento.id)} className="btn-danger">
                <Trash2 className="w-4 h-4" /> Eliminar
              </button>
              <div className="flex-1" />
              <button onClick={() => setModalEvento(null)} className="btn-secondary">Cerrar</button>
              <button onClick={() => setEditandoEvento(modalEvento)} className="btn-primary">
                <Pencil className="w-4 h-4" /> Editar
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal edición */}
      {editandoEvento && (
        <FormularioEvento
          ingresoId={editandoEvento.ingreso_id}
          eventoExistente={editandoEvento}
          onClose={() => setEditandoEvento(null)}
          onGuardado={() => {
            setEditandoEvento(null)
            setModalEvento(null)
            fetchLista()
            fetchAnalisis()
          }}
        />
      )}
    </div>
  )
}
