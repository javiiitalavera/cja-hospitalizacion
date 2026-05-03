import { useEffect, useState, useRef } from 'react'
import { supabase } from '../../lib/supabase'
import type { Ingreso, InformeIngreso, InformeAlta } from '../../types'
import { Download } from 'lucide-react'
import { AutoTextarea } from './AutoTextarea'
import { exportarInformeAlta } from '../../lib/exportWord'

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

  const [saveError, setSaveError] = useState(false)

  async function save(d = dataRef.current) {
    setSaving(true)
    setSaveError(false)
    const { error } = await supabase.from('informe_alta').upsert({ ...d, ingreso_id: ingresoId })
    setSaving(false)
    if (error) { setSaveError(true); return }
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
          {saveError && <span className="flex items-center gap-1.5 text-red-600 font-semibold"><span className="w-1.5 h-1.5 rounded-full bg-red-500 inline-block"/> Error al guardar — comprueba la conexión</span>}
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


export { TabInformeAlta }
