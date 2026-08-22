import { useEffect, useRef, useState } from 'react'
import { supabase } from '../../lib/supabase'
import type { FilaMedicacion, Ingreso, InformeIngreso } from '../../types'
import { Download } from 'lucide-react'
import { AutoTextarea } from './AutoTextarea'
import { TablaMedicacion } from './TablaMedicacion'
import { exportarInformeIngreso } from '../../lib/exportWord'

function TabInformeIngreso({ ingresoId, ingreso }: { ingresoId: string; ingreso: Ingreso | null }) {
  const [data, setData] = useState<Partial<InformeIngreso>>({})
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [saveError, setSaveError] = useState(false)
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const dataRef = useRef(data)
  dataRef.current = data

  useEffect(() => {
    supabase.from('informe_ingreso').select('*').eq('ingreso_id', ingresoId).single()
      .then(({ data: d }) => { if (d) setData(d) })
  }, [ingresoId])

  async function save(d = dataRef.current) {
    setSaving(true)
    setSaveError(false)
    const { error } = await supabase.from('informe_ingreso').upsert({ ...d, ingreso_id: ingresoId })
    setSaving(false)
    if (error) { setSaveError(true); return }
    setSaved(true)
    setTimeout(() => setSaved(false), 2000)
  }

  function update(key: keyof InformeIngreso, value: any) {
    const next = { ...dataRef.current, [key]: value }
    setData(next)
    if (debounceRef.current) clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(() => save(next), 1500)
  }

  const field = (key: keyof InformeIngreso, label: string) => (
    <div key={key}>
      <span className="label">{label}</span>
      <AutoTextarea value={(data[key] as string) ?? ''} onChange={(v) => update(key, v)} />
    </div>
  )

  const filasIngreso: FilaMedicacion[] = (data.tratamiento_ingreso_estructurado as FilaMedicacion[]) ?? []

  return (
    <div className="max-w-3xl space-y-6">
      <div className="flex items-center justify-end gap-3 text-xs text-slate-400">
        {saving && <span className="flex items-center gap-1"><span className="w-1.5 h-1.5 rounded-full bg-amber-400 animate-pulse inline-block" /> Guardando…</span>}
        {!saving && saved && <span className="flex items-center gap-1"><span className="w-1.5 h-1.5 rounded-full bg-emerald-500 inline-block" /> Guardado</span>}
        {saveError && <span className="flex items-center gap-1.5 text-red-600 font-semibold"><span className="w-1.5 h-1.5 rounded-full bg-red-500 inline-block" /> Error al guardar — comprueba la conexión</span>}
      </div>

      <div className="card p-6 space-y-4">
        <p className="section-title">Antecedentes patológicos</p>
        {field('alergias', 'Alergias')}
        {field('antecedentes_medicos', 'Antecedentes médicos')}
        {field('antecedentes_quirurgicos', 'Intervenciones quirúrgicas')}
        {field('antecedentes_familiares', 'Antecedentes familiares')}
        <div>
          <span className="label">Tratamiento al ingreso</span>
          <TablaMedicacion filas={filasIngreso}
            onChange={v => update('tratamiento_ingreso_estructurado', v)} />
        </div>
      </div>

      <div className="card p-6 space-y-4">
        <p className="section-title">Valoración Geriátrica Integral</p>
        {field('vgi_social', 'Social')}
        {field('vgi_funcional', 'Funcional')}
        <div className="grid grid-cols-2 gap-4">
          <div>
            <span className="label">I. Barthel (/100)</span>
            <input type="number" min={0} max={100} className="input"
              value={data.barthel ?? ''}
              onChange={e => update('barthel', e.target.value === '' ? undefined : parseInt(e.target.value, 10))} />
          </div>
          <div>
            <span className="label">I. Lawton (/8)</span>
            <input type="number" min={0} max={8} className="input"
              value={data.lawton ?? ''}
              onChange={e => update('lawton', e.target.value === '' ? undefined : parseInt(e.target.value, 10))} />
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
        <button type="button"
          onClick={async () => {
            if (!ingreso) return
            await save()
            await exportarInformeIngreso(ingreso, data as InformeIngreso)
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

export { TabInformeIngreso }
