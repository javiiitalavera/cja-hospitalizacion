import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../../lib/supabase'
import { CAMPOS_POR_TIPO, type TipoEvento } from '../../types/eventos'

function TabHistorial({ pacienteId, ingresoActualId }: { pacienteId: string; ingresoActualId: string }) {
  const navigate = useNavigate()
  // biome-ignore lint/suspicious/noExplicitAny: Supabase untyped data
  const [ingresos, setIngresos] = useState<any[]>([])
  // biome-ignore lint/suspicious/noExplicitAny: Supabase untyped data
  const [eventos, setEventos] = useState<any[]>([])
  const [loading, setLoading] = useState(true)

  const ESTADO_LABEL: Record<string, string> = {
    activo: 'Ingresado',
    alta: 'Alta',
    alta_traslado: 'Traslado',
    exitus: 'Éxitus',
  }
  const ESTADO_COLOR: Record<string, string> = {
    activo: 'bg-emerald-100 text-emerald-700',
    alta: 'bg-slate-100 text-slate-500',
    alta_traslado: 'bg-blue-100 text-blue-600',
    exitus: 'bg-red-100 text-red-600',
  }
  const TIPO_LABEL: Record<string, string> = {
    caida: 'Caída',
    ulcera: 'Úlcera',
    error_medicacion: 'Error medicación',
    efecto_adverso_medicacion: 'Efecto adverso',
    infeccion_nosocomial: 'Infección nosocomial',
    contencion_fisica: 'Contención física',
    agresividad_fisica: 'Agresividad física',
    fuga: 'Fuga',
  }
  const TIPO_COLOR: Record<string, string> = {
    caida: 'bg-orange-100 text-orange-700',
    ulcera: 'bg-red-100 text-red-700',
    error_medicacion: 'bg-purple-100 text-purple-700',
    efecto_adverso_medicacion: 'bg-pink-100 text-pink-700',
    infeccion_nosocomial: 'bg-yellow-100 text-yellow-700',
    contencion_fisica: 'bg-blue-100 text-blue-700',
    agresividad_fisica: 'bg-rose-100 text-rose-700',
    fuga: 'bg-slate-100 text-slate-700',
  }

  useEffect(() => {
    async function fetch() {
      // All ingresos of this patient
      const { data: ingresosData } = await supabase
        .from('ingresos')
        .select('*, medico_responsable:profesionales(nombre,apellidos), motivo_ingreso')
        .eq('paciente_id', pacienteId)
        .order('fecha_ingreso', { ascending: false })

      const list = ingresosData ?? []
      setIngresos(list)

      // All events across all ingresos
      // biome-ignore lint/suspicious/noExplicitAny: Supabase untyped data
      const ids = list.map((i: any) => i.id)
      if (ids.length > 0) {
        const { data: eventosData } = await supabase
          .from('eventos')
          .select('*, registrado_por:profesionales(nombre,apellidos)')
          .in('ingreso_id', ids)
          .order('fecha', { ascending: false })
        setEventos(eventosData ?? [])
      }
      setLoading(false)
    }
    fetch()
  }, [pacienteId])

  if (loading) return <div className="text-slate-400 text-sm py-8 text-center">Cargando…</div>

  const ingresosAnteriores = ingresos.filter((i) => i.id !== ingresoActualId)

  return (
    <div className="max-w-3xl space-y-6">
      {/* Ingresos anteriores */}
      <div className="card overflow-hidden">
        <div className="px-5 py-4 border-b bg-slate-50">
          <p className="section-title mb-0">Ingresos anteriores</p>
        </div>
        {ingresosAnteriores.length === 0 ? (
          <div className="px-5 py-8 text-sm text-slate-400 text-center">No hay ingresos anteriores registrados.</div>
        ) : (
          <div className="divide-y">
            {ingresosAnteriores.map((ing) => {
              const dias =
                ing.fecha_alta && ing.fecha_ingreso
                  ? Math.round((new Date(ing.fecha_alta).getTime() - new Date(ing.fecha_ingreso).getTime()) / 86400000)
                  : null
              return (
                <div
                  key={ing.id}
                  className="px-5 py-4 flex items-center justify-between hover:bg-slate-50 cursor-pointer transition-colors"
                  onClick={() => navigate(`/ingresos/${ing.id}`)}
                  onKeyDown={(e) => e.key === 'Enter' && navigate(`/ingresos/${ing.id}`)}
                >
                  <div>
                    <div className="flex items-center gap-2 mb-1">
                      <span
                        className={`px-2 py-0.5 rounded-full text-xs font-medium ${ESTADO_COLOR[ing.estado] ?? 'bg-slate-100 text-slate-500'}`}
                      >
                        {ESTADO_LABEL[ing.estado] ?? ing.estado}
                      </span>
                      {ing.habitacion && <span className="text-xs text-slate-400">Hab. {ing.habitacion}</span>}
                      {dias != null && <span className="text-xs text-slate-400">{dias} días</span>}
                    </div>
                    <p className="text-sm text-slate-600">
                      {new Date(ing.fecha_ingreso).toLocaleDateString('es-ES')}
                      {ing.fecha_alta && ` → ${new Date(ing.fecha_alta).toLocaleDateString('es-ES')}`}
                    </p>
                    {ing.motivo_ingreso && (
                      <p className="text-xs text-slate-500 mt-0.5 italic">{ing.motivo_ingreso}</p>
                    )}
                    {ing.medico_responsable && (
                      <p className="text-xs text-slate-400 mt-0.5">{ing.medico_responsable.nombre} {ing.medico_responsable.apellidos}</p>
                    )}
                  </div>
                  <span className="text-primary-600 text-xs font-medium">Ver →</span>
                </div>
              )
            })}
          </div>
        )}
      </div>

      {/* Historial de eventos completo */}
      <div className="card overflow-hidden">
        <div className="px-5 py-4 border-b bg-slate-50 flex items-center justify-between">
          <p className="section-title mb-0">Todas las incidencias ({eventos.length})</p>
        </div>
        {eventos.length === 0 ? (
          <div className="px-5 py-8 text-sm text-slate-400 text-center">No hay incidencias registradas.</div>
        ) : (
          <div className="divide-y">
            {eventos.map((ev) => {
              // Find which ingreso this event belongs to
              const ingreso = ingresos.find((i) => i.id === ev.ingreso_id)
              const esActual = ev.ingreso_id === ingresoActualId
              return (
                <div key={ev.id} className="px-5 py-3">
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex-1">
                      <div className="flex items-center gap-2 flex-wrap mb-1">
                        <span
                          className={`px-2 py-0.5 rounded-full text-xs font-semibold ${TIPO_COLOR[ev.tipo] ?? 'bg-slate-100 text-slate-600'}`}
                        >
                          {TIPO_LABEL[ev.tipo] ?? ev.tipo}
                        </span>
                        {esActual ? (
                          <span className="text-xs text-primary-500 font-medium">Ingreso actual</span>
                        ) : (
                          <span className="text-xs text-slate-400">
                            Ingreso {ingreso ? new Date(ingreso.fecha_ingreso).toLocaleDateString('es-ES') : '—'}
                          </span>
                        )}
                      </div>
                      {Object.entries(ev.datos ?? {}).length > 0 && (
                        <div className="flex flex-wrap gap-x-3 gap-y-0.5">
                            {Object.entries(ev.datos).map(([k, v]: any) => {
                              const campo = CAMPOS_POR_TIPO[ev.tipo as TipoEvento]?.find(c => c.key === k)
                              return (
                                <span key={k} className="text-xs text-slate-500">
                                  <span className="capitalize">{campo?.label ?? k.replace(/_/g, ' ')}: </span>
                                  <span className="font-medium text-slate-700">{v}</span>
                                </span>
                              )
                            })}
                        </div>
                      )}
                      {ev.notas && <p className="text-xs text-slate-500 italic mt-0.5">{ev.notas}</p>}
                      {ev.registrado_por && (
                        <p className="text-xs text-slate-400 mt-0.5">
                          {ev.registrado_por.nombre} {ev.registrado_por.apellidos}
                        </p>
                      )}
                    </div>
                    <div className="text-right shrink-0">
                      <p className="text-xs font-medium text-slate-600">
                        {new Date(ev.fecha).toLocaleDateString('es-ES')}
                      </p>
                      {ev.hora && <p className="text-xs text-slate-400">{ev.hora.slice(0, 5)}</p>}
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}

export { TabHistorial }
