import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { escapeHtml } from '../lib/imprimir'
import {
  BarChart, Bar, LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, Cell,
} from 'recharts'
import { supabase } from '../lib/supabase'
import { nombreCompleto } from '../types'
import { ChevronDown, ChevronRight as ChevronRightIcon, Download, Printer } from 'lucide-react'
import { TIPO_EVENTO_LABEL, TURNO_LABEL, CAMPOS_POR_TIPO, type TipoEvento } from '../types/eventos'
import { formatFechaLocal as fmt } from '../lib/fechas'
import {
  severidadDia, severidadNoche, SEVERIDAD_ESTILO, necesitaConfirmacion, NOCHE_ES_CONTENCION,
  CONTENCION_DIA_LABEL, CONTENCION_NOCHE_LABEL,
  type ContencionDia, type ContencionNoche,
} from '../types/contenciones'
import ModalContencion from '../components/ModalContencion'
import FormularioEvento from '../components/FormularioEvento'
import { Plus } from 'lucide-react'

// ─── CONSTANTES ────────────────────────────────────────────────

const TIPOS_ORDEN: TipoEvento[] = [
  'caida', 'ulcera', 'agresividad_fisica',
  'fuga', 'infeccion_nosocomial', 'error_medicacion', 'efecto_adverso_medicacion',
]

// Un color por tipo, coherente con los mismos tonos que ya usan las
// insignias del resto de la app, pero templados para gráficas.
const TIPO_EVENTO_HEX: Record<TipoEvento, string> = {
  caida: '#C2703D',
  ulcera: '#B84A4A',
  agresividad_fisica: '#A54D5C',
  fuga: '#6B7280',
  infeccion_nosocomial: '#B99A3D',
  error_medicacion: '#7B5EA7',
  efecto_adverso_medicacion: '#B5637F',
}

const MESES = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic']

interface EventoActivo {
  id: string
  tipo: TipoEvento
  fecha: string
  hora?: string
  turno?: string
  datos: Record<string, string>
  notas?: string
  registrado_por?: { nombre: string; apellidos: string }
  ingreso: {
    id: string
    habitacion?: number
    paciente: { nombre: string; primer_apellido: string; segundo_apellido?: string }
  }
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

function escaparCsv(v: string): string {
  return `"${v.replace(/"/g, '""')}"`
}

// ─── PÁGINA PRINCIPAL ─────────────────────────────────────────

export function Eventos() {
  const navigate = useNavigate()

  // ── Registrar incidencia desde esta misma página — antes solo se
  // podía hacer entrando primero en la ficha de un paciente concreto.
  const [selectorPaciente, setSelectorPaciente] = useState(false)
  const [busquedaPaciente, setBusquedaPaciente] = useState('')
  const [pacientesActivos, setPacientesActivos] = useState<any[]>([])
  const [ingresoParaIncidencia, setIngresoParaIncidencia] = useState<string | null>(null)

  useEffect(() => {
    if (!selectorPaciente) return
    supabase
      .from('ingresos')
      .select('id, habitacion, paciente:pacientes(nombre, primer_apellido, segundo_apellido)')
      .eq('estado', 'activo')
      .then(({ data }) => setPacientesActivos(data ?? []))
  }, [selectorPaciente])

  const pacientesFiltrados = pacientesActivos.filter((i) =>
    nombreCompleto(i.paciente).toLowerCase().includes(busquedaPaciente.toLowerCase())
  )

  // ── Contenciones activas (ingresos activos) ─────────────────
  const [loadingContenciones, setLoadingContenciones] = useState(true)
  const [contenciones, setContenciones] = useState<any[]>([])
  const [errorContenciones, setErrorContenciones] = useState('')
  const [modalContencion, setModalContencion] = useState<string | null>(null)

  useEffect(() => { fetchContenciones() }, [])

  async function fetchContenciones() {
    setLoadingContenciones(true)
    setErrorContenciones('')
    try {
      const { data, error } = await supabase
        .from('contenciones')
        .select(`
          ingreso_id, dia, noche, actualizado_en,
          ingreso:ingresos!inner(id, habitacion, estado, paciente:pacientes(nombre, primer_apellido, segundo_apellido))
        `)
        .eq('ingreso.estado', 'activo')
      if (error) {
        // Un error real (tabla caída, RLS, red...) no es lo mismo que
        // "ningún paciente tiene contención" — si se confunden, esta
        // pantalla podría dar una falsa sensación de seguridad.
        setErrorContenciones('No se pudieron cargar las contenciones: ' + error.message)
        return
      }
      // Solo interesa aquí lo que cuenta como contención de verdad
      // (lo mismo que exige confirmación médica) — las medidas de
      // seguridad puras (barras, cota cero, sensor) no son contención
      // y no deben aparecer en este listado.
      const activas = (data ?? []).filter((c: any) => necesitaConfirmacion(c.dia, c.noche))
      setContenciones(activas)
    } finally {
      setLoadingContenciones(false)
    }
  }

  // ── Estado actual (todos los tipos, ingresos activos) ──────
  const [loadingEstado, setLoadingEstado] = useState(true)
  const [errorEstado, setErrorEstado] = useState('')
  const [eventosActivos, setEventosActivos] = useState<EventoActivo[]>([])
  const [expandido, setExpandido] = useState<TipoEvento | null>(null)

  // ── Tendencias (periodo elegido) ────────────────────────────
  const [periodo, setPeriodo] = useState('trimestre')
  const [anioSel, setAnioSel] = useState(new Date().getFullYear())
  const [mesSel, setMesSel] = useState<number | 'todos'>('todos')
  const [showPeriodo, setShowPeriodo] = useState(false)
  const [loadingTendencias, setLoadingTendencias] = useState(true)
  const [errorTendencias, setErrorTendencias] = useState('')
  const [eventosPeriodo, setEventosPeriodo] = useState<any[]>([])

  useEffect(() => { fetchEstadoActual() }, [])
  useEffect(() => { fetchTendencias() }, [periodo, anioSel, mesSel])

  // ── Carga: estado actual ────────────────────────────────────
  // Igual para las ocho incidencias, incluida contención física: se
  // muestra el registro real de incidencias, no un estado derivado de
  // la Hoja de Ítems, porque cada incidencia tiene sus propias columnas
  // (motivo, duración, autorización...) que sí sirven para una tabla
  // exportable, y "sujeción puesta ahora mismo" no las tiene.
  async function fetchEstadoActual() {
    setLoadingEstado(true)
    setErrorEstado('')
    try {
      const { data, error: err } = await supabase
        .from('eventos')
        .select(`
          id, tipo, fecha, hora, turno, datos, notas,
          registrado_por:profesionales(nombre, apellidos),
          ingreso:ingresos!inner(id, habitacion, estado, paciente:pacientes(nombre, primer_apellido, segundo_apellido))
        `)
        .eq('ingreso.estado', 'activo')
        .order('fecha', { ascending: false })
      if (err) {
        setErrorEstado('No se pudo cargar el estado actual: ' + err.message)
        return
      }
      setEventosActivos((data ?? []) as unknown as EventoActivo[])
    } finally {
      setLoadingEstado(false)
    }
  }

  // ── Carga: tendencias ───────────────────────────────────────
  async function fetchTendencias() {
    setLoadingTendencias(true)
    setErrorTendencias('')
    try {
      const { desde, hasta } = getRango(periodo, anioSel, mesSel)
      const { data, error: err } = await supabase
        .from('eventos')
        .select('tipo, fecha, turno')
        .gte('fecha', desde)
        .lte('fecha', hasta)
      if (err) {
        setErrorTendencias('No se pudieron cargar las tendencias: ' + err.message)
        return
      }
      setEventosPeriodo(data ?? [])
    } finally {
      setLoadingTendencias(false)
    }
  }

  function periodoLabel(): string {
    if (periodo === 'personalizado') return mesSel === 'todos' ? `Año ${anioSel}` : `${MESES[mesSel]} ${anioSel}`
    return { mes: 'Este mes', trimestre: 'Este trimestre', anio: 'Este año', todo: 'Todo el historial' }[periodo] ?? periodo
  }

  // ── Resumen por tipo, para la fila compacta ─────────────────
  const resumenPorTipo = TIPOS_ORDEN.map((tipo) => {
    const delTipo = eventosActivos.filter((e) => e.tipo === tipo)
    const pacientesAfectados = new Set(delTipo.map((e) => e.ingreso.id)).size
    return { tipo, pacientesAfectados, totalIncidencias: delTipo.length }
  })

  // ── Exportar / imprimir una tabla de tipo concreto ──────────
  function filasDelTipo(tipo: TipoEvento): EventoActivo[] {
    return eventosActivos.filter((e) => e.tipo === tipo)
  }

  function exportarCSV(tipo: TipoEvento) {
    const campos = CAMPOS_POR_TIPO[tipo]
    const cabecera = ['Fecha', 'Turno', 'Paciente', 'Habitación', ...campos.map((c) => c.label), 'Notas', 'Registrado por']
      .map(escaparCsv).join(',')
    const filas = filasDelTipo(tipo).map((ev) => [
      ev.fecha,
      ev.turno ? TURNO_LABEL[ev.turno] : '',
      nombreCompleto(ev.ingreso.paciente),
      ev.ingreso.habitacion?.toString() ?? '',
      ...campos.map((c) => ev.datos?.[c.key] ?? ''),
      ev.notas ?? '',
      ev.registrado_por ? `${ev.registrado_por.nombre} ${ev.registrado_por.apellidos}` : '',
    ].map((v) => escaparCsv(String(v))).join(','))
    const csv = '\uFEFF' + [cabecera, ...filas].join('\r\n')
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `${tipo}_${fmt(new Date())}.csv`
    a.click()
    URL.revokeObjectURL(url)
  }

  function imprimirTabla(tipo: TipoEvento) {
    const campos = CAMPOS_POR_TIPO[tipo]
    const filas = filasDelTipo(tipo)
    const win = window.open('', '_blank')
    if (!win) return
    let html = `<html><head><title>${TIPO_EVENTO_LABEL[tipo]}</title>
      <style>
        body { font-family: Arial, sans-serif; padding: 24px; }
        h1 { font-size: 16pt; margin-bottom: 4px; }
        p { color: #666; font-size: 9pt; margin-top: 0; margin-bottom: 16px; }
        table { border-collapse: collapse; width: 100%; font-size: 8.5pt; }
        th, td { border: 1px solid #ccc; padding: 4px 6px; text-align: left; }
        th { background: #f1f5f9; }
      </style></head><body>
      <h1>${TIPO_EVENTO_LABEL[tipo]}</h1>
      <p>Ingresos activos · generado ${new Date().toLocaleDateString('es-ES')}</p>
      <table><thead><tr>
        <th>Fecha</th><th>Turno</th><th>Paciente</th><th>Hab.</th>
        ${campos.map((c) => `<th>${escapeHtml(c.label)}</th>`).join('')}
        <th>Notas</th><th>Registrado por</th>
      </tr></thead><tbody>`
    filas.forEach((ev) => {
      html += `<tr>
        <td>${new Date(ev.fecha).toLocaleDateString('es-ES')}</td>
        <td>${ev.turno ? escapeHtml(TURNO_LABEL[ev.turno]) : ''}</td>
        <td>${escapeHtml(nombreCompleto(ev.ingreso.paciente))}</td>
        <td>${ev.ingreso.habitacion ?? ''}</td>
        ${campos.map((c) => `<td>${escapeHtml(String(ev.datos?.[c.key] ?? ''))}</td>`).join('')}
        <td>${escapeHtml(ev.notas ?? '')}</td>
        <td>${ev.registrado_por ? escapeHtml(`${ev.registrado_por.nombre} ${ev.registrado_por.apellidos}`) : ''}</td>
      </tr>`
    })
    html += '</tbody></table></body></html>'
    win.document.write(html)
    win.document.close()
    win.focus()
    win.print()
  }

  function imprimirContenciones() {
    const win = window.open('', '_blank')
    if (!win) return
    let html = `<html><head><title>Contenciones activas</title>
      <style>
        body { font-family: Arial, sans-serif; padding: 24px; }
        h1 { font-size: 16pt; margin-bottom: 4px; }
        p { color: #666; font-size: 9pt; margin-top: 0; margin-bottom: 16px; }
        table { border-collapse: collapse; width: 100%; font-size: 8.5pt; }
        th, td { border: 1px solid #ccc; padding: 4px 6px; text-align: left; }
        th { background: #f1f5f9; }
      </style></head><body>
      <h1>Contenciones activas</h1>
      <p>Ingresos activos · generado ${new Date().toLocaleDateString('es-ES')}</p>
      <table><thead><tr>
        <th>Hab.</th><th>Paciente</th><th>Día</th><th>Noche</th><th>Última revisión</th>
      </tr></thead><tbody>`
    contenciones.forEach((c) => {
      const nocheReal = ((c.noche as ContencionNoche[]) ?? []).filter((n) => NOCHE_ES_CONTENCION.includes(n))
      html += `<tr>
        <td>${c.ingreso.habitacion ?? ''}</td>
        <td>${escapeHtml(nombreCompleto(c.ingreso.paciente))}</td>
        <td>${c.dia && c.dia !== 'ninguna' ? escapeHtml(CONTENCION_DIA_LABEL[c.dia as ContencionDia]) : ''}</td>
        <td>${nocheReal.map((n) => escapeHtml(CONTENCION_NOCHE_LABEL[n])).join(', ')}</td>
        <td>${c.actualizado_en ? new Date(c.actualizado_en).toLocaleDateString('es-ES') : ''}</td>
      </tr>`
    })
    html += '</tbody></table></body></html>'
    win.document.write(html)
    win.document.close()
    win.focus()
    win.print()
  }


  const porMes = (() => {
    const map: Record<string, number> = {}
    eventosPeriodo.forEach((ev) => {
      const clave = ev.fecha.slice(0, 7)
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
    <div className="p-6 md:p-8 space-y-8">

      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-800">Incidencias</h1>
          <p className="text-sm text-slate-400 mt-0.5">Estado de seguridad de la planta y tendencias</p>
        </div>
        <button onClick={() => setSelectorPaciente(true)} className="btn-primary">
          <Plus className="w-4 h-4" />
          Registrar incidencia
        </button>
      </div>

      {selectorPaciente && !ingresoParaIncidencia && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4" onClick={() => setSelectorPaciente(false)}>
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm p-5 space-y-3" onClick={(e) => e.stopPropagation()}>
            <h3 className="font-bold text-slate-800">¿De qué paciente?</h3>
            <input
              autoFocus
              className="input"
              placeholder="Buscar por nombre…"
              value={busquedaPaciente}
              onChange={(e) => setBusquedaPaciente(e.target.value)}
            />
            <div className="max-h-64 overflow-y-auto -mx-1 px-1">
              {pacientesFiltrados.length === 0 ? (
                <p className="text-sm text-slate-400 text-center py-6">Sin resultados.</p>
              ) : (
                pacientesFiltrados.map((i) => (
                  <button
                    key={i.id}
                    onClick={() => { setIngresoParaIncidencia(i.id); setSelectorPaciente(false) }}
                    className="w-full flex items-center justify-between text-left px-3 py-2 rounded-lg hover:bg-slate-50 text-sm"
                  >
                    <span className="font-medium text-slate-700">{nombreCompleto(i.paciente)}</span>
                    <span className="text-slate-400 text-xs">Hab. {i.habitacion ?? '—'}</span>
                  </button>
                ))
              )}
            </div>
            <button onClick={() => setSelectorPaciente(false)} className="text-xs text-slate-400 hover:text-slate-600">
              Cancelar
            </button>
          </div>
        </div>
      )}

      {ingresoParaIncidencia && (
        <FormularioEvento
          ingresoId={ingresoParaIncidencia}
          onClose={() => setIngresoParaIncidencia(null)}
          onGuardado={() => { setIngresoParaIncidencia(null); fetchEstadoActual(); fetchTendencias() }}
        />
      )}

      {/* ══════════════ CONTENCIONES ACTIVAS ══════════════ */}
      <section>
        <div className="flex items-center justify-between">
          <p className="section-title">Contenciones activas · ingresos activos</p>
          {contenciones.length > 0 && (
            <button onClick={imprimirContenciones} className="btn-secondary text-xs py-1 gap-1">
              <Printer className="w-3.5 h-3.5" /> Imprimir
            </button>
          )}
        </div>
        <div className="card overflow-hidden">
          {loadingContenciones ? (
            <p className="px-4 py-8 text-center text-slate-400 text-sm">Cargando…</p>
          ) : errorContenciones ? (
            <p className="px-4 py-8 text-center text-red-600 text-sm">{errorContenciones}</p>
          ) : contenciones.length === 0 ? (
            <p className="px-4 py-8 text-center text-slate-400 text-sm">Ningún paciente ingresado tiene contención pautada ahora mismo.</p>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b bg-slate-50 text-left text-xs font-semibold text-slate-500 uppercase tracking-wide">
                  <th className="px-4 py-2.5">Hab.</th>
                  <th className="px-4 py-2.5">Paciente</th>
                  <th className="px-4 py-2.5">Día</th>
                  <th className="px-4 py-2.5">Noche</th>
                  <th className="px-4 py-2.5">Última revisión</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {contenciones.map((c) => {
                  const sevDia = severidadDia(c.dia)
                  // Solo se muestran aquí las medidas nocturnas que
                  // cuentan como contención de verdad — si además
                  // llevaba una barra puesta, esa parte no es
                  // contención y no pinta nada en este listado.
                  const nocheReal = ((c.noche as ContencionNoche[]) ?? []).filter((n) => NOCHE_ES_CONTENCION.includes(n))
                  const sevNoche = severidadNoche(nocheReal)
                  return (
                    <tr key={c.ingreso_id} className="hover:bg-slate-50 cursor-pointer" onClick={() => setModalContencion(c.ingreso_id)}>
                      <td className="px-4 py-2.5">{c.ingreso.habitacion ?? '—'}</td>
                      <td className="px-4 py-2.5 font-medium text-slate-700">{nombreCompleto(c.ingreso.paciente)}</td>
                      <td className="px-4 py-2.5">
                        {c.dia && c.dia !== 'ninguna' ? (
                          <span className={`px-2 py-0.5 rounded text-xs font-medium ${SEVERIDAD_ESTILO[sevDia].bg} ${SEVERIDAD_ESTILO[sevDia].text}`}>
                            {CONTENCION_DIA_LABEL[c.dia as ContencionDia]}
                          </span>
                        ) : <span className="text-slate-300">—</span>}
                      </td>
                      <td className="px-4 py-2.5">
                        {nocheReal.length > 0 ? (
                          <span className={`px-2 py-0.5 rounded text-xs font-medium ${SEVERIDAD_ESTILO[sevNoche].bg} ${SEVERIDAD_ESTILO[sevNoche].text}`}>
                            {nocheReal.map((n) => CONTENCION_NOCHE_LABEL[n]).join(', ')}
                          </span>
                        ) : <span className="text-slate-300">—</span>}
                      </td>
                      <td className="px-4 py-2.5 text-slate-400 text-xs">
                        {c.actualizado_en ? new Date(c.actualizado_en).toLocaleDateString('es-ES') : '—'}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          )}
        </div>
      </section>

      {modalContencion && (
        <ModalContencion
          ingresoId={modalContencion}
          onClose={() => setModalContencion(null)}
          onGuardado={fetchContenciones}
        />
      )}

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
              ) : errorEstado ? (
                <tr><td colSpan={4} className="px-4 py-8 text-center">
                  <p className="text-red-600 text-sm mb-2">{errorEstado}</p>
                  <button onClick={fetchEstadoActual} className="btn-secondary text-xs">Reintentar</button>
                </td></tr>
              ) : (
                resumenPorTipo.map((r) => (
                  <FilaTipo
                    key={r.tipo}
                    resumen={r}
                    filas={filasDelTipo(r.tipo)}
                    abierto={expandido === r.tipo}
                    onToggle={() => setExpandido((e) => (e === r.tipo ? null : r.tipo))}
                    onClickPaciente={(id) => navigate(`/ingresos/${id}`)}
                    onExportar={() => exportarCSV(r.tipo)}
                    onImprimir={() => imprimirTabla(r.tipo)}
                  />
                ))
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
        ) : errorTendencias ? (
          <div className="card p-10 text-center space-y-2">
            <p className="text-red-600 text-sm">{errorTendencias}</p>
            <button onClick={fetchTendencias} className="btn-secondary text-xs">Reintentar</button>
          </div>
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

// ─── Fila de tipo: resumen + tabla de detalle desplegable ─────

function FilaTipo({ resumen, filas, abierto, onToggle, onClickPaciente, onExportar, onImprimir }: {
  resumen: { tipo: TipoEvento; pacientesAfectados: number; totalIncidencias: number }
  filas: EventoActivo[]
  abierto: boolean
  onToggle: () => void
  onClickPaciente: (ingresoId: string) => void
  onExportar: () => void
  onImprimir: () => void
}) {
  const campos = CAMPOS_POR_TIPO[resumen.tipo]
  return (
    <>
      <tr className="hover:bg-slate-50 transition-colors cursor-pointer" onClick={onToggle}>
        <td className="px-4 py-2.5 text-slate-400">
          {resumen.totalIncidencias > 0 && (abierto ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronRightIcon className="w-3.5 h-3.5" />)}
        </td>
        <td className="px-4 py-2.5 font-medium text-slate-700">{TIPO_EVENTO_LABEL[resumen.tipo]}</td>
        <td className="px-4 py-2.5 text-right tabular-nums">
          {resumen.pacientesAfectados === 0
            ? <span className="text-slate-300">—</span>
            : <span className="font-semibold text-slate-800">{resumen.pacientesAfectados}</span>}
        </td>
        <td className="px-4 py-2.5 text-right tabular-nums text-slate-500">
          {resumen.totalIncidencias || <span className="text-slate-300">—</span>}
        </td>
      </tr>
      {abierto && filas.length > 0 && (
        <tr>
          <td colSpan={4} className="bg-slate-50 px-4 py-3">
            <div className="flex justify-end gap-2 mb-2" onClick={(e) => e.stopPropagation()}>
              <button onClick={onExportar} className="btn-secondary text-xs py-1 gap-1">
                <Download className="w-3.5 h-3.5" /> Exportar CSV
              </button>
              <button onClick={onImprimir} className="btn-secondary text-xs py-1 gap-1">
                <Printer className="w-3.5 h-3.5" /> Imprimir
              </button>
            </div>
            <div className="overflow-x-auto rounded-lg border border-slate-200 bg-white">
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b bg-slate-100 text-left text-[10px] font-semibold text-slate-500 uppercase tracking-wide">
                    <th className="px-3 py-2">Fecha</th>
                    <th className="px-3 py-2">Turno</th>
                    <th className="px-3 py-2">Paciente</th>
                    <th className="px-3 py-2">Hab.</th>
                    {campos.map((c) => <th key={c.key} className="px-3 py-2">{c.label}</th>)}
                    <th className="px-3 py-2">Notas</th>
                    <th className="px-3 py-2">Registrado por</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {filas.map((ev) => (
                    <tr key={ev.id} className="hover:bg-slate-50">
                      <td className="px-3 py-2 whitespace-nowrap">{new Date(ev.fecha).toLocaleDateString('es-ES')}</td>
                      <td className="px-3 py-2 whitespace-nowrap">{ev.turno ? TURNO_LABEL[ev.turno] : '—'}</td>
                      <td className="px-3 py-2 font-medium text-slate-700 cursor-pointer hover:underline"
                        onClick={() => onClickPaciente(ev.ingreso.id)}>
                        {nombreCompleto(ev.ingreso.paciente)}
                      </td>
                      <td className="px-3 py-2">{ev.ingreso.habitacion ?? '—'}</td>
                      {campos.map((c) => (
                        <td key={c.key} className="px-3 py-2">{ev.datos?.[c.key] ?? <span className="text-slate-300">—</span>}</td>
                      ))}
                      <td className="px-3 py-2 max-w-[200px] truncate" title={ev.notas}>{ev.notas || <span className="text-slate-300">—</span>}</td>
                      <td className="px-3 py-2 whitespace-nowrap text-slate-500">
                        {ev.registrado_por ? `${ev.registrado_por.nombre} ${ev.registrado_por.apellidos}` : '—'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </td>
        </tr>
      )}
    </>
  )
}
