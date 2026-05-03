import { useEffect, useState } from 'react'
import { supabase } from '../../lib/supabase'
import type { ItemsPaciente } from '../../types'

function TabItems({ ingresoId }: { ingresoId: string }) {
  const [data, setData] = useState<Partial<ItemsPaciente>>({})
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [verHistorico, setVerHistorico] = useState(false)

  useEffect(() => {
    supabase.from('items_paciente').select('*').eq('ingreso_id', ingresoId).single()
      .then(({ data: d }) => { if (d) setData(d) })
  }, [ingresoId])

  async function save() {
    setSaving(true)
    await supabase.from('items_paciente').upsert({ ...data, ingreso_id: ingresoId })
    setSaving(false)
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

  const SUJECION_OPTS = ['normal', 'una_barra', 'dos_barras', 'sujecion_fisica', 'sensor_presion', 'cota_cero']
  const SUJECION_LABELS: Record<string, string> = {
    normal: 'Normal', una_barra: 'Una barra', dos_barras: 'Dos barras',
    sujecion_fisica: 'Sujeción física', sensor_presion: 'Sensor de presión', cota_cero: 'Cota cero',
  }

  const multiSujecion = (key: 'sujecion_cama' | 'sujecion_silla_ruedas' | 'sujecion_sillon', label: string) => {
    const current: string[] = (data[key] as string[]) ?? []
    return (
      <div>
        <label className="label">{label}</label>
        <div className="flex flex-wrap gap-2">
          {SUJECION_OPTS.map(opt => {
            const active = current.includes(opt)
            return (
              <button key={opt} type="button"
                onClick={() => {
                  const next = active ? current.filter(x => x !== opt) : [...current, opt]
                  setData(d => ({ ...d, [key]: next }))
                }}
                className={`px-3 py-1.5 rounded-lg text-xs font-medium border transition-colors ${
                  active ? 'bg-primary-600 text-white border-primary-600' : 'bg-white text-slate-600 border-slate-300 hover:border-slate-400'
                }`}>
                {SUJECION_LABELS[opt]}
              </button>
            )
          })}
        </div>
      </div>
    )
  }

  return (
    <div className="max-w-3xl space-y-6">
      <div className="card p-6 space-y-4">
        <p className="section-title">Dependencia y cuidados</p>
        <div className="grid grid-cols-2 gap-4">
          {sel('dependencia_avd', 'Dependencia AVD', [{ v: '1', l: '1 persona' }, { v: '2', l: '2 personas' }])}
          {sel('higiene', 'Higiene', [{ v: 'lavabo', l: 'Lavabo' }, { v: 'cama', l: 'Cama' }])}
          {sel('ducha', 'Ducha', [{ v: 'pie', l: 'De pie' }, { v: 'sentado', l: 'Sentado' }])}
          {sel('ingestas', 'Ingestas', [{ v: 'autonomo', l: 'Autónomo' }, { v: 'dependiente', l: 'Dependiente' }])}
          <div>
            <label className="label">Vestido</label>
            <input className="input" value={(data.vestido as string) ?? ''}
              onChange={e => setData(d => ({ ...d, vestido: e.target.value }))} />
          </div>
        </div>
        <div className="flex flex-wrap gap-4 pt-1">
          {bool('banio', 'Baño')}
          {bool('siestas', 'Siestas')}
        </div>
      </div>

      <div className="card p-6 space-y-4">
        <p className="section-title">Continencia</p>
        <div className="grid grid-cols-2 gap-4">
          {sel('panial_dia', 'Pañal día', [{ v: 'ninguno', l: 'Ninguno' }, { v: 'BP', l: 'BP' }, { v: 'CA', l: 'CA' }])}
          {sel('panial_noche', 'Pañal noche', [
            { v: 'ninguno', l: 'Ninguno' }, { v: 'BP', l: 'BP' }, { v: 'CA', l: 'CA' }, { v: 'CA+malla', l: 'CA + malla' }
          ])}
        </div>
        <div className="flex flex-wrap gap-4">
          {bool('colector', 'Colector')}
          {bool('sonda_vesical', 'Sonda vesical')}
        </div>
      </div>

      <div className="card p-6 space-y-4">
        <p className="section-title">Prótesis</p>
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
        <p className="section-title">Movilidad</p>
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="label">Deambulación</label>
            <input className="input" value={(data.deambulacion as string) ?? ''}
              onChange={e => setData(d => ({ ...d, deambulacion: e.target.value }))} />
          </div>
          {sel('ayudas_deambulacion', 'Ayudas', [
            { v: 'ninguna', l: 'Ninguna' }, { v: 'baston', l: 'Bastón' },
            { v: 'andador_2r', l: 'Andador 2 ruedas' }, { v: 'andador_4r', l: 'Andador 4 ruedas' },
            { v: 'silla_ruedas', l: 'Silla de ruedas' },
          ])}
        </div>
        <div className="flex flex-wrap gap-4">
          {bool('bipedestador', 'Bipedestador')}
          {bool('grua', 'Grúa')}
          {bool('cambios_posturales', 'Cambios posturales')}
          {bool('cama_45', 'Cama 45°')}
        </div>
      </div>

      <div className="card p-6 space-y-4">
        <p className="section-title">Otros</p>
        <div className="flex flex-wrap gap-4">
          {bool('oxigenoterapia', 'Oxigenoterapia')}
          {bool('botella_noche', 'Botella noche')}
          {bool('colchon_antiescaras', 'Colchón antiescaras')}
          {bool('patucos_coderas', 'Patucos / coderas')}
          {bool('sensor_cama', 'Sensor cama')}
        </div>
      </div>

      <div className="card p-6 space-y-4">
        <p className="section-title">Contenciones</p>
        {multiSujecion('sujecion_cama', 'Sujeción cama')}
        <div>
          <label className="label">Sujeción silla de ruedas</label>
          <div className="flex gap-2">
            {(['no','si_precisa','continuo'] as const).map(opt=>{
              const labels={no:'No',si_precisa:'Sí precisa',continuo:'Continuo'}
              const active=(data as any).sujecion_silla_ruedas===opt
              return <button key={opt} type="button"
                onClick={()=>setData(d=>({...d,sujecion_silla_ruedas:active?undefined:opt}))}
                className={`px-3 py-1.5 rounded-lg text-xs font-medium border transition-colors ${active?'bg-primary-600 text-white border-primary-600':'bg-white text-slate-600 border-slate-300 hover:border-slate-400'}`}>
                {labels[opt]}
              </button>
            })}
          </div>
        </div>
        <div>
          <label className="label">Sujeción sillón</label>
          <div className="flex gap-2">
            {(['no','si_precisa','continuo'] as const).map(opt=>{
              const labels={no:'No',si_precisa:'Sí precisa',continuo:'Continuo'}
              const active=(data as any).sujecion_sillon===opt
              return <button key={opt} type="button"
                onClick={()=>setData(d=>({...d,sujecion_sillon:active?undefined:opt}))}
                className={`px-3 py-1.5 rounded-lg text-xs font-medium border transition-colors ${active?'bg-primary-600 text-white border-primary-600':'bg-white text-slate-600 border-slate-300 hover:border-slate-400'}`}>
                {labels[opt]}
              </button>
            })}
          </div>
        </div>
        <div>
          <label className="label">Observaciones</label>
          <textarea className="textarea" rows={3}
            value={(data.observaciones_sujeciones as string) ?? ''}
            onChange={e => setData(d => ({ ...d, observaciones_sujeciones: e.target.value }))} />
        </div>
      </div>

      <div className="flex justify-between items-center">
        <button onClick={() => setVerHistorico(v => !v)} className="btn-secondary text-xs">
          {verHistorico ? 'Ocultar histórico' : 'Ver histórico de snapshots'}
        </button>
        <button onClick={save} disabled={saving} className="btn-primary">
          {saving ? 'Guardando…' : saved ? '✓ Guardado' : 'Guardar cambios'}
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
    supabase.from('items_historico')
      .select('*')
      .eq('ingreso_id', ingresoId)
      .order('fecha', { ascending: false })
      .then(({ data }) => { setSnapshots(data ?? []); setLoading(false) })
  }, [ingresoId])

  const LABELS: Record<string, string> = {
    dependencia_avd: 'Dependencia AVD', panial_dia: 'Pañal día', panial_noche: 'Pañal noche',
    colector: 'Colector', sonda_vesical: 'Sonda vesical', dentadura: 'Dentadura',
    audifonos: 'Audífonos', gafas: 'Gafas', higiene: 'Higiene', vestido: 'Vestido',
    ducha: 'Ducha', banio: 'Baño', siestas: 'Siestas', deambulacion: 'Deambulación',
    ayudas_deambulacion: 'Ayudas deambulación', bipedestador: 'Bipedestador',
    grua: 'Grúa', cambios_posturales: 'Cambios posturales', cama_45: 'Cama 45°',
    ingestas: 'Ingestas', oxigenoterapia: 'Oxigenoterapia', botella_noche: 'Botella noche',
    colchon_antiescaras: 'Colchón antiescaras', patucos_coderas: 'Patucos/coderas',
    sensor_cama: 'Sensor cama', sujecion_cama: 'Sujeción cama',
    sujecion_silla_ruedas: 'Sujeción silla', sujecion_sillon: 'Sujeción sillón',
    observaciones_sujeciones: 'Observaciones sujeciones', semaforo_caidas: 'Semáforo caídas',
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
