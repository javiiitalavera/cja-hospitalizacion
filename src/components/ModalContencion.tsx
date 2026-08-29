import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../lib/AuthContext'
import { X, Save, History as HistoryIcon, ChevronDown, AlertCircle } from 'lucide-react'
import {
  DIA_OPCIONES, NOCHE_OPCIONES, CONTENCION_DIA_LABEL, CONTENCION_DIA_DESC, CONTENCION_NOCHE_LABEL,
  severidadDia, severidadNoche, SEVERIDAD_ESTILO,
  type ContencionDia, type ContencionNoche, type EstadoContencion, type HistorialContencion,
} from '../types/contenciones'

interface Props {
  ingresoId: string
  onClose: () => void
  onGuardado?: () => void
}

export default function ModalContencion({ ingresoId, onClose, onGuardado }: Props) {
  const { profesional } = useAuth()
  const [loading, setLoading] = useState(true)
  const [dia, setDia] = useState<ContencionDia>('ninguna')
  const [noche, setNoche] = useState<ContencionNoche[]>([])
  const [nuncaRevisado, setNuncaRevisado] = useState(false)
  const [ultimo, setUltimo] = useState<EstadoContencion | null>(null)
  const [guardando, setGuardando] = useState(false)
  const [error, setError] = useState('')
  const [mostrarHistorial, setMostrarHistorial] = useState(false)
  const [historial, setHistorial] = useState<HistorialContencion[] | null>(null)

  useEffect(() => { cargar() }, [ingresoId])

  async function cargar() {
    setLoading(true)
    try {
      const { data } = await supabase
        .from('contenciones')
        .select('*, actualizado_por:profesionales!actualizado_por_id(nombre, apellidos)')
        .eq('ingreso_id', ingresoId)
        .maybeSingle()
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
    const { data } = await supabase
      .from('contenciones_historial')
      .select('*, cambiado_por:profesionales!cambiado_por_id(nombre, apellidos)')
      .eq('ingreso_id', ingresoId)
      .order('cambiado_en', { ascending: false })
      .limit(20)
    setHistorial((data ?? []) as unknown as HistorialContencion[])
    setMostrarHistorial(true)
  }

  function toggleNoche(opt: ContencionNoche) {
    setNoche((prev) => (prev.includes(opt) ? prev.filter((x) => x !== opt) : [...prev, opt]))
  }

  async function guardar() {
    if (!profesional) {
      setError('No se ha podido identificar tu sesión. Recarga la página e inténtalo de nuevo.')
      return
    }
    setGuardando(true)
    setError('')
    const { error: err } = await supabase.from('contenciones').upsert({
      ingreso_id: ingresoId,
      dia,
      noche,
      actualizado_por_id: profesional.id,
      actualizado_en: new Date().toISOString(),
    })
    setGuardando(false)
    if (err) {
      setError('No se pudo guardar: ' + err.message)
      return
    }
    onGuardado?.()
    onClose()
  }

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg max-h-[90vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b">
          <h2 className="text-base font-bold text-slate-800">Contención física</h2>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Body */}
        <div className="overflow-y-auto flex-1 px-6 py-5 space-y-5">
          {loading ? (
            <p className="text-sm text-slate-400 text-center py-8">Cargando…</p>
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
                        className={`w-full flex items-center gap-2 px-3 py-2 rounded-lg border transition-colors ${
                          activo ? `${estilo.bg} ${estilo.border}` : 'bg-white border-slate-200 hover:bg-slate-50'
                        }`}
                      >
                        <span className={`w-2 h-2 rounded-full shrink-0 ${activo ? estilo.text.replace('text-', 'bg-') : 'bg-slate-200'}`} />
                        <span className={`text-sm font-medium ${activo ? estilo.text : 'text-slate-700'}`}>
                          {CONTENCION_DIA_LABEL[opt]}
                        </span>
                        {desc && <span className="text-xs text-slate-400">— {desc}</span>}
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
                          <p className="text-slate-600">
                            <span className="font-medium">Día:</span> {h.dia ? CONTENCION_DIA_LABEL[h.dia] : '—'}
                            {' · '}
                            <span className="font-medium">Noche:</span>{' '}
                            {h.noche && h.noche.length > 0 ? h.noche.map((n) => CONTENCION_NOCHE_LABEL[n]).join(', ') : 'ninguna'}
                          </p>
                          <p className="text-slate-400 mt-0.5">
                            {new Date(h.cambiado_en).toLocaleString('es-ES', { dateStyle: 'short', timeStyle: 'short' })}
                            {h.cambiado_por && ` · ${h.cambiado_por.nombre} ${h.cambiado_por.apellidos}`}
                          </p>
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
            <button onClick={guardar} disabled={guardando} className="btn-primary">
              <Save className="w-4 h-4" />
              {guardando ? 'Guardando…' : 'Guardar'}
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
