import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../lib/AuthContext'
import { X, Save, History as HistoryIcon, ChevronDown, AlertCircle, ShieldCheck } from 'lucide-react'
import {
  DIA_OPCIONES, NOCHE_OPCIONES, CONTENCION_DIA_LABEL, CONTENCION_DIA_DESC, CONTENCION_NOCHE_LABEL,
  severidadDia, severidadNoche, SEVERIDAD_ESTILO, necesitaConfirmacion,
  TIPO_ACCION_HISTORIAL_LABEL, TIPO_ACCION_HISTORIAL_COLOR,
  type ContencionDia, type ContencionNoche, type EstadoContencion, type HistorialContencion,
} from '../types/contenciones'

interface Props {
  ingresoId: string
  onClose: () => void
  onGuardado?: () => void
  // Opcional: para que quien abre el modal desde una lista (Inicio,
  // Hoja de Ítems) pueda mostrar de quién se trata sin tener que
  // volver a cargar los datos del paciente aquí dentro.
  pacienteInfo?: { nombre: string; habitacion?: number | null }
}

export default function ModalContencion({ ingresoId, onClose, onGuardado, pacienteInfo }: Props) {
  const { profesional, rol } = useAuth()
  const esMedico = rol === 'medico'
  const [confirmando, setConfirmando] = useState(false)
  const [conflicto, setConflicto] = useState(false)
  const [loading, setLoading] = useState(true)
  const [dia, setDia] = useState<ContencionDia>('ninguna')
  const [noche, setNoche] = useState<ContencionNoche[]>([])
  const [nuncaRevisado, setNuncaRevisado] = useState(false)
  const [ultimo, setUltimo] = useState<EstadoContencion | null>(null)
  const [guardando, setGuardando] = useState(false)
  const [error, setError] = useState('')
  const [loadError, setLoadError] = useState('')
  const [mostrarHistorial, setMostrarHistorial] = useState(false)
  const [historial, setHistorial] = useState<HistorialContencion[] | null>(null)

  useEffect(() => { cargar() }, [ingresoId])

  async function cargar() {
    setLoading(true)
    setLoadError('')
    setConflicto(false)
    try {
      const { data, error: err } = await supabase
        .from('contenciones')
        .select('*, actualizado_por:profesionales!actualizado_por_id(nombre, apellidos), confirmado_por:profesionales!confirmado_por_id(nombre, apellidos)')
        .eq('ingreso_id', ingresoId)
        .maybeSingle()
      if (err) {
        // Distinto del error de guardado: mientras esto esté activo,
        // no se debe poder guardar — el formulario estaría mostrando
        // valores por defecto, no el estado real, y guardar
        // sobrescribiría una orden real con "ninguna".
        setLoadError('No se pudo cargar el estado actual: ' + err.message)
        return
      }
      if (data) {
        setDia((data.dia as ContencionDia) ?? 'ninguna')
        setNoche((data.noche as ContencionNoche[]) ?? [])
        setNuncaRevisado(data.dia === null && data.noche === null)
        setUltimo(data as unknown as EstadoContencion)
      } else {
        setNuncaRevisado(true)
      }
    } finally {
      setLoading(false)
    }
  }

  async function cargarHistorial() {
    if (historial !== null) { setMostrarHistorial((v) => !v); return }
    const { data, error: err } = await supabase
      .from('contenciones_historial')
      .select('*, actor:profesionales!actor_id(nombre, apellidos)')
      .eq('ingreso_id', ingresoId)
      .order('cambiado_en', { ascending: false })
      .limit(20)
    if (err) {
      setError('No se pudo cargar el historial: ' + err.message)
      return
    }
    setHistorial((data ?? []) as unknown as HistorialContencion[])
    setMostrarHistorial(true)
  }

  function toggleNoche(opt: ContencionNoche) {
    setNoche((prev) => (prev.includes(opt) ? prev.filter((x) => x !== opt) : [...prev, opt]))
  }

  async function guardar() {
    if (loadError) return // por si acaso: nunca guardar sobre un estado que no se llegó a cargar de verdad
    if (!profesional) {
      setError('No se ha podido identificar tu sesión. Recarga la página e inténtalo de nuevo.')
      return
    }
    setGuardando(true)
    setError('')

    if (!ultimo) {
      // Todavía no existe ninguna fila para este ingreso: es la
      // primera vez que se pauta algo. Si dos personas lo hicieran a
      // la vez, la propia clave primaria (ingreso_id) rechazaría la
      // segunda inserción — se trata igual que cualquier otro
      // conflicto, no como un error cualquiera.
      const { error: err } = await supabase.from('contenciones').insert({
        ingreso_id: ingresoId,
        dia,
        noche,
        actualizado_por_id: profesional.id,
      })
      setGuardando(false)
      if (err) {
        if (err.code === '23505') {
          setConflicto(true)
          return
        }
        setError('No se pudo guardar: ' + err.message)
        return
      }
      onGuardado?.()
      onClose()
      return
    }

    // Ya existe una fila: la actualización exige la versión que se
    // leyó al abrir el modal. Si alguien más la cambió mientras
    // tanto, la versión ya no coincide y esto no actualiza ninguna
    // fila — en vez de pisar ese cambio en silencio, se avisa.
    const { data: guardado, error: err } = await supabase
      .from('contenciones')
      .update({
        dia,
        noche,
        actualizado_por_id: profesional.id,
        // Sin actualizado_en: lo pone la propia base de datos, no el
        // reloj del ordenador de quien guarda.
      })
      .eq('ingreso_id', ingresoId)
      .eq('version', ultimo.version)
      .select()
      .maybeSingle()
    setGuardando(false)
    if (err) {
      setError('No se pudo guardar: ' + err.message)
      return
    }
    if (!guardado) {
      setConflicto(true)
      return
    }
    onGuardado?.()
    onClose()
  }

  async function confirmar() {
    if (!profesional || !ultimo) return
    setConfirmando(true)
    setError('')
    const { error: err } = await supabase.rpc('confirmar_contencion', {
      p_ingreso_id: ingresoId,
      p_version_esperada: ultimo.version,
    })
    setConfirmando(false)
    if (err) {
      if (err.message === 'version_desactualizada') {
        setConflicto(true)
        return
      }
      setError('No se pudo confirmar: ' + err.message)
      return
    }
    await cargar()
    onGuardado?.()
  }

  async function retirar() {
    if (!profesional) return
    setConfirmando(true)
    setError('')
    const { error: err } = await supabase.rpc('retirar_confirmacion_contencion', {
      p_ingreso_id: ingresoId,
    })
    setConfirmando(false)
    if (err) {
      setError('No se pudo retirar la confirmación: ' + err.message)
      return
    }
    await cargar()
    onGuardado?.()
  }

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg max-h-[90vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b">
          <div>
            <h2 className="text-base font-bold text-slate-800">Contención física</h2>
            {pacienteInfo && (
              <p className="text-xs text-slate-400 mt-0.5">
                {pacienteInfo.nombre}
                {pacienteInfo.habitacion != null && ` · Hab. ${pacienteInfo.habitacion}`}
              </p>
            )}
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Body */}
        <div className="overflow-y-auto flex-1 px-6 py-5 space-y-5">
          {loading ? (
            <p className="text-sm text-slate-400 text-center py-8">Cargando…</p>
          ) : loadError ? (
            <div className="text-center py-8 space-y-3">
              <p className="text-sm text-red-600 bg-red-50 border border-red-100 rounded-lg px-3 py-2">{loadError}</p>
              <button onClick={cargar} className="btn-secondary text-xs">Reintentar</button>
            </div>
          ) : conflicto ? (
            <div className="text-center py-8 space-y-3">
              <p className="text-sm text-amber-800 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
                Alguien más ha modificado esta pauta mientras la tenías abierta. Recarga para ver el cambio antes de guardar el tuyo.
              </p>
              <button onClick={cargar} className="btn-primary text-xs">Recargar</button>
            </div>
          ) : (
            <>
              {nuncaRevisado && (
                <div className="flex items-start gap-2 bg-slate-50 border border-slate-200 rounded-lg px-3 py-2.5">
                  <AlertCircle className="w-4 h-4 text-slate-400 shrink-0 mt-0.5" />
                  <p className="text-xs text-slate-500">
                    Todavía no se ha revisado la contención de este paciente. Al guardar, quedará registrado.
                  </p>
                </div>
              )}

              {/* Confirmación médica: solo hace falta cuando hay
                  contención de verdad, no para medidas de seguridad
                  ni cuando no hay nada pautado. */}
              {necesitaConfirmacion(ultimo?.dia, ultimo?.noche) && (
                ultimo?.confirmado_por_id ? (
                  <div className="flex items-center justify-between gap-2 bg-emerald-50 border border-emerald-200 rounded-lg px-3 py-2.5">
                    <div className="flex items-center gap-2">
                      <ShieldCheck className="w-4 h-4 text-emerald-600 shrink-0" />
                      <p className="text-xs text-emerald-800">
                        Confirmada por {ultimo.confirmado_por?.nombre} {ultimo.confirmado_por?.apellidos}
                        {ultimo.confirmado_en && ` · ${new Date(ultimo.confirmado_en).toLocaleString('es-ES', { dateStyle: 'short', timeStyle: 'short' })}`}
                      </p>
                    </div>
                    {esMedico && (
                      <button onClick={retirar} disabled={confirmando} className="text-[11px] text-emerald-700 hover:underline shrink-0">
                        Retirar
                      </button>
                    )}
                  </div>
                ) : (
                  <div className="flex items-center justify-between gap-2 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2.5">
                    <p className="text-xs text-amber-800 font-medium">Pendiente de confirmación médica</p>
                    {esMedico ? (
                      <button onClick={confirmar} disabled={confirmando} className="btn-primary text-xs py-1 shrink-0">
                        {confirmando ? 'Confirmando…' : 'Confirmar'}
                      </button>
                    ) : (
                      <span className="text-[11px] text-amber-600">Solo un médico puede confirmarla</span>
                    )}
                  </div>
                )
              )}

              {/* DÍA */}
              <div>
                <p className="text-xs font-bold text-primary-600 uppercase tracking-widest mb-2">Día</p>
                <div className="space-y-1.5">
                  {DIA_OPCIONES.map((opt) => {
                    const activo = dia === opt
                    const sev = severidadDia(opt)
                    const estilo = SEVERIDAD_ESTILO[sev]
                    const desc = CONTENCION_DIA_DESC[opt]
                    return (
                      <button
                        key={opt}
                        type="button"
                        onClick={() => setDia(opt)}
                        className={`w-full flex items-center gap-2 px-3 py-2 rounded-lg border transition-colors overflow-hidden ${
                          activo ? `${estilo.bg} ${estilo.border}` : 'bg-white border-slate-200 hover:bg-slate-50'
                        }`}
                      >
                        <span className={`w-2 h-2 rounded-full shrink-0 ${activo ? estilo.text.replace('text-', 'bg-') : 'bg-slate-200'}`} />
                        <span className={`text-sm font-medium shrink-0 whitespace-nowrap ${activo ? estilo.text : 'text-slate-700'}`}>
                          {CONTENCION_DIA_LABEL[opt]}
                        </span>
                        {desc && <span className="text-xs text-slate-400 truncate">— {desc}</span>}
                      </button>
                    )
                  })}
                </div>
              </div>

              {/* NOCHE */}
              <div>
                <p className="text-xs font-bold text-primary-600 uppercase tracking-widest mb-2">Noche</p>
                <p className="text-xs text-slate-400 mb-2">Se pueden marcar varias a la vez.</p>
                <div className="flex flex-wrap gap-1.5">
                  {/* "Normal" es excluyente: lo mismo que dejar todo lo demás sin marcar */}
                  <button
                    type="button"
                    onClick={() => setNoche([])}
                    className={`px-3 py-1.5 rounded-lg border text-xs font-medium transition-colors ${
                      noche.length === 0
                        ? `${SEVERIDAD_ESTILO.ninguna.bg} ${SEVERIDAD_ESTILO.ninguna.text} ${SEVERIDAD_ESTILO.ninguna.border}`
                        : 'bg-white text-slate-500 border-slate-200 hover:bg-slate-50'
                    }`}
                  >
                    Normal
                  </button>
                  {NOCHE_OPCIONES.map((opt) => {
                    const activo = noche.includes(opt)
                    const sev = severidadNoche([opt])
                    const estilo = SEVERIDAD_ESTILO[sev]
                    return (
                      <button
                        key={opt}
                        type="button"
                        onClick={() => toggleNoche(opt)}
                        className={`px-3 py-1.5 rounded-lg border text-xs font-medium transition-colors ${
                          activo ? `${estilo.bg} ${estilo.text} ${estilo.border}` : 'bg-white text-slate-500 border-slate-200 hover:bg-slate-50'
                        }`}
                      >
                        {CONTENCION_NOCHE_LABEL[opt]}
                      </button>
                    )
                  })}
                </div>
              </div>

              {/* Último cambio conocido */}
              {ultimo?.actualizado_en && (
                <p className="text-xs text-slate-400 border-t pt-3">
                  Última revisión: {new Date(ultimo.actualizado_en).toLocaleString('es-ES', { dateStyle: 'short', timeStyle: 'short' })}
                  {ultimo.actualizado_por && ` · ${ultimo.actualizado_por.nombre} ${ultimo.actualizado_por.apellidos}`}
                </p>
              )}

              {/* Historial desplegable */}
              <div>
                <button
                  type="button"
                  onClick={cargarHistorial}
                  className="flex items-center gap-1.5 text-xs text-slate-500 hover:text-slate-700 font-medium"
                >
                  <HistoryIcon className="w-3.5 h-3.5" />
                  Historial de cambios
                  <ChevronDown className={`w-3.5 h-3.5 transition-transform ${mostrarHistorial ? 'rotate-180' : ''}`} />
                </button>
                {mostrarHistorial && (
                  <div className="mt-2 space-y-1.5 max-h-48 overflow-y-auto border-t pt-2">
                    {historial && historial.length === 0 ? (
                      <p className="text-xs text-slate-400 italic">Sin cambios registrados todavía.</p>
                    ) : (
                      historial?.map((h) => (
                        <div key={h.id} className="text-xs bg-slate-50 rounded px-2.5 py-1.5">
                          <div className="flex items-center justify-between gap-2 mb-1">
                            {h.tipo_accion && (
                              <span className={`px-1.5 py-0.5 rounded text-[10px] font-semibold ${TIPO_ACCION_HISTORIAL_COLOR[h.tipo_accion] ?? 'bg-slate-100 text-slate-600'}`}>
                                {TIPO_ACCION_HISTORIAL_LABEL[h.tipo_accion] ?? h.tipo_accion}
                              </span>
                            )}
                            <span className="text-slate-400">
                              {new Date(h.cambiado_en).toLocaleString('es-ES', { dateStyle: 'short', timeStyle: 'short' })}
                            </span>
                          </div>
                          <p className="text-slate-600">
                            <span className="font-medium">Día:</span> {h.dia ? CONTENCION_DIA_LABEL[h.dia] : '—'}
                            {' · '}
                            <span className="font-medium">Noche:</span>{' '}
                            {h.noche && h.noche.length > 0 ? h.noche.map((n) => CONTENCION_NOCHE_LABEL[n]).join(', ') : 'ninguna'}
                          </p>
                          {/* El actor es quien hizo ESTA acción en
                              concreto — para confirmar o retirar una
                              confirmación, es una persona distinta de
                              quien había editado la pauta antes. */}
                          {h.actor && (
                            <p className="text-slate-400 mt-0.5">{h.actor.nombre} {h.actor.apellidos}</p>
                          )}
                        </div>
                      ))
                    )}
                  </div>
                )}
              </div>

              {error && (
                <p className="text-sm text-red-600 bg-red-50 border border-red-100 rounded-lg px-3 py-2">{error}</p>
              )}
            </>
          )}
        </div>

        {/* Footer */}
        {!loading && (
          <div className="flex justify-end gap-3 px-6 py-4 border-t">
            <button onClick={onClose} className="btn-secondary">Cancelar</button>
            {!loadError && !conflicto && (
              <button onClick={guardar} disabled={guardando} className="btn-primary">
                <Save className="w-4 h-4" />
                {guardando ? 'Guardando…' : 'Guardar'}
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
