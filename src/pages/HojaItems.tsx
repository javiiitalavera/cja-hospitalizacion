import { useEffect, useRef, useState } from 'react'
import { supabase } from '../lib/supabase'
import type { Ingreso, ItemsPaciente } from '../types'
import { Printer, X, Save } from 'lucide-react'

type IngresoConItems = Ingreso & { items: ItemsPaciente | null }

const HAB_COLORS: Record<number, string> = {
  1:'#92D050',2:'#FF0000',3:'#FF9900',4:'#FFFF00',5:'#92D050',6:'#92D050',7:'#92D050',8:'#FFFFFF',
  9:'#FF9900',10:'#FF9900',11:'#92D050',12:'#92D050',13:'#92D050',14:'#FFFF00',15:'#92D050',16:'#FFFF00',
  17:'#92D050',18:'#92D050',19:'#FF9900',20:'#FFFF00',21:'#FF9900',22:'#FFFF00',23:'#FFFF00',24:'#FFFF00',
  25:'#FF9900',26:'#92D050',27:'#FFFF00',28:'#92D050',29:'#FF9900',30:'#92D050',31:'#92D050',32:'#FF9900',
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
  {key:'suj_silla',   label:'sujeción silla r.',  get:(it:ItemsPaciente)=>sujecionStr(it?.sujecion_silla_ruedas)},
  {key:'suj_sillon',  label:'sujeción sillón',    get:(it:ItemsPaciente)=>sujecionStr(it?.sujecion_sillon)},
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

// ─── PANEL LATERAL DE EDICIÓN ─────────────────────────────────

function PanelEdicion({ ingreso, onClose, onSaved }: {
  ingreso: IngresoConItems
  onClose: () => void
  onSaved: (updated: ItemsPaciente) => void
}) {
  const [data, setData] = useState<Partial<ItemsPaciente>>(ingreso.items ?? {})
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const debounceRef = useRef<ReturnType<typeof setTimeout>|null>(null)
  const dataRef = useRef(data)
  dataRef.current = data

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

  const nombre = `${ingreso.paciente?.primer_apellido ?? ''}, ${ingreso.paciente?.nombre ?? ''}`

  return (
    <div className="fixed inset-y-0 right-0 w-80 bg-white shadow-2xl border-l flex flex-col z-40 print:hidden">
      {/* Header */}
      <div className="px-4 py-3 border-b bg-slate-50 flex items-start justify-between">
        <div>
          <p className="font-bold text-sm text-slate-800">{nombre}</p>
          <p className="text-xs text-slate-400">Hab. {ingreso.habitacion} · Ítems</p>
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

      {/* Campos */}
      <div className="flex-1 overflow-y-auto px-4 py-3 space-y-0">

        <p className="section-title mt-1">Dependencia y cuidados</p>
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
        <div className="flex gap-4 py-1.5 border-b border-slate-100">
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
        {multiSuj('sujecion_silla_ruedas','Sujeción silla ruedas')}
        {multiSuj('sujecion_sillon','Sujeción sillón')}
        <div className="py-1.5">
          <span className="text-xs text-slate-600 block mb-1">Observaciones</span>
          <textarea className="textarea text-xs" rows={2}
            value={(data.observaciones_sujeciones as string)??''}
            onChange={e=>update('observaciones_sujeciones',e.target.value)} />
        </div>
      </div>

      {/* Footer */}
      <div className="px-4 py-3 border-t">
        <button onClick={()=>save()} className="btn-primary w-full justify-center">
          <Save className="w-3.5 h-3.5" />
          Guardar ahora
        </button>
      </div>
    </div>
  )
}

// ─── BLOQUE DE TABLA ──────────────────────────────────────────

function Bloque({ habs, offset, onSelect, selectedId }: {
  habs: IngresoConItems[]
  offset: number
  onSelect: (i: IngresoConItems) => void
  selectedId: string | null
}) {
  const slots: (IngresoConItems|null)[] = Array(16).fill(null)
  habs.forEach(i => {
    if (i.habitacion && i.habitacion > offset && i.habitacion <= offset+16)
      slots[i.habitacion-offset-1] = i
  })
  const habNums = Array.from({length:16},(_,i)=>i+1+offset)
  const cellCls = 'border border-slate-400 text-center text-[7.5pt] leading-tight px-0.5 py-0'
  const labelCls = 'border border-slate-400 text-left text-[7.5pt] leading-tight px-1 py-0 font-medium bg-slate-100 whitespace-nowrap'

  return (
    <table className="w-full border-collapse table-fixed" style={{fontSize:'7.5pt'}}>
      <colgroup>
        <col style={{width:'80px'}}/>
        {habNums.map(n=><col key={n} style={{width:`${100/16}%`}}/>)}
      </colgroup>
      <thead>
        <tr>
          <th className="border border-slate-400 bg-slate-200 text-[7.5pt] text-left px-1 py-0.5 font-bold">HABITACIÓN</th>
          {habNums.map(n=>{
            const bg=HAB_COLORS[n]??'#FFFFFF'
            const color=textColor(bg)
            return (
              <th key={n} className="border border-slate-400 text-[8pt] font-bold text-center py-0.5"
                style={{backgroundColor:bg,color}}>{n}</th>
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
              const bg=ingreso?(HAB_COLORS[n]??'#FFFFFF'):'#FFFFFF'
              const color=ingreso?textColor(bg):'#000000'
              const isSelected=ingreso?.id===selectedId
              return (
                <td key={n} className={`${cellCls} ${ingreso?'cursor-pointer hover:brightness-95':''} ${isSelected?'ring-2 ring-inset ring-primary-500':''}`}
                  style={{
                    backgroundColor:ingreso?`${bg}44`:'#FFFFFF',
                    color,
                    fontWeight:BOLD_ROWS.has(fila.key)?600:400,
                  }}
                  onClick={()=>ingreso&&onSelect(ingreso)}>
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
  const [data, setData] = useState<IngresoConItems[]>([])
  const [loading, setLoading] = useState(true)
  const [selected, setSelected] = useState<IngresoConItems|null>(null)

  const today = new Date().toLocaleDateString('es-ES',{weekday:'long',day:'numeric',month:'long',year:'numeric'})

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

  useEffect(()=>{fetchData()},[])

  function handleSaved(ingresoId: string, updated: ItemsPaciente) {
    setData(prev => prev.map(i =>
      i.id === ingresoId ? { ...i, items: updated } : i
    ))
    // Update selected too
    setSelected(prev => prev?.id === ingresoId ? { ...prev, items: updated } : prev)
  }

  const habs1_16  = data.filter(i=>i.habitacion&&i.habitacion<=16)
  const habs17_32 = data.filter(i=>i.habitacion&&i.habitacion>16)
  const conSujeciones = data.filter(i=>{
    const it=i.items
    if(!it) return false
    return (it.sujecion_cama?.length??0)>0||(it.sujecion_silla_ruedas?.length??0)>0||(it.sujecion_sillon?.length??0)>0||it.observaciones_sujeciones
  })

  if(loading) return <div className="p-8 text-slate-400">Cargando…</div>

  return (
    <div className={`p-4 transition-all duration-200 ${selected?'mr-80':''}`}>
      {/* Header pantalla */}
      <div className="flex items-center justify-between mb-4 print:hidden">
        <div>
          <h1 className="text-xl font-bold text-slate-800">Hoja de ítems</h1>
          <p className="text-sm text-slate-400 capitalize">{today}</p>
          {!selected && <p className="text-xs text-slate-400 mt-0.5">Haz click en un paciente para editar sus ítems</p>}
        </div>
        <button onClick={()=>window.print()} className="btn-secondary print:hidden">
          <Printer className="w-4 h-4"/>
          Imprimir
        </button>
      </div>

      {/* Cabecera impresión */}
      <div className="hidden print:flex justify-between items-center mb-2">
        <span className="font-bold text-sm">CJA · HOJA DE ÍTEMS</span>
        <span className="text-sm capitalize">{today}</span>
      </div>

      <div className="mb-4">
        <Bloque habs={habs1_16} offset={0} onSelect={setSelected} selectedId={selected?.id??null}/>
      </div>
      <div className="my-3 border-t-2 border-slate-400 print:my-2"/>
      <div className="mb-4">
        <Bloque habs={habs17_32} offset={16} onSelect={setSelected} selectedId={selected?.id??null}/>
      </div>

      {conSujeciones.length>0&&(
        <div className="mt-3">
          <div className="border border-slate-400 bg-slate-100 px-2 py-1 text-[7.5pt] font-bold">
            PAUTA SUJECIONES / MEDIDAS ALTERNATIVAS (observaciones)
          </div>
          <div className="border border-slate-400 px-2 py-0.5 text-[6.5pt] text-slate-600">
            (1) Soporte terapéutico &nbsp;(2) Agresividad o autoagresión &nbsp;(3) Garantizar rehabilitación &nbsp;(4) Riesgo alto de caída + otras conductas &nbsp;(5) Voluntario &nbsp;(6) Control postural/seguridad
          </div>
          <table className="w-full border-collapse mt-1">
            <tbody>
              {conSujeciones.map(i=>{
                const it=i.items!
                const partes=[
                  sujecionStr(it.sujecion_cama)&&`Cama: ${sujecionStr(it.sujecion_cama)}`,
                  sujecionStr(it.sujecion_silla_ruedas)&&`Silla: ${sujecionStr(it.sujecion_silla_ruedas)}`,
                  sujecionStr(it.sujecion_sillon)&&`Sillón: ${sujecionStr(it.sujecion_sillon)}`,
                ].filter(Boolean).join(' · ')
                return (
                  <tr key={i.id} className="border border-slate-300">
                    <td className="px-2 py-0.5 text-[7.5pt] font-medium w-8 text-center border-r border-slate-300">{i.habitacion}</td>
                    <td className="px-2 py-0.5 text-[7.5pt] w-36 border-r border-slate-300">{i.paciente?.primer_apellido}, {i.paciente?.nombre}</td>
                    <td className="px-2 py-0.5 text-[7.5pt] text-slate-600 border-r border-slate-300">{partes}</td>
                    <td className="px-2 py-0.5 text-[7.5pt] text-slate-600">{it.observaciones_sujeciones??''}</td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* Panel lateral */}
      {selected&&(
        <PanelEdicion
          ingreso={selected}
          onClose={()=>setSelected(null)}
          onSaved={(updated)=>handleSaved(selected.id,updated)}
        />
      )}

      <style>{`
        @media print {
          body{margin:0;}
          .print\\:hidden{display:none!important;}
          .print\\:flex{display:flex!important;}
          .print\\:my-2{margin-top:0.5rem!important;margin-bottom:0.5rem!important;}
          @page{size:A4 portrait;margin:0.5cm 0.4cm;}
        }
      `}</style>
    </div>
  )
}
