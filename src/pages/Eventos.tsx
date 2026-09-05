import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { escapeHtml, imprimirTablaHTML } from '../lib/imprimir'
import {
  BarChart, Bar, LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, Cell,
} from 'recharts'
import { supabase } from '../lib/supabase'
import { nombreCompleto } from '../types'
import { ChevronDown, ChevronRight as ChevronRightIcon, Download, Printer, RefreshCw } from 'lucide-react'
import { TIPO_EVENTO_LABEL, TIPO_EVENTO_COLOR, TURNO_LABEL, CAMPOS_POR_TIPO, type TipoEvento } from '../types/eventos'
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
  estado?: 'pendiente' | 'completa'
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
      .order('habitacion', { ascending: true })
      .then(({ data }) => setPacientesActivos(data ?? []))
  }, [selectorPaciente])

  const pacientesFiltrados = pacientesActivos.filter((i) => {
    const q = busquedaPaciente.toLowerCase().trim()
    if (!q) return true
    // Por nombre, o directamente por el número de habitación — más
    // rápido cuando lo que se conoce es dónde está, no cómo se llama.
    return nombreCompleto(i.paciente).toLowerCase().includes(q) || String(i.habitacion ?? '').includes(q)
  })

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
          id, tipo, fecha, hora, turno, datos, notas, estado,
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

  // ── Detalle del periodo, bajo demanda ───────────────────────
  // Las Tendencias ya cuentan todo el periodo (incluidos episodios
  // cerrados), pero solo como números — antes no había forma de ver
  // ni exportar esos registros concretos, solo el resumen.
  const [verDetallePeriodo, setVerDetallePeriodo] = useState(false)
  const [loadingDetallePeriodo, setLoadingDetallePeriodo] = useState(false)
  const [detallePeriodo, setDetallePeriodo] = useState<any[]>([])

  async function fetchDetallePeriodo() {
    setLoadingDetallePeriodo(true)
    try {
      const { desde, hasta } = getRango(periodo, anioSel, mesSel)
      const { data } = await supabase
        .from('eventos')
        .select(`
          id, tipo, fecha, hora, turno, datos, notas, estado,
          registrado_por:profesionales(nombre, apellidos),
          ingreso:ingresos(id, habitacion, estado, paciente:pacientes(nombre, primer_apellido, segundo_apellido))
        `)
        .gte('fecha', desde)
        .lte('fecha', hasta)
        .order('fecha', { ascending: false })
      setDetallePeriodo(data ?? [])
    } finally {
      setLoadingDetallePeriodo(false)
    }
  }

  function exportarCSVPeriodo() {
    const { desde, hasta } = getRango(periodo, anioSel, mesSel)
    const cabecera = ['Fecha', 'Turno', 'Tipo', 'Estado', 'Paciente', 'Habitación', 'Estado del ingreso', 'Notas', 'Registrado por']
      .map(escaparCsv).join(',')
    const filas = detallePeriodo.map((ev) => [
      ev.fecha,
      ev.turno ? TURNO_LABEL[ev.turno] : 'Sin turno especificado',
      TIPO_EVENTO_LABEL[ev.tipo as TipoEvento],
      ev.estado === 'pendiente' ? 'Pendiente de completar' : 'Completa',
      ev.ingreso?.paciente ? nombreCompleto(ev.ingreso.paciente) : '',
      ev.ingreso?.habitacion ?? '',
      ev.ingreso?.estado === 'activo' ? 'Ingreso activo' : 'Episodio cerrado',
      ev.notas ?? '',
      ev.registrado_por ? `${ev.registrado_por.nombre} ${ev.registrado_por.apellidos}` : '',
    ].map((v) => escaparCsv(String(v))).join(','))
    const csv = '\uFEFF' + [cabecera, ...filas].join('\r\n')
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    // El propio nombre del archivo deja claro que es del periodo
    // elegido, no de los ingresos activos — para no confundirlo con
    // el CSV de "Estado actual", que es otra cosa.
    a.download = `incidencias_periodo_${desde}_a_${hasta}.csv`
    a.click()
    URL.revokeObjectURL(url)
  }

  function periodoLabel(): string {
    if (periodo === 'personalizado') return mesSel === 'todos' ? `Año ${anioSel}` : `${MESES[mesSel]} ${anioSel}`
    return { mes: 'Este mes', trimestre: 'Este trimestre', anio: 'Este año', todo: 'Todo el historial' }[periodo] ?? periodo
  }

  const [refreshing, setRefreshing] = useState(false)
  async function actualizarTodo() {
    setRefreshing(true)
    await Promise.all([fetchContenciones(), fetchEstadoActual(), fetchTendencias()])
    setRefreshing(false)
  }

  // Igual que en Inicio y Hoja de Ítems: si esta pantalla se deja
  // abierta un buen rato, otra persona puede haber pautado una
  // contención o registrado una incidencia sin que se note hasta
  // recargar a mano. Se omite mientras hay algo abierto para editar
  // (el selector de paciente, el formulario o el modal de
  // contención) — no por riesgo de perder nada, sino para no mover
  // la pantalla mientras alguien está a mitad de rellenar algo.
  useEffect(() => {
    const hayAlgoAbierto = () => selectorPaciente || !!ingresoParaIncidencia || !!modalContencion
    function alVolver() {
      if (document.visibilityState === 'visible' && !hayAlgoAbierto()) actualizarTodo()
    }
    function alEnfocar() {
      if (!hayAlgoAbierto()) actualizarTodo()
    }
    window.addEventListener('focus', alEnfocar)
    document.addEventListener('visibilitychange', alVolver)
    return () => {
      window.removeEventListener('focus', alEnfocar)
      document.removeEventListener('visibilitychange', alVolver)
    }
  }, [selectorPaciente, ingresoParaIncidencia, modalContencion])

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
    const cabecera = ['Fecha', 'Turno', 'Estado', 'Paciente', 'Habitación', ...campos.map((c) => c.label), 'Notas', 'Registrado por']
      .map(escaparCsv).join(',')
    const filas = filasDelTipo(tipo).map((ev) => [
      ev.fecha,
      ev.turno ? TURNO_LABEL[ev.turno] : 'Sin turno especificado',
      ev.estado === 'pendiente' ? 'Pendiente de completar' : 'Completa',
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
    // El propio nombre deja claro que es de ingresos activos, no del
    // periodo histórico — ese exporta con su propio nombre distinto.
    a.download = `${tipo}_ingresos_activos_${fmt(new Date())}.csv`
    a.click()
    URL.revokeObjectURL(url)
  }

  function imprimirTabla(tipo: TipoEvento) {
    const campos = CAMPOS_POR_TIPO[tipo]
    const filas = filasDelTipo(tipo)
    const thead = `<tr>
        <th>Fecha</th><th>Turno</th><th>Estado</th><th>Paciente</th><th>Hab.</th>
        ${campos.map((c) => `<th>${escapeHtml(c.label)}</th>`).join('')}
        <th>Notas</th><th>Registrado por</th>
      </tr>`
    const tbody = filas.map((ev) => `<tr>
        <td>${new Date(ev.fecha).toLocaleDateString('es-ES')}</td>
        <td>${ev.turno ? escapeHtml(TURNO_LABEL[ev.turno]) : 'Sin turno especificado'}</td>
        <td>${ev.estado === 'pendiente' ? 'Pendiente de completar' : 'Completa'}</td>
        <td>${escapeHtml(nombreCompleto(ev.ingreso.paciente))}</td>
        <td>${ev.ingreso.habitacion ?? ''}</td>
        ${campos.map((c) => `<td>${escapeHtml(String(ev.datos?.[c.key] ?? ''))}</td>`).join('')}
        <td>${escapeHtml(ev.notas ?? '')}</td>
        <td>${ev.registrado_por ? escapeHtml(`${ev.registrado_por.nombre} ${ev.registrado_por.apellidos}`) : ''}</td>
      </tr>`).join('')
    imprimirTablaHTML(
      TIPO_EVENTO_LABEL[tipo],
      `Ingresos activos · generado ${new Date().toLocaleDateString('es-ES')}`,
      thead, tbody
    )
  }

  function imprimirContenciones() {
    const thead = `<tr><th>Hab.</th><th>Paciente</th><th>Día</th><th>Noche</th><th>Última revisión</th></tr>`
    const tbody = contenciones.map((c) => {
      const nocheReal = ((c.noche as ContencionNoche[]) ?? []).filter((n) => NOCHE_ES_CONTENCION.includes(n))
      return `<tr>
        <td>${c.ingreso.habitacion ?? ''}</td>
        <td>${escapeHtml(nombreCompleto(c.ingreso.paciente))}</td>
        <td>${c.dia && c.dia !== 'ninguna' ? escapeHtml(CONTENCION_DIA_LABEL[c.dia as ContencionDia]) : ''}</td>
        <td>${nocheReal.map((n) => escapeHtml(CONTENCION_NOCHE_LABEL[n])).join(', ')}</td>
        <td>${c.actualizado_en ? new Date(c.actualizado_en).toLocaleDateString('es-ES') : ''}</td>
      </tr>`
    }).join('')
    imprimirTablaHTML(
      'Contenciones activas',
      `Ingresos activos · generado ${new Date().toLocaleDateString('es-ES')}`,
      thead, tbody
    )
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

  const porTurno = [
    ...(['manana', 'tarde', 'noche'] as const).map((t) => ({
      turno: TURNO_LABEL[t],
      total: eventosPeriodo.filter((ev) => ev.turno === t).length,
    })),
    // Sin esto, una incidencia registrada sin turno simplemente
    // desaparecía del reparto — como si nunca hubiera pasado, en vez
    // de contar como un dato real que falta por precisar.
    { turno: 'Sin turno especificado', total: eventosPeriodo.filter((ev) => !ev.turno).length },
  ]

  // ── Render ────────────────────────────────────────────────

  return (
    <div className="p-6 md:p-8 space-y-8">

      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-800">Incidencias</h1>
          <p className="text-sm text-slate-400 mt-0.5">Estado de seguridad de la planta y tendencias</p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={actualizarTodo}
            disabled={refreshing}
            title="Actualizar"
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-slate-200 text-slate-500 hover:bg-slate-50 text-sm font-medium disabled:opacity-60"
          >
            <RefreshCw className={`w-4 h-4 ${refreshing ? 'animate-spin' : ''}`} />
          </button>
          <button onClick={() => setSelectorPaciente(true)} className="btn-primary">
            <Plus className="w-4 h-4" />
            Registrar incidencia
          </button>
        </div>
      </div>

      {selectorPaciente && !ingresoParaIncidencia && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4" onClick={() => setSelectorPaciente(false)}>
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm p-5 space-y-3" onClick={(e) => e.stopPropagation()}>
            <h3 className="font-bold text-slate-800">¿De qué paciente?</h3>
            <input
              autoFocus
              className="input"
              placeholder="Buscar por nombre o nº de habitación…"
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
          pacienteInfo={(() => {
            const ing = pacientesActivos.find((i) => i.id === ingresoParaIncidencia)
            return ing?.paciente ? { nombre: nombreCompleto(ing.paciente), habitacion: ing.habitacion } : undefined
          })()}
        />
      )}

      {/* ══════════════ PENDIENTES DE COMPLETAR ══════════════ */}
      {/* Una incidencia puede registrarse correctamente y descubrirse
          sus consecuencias días después — este bloque las reúne en un
          solo sitio, en vez de que queden escondidas dentro de cada
          ficha hasta que alguien se acuerde de volver a mirarlas. */}
      {(() => {
        const pendientes = eventosActivos.filter((ev) => ev.estado === 'pendiente')
        if (pendientes.length === 0) return null
        return (
          <section>
            <div className="bg-amber-50 border border-amber-200 rounded-xl p-4">
              <p className="text-xs font-semibold text-amber-700 uppercase tracking-wide mb-3">
                {pendientes.length} {pendientes.length === 1 ? 'incidencia pendiente' : 'incidencias pendientes'} de completar
              </p>
              <div className="space-y-1.5">
                {pendientes.map((ev) => (
                  <button
                    key={ev.id}
                    onClick={() => navigate(`/ingresos/${ev.ingreso.id}?tab=eventos`)}
                    className="w-full flex items-center justify-between gap-3 bg-white rounded-lg px-3 py-2 text-left hover:bg-amber-100/50 transition-colors border border-amber-100"
                  >
                    <span className="flex items-center gap-2 text-sm">
                      <span className={`px-2 py-0.5 rounded-full text-xs font-medium border ${TIPO_EVENTO_COLOR[ev.tipo]}`}>
                        {TIPO_EVENTO_LABEL[ev.tipo]}
                      </span>
                      <span className="font-medium text-slate-700">{nombreCompleto(ev.ingreso.paciente)}</span>
                      <span className="text-slate-400">Hab. {ev.ingreso.habitacion ?? '—'}</span>
                    </span>
                    <span className="text-xs text-slate-400">{new Date(ev.fecha).toLocaleDateString('es-ES')}</span>
                  </button>
                ))}
              </div>
            </div>
          </section>
        )
      })()}

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
          pacienteInfo={(() => {
            const c = contenciones.find((x: any) => x.ingreso_id === modalContencion)
            return c?.ingreso?.paciente
              ? { nombre: nombreCompleto(c.ingreso.paciente), habitacion: c.ingreso.habitacion }
              : undefined
          })()}
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
                    onClickPaciente={(id) => navigate(`/ingresos/${id}?tab=eventos`)}
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

            {/* Antes las Tendencias solo contaban — no había forma de
                ver ni exportar los registros concretos del periodo,
                solo el resumen. Bajo demanda, no siempre cargado,
                porque puede ser un periodo largo con muchos registros. */}
            <div className="pt-2">
              <button
                onClick={() => {
                  setVerDetallePeriodo((v) => !v)
                  if (!verDetallePeriodo && detallePeriodo.length === 0) fetchDetallePeriodo()
                }}
                className="btn-secondary text-xs"
              >
                {verDetallePeriodo ? 'Ocultar incidencias del periodo' : 'Ver incidencias del periodo'}
              </button>

              {verDetallePeriodo && (
                <div className="mt-3 card overflow-hidden">
                  <div className="flex items-center justify-between px-4 py-2.5 bg-slate-50 border-b">
                    {/* La propia cabecera deja claro que esto es el
                        periodo elegido, no "ingresos activos" como
                        las demás tablas de esta página — para no
                        confundir una cosa con la otra. */}
                    <p className="text-xs font-medium text-slate-500">
                      Periodo histórico: {periodoLabel()} · incluye episodios cerrados
                    </p>
                    {detallePeriodo.length > 0 && (
                      <button onClick={exportarCSVPeriodo} className="btn-secondary text-xs py-1 gap-1">
                        <Download className="w-3.5 h-3.5" /> Exportar CSV
                      </button>
                    )}
                  </div>
                  {loadingDetallePeriodo ? (
                    <p className="px-4 py-8 text-center text-slate-400 text-sm">Cargando…</p>
                  ) : detallePeriodo.length === 0 ? (
                    <p className="px-4 py-8 text-center text-slate-400 text-sm">Sin incidencias en este periodo.</p>
                  ) : (
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b bg-slate-50 text-left text-xs font-semibold text-slate-500 uppercase tracking-wide">
                          <th className="px-4 py-2">Fecha</th>
                          <th className="px-4 py-2">Tipo</th>
                          <th className="px-4 py-2">Estado</th>
                          <th className="px-4 py-2">Paciente</th>
                          <th className="px-4 py-2">Episodio</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y">
                        {detallePeriodo.map((ev) => (
                          <tr
                            key={ev.id}
                            className="hover:bg-slate-50 cursor-pointer"
                            onClick={() => ev.ingreso?.id && navigate(`/ingresos/${ev.ingreso.id}?tab=eventos`)}
                          >
                            <td className="px-4 py-2 text-slate-500 text-xs">
                              {new Date(ev.fecha).toLocaleDateString('es-ES')}
                              {ev.turno ? ` · ${TURNO_LABEL[ev.turno]}` : ' · Sin turno'}
                            </td>
                            <td className="px-4 py-2">
                              <span className={`px-2 py-0.5 rounded-full text-xs font-medium border ${TIPO_EVENTO_COLOR[ev.tipo as TipoEvento]}`}>
                                {TIPO_EVENTO_LABEL[ev.tipo as TipoEvento]}
                              </span>
                            </td>
                            <td className="px-4 py-2">
                              {ev.estado === 'pendiente' ? (
                                <span className="text-amber-600 text-xs font-medium">Pendiente</span>
                              ) : (
                                <span className="text-slate-400 text-xs">Completa</span>
                              )}
                            </td>
                            <td className="px-4 py-2 font-medium text-slate-700">
                              {ev.ingreso?.paciente ? nombreCompleto(ev.ingreso.paciente) : '—'}
                            </td>
                            <td className="px-4 py-2 text-xs">
                              {ev.ingreso?.estado === 'activo' ? (
                                <span className="text-emerald-600">Activo</span>
                              ) : (
                                <span className="text-slate-400">Cerrado</span>
                              )}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  )}
                </div>
              )}
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
