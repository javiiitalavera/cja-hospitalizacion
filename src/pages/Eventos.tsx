import { useEffect, useState } from 'react'
import { Segmentado } from '../components/Segmentado'
import { CabeceraPagina } from '../components/CabeceraPagina'
import { BotonActualizar } from '../components/BotonActualizar'
import { Cargando } from '../components/Cargando'
import { useSearchParams } from 'react-router-dom'
import { escapeHtml, imprimirTablaHTML } from '../lib/imprimir'
import { formatFechaLocal } from '../lib/fechas'
import { useAuth } from '../lib/AuthContext'
import { supabase } from '../lib/supabase'
import { nombreCompleto, nombreYApellido, SEMAFORO_CAIDAS_COLOR } from '../types'
import { Printer, Plus } from 'lucide-react'
import { FILTRO_TIPOS_RETIRADOS } from '../types/eventos'
import {
  severidadDia, severidadNoche, SEVERIDAD_ESTILO, necesitaConfirmacion, NOCHE_ES_CONTENCION,
  CONTENCION_DIA_LABEL, CONTENCION_NOCHE_LABEL,
  type ContencionDia, type ContencionNoche,
} from '../types/contenciones'
import ModalContencion from '../components/ModalContencion'
import FormularioEvento from '../components/FormularioEvento'
import { Actuales, type EventoActual } from './eventos/Actuales'
import { Historico } from './eventos/Historico'
import { MAYUS, DIAS_VENTANA_ACTUALES } from './eventos/util'

type Vista = 'actuales' | 'historico' | 'contenciones'
const VISTAS: { clave: Vista; etiqueta: string }[] = [
  { clave: 'actuales', etiqueta: 'Actuales' },
  { clave: 'historico', etiqueta: 'Histórico' },
  { clave: 'contenciones', etiqueta: 'Contenciones' },
]

// Confirmación médica de la pauta de contención: quién la ha confirmado, o «Pendiente».
function textoConfirmacion(c: { confirmado_por_id?: string | null; confirmado_por?: { nombre: string; apellidos: string } | null }): string {
  if (!c.confirmado_por_id) return 'Pendiente'
  return c.confirmado_por ? `Confirmada · ${c.confirmado_por.nombre} ${c.confirmado_por.apellidos}` : 'Confirmada'
}

// ─── PÁGINA PRINCIPAL ─────────────────────────────────────────

export function Eventos() {
  const { esMedico } = useAuth()
  const [searchParams, setSearchParams] = useSearchParams()

  // La vista vive en la dirección (?vista=). Si se llega desde el Dashboard con filtros de incidencias, se abre el Histórico.
  const [vista, setVista] = useState<Vista>(() => {
    const v = searchParams.get('vista')
    if (VISTAS.some((x) => x.clave === v)) return v as Vista
    const desdeDashboard = ['desde', 'hasta', 'incidencias', 'tipo_incidencia', 'medico_responsable'].some((k) => searchParams.get(k))
    return desdeDashboard ? 'historico' : 'actuales'
  })
  // El Histórico se monta la primera vez que se abre y ya no se desmonta: así conserva sus filtros y resultados.
  const [historicoVisitado, setHistoricoVisitado] = useState(vista === 'historico')
  function cambiarVista(v: Vista) {
    setVista(v)
    if (v === 'historico') setHistoricoVisitado(true)
    setSearchParams({ vista: v }, { replace: true })
  }

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
          ingreso_id, dia, noche, actualizado_en, confirmado_por_id,
          confirmado_por:profesionales!confirmado_por_id(nombre, apellidos),
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
        <td>${escapeHtml(textoConfirmacion(c))}</td>
        <td>${c.actualizado_en ? new Date(c.actualizado_en).toLocaleDateString('es-ES') : '—'}</td>
      </tr>`
    }).join('')
    imprimirTablaHTML(
      'Contenciones activas',
      `${ordenadas.length} paciente${ordenadas.length === 1 ? '' : 's'} con contención pautada · ingresos activos`,
      '<tr><th>Hab.</th><th>Paciente</th><th>Semáforo</th><th>Día</th><th>Noche</th><th>Confirmación médica</th><th>Última revisión</th></tr>',
      tbody,
    )
  }

  // Los médicos ven primero las pautas pendientes de confirmar (que son su tarea); el resto, por habitación.
  const contencionesOrdenadas = esMedico
    ? [...contenciones].sort((a, b) => (a.confirmado_por_id ? 1 : 0) - (b.confirmado_por_id ? 1 : 0))
    : contenciones
  const sinConfirmar = contenciones.filter((c) => !c.confirmado_por_id).length

  // ── Incidencias: lo ocurrido en los últimos 30 días y lo pendiente de completar ──
  const [loadingEstado, setLoadingEstado] = useState(true)
  const [errorEstado, setErrorEstado] = useState('')
  const [eventosActuales, setEventosActuales] = useState<EventoActual[]>([])
  const [desdeVentana, setDesdeVentana] = useState(() => formatFechaLocal(new Date(Date.now() - DIAS_VENTANA_ACTUALES * 86400000)))

  useEffect(() => { fetchActuales() }, [])

  async function fetchActuales() {
    setLoadingEstado(true)
    setErrorEstado('')
    try {
      const desde = formatFechaLocal(new Date(Date.now() - DIAS_VENTANA_ACTUALES * 86400000))
      setDesdeVentana(desde)
      // Lo de los últimos 30 días (de cualquier ingreso, también el de quien ya se ha ido) y lo pendiente de cualquier fecha.
      const { data, error: err } = await supabase
        .from('eventos')
        .select(`
          id, tipo, fecha, hora, turno, datos, notas, estado, created_at, habitacion_evento,
          registrado_por:profesionales!registrado_por_id(nombre, apellidos),
          ingreso:ingresos!inner(id, habitacion, estado, paciente:pacientes(nombre, primer_apellido, segundo_apellido))
        `)
        .or(`fecha.gte.${desde},estado.eq.pendiente`)
        .not('tipo', 'in', FILTRO_TIPOS_RETIRADOS)   // úlceras (en Curas) e infección nosocomial (en el CMBD) ya no son incidencias
        .order('fecha', { ascending: false })
      if (err) {
        setErrorEstado('No se pudieron cargar las incidencias: ' + err.message)
        return
      }
      setEventosActuales((data ?? []) as unknown as EventoActual[])
    } finally {
      setLoadingEstado(false)
    }
  }

  const [refreshing, setRefreshing] = useState(false)
  async function actualizarTodo() {
    setRefreshing(true)
    await Promise.all([fetchContenciones(), fetchActuales()])
    setRefreshing(false)
  }

  // Igual que en Inicio y Hoja de Ítems: si esta pantalla se deja abierta un buen rato, otra persona puede haber pautado
  // una contención o registrado una incidencia sin que se note hasta recargar a mano. Se omite mientras hay algo abierto.
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

  const pendientesActivas = eventosActuales.filter((e) => e.estado === 'pendiente' && e.ingreso.estado === 'activo').length

  // ── Render ────────────────────────────────────────────────

  return (
    <div className="p-4 sm:p-6 md:p-8 space-y-6 ancho-tabla">

      <CabeceraPagina className="!mb-0" titulo="Incidencias" subtitulo="Incidencias de seguridad y contenciones de la planta">
        <BotonActualizar onClick={actualizarTodo} cargando={refreshing} />
        <button onClick={() => setSelectorPaciente(true)} className="btn-primary">
          <Plus className="w-4 h-4" />
          Registrar incidencia
        </button>
      </CabeceraPagina>

      <Segmentado
        etiqueta="Vista"
        valor={vista}
        onChange={cambiarVista}
        opciones={VISTAS.map(({ clave, etiqueta }) => ({
          clave,
          etiqueta,
          aviso: clave === 'actuales' ? pendientesActivas : clave === 'contenciones' && esMedico ? sinConfirmar : 0,
          avisoTitulo: clave === 'actuales' ? 'Pendientes de completar' : 'Pautas pendientes de confirmar',
        }))}
      />

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
          onGuardado={() => { setIngresoParaIncidencia(null); fetchActuales() }}
          pacienteInfo={(() => {
            const ing = pacientesActivos.find((i) => i.id === ingresoParaIncidencia)
            return ing?.paciente ? { nombre: nombreCompleto(ing.paciente), habitacion: ing.habitacion } : undefined
          })()}
        />
      )}

      {/* ══════════════ ACTUALES ══════════════ */}
      {vista === 'actuales' && (
        <Actuales
          eventos={eventosActuales}
          desde={desdeVentana}
          cargando={loadingEstado}
          error={errorEstado}
          onReintentar={fetchActuales}
          onIrAHistorico={() => cambiarVista('historico')}
        />
      )}

      {/* ══════════════ HISTÓRICO ══════════════ */}
      {historicoVisitado && (
        <div className={vista === 'historico' ? '' : 'hidden'}>
          <Historico />
        </div>
      )}

      {/* ══════════════ CONTENCIONES ══════════════ */}
      {vista === 'contenciones' && (
        <section>
          <div className="flex items-center justify-between gap-3 mb-3 flex-wrap">
            <p className="section-title !mb-0">
              Contenciones activas · ingresos activos
              {esMedico && sinConfirmar > 0 && (
                <span className="ml-2 normal-case font-medium text-amber-700">· {sinConfirmar} pendiente{sinConfirmar === 1 ? '' : 's'} de confirmar</span>
              )}
            </p>
            {!loadingContenciones && !errorContenciones && contenciones.length > 0 && (
              <button onClick={imprimirContenciones} className="btn-secondary btn-sm" title="Imprimir la lista de contenciones activas">
                <Printer className="w-3.5 h-3.5" /> Imprimir
              </button>
            )}
          </div>
          {errorSemaforos && !loadingContenciones && (
            <p className="aviso aviso-atencion mb-2">No se pudo cargar el semáforo de caídas: la columna Semáforo no es fiable ahora mismo.</p>
          )}
          <div className="card overflow-x-auto">
            {loadingContenciones ? (
              <Cargando />
            ) : errorContenciones ? (
              <p className="px-4 py-8 text-center text-red-600 text-sm">{errorContenciones}</p>
            ) : contenciones.length === 0 ? (
              <p className="px-4 py-8 text-center text-slate-500 text-sm">Ningún paciente ingresado tiene contención pautada ahora mismo.</p>
            ) : (
              <table className="w-full text-sm min-w-[560px]">
                <thead>
                  <tr className="border-b bg-slate-50 text-left text-xs font-semibold text-slate-500">
                    <th className="px-4 py-2.5">Hab.</th>
                    <th className="px-4 py-2.5">Paciente</th>
                    <th className="px-4 py-2.5">Semáforo</th>
                    <th className="px-4 py-2.5">Día</th>
                    <th className="px-4 py-2.5">Noche</th>
                    <th className="px-4 py-2.5">Confirmación médica</th>
                    <th className="px-4 py-2.5">Última revisión</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {contencionesOrdenadas.map((c) => {
                    const sevDia = severidadDia(c.dia)
                    const nocheReal = ((c.noche as ContencionNoche[]) ?? []).filter((n) => NOCHE_ES_CONTENCION.includes(n))
                    const sevNoche = severidadNoche(nocheReal)
                    return (
                      <tr key={c.ingreso_id} className="hover:bg-slate-50 cursor-pointer" onClick={() => setModalContencion(c.ingreso_id)}>
                        <td className="px-4 py-2.5">{c.ingreso.habitacion ?? '—'}</td>
                        <td className="px-4 py-2.5 font-medium text-slate-700 whitespace-nowrap">
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
                        <td className="px-4 py-2.5 text-xs" data-confirmacion-contencion={c.ingreso_id}>
                          {c.confirmado_por_id
                            ? <span className="text-emerald-700">{textoConfirmacion(c)}</span>
                            : <span className="text-amber-700 font-medium">Pendiente</span>}
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
      )}

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
    </div>
  )
}
