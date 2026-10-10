import { useEffect, useState } from 'react'
import { Cargando } from '../components/Cargando'
import { useParams, useNavigate, useSearchParams } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { hoyLocal, edad } from '../lib/fechas'
import { useAuth } from '../lib/AuthContext'
import type { Ingreso } from '../types'
import { ESTADO_INGRESO_LABEL as ESTADO_LABEL, ESTADO_INGRESO_COLOR as ESTADO_COLOR, nombreCompleto } from '../types'
import { ChevronLeft, User, FileText, ClipboardList, Activity, LogOut, Database, Lock, RotateCcw, Construction } from 'lucide-react'
import { TabDatos } from './ingreso/TabDatos'
import { TabInformeIngreso } from './ingreso/TabInformeIngreso'
import { TabInformeAlta } from './ingreso/TabInformeAlta'
import { TabItems } from './ingreso/TabItems'
import { TabEventos } from './ingreso/TabEventos'
import { TabCMBD } from './ingreso/TabCMBD'
import { TabCuras } from './ingreso/TabCuras'
import { TabPautaCuidados } from './ingreso/TabPautaCuidados'
import { TabOtrosInformes } from './ingreso/TabOtrosInformes'
import { TabInformeEnfermeria } from './ingreso/TabInformeEnfermeria'
import { NavegadorPacientes } from './ingreso/NavegadorPacientes'
import { BadgeHabitacion } from './ingreso/BadgeHabitacion'
import { TIPALT_LABEL } from '../lib/alta'
import { registrarAcceso } from '../lib/accesos'

// Estructura de la ficha: pestañas principales y, dentro de algunas,
// subpestañas. Cada contenido tiene un identificador de "sección"
// (datos, ingreso, alta, curas, items, incidencias, cmbd) que es el que
// usan los permisos y el aviso de solo lectura más abajo.
type Seccion = 'datos' | 'ingreso' | 'alta' | 'enfermeria' | 'otros' | 'curas' | 'items' | 'cuidados' | 'incidencias' | 'cmbd'

type Sub = { id: string; label: string; seccion: Seccion; enConstruccion?: boolean }
type Tab = {
  id: string
  label: string
  icon: typeof User
  seccion?: Seccion            // pestañas sin subpestañas
  subs?: Sub[]                 // pestañas con subpestañas
  subPorDefecto?: string       // subpestaña que se abre al entrar (por defecto, la primera)
  enConstruccion?: boolean
}

const TABS: Tab[] = [
  { id: 'datos', label: 'Datos', icon: User, seccion: 'datos' },
  {
    id: 'informes', label: 'Informes', icon: FileText,
    subs: [
      { id: 'ingreso', label: 'Informe de ingreso', seccion: 'ingreso' },
      { id: 'alta', label: 'Informe de alta', seccion: 'alta' },
      { id: 'enfermeria', label: 'Informe de enfermería', seccion: 'enfermeria' },
      { id: 'otros', label: 'Otros informes', seccion: 'otros' },
    ],
  },
  {
    id: 'plan', label: 'Plan de cuidados', icon: ClipboardList,
    subs: [
      { id: 'cuidados', label: 'Pauta de cuidados', seccion: 'cuidados' },
      { id: 'curas', label: 'Pauta de curas', seccion: 'curas' },
      { id: 'items', label: 'Hoja de ítems', seccion: 'items' },
    ],
    subPorDefecto: 'items',
  },
  {
    id: 'seguimiento', label: 'Seguimiento', icon: Activity,
    subs: [
      { id: 'incidencias', label: 'Incidencias', seccion: 'incidencias' },
    ],
  },
  { id: 'cmbd', label: 'CMBD', icon: Database, seccion: 'cmbd', enConstruccion: true },
]

// Enlaces antiguos (?tab=ingreso, ?tab=eventos…) que siguen existiendo
// en otras pantallas y en enlaces ya compartidos: se traducen a la nueva
// estructura para que sigan abriendo la pestaña correcta.
const ALIAS_TABS: Record<string, { tab: string; sub: string }> = {
  ingreso: { tab: 'informes', sub: 'ingreso' },
  alta: { tab: 'informes', sub: 'alta' },
  items: { tab: 'plan', sub: 'items' },
  curas: { tab: 'plan', sub: 'curas' },
  eventos: { tab: 'seguimiento', sub: 'incidencias' },
}

function resolverPestana(tabParam: string | null, subParam: string | null): { tab: Tab; sub: Sub | null } {
  const alias = tabParam ? ALIAS_TABS[tabParam] : undefined
  const tabId = alias?.tab ?? tabParam ?? 'datos'
  const tab = TABS.find((t) => t.id === tabId) ?? TABS[0]
  if (!tab.subs) return { tab, sub: null }
  const subId = alias?.sub ?? subParam ?? tab.subPorDefecto ?? tab.subs[0].id
  const sub = tab.subs.find((s) => s.id === subId)
    ?? tab.subs.find((s) => s.id === tab.subPorDefecto)
    ?? tab.subs[0]
  return { tab, sub }
}

export default function DetalleIngreso() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const [searchParams, setSearchParams] = useSearchParams()
  const { esMedico } = useAuth()
  // La pestaña y la subpestaña se leen siempre de la URL (?tab=…&sub=…),
  // sin estado propio: así, al navegar de un ingreso a otro sin recargar
  // la página, la pestaña nunca se queda "pegada" a la anterior.
  const { tab: tabActual, sub: subActual } = resolverPestana(searchParams.get('tab'), searchParams.get('sub'))
  const seccion: Seccion = subActual ? subActual.seccion : tabActual.seccion!
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

  // Abrir un expediente queda apuntado en el registro de accesos (Auditoría → Accesos).
  useEffect(() => {
    if (ingreso?.id) registrarAcceso('expediente', { ingresoId: ingreso.id, pacienteId: ingreso.paciente_id })
  }, [ingreso?.id])

  // Semáforo de caídas del paciente (lo rellena enfermería en la hoja de
  // ítems). Se vuelve a leer al cambiar de pestaña por si ha cambiado.
  const [semaforo, setSemaforo] = useState<string | null>(null)
  useEffect(() => {
    if (!id) return
    let vigente = true
    supabase
      .from('items_paciente')
      .select('semaforo_caidas')
      .eq('ingreso_id', id)
      .maybeSingle()
      .then(({ data }) => { if (vigente) setSemaforo((data as { semaforo_caidas?: string | null } | null)?.semaforo_caidas ?? null) })
    return () => { vigente = false }
  }, [id, tabActual.id, subActual?.id])

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
    const { error } = await supabase.rpc('dar_de_alta', {
      p_ingreso_id: id,
      p_fecha_alta: altaForm.fecha_alta,
      p_circunstancia_alta: altaForm.circunstancia_alta,
    })
    setProcesandoAlta(false)
    if (error) {
      setErrorAlta('No se pudo registrar el alta: ' + error.message)
      return
    }
    // Se recarga desde el servidor en vez de parchear el estado local
    // a mano — la interfaz también necesita dado_de_alta_en (para
    // decidir si mostrar "Reabrir episodio"), y ese campo no viene en
    // la respuesta de la función; antes el botón no aparecía hasta
    // recargar la página entera.
    await cargar()
    setModalAlta(false)
  }

  if (loading) return <Cargando pagina />
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
  if (!ingreso) return <div className="p-8 text-slate-500">Ingreso no encontrado</div>

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

  // replace: true — cambiar de pestaña no debería llenar el historial del
  // navegador con una entrada por cada clic, solo dejar que recargar o
  // compartir el enlace abra la pestaña correcta.
  function irA(tabId: string, subId?: string) {
    setSearchParams((prev) => {
      const next = new URLSearchParams(prev)
      next.set('tab', tabId)
      if (subId) next.set('sub', subId)
      else next.delete('sub')
      return next
    }, { replace: true })
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
            <button onClick={() => navigate(-1)} className="text-slate-500 hover:text-slate-600 mt-1">
              <ChevronLeft className="w-5 h-5" />
            </button>
            {ingreso.habitacion && (
              <BadgeHabitacion habitacion={ingreso.habitacion} semaforo={semaforo} cerrado={episodioCerrado} />
            )}
            <div>
              <h1 className="text-xl font-bold text-slate-800">{nombreDelPaciente}</h1>
              <div className="flex items-center gap-3 mt-0.5 text-xs text-slate-500 flex-wrap">
                {edadPaciente != null && <span>{edadPaciente} años</span>}
                {ingreso.medico_responsable && (
                  <span>
                    {edadPaciente != null ? '· ' : ''}{ingreso.medico_responsable.nombre} {ingreso.medico_responsable.apellidos}
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
          <div className="flex items-center gap-3 shrink-0">
          {id && <NavegadorPacientes ingresoId={id} />}
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
          {TABS.map(({ id: tid, label, icon: Icon, enConstruccion }) => (
            <button
              key={tid}
              onClick={() => irA(tid)}
              className={`flex items-center gap-1.5 px-4 py-2.5 text-sm font-medium border-b-2 transition-colors ${
                tabActual.id === tid
                  ? 'border-primary-600 text-primary-700'
                  : 'border-transparent text-slate-500 hover:text-slate-700'
              }`}
            >
              <Icon className="w-3.5 h-3.5" />
              {label}
              {enConstruccion && (
                <span className="ml-1 text-xs font-medium px-1.5 py-0.5 rounded-full bg-amber-50 text-amber-700 border border-amber-200">
                  en construcción
                </span>
              )}
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
        {/* Subpestañas (solo en las pestañas que las tienen) */}
        {tabActual.subs && subActual && (
          <div className="flex flex-wrap gap-2 mb-6 pb-4 border-b border-slate-100">
            {tabActual.subs.map((s) => (
              <button
                key={s.id}
                onClick={() => irA(tabActual.id, s.id)}
                className={`flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                  subActual.id === s.id
                    ? 'bg-primary-50 text-primary-700'
                    : 'text-slate-500 hover:text-slate-700 hover:bg-slate-50'
                }`}
              >
                {s.label}
                {s.enConstruccion && (
                  <span className="text-xs font-medium px-1.5 py-0.5 rounded-full bg-amber-50 text-amber-700 border border-amber-200">
                    en construcción
                  </span>
                )}
              </button>
            ))}
          </div>
        )}
        {/* Aviso de sección en construcción */}
        {seccion === 'cmbd' && (
          <div className="mb-4 flex items-center gap-2 text-sm text-amber-800 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
            <Construction className="w-4 h-4 shrink-0" />
            El CMBD está en construcción: puede cambiar y no debe usarse todavía como registro definitivo.
          </div>
        )}
        {/* Episodio cerrado: Datos e Ítems pasan a solo lectura para
            todos — corregir algo ahí requiere un mecanismo explícito,
            no editar en caliente. Informe de ingreso (solo médicos,
            porque el informe de alta se apoya en sus antecedentes y
            puede necesitar corregirse), Informe de alta, CMBD (solo
            médicos) e Incidencias (cualquier asistencial) se quedan
            editables tras el cierre — cada uno gestiona su propio
            aviso de solo lectura si corresponde por rol. */}
        {episodioCerrado && ['datos', 'items'].includes(seccion) && (
          <div className="mb-4 flex items-center gap-2 text-sm text-slate-600 bg-slate-100 border border-slate-200 rounded-lg px-3 py-2">
            <Lock className="w-4 h-4 shrink-0" />
            Episodio cerrado ({ESTADO_LABEL[ingreso.estado] ?? ingreso.estado}): solo lectura, ya no se puede editar.
          </div>
        )}
        {/* Aviso de solo lectura por rol (independiente de si el episodio
            sigue activo o ya está cerrado: siempre es cosa del médico) */}
        {!esMedico && ['datos', 'ingreso', 'alta', 'cmbd'].includes(seccion) && (
          <div className="mb-4 flex items-center gap-2 text-sm text-amber-700 bg-amber-50 border border-amber-100 rounded-lg px-3 py-2">
            <Lock className="w-4 h-4 shrink-0" />
            Solo lectura: tu rol puede consultar esta sección, pero solo un médico puede editarla.
          </div>
        )}
        {/* fieldset disabled desactiva de golpe todos los campos de dentro */}
        <fieldset
          disabled={
            (episodioCerrado && ['datos', 'items'].includes(seccion)) ||
            (!esMedico && ['datos', 'ingreso', 'alta', 'cmbd'].includes(seccion))
          }
          className="min-w-0 border-0 p-0 m-0"
        >
          {seccion === 'datos' && (
            <TabDatos
              ingreso={ingreso}
              onUpdate={setIngreso}
              iniciarEditando={searchParams.get('editar') === 'habitacion'}
            />
          )}
          {seccion === 'ingreso' && id && <TabInformeIngreso ingresoId={id} ingreso={ingreso} />}
          {seccion === 'alta' && id && <TabInformeAlta ingresoId={id} ingreso={ingreso} />}
          {/* Otros informes: el permiso (solo médicos escriben) lo gestiona
              la propia pestaña, porque el episodio cerrado no la bloquea
              y los demás roles sí pueden leer y exportar. */}
          {/* Informe de enfermería: solo escribe enfermería; lo gestiona la
              propia pestaña (aviso de solo lectura incluido). */}
          {seccion === 'enfermeria' && id && <TabInformeEnfermeria ingresoId={id} ingreso={ingreso} />}
          {seccion === 'otros' && id && <TabOtrosInformes ingresoId={id} ingreso={ingreso} />}
          {seccion === 'cuidados' && id && <TabPautaCuidados ingresoId={id} episodioActivo={!episodioCerrado} />}
          {seccion === 'curas' && id && <TabCuras ingresoId={id} episodioActivo={!episodioCerrado} />}
          {seccion === 'items' && id && (
            <TabItems
              ingresoId={id}
              key={id}
              pacienteInfo={p ? { nombre: nombreDelPaciente, habitacion: ingreso.habitacion } : undefined}
            />
          )}
          {seccion === 'incidencias' && id && (
            <TabEventos
              ingresoId={id}
              pacienteInfo={p ? { nombre: nombreDelPaciente, habitacion: ingreso.habitacion } : undefined}
            />
          )}
          {seccion === 'cmbd' && id && <TabCMBD ingresoId={id} ingreso={ingreso} />}
        </fieldset>
      </div>
    </div>
  )
}
