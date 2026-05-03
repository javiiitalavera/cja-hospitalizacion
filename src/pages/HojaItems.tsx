import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import type { Ingreso, ItemsPaciente } from '../types'
import { Printer, X, Save, History } from 'lucide-react'

type IngresoConItems = Ingreso & { items: ItemsPaciente | null }

const SEMAFORO_COLOR: Record<string, string> = {
  verde:    '#92D050',
  amarillo: '#FFFF00',
  naranja:  '#FF9900',
  rojo:     '#FF0000',
}

function habBg(ingreso: IngresoConItems | null): string {
  if (!ingreso) return '#FFFFFF'
  const sem = ingreso.items?.semaforo_caidas as string | undefined
  if (sem && SEMAFORO_COLOR[sem]) return SEMAFORO_COLOR[sem]
  return '#FFFFFF'
}
function textColor(bg: string) { return bg === '#FF0000' ? '#FFFFFF' : '#000000' }

const SUJECION_SHORT: Record<string,string> = {
  normal:'—',una_barra:'1B',dos_barras:'2B',sujecion_fisica:'SF',sensor_presion:'SP',cota_cero:'C0',
}
const SUJECION_OPTS = ['normal','una_barra','dos_barras','sujecion_fisica','sensor_presion','cota_cero']
const SUJECION_LABELS: Record<string,string> = {
  normal:'Normal',una_barra:'1 barra',dos_barras:'2 barras',
  sujecion_fisica:'Sujeción física',sensor_presion:'Sensor presión',cota_cero:'Cota cero',
}

function sujecionStr(arr: string[]|null|undefined) {
  if (!arr||arr.length===0) return ''
  return arr.map(x=>SUJECION_SHORT[x]??x).join('+')
}

const FILAS = [
  {key:'nombre',      label:'NOMBRE',            get:(_:any,i:IngresoConItems)=>`${i.paciente?.primer_apellido??''} ${i.paciente?.nombre??''}`.trim()},
  {key:'medico',      label:'MÉDICO',             get:(_:any,i:IngresoConItems)=>i.medico_responsable?.nombre?.toUpperCase()??''},
  {key:'dep',         label:'dependiente',        get:(it:ItemsPaciente)=>it?.dependencia_avd?.toString()??''},
  {key:'panial_dia',  label:'pañal día',          get:(it:ItemsPaciente)=>it?.panial_dia??''},
  {key:'panial_noche',label:'pañal noche',        get:(it:ItemsPaciente)=>it?.panial_noche??''},
  {key:'dentadura',   label:'dentadura',          get:(it:ItemsPaciente)=>it?.dentadura??''},
  {key:'audifonos',   label:'audífonos',          get:(it:ItemsPaciente)=>it?.audifonos??''},
  {key:'gafas',       label:'gafas',              get:(it:ItemsPaciente)=>it?.gafas==='si'?'Sí':it?.gafas==='solo_tv'?'TV':''},
  {key:'higiene',     label:'higiene',            get:(it:ItemsPaciente)=>it?.higiene==='lavabo'?'L':it?.higiene==='cama'?'C':''},
  {key:'vestido',     label:'vestido',            get:(it:ItemsPaciente)=>it?.vestido??''},
  {key:'ducha',       label:'ducha',              get:(it:ItemsPaciente)=>it?.ducha==='pie'?'P':it?.ducha==='sentado'?'S':''},
  {key:'bipedestador',label:'bipedestador',       get:(it:ItemsPaciente)=>it?.bipedestador?'X':''},
  {key:'grua',        label:'grúa',               get:(it:ItemsPaciente)=>it?.grua?'X':''},
  {key:'antiescaras', label:'c. antiescaras',     get:(it:ItemsPaciente)=>it?.colchon_antiescaras?'X':''},
  {key:'patucos',     label:'patucos coderas',    get:(it:ItemsPaciente)=>it?.patucos_coderas?'X':''},
  {key:'suj_cama',    label:'sujeción cama',      get:(it:ItemsPaciente)=>sujecionStr(it?.sujecion_cama)},
  {key:'suj_silla',   label:'sujeción silla r.',  get:(it:ItemsPaciente)=>it?.sujecion_silla_ruedas==='si_precisa'?'S/P':it?.sujecion_silla_ruedas==='continuo'?'Cont':it?.sujecion_silla_ruedas==='no'?'No':''},
  {key:'suj_sillon',  label:'sujeción sillón',    get:(it:ItemsPaciente)=>it?.sujecion_sillon==='si_precisa'?'S/P':it?.sujecion_sillon==='continuo'?'Cont':it?.sujecion_sillon==='no'?'No':''},
  {key:'sensor',      label:'sensor cama',        get:(it:ItemsPaciente)=>it?.sensor_cama?'X':''},
  {key:'deambulacion',label:'deambulación',       get:(it:ItemsPaciente)=>it?.deambulacion??''},
  {key:'ayudas',      label:'ayudas deambulación',get:(it:ItemsPaciente)=>it?.ayudas_deambulacion?.replace('andador_2r','And.2r').replace('andador_4r','And.4r').replace('silla_ruedas','SR').replace('baston','Bast.')??''},
  {key:'oxigeno',     label:'oxigenoterapia',     get:(it:ItemsPaciente)=>it?.oxigenoterapia?'X':''},
  {key:'ingestas',    label:'ingestas',           get:(it:ItemsPaciente)=>it?.ingestas==='autonomo'?'A':it?.ingestas==='dependiente'?'D':''},
  {key:'banio',       label:'baño',               get:(it:ItemsPaciente)=>it?.banio?'X':''},
  {key:'siestas',     label:'siestas',            get:(it:ItemsPaciente)=>it?.siestas?'X':''},
  {key:'colector',    label:'colector',           get:(it:ItemsPaciente)=>it?.colector?'X':''},
  {key:'cama45',      label:'Cama 45º',           get:(it:ItemsPaciente)=>it?.cama_45?'X':''},
  {key:'sonda',       label:'Sonda vesical',      get:(it:ItemsPaciente)=>it?.sonda_vesical?'X':''},
  {key:'cambios',     label:'Cambios posturales', get:(it:ItemsPaciente)=>it?.cambios_posturales?'X':''},
  {key:'botella',     label:'Botella noche',      get:(it:ItemsPaciente)=>it?.botella_noche?'X':''},
]

const BOLD_ROWS = new Set(['nombre','medico'])
const LABEL_BOLD_ROWS = new Set(['nombre','medico','dep'])

// ─── TABLA HTML PURA PARA IMPRESIÓN ──────────────────────────

function buildPrintHTML(data: IngresoConItems[], today: string): string {
  const habs1_16   = data.filter(i=>i.habitacion&&i.habitacion<=16)
  const habs17_max = data.filter(i=>i.habitacion&&i.habitacion>16)
  const maxHab = Math.max(32, ...data.map(i=>i.habitacion??0))

  function buildBloque(habs: IngresoConItems[], offset: number, count: number): string {
    const slots: (IngresoConItems|null)[] = Array(count).fill(null)
    habs.forEach(i => {
      if (i.habitacion && i.habitacion > offset && i.habitacion <= offset+count)
        slots[i.habitacion-offset-1] = i
    })
    const habNums = Array.from({length:count},(_,i)=>i+1+offset)

    const labelPct = 9
    const colPct = ((100 - labelPct) / count).toFixed(3)

    let html = `<table style="width:100%;border-collapse:collapse;table-layout:fixed;font-size:8pt;font-family:Arial,sans-serif;margin:0;">`
    html += `<colgroup><col style="width:${labelPct}%"/>${habNums.map(()=>`<col style="width:${colPct}%"/>`).join('')}</colgroup>`

    // Header row - habitación números
    html += `<tr>`
    html += `<th style="border:1px solid #555;background:#ccc;text-align:left;padding:2px 3px;font-size:7pt;">HABITACIÓN</th>`
    for (const n of habNums) {
      const ing = slots[n-offset-1]
      const bg = habBg(ing)
      const color = textColor(bg)
      html += `<th style="border:1px solid #555;background:${bg};color:${color};text-align:center;padding:3px 1px;font-size:9pt;font-weight:bold;">${n}</th>`
    }
    html += `</tr>`

    // Data rows
    for (const fila of FILAS) {
      const isBoldLabel = LABEL_BOLD_ROWS.has(fila.key)
      const isBoldVal = BOLD_ROWS.has(fila.key)
      html += `<tr>`
      html += `<td style="border:1px solid #555;background:#e8e8e8;padding:2px 4px;font-weight:${isBoldLabel?700:500};white-space:nowrap;overflow:hidden;font-size:7.5pt;">${fila.label}</td>`
      for (const n of habNums) {
        const ing = slots[n-offset-1]
        const it = ing?.items ?? null
        const val = ing ? fila.get(it as any, ing as any) : ''
        const bg = habBg(ing)
        // Use a light tint for data cells
        const cellBg = ing ? (bg === '#FF0000' ? '#ffaaaa' : bg === '#FF9900' ? '#ffddaa' : bg === '#FFFF00' ? '#ffffaa' : bg === '#92D050' ? '#d4edaa' : '#ffffff') : '#ffffff'
        html += `<td style="border:1px solid #aaa;background:${cellBg};text-align:center;padding:2px 1px;font-weight:${isBoldVal?600:400};overflow:hidden;font-size:7.5pt;">${val||'&nbsp;'}</td>`
      }
      html += `</tr>`
    }
    html += `</table>`
    return html
  }

  const bloque1 = buildBloque(habs1_16, 0, 16)
  const bloque2 = buildBloque(habs17_max, 16, maxHab-16)

  return `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8"/>
<style>
  * { box-sizing: border-box; margin: 0; padding: 0; }
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body { font-family: Arial, sans-serif; background: white; }
  .page { width: 100%; padding: 4px 6px; }
  .page-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 3px; font-size: 8pt; }
  .page-header b { font-weight: bold; }
  @page { size: A4 landscape; margin: 0.3cm 0.4cm; }
  @media print {
    html, body { width: 100%; height: 100%; }
    .page { page-break-after: always; width: 100%; }
    .page:last-child { page-break-after: avoid; }
  }
</style>
</head>
<body>
  <div class="page">
    <div class="page-header">
      <b>CJA · HOJA DE ÍTEMS — Camas 1–16</b>
      <span style="text-transform:capitalize;">${today}</span>
    </div>
    ${bloque1}
  </div>
  <div class="page">
    <div class="page-header">
      <b>CJA · HOJA DE ÍTEMS — Camas 17–${maxHab}</b>
      <span style="text-transform:capitalize;">${today}</span>
    </div>
    ${bloque2}
  </div>
</body>
</html>`
}

function printHoja(data: IngresoConItems[], today: string) {
  const html = buildPrintHTML(data, today)
  const win = window.open('', '_blank', 'width=900,height=700')
  if (!win) return
  win.document.write(html)
  win.document.close()
  win.focus()
  setTimeout(() => {
    win.print()
    win.close()
  }, 400)
}

// ─── PANEL LATERAL DE EDICIÓN ─────────────────────────────────

function PanelEdicion({ ingreso, onClose, onSaved, onHabitacionChange }: {
  ingreso: IngresoConItems
  onClose: () => void
  onSaved: (updated: ItemsPaciente) => void
  onHabitacionChange: (ingresoId: string, nuevaHab: number) => void
}) {
  const [data, setData] = useState<Partial<ItemsPaciente>>(ingreso.items ?? {})
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const debounceRef = useRef<ReturnType<typeof setTimeout>|null>(null)
  const dataRef = useRef(data)
  dataRef.current = data

  const [confirmLimpiar, setConfirmLimpiar] = useState(false)
  const [habEdit, setHabEdit] = useState(ingreso.habitacion?.toString() ?? '')
  const [habError, setHabError] = useState('')
  const [savingHab, setSavingHab] = useState(false)

  async function cambiarHabitacion() {
    const n = parseInt(habEdit)
    if (!n || n < 1 || n > 33) { setHabError('Hab. inválida (1-33)'); return }
    if (n === ingreso.habitacion) { setHabError(''); return }
    setSavingHab(true)
    setHabError('')
    // Verificar que no está ocupada
    const { data: ocupada } = await supabase
      .from('ingresos')
      .select('id, paciente:pacientes(nombre, primer_apellido)')
      .eq('habitacion', n)
      .eq('estado', 'activo')
      .maybeSingle()
    if (ocupada) {
      const p = (ocupada as any).paciente
      setHabError(`Ocupada por ${p?.primer_apellido ?? '?'}, ${p?.nombre ?? '?'}`)
      setSavingHab(false)
      return
    }
    await supabase.from('ingresos').update({ habitacion: n }).eq('id', ingreso.id)
    onHabitacionChange(ingreso.id, n)
    setSavingHab(false)
  }

  async function save(d = dataRef.current) {
    setSaving(true)
    const { data: updated } = await supabase
      .from('items_paciente')
      .upsert({ ...d, ingreso_id: ingreso.id })
      .select()
      .single()
    setSaving(false)
    setSaved(true)
    if (updated) onSaved(updated as ItemsPaciente)
    setTimeout(() => setSaved(false), 2000)
  }

  async function limpiarItems() {
    if (debounceRef.current) clearTimeout(debounceRef.current)
    setSaving(true)
    const { data: updated } = await supabase
      .from('items_paciente')
      .upsert({ ingreso_id: ingreso.id })
      .select()
      .single()
    setSaving(false)
    setData({})
    setConfirmLimpiar(false)
    if (updated) onSaved(updated as ItemsPaciente)
  }

  function update(key: keyof ItemsPaciente, val: any) {
    const next = { ...dataRef.current, [key]: val }
    setData(next)
    if (debounceRef.current) clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(() => save(next), 1200)
  }

  const sel = (key: keyof ItemsPaciente, label: string, opts: {v:string,l:string}[]) => (
    <div key={key} className="flex items-center justify-between py-1.5 border-b border-slate-100 last:border-0">
      <span className="text-xs text-slate-600 w-32 shrink-0">{label}</span>
      <select className="text-xs border border-slate-200 rounded px-1.5 py-1 bg-white flex-1 max-w-[160px]"
        value={(data[key] as string) ?? ''}
        onChange={e => update(key, e.target.value || null)}>
        <option value="">—</option>
        {opts.map(o => <option key={o.v} value={o.v}>{o.l}</option>)}
      </select>
    </div>
  )

  const bool = (key: keyof ItemsPaciente, label: string) => (
    <label key={key} className="flex items-center justify-between py-1.5 border-b border-slate-100 last:border-0 cursor-pointer">
      <span className="text-xs text-slate-600">{label}</span>
      <input type="checkbox" className="w-4 h-4 rounded text-primary-600"
        checked={!!(data[key])}
        onChange={e => update(key, e.target.checked)} />
    </label>
  )

  const multiSuj = (key: 'sujecion_cama'|'sujecion_silla_ruedas'|'sujecion_sillon', label: string) => {
    const current: string[] = (data[key] as string[]) ?? []
    return (
      <div key={key} className="py-1.5 border-b border-slate-100">
        <span className="text-xs text-slate-600 block mb-1">{label}</span>
        <div className="flex flex-wrap gap-1">
          {SUJECION_OPTS.map(opt => {
            const active = current.includes(opt)
            return (
              <button key={opt} type="button"
                onClick={() => update(key, active ? current.filter(x=>x!==opt) : [...current,opt])}
                className={`px-2 py-0.5 rounded text-[10px] font-medium border transition-colors ${
                  active ? 'bg-primary-600 text-white border-primary-600' : 'bg-white text-slate-500 border-slate-300'
                }`}>
                {SUJECION_LABELS[opt]}
              </button>
            )
          })}
        </div>
      </div>
    )
  }

  const semaforo = (data as any).semaforo_caidas as string | undefined
  const nombre = `${ingreso.paciente?.primer_apellido ?? ''}, ${ingreso.paciente?.nombre ?? ''}`

  return (
    <div className="fixed inset-y-0 right-0 w-80 bg-white shadow-2xl border-l flex flex-col z-40">
      {/* Header */}
      <div className="px-4 py-3 border-b bg-slate-50 flex items-start justify-between">
        <div className="flex-1 min-w-0 mr-2">
          <p className="font-bold text-sm text-slate-800 truncate">{nombre}</p>
          <div className="flex items-center gap-1.5 mt-1">
            <span className="text-xs text-slate-400">Hab.</span>
            <input
              type="number" min={1} max={33}
              className="w-14 text-xs border border-slate-200 rounded px-1.5 py-0.5 text-slate-700 font-medium"
              value={habEdit}
              onChange={e => { setHabEdit(e.target.value); setHabError('') }}
              onBlur={cambiarHabitacion}
              onKeyDown={e => e.key === 'Enter' && cambiarHabitacion()}
            />
            {savingHab && <span className="text-xs text-slate-400">…</span>}
            {habError && <span className="text-xs text-red-500">{habError}</span>}
          </div>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-xs text-slate-400">
            {saving && '● Guardando…'}
            {!saving && saved && <span className="text-emerald-600">✓ Guardado</span>}
          </span>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600 ml-1">
            <X className="w-4 h-4" />
          </button>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto px-4 py-3">

        {/* Semáforo caídas */}
        <p className="section-title mt-1">Semáforo de caídas</p>
        <div className="flex gap-2 py-2 border-b border-slate-100 mb-1">
          {['verde','amarillo','naranja','rojo'].map(color => {
            const active = semaforo === color
            const bg = SEMAFORO_COLOR[color]
            const txtColor = color === 'rojo' ? '#fff' : '#000'
            return (
              <button key={color} type="button"
                onClick={() => update('semaforo_caidas' as keyof ItemsPaciente, active ? null : color)}
                className={`flex-1 py-1.5 rounded-lg text-xs font-semibold border-2 transition-all ${active ? 'border-slate-700 scale-105' : 'border-transparent opacity-70 hover:opacity-100'}`}
                style={{ backgroundColor: bg, color: txtColor }}>
                {color.charAt(0).toUpperCase() + color.slice(1)}
              </button>
            )
          })}
        </div>

        <p className="section-title mt-3">Dependencia y cuidados</p>
        {sel('dependencia_avd','Dependencia AVD',[{v:'1',l:'1 persona'},{v:'2',l:'2 personas'}])}
        {sel('higiene','Higiene',[{v:'lavabo',l:'Lavabo'},{v:'cama',l:'Cama'}])}
        {sel('ducha','Ducha',[{v:'pie',l:'De pie'},{v:'sentado',l:'Sentado'}])}
        {sel('ingestas','Ingestas',[{v:'autonomo',l:'Autónomo'},{v:'dependiente',l:'Dependiente'}])}
        <div className="flex items-center justify-between py-1.5 border-b border-slate-100">
          <span className="text-xs text-slate-600 w-32 shrink-0">Vestido</span>
          <input className="text-xs border border-slate-200 rounded px-1.5 py-1 flex-1 max-w-[160px]"
            value={(data.vestido as string)??''}
            onChange={e=>update('vestido',e.target.value)} />
        </div>
        <div className="flex gap-6 py-1.5 border-b border-slate-100">
          {bool('banio','Baño')}
          {bool('siestas','Siestas')}
        </div>

        <p className="section-title mt-3">Continencia</p>
        {sel('panial_dia','Pañal día',[{v:'ninguno',l:'Ninguno'},{v:'BP',l:'BP'},{v:'CA',l:'CA'}])}
        {sel('panial_noche','Pañal noche',[{v:'ninguno',l:'Ninguno'},{v:'BP',l:'BP'},{v:'CA',l:'CA'},{v:'CA+malla',l:'CA+malla'}])}
        {bool('colector','Colector')}
        {bool('sonda_vesical','Sonda vesical')}

        <p className="section-title mt-3">Prótesis</p>
        {sel('dentadura','Dentadura',[
          {v:'ninguna',l:'Ninguna'},{v:'superior',l:'Superior'},{v:'inferior',l:'Inferior'},
          {v:'completa',l:'Completa'},{v:'fija',l:'Fija'},{v:'puente',l:'Puente'},
        ])}
        {sel('audifonos','Audífonos',[
          {v:'ninguno',l:'Ninguno'},{v:'derecho',l:'Derecho'},{v:'izquierdo',l:'Izquierdo'},{v:'ambos',l:'Ambos'},
        ])}
        {sel('gafas','Gafas',[{v:'no',l:'No'},{v:'si',l:'Sí'},{v:'solo_tv',l:'Solo TV'}])}

        <p className="section-title mt-3">Movilidad</p>
        <div className="flex items-center justify-between py-1.5 border-b border-slate-100">
          <span className="text-xs text-slate-600 w-32 shrink-0">Deambulación</span>
          <input className="text-xs border border-slate-200 rounded px-1.5 py-1 flex-1 max-w-[160px]"
            value={(data.deambulacion as string)??''}
            onChange={e=>update('deambulacion',e.target.value)} />
        </div>
        {sel('ayudas_deambulacion','Ayudas',[
          {v:'ninguna',l:'Ninguna'},{v:'baston',l:'Bastón'},{v:'andador_2r',l:'Andador 2r'},
          {v:'andador_4r',l:'Andador 4r'},{v:'silla_ruedas',l:'Silla ruedas'},
        ])}
        {bool('bipedestador','Bipedestador')}
        {bool('grua','Grúa')}
        {bool('cambios_posturales','Cambios posturales')}
        {bool('cama_45','Cama 45°')}

        <p className="section-title mt-3">Otros</p>
        {bool('oxigenoterapia','Oxigenoterapia')}
        {bool('botella_noche','Botella noche')}
        {bool('colchon_antiescaras','Colchón antiescaras')}
        {bool('patucos_coderas','Patucos / coderas')}
        {bool('sensor_cama','Sensor cama')}

        <p className="section-title mt-3">Contenciones</p>
        {multiSuj('sujecion_cama','Sujeción cama')}
        <div className="py-1.5 border-b border-slate-100">
          <span className="text-xs text-slate-600 block mb-1">Sujeción silla ruedas</span>
          <div className="flex gap-2">
            {(['no','si_precisa','continuo'] as const).map(opt=>{
              const labels={'no':'No','si_precisa':'Sí precisa','continuo':'Continuo'}
              const active=(data as any).sujecion_silla_ruedas===opt
              return <button key={opt} type="button"
                onClick={()=>update('sujecion_silla_ruedas' as any, active?null:opt)}
                className={`px-2 py-1 rounded text-[10px] font-medium border transition-colors ${active?'bg-primary-600 text-white border-primary-600':'bg-white text-slate-500 border-slate-300'}`}>
                {labels[opt]}
              </button>
            })}
          </div>
        </div>
        <div className="py-1.5 border-b border-slate-100">
          <span className="text-xs text-slate-600 block mb-1">Sujeción sillón</span>
          <div className="flex gap-2">
            {(['no','si_precisa','continuo'] as const).map(opt=>{
              const labels={'no':'No','si_precisa':'Sí precisa','continuo':'Continuo'}
              const active=(data as any).sujecion_sillon===opt
              return <button key={opt} type="button"
                onClick={()=>update('sujecion_sillon' as any, active?null:opt)}
                className={`px-2 py-1 rounded text-[10px] font-medium border transition-colors ${active?'bg-primary-600 text-white border-primary-600':'bg-white text-slate-500 border-slate-300'}`}>
                {labels[opt]}
              </button>
            })}
          </div>
        </div>
        <div className="py-1.5">
          <span className="text-xs text-slate-600 block mb-1">Observaciones</span>
          <textarea className="textarea text-xs" rows={2}
            value={(data.observaciones_sujeciones as string)??''}
            onChange={e=>update('observaciones_sujeciones',e.target.value)} />
        </div>
      </div>

      <div className="px-4 py-3 border-t space-y-2">
        <button onClick={()=>save()} className="btn-primary w-full justify-center">
          <Save className="w-3.5 h-3.5" />
          Guardar ahora
        </button>
        {!confirmLimpiar ? (
          <button onClick={()=>setConfirmLimpiar(true)}
            className="w-full text-xs text-slate-400 hover:text-red-500 transition-colors py-1 text-center">
            Borrar todos los ítems
          </button>
        ) : (
          <div className="flex gap-2">
            <button onClick={()=>setConfirmLimpiar(false)} className="btn-secondary flex-1 text-xs py-1.5">
              Cancelar
            </button>
            <button onClick={limpiarItems} className="btn-danger flex-1 text-xs py-1.5">
              Confirmar borrado
            </button>
          </div>
        )}
      </div>
    </div>
  )
}

// Convierte items_historico al mismo formato que IngresoConItems
function snapshotToIngresos(snaps: any[]): IngresoConItems[] {
  return snaps.map(s => ({
    id: s.ingreso_id,
    habitacion: s.ingreso?.habitacion ?? null,
    estado: 'activo' as const,
    fecha_ingreso: '',
    paciente_id: '',
    paciente: s.ingreso?.paciente ?? null,
    medico_responsable: s.ingreso?.medico_responsable ?? null,
    items: s.datos as ItemsPaciente,
    created_at: '',
  }))
}

// ─── TABLA EN PANTALLA ────────────────────────────────────────

function Bloque({ habs, offset, count=16, onSelect, onSelectVacia, selectedId, readOnly=false }: {
  habs: IngresoConItems[]
  offset: number
  count?: number
  onSelect: (i: IngresoConItems) => void
  onSelectVacia?: (n: number) => void
  selectedId: string | null
  readOnly?: boolean
}) {
  const slots: (IngresoConItems|null)[] = Array(count).fill(null)
  habs.forEach(i => {
    if (i.habitacion && i.habitacion > offset && i.habitacion <= offset+count)
      slots[i.habitacion-offset-1] = i
  })
  const habNums = Array.from({length:count},(_,i)=>i+1+offset)
  const cellCls = 'border border-slate-400 text-center text-[7.5pt] leading-tight px-0.5 py-0'
  const labelCls = 'border border-slate-400 text-left text-[7.5pt] leading-tight px-1 py-0 font-medium bg-slate-100 whitespace-nowrap'

  return (
    <table className="w-full border-collapse table-fixed" style={{fontSize:'7.5pt'}}>
      <colgroup>
        <col style={{width:'80px'}}/>
        {habNums.map(n=><col key={n} style={{width:`${100/count}%`}}/>)}
      </colgroup>
      <thead>
        <tr>
          <th className="border border-slate-400 bg-slate-200 text-[7.5pt] text-left px-1 py-0.5 font-bold">HABITACIÓN</th>
          {habNums.map(n=>{
            const ing = slots[n-offset-1]
            const bg = habBg(ing)
            const color = textColor(bg)
            return (
              <th key={n}
                className={`border border-slate-400 text-[8pt] font-bold text-center py-0.5 ${!ing && !readOnly ? 'cursor-pointer hover:bg-primary-50' : ''}`}
                style={{backgroundColor:bg,color}}
                onClick={()=>{ if(!ing && !readOnly && onSelectVacia) onSelectVacia(n) }}
                title={!ing && !readOnly ? `Ingresar en habitación ${n}` : undefined}
              >{n}</th>
            )
          })}
        </tr>
      </thead>
      <tbody>
        {FILAS.map(fila=>(
          <tr key={fila.key}>
            <td className={labelCls} style={{fontWeight:LABEL_BOLD_ROWS.has(fila.key)?700:500}}>
              {fila.label}
            </td>
            {habNums.map(n=>{
              const idx=n-offset-1
              const ingreso=slots[idx]
              const it=ingreso?.items??null
              const val=ingreso?fila.get(it as any,ingreso as any):''
              const bg=habBg(ingreso)
              const cellBg = ingreso
                ? (bg==='#FF0000'?'#ffcccc':bg==='#FF9900'?'#ffe5cc':bg==='#FFFF00'?'#ffffcc':bg==='#92D050'?'#e2f5cc':'#fff')
                : '#fff'
              const color=ingreso?textColor(bg):'#000'
              const isSelected=ingreso?.id===selectedId
              return (
                <td key={n} className={`${cellCls} ${ingreso&&!readOnly?'cursor-pointer hover:brightness-95':!ingreso&&!readOnly?'cursor-pointer hover:bg-primary-50/40':''} ${isSelected?'ring-2 ring-inset ring-primary-500':''}`}
                  style={{backgroundColor:cellBg,color,fontWeight:BOLD_ROWS.has(fila.key)?600:400}}
                  onClick={()=>{ if(ingreso&&!readOnly) onSelect(ingreso); else if(!ingreso&&!readOnly&&onSelectVacia&&fila.key==='nombre') onSelectVacia(n) }}>
                  {val||'\u00a0'}
                </td>
              )
            })}
          </tr>
        ))}
      </tbody>
    </table>
  )
}

// ─── PÁGINA PRINCIPAL ─────────────────────────────────────────

export default function HojaItems() {
  const navigate = useNavigate()
  const [data, setData] = useState<IngresoConItems[]>([])
  const [loading, setLoading] = useState(true)
  const [selected, setSelected] = useState<IngresoConItems|null>(null)

  const today = new Date().toLocaleDateString('es-ES',{weekday:'long',day:'numeric',month:'long',year:'numeric'})

  const [verHistorico, setVerHistorico] = useState(false)
  const [fechasSnapshot, setFechasSnapshot] = useState<string[]>([])
  const [fechaSeleccionada, setFechaSeleccionada] = useState<string>('')
  const [snapshotData, setSnapshotData] = useState<any[]>([])
  const [loadingSnapshot, setLoadingSnapshot] = useState(false)
  const [modoHistorico, setModoHistorico] = useState<'fecha'|'paciente'>('fecha')
  const [busquedaPaciente, setBusquedaPaciente] = useState('')
  const [pacienteResultados, setPacienteResultados] = useState<any[]>([])
  const [pacienteSeleccionadoHist, setPacienteSeleccionadoHist] = useState<any>(null)
  const [historialPaciente, setHistorialPaciente] = useState<any[]>([])
  const [loadingHistorial, setLoadingHistorial] = useState(false)

  async function fetchFechas() {
    // Solo necesitamos saber si hay datos y la fecha más reciente
    const { data } = await supabase
      .from('items_historico')
      .select('fecha')
      .order('fecha', { ascending: false })
      .limit(1)
    if (data && data.length > 0) {
      setFechasSnapshot([data[0].fecha])
      if (!fechaSeleccionada) setFechaSeleccionada(data[0].fecha)
    }
  }

  async function buscarPaciente(q: string) {
    if (q.trim().length < 2) { setPacienteResultados([]); return }
    const { data } = await supabase
      .from('pacientes')
      .select('id, nombre, primer_apellido, segundo_apellido')
      .or(`primer_apellido.ilike.%${q}%,nombre.ilike.%${q}%`)
      .order('primer_apellido')
      .limit(8)
    setPacienteResultados(data ?? [])
  }

  async function cargarHistorialPaciente(paciente: any) {
    setLoadingHistorial(true)
    setPacienteSeleccionadoHist(paciente)
    setPacienteResultados([])
    setBusquedaPaciente(`${paciente.primer_apellido}, ${paciente.nombre}`)
    // Buscar todos los ingresos del paciente que tengan histórico
    const { data: ings } = await supabase
      .from('ingresos')
      .select('id, habitacion, fecha_ingreso, fecha_alta, estado')
      .eq('paciente_id', paciente.id)
      .order('fecha_ingreso', { ascending: false })
    const ingresoIds = (ings ?? []).map((i: any) => i.id)
    if (ingresoIds.length === 0) { setHistorialPaciente([]); setLoadingHistorial(false); return }
    const { data: hist } = await supabase
      .from('items_historico')
      .select('fecha, datos, ingreso_id')
      .in('ingreso_id', ingresoIds)
      .order('fecha', { ascending: false })
    // Enriquecer con datos del ingreso
    const ingresoMap = Object.fromEntries((ings ?? []).map((i: any) => [i.id, i]))
    setHistorialPaciente((hist ?? []).map((h: any) => ({
      ...h,
      ingreso: ingresoMap[h.ingreso_id],
    })))
    setLoadingHistorial(false)
  }

  async function cargarSnapshot(fecha: string) {
    setLoadingSnapshot(true)
    setFechaSeleccionada(fecha)
    const { data: snaps } = await supabase
      .from('items_historico')
      .select('*, ingreso:ingresos(habitacion, paciente:pacientes(nombre, primer_apellido), medico_responsable:profesionales(nombre))')
      .eq('fecha', fecha)
      .order('ingreso(habitacion)', { ascending: true })
    setSnapshotData(snaps ?? [])
    setLoadingSnapshot(false)
  }

  async function fetchData() {
    const {data:ingresos} = await supabase
      .from('ingresos')
      .select('*, paciente:pacientes(nombre,primer_apellido), medico_responsable:profesionales(nombre), items:items_paciente(*)')
      .eq('estado','activo')
      .order('habitacion',{ascending:true})
    setData((ingresos??[]).map(i=>({
      ...i,
      items:Array.isArray(i.items)?(i.items[0]??null):(i.items??null),
    })) as IngresoConItems[])
    setLoading(false)
  }

  useEffect(()=>{fetchData(); fetchFechas()},[])

  function handleSaved(ingresoId: string, updated: ItemsPaciente) {
    setData(prev => prev.map(i => i.id===ingresoId ? {...i,items:updated} : i))
    setSelected(prev => prev?.id===ingresoId ? {...prev,items:updated} : prev)
  }

  function handleHabitacionChange(ingresoId: string, nuevaHab: number) {
    setData(prev => prev.map(i => i.id===ingresoId ? {...i, habitacion:nuevaHab} : i))
    setSelected(prev => prev?.id===ingresoId ? {...prev, habitacion:nuevaHab} : prev)
  }

  const habs1_16   = data.filter(i=>i.habitacion&&i.habitacion<=16)
  const habs17_max = data.filter(i=>i.habitacion&&i.habitacion>16)
  const maxHab = Math.max(32, ...data.map(i=>i.habitacion??0))

  if(loading) return <div className="p-8 text-slate-400">Cargando…</div>

  return (
    <div className={`p-4 transition-all duration-200 ${selected?'mr-80':''}`}>
      <div className="flex items-center justify-between mb-4">
        <div>
          <h1 className="text-xl font-bold text-slate-800">Hoja de ítems</h1>
          <p className="text-sm text-slate-400 capitalize">{today}</p>
          {!selected && <p className="text-xs text-slate-400 mt-0.5">Click en un paciente para editar sus ítems</p>}
        </div>
        <div className="flex items-center gap-3">
          {/* Leyenda semáforo */}
          <div className="flex items-center gap-2 text-xs text-slate-500">
            {['verde','amarillo','naranja','rojo'].map(c=>(
              <span key={c} className="flex items-center gap-1">
                <span className="w-3 h-3 rounded-full inline-block border border-slate-300" style={{backgroundColor:SEMAFORO_COLOR[c]}}/>
                {c}
              </span>
            ))}
          </div>
          <button onClick={()=>{ setVerHistorico(v=>!v); if(!verHistorico&&fechasSnapshot.length>0) cargarSnapshot(fechasSnapshot[0]) }}
            className={`btn-secondary ${verHistorico?'bg-slate-100':''}`}>
            <History className="w-4 h-4"/>
            {verHistorico ? 'Ver hoy' : 'Histórico'}
          </button>
          <button onClick={()=>printHoja(data,today)} className="btn-secondary">
            <Printer className="w-4 h-4"/>
            Imprimir
          </button>
        </div>
      </div>

      {/* Vista histórico */}
      {verHistorico ? (
        <div className="space-y-4">
          {/* Selector de modo */}
          <div className="flex gap-2">
            <button onClick={()=>setModoHistorico('fecha')}
              className={`px-4 py-2 rounded-lg text-sm font-medium border transition-colors ${modoHistorico==='fecha'?'bg-primary-600 text-white border-primary-600':'bg-white text-slate-600 border-slate-300 hover:bg-slate-50'}`}>
              Por fecha
            </button>
            <button onClick={()=>setModoHistorico('paciente')}
              className={`px-4 py-2 rounded-lg text-sm font-medium border transition-colors ${modoHistorico==='paciente'?'bg-primary-600 text-white border-primary-600':'bg-white text-slate-600 border-slate-300 hover:bg-slate-50'}`}>
              Por paciente
            </button>
          </div>

          {/* MODO FECHA */}
          {modoHistorico === 'fecha' && (
            fechasSnapshot.length === 0 ? (
              <div className="card p-10 text-center text-slate-400 text-sm">No hay snapshots guardados aún.</div>
            ) : (
              <>
                <div className="flex items-center gap-3">
                  <input type="date"
                    className="input max-w-[200px]"
                    value={fechaSeleccionada}
                    max={fechasSnapshot[0]}
                    onChange={e => { if(e.target.value) cargarSnapshot(e.target.value) }}
                  />
                  <span className="text-sm text-slate-400">
                    {fechaSeleccionada && new Date(fechaSeleccionada).toLocaleDateString('es-ES',{weekday:'long',day:'numeric',month:'long',year:'numeric'})}
                  </span>
                  {snapshotData.length > 0 && (
                    <button
                      onClick={()=>{
                        const fechaLabel = new Date(fechaSeleccionada).toLocaleDateString('es-ES',{weekday:'long',day:'numeric',month:'long',year:'numeric'})
                        printHoja(snapshotToIngresos(snapshotData), fechaLabel)
                      }}
                      className="btn-secondary ml-auto">
                      <Printer className="w-4 h-4"/>
                      Imprimir
                    </button>
                  )}
                </div>
                {loadingSnapshot ? (
                  <div className="text-slate-400 text-sm py-8 text-center">Cargando…</div>
                ) : snapshotData.length === 0 ? (
                  <div className="card p-8 text-center text-slate-400 text-sm">Sin datos para esta fecha.</div>
                ) : (
                  <>
                    {(()=>{
                      const converted = snapshotToIngresos(snapshotData)
                      const habs1 = converted.filter(i=>i.habitacion&&i.habitacion<=16)
                      const habs2 = converted.filter(i=>i.habitacion&&i.habitacion>16)
                      return (
                        <>
                          <Bloque habs={habs1} offset={0} count={16} onSelect={()=>{}} selectedId={null} readOnly/>
                          {habs2.length>0 && <Bloque habs={habs2} offset={16} count={Math.max(16,...converted.map(i=>i.habitacion??0))-16} onSelect={()=>{}} selectedId={null} readOnly/>}
                        </>
                      )
                    })()}
                  </>
                )}
              </>
            )
          )}

          {/* MODO PACIENTE */}
          {modoHistorico === 'paciente' && (
            <div className="space-y-4">
              {/* Buscador */}
              <div className="relative max-w-sm">
                <input className="input pr-8" placeholder="Buscar por apellido…"
                  value={busquedaPaciente}
                  onChange={e => { setBusquedaPaciente(e.target.value); buscarPaciente(e.target.value) }}
                />
                {pacienteResultados.length > 0 && (
                  <div className="absolute top-full left-0 right-0 mt-1 bg-white border rounded-xl shadow-lg z-20 overflow-hidden">
                    {pacienteResultados.map((p:any) => (
                      <button key={p.id}
                        onClick={()=>cargarHistorialPaciente(p)}
                        className="w-full text-left px-4 py-2.5 text-sm hover:bg-slate-50 border-b last:border-0">
                        {p.primer_apellido}, {p.nombre}
                      </button>
                    ))}
                  </div>
                )}
              </div>

              {/* Historial del paciente */}
              {pacienteSeleccionadoHist && (
                loadingHistorial ? (
                  <div className="text-slate-400 text-sm py-8 text-center">Cargando historial…</div>
                ) : historialPaciente.length === 0 ? (
                  <div className="card p-8 text-center text-slate-400 text-sm">
                    Sin histórico de ítems para {pacienteSeleccionadoHist.primer_apellido}, {pacienteSeleccionadoHist.nombre}.
                  </div>
                ) : (
                  <div className="space-y-3">
                    <p className="text-sm font-semibold text-slate-700">
                      {pacienteSeleccionadoHist.primer_apellido}, {pacienteSeleccionadoHist.nombre}
                      <span className="font-normal text-slate-400 ml-2">· {historialPaciente.length} registros</span>
                    </p>
                    <div className="card overflow-hidden">
                      <table className="w-full text-xs">
                        <thead>
                          <tr className="border-b bg-slate-50">
                            <th className="px-3 py-2 text-left font-semibold text-slate-500">Fecha</th>
                            <th className="px-3 py-2 text-left font-semibold text-slate-500">Hab.</th>
                            <th className="px-3 py-2 text-left font-semibold text-slate-500">Riesgo caída</th>
                            <th className="px-3 py-2 text-left font-semibold text-slate-500">Dependencia</th>
                            <th className="px-3 py-2 text-left font-semibold text-slate-500">Ingestas</th>
                            <th className="px-3 py-2 text-left font-semibold text-slate-500">Higiene</th>
                            <th className="px-3 py-2 text-left font-semibold text-slate-500">Sujeción cama</th>
                            <th className="px-3 py-2 text-left font-semibold text-slate-500">Deambulación</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y">
                          {historialPaciente.map((h:any, idx:number) => {
                            const it = h.datos ?? {}
                            const sem = it.semaforo_caidas
                            const semBg = sem ? SEMAFORO_COLOR[sem] : null
                            const semTxt = sem === 'rojo' ? '#fff' : '#000'
                            const sujCama = Array.isArray(it.sujecion_cama) && it.sujecion_cama.length > 0
                              ? it.sujecion_cama.map((x:string) => SUJECION_SHORT[x]??x).join('+') : '—'
                            // Detectar cambios respecto al día anterior
                            const prev = historialPaciente[idx+1]?.datos ?? {}
                            const changed = (key: string) => JSON.stringify(it[key]) !== JSON.stringify(prev[key])
                            const cellCls = (key: string) => changed(key) && idx < historialPaciente.length-1
                              ? 'px-3 py-2 font-semibold text-primary-700' : 'px-3 py-2 text-slate-600'
                            return (
                              <tr key={`${h.ingreso_id}-${h.fecha}`} className="hover:bg-slate-50">
                                <td className="px-3 py-2 font-medium text-slate-800 whitespace-nowrap">
                                  {new Date(h.fecha).toLocaleDateString('es-ES',{day:'numeric',month:'short',year:'numeric'})}
                                </td>
                                <td className="px-3 py-2 text-slate-500">{h.ingreso?.habitacion ?? '—'}</td>
                                <td className="px-3 py-2">
                                  {sem ? (
                                    <span className="px-2 py-0.5 rounded-full text-xs font-medium capitalize"
                                      style={{backgroundColor: semBg!, color: semTxt}}>
                                      {sem}
                                    </span>
                                  ) : '—'}
                                </td>
                                <td className={cellCls('dependencia_avd')}>{it.dependencia_avd ?? '—'}</td>
                                <td className={cellCls('ingestas')}>{it.ingestas === 'autonomo' ? 'Autónomo' : it.ingestas === 'dependiente' ? 'Dependiente' : '—'}</td>
                                <td className={cellCls('higiene')}>{it.higiene === 'lavabo' ? 'Lavabo' : it.higiene === 'cama' ? 'Cama' : '—'}</td>
                                <td className={cellCls('sujecion_cama')}>{sujCama}</td>
                                <td className={cellCls('deambulacion')}>{it.deambulacion ?? '—'}</td>
                              </tr>
                            )
                          })}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )
              )}
            </div>
          )}
        </div>
      ) : (
        <>
          <div className="mb-4">
            <Bloque habs={habs1_16} offset={0} count={16} onSelect={setSelected} onSelectVacia={n=>navigate(`/pacientes/nuevo?habitacion=${n}`)} selectedId={selected?.id??null}/>
          </div>
          <div className="my-3 border-t-2 border-slate-400"/>
          <div className="mb-4">
            <Bloque habs={habs17_max} offset={16} count={maxHab-16} onSelect={setSelected} onSelectVacia={n=>navigate(`/pacientes/nuevo?habitacion=${n}`)} selectedId={selected?.id??null}/>
          </div>
        </>
      )}

      {selected&&(
        <PanelEdicion
          ingreso={selected}
          onClose={()=>setSelected(null)}
          onSaved={(updated)=>handleSaved(selected.id,updated)}
          onHabitacionChange={handleHabitacionChange}
        />
      )}
    </div>
  )
}
