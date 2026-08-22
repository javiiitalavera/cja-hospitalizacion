import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  LineChart, Line, Legend
} from 'recharts'
import {
  Users, TrendingUp, Calendar, BedDouble,
  Activity, Clock, ChevronDown, ShieldAlert
} from 'lucide-react'

// ─── HELPERS ──────────────────────────────────────────────────

function calcEstanciaMedia(ingresos: any[]): number {
  const conAlta = ingresos.filter(i => i.fecha_alta && i.fecha_ingreso)
  if (!conAlta.length) return 0
  const total = conAlta.reduce((sum, i) =>
    sum + Math.round((new Date(i.fecha_alta).getTime() - new Date(i.fecha_ingreso).getTime()) / 86400000), 0)
  return Math.round(total / conAlta.length)
}

function calcDiasEstancia(ingresos: any[], desde: string): number {
  const hoy = new Date()
  const desdeDate = new Date(desde)
  return ingresos.reduce((sum: number, ing: any) => {
    const ini = new Date(Math.max(new Date(ing.fecha_ingreso).getTime(), desdeDate.getTime()))
    const fin = ing.fecha_alta ? new Date(ing.fecha_alta) : hoy
    return sum + Math.max(0, Math.round((fin.getTime() - ini.getTime()) / 86400000))
  }, 0)
}

const MESES = [
  'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
  'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre',
]

function fmt(d: Date): string { return d.toISOString().split('T')[0] }

function periodoLabel(p: string, anioSel: number, mesSel: number | 'todos'): string {
  if (p === 'personalizado') {
    return mesSel === 'todos' ? `Año ${anioSel}` : `${MESES[mesSel]} ${anioSel}`
  }
  const map: Record<string, string> = {
    mes: 'Este mes', trimestre: 'Este trimestre', anio: 'Este año', todo: 'Todo el historial'
  }
  return map[p] ?? p
}

// Calcula el rango [desde, hasta] según el periodo elegido. "hasta" nunca
// pasa de hoy, para no incluir fechas futuras por error.
function getRango(periodo: string, anioSel: number, mesSel: number | 'todos'): { desde: string; hasta: string } {
  const now = new Date()
  const hoy = fmt(now)

  if (periodo === 'mes') {
    return { desde: fmt(new Date(now.getFullYear(), now.getMonth(), 1)), hasta: hoy }
  }
  if (periodo === 'trimestre') {
    return { desde: fmt(new Date(now.getFullYear(), Math.floor(now.getMonth() / 3) * 3, 1)), hasta: hoy }
  }
  if (periodo === 'anio') {
    return { desde: fmt(new Date(now.getFullYear(), 0, 1)), hasta: hoy }
  }
  if (periodo === 'personalizado') {
    if (mesSel === 'todos') {
      const desde = fmt(new Date(anioSel, 0, 1))
      const hastaCalc = fmt(new Date(anioSel, 11, 31))
      return { desde, hasta: hastaCalc > hoy ? hoy : hastaCalc }
    }
    const desde = fmt(new Date(anioSel, mesSel, 1))
    const hastaCalc = fmt(new Date(anioSel, mesSel + 1, 0)) // día 0 del mes siguiente = último día del mes
    return { desde, hasta: hastaCalc > hoy ? hoy : hastaCalc }
  }
  // todo
  return { desde: '2000-01-01', hasta: hoy }
}

// ─── STAT CARD ────────────────────────────────────────────────

function StatCard({ label, value, sub, icon: Icon, color = 'text-primary-600 bg-primary-50' }: {
  label: string; value: string | number; sub?: string; icon: any; color?: string
}) {
  return (
    <div className="card p-5">
      <div className={`w-9 h-9 rounded-lg flex items-center justify-center mb-3 ${color}`}>
        <Icon className="w-5 h-5" />
      </div>
      <p className="text-2xl font-bold text-slate-800 leading-tight">{value}</p>
      <p className="text-xs text-slate-500 mt-0.5">{label}</p>
      {sub && <p className="text-xs text-slate-400 mt-0.5">{sub}</p>}
    </div>
  )
}

// Colores semáforo (hex para coincidir con Home.tsx)
const SEM_HEX: Record<string, string> = {
  verde: '#92D050', amarillo: '#FFFF00', naranja: '#FF9900', rojo: '#FF0000'
}
const SEM_LABEL: Record<string, string> = {
  verde: 'Verde', amarillo: 'Amarillo', naranja: 'Naranja', rojo: 'Rojo'
}
const SEM_ORDER = ['rojo', 'naranja', 'amarillo', 'verde']

// ─── DASHBOARD ────────────────────────────────────────────────

export function Dashboard() {
  const [periodo, setPeriodo] = useState('mes')
  const [anioSel, setAnioSel] = useState(new Date().getFullYear())
  const [mesSel, setMesSel] = useState<number | 'todos'>('todos')
  const [loading, setLoading] = useState(true)
  // Ingresos que solapan con el período (para días-estancia y altas reales)
  const [ingresosperiodo, setIngresosperiodo] = useState<any[]>([])
  // Ingresos nuevos en el período (para contar nuevos y evolución)
  const [ingresosNuevos, setIngresosNuevos] = useState<any[]>([])
  const [eventos, setEventos] = useState<any[]>([])
  // Pacientes activos ahora (snapshot)
  const [pacientesActivos, setPacientesActivos] = useState<any[]>([])
  // Para reingreso: todos los ingresos históricos del mismo paciente
  const [todosIngresos, setTodosIngresos] = useState<any[]>([])
  // Semáforo de caídas de pacientes activos
  const [semaforoItems, setSemaforoItems] = useState<any[]>([])
  const [showPeriodo, setShowPeriodo] = useState(false)

  useEffect(() => { fetchData() }, [periodo, anioSel, mesSel])

  async function fetchData() {
    setLoading(true)
    const { desde, hasta } = getRango(periodo, anioSel, mesSel)

    const [
      { data: ingsPeriodo },
      { data: ingsNuevos },
      { data: evs },
      { data: activos },
      { data: semItems },
    ] = await Promise.all([
      supabase.from('ingresos')
        .select('*, paciente:pacientes(sexo, fecha_nacimiento), medico_responsable:profesionales(nombre)')
        .or(`fecha_alta.gte.${desde},fecha_alta.is.null`)
        .lte('fecha_ingreso', hasta)
        .order('fecha_ingreso', { ascending: true }),
      supabase.from('ingresos')
        .select('fecha_ingreso, fecha_alta, estado, paciente_id, medico_responsable:profesionales(nombre)')
        .gte('fecha_ingreso', desde)
        .lte('fecha_ingreso', hasta)
        .order('fecha_ingreso', { ascending: true }),
      supabase.from('eventos').select('*').gte('fecha', desde).lte('fecha', hasta),
      supabase.from('ingresos')
        .select('id, fecha_ingreso, paciente_id, paciente:pacientes(sexo, fecha_nacimiento)')
        .eq('estado', 'activo'),
      // Semáforo de caídas de todos los pacientes activos
      supabase.from('items_paciente')
        .select('ingreso_id, semaforo_caidas'),
    ])

    const activosList = activos ?? []
    setPacientesActivos(activosList)
    setIngresosperiodo(ingsPeriodo ?? [])
    setIngresosNuevos(ingsNuevos ?? [])
    setEventos(evs ?? [])
    setSemaforoItems(semItems ?? [])

    // Para reingreso: cargar historial de los pacientes que ingresaron en el período
    const pacienteIds = [...new Set((ingsNuevos ?? []).map((i: any) => i.paciente_id).filter(Boolean))]
    if (pacienteIds.length > 0) {
      const { data: hist } = await supabase
        .from('ingresos')
        .select('id, paciente_id, fecha_ingreso, fecha_alta, estado')
        .in('paciente_id', pacienteIds)
        .order('fecha_ingreso', { ascending: true })
      setTodosIngresos(hist ?? [])
    } else {
      setTodosIngresos([])
    }

    setLoading(false)
  }

  const { desde } = getRango(periodo, anioSel, mesSel)

  // ── KPIs actividad (período) ──────────────────────────────────
  const totalIngresosNuevos = ingresosNuevos.length
  const totalAltas = ingresosperiodo.filter(i =>
    ['alta', 'alta_traslado'].includes(i.estado) && i.fecha_alta >= desde
  ).length
  const totalExitus = ingresosperiodo.filter(i =>
    i.estado === 'exitus' && i.fecha_alta >= desde
  ).length
  const estanciaMedia = calcEstanciaMedia(ingresosNuevos)
  const diasEstancia = calcDiasEstancia(ingresosperiodo, desde)

  // ── KPIs snapshot actual ──────────────────────────────────────
  const ocupacion = Math.round((pacientesActivos.length / 32) * 100)
  const estanciasLargas = pacientesActivos.filter(i => {
    const dias = Math.floor((Date.now() - new Date(i.fecha_ingreso).getTime()) / 86400000)
    return dias > 60
  }).length

  const edadMedia = (() => {
    const conFnac = pacientesActivos.filter(i => i.paciente?.fecha_nacimiento)
    if (!conFnac.length) return null
    const sum = conFnac.reduce((s: number, i: any) =>
      s + Math.floor((Date.now() - new Date(i.paciente.fecha_nacimiento).getTime()) / 31557600000), 0)
    return Math.round(sum / conFnac.length)
  })()

  const sexoData = (() => {
    const h = pacientesActivos.filter(i => i.paciente?.sexo === 'hombre').length
    const m = pacientesActivos.filter(i => i.paciente?.sexo === 'mujer').length
    const o = pacientesActivos.length - h - m
    return [
      { name: 'Hombre', value: h },
      { name: 'Mujer', value: m },
      ...(o > 0 ? [{ name: 'Otro', value: o }] : []),
    ].filter(d => d.value > 0)
  })()

  const medicoData = (() => {
    const map: Record<string, number> = {}
    ingresosNuevos.forEach(i => {
      const n = i.medico_responsable?.nombre ?? 'Sin asignar'
      map[n] = (map[n] ?? 0) + 1
    })
    return Object.entries(map).map(([name, value]) => ({ name, value }))
      .sort((a, b) => b.value - a.value)
  })()

  // ── Caídas con lesión ─────────────────────────────────────────
  const caidas = eventos.filter(e => e.tipo === 'caida')
  const caidasConLesion = caidas.filter(e => e.datos?.con_lesion === 'Sí')
  const tasaCaidas = diasEstancia > 0 ? (caidas.length / diasEstancia * 1000).toFixed(1) : '—'
  const tasaCaidasLesion = diasEstancia > 0 ? (caidasConLesion.length / diasEstancia * 1000).toFixed(1) : '—'
  const pctConLesion = caidas.length > 0
    ? Math.round(caidasConLesion.length / caidas.length * 100)
    : null

  // UPP: separar incidentes (durante ingreso) de prevalentes (al ingreso)
  const ulceras = eventos.filter(e => e.tipo === 'ulcera')
  const ulcerasIncidentes = ulceras.filter(e => e.datos?.momento === 'Durante el ingreso')
  const ulcerasPrevalentes = ulceras.filter(e => e.datos?.momento === 'Al ingreso')
  const tasaUlcerasIncidentes = diasEstancia > 0 ? (ulcerasIncidentes.length / diasEstancia * 1000).toFixed(1) : '—'

  // ── Reingreso a 30 días ───────────────────────────────────────
  // Un ingreso es "reingreso a 30 días" si el mismo paciente tuvo un alta
  // en los 30 días anteriores a la fecha_ingreso de este episodio
  const reingresos30 = ingresosNuevos.filter(ing => {
    if (!ing.paciente_id) return false
    const fechaActual = new Date(ing.fecha_ingreso)
    const hace30 = new Date(fechaActual)
    hace30.setDate(hace30.getDate() - 30)
    return todosIngresos.some(prev =>
      prev.paciente_id === ing.paciente_id &&
      prev.id !== ing.id &&
      prev.fecha_alta &&
      new Date(prev.fecha_alta) >= hace30 &&
      new Date(prev.fecha_alta) < fechaActual
    )
  })
  const tasaReingreso = totalAltas > 0
    ? Math.round(reingresos30.length / totalAltas * 100)
    : null

  // ── Semáforo de caídas (snapshot actual) ─────────────────────
  const activosIds = new Set(pacientesActivos.map((i: any) => i.id))
  const semaforoActivos = semaforoItems.filter(s => activosIds.has(s.ingreso_id))
  const semaforoConteo: Record<string, number> = { verde: 0, amarillo: 0, naranja: 0, rojo: 0, sin_asignar: 0 }
  pacientesActivos.forEach((ing: any) => {
    const item = semaforoActivos.find(s => s.ingreso_id === ing.id)
    const sem = item?.semaforo_caidas
    if (sem && semaforoConteo[sem] !== undefined) semaforoConteo[sem]++
    else semaforoConteo.sin_asignar++
  })

  // ── Incidencias ──────────────────────────────────────────
  const TIPO_LABEL: Record<string, string> = {
    caida: 'Caídas', ulcera: 'Úlceras', error_medicacion: 'Errores medicación',
    efecto_adverso_medicacion: 'Efectos adversos', infeccion_nosocomial: 'Infecciones',
    contencion_fisica: 'Contenciones', agresividad_fisica: 'Agresividad', fuga: 'Fugas',
  }
  const TIPO_COLOR: Record<string, string> = {
    caida: 'bg-orange-100 text-orange-700', ulcera: 'bg-red-100 text-red-700',
    error_medicacion: 'bg-purple-100 text-purple-700', efecto_adverso_medicacion: 'bg-pink-100 text-pink-700',
    infeccion_nosocomial: 'bg-yellow-100 text-yellow-700', contencion_fisica: 'bg-blue-100 text-blue-700',
    agresividad_fisica: 'bg-rose-100 text-rose-700', fuga: 'bg-slate-100 text-slate-700',
  }

  const eventosData = Object.keys(TIPO_LABEL).map(tipo => {
    const n = eventos.filter(e => e.tipo === tipo).length
    const tasa = diasEstancia > 0 ? (n / diasEstancia * 1000).toFixed(1) : '—'
    return { tipo, label: TIPO_LABEL[tipo], n, tasa, color: TIPO_COLOR[tipo] }
  }).filter(d => d.n > 0).sort((a, b) => b.n - a.n)

  // ── Evolución mensual ─────────────────────────────────────────
  const evolucionData = (() => {
    const map: Record<string, { mes: string; ingresos: number; altas: number }> = {}
    ingresosNuevos.forEach(i => {
      const mes = i.fecha_ingreso.slice(0, 7)
      if (!map[mes]) map[mes] = { mes, ingresos: 0, altas: 0 }
      map[mes].ingresos++
    })
    ingresosperiodo.forEach(i => {
      if (['alta', 'alta_traslado', 'exitus'].includes(i.estado) && i.fecha_alta && i.fecha_alta >= desde) {
        const mesAlta = i.fecha_alta.slice(0, 7)
        if (!map[mesAlta]) map[mesAlta] = { mes: mesAlta, ingresos: 0, altas: 0 }
        map[mesAlta].altas++
      }
    })
    return Object.values(map)
      .sort((a, b) => a.mes.localeCompare(b.mes))
      .map(d => ({
        ...d,
        mes: new Date(d.mes + '-01').toLocaleDateString('es-ES', { month: 'short', year: '2-digit' })
      }))
  })()

  const eventosMesData = (() => {
    const map: Record<string, number> = {}
    eventos.forEach(e => {
      const mes = e.fecha.slice(0, 7)
      map[mes] = (map[mes] ?? 0) + 1
    })
    return Object.entries(map)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([mes, n]) => ({
        mes: new Date(mes + '-01').toLocaleDateString('es-ES', { month: 'short', year: '2-digit' }),
        eventos: n,
      }))
  })()

  return (
    <div className="p-6">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-slate-800">Dashboard</h1>
          <p className="text-sm text-slate-400 mt-0.5">Indicadores asistenciales</p>
        </div>
        <div className="relative">
          <button onClick={() => setShowPeriodo(v => !v)} className="btn-secondary gap-2">
            <Calendar className="w-4 h-4" />
            {periodoLabel(periodo, anioSel, mesSel)}
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
              {/* Mes y año concretos */}
              <div className="border-t px-4 py-3">
                <p className="text-[11px] font-semibold text-slate-400 uppercase tracking-wide mb-2">Mes y año concretos</p>
                <div className="flex gap-2">
                  <select
                    className="input py-1.5 text-xs flex-1"
                    value={mesSel}
                    onChange={(e) => {
                      setMesSel(e.target.value === 'todos' ? 'todos' : Number(e.target.value))
                      setPeriodo('personalizado')
                    }}
                  >
                    <option value="todos">Todo el año</option>
                    {MESES.map((m, i) => <option key={i} value={i}>{m}</option>)}
                  </select>
                  <select
                    className="input py-1.5 text-xs w-24"
                    value={anioSel}
                    onChange={(e) => {
                      setAnioSel(Number(e.target.value))
                      setPeriodo('personalizado')
                    }}
                  >
                    {Array.from({ length: 6 }, (_, i) => new Date().getFullYear() - i).map((a) => (
                      <option key={a} value={a}>{a}</option>
                    ))}
                  </select>
                </div>
                {periodo === 'personalizado' && (
                  <button
                    onClick={() => setShowPeriodo(false)}
                    className="btn-primary text-xs py-1.5 w-full mt-2 justify-center"
                  >
                    Ver {periodoLabel('personalizado', anioSel, mesSel)}
                  </button>
                )}
              </div>
            </div>
          )}
        </div>
      </div>

      {loading ? (
        <div className="text-slate-400 text-center py-20">Cargando datos…</div>
      ) : (
        <div className="space-y-6">

          {/* BLOQUE 1: Actividad asistencial */}
          <section>
            <p className="section-title mb-3">Actividad asistencial · {periodoLabel(periodo, anioSel, mesSel)}</p>
            <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-3">
              <StatCard label="Ingresos nuevos" value={totalIngresosNuevos} icon={TrendingUp} color="text-primary-600 bg-primary-50" />
              <StatCard label="Altas" value={totalAltas} icon={Users} color="text-emerald-600 bg-emerald-50" />
              <StatCard label="Éxitus" value={totalExitus} icon={Activity} color="text-red-600 bg-red-50" />
              <StatCard label="Estancia media" value={estanciaMedia > 0 ? `${estanciaMedia}d` : '—'} sub="ingresos con alta en período" icon={Clock} color="text-violet-600 bg-violet-50" />
              <StatCard label="Días-estancia" value={diasEstancia} sub="base para tasas (/1.000)" icon={Calendar} color="text-sky-600 bg-sky-50" />
              <StatCard label="Estancias >60d" value={estanciasLargas} sub="pacientes actuales" icon={Calendar} color="text-orange-600 bg-orange-50" />
            </div>
          </section>

          {/* BLOQUE 2: Indicadores de seguridad */}
          <section>
            <p className="section-title mb-3">Seguridad del paciente · {periodoLabel(periodo, anioSel, mesSel)}</p>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">

              {/* Caídas con/sin lesión */}
              <div className="card p-5">
                <div className="flex items-center gap-2 mb-4">
                  <ShieldAlert className="w-4 h-4 text-orange-500" />
                  <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Caídas</p>
                </div>
                {caidas.length === 0 ? (
                  <p className="text-slate-400 text-sm">Sin caídas registradas</p>
                ) : (
                  <div className="space-y-3">
                    <div className="flex justify-between items-end">
                      <div>
                        <p className="text-3xl font-bold text-slate-800">{caidas.length}</p>
                        <p className="text-xs text-slate-400">total · tasa {tasaCaidas}/1.000 días-est.</p>
                      </div>
                      <div className="text-right">
                        <p className="text-2xl font-bold text-red-600">{caidasConLesion.length}</p>
                        <p className="text-xs text-slate-400">con lesión</p>
                      </div>
                    </div>
                    {pctConLesion !== null && (
                      <>
                        <div className="h-2 bg-slate-100 rounded-full overflow-hidden">
                          <div className="h-full bg-red-400 rounded-full transition-all" style={{ width: `${pctConLesion}%` }} />
                        </div>
                        <p className="text-xs text-slate-500">
                          {pctConLesion}% con lesión · tasa lesión {tasaCaidasLesion}/1.000 días-est.
                        </p>
                      </>
                    )}
                  </div>
                )}
              </div>

              {/* UPP */}
              <div className="card p-5">
                <div className="flex items-center gap-2 mb-4">
                  <ShieldAlert className="w-4 h-4 text-red-500" />
                  <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Úlceras por presión</p>
                </div>
                {ulceras.length === 0 ? (
                  <p className="text-slate-400 text-sm">Sin úlceras registradas</p>
                ) : (
                  <div className="space-y-3">
                    <div className="flex justify-between items-end">
                      <div>
                        <p className="text-3xl font-bold text-slate-800">{ulcerasIncidentes.length}</p>
                        <p className="text-xs text-slate-400">nosocomiales · tasa {tasaUlcerasIncidentes}/1.000 días-est.</p>
                      </div>
                      <div className="text-right">
                        <p className="text-2xl font-bold text-slate-500">{ulcerasPrevalentes.length}</p>
                        <p className="text-xs text-slate-400">al ingreso</p>
                      </div>
                    </div>
                    {ulceras.length > 0 && (
                      <div className="h-2 bg-slate-100 rounded-full overflow-hidden">
                        <div className="h-full bg-red-300 rounded-full transition-all"
                          style={{ width: `${Math.round(ulcerasIncidentes.length / ulceras.length * 100)}%` }} />
                      </div>
                    )}
                    <p className="text-xs text-slate-400">
                      {ulceras.length} total · {Math.round(ulcerasIncidentes.length / ulceras.length * 100)}% nosocomiales
                    </p>
                  </div>
                )}
              </div>

              {/* Reingreso a 30 días */}
              <div className="card p-5">
                <div className="flex items-center gap-2 mb-4">
                  <ShieldAlert className="w-4 h-4 text-violet-500" />
                  <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Reingreso a 30 días</p>
                </div>
                {totalAltas === 0 ? (
                  <p className="text-slate-400 text-sm">Sin altas en el período</p>
                ) : (
                  <div className="space-y-3">
                    <div className="flex justify-between items-end">
                      <div>
                        <p className="text-3xl font-bold text-slate-800">{reingresos30.length}</p>
                        <p className="text-xs text-slate-400">reingresos</p>
                      </div>
                      <div className="text-right">
                        <p className="text-2xl font-bold text-violet-600">{tasaReingreso}%</p>
                        <p className="text-xs text-slate-400">sobre {totalAltas} altas</p>
                      </div>
                    </div>
                    {tasaReingreso !== null && (
                      <div className="h-2 bg-slate-100 rounded-full overflow-hidden">
                        <div className="h-full bg-violet-400 rounded-full transition-all" style={{ width: `${Math.min(tasaReingreso, 100)}%` }} />
                      </div>
                    )}
                    <p className="text-xs text-slate-400">Ingresos no programados en ≤30 días desde el alta. Numerador: ingresos nuevos del período con alta previa ≤30d en el mismo paciente.</p>
                  </div>
                )}
              </div>

              {/* Semáforo de caídas — snapshot actual */}
              <div className="card p-5">
                <div className="flex items-center gap-2 mb-4">
                  <ShieldAlert className="w-4 h-4 text-amber-500" />
                  <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide">
                    Riesgo de caída <span className="normal-case font-normal text-slate-400">(actual)</span>
                  </p>
                </div>
                {pacientesActivos.length === 0 ? (
                  <p className="text-slate-400 text-sm">Sin pacientes activos</p>
                ) : (
                  <div className="space-y-2">
                    {SEM_ORDER.map(color => {
                      const n = semaforoConteo[color]
                      if (n === 0) return null
                      const pct = Math.round(n / pacientesActivos.length * 100)
                      return (
                        <div key={color}>
                          <div className="flex justify-between text-xs mb-1">
                            <span className="font-medium text-slate-700">{SEM_LABEL[color]}</span>
                            <span className="text-slate-500">{n} pac. ({pct}%)</span>
                          </div>
                          <div className="h-2 bg-slate-100 rounded-full overflow-hidden">
                            <div className="h-full rounded-full transition-all"
                              style={{ width: `${pct}%`, backgroundColor: SEM_HEX[color] }} />
                          </div>
                        </div>
                      )
                    })}
                    {semaforoConteo.sin_asignar > 0 && (
                      <p className="text-xs text-slate-400 pt-1">
                        {semaforoConteo.sin_asignar} sin semáforo asignado
                      </p>
                    )}
                  </div>
                )}
              </div>

            </div>
          </section>

          {/* BLOQUE 3: Snapshot actual */}
          <section>
            <p className="section-title mb-3">
              Situación actual{' '}
              <span className="normal-case font-normal text-slate-400">(snapshot — independiente del período)</span>
            </p>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              <StatCard label="Ocupación" value={`${ocupacion}%`} sub={`${pacientesActivos.length} / 32 camas`} icon={BedDouble} color="text-amber-600 bg-amber-50" />
              <StatCard label="Edad media" value={edadMedia ? `${edadMedia}a` : '—'} sub="pacientes actuales" icon={Users} color="text-violet-600 bg-violet-50" />
              <div className="card p-5">
                <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-3">Por sexo (actuales)</p>
                {sexoData.length === 0 ? <p className="text-slate-400 text-sm">Sin datos</p> : (
                  <div className="space-y-2">
                    {sexoData.map(s => {
                      const pct = Math.round(s.value / pacientesActivos.length * 100)
                      return (
                        <div key={s.name}>
                          <div className="flex justify-between text-xs mb-1">
                            <span className="text-slate-600 capitalize">{s.name}</span>
                            <span className="font-semibold text-slate-800">{s.value} ({pct}%)</span>
                          </div>
                          <div className="h-2 bg-slate-100 rounded-full overflow-hidden">
                            <div className="h-full bg-primary-500 rounded-full" style={{ width: `${pct}%` }} />
                          </div>
                        </div>
                      )
                    })}
                  </div>
                )}
              </div>
              <div className="card p-5">
                <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-3">Por médico · {periodoLabel(periodo, anioSel, mesSel)}</p>
                {medicoData.length === 0 ? <p className="text-slate-400 text-sm">Sin datos</p> : (
                  <div className="space-y-2">
                    {medicoData.map(m => {
                      const pct = totalIngresosNuevos > 0 ? Math.round(m.value / totalIngresosNuevos * 100) : 0
                      return (
                        <div key={m.name}>
                          <div className="flex justify-between text-xs mb-1">
                            <span className="text-slate-600">{m.name}</span>
                            <span className="font-semibold text-slate-800">{m.value} ({pct}%)</span>
                          </div>
                          <div className="h-2 bg-slate-100 rounded-full overflow-hidden">
                            <div className="h-full bg-violet-500 rounded-full" style={{ width: `${pct}%` }} />
                          </div>
                        </div>
                      )
                    })}
                  </div>
                )}
              </div>
            </div>
          </section>

          {/* BLOQUE 4: Incidencias */}
          <section>
            <p className="section-title mb-3">Incidencias · {periodoLabel(periodo, anioSel, mesSel)}</p>
            {eventosData.length === 0 ? (
              <div className="card p-6 text-center text-slate-400 text-sm">Sin incidencias registradas en este periodo.</div>
            ) : (
              <div className="card overflow-hidden">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b bg-slate-50">
                      <th className="px-4 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-wide">Tipo</th>
                      <th className="px-4 py-3 text-center text-xs font-semibold text-slate-500 uppercase tracking-wide">N</th>
                      <th className="px-4 py-3 text-center text-xs font-semibold text-slate-500 uppercase tracking-wide">Tasa / 1.000 días-est.</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y">
                    {eventosData.map(e => (
                      <tr key={e.tipo} className="hover:bg-slate-50">
                        <td className="px-4 py-2.5">
                          <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${e.color}`}>{e.label}</span>
                        </td>
                        <td className="px-4 py-2.5 text-center font-bold text-slate-800">{e.n}</td>
                        <td className="px-4 py-2.5 text-center text-slate-500 text-xs">{e.tasa}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>

          {/* BLOQUE 5: Evolución temporal */}
          {evolucionData.length > 1 && (
            <section>
              <p className="section-title mb-3">Evolución temporal · {periodoLabel(periodo, anioSel, mesSel)}</p>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="card p-5">
                  <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-4">Ingresos y altas por mes</p>
                  <ResponsiveContainer width="100%" height={220}>
                    <LineChart data={evolucionData}>
                      <CartesianGrid strokeDasharray="3 3" />
                      <XAxis dataKey="mes" tick={{ fontSize: 11 }} />
                      <YAxis tick={{ fontSize: 11 }} allowDecimals={false} />
                      <Tooltip />
                      <Legend wrapperStyle={{ fontSize: 11 }} />
                      <Line type="monotone" dataKey="ingresos" stroke="#6175f5" strokeWidth={2} dot={{ r: 3 }} name="Ingresos nuevos" />
                      <Line type="monotone" dataKey="altas" stroke="#10b981" strokeWidth={2} dot={{ r: 3 }} name="Altas / éxitus" />
                    </LineChart>
                  </ResponsiveContainer>
                </div>
                {eventosMesData.length > 1 && (
                  <div className="card p-5">
                    <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-4">Incidencias por mes</p>
                    <ResponsiveContainer width="100%" height={220}>
                      <BarChart data={eventosMesData}>
                        <CartesianGrid strokeDasharray="3 3" />
                        <XAxis dataKey="mes" tick={{ fontSize: 11 }} />
                        <YAxis tick={{ fontSize: 11 }} allowDecimals={false} />
                        <Tooltip formatter={(v: number) => [v, 'Incidencias']} />
                        <Bar dataKey="eventos" fill="#f59e0b" radius={[4, 4, 0, 0]} name="Incidencias" />
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                )}
              </div>
            </section>
          )}

        </div>
      )}
    </div>
  )
}
