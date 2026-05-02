import { useEffect, useState } from 'react'
import { useParams, useNavigate, Link } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { ChevronLeft, Plus, FileText, ClipboardList, AlertTriangle, History } from 'lucide-react'

interface Ingreso {
  id: string
  estado: string
  fecha_ingreso: string
  fecha_alta?: string
  habitacion?: number
  motivo_ingreso?: string
  medico_responsable?: { nombre: string; apellidos: string }
  _evento_count?: number
}

interface Paciente {
  id: string
  nombre: string
  primer_apellido: string
  segundo_apellido?: string
  fecha_nacimiento?: string
  sexo?: string
  cipna?: string
  nhc?: string
  dni?: string
  municipio?: string
  medico_cabecera?: string
  contacto_familiar_nombre?: string
  contacto_familiar_telefono?: string
}

const ESTADO_LABEL: Record<string, string> = {
  activo: 'Ingresado', alta: 'Alta', alta_traslado: 'Traslado', exitus: 'Éxitus',
}
const ESTADO_COLOR: Record<string, string> = {
  activo: 'bg-emerald-100 text-emerald-700',
  alta: 'bg-slate-100 text-slate-500',
  alta_traslado: 'bg-blue-100 text-blue-600',
  exitus: 'bg-red-100 text-red-600',
}
const TIPO_LABEL: Record<string, string> = {
  caida: 'Caída', ulcera: 'Úlcera', error_medicacion: 'Error medicación',
  efecto_adverso_medicacion: 'Efecto adverso', infeccion_nosocomial: 'Infección nosocomial',
  contencion_fisica: 'Contención física', agresividad_fisica: 'Agresividad física', fuga: 'Fuga',
}
const TIPO_COLOR: Record<string, string> = {
  caida: 'bg-orange-100 text-orange-700', ulcera: 'bg-red-100 text-red-700',
  error_medicacion: 'bg-purple-100 text-purple-700', efecto_adverso_medicacion: 'bg-pink-100 text-pink-700',
  infeccion_nosocomial: 'bg-yellow-100 text-yellow-700', contencion_fisica: 'bg-blue-100 text-blue-700',
  agresividad_fisica: 'bg-rose-100 text-rose-700', fuga: 'bg-slate-100 text-slate-700',
}

function edad(fnac?: string) {
  if (!fnac) return null
  return Math.floor((Date.now() - new Date(fnac).getTime()) / 31557600000)
}

function diasEstancia(fi: string, fa?: string) {
  const hasta = fa ? new Date(fa) : new Date()
  return Math.round((hasta.getTime() - new Date(fi).getTime()) / 86400000)
}

export default function DetallePaciente() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const [paciente, setPaciente] = useState<Paciente | null>(null)
  const [ingresos, setIngresos] = useState<Ingreso[]>([])
  const [eventos, setEventos] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [tab, setTab] = useState<'ingresos' | 'eventos' | 'datos'>('ingresos')

  useEffect(() => {
    if (!id) return
    async function fetch() {
      const { data: p } = await supabase.from('pacientes').select('*').eq('id', id).single()
      setPaciente(p)

      const { data: ings } = await supabase
        .from('ingresos')
        .select('*, medico_responsable:profesionales(nombre,apellidos)')
        .eq('paciente_id', id)
        .order('fecha_ingreso', { ascending: false })

      const ingList = ings ?? []
      setIngresos(ingList as Ingreso[])

      // Fetch events for all ingresos
      const ingIds = ingList.map((i: any) => i.id)
      if (ingIds.length > 0) {
        const { data: evs } = await supabase
          .from('eventos')
          .select('*, registrado_por:profesionales(nombre,apellidos)')
          .in('ingreso_id', ingIds)
          .order('fecha', { ascending: false })
        setEventos(evs ?? [])
      }
      setLoading(false)
    }
    fetch()
  }, [id])

  if (loading) return <div className="p-8 text-slate-400">Cargando…</div>
  if (!paciente) return <div className="p-8 text-slate-400">Paciente no encontrado</div>

  const nombreCompleto = `${paciente.primer_apellido} ${paciente.segundo_apellido ?? ''}, ${paciente.nombre}`.trim()
  const e = edad(paciente.fecha_nacimiento)
  const ingresoActivo = ingresos.find(i => i.estado === 'activo')

  const TABS = [
    { id: 'ingresos', label: `Episodios (${ingresos.length})`, icon: History },
    { id: 'eventos', label: `Eventos (${eventos.length})`, icon: AlertTriangle },
    { id: 'datos', label: 'Datos personales', icon: FileText },
  ]

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="border-b bg-white px-8 py-4">
        <div className="flex items-start justify-between">
          <div className="flex items-center gap-3">
            <button onClick={() => navigate(-1)} className="text-slate-400 hover:text-slate-600 mt-1">
              <ChevronLeft className="w-5 h-5" />
            </button>
            <div>
              <h1 className="text-xl font-bold text-slate-800">{nombreCompleto}</h1>
              <div className="flex items-center gap-3 mt-0.5 text-xs text-slate-500 flex-wrap">
                {e != null && <span>{e} años</span>}
                {paciente.fecha_nacimiento && (
                  <span>· {new Date(paciente.fecha_nacimiento).toLocaleDateString('es-ES')}</span>
                )}
                {paciente.nhc && <span>· NHC: {paciente.nhc}</span>}
                {paciente.cipna && <span>· CIPNA: {paciente.cipna}</span>}
                {ingresoActivo ? (
                  <span className="px-2 py-0.5 rounded-full font-medium bg-emerald-100 text-emerald-700">
                    Ingresado · Hab. {ingresoActivo.habitacion ?? '—'}
                  </span>
                ) : (
                  <span className="px-2 py-0.5 rounded-full font-medium bg-slate-100 text-slate-500">
                    No ingresado
                  </span>
                )}
              </div>
            </div>
          </div>
          <Link to="/pacientes/nuevo" className="btn-primary text-xs">
            <Plus className="w-3.5 h-3.5" /> Nuevo ingreso
          </Link>
        </div>

        {/* Tabs */}
        <div className="flex gap-1 mt-4 -mb-4">
          {TABS.map(({ id: tid, label, icon: Icon }) => (
            <button key={tid} onClick={() => setTab(tid as any)}
              className={`flex items-center gap-1.5 px-4 py-2.5 text-sm font-medium border-b-2 transition-colors ${
                tab === tid
                  ? 'border-primary-600 text-primary-700'
                  : 'border-transparent text-slate-500 hover:text-slate-700'
              }`}>
              <Icon className="w-3.5 h-3.5" />
              {label}
            </button>
          ))}
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto p-8">
        {/* EPISODIOS */}
        {tab === 'ingresos' && (
          <div className="max-w-3xl space-y-3">
            {ingresos.length === 0 ? (
              <div className="card p-10 text-center text-slate-400 text-sm">Sin ingresos registrados.</div>
            ) : ingresos.map((ing, idx) => {
              const dias = diasEstancia(ing.fecha_ingreso, ing.fecha_alta)
              const evCount = eventos.filter(ev => ev.ingreso_id === ing.id).length
              const esActual = ing.estado === 'activo'
              return (
                <div key={ing.id}
                  className={`card p-5 cursor-pointer hover:shadow-md transition-shadow ${esActual ? 'border-primary-200 bg-primary-50/30' : ''}`}
                  onClick={() => navigate(`/ingresos/${ing.id}`)}>
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex-1">
                      <div className="flex items-center gap-2 flex-wrap mb-2">
                        <span className={`px-2 py-0.5 rounded-full text-xs font-semibold ${ESTADO_COLOR[ing.estado] ?? 'bg-slate-100'}`}>
                          {ESTADO_LABEL[ing.estado] ?? ing.estado}
                        </span>
                        {idx === 0 && ingresos.length > 1 && (
                          <span className="text-xs text-slate-400">Más reciente</span>
                        )}
                        {ing.habitacion && (
                          <span className="text-xs text-slate-400">Hab. {ing.habitacion}</span>
                        )}
                      </div>
                      <div className="grid grid-cols-2 gap-x-8 gap-y-1 text-xs text-slate-600">
                        <div>
                          <span className="text-slate-400">Ingreso: </span>
                          {new Date(ing.fecha_ingreso).toLocaleDateString('es-ES')}
                        </div>
                        <div>
                          <span className="text-slate-400">Alta: </span>
                          {ing.fecha_alta ? new Date(ing.fecha_alta).toLocaleDateString('es-ES') : '—'}
                        </div>
                        <div>
                          <span className="text-slate-400">Duración: </span>
                          {dias} días
                        </div>
                        <div>
                          <span className="text-slate-400">Médico: </span>
                          {ing.medico_responsable?.nombre ?? '—'}
                        </div>
                      </div>
                      {ing.motivo_ingreso && (
                        <p className="text-xs text-slate-400 mt-2 truncate">{ing.motivo_ingreso}</p>
                      )}
                    </div>
                    <div className="text-right shrink-0">
                      <div className="flex gap-3 text-xs text-slate-400 justify-end mb-2">
                        {evCount > 0 && (
                          <span className="flex items-center gap-1">
                            <AlertTriangle className="w-3 h-3" />{evCount} eventos
                          </span>
                        )}
                        <span className="flex items-center gap-1">
                          <FileText className="w-3 h-3" />Informes
                        </span>
                        <span className="flex items-center gap-1">
                          <ClipboardList className="w-3 h-3" />Ítems
                        </span>
                      </div>
                      <span className="text-primary-600 text-xs font-medium">Abrir episodio →</span>
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
        )}

        {/* EVENTOS */}
        {tab === 'eventos' && (
          <div className="max-w-3xl space-y-2">
            {eventos.length === 0 ? (
              <div className="card p-10 text-center text-slate-400 text-sm">Sin eventos registrados.</div>
            ) : eventos.map(ev => {
              const ing = ingresos.find(i => i.id === ev.ingreso_id)
              return (
                <div key={ev.id} className="card p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex-1">
                      <div className="flex items-center gap-2 flex-wrap mb-1">
                        <span className={`px-2 py-0.5 rounded-full text-xs font-semibold ${TIPO_COLOR[ev.tipo] ?? 'bg-slate-100'}`}>
                          {TIPO_LABEL[ev.tipo] ?? ev.tipo}
                        </span>
                        {ing && (
                          <span className="text-xs text-slate-400 cursor-pointer hover:text-primary-600"
                            onClick={() => navigate(`/ingresos/${ing.id}`)}>
                            Ingreso {new Date(ing.fecha_ingreso).toLocaleDateString('es-ES')} →
                          </span>
                        )}
                      </div>
                      {Object.entries(ev.datos ?? {}).length > 0 && (
                        <div className="flex flex-wrap gap-x-3 gap-y-0.5 mb-1">
                          {Object.entries(ev.datos).map(([k, v]: any) => (
                            <span key={k} className="text-xs text-slate-500">
                              <span className="capitalize">{k.replace(/_/g, ' ')}: </span>
                              <span className="font-medium text-slate-700">{v}</span>
                            </span>
                          ))}
                        </div>
                      )}
                      {ev.notas && <p className="text-xs text-slate-500 italic">{ev.notas}</p>}
                      {ev.registrado_por && (
                        <p className="text-xs text-slate-400 mt-1">
                          {ev.registrado_por.nombre} {ev.registrado_por.apellidos}
                        </p>
                      )}
                    </div>
                    <div className="text-right shrink-0 text-xs text-slate-500">
                      {new Date(ev.fecha).toLocaleDateString('es-ES')}
                      {ev.hora && <div className="text-slate-400">{ev.hora.slice(0, 5)}</div>}
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
        )}

        {/* DATOS PERSONALES */}
        {tab === 'datos' && (
          <div className="max-w-xl">
            <div className="card overflow-hidden">
              {[
                ['CIPNA', paciente.cipna],
                ['NHC', paciente.nhc],
                ['DNI', paciente.dni],
                ['Fecha de nacimiento', paciente.fecha_nacimiento ? new Date(paciente.fecha_nacimiento).toLocaleDateString('es-ES') : null],
                ['Sexo', paciente.sexo],
                ['Municipio', paciente.municipio],
                ['Médico de cabecera', paciente.medico_cabecera],
                ['Contacto familiar', paciente.contacto_familiar_nombre],
                ['Teléfono familiar', paciente.contacto_familiar_telefono],
              ].map(([k, v]) => (
                <div key={k} className="flex px-5 py-3 text-sm border-b last:border-0">
                  <span className="w-44 text-slate-400 shrink-0">{k}</span>
                  <span className="text-slate-800">{v || <span className="text-slate-300">—</span>}</span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
