import { useEffect, useRef, useState } from 'react'
import { supabase } from '../../lib/supabase'
import type { Ingreso } from '../../types'
import { CheckCircle, Circle, Save } from 'lucide-react'

// ─── REPERTORIO CIE-10 PSICOGERIÁTRICO ────────────────────────

const CIE10: { code: string; desc: string }[] = [
  // Demencias
  { code: 'F00.0', desc: 'Demencia en enfermedad de Alzheimer de inicio precoz' },
  { code: 'F00.1', desc: 'Demencia en enfermedad de Alzheimer de inicio tardío' },
  { code: 'F00.2', desc: 'Demencia en enfermedad de Alzheimer, forma mixta' },
  { code: 'F00.9', desc: 'Demencia en enfermedad de Alzheimer, no especificada' },
  { code: 'F01.0', desc: 'Demencia vascular de inicio agudo' },
  { code: 'F01.1', desc: 'Demencia por infartos múltiples' },
  { code: 'F01.2', desc: 'Demencia vascular subcortical' },
  { code: 'F01.3', desc: 'Demencia vascular mixta cortical y subcortical' },
  { code: 'F01.9', desc: 'Demencia vascular, no especificada' },
  { code: 'F02.0', desc: 'Demencia en enfermedad de Pick' },
  { code: 'F02.1', desc: 'Demencia en enfermedad de Creutzfeldt-Jakob' },
  { code: 'F02.2', desc: 'Demencia en enfermedad de Huntington' },
  { code: 'F02.3', desc: 'Demencia en enfermedad de Parkinson' },
  { code: 'F02.8', desc: 'Demencia en otras enfermedades especificadas' },
  { code: 'F03',   desc: 'Demencia, no especificada' },
  { code: 'G30.0', desc: 'Enfermedad de Alzheimer de inicio precoz' },
  { code: 'G30.1', desc: 'Enfermedad de Alzheimer de inicio tardío' },
  { code: 'G30.9', desc: 'Enfermedad de Alzheimer, no especificada' },
  { code: 'G31.0', desc: 'Atrofia cerebral circunscrita (Pick)' },
  { code: 'G31.83', desc: 'Demencia por cuerpos de Lewy' },
  // Delirium
  { code: 'F05.0', desc: 'Delirium no superpuesto a demencia' },
  { code: 'F05.1', desc: 'Delirium superpuesto a demencia' },
  { code: 'F05.8', desc: 'Otro delirium' },
  { code: 'F05.9', desc: 'Delirium, no especificado' },
  // Trastornos del comportamiento
  { code: 'F06.0', desc: 'Alucinosis orgánica' },
  { code: 'F06.1', desc: 'Estado catatónico orgánico' },
  { code: 'F06.2', desc: 'Trastorno delirante orgánico' },
  { code: 'F06.3', desc: 'Trastornos del humor orgánicos' },
  { code: 'F06.4', desc: 'Trastorno de ansiedad orgánico' },
  { code: 'F07.0', desc: 'Trastorno orgánico de la personalidad' },
  { code: 'F07.2', desc: 'Síndrome postconcusional' },
  // Depresión y ansiedad
  { code: 'F32.0', desc: 'Episodio depresivo leve' },
  { code: 'F32.1', desc: 'Episodio depresivo moderado' },
  { code: 'F32.2', desc: 'Episodio depresivo grave sin síntomas psicóticos' },
  { code: 'F32.3', desc: 'Episodio depresivo grave con síntomas psicóticos' },
  { code: 'F33.0', desc: 'Trastorno depresivo recurrente, episodio leve actual' },
  { code: 'F33.1', desc: 'Trastorno depresivo recurrente, episodio moderado actual' },
  { code: 'F33.2', desc: 'Trastorno depresivo recurrente, episodio grave sin psicosis' },
  { code: 'F41.0', desc: 'Trastorno de pánico' },
  { code: 'F41.1', desc: 'Trastorno de ansiedad generalizada' },
  { code: 'F41.2', desc: 'Trastorno mixto ansioso-depresivo' },
  // Psicosis
  { code: 'F20.0', desc: 'Esquizofrenia paranoide' },
  { code: 'F20.9', desc: 'Esquizofrenia, no especificada' },
  { code: 'F22.0', desc: 'Trastorno delirante' },
  { code: 'F25.0', desc: 'Trastorno esquizoafectivo, tipo maníaco' },
  { code: 'F25.1', desc: 'Trastorno esquizoafectivo, tipo depresivo' },
  // Síndromes geriátricos
  { code: 'R41.3', desc: 'Otras amnesias' },
  { code: 'R54',   desc: 'Senilidad' },
  { code: 'Z74.0', desc: 'Problema relacionado con movilidad reducida' },
  { code: 'Z74.1', desc: 'Necesidad de asistencia personal' },
  { code: 'Z74.2', desc: 'Necesidad de asistencia en el hogar' },
  { code: 'Z75.1', desc: 'Persona en lista de espera' },
  // Comorbilidades frecuentes
  { code: 'I10',   desc: 'Hipertensión esencial (primaria)' },
  { code: 'I50.9', desc: 'Insuficiencia cardíaca, no especificada' },
  { code: 'I63.9', desc: 'Infarto cerebral, no especificado' },
  { code: 'I69.3', desc: 'Secuelas de infarto cerebral' },
  { code: 'E11.9', desc: 'Diabetes mellitus tipo 2 sin complicaciones' },
  { code: 'E78.0', desc: 'Hipercolesterolemia pura' },
  { code: 'J18.9', desc: 'Neumonía, no especificada' },
  { code: 'J44.1', desc: 'EPOC con exacerbación aguda' },
  { code: 'N39.0', desc: 'Infección de vías urinarias' },
  { code: 'M41.9', desc: 'Escoliosis, no especificada' },
  { code: 'M81.0', desc: 'Osteoporosis postmenopáusica' },
  { code: 'S00.9', desc: 'Traumatismo superficial de la cabeza' },
  { code: 'S72.0', desc: 'Fractura del cuello del fémur' },
  { code: 'W19',   desc: 'Caída, no especificada' },
  // Úlceras
  { code: 'L89.0', desc: 'Úlcera por presión estadio I' },
  { code: 'L89.1', desc: 'Úlcera por presión estadio II' },
  { code: 'L89.2', desc: 'Úlcera por presión estadio III' },
  { code: 'L89.3', desc: 'Úlcera por presión estadio IV' },
  { code: 'L89.9', desc: 'Úlcera por presión, estadio no especificado' },
]

const CIRCUNSTANCIAS_ALTA = [
  { value: '1', label: '1 — Alta voluntaria' },
  { value: '2', label: '2 — Alta por curación/mejoría' },
  { value: '3', label: '3 — Alta por traslado a otro hospital' },
  { value: '4', label: '4 — Alta por traslado a centro sociosanitario' },
  { value: '5', label: '5 — Alta por fuga' },
  { value: '6', label: '6 — Éxitus' },
  { value: '9', label: '9 — Otras circunstancias' },
]

// ─── BUSCADOR CIE-10 ──────────────────────────────────────────

function BuscadorCIE10({
  value, onChange, placeholder = 'Código o descripción…'
}: {
  value: string
  onChange: (code: string, desc: string) => void
  placeholder?: string
}) {
  const [query, setQuery] = useState(value)
  const [open, setOpen] = useState(false)
  const [resultados, setResultados] = useState<typeof CIE10>([])
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    setQuery(value)
  }, [value])

  useEffect(() => {
    if (query.trim().length < 1) { setResultados([]); return }
    const q = query.toLowerCase()
    const res = CIE10.filter(
      c => c.code.toLowerCase().includes(q) || c.desc.toLowerCase().includes(q)
    ).slice(0, 8)
    setResultados(res)
    setOpen(res.length > 0)
  }, [query])

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [])

  return (
    <div ref={ref} className="relative">
      <input
        className="input text-sm"
        placeholder={placeholder}
        value={query}
        onChange={e => setQuery(e.target.value)}
        onFocus={() => resultados.length > 0 && setOpen(true)}
      />
      {open && (
        <div className="absolute top-full left-0 right-0 mt-1 bg-white border rounded-xl shadow-lg z-30 overflow-hidden max-h-64 overflow-y-auto">
          {resultados.map(r => (
            <button
              type="button"
              key={r.code}
              className="w-full text-left px-3 py-2 text-xs hover:bg-slate-50 border-b last:border-0 flex gap-3"
              onClick={() => { onChange(r.code, r.desc); setQuery(r.code); setOpen(false) }}
            >
              <span className="font-mono font-bold text-primary-700 shrink-0 w-16">{r.code}</span>
              <span className="text-slate-600">{r.desc}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

// ─── FILA DIAGNÓSTICO ─────────────────────────────────────────

function FilaDiagnostico({
  label, codigo, desc,
  onChangeCodigo, onChangeDesc,
  required = false,
}: {
  label: string
  codigo: string
  desc: string
  onChangeCodigo: (v: string) => void
  onChangeDesc: (v: string) => void
  required?: boolean
}) {
  return (
    <div className="grid grid-cols-[10rem_1fr] gap-3 items-start">
      <span className="text-xs text-slate-500 pt-2.5 shrink-0">
        {label}{required && <span className="text-red-400 ml-0.5">*</span>}
      </span>
      <div className="space-y-1.5">
        <BuscadorCIE10
          value={codigo}
          placeholder="Código CIE-10…"
          onChange={(code, d) => { onChangeCodigo(code); onChangeDesc(d) }}
        />
        {(codigo || desc) && (
          <input
            className="input text-xs text-slate-500"
            placeholder="Descripción"
            value={desc}
            onChange={e => onChangeDesc(e.target.value)}
          />
        )}
      </div>
    </div>
  )
}

// ─── FILA PROCEDIMIENTO ───────────────────────────────────────

function FilaProcedimiento({
  label, codigo, desc,
  onChangeCodigo, onChangeDesc,
}: {
  label: string
  codigo: string
  desc: string
  onChangeCodigo: (v: string) => void
  onChangeDesc: (v: string) => void
}) {
  return (
    <div className="grid grid-cols-[10rem_1fr] gap-3 items-start">
      <span className="text-xs text-slate-500 pt-2.5 shrink-0">{label}</span>
      <div className="space-y-1.5">
        <input
          className="input text-sm font-mono"
          placeholder="Código procedimiento…"
          value={codigo}
          onChange={e => onChangeCodigo(e.target.value.toUpperCase())}
        />
        {codigo && (
          <input
            className="input text-xs text-slate-500"
            placeholder="Descripción"
            value={desc}
            onChange={e => onChangeDesc(e.target.value)}
          />
        )}
      </div>
    </div>
  )
}

// ─── TAB CMBD ────────────────────────────────────────────────

interface CMBDData {
  diagnostico_principal?: string
  diagnostico_principal_desc?: string
  diagnostico_secundario_1?: string; diagnostico_secundario_1_desc?: string
  diagnostico_secundario_2?: string; diagnostico_secundario_2_desc?: string
  diagnostico_secundario_3?: string; diagnostico_secundario_3_desc?: string
  diagnostico_secundario_4?: string; diagnostico_secundario_4_desc?: string
  procedimiento_1?: string; procedimiento_1_desc?: string
  procedimiento_2?: string; procedimiento_2_desc?: string
  procedimiento_3?: string; procedimiento_3_desc?: string
  procedimiento_4?: string; procedimiento_4_desc?: string
  circunstancia_alta?: string
  notas?: string
  completado?: boolean
}

export function TabCMBD({ ingresoId, ingreso }: { ingresoId: string; ingreso: Ingreso | null }) {
  const [data, setData] = useState<CMBDData>({})
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [saveError, setSaveError] = useState(false)
  const [loading, setLoading] = useState(true)
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const dataRef = useRef(data)
  dataRef.current = data

  useEffect(() => {
    supabase.from('cmbd').select('*').eq('ingreso_id', ingresoId).maybeSingle()
      .then(({ data: d }) => {
        if (d) setData(d as CMBDData)
        setLoading(false)
      })
  }, [ingresoId])

  async function save(d = dataRef.current) {
    setSaving(true)
    setSaveError(false)
    const { error } = await supabase.from('cmbd').upsert({ ...d, ingreso_id: ingresoId })
    setSaving(false)
    if (error) { setSaveError(true); return }
    setSaved(true)
    setTimeout(() => setSaved(false), 2000)
  }

  function update<K extends keyof CMBDData>(key: K, value: CMBDData[K]) {
    const next = { ...dataRef.current, [key]: value }
    setData(next)
    if (debounceRef.current) clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(() => save(next), 1500)
  }

  const p = ingreso?.paciente as any
  const nombreCompleto = p
    ? `${p.primer_apellido}${p.segundo_apellido ? ' ' + p.segundo_apellido : ''}, ${p.nombre}`
    : '—'
  const edad = p?.fecha_nacimiento
    ? Math.floor((Date.now() - new Date(p.fecha_nacimiento).getTime()) / 31557600000)
    : null

  if (loading) return <div className="text-slate-400 text-center py-10">Cargando…</div>

  return (
    <div className="max-w-2xl space-y-6">

      {/* Header con estado */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-sm font-bold text-slate-700 uppercase tracking-wide">CMBD · Conjunto Mínimo Básico de Datos</h2>
          <p className="text-xs text-slate-400 mt-0.5">Registro al alta · {nombreCompleto}</p>
        </div>
        <div className="flex items-center gap-3">
          <span className="text-xs text-slate-400">
            {saving && '● Guardando…'}
            {!saving && saved && <span className="text-emerald-600">✓ Guardado</span>}
            {saveError && <span className="text-red-600 font-semibold">✗ Error al guardar</span>}
          </span>
          <button
            type="button"
            onClick={() => save()}
            className="btn-secondary text-xs py-1.5"
          >
            <Save className="w-3.5 h-3.5" />
            Guardar
          </button>
        </div>
      </div>

      {/* DATOS DEMOGRÁFICOS — pre-rellenados */}
      <div className="card p-5 space-y-2">
        <p className="section-title">Datos del episodio</p>
        <div className="grid grid-cols-2 gap-x-8 gap-y-1 text-sm">
          <div><span className="text-slate-400 text-xs">Paciente: </span>{nombreCompleto}</div>
          <div><span className="text-slate-400 text-xs">Edad: </span>{edad != null ? `${edad} años` : '—'}</div>
          <div><span className="text-slate-400 text-xs">CIPNA: </span>{p?.cipna ?? '—'}</div>
          <div><span className="text-slate-400 text-xs">NHC: </span>{p?.nhc ?? '—'}</div>
          <div><span className="text-slate-400 text-xs">Sexo: </span>{p?.sexo ?? '—'}</div>
          <div><span className="text-slate-400 text-xs">F. nacimiento: </span>
            {p?.fecha_nacimiento ? new Date(p.fecha_nacimiento).toLocaleDateString('es-ES') : '—'}
          </div>
          <div><span className="text-slate-400 text-xs">F. ingreso: </span>
            {ingreso?.fecha_ingreso ? new Date(ingreso.fecha_ingreso).toLocaleDateString('es-ES') : '—'}
          </div>
          <div><span className="text-slate-400 text-xs">F. alta: </span>
            {ingreso?.fecha_alta ? new Date(ingreso.fecha_alta).toLocaleDateString('es-ES') : '—'}
          </div>
          <div><span className="text-slate-400 text-xs">Médico: </span>
            {ingreso?.medico_responsable
              ? `${(ingreso.medico_responsable as any).nombre} ${(ingreso.medico_responsable as any).apellidos}`
              : '—'}
          </div>
          <div><span className="text-slate-400 text-xs">Habitación: </span>{ingreso?.habitacion ?? '—'}</div>
        </div>
      </div>

      {/* CIRCUNSTANCIA AL ALTA */}
      <div className="card p-5 space-y-3">
        <p className="section-title">Circunstancia al alta</p>
        <select
          className="input"
          value={data.circunstancia_alta ?? ''}
          onChange={e => update('circunstancia_alta', e.target.value)}
        >
          <option value="">— Seleccionar —</option>
          {CIRCUNSTANCIAS_ALTA.map(c => (
            <option key={c.value} value={c.value}>{c.label}</option>
          ))}
        </select>
      </div>

      {/* DIAGNÓSTICOS */}
      <div className="card p-5 space-y-4">
        <p className="section-title">Diagnósticos CIE-10</p>
        <FilaDiagnostico
          label="Principal"
          required
          codigo={data.diagnostico_principal ?? ''}
          desc={data.diagnostico_principal_desc ?? ''}
          onChangeCodigo={v => update('diagnostico_principal', v)}
          onChangeDesc={v => update('diagnostico_principal_desc', v)}
        />
        <div className="border-t pt-4 space-y-4">
          {([1, 2, 3, 4] as const).map(n => (
            <FilaDiagnostico
              key={n}
              label={`Secundario ${n}`}
              codigo={(data as any)[`diagnostico_secundario_${n}`] ?? ''}
              desc={(data as any)[`diagnostico_secundario_${n}_desc`] ?? ''}
              onChangeCodigo={v => update(`diagnostico_secundario_${n}` as keyof CMBDData, v)}
              onChangeDesc={v => update(`diagnostico_secundario_${n}_desc` as keyof CMBDData, v)}
            />
          ))}
        </div>
      </div>

      {/* PROCEDIMIENTOS */}
      <div className="card p-5 space-y-4">
        <p className="section-title">Procedimientos</p>
        {([1, 2, 3, 4] as const).map(n => (
          <FilaProcedimiento
            key={n}
            label={`Procedimiento ${n}`}
            codigo={(data as any)[`procedimiento_${n}`] ?? ''}
            desc={(data as any)[`procedimiento_${n}_desc`] ?? ''}
            onChangeCodigo={v => update(`procedimiento_${n}` as keyof CMBDData, v)}
            onChangeDesc={v => update(`procedimiento_${n}_desc` as keyof CMBDData, v)}
          />
        ))}
      </div>

      {/* NOTAS */}
      <div className="card p-5 space-y-2">
        <p className="section-title">Notas</p>
        <textarea
          className="input min-h-[80px] resize-y text-sm"
          placeholder="Observaciones adicionales…"
          value={data.notas ?? ''}
          onChange={e => update('notas', e.target.value)}
        />
      </div>

      {/* COMPLETADO */}
      <div className="card p-4">
        <button
          type="button"
          onClick={() => update('completado', !data.completado)}
          className="flex items-center gap-3 w-full text-left"
        >
          {data.completado
            ? <CheckCircle className="w-5 h-5 text-emerald-600 shrink-0" />
            : <Circle className="w-5 h-5 text-slate-300 shrink-0" />
          }
          <div>
            <p className={`text-sm font-medium ${data.completado ? 'text-emerald-700' : 'text-slate-600'}`}>
              {data.completado ? 'CMBD completado' : 'Marcar como completado'}
            </p>
            <p className="text-xs text-slate-400">
              {data.completado
                ? 'Este registro está listo para enviar a administración'
                : 'Marca cuando hayas revisado todos los campos'
              }
            </p>
          </div>
        </button>
      </div>

    </div>
  )
}
