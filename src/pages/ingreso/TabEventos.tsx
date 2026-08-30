import { useEffect, useState } from 'react'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../lib/AuthContext'
import { Plus, Pencil, Trash2 } from 'lucide-react'
import FormularioEvento from '../../components/FormularioEvento'
import { TIPO_EVENTO_LABEL, TIPO_EVENTO_COLOR, TURNO_LABEL, type Evento } from '../../types/eventos'

function TabEventos({ ingresoId }: { ingresoId: string }) {
  const { profesional, esAdmin } = useAuth()
  const [eventos, setEventos] = useState<Evento[]>([])
  const [loading, setLoading] = useState(true)
  const [modal, setModal] = useState(false)
  const [editando, setEditando] = useState<Evento | null>(null)
  const [errorBorrar, setErrorBorrar] = useState('')
  const [errorCarga, setErrorCarga] = useState('')

  // Solo quien registró la incidencia, o un administrador, puede
  // corregirla o borrarla — coincide con lo que ya exige la base de
  // datos; esto solo evita mostrar un botón que fallaría en silencio.
  function puedeEditar(ev: Evento): boolean {
    return esAdmin || (!!profesional && ev.registrado_por_id === profesional.id)
  }

  async function fetchEventos() {
    try {
      setErrorCarga('')
      const { data, error: err } = await supabase
        .from('eventos')
        .select('*, registrado_por:profesionales(nombre, apellidos, rol)')
        .eq('ingreso_id', ingresoId)
        .order('fecha', { ascending: false })
        .order('created_at', { ascending: false })
      if (err) {
        // Sin esto, un fallo real se veía igual que "sin incidencias"
        // — que en una hoja clínica es una diferencia importante.
        setErrorCarga('No se pudieron cargar las incidencias: ' + err.message)
        return
      }
      setEventos((data ?? []) as Evento[])
    } finally {
      // "finally" en vez de dejarlo al final del try: así, si la
      // petición falla del todo (p. ej. sin red), la pantalla no se
      // queda en "Cargando…" para siempre.
      setLoading(false)
    }
  }

  useEffect(() => { fetchEventos() }, [ingresoId])

  async function eliminar(id: string) {
    if (!confirm('¿Eliminar esta incidencia?')) return
    setErrorBorrar('')
    const { error } = await supabase.from('eventos').delete().eq('id', id)
    if (error) {
      // Sin esto, si el permiso lo bloquea (no eres el autor ni
      // admin), la incidencia sigue ahí y el usuario ve que
      // aparentemente "no ha pasado nada", sin saber por qué.
      setErrorBorrar('No se pudo eliminar: ' + error.message)
      return
    }
    fetchEventos()
  }

  function abrirEditar(ev: Evento) {
    setEditando(ev)
    setModal(true)
  }

  function cerrarModal() {
    setModal(false)
    setEditando(null)
  }

  return (
    <div className="max-w-3xl space-y-4">
      {errorBorrar && (
        <div className="bg-red-50 border border-red-200 text-red-700 text-sm rounded-lg px-4 py-2.5">{errorBorrar}</div>
      )}
      <div className="flex justify-between items-center">
        <p className="text-sm text-slate-500">{eventos.length} incidencia{eventos.length !== 1 ? 's' : ''} registrada{eventos.length !== 1 ? 's' : ''}</p>
        <button onClick={() => setModal(true)} className="btn-primary">
          <Plus className="w-4 h-4" />
          Registrar incidencia
        </button>
      </div>

      {loading ? (
        <div className="text-slate-400 text-sm py-8 text-center">Cargando…</div>
      ) : errorCarga ? (
        <div className="card p-10 text-center space-y-2">
          <p className="text-red-600 text-sm">{errorCarga}</p>
          <button onClick={fetchEventos} className="btn-secondary text-xs">Reintentar</button>
        </div>
      ) : eventos.length === 0 ? (
        <div className="card p-10 text-center text-slate-400 text-sm">
          No hay incidencias registradas en este ingreso.
        </div>
      ) : (
        <div className="space-y-3">
          {eventos.map(ev => (
            <div key={ev.id} className="card p-4">
              <div className="flex items-start justify-between gap-3">
                <div className="flex-1">
                  {/* Tipo + fecha */}
                  <div className="flex items-center gap-2 flex-wrap mb-2">
                    <span className={`px-2 py-0.5 rounded-full text-xs font-semibold border ${TIPO_EVENTO_COLOR[ev.tipo]}`}>
                      {TIPO_EVENTO_LABEL[ev.tipo]}
                    </span>
                    <span className="text-xs text-slate-500">
                      {new Date(ev.fecha).toLocaleDateString('es-ES')}
                      {ev.hora && ` · ${ev.hora.slice(0, 5)}`}
                      {ev.turno && ` · Turno ${TURNO_LABEL[ev.turno]}`}
                    </span>
                  </div>

                  {/* Campos específicos */}
                  {Object.entries(ev.datos).length > 0 && (
                    <div className="grid grid-cols-2 gap-x-4 gap-y-1 mb-2">
                      {Object.entries(ev.datos).map(([k, v]) => (
                        <div key={k} className="text-xs">
                          <span className="text-slate-400 capitalize">{k.replace(/_/g, ' ')}: </span>
                          <span className="text-slate-700 font-medium">{v}</span>
                        </div>
                      ))}
                    </div>
                  )}

                  {/* Notas */}
                  {ev.notas && (
                    <p className="text-xs text-slate-600 italic mt-1">{ev.notas}</p>
                  )}

                  {/* Firma */}
                  {ev.registrado_por && (
                    <p className="text-xs text-slate-400 mt-2">
                      Registrado por {ev.registrado_por.nombre} {ev.registrado_por.apellidos}
                      {' · '}<span className="capitalize">{ev.registrado_por.rol}</span>
                    </p>
                  )}
                </div>

                {/* Acciones: solo visibles para quien registró la
                    incidencia o un administrador */}
                {puedeEditar(ev) && (
                  <div className="flex gap-1 shrink-0">
                    <button onClick={() => abrirEditar(ev)}
                      className="p-1.5 text-slate-400 hover:text-primary-600 hover:bg-primary-50 rounded-lg transition-colors">
                      <Pencil className="w-3.5 h-3.5" />
                    </button>
                    <button onClick={() => eliminar(ev.id)}
                      className="p-1.5 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors">
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {modal && (
        <FormularioEvento
          ingresoId={ingresoId}
          eventoExistente={editando}
          onClose={cerrarModal}
          onGuardado={() => { cerrarModal(); fetchEventos() }}
        />
      )}
    </div>
  )
}


export { TabEventos }
