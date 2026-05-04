import { useEffect, useRef, useState } from 'react'
import { supabase } from '../../lib/supabase'
import type { FilaMedicacion, Ingreso, InformeAlta, InformeIngreso } from '../../types'
import { Download, Plus, Trash2 } from 'lucide-react'
import { AutoTextarea } from './AutoTextarea'
import { exportarInformeAlta } from '../../lib/exportWord'

// ─── TOMAS ───────────────────────────────────────────────────

const TOMAS: { key: keyof FilaMedicacion; label: string }[] = [
  { key: 'desayuno', label: 'Desayuno' },
  { key: 'comida',   label: 'Comida' },
  { key: 'merienda', label: 'Merienda' },
  { key: 'cena',     label: 'Cena' },
  { key: 'acostar',  label: 'Acostar' },
]

function filaVacia(): FilaMedicacion {
  return { farmaco: '', dosis: '', desayuno: '', comida: '', merienda: '', cena: '', acostar: '', observaciones: '' }
}

// ─── TABLA MEDICACIÓN ─────────────────────────────────────────

function TablaMedicacion({ filas, onChange }: {
  filas: FilaMedicacion[]
  onChange: (filas: FilaMedicacion[]) => void
}) {
  function update(i: number, key: keyof FilaMedicacion, v: string) {
    const next = filas.map((f, idx) => idx === i ? { ...f, [key]: v } : f)
    onChange(next)
  }

  function añadir() { onChange([...filas, filaVacia()]) }

  function eliminar(i: number) { onChange(filas.filter((_, idx) => idx !== i)) }

  return (
    <div className="space-y-2">
      <div className="overflow-x-auto">
        <table className="w-full text-xs border-collapse">
          <thead>
            <tr className="bg-slate-100">
              <th className="border border-slate-200 px-2 py-2 text-left font-semibold text-slate-600 min-w-[160px]">Fármaco</th>
              <th className="border border-slate-200 px-2 py-2 text-left font-semibold text-slate-600 min-w-[80px]">Dosis</th>
              {TOMAS.map(t => (
                <th key={t.key} className="border border-slate-200 px-2 py-2 text-center font-semibold text-slate-600 min-w-[70px]">
                  {t.label}
                </th>
              ))}
              <th className="border border-slate-200 px-2 py-2 text-left font-semibold text-slate-600 min-w-[120px]">Observaciones</th>
              <th className="border border-slate-200 w-8"></th>
            </tr>
          </thead>
          <tbody>
            {filas.length === 0 ? (
              <tr>
                <td colSpan={9} className="border border-slate-200 px-4 py-4 text-center text-slate-400 italic">
                  Sin medicación añadida
                </td>
              </tr>
            ) : filas.map((f, i) => (
              <tr key={i} className="hover:bg-slate-50">
                <td className="border border-slate-200 p-1">
                  <input className="w-full bg-transparent px-1 py-0.5 focus:outline-none focus:bg-white focus:ring-1 focus:ring-primary-300 rounded text-slate-800"
                    value={f.farmaco} placeholder="Nombre del fármaco…"
                    onChange={e => update(i, 'farmaco', e.target.value)} />
                </td>
                <td className="border border-slate-200 p-1">
                  <input className="w-full bg-transparent px-1 py-0.5 focus:outline-none focus:bg-white focus:ring-1 focus:ring-primary-300 rounded text-slate-600"
                    value={f.dosis} placeholder="ej. 10 mg"
                    onChange={e => update(i, 'dosis', e.target.value)} />
                </td>
                {TOMAS.map(t => (
                  <td key={t.key} className="border border-slate-200 p-1 text-center">
                    <input className="w-full bg-transparent px-1 py-0.5 focus:outline-none focus:bg-white focus:ring-1 focus:ring-primary-300 rounded text-center text-slate-700"
                      value={f[t.key]} placeholder="—"
                      onChange={e => update(i, t.key, e.target.value)} />
                  </td>
                ))}
                <td className="border border-slate-200 p-1">
                  <input className="w-full bg-transparent px-1 py-0.5 focus:outline-none focus:bg-white focus:ring-1 focus:ring-primary-300 rounded text-slate-500"
                    value={f.observaciones} placeholder="Si precisa…"
                    onChange={e => update(i, 'observaciones', e.target.value)} />
                </td>
                <td className="border border-slate-200 p-1 text-center">
                  <button type="button" onClick={() => eliminar(i)}
                    className="text-slate-300 hover:text-red-500 transition-colors">
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <button type="button" onClick={añadir}
        className="flex items-center gap-1.5 text-xs text-primary-600 hover:text-primary-800 font-medium transition-colors py-1">
        <Plus className="w-3.5 h-3.5" /> Añadir fármaco
      </button>
    </div>
  )
}

// ─── TAB INFORME ALTA ─────────────────────────────────────────

function TabInformeAlta({ ingresoId, ingreso }: { ingresoId: string; ingreso: Ingreso | null }) {
  const [data, setData] = useState<Partial<InformeAlta>>({})
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [saveError, setSaveError] = useState(false)
  const [informeIngreso, setInformeIngreso] = useState<Partial<InformeIngreso>>({})

  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const dataRef = useRef(data)
  dataRef.current = data

  useEffect(() => {
    supabase.from('informe_alta').select('*').eq('ingreso_id', ingresoId).single()
      .then(({ data: d }) => { if (d) setData(d) })
    supabase.from('informe_ingreso').select('*').eq('ingreso_id', ingresoId).single()
      .then(({ data: d }) => { if (d) setInformeIngreso(d) })
  }, [ingresoId])

  async function save(d = dataRef.current) {
    setSaving(true); setSaveError(false)
    const { error } = await supabase.from('informe_alta').upsert({ ...d, ingreso_id: ingresoId })
    setSaving(false)
    if (error) { setSaveError(true); return }
    setSaved(true)
    setTimeout(() => setSaved(false), 2000)
  }

  function update(key: keyof InformeAlta, value: any) {
    const next = { ...dataRef.current, [key]: value }
    setData(next)
    if (debounceRef.current) clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(() => save(next), 1500)
  }

  function updateMedicacion(filas: FilaMedicacion[]) {
    update('medicacion_estructurada', filas)
  }

  const field = (key: keyof InformeAlta, label: string) => (
    <div key={key}>
      <span className="label">{label}</span>
      <AutoTextarea value={(data[key] as string) ?? ''} onChange={(v) => update(key, v)} />
    </div>
  )

  const filasMed: FilaMedicacion[] = (data.medicacion_estructurada as FilaMedicacion[]) ?? []

  return (
    <div className="max-w-3xl space-y-6">

      {/* Estado guardado */}
      <div className="flex items-center justify-between">
        <div className="bg-blue-50 border border-blue-200 rounded-lg px-4 py-2 text-xs text-blue-700">
          Los antecedentes e informe de ingreso se heredan al exportar a Word.
        </div>
        <div className="text-xs text-slate-400">
          {saving && <span className="flex items-center gap-1"><span className="w-1.5 h-1.5 rounded-full bg-amber-400 animate-pulse inline-block" /> Guardando…</span>}
          {!saving && saved && <span className="flex items-center gap-1"><span className="w-1.5 h-1.5 rounded-full bg-emerald-500 inline-block" /> Guardado</span>}
          {saveError && <span className="flex items-center gap-1.5 text-red-600 font-semibold"><span className="w-1.5 h-1.5 rounded-full bg-red-500 inline-block" /> Error al guardar — comprueba la conexión</span>}
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

        <div>
          <span className="label">Medicación al alta</span>
          <TablaMedicacion filas={filasMed} onChange={updateMedicacion} />
        </div>

        {field('otras_recomendaciones', 'Otras recomendaciones')}
      </div>

      <div className="flex justify-end gap-3">
        <button type="button"
          onClick={async () => {
            if (!ingreso) return
            await save()
            await exportarInformeAlta(ingreso, informeIngreso as InformeIngreso, data as InformeAlta)
          }}
          className="btn-secondary">
          <Download className="w-4 h-4" />
          Exportar Word
        </button>
        <button type="button" onClick={() => save()} className="btn-primary">
          Guardar ahora
        </button>
      </div>
    </div>
  )
}

export { TabInformeAlta }
