import { useEffect, useRef, useState } from 'react'
import { supabase } from '../../lib/supabase'
import type { Ingreso } from '../../types'
import { CheckCircle, Circle, Download, Save } from 'lucide-react'

// ─── REPERTORIO CIE-10 PSICOGERIÁTRICO ───────────────────────

const CIE10: { code: string; desc: string }[] = [
  { code: 'F00.0', desc: 'Demencia en Alzheimer de inicio precoz' },
  { code: 'F00.1', desc: 'Demencia en Alzheimer de inicio tardío' },
  { code: 'F00.2', desc: 'Demencia en Alzheimer, forma mixta' },
  { code: 'F00.9', desc: 'Demencia en Alzheimer, no especificada' },
  { code: 'F01.0', desc: 'Demencia vascular de inicio agudo' },
  { code: 'F01.1', desc: 'Demencia por infartos múltiples' },
  { code: 'F01.2', desc: 'Demencia vascular subcortical' },
  { code: 'F01.3', desc: 'Demencia vascular mixta cortical y subcortical' },
  { code: 'F01.9', desc: 'Demencia vascular, no especificada' },
  { code: 'F02.0', desc: 'Demencia en enfermedad de Pick' },
  { code: 'F02.3', desc: 'Demencia en enfermedad de Parkinson' },
  { code: 'F02.8', desc: 'Demencia en otras enfermedades especificadas' },
  { code: 'F03',   desc: 'Demencia, no especificada' },
  { code: 'F05.0', desc: 'Delirium no superpuesto a demencia' },
  { code: 'F05.1', desc: 'Delirium superpuesto a demencia' },
  { code: 'F05.9', desc: 'Delirium, no especificado' },
  { code: 'F06.2', desc: 'Trastorno delirante orgánico' },
  { code: 'F06.3', desc: 'Trastornos del humor orgánicos' },
  { code: 'F07.0', desc: 'Trastorno orgánico de la personalidad' },
  { code: 'F20.0', desc: 'Esquizofrenia paranoide' },
  { code: 'F20.9', desc: 'Esquizofrenia, no especificada' },
  { code: 'F22.0', desc: 'Trastorno delirante' },
  { code: 'F25.1', desc: 'Trastorno esquizoafectivo, tipo depresivo' },
  { code: 'F32.0', desc: 'Episodio depresivo leve' },
  { code: 'F32.1', desc: 'Episodio depresivo moderado' },
  { code: 'F32.2', desc: 'Episodio depresivo grave sin síntomas psicóticos' },
  { code: 'F32.3', desc: 'Episodio depresivo grave con síntomas psicóticos' },
  { code: 'F33.0', desc: 'Trastorno depresivo recurrente, episodio leve' },
  { code: 'F33.1', desc: 'Trastorno depresivo recurrente, episodio moderado' },
  { code: 'F33.2', desc: 'Trastorno depresivo recurrente, episodio grave' },
  { code: 'F41.1', desc: 'Trastorno de ansiedad generalizada' },
  { code: 'F41.2', desc: 'Trastorno mixto ansioso-depresivo' },
  { code: 'G30.0', desc: 'Enfermedad de Alzheimer de inicio precoz' },
  { code: 'G30.1', desc: 'Enfermedad de Alzheimer de inicio tardío' },
  { code: 'G30.9', desc: 'Enfermedad de Alzheimer, no especificada' },
  { code: 'G31.0', desc: 'Atrofia cerebral circunscrita (Pick)' },
  { code: 'G31.83', desc: 'Demencia por cuerpos de Lewy' },
  { code: 'I10',   desc: 'Hipertensión esencial (primaria)' },
  { code: 'I50.9', desc: 'Insuficiencia cardíaca, no especificada' },
  { code: 'I63.9', desc: 'Infarto cerebral, no especificado' },
  { code: 'I69.3', desc: 'Secuelas de infarto cerebral' },
  { code: 'E11.9', desc: 'Diabetes mellitus tipo 2 sin complicaciones' },
  { code: 'E78.0', desc: 'Hipercolesterolemia pura' },
  { code: 'J18.9', desc: 'Neumonía, no especificada' },
  { code: 'J44.1', desc: 'EPOC con exacerbación aguda' },
  { code: 'N39.0', desc: 'Infección de vías urinarias' },
  { code: 'M81.0', desc: 'Osteoporosis postmenopáusica' },
  { code: 'S72.0', desc: 'Fractura del cuello del fémur' },
  { code: 'W19',   desc: 'Caída, no especificada' },
  { code: 'L89.0', desc: 'Úlcera por presión estadio I' },
  { code: 'L89.1', desc: 'Úlcera por presión estadio II' },
  { code: 'L89.2', desc: 'Úlcera por presión estadio III' },
  { code: 'L89.3', desc: 'Úlcera por presión estadio IV' },
  { code: 'L89.9', desc: 'Úlcera por presión, estadio no especificado' },
  { code: 'Z74.0', desc: 'Problema relacionado con movilidad reducida' },
  { code: 'Z74.1', desc: 'Necesidad de asistencia personal' },
]

const N_SECUNDARIOS = 8
const N_PROCEDIMIENTOS = 8

const TIPALT: Record<string, string> = {
  '1': '1 — Alta voluntaria',
  '2': '2 — Alta por curación/mejoría',
  '3': '3 — Alta por traslado a otro hospital',
  '4': '4 — Alta por traslado a centro sociosanitario',
  '5': '5 — Alta por fuga',
  '8': '8 — Éxitus',
  '9': '9 — Otras circunstancias',
}

const PROCEDENCIA: Record<string, string> = {
  '10': '10 — Atención Primaria',
  '30': '30 — Traslado desde otro hospital/centro',
}

// ─── HELPERS ─────────────────────────────────────────────────

function fmtFecha(iso?: string) {
  if (!iso) return ''
  // ddmmaaaa
  const d = new Date(iso)
  const dd = String(d.getDate()).padStart(2, '0')
  const mm = String(d.getMonth() + 1).padStart(2, '0')
  return `${dd}${mm}${d.getFullYear()}`
}

function fmtSexo(sexo?: string) {
  return sexo === 'hombre' ? '1' : sexo === 'mujer' ? '2' : ''
}

// ─── BUSCADOR CIE-10 ─────────────────────────────────────────

function BuscadorCIE({ value, onChange }: {
  value: string
  onChange: (code: string, desc: string) => void
}) {
  const [q, setQ] = useState(value)
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => { setQ(value) }, [value])

  const resultados = q.trim().length >= 1
    ? CIE10.filter(c =>
        c.code.toLowerCase().includes(q.toLowerCase()) ||
        c.desc.toLowerCase().includes(q.toLowerCase())
      ).slice(0, 8)
    : []

  useEffect(() => {
    function click(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', click)
    return () => document.removeEventListener('mousedown', click)
  }, [])

  return (
    <div ref={ref} className="relative">
      <input className="input text-sm font-mono" placeholder="Código CIE-10…"
        value={q}
        onChange={e => { setQ(e.target.value); setOpen(true) }}
        onFocus={() => resultados.length > 0 && setOpen(true)}
      />
      {open && resultados.length > 0 && (
        <div className="absolute top-full left-0 right-0 mt-1 bg-white border rounded-xl shadow-lg z-30 overflow-hidden max-h-56 overflow-y-auto">
          {resultados.map(r => (
            <button type="button" key={r.code}
              className="w-full text-left px-3 py-2 text-xs hover:bg-slate-50 border-b last:border-0 flex gap-3"
              onClick={() => { onChange(r.code, r.desc); setQ(r.code); setOpen(false) }}>
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

function FilaDx({ label, codigo, desc, poad, onCodigo, onDesc, onPoad, required }: {
  label: string; codigo: string; desc: string; poad: boolean | null
  onCodigo: (v: string) => void; onDesc: (v: string) => void
  onPoad: (v: boolean) => void; required?: boolean
}) {
  return (
    <div className="grid grid-cols-[9rem_1fr_auto] gap-3 items-start">
      <span className="text-xs text-slate-500 pt-2.5 shrink-0">
        {label}{required && <span className="text-red-400 ml-0.5">*</span>}
      </span>
      <div className="space-y-1.5">
        <BuscadorCIE value={codigo} onChange={(c, d) => { onCodigo(c); onDesc(d) }} />
        {(codigo || desc) && (
          <input className="input text-xs text-slate-500" placeholder="Descripción"
            value={desc} onChange={e => onDesc(e.target.value)} />
        )}
      </div>
      {/* POAD — solo si hay código */}
      <div className="pt-2 shrink-0">
        {codigo && (
          <div className="flex flex-col items-center gap-0.5">
            <span className="text-[10px] text-slate-400 leading-none">Al ingreso</span>
            <button type="button"
              onClick={() => onPoad(!(poad === true))}
              className={`w-12 h-6 rounded-full text-[10px] font-bold transition-colors ${
                poad === true ? 'bg-emerald-500 text-white' : 'bg-slate-200 text-slate-400'
              }`}>
              {poad === true ? 'SÍ' : 'NO'}
            </button>
          </div>
        )}
      </div>
    </div>
  )
}

// ─── FILA PROCEDIMIENTO ───────────────────────────────────────

function FilaProc({ label, codigo, desc, onCodigo, onDesc }: {
  label: string; codigo: string; desc: string
  onCodigo: (v: string) => void; onDesc: (v: string) => void
}) {
  return (
    <div className="grid grid-cols-[9rem_1fr] gap-3 items-start">
      <span className="text-xs text-slate-500 pt-2.5 shrink-0">{label}</span>
      <div className="space-y-1.5">
        <input className="input text-sm font-mono" placeholder="Código procedimiento…"
          value={codigo} onChange={e => onCodigo(e.target.value.toUpperCase())} />
        {codigo && (
          <input className="input text-xs text-slate-500" placeholder="Descripción"
            value={desc} onChange={e => onDesc(e.target.value)} />
        )}
      </div>
    </div>
  )
}

// ─── TIPOS ───────────────────────────────────────────────────

interface CMBDData {
  diagnostico_principal?: string; diagnostico_principal_desc?: string; diagnostico_principal_poad?: boolean
  diagnostico_secundario_1?: string; diagnostico_secundario_1_desc?: string; diagnostico_secundario_1_poad?: boolean
  diagnostico_secundario_2?: string; diagnostico_secundario_2_desc?: string; diagnostico_secundario_2_poad?: boolean
  diagnostico_secundario_3?: string; diagnostico_secundario_3_desc?: string; diagnostico_secundario_3_poad?: boolean
  diagnostico_secundario_4?: string; diagnostico_secundario_4_desc?: string; diagnostico_secundario_4_poad?: boolean
  diagnostico_secundario_5?: string; diagnostico_secundario_5_desc?: string; diagnostico_secundario_5_poad?: boolean
  diagnostico_secundario_6?: string; diagnostico_secundario_6_desc?: string; diagnostico_secundario_6_poad?: boolean
  diagnostico_secundario_7?: string; diagnostico_secundario_7_desc?: string; diagnostico_secundario_7_poad?: boolean
  diagnostico_secundario_8?: string; diagnostico_secundario_8_desc?: string; diagnostico_secundario_8_poad?: boolean
  procedimiento_1?: string; procedimiento_1_desc?: string
  procedimiento_2?: string; procedimiento_2_desc?: string
  procedimiento_3?: string; procedimiento_3_desc?: string
  procedimiento_4?: string; procedimiento_4_desc?: string
  procedimiento_5?: string; procedimiento_5_desc?: string
  procedimiento_6?: string; procedimiento_6_desc?: string
  procedimiento_7?: string; procedimiento_7_desc?: string
  procedimiento_8?: string; procedimiento_8_desc?: string
  circunstancia_alta?: string
  procedencia?: string
  servicio?: string
  notas?: string
  completado?: boolean
}

// ─── EXPORTACIÓN EXCEL ───────────────────────────────────────

async function exportarExcel(data: CMBDData, ingreso: Ingreso | null) {
  // Importar xlsx dinámicamente
  const XLSX = await import('https://cdn.sheetjs.com/xlsx-0.20.3/package/xlsx.mjs' as any)

  const p = ingreso?.paciente as any

  // Construir fila CMBD exactamente con las columnas del formato oficial
  const fila: Record<string, any> = {
    id: '',
    TIP_CIP: '2',
    CIP: p?.cipna ?? '',
    HISTORIA: p?.nhc ?? '',
    FECNAC: fmtFecha(p?.fecha_nacimiento),
    SEXO: fmtSexo(p?.sexo),
    PAIS_NAC: '3166-2',
    RESIDE_CP: '',
    RESIDE_MUNI: '',
    REGFIN: '1',
    FECINICONT: fmtFecha(ingreso?.fecha_ingreso),
    FECINGHOSP: '',
    TIPCONT: '1',
    TIPVISITA: '',
    PROCEDENCIA: data.procedencia ?? '',
    CIRCONT: '2',
    SERVICIO: data.servicio ?? 'GRT',
    FECFINCONT: fmtFecha(ingreso?.fecha_alta),
    TIPALT: data.circunstancia_alta ?? '',
    DISPOSITIVO_CONTINUIDAD: '1',
    FECINT: '',
    UCI: '2',
    DIAS_UCI: '0',
    // Diagnóstico principal
    D1: data.diagnostico_principal ?? '',
    POAD1: data.diagnostico_principal_poad === true ? 'Si' : data.diagnostico_principal ? 'No' : '',
  }

  // Diagnósticos secundarios D2-D9
  for (let i = 1; i <= 8; i++) {
    const cod = (data as any)[`diagnostico_secundario_${i}`] ?? ''
    const poad = (data as any)[`diagnostico_secundario_${i}_poad`]
    fila[`D${i + 1}`] = cod
    fila[`POAD${i + 1}`] = cod ? (poad === true ? 'Si' : 'No') : ''
  }

  // Diagnósticos vacíos D10-D21
  for (let i = 10; i <= 21; i++) {
    fila[`D${i}`] = ''
    fila[`POAD${i}`] = ''
  }

  // Procedimientos PROC1-PROC20
  for (let i = 1; i <= 20; i++) {
    fila[`PROC${i}`] = i <= 8 ? ((data as any)[`procedimiento_${i}`] ?? '') : ''
  }

  // Procedimientos externos y morfología — siempre vacíos
  for (let i = 1; i <= 6; i++) fila[`PROEXT${i}`] = ''
  for (let i = 1; i <= 6; i++) fila[`M${i}`] = '0'

  fila['CEN_SAN'] = '310142'
  fila['CCAA'] = '15'

  const ws = XLSX.utils.json_to_sheet([fila])
  const wb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(wb, ws, 'Datos CMBD')

  const apellidos = p ? `${p.primer_apellido}_${p.primer_apellido}` : 'paciente'
  XLSX.writeFile(wb, `CMBD_${apellidos}_${ingreso?.fecha_alta ?? 'alta'}.xlsx`)
}

// ─── TAB PRINCIPAL ────────────────────────────────────────────

export function TabCMBD({ ingresoId, ingreso }: { ingresoId: string; ingreso: Ingreso | null }) {
  const [data, setData] = useState<CMBDData>({ servicio: 'GRT' })
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [saveError, setSaveError] = useState(false)
  const [exportando, setExportando] = useState(false)
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
    setSaving(true); setSaveError(false)
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

  function updateDx(n: number, field: 'code' | 'desc' | 'poad', value: any) {
    if (n === 0) {
      if (field === 'code') update('diagnostico_principal', value)
      else if (field === 'desc') update('diagnostico_principal_desc', value)
      else update('diagnostico_principal_poad', value)
    } else {
      if (field === 'code') update(`diagnostico_secundario_${n}` as keyof CMBDData, value)
      else if (field === 'desc') update(`diagnostico_secundario_${n}_desc` as keyof CMBDData, value)
      else update(`diagnostico_secundario_${n}_poad` as keyof CMBDData, value)
    }
  }

  function updateProc(n: number, field: 'code' | 'desc', value: string) {
    if (field === 'code') update(`procedimiento_${n}` as keyof CMBDData, value)
    else update(`procedimiento_${n}_desc` as keyof CMBDData, value)
  }

  async function handleExportar() {
    setExportando(true)
    await save()
    await exportarExcel(dataRef.current, ingreso)
    setExportando(false)
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

      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-sm font-bold text-slate-700 uppercase tracking-wide">CMBD · Conjunto Mínimo Básico de Datos</h2>
          <p className="text-xs text-slate-400 mt-0.5">Registro al alta · {nombreCompleto}</p>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-xs text-slate-400">
            {saving && '● Guardando…'}
            {!saving && saved && <span className="text-emerald-600">✓ Guardado</span>}
            {saveError && <span className="text-red-600 font-semibold">✗ Error al guardar</span>}
          </span>
          <button type="button" onClick={() => save()} className="btn-secondary text-xs py-1.5">
            <Save className="w-3.5 h-3.5" /> Guardar
          </button>
          <button type="button" onClick={handleExportar} disabled={exportando}
            className="btn-primary text-xs py-1.5 disabled:opacity-60">
            <Download className="w-3.5 h-3.5" />
            {exportando ? 'Generando…' : 'Exportar Excel'}
          </button>
        </div>
      </div>

      {/* Datos del episodio — pre-rellenados */}
      <div className="card p-5 space-y-2">
        <p className="section-title">Datos del episodio</p>
        <div className="grid grid-cols-2 gap-x-8 gap-y-1 text-sm">
          <div><span className="text-slate-400 text-xs">Paciente: </span>{nombreCompleto}</div>
          <div><span className="text-slate-400 text-xs">Edad: </span>{edad != null ? `${edad} años` : '—'}</div>
          <div><span className="text-slate-400 text-xs">CIPNA: </span>{p?.cipna ?? '—'}</div>
          <div><span className="text-slate-400 text-xs">NHC: </span>{p?.nhc ?? '—'}</div>
          <div><span className="text-slate-400 text-xs">Sexo: </span>
            {p?.sexo === 'hombre' ? 'Varón (1)' : p?.sexo === 'mujer' ? 'Mujer (2)' : '—'}
          </div>
          <div><span className="text-slate-400 text-xs">F. nacimiento: </span>
            {p?.fecha_nacimiento ? new Date(p.fecha_nacimiento).toLocaleDateString('es-ES') : '—'}
            {p?.fecha_nacimiento && <span className="text-slate-300 text-xs ml-1">({fmtFecha(p.fecha_nacimiento)})</span>}
          </div>
          <div><span className="text-slate-400 text-xs">F. ingreso: </span>
            {ingreso?.fecha_ingreso ? new Date(ingreso.fecha_ingreso).toLocaleDateString('es-ES') : '—'}
          </div>
          <div><span className="text-slate-400 text-xs">F. alta: </span>
            {ingreso?.fecha_alta ? new Date(ingreso.fecha_alta).toLocaleDateString('es-ES') : <span className="text-amber-500 text-xs">Pendiente de alta</span>}
          </div>
          <div><span className="text-slate-400 text-xs">Servicio: </span>
            <span className="font-mono text-xs">{data.servicio ?? 'GRT'}</span>
          </div>
        </div>
      </div>

      {/* Procedencia y alta */}
      <div className="card p-5 space-y-3">
        <p className="section-title">Episodio</p>
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="label">Procedencia *</label>
            <select className="input" value={data.procedencia ?? ''}
              onChange={e => update('procedencia', e.target.value)}>
              <option value="">— Seleccionar —</option>
              {Object.entries(PROCEDENCIA).map(([v, l]) => (
                <option key={v} value={v}>{l}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="label">Motivo del alta *</label>
            <select className="input" value={data.circunstancia_alta ?? ''}
              onChange={e => update('circunstancia_alta', e.target.value)}>
              <option value="">— Seleccionar —</option>
              {Object.entries(TIPALT).map(([v, l]) => (
                <option key={v} value={v}>{l}</option>
              ))}
            </select>
          </div>
        </div>
      </div>

      {/* Diagnósticos */}
      <div className="card p-5 space-y-4">
        <div className="flex items-center justify-between">
          <p className="section-title mb-0">Diagnósticos CIE-10</p>
          <span className="text-xs text-slate-400">Botón "Al ingreso" = POAD</span>
        </div>

        <FilaDx label="Principal" required
          codigo={data.diagnostico_principal ?? ''}
          desc={data.diagnostico_principal_desc ?? ''}
          poad={data.diagnostico_principal_poad ?? null}
          onCodigo={v => updateDx(0, 'code', v)}
          onDesc={v => updateDx(0, 'desc', v)}
          onPoad={v => updateDx(0, 'poad', v)}
        />

        <div className="border-t pt-4 space-y-4">
          {Array.from({ length: N_SECUNDARIOS }, (_, i) => i + 1).map(n => (
            <FilaDx key={n} label={`Secundario ${n}`}
              codigo={(data as any)[`diagnostico_secundario_${n}`] ?? ''}
              desc={(data as any)[`diagnostico_secundario_${n}_desc`] ?? ''}
              poad={(data as any)[`diagnostico_secundario_${n}_poad`] ?? null}
              onCodigo={v => updateDx(n, 'code', v)}
              onDesc={v => updateDx(n, 'desc', v)}
              onPoad={v => updateDx(n, 'poad', v)}
            />
          ))}
        </div>
      </div>

      {/* Procedimientos */}
      <div className="card p-5 space-y-4">
        <p className="section-title">Procedimientos</p>
        {Array.from({ length: N_PROCEDIMIENTOS }, (_, i) => i + 1).map(n => (
          <FilaProc key={n} label={`Procedimiento ${n}`}
            codigo={(data as any)[`procedimiento_${n}`] ?? ''}
            desc={(data as any)[`procedimiento_${n}_desc`] ?? ''}
            onCodigo={v => updateProc(n, 'code', v)}
            onDesc={v => updateProc(n, 'desc', v)}
          />
        ))}
      </div>

      {/* Notas */}
      <div className="card p-5 space-y-2">
        <p className="section-title">Notas internas</p>
        <textarea className="input min-h-[70px] resize-y text-sm"
          placeholder="Observaciones que no van al CMBD…"
          value={data.notas ?? ''}
          onChange={e => update('notas', e.target.value)}
        />
      </div>

      {/* Completado */}
      <div className="card p-4">
        <button type="button"
          onClick={() => update('completado', !data.completado)}
          className="flex items-center gap-3 w-full text-left">
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
                ? 'Listo para exportar y enviar a administración'
                : 'Marca cuando hayas revisado todos los campos'
              }
            </p>
          </div>
        </button>
      </div>

    </div>
  )
}
