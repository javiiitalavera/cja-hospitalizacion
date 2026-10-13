import { useEffect, useRef, useState } from 'react'
import { Cargando } from '../../components/Cargando'
import { useAvisoSalida } from '../../lib/avisoSalida'
import { supabase } from '../../lib/supabase'
import type { ItemsPaciente } from '../../types'
import { BloqueOxigeno, BloqueSonda, SelectorAislamiento, SelectorVias } from '../../components/ViasDispositivos'
import type { DatosDispositivos } from '../../types/pautaCuidados'
import ModalContencion from '../../components/ModalContencion'
import { severidadDia, severidadNoche, SEVERIDAD_ESTILO, SEVERIDAD_BOTON_ESTILO } from '../../types/contenciones'
import { SEMAFORO_CAIDAS_COLOR } from '../../types'
import { EVENTO_SEMAFORO, SEMAFOROS } from '../../components/SemaforoCaidas'
import { AvisoFicha } from '../../components/AvisoFicha'


function TabItems({ ingresoId, pacienteInfo }: { ingresoId: string; pacienteInfo?: { nombre: string; habitacion?: number | null } }) {
  const [data, setData] = useState<Partial<ItemsPaciente & { version: number }>>({})
  const [estado, setEstado] = useState<'inactivo' | 'guardando' | 'guardado' | 'error' | 'conflicto'>('inactivo')
  const [verHistorico, setVerHistorico] = useState(false)
  const [modalContencion, setModalContencion] = useState(false)
  const [estadoContencion, setEstadoContencion] = useState<{ dia: string | null; noche: string[] | null } | 'cargando'>('cargando')
  const [errorCarga, setErrorCarga] = useState('')
  // Estado de la carga de los ítems: hasta que llegan (o si falla) no se enseña el formulario ni se puede guardar,
  // para que un formulario vacío por error de carga no se confunda con «no lleva nada» ni se guarde encima de datos reales.
  const [itemsListos, setItemsListos] = useState(false)
  const [errorItems, setErrorItems] = useState('')
  const [reintento, setReintento] = useState(0)
  // Cambios hechos en pantalla y todavía sin guardar. `revRef` cuenta las ediciones: si mientras se
  // guarda se escribe algo más, esa edición sigue pendiente (la respuesta del servidor no la pisa).
  const [sucio, setSucio] = useState(false)
  const revRef = useRef(0)
  function editar(fn: (d: Partial<ItemsPaciente & { version: number }>) => Partial<ItemsPaciente & { version: number }>) {
    revRef.current++
    setSucio(true)
    setData(fn)
  }
  useAvisoSalida(sucio || estado === 'guardando' || estado === 'error' || estado === 'conflicto')

  function cargarContencion() {
    supabase.from('contenciones').select('dia, noche').eq('ingreso_id', ingresoId).maybeSingle()
      .then(({ data, error }) => {
        if (error) {
          // Un error real (red, permisos...) no es lo mismo que "sin
          // revisar todavía" — si se confunden, guardar después
          // podría sobrescribir una pauta real con "no hay nada".
          setErrorCarga('No se pudo comprobar la contención: ' + error.message)
          return
        }
        setEstadoContencion(data ?? { dia: null, noche: null })
      })
  }

  useEffect(() => { cargarContencion() }, [ingresoId])

  useEffect(() => {
    // .maybeSingle() en vez de .single(): un ingreso recién creado
    // puede no tener fila de items_paciente todavía, y eso no es un
    // error. setData(d ?? {}) SIEMPRE se ejecuta (antes solo se
    // llamaba si había datos) — así, al cambiar de un paciente con
    // items a uno sin ellos, el formulario se vacía de verdad en vez
    // de seguir mostrando los datos del paciente anterior.
    setData({})
    setSucio(false)
    setErrorCarga('')
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

  async function save() {
    const miRev = revRef.current
    setEstado('guardando')
    // update() con la versión leída, no upsert() a ciegas: si alguien
    // más ha guardado esta misma hoja mientras tanto, esto no
    // encuentra ninguna fila y avisa, en vez de pisarlo en silencio.
    const { data: guardado, error } = await supabase
      .from('items_paciente')
      .update(data)
      .eq('ingreso_id', ingresoId)
      .eq('version', data.version ?? 1)
      .select()
      .maybeSingle()
    if (error) {
      setEstado('error')
      setTimeout(() => setEstado((e) => (e === 'error' ? 'inactivo' : e)), 4000)
      return
    }
    if (!guardado) { setEstado('conflicto'); return }
    // Solo se toma la versión nueva: lo que se haya cambiado mientras se guardaba se queda en pantalla
    // y sigue pendiente de guardar (antes la respuesta del servidor lo borraba sin avisar).
    setData((d) => ({ ...d, version: guardado.version, updated_at: guardado.updated_at }))
    // La cabecera del paciente muestra el color del semáforo: se le avisa del valor ya guardado.
    window.dispatchEvent(new CustomEvent(EVENTO_SEMAFORO, { detail: { ingresoId, valor: guardado.semaforo_caidas ?? null } }))
    if (revRef.current === miRev) {
      setSucio(false)
      setEstado('guardado')
      setTimeout(() => setEstado((e) => (e === 'guardado' ? 'inactivo' : e)), 2000)
    } else {
      setEstado('inactivo')   // hay ediciones posteriores: el botón vuelve a «Guardar cambios»
    }
  }

  async function recargarTrasConflicto() {
    const { data: d } = await supabase.from('items_paciente').select('*').eq('ingreso_id', ingresoId).maybeSingle()
    setData(d ?? {})
    setSucio(false)
    setEstado('inactivo')
  }

  const sel = (key: keyof ItemsPaciente, label: string, options: { v: string; l: string }[]) => (
    <div>
      <label className="label">{label}</label>
      <select className="input" value={(data[key] as string) ?? ''}
        onChange={e => editar(d => ({ ...d, [key]: e.target.value || null }))}>
        <option value="">—</option>
        {options.map(o => <option key={o.v} value={o.v}>{o.l}</option>)}
      </select>
    </div>
  )

  const bool = (key: keyof ItemsPaciente, label: string) => (
    <label className="flex items-center gap-2 text-sm cursor-pointer">
      <input type="checkbox" className="w-4 h-4 rounded text-primary-600"
        checked={!!(data[key])}
        onChange={e => editar(d => ({ ...d, [key]: e.target.checked }))} />
      {label}
    </label>
  )

  if (!itemsListos) {
    return errorItems ? (
      <div className="ancho-formulario bg-red-50 border border-red-200 text-red-700 text-sm rounded-lg px-4 py-3 flex items-center justify-between gap-3" role="alert">
        <span>{errorItems} Hasta que se carguen no se puede editar ni guardar.</span>
        <button type="button" onClick={() => setReintento((n) => n + 1)} className="btn-secondary text-xs shrink-0">Reintentar</button>
      </div>
    ) : <Cargando texto="Cargando hoja de ítems…" />
  }

  return (
    <div className="ancho-formulario space-y-6">
      {errorCarga && (
        <div className="bg-red-50 border border-red-200 text-red-700 text-sm rounded-lg px-4 py-3">
          {errorCarga} — no guardes cambios hasta recargar la página, para no sobrescribir datos reales con vacío.
        </div>
      )}
      <div className="card p-6 space-y-5">
        <p className="section-title !mb-0">Seguridad y conducta</p>

        {/* Semáforo de caídas: como el resto del formulario, no se guarda hasta pulsar «Guardar cambios». */}
        <div>
          <label className="label">Semáforo de caídas</label>
          <div className="flex gap-2" role="group" aria-label="Semáforo de caídas">
            {SEMAFOROS.map((color) => {
              const activo = (data as any).semaforo_caidas === color
              return (
                <button key={color} type="button" aria-pressed={activo} aria-label={`Semáforo de caídas ${color}`}
                  onClick={() => editar(d => ({ ...d, semaforo_caidas: activo ? null : color } as any))}
                  className={`min-w-[5.5rem] py-1.5 rounded-lg text-xs font-semibold border-2 transition-all ${activo ? 'border-slate-700 scale-105' : 'border-transparent opacity-90 hover:opacity-100'}`}
                  style={{ backgroundColor: SEMAFORO_CAIDAS_COLOR[color], color: color === 'rojo' ? '#fff' : '#000' }}>
                  {color.charAt(0).toUpperCase() + color.slice(1)}
                </button>
              )
            })}
          </div>
          <p className="text-xs text-slate-500 mt-1">Riesgo de caída del paciente. Pulsa el color activo para quitarlo.</p>
        </div>

        <div className="rounded-xl bg-slate-50 border border-slate-200 p-4 space-y-2.5" data-testid="bloque-contencion">
          <div>
            <p className="label !mb-0">Pauta de contención</p>
            <p className="text-xs text-slate-500">
              Contención pautada para el día y para la noche. Pulsa Día o Noche para ver o editar la contención; cada cambio queda en su historial.
            </p>
          </div>
        {estadoContencion === 'cargando' ? (
          <Cargando />
        ) : (
          <div className="flex flex-wrap gap-2" role="group" aria-label="Pauta de contención">
            {(['dia', 'noche'] as const).map((eje) => {
              const sev = eje === 'dia' ? severidadDia(estadoContencion.dia as any) : severidadNoche(estadoContencion.noche as any)
              const estilo = SEVERIDAD_ESTILO[sev]
              return (
                <button key={eje} type="button" onClick={() => setModalContencion(true)}
                  aria-label={`Contención ${eje === 'dia' ? 'día' : 'noche'}: ${estilo.label}. Ver o editar`}
                  className={`min-w-[11rem] px-3 py-1.5 rounded-lg text-xs font-semibold border-2 transition-all hover:brightness-95 ${SEVERIDAD_BOTON_ESTILO[sev]}`}>
                  {eje === 'dia' ? 'Día' : 'Noche'}: {estilo.label}
                </button>
              )
            })}
          </div>
        )}
        {modalContencion && (
          <ModalContencion
            ingresoId={ingresoId}
            onClose={() => setModalContencion(false)}
            onGuardado={cargarContencion}
            pacienteInfo={pacienteInfo}
          />
        )}
        </div>
        <div className="border-t border-slate-200 pt-5" data-testid="bloque-alerta-conducta">
          <label className="label">Alerta de conducta</label>
          <div className="flex flex-wrap gap-2">
            {([
              { v: 'riesgo_autolitico', l: 'Riesgo autolítico' },
              { v: 'agresion_imprevisible', l: 'Agresión imprevisible' },
              { v: 'riesgo_fuga', l: 'Riesgo de fuga' },
            ] as const).map((opt) => {
              const actual = (data.alerta_conducta as string[]) ?? []
              const activo = actual.includes(opt.v)
              return (
                <button key={opt.v} type="button"
                  onClick={() => editar(d => ({ ...d, alerta_conducta: activo ? actual.filter(x => x !== opt.v) : [...actual, opt.v] } as any))}
                  className={`px-3 py-1.5 rounded-lg text-xs font-medium border transition-colors ${activo ? 'bg-red-50 text-red-700 border-red-200' : 'bg-white text-slate-600 border-slate-300 hover:border-slate-400'}`}>
                  {opt.l}
                </button>
              )
            })}
          </div>
        </div>
        <div>
          <label className="label">Objetos de calma</label>
          <input className="input" value={(data.objetos_calma as string) ?? ''}
            onChange={e => editar(d => ({ ...d, objetos_calma: e.target.value }))} />
        </div>
      </div>

      <div className="card p-6 space-y-5">
        <p className="section-title">Aislamiento, vías y dispositivos</p>
        {(() => {
          const d = data as DatosDispositivos
          const cambiar = (c: DatosDispositivos) => editar((x) => ({ ...x, ...c } as any))
          return (
            <>
              <div>
                <label className="label">Aislamiento</label>
                <SelectorAislamiento datos={d} onCambio={cambiar} />
              </div>
              <div>
                <label className="label">Vías</label>
                <SelectorVias datos={d} onCambio={cambiar} />
              </div>
              <div className="grid sm:grid-cols-2 gap-6">
                <BloqueSonda datos={d} onCambio={cambiar} />
                <BloqueOxigeno datos={d} onCambio={cambiar} />
              </div>
            </>
          )
        })()}
      </div>

      <div className="card p-6 space-y-4">
        <p className="section-title">Movilidad</p>
        <div className="grid grid-cols-2 gap-4">
          {sel('deambulacion', 'Deambulación', [
            { v: 'autonomo', l: 'Autónomo' },
            { v: '1_persona', l: '1 persona' },
            { v: '2_personas', l: '2 personas' },
          ])}
          <div>
            <label className="label">Cabecero elevado (º)</label>
            <input className="input" placeholder="p. ej. 30" value={(data.cabecero_grados as string) ?? ''}
              onChange={e => editar(d => ({ ...d, cabecero_grados: e.target.value }))} />
          </div>
        </div>
        {sel('ayudas_deambulacion', 'Ayudas', [
          { v: 'ninguna', l: 'Ninguna' }, { v: 'baston', l: 'Bastón' },
          { v: 'andador_2r', l: 'Andador 2 ruedas' }, { v: 'andador_4r', l: 'Andador 4 ruedas' },
          { v: 'silla_ruedas', l: 'Silla de ruedas' },
        ])}
        <div className="flex flex-wrap gap-4">
          {bool('bipedestador', 'Bipedestador')}
          {bool('grua', 'Grúa')}
        </div>
      </div>

      <div className="card p-6 space-y-4">
        <p className="section-title">Alimentación</p>
        {sel('ingestas', 'Ingestas', [{ v: 'autonomo', l: 'Autónomo' }, { v: 'dependiente', l: 'Dependiente' }])}
      </div>

      <div className="card p-6 space-y-4">
        <p className="section-title">Higiene y continencia</p>
        <div className="grid grid-cols-2 gap-4">
          {sel('dependencia_avd', 'Dependencia', [{ v: '1', l: '1 persona' }, { v: '2', l: '2 personas' }])}
          {sel('panial_dia', 'Pañal día', [{ v: 'ninguno', l: 'Ninguno' }, { v: 'BP', l: 'BP' }, { v: 'CA', l: 'CA' }])}
          {sel('panial_noche', 'Pañal noche', [
            { v: 'ninguno', l: 'Ninguno' }, { v: 'BP', l: 'BP' }, { v: 'CA', l: 'CA' }, { v: 'CA+malla', l: 'CA + malla' }
          ])}
          {sel('higiene', 'Higiene', [{ v: 'lavabo', l: 'Lavabo' }, { v: 'cama', l: 'Cama' }])}
          {sel('ducha', 'Ducha', [{ v: 'pie', l: 'De pie' }, { v: 'sentado', l: 'Sentado' }])}
          {sel('vestido', 'Vestido', [{ v: 'autonomo', l: 'Autónomo' }, { v: 'dependiente', l: 'Dependiente' }])}
        </div>
        <div className="flex flex-wrap gap-4">
          {bool('colector', 'Colector')}
          {bool('banio', 'Baño acompañado (no va solo)')}
        </div>
      </div>

      <div className="card p-6 space-y-4">
        <p className="section-title">Piel y postura</p>
        <div className="flex flex-wrap gap-4">
          {bool('colchon_antiescaras', 'Colchón antiescaras')}
          {bool('patucos_coderas', 'Patucos / coderas')}
          {bool('cambios_posturales', 'Cambios posturales')}
        </div>
      </div>

      <div className="card p-6 space-y-4">
        <p className="section-title">Prótesis y sensorial</p>
        <div className="grid grid-cols-3 gap-4">
          {sel('dentadura', 'Dentadura', [
            { v: 'ninguna', l: 'Ninguna' }, { v: 'superior', l: 'Superior' },
            { v: 'inferior', l: 'Inferior' }, { v: 'completa', l: 'Completa' },
            { v: 'fija', l: 'Fija' }, { v: 'puente', l: 'Puente' },
          ])}
          {sel('audifonos', 'Audífonos', [
            { v: 'ninguno', l: 'Ninguno' }, { v: 'derecho', l: 'Derecho' },
            { v: 'izquierdo', l: 'Izquierdo' }, { v: 'ambos', l: 'Ambos' },
          ])}
          {sel('gafas', 'Gafas', [
            { v: 'no', l: 'No' }, { v: 'si', l: 'Sí' }, { v: 'solo_tv', l: 'Solo TV' },
          ])}
        </div>
      </div>

      <div className="card p-6 space-y-4">
        <p className="section-title">Otros</p>
        <div className="flex flex-wrap gap-4">
          {bool('botella_noche', 'Botella noche')}
          {bool('timbre_habitacion', 'Timbre en habitación')}
          {bool('siestas', 'Siesta por la tarde')}
        </div>
      </div>

      <div className="card p-6 space-y-4">
        <p className="section-title">Observaciones</p>
        <textarea className="textarea" rows={3} placeholder="Notas libres…"
          value={(data.observaciones as string) ?? ''}
          onChange={e => editar(d => ({ ...d, observaciones: e.target.value }))} />
      </div>

      {estado === 'conflicto' && (
        <AvisoFicha tono="atencion" accion={
          <button onClick={recargarTrasConflicto} className="btn-secondary text-xs shrink-0">Ver la versión más reciente</button>
        }>
          Alguien más ha guardado cambios en esta hoja mientras la editabas. Lo que has marcado sigue aquí, sin guardar todavía.
        </AvisoFicha>
      )}

      <div className="flex justify-between items-center">
        <button onClick={() => setVerHistorico(v => !v)} className="btn-secondary text-xs">
          {verHistorico ? 'Ocultar histórico' : 'Ver histórico de snapshots'}
        </button>
        <button onClick={save} disabled={estado === 'guardando' || estado === 'conflicto'} className="btn-primary">
          {estado === 'guardando' ? 'Guardando…' : estado === 'error' ? '✗ Error al guardar' : estado === 'guardado' ? '✓ Guardado' : 'Guardar cambios'}
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
