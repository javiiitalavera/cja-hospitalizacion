import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  BarChart, Bar, LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, Cell,
} from 'recharts'
import { supabase } from '../lib/supabase'
import { nombreCompleto } from '../types'
import { ShieldAlert, ChevronDown, ChevronRight as ChevronRightIcon } from 'lucide-react'
import { TIPO_EVENTO_LABEL, TURNO_LABEL, type TipoEvento } from '../types/eventos'
import { formatFechaLocal as fmt } from '../lib/fechas'

// ─── CONSTANTES ────────────────────────────────────────────────

const TIPOS_ORDEN: TipoEvento[] = [
  'caida', 'ulcera', 'contencion_fisica', 'agresividad_fisica',
  'fuga', 'infeccion_nosocomial', 'error_medicacion', 'efecto_adverso_medicacion',
]

// Un color por tipo, coherente con los mismos tonos que ya usan las
// insignias del resto de la app, pero templados para gráficas.
const TIPO_EVENTO_HEX: Record<TipoEvento, string> = {
  caida: '#C2703D',
  ulcera: '#B84A4A',
  contencion_fisica: '#3C6084',
  agresividad_fisica: '#A54D5C',
  fuga: '#6B7280',
  infeccion_nosocomial: '#B99A3D',
  error_medicacion: '#7B5EA7',
  efecto_adverso_medicacion: '#B5637F',
}

const SUJECION_LABEL: Record<string, string> = { silla_ruedas: 'Silla de ruedas', sillon: 'Sillón', cama: 'Cama' }

const MESES = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic']

interface PacienteFila {
  ingresoId: string
  habitacion?: number
  nombre: string
  detalle: string // "continuo · Silla de ruedas" o "3× · última 20/08"
}

interface FilaEstado {
  tipo: TipoEvento
  pacientesAfectados: number
  totalIncidencias: number
  pacientes: PacienteFila[]
}

// Calcula [desde, hasta] para el periodo elegido en Tendencias.
function getRango(periodo: string, anioSel: number, mesSel: number | 'todos'): { desde: string; hasta: string } {
  const now = new Date()
  const hoy = fmt(now)
  if (periodo === 'mes') return { desde: fmt(new Date(now.getFullYear(), now.getMonth(), 1)), hasta: hoy }
  if (periodo === 'trimestre') return { desde: fmt(new Date(now.getFullYear(), Math.floor(now.getMonth() / 3) * 3, 1)), hasta: hoy }
  if (periodo === 'anio') return { desde: fmt(new Date(now.getFullYear(), 0, 1)), hasta: hoy }
  if (periodo === 'personalizado') {
    if (mesSel === 'todos') {
      const h = fmt(new Date(anioSel, 11, 31))
      return { desde: fmt(new Date(anioSel, 0, 1)), hasta: h > hoy ? hoy : h }
    }
    const h = fmt(new Date(anioSel, mesSel + 1, 0))
    return { desde: fmt(new Date(anioSel, mesSel, 1)), hasta: h > hoy ? hoy : h }
  }
  return { desde: '2000-01-01', hasta: hoy }
}

// ─── PÁGINA PRINCIPAL ─────────────────────────────────────────

export function Eventos() {
  const navigate = useNavigate()

  // ── Estado actual (todos los tipos, ingresos activos) ──────
  const [loadingEstado, setLoadingEstado] = useState(true)
  const [filasEstado, setFilasEstado] = useState<FilaEstado[]>([])
  const [filaContencion, setFilaContencion] = useState<FilaEstado | null>(null)
  const [expandido, setExpandido] = useState<string | null>(null)

  // ── Tendencias (periodo elegido) ────────────────────────────
  const [periodo, setPeriodo] = useState('trimestre')
  const [anioSel, setAnioSel] = useState(new Date().getFullYear())
  const [mesSel, setMesSel] = useState<number | 'todos'>('todos')
  const [showPeriodo, setShowPeriodo] = useState(false)
  const [loadingTendencias, setLoadingTendencias] = useState(true)
  const [eventosPeriodo, setEventosPeriodo] = useState<any[]>([])

  useEffect(() => { fetchEstadoActual() }, [])
  useEffect(() => { fetchTendencias() }, [periodo, anioSel, mesSel])

  // ── Carga: estado actual ────────────────────────────────────
  async function fetchEstadoActual() {
    setLoadingEstado(true)

    const [{ data: itemsData }, { data: eventosActivos }] = await Promise.all([
      supabase.from('items_paciente')
        .select(`
          sujecion_cama, sujecion_silla_ruedas, sujecion_sillon,
          ingreso:ingresos!inner(id, habitacion, estado, paciente:pacientes(nombre, primer_apellido, segundo_apellido))
        `)
        .eq('ingreso.estado', 'activo'),
      supabase.from('eventos')
        .select(`
          tipo, fecha,
          ingreso:ingresos!inner(id, habitacion, estado, paciente:pacientes(nombre, primer_apellido, segundo_apellido))
        `)
        .eq('ingreso.estado', 'activo'),
    ])

    // Contención física: es un ESTADO (¿sigue puesta ahora?), no un
    // recuento de eventos — se lee de la Hoja de Ítems, no del registro
    // de incidencias.
    const pacientesContencion: PacienteFila[] = []
    ;(itemsData ?? []).forEach((it: any) => {
      const ing = it.ingreso
      if (!ing?.paciente) return
      const cont: string[] = []
      if (it.sujecion_silla_ruedas === 'continuo') cont.push('silla_ruedas')
      if (it.sujecion_sillon === 'continuo') cont.push('sillon')
      if (Array.isArray(it.sujecion_cama) && it.sujecion_cama.length > 0) cont.push('cama')
      if (cont.length > 0) {
        pacientesContencion.push({
          ingresoId: ing.id,
          habitacion: ing.habitacion,
          nombre: nombreCompleto(ing.paciente),
          detalle: cont.map((c) => SUJECION_LABEL[c]).join(' · '),
        })
      }
    })
    setFilaContencion({
      tipo: 'contencion_fisica',
      pacientesAfectados: pacientesContencion.length,
      totalIncidencias: pacientesContencion.length,
      pacientes: pacientesContencion,
    })

    // El resto de tipos: recuento de incidencias YA registradas durante
    // el ingreso activo (esto sí es del registro de incidencias).
    const porTipo: Record<string, Map<string, PacienteFila & { n: number }>> = {}
    ;(eventosActivos ?? []).forEach((ev: any) => {
      if (ev.tipo === 'contencion_fisica') return // esa va aparte, como estado
      const ing = ev.ingreso
      if (!ing?.paciente) return
      if (!porTipo[ev.tipo]) porTipo[ev.tipo] = new Map()
      const mapa = porTipo[ev.tipo]
      const existente = mapa.get(ing.id)
      if (existente) {
        existente.n += 1
      } else {
        mapa.set(ing.id, {
          ingresoId: ing.id,
          habitacion: ing.habitacion,
          nombre: nombreCompleto(ing.paciente),
          detalle: '',
          n: 1,
        })
      }
    })

    const filas: FilaEstado[] = TIPOS_ORDEN
      .filter((t) => t !== 'contencion_fisica')
      .map((tipo) => {
        const mapa = porTipo[tipo] ?? new Map()
        const pacientes = Array.from(mapa.values())
          .sort((a, b) => b.n - a.n)
          .map((p) => ({ ...p, detalle: `${p.n}×` }))
        return {
          tipo,
          pacientesAfectados: pacientes.length,
          totalIncidencias: pacientes.reduce((s, p) => s + Number(p.detalle.replace('×', '')), 0),
          pacientes,
        }
      })

    setFilasEstado(filas)
    setLoadingEstado(false)
  }

  // ── Carga: tendencias ───────────────────────────────────────
  async function fetchTendencias() {
    setLoadingTendencias(true)
    const { desde, hasta } = getRango(periodo, anioSel, mesSel)
    const { data } = await supabase
      .from('eventos')
      .select('tipo, fecha, turno')
      .gte('fecha', desde)
      .lte('fecha', hasta)
    setEventosPeriodo(data ?? [])
    setLoadingTendencias(false)
  }

  function periodoLabel(): string {
    if (periodo === 'personalizado') return mesSel === 'todos' ? `Año ${anioSel}` : `${MESES[mesSel]} ${anioSel}`
    return { mes: 'Este mes', trimestre: 'Este trimestre', anio: 'Este año', todo: 'Todo el historial' }[periodo] ?? periodo
  }

  // ── Datos derivados para las gráficas ───────────────────────
  const porMes = (() => {
    const map: Record<string, number> = {}
    eventosPeriodo.forEach((ev) => {
      const clave = ev.fecha.slice(0, 7) // AAAA-MM
      map[clave] = (map[clave] ?? 0) + 1
    })
    return Object.entries(map)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([clave, total]) => {
        const [anio, mes] = clave.split('-')
        return { mes: `${MESES[Number(mes) - 1]} ${anio.slice(2)}`, total }
      })
  })()

  const porTipo = TIPOS_ORDEN
    .map((tipo) => ({
      tipo,
      label: TIPO_EVENTO_LABEL[tipo],
      total: eventosPeriodo.filter((ev) => ev.tipo === tipo).length,
    }))
    .filter((t) => t.total > 0)
    .sort((a, b) => b.total - a.total)

  const porTurno = (['manana', 'tarde', 'noche'] as const).map((t) => ({
    turno: TURNO_LABEL[t],
    total: eventosPeriodo.filter((ev) => ev.turno === t).length,
  }))

  // ── Render ────────────────────────────────────────────────

  return (
    <div className="p-6 space-y-8">

      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-slate-800">Incidencias</h1>
        <p className="text-sm text-slate-400 mt-0.5">Estado de seguridad de la planta y tendencias</p>
      </div>

      {/* ══════════════ ESTADO ACTUAL ══════════════ */}
      <section>
        <p className="section-title">Estado actual · ingresos activos</p>
        <div className="card overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b bg-slate-50 text-left text-xs font-semibold text-slate-500 uppercase tracking-wide">
                <th className="px-4 py-2.5 w-8"></th>
                <th className="px-4 py-2.5">Tipo</th>
                <th className="px-4 py-2.5 text-right">Pacientes afectados</th>
                <th className="px-4 py-2.5 text-right">Incidencias</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {loadingEstado ? (
                <tr><td colSpan={4} className="px-4 py-8 text-center text-slate-400">Cargando…</td></tr>
              ) : (
                <>
                  {filaContencion && (
                    <FilaEstadoActual
                      fila={filaContencion}
                      abierto={expandido === 'contencion_fisica'}
                      onToggle={() => setExpandido(e => e === 'contencion_fisica' ? null : 'contencion_fisica')}
                      onClickPaciente={(id) => navigate(`/ingresos/${id}`)}
                      nota="ahora mismo, no eventos registrados"
                      icono={<ShieldAlert className="w-3.5 h-3.5 text-red-500" />}
                    />
                  )}
                  {filasEstado.map((fila) => (
                    <FilaEstadoActual
                      key={fila.tipo}
                      fila={fila}
                      abierto={expandido === fila.tipo}
                      onToggle={() => setExpandido(e => e === fila.tipo ? null : fila.tipo)}
                      onClickPaciente={(id) => navigate(`/ingresos/${id}`)}
                    />
                  ))}
                </>
              )}
            </tbody>
          </table>
        </div>
      </section>

      {/* ══════════════ TENDENCIAS ══════════════ */}
      <section>
        <div className="flex items-center justify-between mb-3">
          <p className="section-title mb-0">Tendencias</p>
          <div className="relative">
            <button onClick={() => setShowPeriodo(s => !s)}
              className="btn-secondary text-xs py-1.5 gap-1.5">
              {periodoLabel()}
              <ChevronDown className="w-3.5 h-3.5" />
            </button>
            {showPeriodo && (
              <div className="absolute right-0 top-full mt-1 bg-white border rounded-xl shadow-lg z-10 overflow-hidden min-w-[220px]">
                {[
                  { v: 'mes', l: 'Este mes' },
                  { v: 'trimestre', l: 'Este trimestre' },
                  { v: 'anio', l: 'Este año' },
                  { v: 'todo', l: 'Todo el historial' },
                ].map(({ v, l }) => (
                  <button key={v}
                    onClick={() => { setPeriodo(v); setShowPeriodo(false) }}
                    className={`w-full text-left px-4 py-2.5 text-sm hover:bg-slate-50 transition-colors ${periodo === v ? 'text-primary-700 font-semibold' : 'text-slate-600'}`}>
                    {l}
                  </button>
                ))}
                <div className="border-t px-4 py-3">
                  <p className="text-[11px] font-semibold text-slate-400 uppercase tracking-wide mb-2">Mes y año concretos</p>
                  <div className="flex gap-2">
                    <select className="input py-1.5 text-xs flex-1" value={mesSel}
                      onChange={(e) => { setMesSel(e.target.value === 'todos' ? 'todos' : Number(e.target.value)); setPeriodo('personalizado') }}>
                      <option value="todos">Todo el año</option>
                      {MESES.map((m, i) => <option key={i} value={i}>{m}</option>)}
                    </select>
                    <select className="input py-1.5 text-xs w-24" value={anioSel}
                      onChange={(e) => { setAnioSel(Number(e.target.value)); setPeriodo('personalizado') }}>
                      {Array.from({ length: 6 }, (_, i) => new Date().getFullYear() - i).map((a) => (
                        <option key={a} value={a}>{a}</option>
                      ))}
                    </select>
                  </div>
                  {periodo === 'personalizado' && (
                    <button onClick={() => setShowPeriodo(false)} className="btn-primary text-xs py-1.5 w-full mt-2 justify-center">
                      Ver {periodoLabel()}
                    </button>
                  )}
                </div>
              </div>
            )}
          </div>
        </div>

        {loadingTendencias ? (
          <div className="card p-10 text-center text-slate-400 text-sm">Cargando…</div>
        ) : eventosPeriodo.length === 0 ? (
          <div className="card p-10 text-center text-slate-400 text-sm">No hay incidencias registradas en este periodo.</div>
        ) : (
          <div className="space-y-4">
            <div className="card p-5">
              <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-4">
                Incidencias por mes · {eventosPeriodo.length} en total
              </p>
              <ResponsiveContainer width="100%" height={200}>
                <LineChart data={porMes}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="mes" tick={{ fontSize: 11 }} />
                  <YAxis tick={{ fontSize: 11 }} allowDecimals={false} />
                  <Tooltip formatter={(v: number) => [v, 'Incidencias']} />
                  <Line type="monotone" dataKey="total" stroke="#1E3A5F" strokeWidth={2} dot={{ r: 3 }} name="Incidencias" />
                </LineChart>
              </ResponsiveContainer>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="card p-5">
                <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-4">Por tipo</p>
                <ResponsiveContainer width="100%" height={Math.max(180, porTipo.length * 34)}>
                  <BarChart data={porTipo} layout="vertical" margin={{ left: 8 }}>
                    <CartesianGrid strokeDasharray="3 3" horizontal={false} />
                    <XAxis type="number" tick={{ fontSize: 11 }} allowDecimals={false} />
                    <YAxis type="category" dataKey="label" tick={{ fontSize: 11 }} width={150} />
                    <Tooltip formatter={(v: number) => [v, 'Incidencias']} />
                    <Bar dataKey="total" radius={[0, 4, 4, 0]}>
                      {porTipo.map((entry) => (
                        <Cell key={entry.tipo} fill={TIPO_EVENTO_HEX[entry.tipo]} />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>

              <div className="card p-5">
                <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-4">Por turno</p>
                <ResponsiveContainer width="100%" height={200}>
                  <BarChart data={porTurno}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="turno" tick={{ fontSize: 11 }} />
                    <YAxis tick={{ fontSize: 11 }} allowDecimals={false} />
                    <Tooltip formatter={(v: number) => [v, 'Incidencias']} />
                    <Bar dataKey="total" fill="#3C6084" radius={[4, 4, 0, 0]} name="Incidencias" />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>
          </div>
        )}
      </section>
    </div>
  )
}

// ─── Fila de la tabla de estado actual, expandible ────────────

function FilaEstadoActual({ fila, abierto, onToggle, onClickPaciente, nota, icono }: {
  fila: FilaEstado
  abierto: boolean
  onToggle: () => void
  onClickPaciente: (ingresoId: string) => void
  nota?: string
  icono?: React.ReactNode
}) {
  return (
    <>
      <tr className="hover:bg-slate-50 transition-colors cursor-pointer" onClick={onToggle}>
        <td className="px-4 py-2.5 text-slate-400">
          {fila.pacientesAfectados > 0 && (abierto ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronRightIcon className="w-3.5 h-3.5" />)}
        </td>
        <td className="px-4 py-2.5 font-medium text-slate-700 flex items-center gap-1.5">
          {icono}
          {TIPO_EVENTO_LABEL[fila.tipo]}
          {nota && <span className="text-[10px] text-slate-400 font-normal">({nota})</span>}
        </td>
        <td className="px-4 py-2.5 text-right tabular-nums">
          {fila.pacientesAfectados === 0
            ? <span className="text-slate-300">—</span>
            : <span className="font-semibold text-slate-800">{fila.pacientesAfectados}</span>}
        </td>
        <td className="px-4 py-2.5 text-right tabular-nums text-slate-500">
          {fila.tipo === 'contencion_fisica' ? '—' : (fila.totalIncidencias || <span className="text-slate-300">—</span>)}
        </td>
      </tr>
      {abierto && fila.pacientes.length > 0 && (
        <tr>
          <td colSpan={4} className="bg-slate-50 px-4 py-2">
            <div className="space-y-1 py-1">
              {fila.pacientes.map((p) => (
                <div key={p.ingresoId}
                  className="flex items-center justify-between text-xs py-1 px-2 rounded hover:bg-white cursor-pointer"
                  onClick={(e) => { e.stopPropagation(); onClickPaciente(p.ingresoId) }}>
                  <span className="text-slate-600">
                    {p.nombre} {p.habitacion && <span className="text-slate-400">· Hab. {p.habitacion}</span>}
                  </span>
                  <span className="text-slate-500">{p.detalle}</span>
                </div>
              ))}
            </div>
          </td>
        </tr>
      )}
    </>
  )
}
