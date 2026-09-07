import { useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useAuth } from '../lib/AuthContext'
import type { Ingreso } from '../types'
import { SEMAFORO_CAIDAS_COLOR as SEMAFORO, nombreCompleto } from '../types'
import { edad, diasEntre, formatFechaLocal } from '../lib/fechas'
import { Plus, ClipboardList, ChevronRight, AlertTriangle, AlertCircle, Sun, Moon, RefreshCw, Printer } from 'lucide-react'
import ModalContencion from '../components/ModalContencion'
import Tooltip from '../components/Tooltip'
import { fetchContencionesPorIngreso } from '../lib/contenciones'
import { imprimirListaHabitaciones } from '../lib/imprimir'
import {
  severidadDia, severidadNoche, SEVERIDAD_ESTILO, necesitaConfirmacion,
  CONTENCION_DIA_LABEL, CONTENCION_NOCHE_LABEL,
  type ContencionDia, type ContencionNoche,
} from '../types/contenciones'
import { TIPO_EVENTO_LABEL, TIPO_EVENTO_COLOR, type TipoEvento } from '../types/eventos'

// Fecha de hace 7 días exactos, en el mismo formato que usa el resto
// de la aplicación para comparar con columnas "fecha".
function hace7dias(): string {
  const d = new Date()
  d.setDate(d.getDate() - 7)
  return formatFechaLocal(d)
}

// Definida una sola vez: antes esta misma plantilla de columnas
// estaba copiada a mano en tres sitios (cabecera, fila libre, fila
// ocupada) — cualquier ajuste futuro solo hace falta tocarlo aquí.
const COLUMNAS_TABLA = '2.5rem minmax(0,1.4fr) 3rem 3.5rem 5.5rem minmax(0,0.9fr) 6rem 7rem 3rem 2rem'

type IngresoConPaciente = Ingreso & {
  paciente: {
    nombre: string
    primer_apellido: string
    segundo_apellido?: string
    fecha_nacimiento?: string
    nhc?: string
  } | null
  medico_responsable: { nombre: string; apellidos: string } | null
}

export default function Home() {
  const [ingresos, setIngresos] = useState<IngresoConPaciente[]>([])
  const [items, setItems] = useState<Record<string, { semaforo_caidas?: string }>>({})
  const [informes, setInformes] = useState<Record<string, { impresion_diagnostica?: string; motivo_ingreso?: string }>>(
    {}
  )
  const [eventosPorIngreso, setEventosPorIngreso] = useState<Record<string, string[]>>({})
  const [contencionesPorIngreso, setContencionesPorIngreso] = useState<Record<string, { dia: ContencionDia | null; noche: ContencionNoche[] | null; confirmado_por_id: string | null }>>({})
  const [modalContencion, setModalContencion] = useState<string | null>(null) // ingresoId
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [error, setError] = useState('')
  const [errorAuxiliar, setErrorAuxiliar] = useState('')
  const navigate = useNavigate()
  const { rol } = useAuth()
  const esMedico = rol === 'medico'

  const today = new Date().toLocaleDateString('es-ES', {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  })

  async function fetchData() {
    setRefreshing(true)
    try {
      setError('')
      setErrorAuxiliar('')
      const { data, error: errPrincipal } = await supabase
        .from('ingresos')
        .select(
          '*, paciente:pacientes(nombre,primer_apellido,segundo_apellido,fecha_nacimiento,nhc), medico_responsable:profesionales(nombre,apellidos)'
        )
        .eq('estado', 'activo')
        .order('habitacion', { ascending: true })

      if (errPrincipal) {
        // Sin esto, un fallo real de red o permisos se veía igual que
        // "33 habitaciones libres" — que es justo lo contrario de lo
        // que está pasando. No se toca "ingresos": si ya había una
        // lista cargada de antes, se queda visible en vez de
        // borrarse, hasta que una recarga funcione de verdad.
        setError('No se pudo cargar la lista de pacientes ingresados: ' + errPrincipal.message)
        return
      }

      const list = (data ?? []) as IngresoConPaciente[]
      setIngresos(list)

      if (list.length > 0) {
        const ids = list.map((i) => i.id)

        const [
          { data: itemsData, error: errItems },
          { data: informesData, error: errInformes },
          { data: eventosData, error: errEventos },
          { mapa: contencionesPorIngresoMapa, error: errPautas },
        ] = await Promise.all([
          supabase.from('items_paciente').select('ingreso_id,semaforo_caidas').in('ingreso_id', ids),
          supabase.from('informe_ingreso').select('ingreso_id,impresion_diagnostica').in('ingreso_id', ids),
          // Solo los últimos 7 días — antes contaba todo el historial
          // del ingreso, así que con el tiempo el aviso dejaba de
          // decir "algo nuevo" para convertirse en "esto tiene
          // historial", que no es lo mismo de un vistazo.
          supabase.from('eventos').select('ingreso_id,tipo').in('ingreso_id', ids).gte('fecha', hace7dias()),
          fetchContencionesPorIngreso(ids),
        ])

        // La lista de pacientes es lo esencial y ya se ha podido
        // mostrar; si falla alguna de estas cuatro consultas
        // auxiliares, se avisa sin ocultar la lista — más útil que
        // "no hay incidencias" cuando en realidad no se sabe.
        if (errItems || errInformes || errEventos || errPautas) {
          setErrorAuxiliar('Algunos datos (diagnóstico, incidencias, contención) podrían no estar actualizados.')
        }

        const itemsMap: Record<string, { semaforo_caidas?: string }> = {}
        ;(itemsData ?? []).forEach((it: any) => {
          itemsMap[it.ingreso_id] = it
        })
        setItems(itemsMap)

        const informesMap: Record<string, { impresion_diagnostica?: string }> = {}
        ;(informesData ?? []).forEach((inf: any) => {
          informesMap[inf.ingreso_id] = inf
        })
        setInformes(informesMap)

        // Tipos de incidencia por ingreso, para el aviso rápido en la tabla.
        const eventosMap: Record<string, string[]> = {}
        ;(eventosData ?? []).forEach((ev: any) => {
          if (!eventosMap[ev.ingreso_id]) eventosMap[ev.ingreso_id] = []
          eventosMap[ev.ingreso_id].push(ev.tipo)
        })
        setEventosPorIngreso(eventosMap)

        setContencionesPorIngreso(contencionesPorIngresoMapa as Record<string, { dia: ContencionDia | null; noche: ContencionNoche[] | null; confirmado_por_id: string | null }>)
      }
    } finally {
      // Sin esto, un fallo en cualquiera de las consultas de arriba
      // (por ejemplo, si la tabla contenciones no existiera) dejaba
      // Inicio colgado en "Cargando…" para siempre.
      setLoading(false)
      setRefreshing(false)
    }
  }

  useEffect(() => {
    fetchData()
  }, [])

  // Sin esto, dejar Inicio abierto en una pestaña de fondo toda la
  // mañana enseñaba datos de hace horas al volver — ni el número de
  // habitaciones libres, ni las incidencias recién registradas por
  // otra persona, se actualizaban solos.
  useEffect(() => {
    function alVolver() {
      if (document.visibilityState === 'visible') fetchData()
    }
    window.addEventListener('focus', fetchData)
    document.addEventListener('visibilitychange', alVolver)
    return () => {
      window.removeEventListener('focus', fetchData)
      document.removeEventListener('visibilitychange', alVolver)
    }
  }, [])

  const slots: (IngresoConPaciente | null)[] = Array(33).fill(null)
  ingresos.forEach((i) => {
    if (i.habitacion && i.habitacion >= 1 && i.habitacion <= 33) slots[i.habitacion - 1] = i
  })
  const sinHabitacion = ingresos.filter((i) => !i.habitacion)

  const ocupadas = ingresos.length
  const libres = slots.filter((s) => s === null).length

  return (
    <div className="p-6 md:p-8">
      {/* Header */}
      <div className="flex items-start justify-between mb-5">
        <div>
          <h1 className="text-2xl font-bold text-slate-800">Unidad de Hospitalización</h1>
          <p className="text-sm text-slate-400 capitalize mt-0.5">{today}</p>
        </div>
        <div className="flex items-center gap-2 text-sm">
          <span className="px-3 py-1 bg-emerald-50 text-emerald-700 rounded-full font-medium">
            {ocupadas} ingresados
          </span>
          <span className="px-3 py-1 bg-slate-100 text-slate-500 rounded-full font-medium">{libres} libres</span>
          <button
            onClick={fetchData}
            disabled={refreshing}
            className="flex items-center gap-1.5 px-3 py-1 rounded-full border border-slate-200 text-slate-500 hover:bg-slate-50 font-medium disabled:opacity-60"
            title="Actualizar"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${refreshing ? 'animate-spin' : ''}`} />
            Actualizar
          </button>
          <button
            onClick={() => imprimirListaHabitaciones(slots.map((s) => s?.paciente ? nombreCompleto(s.paciente) : null))}
            className="flex items-center gap-1.5 px-3 py-1 rounded-full border border-slate-200 text-slate-500 hover:bg-slate-50 font-medium"
            title="Imprimir lista de pacientes"
          >
            <Printer className="w-3.5 h-3.5" />
            Imprimir
          </button>
        </div>
      </div>

      {/* Acciones rápidas */}
      <div className="flex gap-2 mb-5">
        {esMedico && (
          <Link to="/pacientes/nuevo" className="btn-primary">
            <Plus className="w-4 h-4" /> Nuevo ingreso
          </Link>
        )}
        <Link to="/items" className="btn-secondary">
          <ClipboardList className="w-4 h-4" /> Hoja de ítems
        </Link>
      </div>

      {/* Aviso: pacientes ingresados sin habitación asignada. Sin esto,
          un paciente así simplemente no aparecía en ningún sitio de esta
          pantalla — la rejilla solo coloca a quien tiene número de
          habitación, así que quedaba invisible en la vista principal
          del día a día. */}
      {!loading && sinHabitacion.length > 0 && (
        <div className="mb-4 border border-amber-200 bg-amber-50 rounded-lg px-4 py-3">
          <p className="text-xs font-semibold text-amber-800 uppercase tracking-wide mb-2">
            {sinHabitacion.length} paciente{sinHabitacion.length !== 1 ? 's' : ''} ingresado{sinHabitacion.length !== 1 ? 's' : ''} sin habitación asignada
          </p>
          <div className="space-y-1">
            {sinHabitacion.map((ingreso) => (
              <div
                key={ingreso.id}
                className="flex items-center justify-between text-sm cursor-pointer hover:bg-amber-100/60 rounded px-2 py-1 -mx-2"
                onClick={() => navigate(`/ingresos/${ingreso.id}?editar=habitacion`)}
              >
                <span className="text-amber-900 font-medium">
                  {ingreso.paciente ? nombreCompleto(ingreso.paciente) : '—'}
                </span>
                <span className="text-amber-700 text-xs">Asignar habitación →</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Tabla de habitaciones */}
      {loading ? (
        <div className="text-slate-400 py-12 text-center">Cargando…</div>
      ) : error ? (
        <div className="bg-red-50 border border-red-200 text-red-700 text-sm rounded-lg px-4 py-6 text-center space-y-2">
          <p>{error}</p>
          <button onClick={fetchData} className="btn-secondary text-xs">Reintentar</button>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-1">
          {errorAuxiliar && (
            <p className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-1.5 mb-1">
              {errorAuxiliar}
            </p>
          )}
          {/* Cabecera */}
          <div
            className="grid gap-x-3 text-xs font-semibold text-slate-400 uppercase tracking-wide px-3 pb-1"
            style={{ gridTemplateColumns: COLUMNAS_TABLA }}
          >
            <div>Hab.</div>
            <div>Paciente</div>
            <div>Edad</div>
            <div>Días</div>
            <div>Ingreso</div>
            <div>Médico</div>
            <div>Contención</div>
            <div>Incidencias</div>
            <div></div>
            <div></div>
          </div>

          {slots.map((ingreso, idx) => {
            const n = idx + 1
            const sem = ingreso ? items[ingreso.id]?.semaforo_caidas : undefined
            const semColor = sem ? SEMAFORO[sem] : null
            const textClr = sem === 'rojo' ? '#fff' : '#000'

            if (!ingreso) {
              return (
                <div
                  key={n}
                  className={`grid gap-x-3 items-center border border-dashed border-slate-150 rounded-lg px-3 py-1.5 transition-colors ${
                    esMedico ? 'cursor-pointer hover:border-primary-300 hover:bg-primary-50/30' : ''
                  }`}
                  style={{ gridTemplateColumns: COLUMNAS_TABLA }}
                  onClick={esMedico ? () => navigate(`/pacientes/nuevo?habitacion=${n}`) : undefined}
                  title={esMedico ? `Ingresar en habitación ${n}` : `Habitación ${n} libre`}
                >
                  <span className="text-xs font-bold text-slate-200">{n}</span>
                  <span className="text-xs text-slate-200">— libre —</span>
                  <span />
                  <span />
                  <span />
                  <span />
                  <span />
                  <span />
                  <span />
                  <span />
                </div>
              )
            }

            const p = ingreso.paciente
            const nombreDelPaciente = p
              ? nombreCompleto(p)
              : '—'
            const e = edad(p?.fecha_nacimiento ?? undefined)
            const dias = diasEntre(ingreso.fecha_ingreso)
            const fingreso = ingreso.fecha_ingreso
              ? new Date(ingreso.fecha_ingreso).toLocaleDateString('es-ES', {
                  day: '2-digit',
                  month: '2-digit',
                  year: '2-digit',
                })
              : '—'
            const medico = ingreso.medico_responsable
              ? `${ingreso.medico_responsable.nombre} ${ingreso.medico_responsable.apellidos}`.trim()
              : '—'
            const diagnostico = informes[ingreso.id]?.impresion_diagnostica ?? ingreso.motivo_ingreso ?? ''
            const diagnosticoCorto = diagnostico.length > 60 ? diagnostico.slice(0, 57) + '…' : diagnostico

            return (
              <div key={n} className="group">
                <div
                  className="grid gap-x-3 items-center bg-white border border-slate-200 rounded-lg px-3 py-2 hover:shadow-sm hover:border-primary-200 transition-all cursor-pointer"
                  style={{ gridTemplateColumns: COLUMNAS_TABLA }}
                  onClick={() => navigate(`/ingresos/${ingreso.id}`)}
                >
                  {/* Hab con semáforo */}
                  <div>
                    <div
                      className="w-7 h-7 rounded-lg flex items-center justify-center font-bold text-xs"
                      style={
                        semColor
                          ? { backgroundColor: semColor, color: textClr }
                          : { backgroundColor: '#f1f5f9', color: '#475569' }
                      }
                    >
                      {n}
                    </div>
                  </div>
                  {/* Nombre + diagnóstico */}
                  <div className="min-w-0 pr-2">
                    <p className="font-semibold text-slate-800 text-sm leading-tight truncate">{nombreDelPaciente}</p>
                    {diagnosticoCorto && (
                      <p className="text-xs text-slate-400 truncate leading-tight">{diagnosticoCorto}</p>
                    )}
                  </div>
                  {/* Edad */}
                  <div className="text-slate-500 text-xs">{e != null ? `${e}a` : '—'}</div>
                  {/* Días */}
                  <div>
                    {dias != null && (
                      <span
                        className={`text-xs font-medium px-1.5 py-0.5 rounded-full ${
                          dias > 60
                            ? 'bg-amber-100 text-amber-700'
                            : dias > 30
                              ? 'bg-yellow-50 text-yellow-600'
                              : 'text-slate-400'
                        }`}
                      >
                        {dias}d
                      </span>
                    )}
                  </div>
                  {/* F. ingreso */}
                  <div className="text-slate-400 text-xs">{fingreso}</div>
                  {/* Médico */}
                  <div className="text-slate-500 text-xs truncate">{medico}</div>
                  {/* Contención física: día y noche, acceso rápido sin salir de Inicio */}
                  <div className="flex items-center gap-1">
                    {(['dia', 'noche'] as const).map((eje) => {
                      const estado = contencionesPorIngreso[ingreso.id]
                      const valor = eje === 'dia' ? estado?.dia : estado?.noche
                      const sev = eje === 'dia' ? severidadDia(estado?.dia) : severidadNoche(estado?.noche)
                      const estilo = SEVERIDAD_ESTILO[sev]
                      const Icono = eje === 'dia' ? Sun : Moon
                      const etiqueta =
                        sev === 'sin_revisar' ? 'Sin revisar todavía'
                        : eje === 'dia' ? CONTENCION_DIA_LABEL[(valor as ContencionDia) ?? 'ninguna']
                        : (valor as ContencionNoche[] | undefined)?.length
                          ? (valor as ContencionNoche[]).map((v) => CONTENCION_NOCHE_LABEL[v]).join(', ')
                          : 'Ninguna'
                      // Pendiente de confirmar: severidad activa/si
                      // precisa, y todavía sin firma de un médico —
                      // se avisa con un parpadeo suave, no solo un
                      // color, para que no pase desapercibido en un
                      // vistazo rápido a la lista.
                      const pendienteConfirmar = eje === 'dia'
                        ? necesitaConfirmacion(estado?.dia, null) && !estado?.confirmado_por_id
                        : necesitaConfirmacion(null, estado?.noche) && !estado?.confirmado_por_id
                      return (
                        <div key={eje} className="relative group/tt">
                          <button
                            onClick={(e) => { e.stopPropagation(); setModalContencion(ingreso.id) }}
                            className={`relative flex items-center justify-center w-6 h-6 rounded-md border transition-colors ${estilo.bg} ${estilo.border} ${estilo.text} hover:opacity-80 ${pendienteConfirmar ? 'animate-pulse ring-2 ring-amber-400' : ''}`}
                          >
                            <Icono className="w-3.5 h-3.5" />
                            {sev === 'sin_revisar' && (
                              <AlertCircle className="w-2.5 h-2.5 text-slate-400 absolute -top-1 -right-1 bg-white rounded-full" />
                            )}
                            {pendienteConfirmar && (
                              <span className="w-2 h-2 rounded-full bg-amber-500 absolute -top-0.5 -right-0.5 animate-ping" />
                            )}
                          </button>
                          <Tooltip titulo={eje === 'dia' ? 'Día' : 'Noche'}>
                            <p className="text-xs text-slate-100">{etiqueta}</p>
                            {pendienteConfirmar && (
                              <p className="text-xs text-amber-300 font-medium mt-0.5">Pendiente de confirmación médica</p>
                            )}
                          </Tooltip>
                        </div>
                      )
                    })}
                  </div>
                  {/* Botón evento */}
                  {/* Antes abría directamente el formulario de
                      registrar — con decenas de personas en la
                      planta, era fácil que dos registraran el mismo
                      suceso sin saberlo. Ahora lleva primero a ver lo
                      que ya hay registrado; desde ahí, si hace falta,
                      se registra uno nuevo con conocimiento de causa. */}
                  <div
                    onClick={(e) => {
                      e.stopPropagation()
                      navigate(`/ingresos/${ingreso.id}?tab=eventos`)
                    }}
                    className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-amber-50 border border-amber-200 text-amber-700 hover:bg-amber-100 transition-colors text-xs font-medium cursor-pointer"
                    title="Ver incidencias de este paciente"
                  >
                    <AlertTriangle className="w-3 h-3 shrink-0" />
                    Incidencias
                  </div>
                  {/* Aviso de incidencias de los últimos 7 días, si las hay */}
                  {(() => {
                    const tipos = eventosPorIngreso[ingreso.id]
                    if (!tipos || tipos.length === 0) return <div />
                    // Contar por tipo, respetando el orden habitual de tipos
                    const conteo: Record<string, number> = {}
                    tipos.forEach((t) => { conteo[t] = (conteo[t] ?? 0) + 1 })
                    const entradas = Object.entries(conteo).sort((a, b) => b[1] - a[1])
                    return (
                      <div className="relative group/tt">
                        <div className="flex items-center gap-1 text-red-600 text-xs font-medium cursor-default w-fit">
                          <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
                          {tipos.length}
                        </div>
                        <Tooltip titulo="Incidencias · últimos 7 días">
                          {entradas.map(([tipo, n]) => (
                            <div key={tipo} className="flex items-center gap-1.5 text-xs">
                              <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${
                                (TIPO_EVENTO_COLOR[tipo as TipoEvento] ?? '').split(' ').find(c => c.startsWith('bg-')) ?? 'bg-slate-400'
                              }`} />
                              <span className="text-slate-100">{TIPO_EVENTO_LABEL[tipo as TipoEvento] ?? tipo}</span>
                              <span className="text-slate-400 ml-auto">×{n}</span>
                            </div>
                          ))}
                        </Tooltip>
                      </div>
                    )
                  })()}
                  {/* Arrow */}
                  <div className="flex justify-end">
                    <ChevronRight className="w-4 h-4 text-slate-200 group-hover:text-slate-400 transition-colors" />
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      )}

      {/* Modal contención física: pautar o ver, sin salir de Inicio */}
      {modalContencion && (
        <ModalContencion
          ingresoId={modalContencion}
          onClose={() => setModalContencion(null)}
          onGuardado={() => fetchData()}
          pacienteInfo={(() => {
            const ing = ingresos.find((i) => i.id === modalContencion)
            return ing?.paciente ? { nombre: nombreCompleto(ing.paciente), habitacion: ing.habitacion } : undefined
          })()}
        />
      )}
    </div>
  )
}
