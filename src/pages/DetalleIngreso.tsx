import { useEffect, useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useAuth } from '../lib/AuthContext'
import type { Ingreso } from '../types'
import { ChevronLeft, User, FileText, ClipboardList, AlertTriangle, FileCheck, History, LogOut, Database, Lock } from 'lucide-react'
import { TabDatos } from './ingreso/TabDatos'
import { TabInformeIngreso } from './ingreso/TabInformeIngreso'
import { TabInformeAlta } from './ingreso/TabInformeAlta'
import { TabItems } from './ingreso/TabItems'
import { TabEventos } from './ingreso/TabEventos'
import { TabHistorial } from './ingreso/TabHistorial'
import { TabCMBD } from './ingreso/TabCMBD'

const TABS = [
  { id: 'datos', label: 'Datos', icon: User },
  { id: 'ingreso', label: 'Informe ingreso', icon: FileText },
  { id: 'alta', label: 'Informe alta', icon: FileCheck },
  { id: 'items', label: 'Ítems', icon: ClipboardList },
  { id: 'eventos', label: 'Incidencias', icon: AlertTriangle },
  { id: 'historial', label: 'Historial', icon: History },
  { id: 'cmbd',      label: 'CMBD',      icon: Database },
]

const ESTADO_COLOR: Record<string, string> = {
  activo: 'bg-emerald-100 text-emerald-700',
  alta: 'bg-slate-100 text-slate-500',
  alta_traslado: 'bg-blue-100 text-blue-600',
  exitus: 'bg-red-100 text-red-600',
}
const ESTADO_LABEL: Record<string, string> = {
  activo: 'Ingresado',
  alta: 'Alta',
  alta_traslado: 'Traslado',
  exitus: 'Éxitus',
}

export default function DetalleIngreso() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const { rol } = useAuth()
  const esMedico = rol === 'medico'
  const [tab, setTab] = useState('datos')
  const [ingreso, setIngreso] = useState<Ingreso | null>(null)
  const [loading, setLoading] = useState(true)
  const [modalAlta, setModalAlta] = useState(false)
  const [altaForm, setAltaForm] = useState({
    fecha_alta: new Date().toISOString().split('T')[0],
    estado: 'alta',
  })
  const [procesandoAlta, setProcesandoAlta] = useState(false)

  useEffect(() => {
    if (!id) return
    supabase
      .from('ingresos')
      .select('*, paciente:pacientes(*), medico_responsable:profesionales(*)')
      .eq('id', id)
      .single()
      .then(({ data }) => {
        setIngreso(data as Ingreso)
        setLoading(false)
      })
  }, [id])

  async function darAlta() {
    if (!id) return
    setProcesandoAlta(true)
    await supabase
      .from('ingresos')
      .update({
        estado: altaForm.estado,
        fecha_alta: altaForm.fecha_alta,
      })
      .eq('id', id)
    setIngreso((prev) => (prev ? { ...prev, estado: altaForm.estado as any, fecha_alta: altaForm.fecha_alta } : prev))
    setModalAlta(false)
    setProcesandoAlta(false)
  }

  if (loading) return <div className="p-8 text-slate-400">Cargando…</div>
  if (!ingreso) return <div className="p-8 text-slate-400">Ingreso no encontrado</div>

  const p = ingreso.paciente!
  const nombreCompleto = `${p.primer_apellido}${p.segundo_apellido ? ' ' + p.segundo_apellido : ''}, ${p.nombre}`
  const edad = p.fecha_nacimiento
    ? Math.floor((Date.now() - new Date(p.fecha_nacimiento).getTime()) / 31557600000)
    : null

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
                {edad != null && <span>{edad} años</span>}
                {ingreso.habitacion && <span>· Hab. {ingreso.habitacion}</span>}
                {ingreso.medico_responsable && (
                  <span>
                    · {ingreso.medico_responsable.nombre} {ingreso.medico_responsable.apellidos}
                  </span>
                )}
                <span>· {new Date(ingreso.fecha_ingreso).toLocaleDateString('es-ES')}</span>
                <span
                  className={`px-2 py-0.5 rounded-full font-medium ${ESTADO_COLOR[ingreso.estado] ?? 'bg-slate-100'}`}
                >
                  {ESTADO_LABEL[ingreso.estado] ?? ingreso.estado}
                </span>
              </div>
            </div>
          </div>
          {ingreso.estado === 'activo' && esMedico && (
            <button
              onClick={() => setModalAlta(true)}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-700 hover:bg-slate-800 text-white text-xs font-medium transition-colors shrink-0"
            >
              <LogOut className="w-3.5 h-3.5" />
              Dar de alta
            </button>
          )}
        </div>

        {/* Tabs */}
        <div className="flex gap-1 mt-4 -mb-4">
          {TABS.map(({ id: tid, label, icon: Icon }) => (
            <button
              key={tid}
              onClick={() => setTab(tid)}
              className={`flex items-center gap-1.5 px-4 py-2.5 text-sm font-medium border-b-2 transition-colors ${
                tab === tid
                  ? 'border-primary-600 text-primary-700'
                  : 'border-transparent text-slate-500 hover:text-slate-700'
              }`}
            >
              <Icon className="w-3.5 h-3.5" />
              {label}
            </button>
          ))}
        </div>
      </div>

      {/* Modal alta */}
      {modalAlta && (
        <div
          className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4"
          onClick={() => setModalAlta(false)}
        >
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm p-6" onClick={(e) => e.stopPropagation()}>
            <h2 className="text-base font-bold text-slate-800 mb-4">Dar de alta</h2>
            <div className="space-y-4">
              <div>
                <label className="label">Fecha de alta *</label>
                <input
                  type="date"
                  className="input"
                  value={altaForm.fecha_alta}
                  onChange={(e) => setAltaForm((f) => ({ ...f, fecha_alta: e.target.value }))}
                />
              </div>
              <div>
                <label className="label">Motivo del alta *</label>
                <select
                  className="input"
                  value={altaForm.estado}
                  onChange={(e) => setAltaForm((f) => ({ ...f, estado: e.target.value }))}
                >
                  <option value="alta">Alta domiciliaria</option>
                  <option value="alta_traslado">Traslado a otro centro</option>
                  <option value="exitus">Éxitus</option>
                </select>
              </div>
            </div>
            <div className="flex gap-3 mt-6">
              <button onClick={() => setModalAlta(false)} className="btn-secondary flex-1">
                Cancelar
              </button>
              <button onClick={darAlta} disabled={procesandoAlta} className="btn-primary flex-1">
                <LogOut className="w-4 h-4" />
                {procesandoAlta ? 'Procesando…' : 'Confirmar alta'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Tab content */}
      <div className="flex-1 overflow-y-auto p-8">
        {/* Aviso de solo lectura en las pestañas médicas para roles sin permiso */}
        {!esMedico && ['datos', 'ingreso', 'alta', 'cmbd'].includes(tab) && (
          <div className="mb-4 flex items-center gap-2 text-sm text-amber-700 bg-amber-50 border border-amber-100 rounded-lg px-3 py-2">
            <Lock className="w-4 h-4 shrink-0" />
            Solo lectura: tu rol puede consultar esta sección, pero solo un médico puede editarla.
          </div>
        )}
        {/* fieldset disabled desactiva de golpe todos los campos de dentro */}
        <fieldset
          disabled={!esMedico && ['datos', 'ingreso', 'alta', 'cmbd'].includes(tab)}
          className="min-w-0 border-0 p-0 m-0"
        >
          {tab === 'datos' && <TabDatos ingreso={ingreso} onUpdate={setIngreso} />}
          {tab === 'ingreso' && id && <TabInformeIngreso ingresoId={id} ingreso={ingreso} />}
          {tab === 'alta' && id && <TabInformeAlta ingresoId={id} ingreso={ingreso} />}
          {tab === 'items' && id && <TabItems ingresoId={id} />}
          {tab === 'eventos' && id && <TabEventos ingresoId={id} />}
          {tab === 'historial' && ingreso?.paciente_id && (
            <TabHistorial pacienteId={ingreso.paciente_id} ingresoActualId={id ?? ''} />
          )}
          {tab === 'cmbd' && id && <TabCMBD ingresoId={id} ingreso={ingreso} />}
        </fieldset>
      </div>
    </div>
  )
}
