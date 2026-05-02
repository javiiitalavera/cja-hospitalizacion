import { useEffect, useState, useRef } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import type { Ingreso, InformeIngreso, InformeAlta, ItemsPaciente } from '../types'
import { ChevronLeft, User, FileText, ClipboardList, AlertTriangle, FileCheck, Download, Plus, Pencil, Trash2, LogOut, History } from 'lucide-react'
import FormularioEvento from '../components/FormularioEvento'
import { TIPO_EVENTO_LABEL, TIPO_EVENTO_COLOR, TURNO_LABEL, type Evento } from '../types/eventos'
import { exportarInformeIngreso, exportarInformeAlta } from '../lib/exportWord'

const TABS = [
  { id: 'datos', label: 'Datos', icon: User },
  { id: 'ingreso', label: 'Informe ingreso', icon: FileText },
  { id: 'alta', label: 'Informe alta', icon: FileCheck },
  { id: 'items', label: 'Ítems', icon: ClipboardList },
  { id: 'eventos', label: 'Eventos', icon: AlertTriangle },
  { id: 'historial', label: 'Historial', icon: History },
]

export default function DetalleIngreso() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const [tab, setTab] = useState('datos')
  const [ingreso, setIngreso] = useState<Ingreso | null>(null)
  const [loading, setLoading] = useState(true)
  const [modalAlta, setModalAlta] = useState(false)
  const [altaForm, setAltaForm] = useState({ fecha_alta: new Date().toISOString().split('T')[0], estado: 'alta' })
  const [procesandoAlta, setProcesandoAlta] = useState(false)

  useEffect(() => {
    if (!id) return
    supabase
      .from('ingresos')
      .select(`*, paciente:pacientes(*), medico_responsable:profesionales(*)`)
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
    await supabase.from('ingresos').update({
      estado: altaForm.estado,
      fecha_alta: altaForm.fecha_alta,
    }).eq('id', id)
    setIngreso(prev => prev ? { ...prev, estado: altaForm.estado as any, fecha_alta: altaForm.fecha_alta } : prev)
    setModalAlta(false)
    setProcesandoAlta(false)
  }

  if (loading) return <div className="p-8 text-slate-400">Cargando…</div>
  if (!ingreso) return <div className="p-8 text-slate-400">Ingreso no encontrado</div>

  const p = ingreso.paciente!
  const nombreCompleto = `${p.primer_apellido} ${p.segundo_apellido ?? ''}, ${p.nombre}`.trim()
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
              <div className="flex items-center gap-3 mt-0.5 text-xs text-slate-500">
                {edad && <span>{edad} años</span>}
                {ingreso.habitacion && <span>· Hab. {ingreso.habitacion}</span>}
                {ingreso.medico_responsable && <span>· Dr/a. {ingreso.medico_responsable.nombre}</span>}
                <span>· Ingreso: {new Date(ingreso.fecha_ingreso).toLocaleDateString('es-ES')}</span>
                <span className={`px-2 py-0.5 rounded-full font-medium ${
                  ingreso.estado === 'activo' ? 'bg-emerald-100 text-emerald-700'
                  : ingreso.estado === 'alta' ? 'bg-slate-100 text-slate-500'
                  : 'bg-red-100 text-red-600'
                }`}>
                  {ingreso.estado === 'activo' ? 'Ingresado' : ingreso.estado === 'alta' ? 'Alta' : 'Éxitus'}
                </span>
              </div>
            </div>
          </div>
          {ingreso.estado === 'activo' && (
            <button onClick={() => setModalAlta(true)}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-700 hover:bg-slate-800 text-white text-xs font-medium transition-colors shrink-0">
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
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm p-6">
            <h2 className="text-base font-bold text-slate-800 mb-4">Dar de alta</h2>
            <div className="space-y-4">
              <div>
                <label className="label">Fecha de alta *</label>
                <input type="date" className="input"
                  value={altaForm.fecha_alta}
                  onChange={e => setAltaForm(f => ({ ...f, fecha_alta: e.target.value }))} />
              </div>
              <div>
                <label className="label">Motivo del alta *</label>
                <select className="input" value={altaForm.estado}
                  onChange={e => setAltaForm(f => ({ ...f, estado: e.target.value }))}>
                  <option value="alta">Alta domiciliaria</option>
                  <option value="alta_traslado">Traslado a otro centro</option>
                  <option value="exitus">Éxitus</option>
                </select>
              </div>
            </div>
            <div className="flex gap-3 mt-6">
              <button onClick={() => setModalAlta(false)} className="btn-secondary flex-1">Cancelar</button>
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
        {tab === 'datos' && <TabDatos ingreso={ingreso} onUpdate={setIngreso} />}
        {tab === 'ingreso' && id && <TabInformeIngreso ingresoId={id} ingreso={ingreso} />}
        {tab === 'alta' && id && <TabInformeAlta ingresoId={id} ingreso={ingreso} />}
        {tab === 'items' && id && <TabItems ingresoId={id} />}
        {tab === 'eventos' && id && <TabEventos ingresoId={id} />}
        {tab === 'historial' && ingreso?.paciente_id && <TabHistorial pacienteId={ingreso.paciente_id} ingresoActualId={id ?? ''} />}
      </div>
    </div>
  )
}

// ─── AUTOTEXTAREA ─────────────────────────────────────────────
function AutoTextarea({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const ref = useRef<HTMLTextAreaElement>(null)
  useEffect(() => {
    if (ref.current) {
      ref.current.style.height = 'auto'
      ref.current.style.height = ref.current.scrollHeight + 'px'
    }
  }, [value])
  return (
    <textarea
      ref={ref}
      className="textarea"
      style={{ minHeight: '4rem', overflow: 'hidden', resize: 'none' }}
      value={value}
      onChange={e => onChange(e.target.value)}
    />
  )
}

// ─── TAB DATOS ────────────────────────────────────────────────
function TabDatos({ ingreso }: { ingreso: Ingreso; onUpdate: (i: Ingreso) => void }) {
  const p = ingreso.paciente!
  const [editando, setEditando] = useState(false)
  const [paciente, setPaciente] = useState({ ...p })
  const [ingresoEdit, setIngresoEdit] = useState({
    habitacion: ingreso.habitacion?.toString() ?? '',
    motivo_ingreso: ingreso.motivo_ingreso ?? '',
    fecha_ingreso: ingreso.fecha_ingreso ?? '',
    fecha_alta: ingreso.fecha_alta ?? '',
    estado: ingreso.estado ?? 'activo',
    medico_responsable_id: ingreso.medico_responsable_id ?? '',
  })
  const [medicos, setMedicos] = useState<import('../types').Profesional[]>([])
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)

  useEffect(() => {
    supabase.from('profesionales').select('*').eq('rol', 'medico').eq('activo', true)
      .then(({ data }) => setMedicos(data ?? []))
  }, [])

  async function guardar() {
    setSaving(true)
    await Promise.all([
      supabase.from('pacientes').update({
        nombre: paciente.nombre,
        primer_apellido: paciente.primer_apellido,
        segundo_apellido: paciente.segundo_apellido,
        cipna: paciente.cipna,
        nhc: paciente.nhc,
        dni: paciente.dni,
        fecha_nacimiento: paciente.fecha_nacimiento || null,
        sexo: paciente.sexo,
        municipio: paciente.municipio,
        medico_cabecera: paciente.medico_cabecera,
        contacto_familiar_nombre: paciente.contacto_familiar_nombre,
        contacto_familiar_telefono: paciente.contacto_familiar_telefono,
      }).eq('id', p.id),
      supabase.from('ingresos').update({
        habitacion: ingresoEdit.habitacion ? parseInt(ingresoEdit.habitacion) : null,
        motivo_ingreso: ingresoEdit.motivo_ingreso,
        fecha_ingreso: ingresoEdit.fecha_ingreso,
        fecha_alta: ingresoEdit.fecha_alta || null,
        estado: ingresoEdit.estado,
        medico_responsable_id: ingresoEdit.medico_responsable_id || null,
      }).eq('id', ingreso.id),
    ])
    setSaving(false)
    setSaved(true)
    setEditando(false)
    setTimeout(() => setSaved(false), 2000)
  }

  if (editando) {
    const inp = (label: string, val: string, onChange: (v: string) => void, type = 'text') => (
      <div key={label}>
        <label className="label">{label}</label>
        <input type={type} className="input" value={val}
          onChange={e => onChange(e.target.value)} />
      </div>
    )
    return (
      <div className="max-w-2xl space-y-5">
        <div className="card p-6 space-y-4">
          <p className="section-title">Datos del paciente</p>
          <div className="grid grid-cols-2 gap-4">
            {inp('Nombre', paciente.nombre ?? '', v => setPaciente(p => ({ ...p, nombre: v })))}
            {inp('Primer apellido', paciente.primer_apellido ?? '', v => setPaciente(p => ({ ...p, primer_apellido: v })))}
            {inp('Segundo apellido', paciente.segundo_apellido ?? '', v => setPaciente(p => ({ ...p, segundo_apellido: v })))}
            {inp('Fecha nacimiento', paciente.fecha_nacimiento ?? '', v => setPaciente(p => ({ ...p, fecha_nacimiento: v })), 'date')}
            <div>
              <label className="label">Sexo</label>
              <select className="input" value={paciente.sexo ?? ''}
                onChange={e => setPaciente(p => ({ ...p, sexo: e.target.value as any }))}>
                <option value="">—</option>
                <option value="hombre">Hombre</option>
                <option value="mujer">Mujer</option>
                <option value="otro">Otro</option>
              </select>
            </div>
            {inp('CIPNA', paciente.cipna ?? '', v => setPaciente(p => ({ ...p, cipna: v })))}
            {inp('NHC', paciente.nhc ?? '', v => setPaciente(p => ({ ...p, nhc: v })))}
            {inp('DNI / NIE', paciente.dni ?? '', v => setPaciente(p => ({ ...p, dni: v })))}
            {inp('Municipio', paciente.municipio ?? '', v => setPaciente(p => ({ ...p, municipio: v })))}
            {inp('Médico de cabecera', paciente.medico_cabecera ?? '', v => setPaciente(p => ({ ...p, medico_cabecera: v })))}
            {inp('Contacto familiar', paciente.contacto_familiar_nombre ?? '', v => setPaciente(p => ({ ...p, contacto_familiar_nombre: v })))}
            {inp('Teléfono familiar', paciente.contacto_familiar_telefono ?? '', v => setPaciente(p => ({ ...p, contacto_familiar_telefono: v })))}
          </div>
        </div>
        <div className="card p-6 space-y-4">
          <p className="section-title">Datos del ingreso</p>
          <div className="grid grid-cols-2 gap-4">
            {inp('Fecha de ingreso', ingresoEdit.fecha_ingreso, v => setIngresoEdit(i => ({ ...i, fecha_ingreso: v })), 'date')}
            {inp('Fecha de alta', ingresoEdit.fecha_alta, v => setIngresoEdit(i => ({ ...i, fecha_alta: v })), 'date')}
            {inp('Habitación', ingresoEdit.habitacion, v => setIngresoEdit(i => ({ ...i, habitacion: v })), 'number')}
            <div>
              <label className="label">Estado</label>
              <select className="input" value={ingresoEdit.estado}
                onChange={e => setIngresoEdit(i => ({ ...i, estado: e.target.value as any }))}>
                <option value="activo">Ingresado</option>
                <option value="alta">Alta</option>
                <option value="exitus">Éxitus</option>
              </select>
            </div>
            <div>
              <label className="label">Médico responsable</label>
              <select className="input" value={ingresoEdit.medico_responsable_id}
                onChange={e => setIngresoEdit(i => ({ ...i, medico_responsable_id: e.target.value }))}>
                <option value="">— Sin asignar —</option>
                {medicos.map(m => (
                  <option key={m.id} value={m.id}>{m.nombre} {m.apellidos}</option>
                ))}
              </select>
            </div>
            <div className="col-span-2">
              <label className="label">Motivo de ingreso</label>
              <textarea className="textarea" rows={2} value={ingresoEdit.motivo_ingreso}
                onChange={e => setIngresoEdit(i => ({ ...i, motivo_ingreso: e.target.value }))} />
            </div>
          </div>
        </div>
        <div className="flex justify-end gap-3">
          <button onClick={() => setEditando(false)} className="btn-secondary">Cancelar</button>
          <button onClick={guardar} disabled={saving} className="btn-primary">
            {saving ? 'Guardando…' : 'Guardar cambios'}
          </button>
        </div>
      </div>
    )
  }

  // Modo lectura
  const rows: [string, string | null | undefined][] = [
    ['CIPNA', p.cipna], ['NHC', p.nhc], ['DNI', p.dni],
    ['Fecha nacimiento', p.fecha_nacimiento ? new Date(p.fecha_nacimiento).toLocaleDateString('es-ES') : null],
    ['Sexo', p.sexo], ['Municipio', p.municipio],
    ['Médico de cabecera', p.medico_cabecera],
    ['Contacto familiar', p.contacto_familiar_nombre],
    ['Teléfono familiar', p.contacto_familiar_telefono],
    ['Motivo de ingreso', ingreso.motivo_ingreso],
    ['Estado', ingreso.estado],
    ['Habitación', ingreso.habitacion?.toString()],
  ]
  return (
    <div className="max-w-2xl space-y-4">
      <div className="flex justify-end">
        <button onClick={() => setEditando(true)} className="btn-secondary">
          Editar datos
        </button>
      </div>
      <div className="card overflow-hidden">
        <div className="divide-y">
          {rows.map(([k, v]) => (
            <div key={k} className="flex px-5 py-3 text-sm">
              <span className="w-44 text-slate-500 shrink-0">{k}</span>
              <span className="text-slate-800">{v || <span className="text-slate-300">—</span>}</span>
            </div>
          ))}
        </div>
      </div>
      {saved && <p className="text-emerald-600 text-sm text-right">✓ Guardado correctamente</p>}
    </div>
  )
}

// ─── TAB INFORME INGRESO ──────────────────────────────────────
function TabInformeIngreso({ ingresoId, ingreso }: { ingresoId: string; ingreso: Ingreso | null }) {
  const [data, setData] = useState<Partial<InformeIngreso>>({})
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const dataRef = useRef(data)
  dataRef.current = data

  useEffect(() => {
    supabase.from('informe_ingreso').select('*').eq('ingreso_id', ingresoId).single()
      .then(({ data: d }) => { if (d) setData(d) })
  }, [ingresoId])

  async function save(d = dataRef.current) {
    setSaving(true)
    await supabase.from('informe_ingreso').upsert({ ...d, ingreso_id: ingresoId })
    setSaving(false)
    setSaved(true)
    setTimeout(() => setSaved(false), 2000)
  }

  function update(key: keyof InformeIngreso, value: string | number | undefined) {
    const next = { ...dataRef.current, [key]: value }
    setData(next)
    if (debounceRef.current) clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(() => save(next), 1500)
  }

  const field = (key: keyof InformeIngreso, label: string) => (
    <div key={key}>
      <label className="label">{label}</label>
      <AutoTextarea
        value={(data[key] as string) ?? ''}
        onChange={v => update(key, v)}
      />
    </div>
  )

  return (
    <div className="max-w-3xl space-y-6">
      <div className="flex items-center justify-end gap-3 text-xs text-slate-400">
        {saving && <span className="flex items-center gap-1"><span className="w-1.5 h-1.5 rounded-full bg-amber-400 animate-pulse inline-block"/> Guardando…</span>}
        {!saving && saved && <span className="flex items-center gap-1"><span className="w-1.5 h-1.5 rounded-full bg-emerald-500 inline-block"/> Guardado</span>}
      </div>

      <div className="card p-6 space-y-4">
        <p className="section-title">Antecedentes patológicos</p>
        {field('alergias', 'Alergias')}
        {field('antecedentes_medicos', 'Antecedentes médicos')}
        {field('antecedentes_quirurgicos', 'Intervenciones quirúrgicas')}
        {field('antecedentes_familiares', 'Antecedentes familiares')}
        {field('tratamiento_ingreso', 'Tratamiento al ingreso')}
      </div>

      <div className="card p-6 space-y-4">
        <p className="section-title">Valoración Geriátrica Integral</p>
        {field('vgi_social', 'Social')}
        {field('vgi_funcional', 'Funcional')}
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="label">I. Barthel (/100)</label>
            <input type="number" min={0} max={100} className="input"
              value={data.barthel ?? ''}
              onChange={e => update('barthel', parseInt(e.target.value) || undefined)} />
          </div>
          <div>
            <label className="label">I. Lawton (/8)</label>
            <input type="number" min={0} max={8} className="input"
              value={data.lawton ?? ''}
              onChange={e => update('lawton', parseInt(e.target.value) || undefined)} />
          </div>
        </div>
        {field('vgi_cognitivo', 'Cognitivo')}
        {field('vgi_sensorial', 'Sensorial')}
        {field('vgi_nutricional', 'Nutricional')}
        {field('vgi_dolor', 'Dolor')}
        {field('vgi_otros', 'Otros síndromes geriátricos')}
      </div>

      <div className="card p-6 space-y-4">
        <p className="section-title">Enfermedad actual</p>
        {field('personalidad_previa', 'Personalidad previa')}
        {field('evolucion', 'Evolución')}
        {field('situacion_cognitivo', 'Situación cognitiva')}
        {field('situacion_conductual', 'Situación conductual')}
        {field('situacion_animico', 'Situación anímica')}
        {field('situacion_funcional', 'Situación funcional')}
        {field('situacion_social', 'Situación social')}
      </div>

      <div className="card p-6 space-y-4">
        <p className="section-title">Exploraciones</p>
        {field('exploracion_fisica', 'Exploración física al ingreso')}
        {field('exploracion_neurologica', 'Exploración neurológica al ingreso')}
        {field('exploracion_psicopatologica', 'Exploración psicopatológica al ingreso')}
        {field('exploraciones_complementarias', 'Exploraciones complementarias')}
      </div>

      <div className="card p-6 space-y-4">
        <p className="section-title">Diagnóstico y plan</p>
        {field('impresion_diagnostica', 'Impresión diagnóstica')}
        {field('plan_objetivos', 'Objetivos')}
        {field('plan_medicacion', 'Medicación')}
        {field('plan_otros_cuidados', 'Otros cuidados / intervenciones')}
      </div>

      <div className="flex justify-end gap-3">
        <button
          onClick={async () => {
            if (!ingreso) return
            await save()
            await exportarInformeIngreso(ingreso, data as InformeIngreso)
          }}
          className="btn-secondary"
        >
          <Download className="w-4 h-4" />
          Exportar Word
        </button>
        <button onClick={() => save()} className="btn-primary">
          Guardar ahora
        </button>
      </div>
    </div>
  )
}

// ─── TAB INFORME ALTA ─────────────────────────────────────────
function TabInformeAlta({ ingresoId, ingreso }: { ingresoId: string; ingreso: Ingreso | null }) {
  const [data, setData] = useState<Partial<InformeAlta>>({})
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)

  const [informeIngreso, setInformeIngreso] = useState<Partial<InformeIngreso>>({})

  useEffect(() => {
    supabase.from('informe_alta').select('*').eq('ingreso_id', ingresoId).single()
      .then(({ data: d }) => { if (d) setData(d) })
    supabase.from('informe_ingreso').select('*').eq('ingreso_id', ingresoId).single()
      .then(({ data: d }) => { if (d) setInformeIngreso(d) })
  }, [ingresoId])

  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const dataRef = useRef(data)
  dataRef.current = data

  async function save(d = dataRef.current) {
    setSaving(true)
    await supabase.from('informe_alta').upsert({ ...d, ingreso_id: ingresoId })
    setSaving(false)
    setSaved(true)
    setTimeout(() => setSaved(false), 2000)
  }

  function update(key: keyof InformeAlta, value: string) {
    const next = { ...dataRef.current, [key]: value }
    setData(next)
    if (debounceRef.current) clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(() => save(next), 1500)
  }

  const field = (key: keyof InformeAlta, label: string) => (
    <div key={key}>
      <label className="label">{label}</label>
      <AutoTextarea
        value={(data[key] as string) ?? ''}
        onChange={v => update(key, v)}
      />
    </div>
  )

  return (
    <div className="max-w-3xl space-y-6">
      <div className="flex items-center justify-between">
        <div className="bg-blue-50 border border-blue-200 rounded-lg px-4 py-2 text-xs text-blue-700">
          Los antecedentes e informe de ingreso se heredan al exportar a Word.
        </div>
        <div className="text-xs text-slate-400">
          {saving && <span className="flex items-center gap-1"><span className="w-1.5 h-1.5 rounded-full bg-amber-400 animate-pulse inline-block"/> Guardando…</span>}
          {!saving && saved && <span className="flex items-center gap-1"><span className="w-1.5 h-1.5 rounded-full bg-emerald-500 inline-block"/> Guardado</span>}
        </div>
      </div>

      <div className="card p-6 space-y-4">
        <p className="section-title">Durante el ingreso</p>
        {field('exploraciones_durante_ingreso', 'Exploraciones complementarias durante el ingreso')}
        {field('estudio_neuropsicologico', 'Estudio neuropsicológico')}
        {field('informe_fisioterapia', 'Informe de fisioterapia')}
        {field('informe_terapia_ocupacional', 'Informe de terapia ocupacional')}
      </div>

      <div className="card p-6 space-y-4">
        <p className="section-title">Evolución y diagnósticos</p>
        {field('evolucion_clinica', 'Evolución clínica')}
        {field('juicios_clinicos', 'Juicios clínicos')}
      </div>

      <div className="card p-6 space-y-4">
        <p className="section-title">Tratamiento y recomendaciones al alta</p>
        {field('recomendaciones_conductuales', 'Recomendaciones de manejo conductual')}
        {field('cuidados_enfermeria', 'Cuidados de enfermería')}
        {field('medicacion_alta', 'Medicación al alta')}
        {field('otras_recomendaciones', 'Otras recomendaciones')}
      </div>

      <div className="flex justify-end gap-3">
        <button
          onClick={async () => {
            if (!ingreso) return
            await save()
            await exportarInformeAlta(ingreso, informeIngreso as InformeIngreso, data as InformeAlta)
          }}
          className="btn-secondary"
        >
          <Download className="w-4 h-4" />
          Exportar Word
        </button>
        <button onClick={() => save()} className="btn-primary">
          Guardar ahora
        </button>
      </div>
    </div>
  )
}

// ─── TAB ÍTEMS ────────────────────────────────────────────────
function TabItems({ ingresoId }: { ingresoId: string }) {
  const [data, setData] = useState<Partial<ItemsPaciente>>({})
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)

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
        {multiSujecion('sujecion_silla_ruedas', 'Sujeción silla de ruedas')}
        {multiSujecion('sujecion_sillon', 'Sujeción sillón')}
        <div>
          <label className="label">Observaciones</label>
          <textarea className="textarea" rows={3}
            value={(data.observaciones_sujeciones as string) ?? ''}
            onChange={e => setData(d => ({ ...d, observaciones_sujeciones: e.target.value }))} />
        </div>
      </div>

      <div className="flex justify-end">
        <button onClick={save} disabled={saving} className="btn-primary">
          {saving ? 'Guardando…' : saved ? '✓ Guardado' : 'Guardar cambios'}
        </button>
      </div>
    </div>
  )
}

// ─── TAB EVENTOS ──────────────────────────────────────────────
function TabEventos({ ingresoId }: { ingresoId: string }) {
  const [eventos, setEventos] = useState<Evento[]>([])
  const [loading, setLoading] = useState(true)
  const [modal, setModal] = useState(false)
  const [editando, setEditando] = useState<Evento | null>(null)

  async function fetchEventos() {
    const { data } = await supabase
      .from('eventos')
      .select('*, registrado_por:profesionales(nombre, apellidos, rol)')
      .eq('ingreso_id', ingresoId)
      .order('fecha', { ascending: false })
      .order('created_at', { ascending: false })
    setEventos((data ?? []) as Evento[])
    setLoading(false)
  }

  useEffect(() => { fetchEventos() }, [ingresoId])

  async function eliminar(id: string) {
    if (!confirm('¿Eliminar este evento?')) return
    await supabase.from('eventos').delete().eq('id', id)
    fetchEventos()
  }

  function abrirEditar(ev: Evento) {
    setEditando(ev)
    setModal(true)
  }

  function cerrarModal() {
    setModal(false)
    setEditando(null)
  }

  return (
    <div className="max-w-3xl space-y-4">
      <div className="flex justify-between items-center">
        <p className="text-sm text-slate-500">{eventos.length} evento{eventos.length !== 1 ? 's' : ''} registrado{eventos.length !== 1 ? 's' : ''}</p>
        <button onClick={() => setModal(true)} className="btn-primary">
          <Plus className="w-4 h-4" />
          Registrar evento
        </button>
      </div>

      {loading ? (
        <div className="text-slate-400 text-sm py-8 text-center">Cargando…</div>
      ) : eventos.length === 0 ? (
        <div className="card p-10 text-center text-slate-400 text-sm">
          No hay eventos registrados en este ingreso.
        </div>
      ) : (
        <div className="space-y-3">
          {eventos.map(ev => (
            <div key={ev.id} className="card p-4">
              <div className="flex items-start justify-between gap-3">
                <div className="flex-1">
                  {/* Tipo + fecha */}
                  <div className="flex items-center gap-2 flex-wrap mb-2">
                    <span className={`px-2 py-0.5 rounded-full text-xs font-semibold border ${TIPO_EVENTO_COLOR[ev.tipo]}`}>
                      {TIPO_EVENTO_LABEL[ev.tipo]}
                    </span>
                    <span className="text-xs text-slate-500">
                      {new Date(ev.fecha).toLocaleDateString('es-ES')}
                      {ev.hora && ` · ${ev.hora.slice(0, 5)}`}
                      {ev.turno && ` · Turno ${TURNO_LABEL[ev.turno]}`}
                    </span>
                  </div>

                  {/* Campos específicos */}
                  {Object.entries(ev.datos).length > 0 && (
                    <div className="grid grid-cols-2 gap-x-4 gap-y-1 mb-2">
                      {Object.entries(ev.datos).map(([k, v]) => (
                        <div key={k} className="text-xs">
                          <span className="text-slate-400 capitalize">{k.replace(/_/g, ' ')}: </span>
                          <span className="text-slate-700 font-medium">{v}</span>
                        </div>
                      ))}
                    </div>
                  )}

                  {/* Notas */}
                  {ev.notas && (
                    <p className="text-xs text-slate-600 italic mt-1">{ev.notas}</p>
                  )}

                  {/* Firma */}
                  {ev.registrado_por && (
                    <p className="text-xs text-slate-400 mt-2">
                      Registrado por {ev.registrado_por.nombre} {ev.registrado_por.apellidos}
                      {' · '}<span className="capitalize">{ev.registrado_por.rol}</span>
                    </p>
                  )}
                </div>

                {/* Acciones */}
                <div className="flex gap-1 shrink-0">
                  <button onClick={() => abrirEditar(ev)}
                    className="p-1.5 text-slate-400 hover:text-primary-600 hover:bg-primary-50 rounded-lg transition-colors">
                    <Pencil className="w-3.5 h-3.5" />
                  </button>
                  <button onClick={() => eliminar(ev.id)}
                    className="p-1.5 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors">
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {modal && (
        <FormularioEvento
          ingresoId={ingresoId}
          eventoExistente={editando}
          onClose={cerrarModal}
          onGuardado={() => { cerrarModal(); fetchEventos() }}
        />
      )}
    </div>
  )
}

// ─── TAB HISTORIAL ────────────────────────────────────────────
function TabHistorial({ pacienteId, ingresoActualId }: { pacienteId: string; ingresoActualId: string }) {
  const navigate = useNavigate()
  const [ingresos, setIngresos] = useState<any[]>([])
  const [eventos, setEventos] = useState<any[]>([])
  const [loading, setLoading] = useState(true)

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

  useEffect(() => {
    async function fetch() {
      // All ingresos of this patient
      const { data: ingresosData } = await supabase
        .from('ingresos')
        .select('*, medico_responsable:profesionales(nombre)')
        .eq('paciente_id', pacienteId)
        .order('fecha_ingreso', { ascending: false })

      const list = ingresosData ?? []
      setIngresos(list)

      // All events across all ingresos
      const ids = list.map((i: any) => i.id)
      if (ids.length > 0) {
        const { data: eventosData } = await supabase
          .from('eventos')
          .select('*, registrado_por:profesionales(nombre,apellidos)')
          .in('ingreso_id', ids)
          .order('fecha', { ascending: false })
        setEventos(eventosData ?? [])
      }
      setLoading(false)
    }
    fetch()
  }, [pacienteId])

  if (loading) return <div className="text-slate-400 text-sm py-8 text-center">Cargando…</div>

  const ingresosAnteriores = ingresos.filter(i => i.id !== ingresoActualId)

  return (
    <div className="max-w-3xl space-y-6">
      {/* Ingresos anteriores */}
      <div className="card overflow-hidden">
        <div className="px-5 py-4 border-b bg-slate-50">
          <p className="section-title mb-0">Ingresos anteriores</p>
        </div>
        {ingresosAnteriores.length === 0 ? (
          <div className="px-5 py-8 text-sm text-slate-400 text-center">
            No hay ingresos anteriores registrados.
          </div>
        ) : (
          <div className="divide-y">
            {ingresosAnteriores.map(ing => {
              const dias = ing.fecha_alta && ing.fecha_ingreso
                ? Math.round((new Date(ing.fecha_alta).getTime() - new Date(ing.fecha_ingreso).getTime()) / 86400000)
                : null
              return (
                <div key={ing.id}
                  className="px-5 py-4 flex items-center justify-between hover:bg-slate-50 cursor-pointer transition-colors"
                  onClick={() => navigate(`/ingresos/${ing.id}`)}>
                  <div>
                    <div className="flex items-center gap-2 mb-1">
                      <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${ESTADO_COLOR[ing.estado] ?? 'bg-slate-100 text-slate-500'}`}>
                        {ESTADO_LABEL[ing.estado] ?? ing.estado}
                      </span>
                      {ing.habitacion && (
                        <span className="text-xs text-slate-400">Hab. {ing.habitacion}</span>
                      )}
                      {dias != null && (
                        <span className="text-xs text-slate-400">{dias} días</span>
                      )}
                    </div>
                    <p className="text-sm text-slate-600">
                      {new Date(ing.fecha_ingreso).toLocaleDateString('es-ES')}
                      {ing.fecha_alta && ` → ${new Date(ing.fecha_alta).toLocaleDateString('es-ES')}`}
                    </p>
                    {ing.medico_responsable?.nombre && (
                      <p className="text-xs text-slate-400 mt-0.5">{ing.medico_responsable.nombre}</p>
                    )}
                  </div>
                  <span className="text-primary-600 text-xs font-medium">Ver →</span>
                </div>
              )
            })}
          </div>
        )}
      </div>

      {/* Historial de eventos completo */}
      <div className="card overflow-hidden">
        <div className="px-5 py-4 border-b bg-slate-50 flex items-center justify-between">
          <p className="section-title mb-0">Todos los eventos ({eventos.length})</p>
        </div>
        {eventos.length === 0 ? (
          <div className="px-5 py-8 text-sm text-slate-400 text-center">
            No hay eventos registrados.
          </div>
        ) : (
          <div className="divide-y">
            {eventos.map(ev => {
              // Find which ingreso this event belongs to
              const ingreso = ingresos.find(i => i.id === ev.ingreso_id)
              const esActual = ev.ingreso_id === ingresoActualId
              return (
                <div key={ev.id} className="px-5 py-3">
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex-1">
                      <div className="flex items-center gap-2 flex-wrap mb-1">
                        <span className={`px-2 py-0.5 rounded-full text-xs font-semibold ${TIPO_COLOR[ev.tipo] ?? 'bg-slate-100 text-slate-600'}`}>
                          {TIPO_LABEL[ev.tipo] ?? ev.tipo}
                        </span>
                        {esActual ? (
                          <span className="text-xs text-primary-500 font-medium">Ingreso actual</span>
                        ) : (
                          <span className="text-xs text-slate-400">
                            Ingreso {ingreso ? new Date(ingreso.fecha_ingreso).toLocaleDateString('es-ES') : '—'}
                          </span>
                        )}
                      </div>
                      {Object.entries(ev.datos ?? {}).length > 0 && (
                        <div className="flex flex-wrap gap-x-3 gap-y-0.5">
                          {Object.entries(ev.datos).map(([k, v]: any) => (
                            <span key={k} className="text-xs text-slate-500">
                              <span className="capitalize">{k.replace(/_/g, ' ')}: </span>
                              <span className="font-medium text-slate-700">{v}</span>
                            </span>
                          ))}
                        </div>
                      )}
                      {ev.notas && <p className="text-xs text-slate-500 italic mt-0.5">{ev.notas}</p>}
                      {ev.registrado_por && (
                        <p className="text-xs text-slate-400 mt-0.5">
                          {ev.registrado_por.nombre} {ev.registrado_por.apellidos}
                        </p>
                      )}
                    </div>
                    <div className="text-right shrink-0">
                      <p className="text-xs font-medium text-slate-600">
                        {new Date(ev.fecha).toLocaleDateString('es-ES')}
                      </p>
                      {ev.hora && <p className="text-xs text-slate-400">{ev.hora.slice(0, 5)}</p>}
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}
