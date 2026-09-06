import { useEffect, useState } from 'react'
import { useParams, useNavigate, useSearchParams } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { hoyLocal, edad } from '../lib/fechas'
import { useAuth } from '../lib/AuthContext'
import type { Ingreso } from '../types'
import { ESTADO_INGRESO_LABEL as ESTADO_LABEL, ESTADO_INGRESO_COLOR as ESTADO_COLOR, nombreCompleto } from '../types'
import { ChevronLeft, User, FileText, ClipboardList, AlertTriangle, FileCheck, LogOut, Database, Lock, RotateCcw } from 'lucide-react'
import { TabDatos } from './ingreso/TabDatos'
import { TabInformeIngreso } from './ingreso/TabInformeIngreso'
import { TabInformeAlta } from './ingreso/TabInformeAlta'
import { TabItems } from './ingreso/TabItems'
import { TabEventos } from './ingreso/TabEventos'
import { TabCMBD } from './ingreso/TabCMBD'
import { TIPALT_LABEL } from '../lib/alta'

const TABS = [
  { id: 'datos', label: 'Datos', icon: User },
  { id: 'ingreso', label: 'Informe ingreso', icon: FileText },
  { id: 'alta', label: 'Informe alta', icon: FileCheck },
  { id: 'items', label: 'Ítems', icon: ClipboardList },
  { id: 'eventos', label: 'Incidencias', icon: AlertTriangle },
  { id: 'cmbd',      label: 'CMBD',      icon: Database },
]

export default function DetalleIngreso() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const [searchParams, setSearchParams] = useSearchParams()
  const { rol } = useAuth()
  const esMedico = rol === 'medico'
  const [tab, setTab] = useState(searchParams.get('tab') ?? 'datos')

  // El useState de arriba solo se ejecuta al primer montaje. Si se
  // navega de un ingreso a otro (p. ej. desde Informes o desde
  // Episodios del paciente) sin recargar la página completa, React
  // reutiliza el mismo componente y la pestaña se quedaría "pegada"
  // a la anterior, ignorando el nuevo ?tab= de la URL. Este efecto lo
  // corrige, resincronizando cuando cambia el ingreso mostrado.
  useEffect(() => {
    const tabUrl = searchParams.get('tab')
    if (tabUrl) setTab(tabUrl)
  }, [id])
  const [ingreso, setIngreso] = useState<Ingreso | null>(null)
  const [loading, setLoading] = useState(true)
  const [errorCarga, setErrorCarga] = useState('')
  const [modalAlta, setModalAlta] = useState(false)
  const [altaForm, setAltaForm] = useState({
    fecha_alta: hoyLocal(),
    circunstancia_alta: '1',
  })
  const [procesandoAlta, setProcesandoAlta] = useState(false)
  const [errorAlta, setErrorAlta] = useState('')
  const [confirmarReabrir, setConfirmarReabrir] = useState(false)
  const [procesandoReabrir, setProcesandoReabrir] = useState(false)
  const [errorReabrir, setErrorReabrir] = useState('')

  async function cargar() {
    if (!id) return
    setLoading(true)
    setErrorCarga('')
    const { data, error } = await supabase
      .from('ingresos')
      .select('*, paciente:pacientes(*), medico_responsable:profesionales(*), cmbd(circunstancia_alta)')
      .eq('id', id)
      .maybeSingle()
    if (error) {
      // Antes, un fallo real de carga (red, permisos...) se veía
      // exactamente igual que "este ingreso no existe" — algo muy
      // distinto y bastante más alarmante de lo que había pasado.
      setErrorCarga('No se pudo cargar el ingreso: ' + error.message)
      setLoading(false)
      return
    }
    setIngreso(data as Ingreso)
    setLoading(false)
  }

  useEffect(() => { cargar() }, [id])

  async function darAlta() {
    if (!id) return
    if (altaForm.fecha_alta < ingreso!.fecha_ingreso) {
      setErrorAlta('La fecha de alta no puede ser anterior a la de ingreso.')
      return
    }
    setProcesandoAlta(true)
    setErrorAlta('')
    // Una sola función transaccional: actualiza el estado del ingreso
    // y el motivo del CMBD a la vez — antes eran dos preguntas
    // separadas por el mismo dato, y el CMBD podía quedar con un
    // motivo vacío o incompatible con el estado real del ingreso.
    const { data, error } = await supabase.rpc('dar_de_alta', {
      p_ingreso_id: id,
      p_fecha_alta: altaForm.fecha_alta,
      p_circunstancia_alta: altaForm.circunstancia_alta,
    })
    setProcesandoAlta(false)
    if (error) {
      setErrorAlta('No se pudo registrar el alta: ' + error.message)
      return
    }
    setIngreso((prev) => (prev ? { ...prev, estado: data.estado, fecha_alta: data.fecha_alta } : prev))
    setModalAlta(false)
  }

  if (loading) return <div className="p-8 text-slate-400">Cargando…</div>
  if (errorCarga) {
    return (
      <div className="p-8">
        <div className="card p-6 max-w-md">
          <p className="font-semibold text-red-600">No se pudo cargar</p>
          <p className="text-sm text-slate-500 mt-1 mb-3">{errorCarga}</p>
          <button onClick={cargar} className="btn-secondary text-sm">Reintentar</button>
        </div>
      </div>
    )
  }
  if (!ingreso) return <div className="p-8 text-slate-400">Ingreso no encontrado</div>

  // Un episodio ya cerrado (alta, traslado o éxitus) pasa a ser solo lectura
  // para todo el mundo, médico incluido. Corregir algo después del cierre
  // requiere un mecanismo de rectificación explícito, no editar en caliente.
  const episodioCerrado = ingreso.estado !== 'activo'
  // Solo dentro de las primeras 24h desde el alta — se recalcula en
  // el propio cliente para decidir si mostrar el botón, aunque quien
  // de verdad hace cumplir el límite es la función del servidor.
  const dentroDeVentanaReapertura = !!ingreso.dado_de_alta_en &&
    (Date.now() - new Date(ingreso.dado_de_alta_en).getTime()) <= 24 * 60 * 60 * 1000

  async function reabrirEpisodio() {
    setProcesandoReabrir(true)
    setErrorReabrir('')
    const { error } = await supabase.rpc('reabrir_episodio', { p_ingreso_id: id })
    setProcesandoReabrir(false)
    if (error) {
      setErrorReabrir(error.message)
      return
    }
    setConfirmarReabrir(false)
    await cargar()
  }

  const p = ingreso.paciente!
  const nombreDelPaciente = nombreCompleto(p)
  const edadPaciente = edad(p.fecha_nacimiento)

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
              <h1 className="text-xl font-bold text-slate-800">{nombreDelPaciente}</h1>
              <div className="flex items-center gap-3 mt-0.5 text-xs text-slate-500 flex-wrap">
                {edadPaciente != null && <span>{edadPaciente} años</span>}
                {ingreso.habitacion && <span>· Hab. {ingreso.habitacion}</span>}
                {ingreso.medico_responsable && (
                  <span>
                    · {ingreso.medico_responsable.nombre} {ingreso.medico_responsable.apellidos}
                  </span>
                )}
                {episodioCerrado ? (
                  <span>
                    Ingreso: {new Date(ingreso.fecha_ingreso).toLocaleDateString('es-ES')}
                    {ingreso.fecha_alta && ` · Alta: ${new Date(ingreso.fecha_alta).toLocaleDateString('es-ES')}`}
                    {(() => {
                      const circunstancia = (ingreso as any).cmbd?.[0]?.circunstancia_alta
                      return circunstancia ? ` · ${TIPALT_LABEL[circunstancia] ?? circunstancia}` : ''
                    })()}
                  </span>
                ) : (
                  <span>· {new Date(ingreso.fecha_ingreso).toLocaleDateString('es-ES')}</span>
                )}
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
          {/* Mismo permiso que dar de alta — el mismo médico que
              puede cerrar un episodio puede deshacerlo si fue un
              error, pero solo dentro de las 24h siguientes: pasado
              ese margen, ya no es "un despiste recién cometido". */}
          {ingreso.estado !== 'activo' && esMedico && dentroDeVentanaReapertura && (
            <button
              onClick={() => setConfirmarReabrir(true)}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-amber-300 bg-amber-50 hover:bg-amber-100 text-amber-700 text-xs font-medium transition-colors shrink-0"
            >
              <RotateCcw className="w-3.5 h-3.5" />
              Reabrir episodio
            </button>
          )}
        </div>

        {/* Confirmación de reapertura */}
        {confirmarReabrir && (
          <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4" onClick={() => setConfirmarReabrir(false)}>
            <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm p-6" onClick={(e) => e.stopPropagation()}>
              <h2 className="text-base font-bold text-slate-800 mb-2">Reabrir episodio</h2>
              <p className="text-sm text-slate-500 mb-4">
                El episodio volverá a estar activo, y se borrará la fecha y el motivo del alta. Quedará registrado en Auditoría.
              </p>
              {errorReabrir && (
                <p className="mb-4 text-sm text-red-600 bg-red-50 border border-red-100 rounded-lg px-3 py-2">{errorReabrir}</p>
              )}
              <div className="flex gap-3">
                <button onClick={() => setConfirmarReabrir(false)} className="btn-secondary flex-1">Cancelar</button>
                <button onClick={reabrirEpisodio} disabled={procesandoReabrir} className="btn-primary flex-1">
                  <RotateCcw className="w-4 h-4" />
                  {procesandoReabrir ? 'Reabriendo…' : 'Confirmar'}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Tabs */}
        <div className="flex gap-1 mt-4 -mb-4">
          {TABS.map(({ id: tid, label, icon: Icon }) => (
            <button
              key={tid}
              onClick={() => {
                setTab(tid)
                // replace: true — cambiar de pestaña no debería llenar
                // el historial del navegador con una entrada por cada
                // clic, solo dejar que recargar o compartir el enlace
                // abra la pestaña correcta.
                setSearchParams((prev) => {
                  const next = new URLSearchParams(prev)
                  next.set('tab', tid)
                  return next
                }, { replace: true })
              }}
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
                  min={ingreso.fecha_ingreso}
                  value={altaForm.fecha_alta}
                  onChange={(e) => setAltaForm((f) => ({ ...f, fecha_alta: e.target.value }))}
                />
              </div>
              <div>
                <label className="label">Motivo del alta *</label>
                <select
                  className="input"
                  value={altaForm.circunstancia_alta}
                  onChange={(e) => setAltaForm((f) => ({ ...f, circunstancia_alta: e.target.value }))}
                >
                  {Object.entries(TIPALT_LABEL).map(([codigo, etiqueta]) => (
                    <option key={codigo} value={codigo}>{etiqueta}</option>
                  ))}
                </select>
              </div>
            </div>
            {errorAlta && (
              <p className="mt-4 text-sm text-red-600 bg-red-50 border border-red-100 rounded-lg px-3 py-2">
                {errorAlta}
              </p>
            )}
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
        {/* Episodio cerrado: Datos e Ítems pasan a solo lectura para
            todos — corregir algo ahí requiere un mecanismo explícito,
            no editar en caliente. Informe de ingreso (solo médicos,
            porque el informe de alta se apoya en sus antecedentes y
            puede necesitar corregirse), Informe de alta, CMBD (solo
            médicos) e Incidencias (cualquier asistencial) se quedan
            editables tras el cierre — cada uno gestiona su propio
            aviso de solo lectura si corresponde por rol. */}
        {episodioCerrado && ['datos', 'items'].includes(tab) && (
          <div className="mb-4 flex items-center gap-2 text-sm text-slate-600 bg-slate-100 border border-slate-200 rounded-lg px-3 py-2">
            <Lock className="w-4 h-4 shrink-0" />
            Episodio cerrado ({ESTADO_LABEL[ingreso.estado] ?? ingreso.estado}): solo lectura, ya no se puede editar.
          </div>
        )}
        {/* Aviso de solo lectura por rol (independiente de si el episodio
            sigue activo o ya está cerrado: siempre es cosa del médico) */}
        {!esMedico && ['datos', 'ingreso', 'alta', 'cmbd'].includes(tab) && (
          <div className="mb-4 flex items-center gap-2 text-sm text-amber-700 bg-amber-50 border border-amber-100 rounded-lg px-3 py-2">
            <Lock className="w-4 h-4 shrink-0" />
            Solo lectura: tu rol puede consultar esta sección, pero solo un médico puede editarla.
          </div>
        )}
        {/* fieldset disabled desactiva de golpe todos los campos de dentro */}
        <fieldset
          disabled={
            (episodioCerrado && ['datos', 'items'].includes(tab)) ||
            (!esMedico && ['datos', 'ingreso', 'alta', 'cmbd'].includes(tab))
          }
          className="min-w-0 border-0 p-0 m-0"
        >
          {tab === 'datos' && (
            <TabDatos
              ingreso={ingreso}
              onUpdate={setIngreso}
              iniciarEditando={searchParams.get('editar') === 'habitacion'}
            />
          )}
          {tab === 'ingreso' && id && <TabInformeIngreso ingresoId={id} ingreso={ingreso} />}
          {tab === 'alta' && id && <TabInformeAlta ingresoId={id} ingreso={ingreso} />}
          {tab === 'items' && id && (
            <TabItems
              ingresoId={id}
              key={id}
              pacienteInfo={p ? { nombre: nombreDelPaciente, habitacion: ingreso.habitacion } : undefined}
            />
          )}
          {tab === 'eventos' && id && (
            <TabEventos
              ingresoId={id}
              pacienteInfo={p ? { nombre: nombreDelPaciente, habitacion: ingreso.habitacion } : undefined}
            />
          )}
          {tab === 'cmbd' && id && <TabCMBD ingresoId={id} ingreso={ingreso} />}
        </fieldset>
      </div>
    </div>
  )
}
