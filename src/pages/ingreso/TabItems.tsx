import { useEffect, useRef, useState } from 'react'
import { Cargando } from '../../components/Cargando'
import { useAvisoSalida } from '../../lib/avisoSalida'
import { supabase } from '../../lib/supabase'
import type { ItemsPaciente } from '../../types'
import { CamposItems } from '../../components/CamposItems'
import { EVENTO_SEMAFORO } from '../../components/SemaforoCaidas'
import { AvisoFicha } from '../../components/AvisoFicha'
import { TituloSeccion } from '../../components/TituloSeccion'
import { IndicadorGuardado } from '../../components/IndicadorGuardado'
import { encadenar } from '../../lib/colaGuardado'


function TabItems({ ingresoId, pacienteInfo }: { ingresoId: string; pacienteInfo?: { nombre: string; habitacion?: number | null } }) {
  const [data, setData] = useState<Partial<ItemsPaciente & { version: number }>>({})
  const [estado, setEstado] = useState<'inactivo' | 'pendiente' | 'guardando' | 'guardado' | 'error' | 'conflicto'>('inactivo')
  const [errorRecarga, setErrorRecarga] = useState('')   // fallo al pedir la versión más reciente tras un conflicto: el borrador no se toca
  const [verHistorico, setVerHistorico] = useState(false)
  // Estado de la carga de los ítems: hasta que llegan (o si falla) no se enseña el formulario ni se puede guardar,
  // para que un formulario vacío por error de carga no se confunda con «no lleva nada» ni se guarde encima de datos reales.
  const [itemsListos, setItemsListos] = useState(false)
  const [errorItems, setErrorItems] = useState('')
  const [reintento, setReintento] = useState(0)
  // Cambios hechos en pantalla y todavía sin guardar. `revRef` cuenta las ediciones: si mientras se
  // guarda se escribe algo más, esa edición sigue pendiente (la respuesta del servidor no la pisa).
  const [sucio, setSucio] = useState(false)
  const revRef = useRef(0)
  // Guardado automático, igual que en el panel de la Hoja de ítems: unos segundos después de dejar de tocar el formulario.
  // Los guardados van en cola y cada uno lee la versión que dejó el anterior, para no conflictuar con uno mismo.
  const dataRef = useRef(data)
  dataRef.current = data
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const cadenaRef = useRef<Promise<boolean>>(Promise.resolve(true))
  const versionGuardadaRef = useRef<number | null>(null)
  function editar(fn: (d: Partial<ItemsPaciente & { version: number }>) => Partial<ItemsPaciente & { version: number }>) {
    revRef.current++
    setSucio(true)
    setData(fn)
    if (estado === 'conflicto') return    // en conflicto no se reintenta solo: primero «Ver la versión más reciente»
    setEstado('pendiente')
    if (debounceRef.current) clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(() => { void save() }, 1200)
  }
  useAvisoSalida(sucio || estado === 'pendiente' || estado === 'guardando' || estado === 'error' || estado === 'conflicto')
  useEffect(() => () => { if (debounceRef.current) clearTimeout(debounceRef.current) }, [])

  useEffect(() => {
    // .maybeSingle() en vez de .single(): un ingreso recién creado
    // puede no tener fila de items_paciente todavía, y eso no es un
    // error. setData(d ?? {}) SIEMPRE se ejecuta (antes solo se
    // llamaba si había datos) — así, al cambiar de un paciente con
    // items a uno sin ellos, el formulario se vacía de verdad en vez
    // de seguir mostrando los datos del paciente anterior.
    if (debounceRef.current) { clearTimeout(debounceRef.current); debounceRef.current = null }
    versionGuardadaRef.current = null
    setEstado('inactivo')
    setData({})
    setSucio(false)
    setItemsListos(false)
    setErrorItems('')
    let vigente = true
    supabase.from('items_paciente').select('*').eq('ingreso_id', ingresoId).maybeSingle()
      .then(({ data: d, error }) => {
        if (!vigente) return
        if (error) {
          setErrorItems('No se pudieron cargar los ítems: ' + error.message)
          return
        }
        setData(d ?? {})
        setItemsListos(true)
      })
    return () => { vigente = false }
  }, [ingresoId, reintento])

  function save(): Promise<boolean> {
    if (debounceRef.current) { clearTimeout(debounceRef.current); debounceRef.current = null }
    const miRev = revRef.current
    setEstado('guardando')
    return encadenar(cadenaRef, () => ejecutarGuardado(miRev))
  }

  async function ejecutarGuardado(miRev: number): Promise<boolean> {
    // update() con la versión que dejó el guardado anterior, no upsert() a ciegas: si alguien más ha guardado esta
    // misma hoja mientras tanto, esto no encuentra ninguna fila y avisa, en vez de pisarlo en silencio.
    const d = dataRef.current
    const version = versionGuardadaRef.current ?? d.version ?? 1
    const { data: guardado, error } = await supabase
      .from('items_paciente')
      .update(d)
      .eq('ingreso_id', ingresoId)
      .eq('version', version)
      .select()
      .maybeSingle()
    if (guardado) versionGuardadaRef.current = guardado.version
    if (error) {
      // El error se queda a la vista hasta el siguiente guardado correcto: lo escrito sigue sin guardar.
      setEstado('error')
      return false
    }
    if (!guardado) { setEstado('conflicto'); return false }
    // Solo se toma la versión nueva: lo que se haya cambiado mientras se guardaba se queda en pantalla
    // y sigue pendiente de guardar (antes la respuesta del servidor lo borraba sin avisar).
    setData((prev) => ({ ...prev, version: guardado.version, updated_at: guardado.updated_at }))
    // La cabecera del paciente muestra el color del semáforo: se le avisa del valor ya guardado.
    window.dispatchEvent(new CustomEvent(EVENTO_SEMAFORO, { detail: { ingresoId, valor: guardado.semaforo_caidas ?? null } }))
    if (revRef.current === miRev) {
      setSucio(false)
      setEstado('guardado')
      setTimeout(() => setEstado((e) => (e === 'guardado' ? 'inactivo' : e)), 2000)
    } else {
      setEstado('pendiente')   // hay ediciones posteriores: ya hay otro guardado programado
    }
    return true
  }

  async function recargarTrasConflicto() {
    const { data: d, error } = await supabase.from('items_paciente').select('*').eq('ingreso_id', ingresoId).maybeSingle()
    if (error) { setErrorRecarga('No se ha podido obtener la versión actual (comprueba la conexión). Tu borrador sigue aquí; inténtalo de nuevo.'); return }
    setErrorRecarga('')
    versionGuardadaRef.current = null
    setData(d ?? {})
    setSucio(false)
    setEstado('inactivo')
  }

  if (!itemsListos) {
    return errorItems ? (
      <div className="aviso aviso-error ancho-formulario flex items-center justify-between gap-3" role="alert">
        <span>{errorItems} Hasta que se carguen no se puede editar ni guardar.</span>
        <button type="button" onClick={() => setReintento((n) => n + 1)} className="btn-secondary btn-sm shrink-0">Reintentar</button>
      </div>
    ) : <Cargando texto="Cargando hoja de ítems…" />
  }

  return (
    <div className="ancho-formulario space-y-6">
      <TituloSeccion titulo="Hoja de ítems"
        subtitulo="Necesidades y ayudas del paciente para los cuidados diarios: se actualizan cuando cambian y salen en la hoja de ítems impresa." />
      {/* Indicador de guardado: flota arriba a la derecha (sin ocupar altura) y solo se ve cuando hay algo que decir. */}
      <div className="sticky top-0 z-10 flex justify-end h-0 !mt-0 pointer-events-none">
        <span className={`pointer-events-auto bg-white/90 backdrop-blur rounded-full px-3 py-1 shadow-sm border border-slate-100 ${estado === 'inactivo' || estado === 'conflicto' ? 'hidden' : ''}`}>
          <IndicadorGuardado estado={estado} detalle="inténtalo de nuevo" />
          {estado === 'error' && (
            <button type="button" onClick={() => { void save() }} className="ml-2 text-xs font-semibold text-primary-700 hover:underline">Reintentar</button>
          )}
        </span>
      </div>
      <CamposItems
        variante="ficha"
        data={data as Record<string, any>}
        update={(k, v) => editar((d) => ({ ...d, [k]: v }))}
        updateVarios={(c) => editar((d) => ({ ...d, ...c }))}
        ingresoId={ingresoId}
        pacienteInfo={pacienteInfo}
      />

      {estado === 'conflicto' && (
        <AvisoFicha tono="atencion" accion={
          <button onClick={recargarTrasConflicto} className="btn-secondary btn-sm shrink-0">Ver la versión más reciente</button>
        }>
          Alguien más ha guardado cambios en esta hoja mientras la editabas. Lo que has marcado sigue aquí, sin guardar.
          {errorRecarga && <> {errorRecarga}</>}
        </AvisoFicha>
      )}

      <div className="flex items-center">
        <button onClick={() => setVerHistorico(v => !v)} className="btn-secondary btn-sm">
          {verHistorico ? 'Ocultar histórico' : 'Ver histórico de snapshots'}
        </button>
      </div>

      {verHistorico && <HistoricoItems ingresoId={ingresoId} />}
    </div>
  )
}

function HistoricoItems({ ingresoId }: { ingresoId: string }) {
  const [snapshots, setSnapshots] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [selected, setSelected] = useState<any>(null)

  useEffect(() => {
    async function cargar() {
      try {
        const { data } = await supabase.from('items_historico')
          .select('*')
          .eq('ingreso_id', ingresoId)
          .order('fecha', { ascending: false })
        setSnapshots(data ?? [])
      } finally {
        setLoading(false)
      }
    }
    cargar()
  }, [ingresoId])

  const LABELS: Record<string, string> = {
    dependencia_avd: 'Dependencia', panial_dia: 'Pañal día', panial_noche: 'Pañal noche',
    colector: 'Colector', sonda_vesical: 'Sonda vesical', dentadura: 'Dentadura',
    audifonos: 'Audífonos', gafas: 'Gafas', higiene: 'Higiene', vestido: 'Vestido',
    ducha: 'Ducha', banio: 'Baño acompañado', siestas: 'Siesta tarde', deambulacion: 'Deambulación',
    ayudas_deambulacion: 'Ayudas deambulación', bipedestador: 'Bipedestador',
    grua: 'Grúa', cambios_posturales: 'Cambios posturales',
    cabecero_grados: 'Cabecero elevado (º)', timbre_habitacion: 'Timbre habitación',
    objetos_calma: 'Objetos de calma', alerta_conducta: 'Alerta de conducta',
    ingestas: 'Ingestas', oxigenoterapia: 'Oxigenoterapia', botella_noche: 'Botella noche',
    vias: 'Vías', aislamiento: 'Aislamiento', sonda_fecha: 'Sonda: fecha de colocación', sonda_calibre: 'Sonda: calibre',
    oxigeno_dispositivo: 'Oxígeno: dispositivo', oxigeno_flujo: 'Oxígeno: flujo (l/min)',
    colchon_antiescaras: 'Colchón antiescaras', patucos_coderas: 'Patucos/coderas',
    observaciones: 'Observaciones', semaforo_caidas: 'Semáforo caídas',
  }
  const SKIP = new Set(['id', 'ingreso_id', 'created_at', 'updated_at'])

  function formatVal(v: any): string {
    if (v === null || v === undefined || v === '') return '—'
    if (typeof v === 'boolean') return v ? 'Sí' : 'No'
    if (Array.isArray(v)) return v.length > 0 ? v.join(', ') : '—'
    return String(v)
  }

  if (loading) return <Cargando texto="Cargando histórico…" />
  if (snapshots.length === 0) return (
    <div className="card p-6 text-center text-sm text-slate-500">
      No hay snapshots guardados. Usa el botón "Snapshot del día" en la Hoja de ítems.
    </div>
  )

  return (
    <div className="card overflow-hidden">
      <div className="px-4 py-3 border-b bg-slate-50">
        <p className="section-title mb-0">Histórico de snapshots</p>
      </div>
      <div className="flex">
        {/* Lista de fechas */}
        <div className="w-36 border-r shrink-0">
          {snapshots.map(s => (
            <button key={s.id}
              onClick={() => setSelected(s)}
              className={`w-full text-left px-4 py-2.5 text-xs border-b transition-colors ${
                selected?.id === s.id
                  ? 'bg-primary-50 text-primary-700 font-semibold'
                  : 'hover:bg-slate-50 text-slate-600'
              }`}>
              {new Date(s.fecha).toLocaleDateString('es-ES')}
            </button>
          ))}
        </div>

        {/* Detalle del snapshot */}
        <div className="flex-1 overflow-y-auto max-h-80">
          {!selected ? (
            <div className="p-6 text-xs text-slate-500 text-center">
              Selecciona una fecha para ver el snapshot
            </div>
          ) : (
            <div className="divide-y">
              {Object.entries(selected.datos ?? {})
                .filter(([k]) => !SKIP.has(k) && selected.datos[k] !== null && selected.datos[k] !== undefined)
                .map(([k, v]) => (
                  <div key={k} className="flex px-4 py-2 text-xs">
                    <span className="w-44 text-slate-500 shrink-0">{LABELS[k] ?? k}</span>
                    <span className="text-slate-700 font-medium">{formatVal(v)}</span>
                  </div>
                ))}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}


export { TabItems }
