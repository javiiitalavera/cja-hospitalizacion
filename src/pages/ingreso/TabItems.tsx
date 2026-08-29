import { useEffect, useState } from 'react'
import { supabase } from '../../lib/supabase'
import type { ItemsPaciente } from '../../types'
import ModalContencion from '../../components/ModalContencion'
import { severidadDia, severidadNoche, SEVERIDAD_ESTILO } from '../../types/contenciones'

function TabItems({ ingresoId }: { ingresoId: string }) {
  const [data, setData] = useState<Partial<ItemsPaciente>>({})
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [saveError, setSaveError] = useState(false)
  const [verHistorico, setVerHistorico] = useState(false)
  const [modalContencion, setModalContencion] = useState(false)
  const [estadoContencion, setEstadoContencion] = useState<{ dia: string | null; noche: string[] | null } | 'cargando'>('cargando')

  function cargarContencion() {
    supabase.from('contenciones').select('dia, noche').eq('ingreso_id', ingresoId).maybeSingle()
      .then(({ data }) => setEstadoContencion(data ?? { dia: null, noche: null }))
  }

  useEffect(() => { cargarContencion() }, [ingresoId])

  useEffect(() => {
    supabase.from('items_paciente').select('*').eq('ingreso_id', ingresoId).single()
      .then(({ data: d }) => { if (d) setData(d) })
  }, [ingresoId])

  async function save() {
    setSaving(true)
    setSaveError(false)
    const { error } = await supabase.from('items_paciente').upsert({ ...data, ingreso_id: ingresoId })
    setSaving(false)
    if (error) {
      setSaveError(true)
      setTimeout(() => setSaveError(false), 4000)
      return
    }
    setSaved(true)
    setTimeout(() => setSaved(false), 2000)
  }

  const sel = (key: keyof ItemsPaciente, label: string, options: { v: string; l: string }[]) => (
    <div>
      <label className="label">{label}</label>
      <select className="input" value={(data[key] as string) ?? ''}
        onChange={e => setData(d => ({ ...d, [key]: e.target.value || null }))}>
        <option value="">—</option>
        {options.map(o => <option key={o.v} value={o.v}>{o.l}</option>)}
      </select>
    </div>
  )

  const bool = (key: keyof ItemsPaciente, label: string) => (
    <label className="flex items-center gap-2 text-sm cursor-pointer">
      <input type="checkbox" className="w-4 h-4 rounded text-primary-600"
        checked={!!(data[key])}
        onChange={e => setData(d => ({ ...d, [key]: e.target.checked }))} />
      {label}
    </label>
  )

  return (
    <div className="max-w-3xl space-y-6">
      <div className="card p-6 space-y-3">
        <p className="section-title">Seguridad y conducta</p>
        {estadoContencion === 'cargando' ? (
          <p className="text-sm text-slate-400">Cargando…</p>
        ) : (
          <div className="flex items-center gap-2">
            {(['dia', 'noche'] as const).map((eje) => {
              const sev = eje === 'dia' ? severidadDia(estadoContencion.dia as any) : severidadNoche(estadoContencion.noche as any)
              const estilo = SEVERIDAD_ESTILO[sev]
              return (
                <span key={eje} className={`px-2.5 py-1.5 rounded-lg text-xs font-medium border ${estilo.bg} ${estilo.text} ${estilo.border}`}>
                  {eje === 'dia' ? 'Día' : 'Noche'}: {estilo.label}
                </span>
              )
            })}
          </div>
        )}
        <button onClick={() => setModalContencion(true)} className="btn-secondary text-xs w-fit">
          Ver / editar contención
        </button>
        {modalContencion && (
          <ModalContencion
            ingresoId={ingresoId}
            onClose={() => setModalContencion(false)}
            onGuardado={cargarContencion}
          />
        )}
        <div>
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
                  onClick={() => setData(d => ({ ...d, alerta_conducta: activo ? actual.filter(x => x !== opt.v) : [...actual, opt.v] } as any))}
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
            onChange={e => setData(d => ({ ...d, objetos_calma: e.target.value }))} />
        </div>
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
              onChange={e => setData(d => ({ ...d, cabecero_grados: e.target.value }))} />
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
          {bool('sonda_vesical', 'Sonda vesical')}
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
          {bool('oxigenoterapia', 'Oxigenoterapia')}
          {bool('botella_noche', 'Botella noche')}
          {bool('timbre_habitacion', 'Timbre en habitación')}
          {bool('siestas', 'Siesta por la tarde')}
        </div>
      </div>

      <div className="card p-6 space-y-4">
        <p className="section-title">Observaciones</p>
        <textarea className="textarea" rows={3} placeholder="Notas libres…"
          value={(data.observaciones as string) ?? ''}
          onChange={e => setData(d => ({ ...d, observaciones: e.target.value }))} />
      </div>

      <div className="flex justify-between items-center">
        <button onClick={() => setVerHistorico(v => !v)} className="btn-secondary text-xs">
          {verHistorico ? 'Ocultar histórico' : 'Ver histórico de snapshots'}
        </button>
        <button onClick={save} disabled={saving} className="btn-primary">
          {saving ? 'Guardando…' : saveError ? '✗ Error al guardar' : saved ? '✓ Guardado' : 'Guardar cambios'}
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

  if (loading) return <div className="text-xs text-slate-400 py-4 text-center">Cargando histórico…</div>
  if (snapshots.length === 0) return (
    <div className="card p-6 text-center text-sm text-slate-400">
      No hay snapshots guardados. Usa el botón "Snapshot del día" en la Hoja de Ítems.
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
            <div className="p-6 text-xs text-slate-400 text-center">
              Selecciona una fecha para ver el snapshot
            </div>
          ) : (
            <div className="divide-y">
              {Object.entries(selected.datos ?? {})
                .filter(([k]) => !SKIP.has(k) && selected.datos[k] !== null && selected.datos[k] !== undefined)
                .map(([k, v]) => (
                  <div key={k} className="flex px-4 py-2 text-xs">
                    <span className="w-44 text-slate-400 shrink-0">{LABELS[k] ?? k}</span>
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
