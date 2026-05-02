import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  LineChart, Line, Legend
} from 'recharts'
import {
  Users, TrendingUp, Calendar, BedDouble,
  Activity, Clock, ChevronDown
} from 'lucide-react'

// ─── HELPERS ──────────────────────────────────────────────────

function calcEstanciaMedia(ingresos: any[]): number {
  const conAlta = ingresos.filter(i => i.fecha_alta && i.fecha_ingreso)
  if (!conAlta.length) return 0
  const total = conAlta.reduce((sum, i) => {
    return sum + Math.round((new Date(i.fecha_alta).getTime() - new Date(i.fecha_ingreso).getTime()) / 86400000)
  }, 0)
  return Math.round(total / conAlta.length)
}

function periodoLabel(p: string) {
  const map: Record<string, string> = {
    mes: 'Este mes', trimestre: 'Este trimestre', anio: 'Este año', todo: 'Todo el historial'
  }
  return map[p] ?? p
}

function getDesde(periodo: string): string {
  const now = new Date()
  if (periodo === 'mes') return new Date(now.getFullYear(), now.getMonth(), 1).toISOString().split('T')[0]
  if (periodo === 'trimestre') return new Date(now.getFullYear(), Math.floor(now.getMonth() / 3) * 3, 1).toISOString().split('T')[0]
  if (periodo === 'anio') return new Date(now.getFullYear(), 0, 1).toISOString().split('T')[0]
  return '2000-01-01'
}

// ─── STAT CARD ────────────────────────────────────────────────

function StatCard({ label, value, sub, icon: Icon, color = 'text-primary-600 bg-primary-50' }: {
  label: string; value: string | number; sub?: string
  icon: any; color?: string
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

// ─── DASHBOARD ────────────────────────────────────────────────

export function Dashboard() {
  const [periodo, setPeriodo] = useState('mes')
  const [loading, setLoading] = useState(true)
  const [ingresos, setIngresos] = useState<any[]>([])
  const [eventos, setEventos] = useState<any[]>([])
  const [pacientesActivos, setPacientesActivos] = useState<any[]>([])
  const [showPeriodo, setShowPeriodo] = useState(false)

  useEffect(() => {
    fetchData()
  }, [periodo])

  async function fetchData() {
    setLoading(true)
    const desde = getDesde(periodo)

    const [
      { data: ings },
      { data: evs },
      { data: activos },
    ] = await Promise.all([
      supabase.from('ingresos')
        .select('*, paciente:pacientes(sexo, fecha_nacimiento), medico_responsable:profesionales(nombre)')
        .gte('fecha_ingreso', desde)
        .order('fecha_ingreso', { ascending: true }),
      supabase.from('eventos')
        .select('*')
        .gte('fecha', desde),
      supabase.from('ingresos')
        .select('*, paciente:pacientes(fecha_nacimiento)')
        .eq('estado', 'activo'),
    ])

    setIngresos(ings ?? [])
    setEventos(evs ?? [])
    setPacientesActivos(activos ?? [])
    setLoading(false)
  }

  // ── KPIs básicos ─────────────────────────────────────────────
  const totalIngresos = ingresos.length
  const totalAltas = ingresos.filter(i => ['alta', 'alta_traslado'].includes(i.estado)).length
  const totalExitus = ingresos.filter(i => i.estado === 'exitus').length
  const estanciaMedia = calcEstanciaMedia(ingresos)
  const ocupacion = Math.round((pacientesActivos.length / 33) * 100)

  const edadMedia = (() => {
    const conFnac = pacientesActivos.filter(i => i.paciente?.fecha_nacimiento)
    if (!conFnac.length) return null
    const sum = conFnac.reduce((s: number, i: any) =>
      s + Math.floor((Date.now() - new Date(i.paciente.fecha_nacimiento).getTime()) / 31557600000), 0)
    return Math.round(sum / conFnac.length)
  })()

  const estanciasLargas = pacientesActivos.filter(i => {
    const dias = Math.floor((Date.now() - new Date(i.fecha_ingreso).getTime()) / 86400000)
    return dias > 60
  }).length

  // ── Distribución por sexo ────────────────────────────────────
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

  // ── Distribución por médico ──────────────────────────────────
  const medicoData = (() => {
    const map: Record<string, number> = {}
    ingresos.forEach(i => {
      const n = i.medico_responsable?.nombre ?? 'Sin asignar'
      map[n] = (map[n] ?? 0) + 1
    })
    return Object.entries(map).map(([name, value]) => ({ name, value }))
      .sort((a, b) => b.value - a.value)
  })()

  // ── Eventos adversos ─────────────────────────────────────────
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

  const eventosData = Object.keys(TIPO_LABEL).map(tipo => ({
    tipo,
    label: TIPO_LABEL[tipo],
    n: eventos.filter(e => e.tipo === tipo).length,
    color: TIPO_COLOR[tipo],
  })).filter(d => d.n > 0).sort((a, b) => b.n - a.n)


  // ── Evolución mensual ────────────────────────────────────────
  const evolucionData = (() => {
    const map: Record<string, { mes: string; ingresos: number; altas: number }> = {}
    ingresos.forEach(i => {
      const mes = i.fecha_ingreso.slice(0, 7)
      if (!map[mes]) map[mes] = { mes, ingresos: 0, altas: 0 }
      map[mes].ingresos++
      if (['alta', 'alta_traslado', 'exitus'].includes(i.estado) && i.fecha_alta) {
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

  // ── Eventos por mes ─────────────────────────────────────────
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
        {/* Selector de periodo */}
        <div className="relative">
          <button
            onClick={() => setShowPeriodo(v => !v)}
            className="btn-secondary gap-2">
            <Calendar className="w-4 h-4" />
            {periodoLabel(periodo)}
            <ChevronDown className="w-3.5 h-3.5" />
          </button>
          {showPeriodo && (
            <div className="absolute right-0 top-full mt-1 bg-white border rounded-xl shadow-lg z-10 overflow-hidden min-w-[160px]">
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
            <p className="section-title mb-3">Actividad asistencial · {periodoLabel(periodo)}</p>
            <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-3">
              <StatCard label="Ingresos" value={totalIngresos} icon={TrendingUp} color="text-primary-600 bg-primary-50" />
              <StatCard label="Altas" value={totalAltas} icon={Users} color="text-emerald-600 bg-emerald-50" />
              <StatCard label="Éxitus" value={totalExitus} icon={Activity} color="text-red-600 bg-red-50" />
              <StatCard label="Estancia media" value={estanciaMedia > 0 ? `${estanciaMedia}d` : '—'} icon={Clock} color="text-violet-600 bg-violet-50" />
              <StatCard label="Ocupación actual" value={`${ocupacion}%`} sub={`${pacientesActivos.length} / 33 camas`} icon={BedDouble} color="text-amber-600 bg-amber-50" />
              <StatCard label="Estancias >60d" value={estanciasLargas} icon={Calendar} color="text-orange-600 bg-orange-50" />
            </div>
          </section>

          {/* BLOQUE 2: Eventos adversos */}
          <section>
            <p className="section-title mb-3">Eventos adversos · {periodoLabel(periodo)}</p>
            {eventosData.length === 0 ? (
              <div className="card p-6 text-center text-slate-400 text-sm">Sin eventos registrados en este periodo.</div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {/* Tabla de eventos */}
                <div className="card overflow-hidden">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b bg-slate-50">
                        <th className="px-4 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-wide">Tipo</th>
                        <th className="px-4 py-3 text-center text-xs font-semibold text-slate-500 uppercase tracking-wide">N</th>
                        <th className="px-4 py-3 text-center text-xs font-semibold text-slate-500 uppercase tracking-wide">Tasa/100</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y">
                      {eventosData.map(e => (
                        <tr key={e.tipo} className="hover:bg-slate-50">
                          <td className="px-4 py-2.5">
                            <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${e.color}`}>
                              {e.label}
                            </span>
                          </td>
                          <td className="px-4 py-2.5 text-center font-bold text-slate-800">{e.n}</td>
                          <td className="px-4 py-2.5 text-center text-slate-500 text-xs">
                            {totalIngresos > 0 ? (e.n / totalIngresos * 100).toFixed(1) : '—'}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                {/* Gráfico de barras eventos */}
                <div className="card p-4">
                  <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-3">Distribución</p>
                  <ResponsiveContainer width="100%" height={200}>
                    <BarChart data={eventosData} layout="vertical" margin={{ left: 80, right: 20 }}>
                      <CartesianGrid strokeDasharray="3 3" horizontal={false} />
                      <XAxis type="number" tick={{ fontSize: 11 }} allowDecimals={false} />
                      <YAxis type="category" dataKey="label" tick={{ fontSize: 11 }} width={80} />
                      <Tooltip formatter={(v: number) => [v, 'Eventos']} />
                      <Bar dataKey="n" fill="#6175f5" radius={[0, 4, 4, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </div>
            )}
          </section>

          {/* BLOQUE 3: Perfil de pacientes */}
          <section>
            <p className="section-title mb-3">Perfil actual de pacientes ingresados</p>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              {/* Edad media */}
              <div className="card p-5 flex flex-col items-center justify-center text-center">
                <p className="text-4xl font-bold text-slate-800">{edadMedia ?? '—'}</p>
                <p className="text-sm text-slate-500 mt-1">Edad media (años)</p>
              </div>

              {/* Sexo */}
              <div className="card p-5">
                <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-3">Distribución por sexo</p>
                {sexoData.length === 0 ? (
                  <p className="text-slate-400 text-sm">Sin datos</p>
                ) : (
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

              {/* Por médico */}
              <div className="card p-5">
                <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-3">Por médico responsable</p>
                {medicoData.length === 0 ? (
                  <p className="text-slate-400 text-sm">Sin datos</p>
                ) : (
                  <div className="space-y-2">
                    {medicoData.map(m => {
                      const pct = Math.round(m.value / totalIngresos * 100)
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

          {/* BLOQUE 4: Evolución temporal */}
          {evolucionData.length > 1 && (
            <section>
              <p className="section-title mb-3">Evolución temporal</p>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {/* Ingresos y altas por mes */}
                <div className="card p-5">
                  <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-4">Ingresos y altas por mes</p>
                  <ResponsiveContainer width="100%" height={220}>
                    <LineChart data={evolucionData}>
                      <CartesianGrid strokeDasharray="3 3" />
                      <XAxis dataKey="mes" tick={{ fontSize: 11 }} />
                      <YAxis tick={{ fontSize: 11 }} allowDecimals={false} />
                      <Tooltip />
                      <Legend wrapperStyle={{ fontSize: 11 }} />
                      <Line type="monotone" dataKey="ingresos" stroke="#6175f5" strokeWidth={2} dot={{ r: 3 }} name="Ingresos" />
                      <Line type="monotone" dataKey="altas" stroke="#10b981" strokeWidth={2} dot={{ r: 3 }} name="Altas" />
                    </LineChart>
                  </ResponsiveContainer>
                </div>

                {/* Eventos por mes */}
                {eventosMesData.length > 1 && (
                  <div className="card p-5">
                    <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-4">Eventos adversos por mes</p>
                    <ResponsiveContainer width="100%" height={220}>
                      <BarChart data={eventosMesData}>
                        <CartesianGrid strokeDasharray="3 3" />
                        <XAxis dataKey="mes" tick={{ fontSize: 11 }} />
                        <YAxis tick={{ fontSize: 11 }} allowDecimals={false} />
                        <Tooltip formatter={(v: number) => [v, 'Eventos']} />
                        <Bar dataKey="eventos" fill="#f59e0b" radius={[4, 4, 0, 0]} name="Eventos" />
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
