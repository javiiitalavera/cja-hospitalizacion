import { useEffect, useState } from 'react'
import { CabeceraPagina } from '../components/CabeceraPagina'
import { BotonActualizar } from '../components/BotonActualizar'
import { Cargando } from '../components/Cargando'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { atajoDeRaton, FOCO_CELDA } from '../lib/accesibilidad'
import { escapeHtml, imprimirTablaHTML } from '../lib/imprimir'
import { supabase } from '../lib/supabase'
import { nombreCompleto, nombreYApellido, SEMAFORO_CAIDAS_COLOR } from '../types'
import { ChevronDown, ChevronRight as ChevronRightIcon, Download, Printer, Search, Plus } from 'lucide-react'
import { TIPO_EVENTO_LABEL, TIPO_EVENTO_COLOR, TURNO_LABEL, CAMPOS_POR_TIPO, DIAS_PENDIENTE_AVISO, FILTRO_TIPOS_RETIRADOS, diasPendiente, type TipoEvento } from '../types/eventos'
import { AntiguedadPendiente } from '../components/AntiguedadPendiente'
import {
  severidadDia, severidadNoche, SEVERIDAD_ESTILO, necesitaConfirmacion, NOCHE_ES_CONTENCION,
  CONTENCION_DIA_LABEL, CONTENCION_NOCHE_LABEL,
  type ContencionDia, type ContencionNoche,
} from '../types/contenciones'
import ModalContencion from '../components/ModalContencion'
import FormularioEvento from '../components/FormularioEvento'
import { InputFecha } from '../components/InputFecha'

// ─── CONSTANTES ────────────────────────────────────────────────

const TIPOS_ORDEN: TipoEvento[] = [
  'caida', 'agresividad_fisica',
  'fuga', 'error_medicacion', 'efecto_adverso_medicacion', 'atragantamiento',
]

interface EventoActivo {
  id: string
  tipo: TipoEvento
  fecha: string
  hora?: string
  turno?: string
  datos: Record<string, string>
  notas?: string
  estado?: 'pendiente' | 'completa'
  created_at?: string
  registrado_por?: { nombre: string; apellidos: string }
  ingreso: {
    id: string
    habitacion?: number
    paciente: { nombre: string; primer_apellido: string; segundo_apellido?: string }
  }
}

const MAYUS = (t: string) => t.charAt(0).toUpperCase() + t.slice(1)

function escaparCsv(v: string): string {
  return `"${v.replace(/"/g, '""')}"`
}

// ─── PÁGINA PRINCIPAL ─────────────────────────────────────────

export function Eventos() {
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()

  // ── Registrar incidencia desde esta misma página ────────────
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
    return nombreCompleto(i.paciente).toLowerCase().includes(q) || String(i.habitacion ?? '').includes(q)
  })

  // ── Contenciones activas (ingresos activos) ─────────────────
  const [loadingContenciones, setLoadingContenciones] = useState(true)
  const [contenciones, setContenciones] = useState<any[]>([])
  const [errorContenciones, setErrorContenciones] = useState('')
  const [modalContencion, setModalContencion] = useState<string | null>(null)
  // Semáforo de caídas de cada paciente de la lista (ingreso_id -> color). Si la consulta falla se avisa y la columna
  // queda con «—»: mejor eso que dar a entender que nadie tiene semáforo.
  const [semaforos, setSemaforos] = useState<Record<string, string | null>>({})
  const [errorSemaforos, setErrorSemaforos] = useState(false)

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
        setErrorContenciones('No se pudieron cargar las contenciones: ' + error.message)
        return
      }
      const activas = (data ?? []).filter((c: any) => necesitaConfirmacion(c.dia, c.noche))
      setContenciones(activas.sort((a: any, b: any) => (a.ingreso.habitacion ?? 999) - (b.ingreso.habitacion ?? 999)))
      if (activas.length > 0) {
        const { data: items, error: errSem } = await supabase
          .from('items_paciente').select('ingreso_id, semaforo_caidas').in('ingreso_id', activas.map((c: any) => c.ingreso_id))
        setErrorSemaforos(!!errSem)
        setSemaforos(Object.fromEntries((items ?? []).map((it: any) => [it.ingreso_id, it.semaforo_caidas ?? null])))
      }
    } finally {
      setLoadingContenciones(false)
    }
  }

  // Lista en papel de las contenciones activas, por habitación. Es la misma que se ve en pantalla:
  // solo cuenta como contención la fija y la «si precisa» (las barras, la cota cero y el sensor
  // son medidas de seguridad y no salen).
  function imprimirContenciones() {
    const ordenadas = contenciones
    const tbody = ordenadas.map((c) => {
      const nocheReal = ((c.noche as ContencionNoche[]) ?? []).filter((n) => NOCHE_ES_CONTENCION.includes(n))
      const dia = c.dia && c.dia !== 'ninguna' ? CONTENCION_DIA_LABEL[c.dia as ContencionDia] : '—'
      const noche = nocheReal.length > 0 ? nocheReal.map((n) => CONTENCION_NOCHE_LABEL[n]).join(', ') : '—'
      return `<tr>
        <td>${c.ingreso.habitacion ?? '—'}</td>
        <td>${escapeHtml(nombreYApellido(c.ingreso.paciente))}</td>
        <td>${escapeHtml(semaforos[c.ingreso_id] ? MAYUS(semaforos[c.ingreso_id]!) : '—')}</td>
        <td>${escapeHtml(dia)}</td>
        <td>${escapeHtml(noche)}</td>
        <td>${c.actualizado_en ? new Date(c.actualizado_en).toLocaleDateString('es-ES') : '—'}</td>
      </tr>`
    }).join('')
    imprimirTablaHTML(
      'Contenciones activas',
      `${ordenadas.length} paciente${ordenadas.length === 1 ? '' : 's'} con contención pautada · ingresos activos`,
      '<tr><th>Hab.</th><th>Paciente</th><th>Semáforo</th><th>Día</th><th>Noche</th><th>Última revisión</th></tr>',
      tbody,
    )
  }

  // ── Incidencias de ingresos activos ─────────────────────────
  const [loadingEstado, setLoadingEstado] = useState(true)
  const [errorEstado, setErrorEstado] = useState('')
  const [eventosActivos, setEventosActivos] = useState<EventoActivo[]>([])
  const [expandido, setExpandido] = useState<TipoEvento | null>(null)

  useEffect(() => { fetchEstadoActual() }, [])

  async function fetchEstadoActual() {
    setLoadingEstado(true)
    setErrorEstado('')
    try {
      const { data, error: err } = await supabase
        .from('eventos')
        .select(`
          id, tipo, fecha, hora, turno, datos, notas, estado, created_at,
          registrado_por:profesionales!registrado_por_id(nombre, apellidos),
          ingreso:ingresos!inner(id, habitacion, estado, paciente:pacientes(nombre, primer_apellido, segundo_apellido))
        `)
        .eq('ingreso.estado', 'activo')
        .not('tipo', 'in', FILTRO_TIPOS_RETIRADOS)   // úlceras (en Curas) e infección nosocomial (en el CMBD) ya no son incidencias
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

  const [refreshing, setRefreshing] = useState(false)
  async function actualizarTodo() {
    setRefreshing(true)
    await Promise.all([fetchContenciones(), fetchEstadoActual()])
    setRefreshing(false)
  }

  // Igual que en Inicio y Hoja de Ítems: si esta pantalla se deja
  // abierta un buen rato, otra persona puede haber pautado una
  // contención o registrado una incidencia sin que se note hasta
  // recargar a mano. Se omite mientras hay algo abierto para editar.
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

  const resumenPorTipo = TIPOS_ORDEN.map((tipo) => {
    const delTipo = eventosActivos.filter((e) => e.tipo === tipo)
    const pacientesAfectados = new Set(delTipo.map((e) => e.ingreso.id)).size
    return { tipo, pacientesAfectados, totalIncidencias: delTipo.length }
  })

  function filasDelTipo(tipo: TipoEvento): EventoActivo[] {
    return eventosActivos.filter((e) => e.tipo === tipo)
  }

  // ── Buscador de incidencias (histórico, con filtros) ────────
  // El único sitio de toda la pantalla donde se puede imprimir o
  // exportar — y actúa exactamente sobre lo que el filtro esté
  // mostrando, con los propios filtros indicados arriba, para que
  // nunca haya duda de qué es cada tabla o archivo.
  const [profesionales, setProfesionales] = useState<{ id: string; nombre: string; apellidos: string; rol: string }[]>([])
  useEffect(() => {
    supabase.from('profesionales').select('id, nombre, apellidos, rol').order('apellidos')
      .then(({ data }) => setProfesionales(data ?? []))
  }, [])

  const [fDesde, setFDesde] = useState('')
  const [fHasta, setFHasta] = useState('')
  const [fTipo, setFTipo] = useState<TipoEvento | ''>('')
  const [fPaciente, setFPaciente] = useState('')
  const [fTurno, setFTurno] = useState('')
  const [fEstado, setFEstado] = useState('')
  const [fProfesional, setFProfesional] = useState('')
  const [fAlcance, setFAlcance] = useState<'activos' | 'cerrados' | 'todos'>('todos')
  // Distinto de fProfesional (quién registró la incidencia): este es
  // el médico responsable del ingreso — el mismo concepto que usa el
  // Dashboard para filtrar. Sin esto, llegar aquí desde una cifra ya
  // filtrada por médico responsable mostraba resultados que no
  // coincidían con esa cifra.
  const [fMedicoResponsable, setFMedicoResponsable] = useState('')

  // El Dashboard (y en el futuro otras pantallas) puede llegar aquí
  // con filtros ya decididos en la URL — se leen una sola vez al
  // entrar, se rellenan los campos, y se lanza la búsqueda sola, sin
  // que la persona tenga que repetir a mano lo que ya había elegido.
  useEffect(() => {
    const desde = searchParams.get('desde') ?? undefined
    const hasta = searchParams.get('hasta') ?? undefined
    const incidenciasParam = searchParams.get('incidencias') // 'pendiente' | 'todas'
    const tipoParam = searchParams.get('tipo_incidencia') as TipoEvento | null
    const medicoParam = searchParams.get('medico_responsable')
    if (!desde && !hasta && !incidenciasParam && !tipoParam && !medicoParam) return

    const estado = incidenciasParam === 'pendiente' ? 'pendiente' : undefined
    if (desde) setFDesde(desde)
    if (hasta) setFHasta(hasta)
    if (estado) setFEstado(estado)
    if (tipoParam) setFTipo(tipoParam)
    if (medicoParam) setFMedicoResponsable(medicoParam)
    // Valores explícitos, no el estado del componente — así no
    // importa si React ya ha aplicado o no los setF... de arriba.
    buscarIncidencias({ desde, hasta, estado, tipo: tipoParam ?? undefined, medicoResponsable: medicoParam ?? undefined })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const [buscando, setBuscando] = useState(false)
  const [errorBusqueda, setErrorBusqueda] = useState('')
  const [resultados, setResultados] = useState<any[]>([])
  const [buscado, setBuscado] = useState(false)

  async function buscarIncidencias(overrides?: { desde?: string; hasta?: string; estado?: string; tipo?: TipoEvento; medicoResponsable?: string }) {
    setBuscando(true)
    setErrorBusqueda('')
    try {
      // Si viene de la URL (al entrar desde el Dashboard), se usan
      // estos valores directamente — esperar a que fDesde/fEstado se
      // hayan actualizado en el estado antes de buscar sería frágil,
      // React no garantiza que ya estén aplicados en este instante.
      const desde = overrides?.desde ?? fDesde
      const hasta = overrides?.hasta ?? fHasta
      const estado = overrides?.estado ?? fEstado
      const tipo = overrides?.tipo ?? fTipo
      const medicoResponsable = overrides?.medicoResponsable ?? fMedicoResponsable

      let q = supabase
        .from('eventos')
        .select(`
          id, tipo, fecha, hora, turno, datos, notas, estado, habitacion_evento,
          registrado_por:profesionales!registrado_por_id(nombre, apellidos),
          ingreso:ingresos!inner(id, habitacion, estado, medico_responsable_id, paciente:pacientes(nombre, primer_apellido, segundo_apellido))
        `)
        .not('tipo', 'in', FILTRO_TIPOS_RETIRADOS)   // úlceras (en Curas) e infección nosocomial (en el CMBD) ya no son incidencias
        .order('fecha', { ascending: false })

      if (desde) q = q.gte('fecha', desde)
      if (hasta) q = q.lte('fecha', hasta)
      if (tipo) q = q.eq('tipo', tipo)
      if (fTurno) q = q.eq('turno', fTurno)
      if (estado) q = q.eq('estado', estado)
      if (fProfesional) q = q.eq('registrado_por_id', fProfesional)
      // Distinto de fProfesional: este es el médico responsable del
      // ingreso, no quien registró la incidencia — el mismo concepto
      // que usa el filtro de médico del Dashboard.
      if (medicoResponsable) q = q.eq('ingreso.medico_responsable_id', medicoResponsable)
      if (fAlcance === 'activos') q = q.eq('ingreso.estado', 'activo')
      if (fAlcance === 'cerrados') q = q.neq('ingreso.estado', 'activo')

      const { data, error } = await q
      if (error) {
        setErrorBusqueda('No se pudo completar la búsqueda: ' + error.message)
        return
      }
      // El nombre del paciente se filtra en el propio cliente: no hay
      // forma limpia de filtrar por un campo calculado (nombre completo)
      // directamente en la consulta con el esquema actual.
      const filtrados = fPaciente.trim()
        ? (data ?? []).filter((ev: any) =>
            ev.ingreso?.paciente && nombreCompleto(ev.ingreso.paciente).toLowerCase().includes(fPaciente.toLowerCase().trim())
          )
        : (data ?? [])
      setResultados(filtrados)
      setBuscado(true)
    } finally {
      setBuscando(false)
    }
  }

  function limpiarFiltros() {
    setFDesde(''); setFHasta(''); setFTipo(''); setFPaciente('')
    setFTurno(''); setFEstado(''); setFProfesional(''); setFAlcance('todos')
    setResultados([]); setBuscado(false)
  }

  // Un resumen legible de qué filtros están aplicados — se repite en
  // pantalla, en el CSV y en la impresión, para que ninguno de los
  // tres se pueda confundir con "todas las incidencias sin más".
  function resumenFiltros(): string {
    const partes: string[] = []
    if (fDesde || fHasta) partes.push(`Del ${fDesde || '...'} al ${fHasta || 'hoy'}`)
    if (fTipo) partes.push(TIPO_EVENTO_LABEL[fTipo])
    if (fPaciente) partes.push(`Paciente: "${fPaciente}"`)
    if (fTurno) partes.push(`Turno: ${TURNO_LABEL[fTurno]}`)
    if (fEstado) partes.push(fEstado === 'pendiente' ? 'Pendientes de completar' : 'Completas')
    if (fProfesional) {
      const p = profesionales.find((x) => x.id === fProfesional)
      if (p) partes.push(`Registrado por ${p.nombre} ${p.apellidos}`)
    }
    if (fMedicoResponsable) {
      const m = profesionales.find((x) => x.id === fMedicoResponsable)
      if (m) partes.push(`Médico responsable: ${m.nombre} ${m.apellidos}`)
    }
    partes.push(fAlcance === 'activos' ? 'Solo ingresos activos' : fAlcance === 'cerrados' ? 'Solo episodios cerrados' : 'Activos y cerrados')
    return partes.length > 0 ? partes.join(' · ') : 'Sin filtros aplicados'
  }

  function exportarCSVBusqueda() {
    const cabecera = ['Fecha', 'Turno', 'Tipo', 'Estado', 'Paciente', 'Habitación en el momento', 'Episodio', 'Notas', 'Registrado por']
      .map(escaparCsv).join(',')
    const filas = resultados.map((ev) => [
      ev.fecha,
      ev.turno ? TURNO_LABEL[ev.turno] : 'Sin turno especificado',
      TIPO_EVENTO_LABEL[ev.tipo as TipoEvento],
      ev.estado === 'pendiente' ? 'Pendiente de completar' : 'Completa',
      ev.ingreso?.paciente ? nombreCompleto(ev.ingreso.paciente) : '',
      // La habitación del propio momento del evento, no la actual del
      // ingreso — así un traslado posterior no cambia retroactivamente
      // un dato ya exportado.
      ev.habitacion_evento ?? ev.ingreso?.habitacion ?? '',
      ev.ingreso?.estado === 'activo' ? 'Ingreso activo' : 'Episodio cerrado',
      ev.notas ?? '',
      ev.registrado_por ? `${ev.registrado_por.nombre} ${ev.registrado_por.apellidos}` : '',
    ].map((v) => escaparCsv(String(v))).join(','))
    const csv = '\uFEFF' + [`"Filtros: ${resumenFiltros().replace(/"/g, "'")}"`, cabecera, ...filas].join('\r\n')
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `incidencias_busqueda_${new Date().toISOString().slice(0, 10)}.csv`
    a.click()
    URL.revokeObjectURL(url)
  }

  function imprimirBusqueda() {
    const thead = `<tr><th>Fecha</th><th>Turno</th><th>Tipo</th><th>Estado</th><th>Paciente</th><th>Hab.</th><th>Episodio</th><th>Notas</th><th>Registrado por</th></tr>`
    const tbody = resultados.map((ev) => `<tr>
        <td>${new Date(ev.fecha).toLocaleDateString('es-ES')}</td>
        <td>${ev.turno ? escapeHtml(TURNO_LABEL[ev.turno]) : 'Sin turno especificado'}</td>
        <td>${escapeHtml(TIPO_EVENTO_LABEL[ev.tipo as TipoEvento])}</td>
        <td>${ev.estado === 'pendiente' ? 'Pendiente' : 'Completa'}</td>
        <td>${ev.ingreso?.paciente ? escapeHtml(nombreYApellido(ev.ingreso.paciente)) : ''}</td>
        <td>${ev.habitacion_evento ?? ev.ingreso?.habitacion ?? ''}</td>
        <td>${ev.ingreso?.estado === 'activo' ? 'Activo' : 'Cerrado'}</td>
        <td>${escapeHtml(ev.notas ?? '')}</td>
        <td>${ev.registrado_por ? escapeHtml(`${ev.registrado_por.nombre} ${ev.registrado_por.apellidos}`) : ''}</td>
      </tr>`).join('')
    imprimirTablaHTML('Búsqueda de incidencias', `Filtros: ${resumenFiltros()}`, thead, tbody)
  }

  // ── Render ────────────────────────────────────────────────

  return (
    <div className="p-6 md:p-8 space-y-8">

      {/* Header */}
      <CabeceraPagina className="!mb-0" titulo="Incidencias" subtitulo="Estado de seguridad de la planta">
        <BotonActualizar onClick={actualizarTodo} cargando={refreshing} />
        <button onClick={() => setSelectorPaciente(true)} className="btn-primary">
          <Plus className="w-4 h-4" />
          Registrar incidencia
        </button>
      </CabeceraPagina>

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
                <p className="text-sm text-slate-500 text-center py-6">Sin resultados.</p>
              ) : (
                pacientesFiltrados.map((i) => (
                  <button
                    key={i.id}
                    onClick={() => { setIngresoParaIncidencia(i.id); setSelectorPaciente(false) }}
                    className="w-full flex items-center justify-between text-left px-3 py-2 rounded-lg hover:bg-slate-50 text-sm"
                  >
                    <span className="font-medium text-slate-700">{nombreCompleto(i.paciente)}</span>
                    <span className="text-slate-500 text-xs">Hab. {i.habitacion ?? '—'}</span>
                  </button>
                ))
              )}
            </div>
            <button onClick={() => setSelectorPaciente(false)} className="text-xs text-slate-500 hover:text-slate-600">
              Cancelar
            </button>
          </div>
        </div>
      )}

      {ingresoParaIncidencia && (
        <FormularioEvento
          ingresoId={ingresoParaIncidencia}
          onClose={() => setIngresoParaIncidencia(null)}
          onGuardado={() => { setIngresoParaIncidencia(null); fetchEstadoActual() }}
          pacienteInfo={(() => {
            const ing = pacientesActivos.find((i) => i.id === ingresoParaIncidencia)
            return ing?.paciente ? { nombre: nombreCompleto(ing.paciente), habitacion: ing.habitacion } : undefined
          })()}
        />
      )}

      {/* ══════════════ PENDIENTES DE COMPLETAR ══════════════ */}
      {(() => {
        // Las que más tiempo llevan abiertas, primero.
        const pendientes = eventosActivos
          .filter((ev) => ev.estado === 'pendiente')
          .sort((a, b) => diasPendiente(b) - diasPendiente(a))
        if (pendientes.length === 0) return null
        const atrasadas = pendientes.filter((ev) => diasPendiente(ev) > DIAS_PENDIENTE_AVISO).length
        return (
          <section>
            <div className="bg-amber-50 border border-amber-200 rounded-xl p-4">
              <p className="text-xs font-semibold text-amber-700 mb-3">
                {pendientes.length} {pendientes.length === 1 ? 'incidencia pendiente' : 'incidencias pendientes'} de completar
                {atrasadas > 0 && (
                  <span className="text-red-700"> · {atrasadas} {atrasadas === 1 ? 'lleva' : 'llevan'} más de {DIAS_PENDIENTE_AVISO} días</span>
                )}
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
                      <span className="text-slate-500">Hab. {ev.ingreso.habitacion ?? '—'}</span>
                    </span>
                    <span className="flex items-center gap-2">
                      <span className="text-xs text-slate-500">{new Date(ev.fecha).toLocaleDateString('es-ES')}</span>
                      <AntiguedadPendiente ev={ev} />
                    </span>
                  </button>
                ))}
              </div>
            </div>
          </section>
        )
      })()}

      {/* ══════════════ CONTENCIONES ACTIVAS ══════════════ */}
      <section>
        <div className="flex items-center justify-between gap-3 mb-3 flex-wrap">
          <p className="section-title !mb-0">Contenciones activas · ingresos activos</p>
          {!loadingContenciones && !errorContenciones && contenciones.length > 0 && (
            <button onClick={imprimirContenciones} className="btn-secondary text-xs py-1 gap-1" title="Imprimir la lista de contenciones activas">
              <Printer className="w-3.5 h-3.5" /> Imprimir
            </button>
          )}
        </div>
        {errorSemaforos && !loadingContenciones && (
          <p className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-1.5 mb-2">No se pudo cargar el semáforo de caídas: la columna Semáforo no es fiable ahora mismo.</p>
        )}
        <div className="card overflow-hidden">
          {loadingContenciones ? (
            <Cargando />
          ) : errorContenciones ? (
            <p className="px-4 py-8 text-center text-red-600 text-sm">{errorContenciones}</p>
          ) : contenciones.length === 0 ? (
            <p className="px-4 py-8 text-center text-slate-500 text-sm">Ningún paciente ingresado tiene contención pautada ahora mismo.</p>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b bg-slate-50 text-left text-xs font-semibold text-slate-500">
                  <th className="px-4 py-2.5">Hab.</th>
                  <th className="px-4 py-2.5">Paciente</th>
                  <th className="px-4 py-2.5">Semáforo</th>
                  <th className="px-4 py-2.5">Día</th>
                  <th className="px-4 py-2.5">Noche</th>
                  <th className="px-4 py-2.5">Última revisión</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {contenciones.map((c) => {
                  const sevDia = severidadDia(c.dia)
                  const nocheReal = ((c.noche as ContencionNoche[]) ?? []).filter((n) => NOCHE_ES_CONTENCION.includes(n))
                  const sevNoche = severidadNoche(nocheReal)
                  return (
                    <tr key={c.ingreso_id} className="hover:bg-slate-50 cursor-pointer" onClick={() => setModalContencion(c.ingreso_id)}>
                      <td className="px-4 py-2.5">{c.ingreso.habitacion ?? '—'}</td>
                      <td className="px-4 py-2.5 font-medium text-slate-700">
                        {/* La acción va dentro de la celda, como botón de verdad: se alcanza con el teclado. Pulsar en cualquier
                            otra parte de la fila sigue abriendo lo mismo, como comodidad para el ratón. */}
                        <button type="button" data-contencion-paciente={c.ingreso_id} onClick={() => setModalContencion(c.ingreso_id)}
                          className="text-left hover:text-primary-700 hover:underline focus:outline-none focus-visible:ring-2 focus-visible:ring-primary-400 rounded">
                          {nombreCompleto(c.ingreso.paciente)}
                        </button>
                      </td>
                      <td className="px-4 py-2.5" data-semaforo-contencion={c.ingreso_id}>
                        {semaforos[c.ingreso_id] ? (
                          <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium"
                            style={{ backgroundColor: SEMAFORO_CAIDAS_COLOR[semaforos[c.ingreso_id]!], color: semaforos[c.ingreso_id] === 'rojo' ? '#fff' : '#000' }}>
                            {MAYUS(semaforos[c.ingreso_id]!)}
                          </span>
                        ) : (
                          <span className="text-slate-500 text-xs">{errorSemaforos ? '—' : 'Sin semáforo'}</span>
                        )}
                      </td>
                      <td className="px-4 py-2.5">
                        {c.dia && c.dia !== 'ninguna' ? (
                          <span className={`px-2 py-0.5 rounded text-xs font-medium ${SEVERIDAD_ESTILO[sevDia].bg} ${SEVERIDAD_ESTILO[sevDia].text}`}>
                            {CONTENCION_DIA_LABEL[c.dia as ContencionDia]}
                          </span>
                        ) : <span className="text-slate-500">—</span>}
                      </td>
                      <td className="px-4 py-2.5">
                        {nocheReal.length > 0 ? (
                          <span className={`px-2 py-0.5 rounded text-xs font-medium ${SEVERIDAD_ESTILO[sevNoche].bg} ${SEVERIDAD_ESTILO[sevNoche].text}`}>
                            {nocheReal.map((n) => CONTENCION_NOCHE_LABEL[n]).join(', ')}
                          </span>
                        ) : <span className="text-slate-500">—</span>}
                      </td>
                      <td className="px-4 py-2.5 text-slate-500 text-xs">
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

      {/* ══════════════ INCIDENCIAS DE INGRESOS ACTIVOS ══════════════ */}
      <section>
        <p className="section-title">Incidencias de ingresos activos</p>
        <div className="card overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b bg-slate-50 text-left text-xs font-semibold text-slate-500">
                <th className="px-4 py-2.5 w-8"></th>
                <th className="px-4 py-2.5">Tipo</th>
                <th className="px-4 py-2.5 text-right">Pacientes afectados</th>
                <th className="px-4 py-2.5 text-right">Incidencias</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {loadingEstado ? (
                <tr><td colSpan={4} className="px-4 py-8 text-center text-slate-500">Cargando…</td></tr>
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
                  />
                ))
              )}
            </tbody>
          </table>
        </div>
      </section>

      {/* ══════════════ BUSCAR INCIDENCIAS ══════════════ */}
      {/* El único sitio con imprimir y exportar de toda la pantalla —
          actúa exactamente sobre el resultado filtrado, nunca sobre
          "todas las incidencias" a secas. */}
      <section>
        <p className="section-title">Buscar incidencias</p>
        <div className="card p-4 space-y-3">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <div>
              <label className="label">Desde</label>
              <InputFecha value={fDesde} onChange={setFDesde} />
            </div>
            <div>
              <label className="label">Hasta</label>
              <InputFecha value={fHasta} onChange={setFHasta} />
            </div>
            <div>
              <label className="label">Tipo</label>
              <select className="input" value={fTipo} onChange={(e) => setFTipo(e.target.value as TipoEvento | '')}>
                <option value="">Todos</option>
                {TIPOS_ORDEN.map((t) => <option key={t} value={t}>{TIPO_EVENTO_LABEL[t]}</option>)}
              </select>
            </div>
            <div>
              <label className="label">Paciente</label>
              <input className="input" placeholder="Nombre…" value={fPaciente} onChange={(e) => setFPaciente(e.target.value)} />
            </div>
            <div>
              <label className="label">Turno</label>
              <select className="input" value={fTurno} onChange={(e) => setFTurno(e.target.value)}>
                <option value="">Todos</option>
                {Object.entries(TURNO_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
              </select>
            </div>
            <div>
              <label className="label">Estado</label>
              <select className="input" value={fEstado} onChange={(e) => setFEstado(e.target.value)}>
                <option value="">Todos</option>
                <option value="completa">Completa</option>
                <option value="pendiente">Pendiente de completar</option>
              </select>
            </div>
            <div>
              <label className="label">Registrado por</label>
              <select className="input" value={fProfesional} onChange={(e) => setFProfesional(e.target.value)}>
                <option value="">Todos</option>
                {profesionales.map((p) => <option key={p.id} value={p.id}>{p.nombre} {p.apellidos}</option>)}
              </select>
            </div>
            <div>
              <label className="label">Médico responsable del ingreso</label>
              <select className="input" value={fMedicoResponsable} onChange={(e) => setFMedicoResponsable(e.target.value)}>
                <option value="">Todos</option>
                {profesionales.filter((p) => p.rol === 'medico').map((p) => <option key={p.id} value={p.id}>{p.nombre} {p.apellidos}</option>)}
              </select>
            </div>
            <div>
              <label className="label">Episodios</label>
              <select className="input" value={fAlcance} onChange={(e) => setFAlcance(e.target.value as typeof fAlcance)}>
                <option value="todos">Activos y cerrados</option>
                <option value="activos">Solo ingresos activos</option>
                <option value="cerrados">Solo episodios cerrados</option>
              </select>
            </div>
          </div>
          <div className="flex items-center gap-2 pt-1">
            <button onClick={() => buscarIncidencias()} disabled={buscando} className="btn-primary text-sm">
              <Search className="w-4 h-4" />
              {buscando ? 'Buscando…' : 'Buscar'}
            </button>
            <button onClick={limpiarFiltros} className="btn-secondary text-sm">Limpiar filtros</button>
          </div>
        </div>

        {errorBusqueda && (
          <div className="mt-3 bg-red-50 border border-red-200 text-red-700 text-sm rounded-lg px-4 py-3">{errorBusqueda}</div>
        )}

        {buscado && !errorBusqueda && (
          <div className="mt-3 card overflow-hidden">
            <div className="flex items-center justify-between gap-3 px-4 py-2.5 bg-slate-50 border-b flex-wrap">
              <p className="text-xs text-slate-500">
                <span className="font-semibold text-slate-700">{resultados.length}</span> resultado{resultados.length === 1 ? '' : 's'} · {resumenFiltros()}
              </p>
              {resultados.length > 0 && (
                <div className="flex gap-2">
                  <button onClick={exportarCSVBusqueda} className="btn-secondary text-xs py-1 gap-1">
                    <Download className="w-3.5 h-3.5" /> Exportar CSV
                  </button>
                  <button onClick={imprimirBusqueda} className="btn-secondary text-xs py-1 gap-1">
                    <Printer className="w-3.5 h-3.5" /> Imprimir
                  </button>
                </div>
              )}
            </div>
            {resultados.length === 0 ? (
              <p className="px-4 py-8 text-center text-slate-500 text-sm">Sin incidencias con estos filtros.</p>
            ) : (
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b bg-slate-50 text-left text-xs font-semibold text-slate-500">
                    <th className="px-4 py-2">Fecha</th>
                    <th className="px-4 py-2">Tipo</th>
                    <th className="px-4 py-2">Estado</th>
                    <th className="px-4 py-2">Paciente</th>
                    <th className="px-4 py-2">Episodio</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {resultados.map((ev) => (
                    <tr
                      key={ev.id}
                      className="hover:bg-slate-50 cursor-pointer"
                      onClick={atajoDeRaton(() => { if (ev.ingreso?.id) navigate(`/ingresos/${ev.ingreso.id}?tab=eventos`) })}
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
                          <span className="text-slate-500 text-xs">Completa</span>
                        )}
                      </td>
                      <td className="px-4 py-2 font-medium text-slate-700">
                        {ev.ingreso?.paciente && ev.ingreso.id ? (
                          <Link to={`/ingresos/${ev.ingreso.id}?tab=eventos`} className={`hover:text-primary-700 hover:underline ${FOCO_CELDA}`}>{nombreCompleto(ev.ingreso.paciente)}</Link>
                        ) : ev.ingreso?.paciente ? nombreCompleto(ev.ingreso.paciente) : '—'}
                      </td>
                      <td className="px-4 py-2 text-xs">
                        {ev.ingreso?.estado === 'activo' ? (
                          <span className="text-emerald-700">Activo</span>
                        ) : (
                          <span className="text-slate-500">Cerrado</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        )}
      </section>
    </div>
  )
}

// ─── Fila de tipo: resumen + tabla de detalle desplegable ─────

function FilaTipo({ resumen, filas, abierto, onToggle }: {
  resumen: { tipo: TipoEvento; pacientesAfectados: number; totalIncidencias: number }
  filas: EventoActivo[]
  abierto: boolean
  onToggle: () => void
}) {
  const campos = CAMPOS_POR_TIPO[resumen.tipo]
  return (
    <>
      <tr className="hover:bg-slate-50 transition-colors cursor-pointer" onClick={atajoDeRaton(onToggle)}>
        <td className="px-4 py-2.5 text-slate-500">
          {resumen.totalIncidencias > 0 && (abierto ? <ChevronDown aria-hidden className="w-3.5 h-3.5" /> : <ChevronRightIcon aria-hidden className="w-3.5 h-3.5" />)}
        </td>
        <td className="px-4 py-2.5 font-medium text-slate-700">
          {/* Botón de verdad (con teclado y lector de pantalla); el clic en el resto de la fila hace lo mismo. */}
          {resumen.totalIncidencias > 0 ? (
            <button type="button" onClick={onToggle} aria-expanded={abierto} data-tipo-fila={resumen.tipo} className={`text-left hover:text-primary-700 ${FOCO_CELDA}`}>
              {TIPO_EVENTO_LABEL[resumen.tipo]}
            </button>
          ) : TIPO_EVENTO_LABEL[resumen.tipo]}
        </td>
        <td className="px-4 py-2.5 text-right tabular-nums">
          {resumen.pacientesAfectados === 0
            ? <span className="text-slate-500">—</span>
            : <span className="font-semibold text-slate-800">{resumen.pacientesAfectados}</span>}
        </td>
        <td className="px-4 py-2.5 text-right tabular-nums text-slate-500">
          {resumen.totalIncidencias || <span className="text-slate-500">—</span>}
        </td>
      </tr>
      {abierto && filas.length > 0 && (
        <tr>
          <td colSpan={4} className="bg-slate-50 px-4 py-3">
            <div className="overflow-x-auto rounded-lg border border-slate-200 bg-white">
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b bg-slate-100 text-left text-xs font-semibold text-slate-500">
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
                      <td className="px-3 py-2 whitespace-nowrap">{ev.turno ? TURNO_LABEL[ev.turno as keyof typeof TURNO_LABEL] : '—'}</td>
                      <td className="px-3 py-2 font-medium text-slate-700">
                        <Link to={`/ingresos/${ev.ingreso.id}?tab=eventos`} className={`hover:text-primary-700 hover:underline ${FOCO_CELDA}`}>{nombreCompleto(ev.ingreso.paciente)}</Link>
                      </td>
                      <td className="px-3 py-2">{ev.ingreso.habitacion ?? '—'}</td>
                      {campos.map((c) => (
                        <td key={c.key} className="px-3 py-2">{ev.datos?.[c.key] ?? '—'}</td>
                      ))}
                      <td className="px-3 py-2 max-w-[160px] truncate">{ev.notas ?? ''}</td>
                      <td className="px-3 py-2 whitespace-nowrap">
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
