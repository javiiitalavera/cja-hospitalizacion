import { useEffect, useRef, useState } from 'react'
import { supabase } from '../../lib/supabase'
import type { FilaMedicacion, Ingreso, InformeAlta, InformeIngreso } from '../../types'
import { Download } from 'lucide-react'
import { AutoTextarea } from './AutoTextarea'
import { TablaMedicacion } from './TablaMedicacion'
import { exportarInformeAlta } from '../../lib/exportWord'

type EstadoGuardado = 'inactivo' | 'pendiente' | 'guardando' | 'guardado' | 'error' | 'conflicto'

function TabInformeAlta({ ingresoId, ingreso }: { ingresoId: string; ingreso: Ingreso | null }) {
  const [data, setData] = useState<Partial<InformeAlta & { version: number }>>({})
  const [estado, setEstado] = useState<EstadoGuardado>('inactivo')
  const [informeIngreso, setInformeIngreso] = useState<Partial<InformeIngreso>>({})

  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const dataRef = useRef(data)
  dataRef.current = data
  const saveSeqRef = useRef(0)

  useEffect(() => {
    // Se cargan las dos fuentes en paralelo y se espera a que ambas
    // terminen antes de fijar el estado, calculándolo una sola vez.
    // (Si cada una fijase el estado por separado en su propio then(),
    // la que resolviera más tarde podría pisar lo que la otra ya
    // había combinado — en concreto, borraría la medicación heredada
    // del ingreso si "informe_alta" resolviera después.)
    Promise.all([
      supabase.from('informe_alta').select('*').eq('ingreso_id', ingresoId).maybeSingle(),
      supabase.from('informe_ingreso').select('*').eq('ingreso_id', ingresoId).maybeSingle(),
    ]).then(([rAlta, rIngreso]) => {
      const dAlta = rAlta.data as Partial<InformeAlta> | null
      const dIngreso = rIngreso.data as InformeIngreso | null

      setInformeIngreso(dIngreso ?? {})

      let base: Partial<InformeAlta> = dAlta ?? {}
      const yaRellenada = (base.medicacion_estructurada as FilaMedicacion[] | undefined)?.length ?? 0
      if (yaRellenada === 0 && dIngreso?.tratamiento_ingreso_estructurado) {
        base = { ...base, medicacion_estructurada: dIngreso.tratamiento_ingreso_estructurado }
      }
      setData(base)
    })
  }, [ingresoId])

  async function save(d = dataRef.current): Promise<boolean> {
    const miSecuencia = ++saveSeqRef.current
    setEstado('guardando')
    const { data: guardado, error } = await supabase
      .from('informe_alta')
      .update(d)
      .eq('ingreso_id', ingresoId)
      .eq('version', d.version ?? 1)
      .select()
      .maybeSingle()
    if (miSecuencia !== saveSeqRef.current) return true
    if (error) { setEstado('error'); return false }
    if (!guardado) {
      // Igual que en informe de ingreso: el texto escrito se queda
      // en pantalla, no se pisa ni se recarga sin avisar.
      setEstado('conflicto')
      return false
    }
    setData(guardado)
    setEstado('guardado')
    setTimeout(() => setEstado((e) => (e === 'guardado' ? 'inactivo' : e)), 2500)
    return true
  }

  async function recargarTrasConflicto() {
    const { data: d } = await supabase.from('informe_alta').select('*').eq('ingreso_id', ingresoId).maybeSingle()
    setData(d ?? {})
    setEstado('inactivo')
  }

  function update(key: keyof InformeAlta, value: any) {
    if (estado === 'conflicto') return
    const next = { ...dataRef.current, [key]: value }
    setData(next)
    setEstado('pendiente')
    if (debounceRef.current) clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(() => save(next), 1500)
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

      <div className="flex items-center justify-between">
        <div className="bg-blue-50 border border-blue-200 rounded-lg px-4 py-2 text-xs text-blue-700">
          Los antecedentes e informe de ingreso se heredan al exportar. La medicación al alta se pre-rellena desde el tratamiento al ingreso.
        </div>
        <div className="text-xs text-slate-400 shrink-0 ml-3 flex items-center gap-1">
          {estado === 'pendiente' && <span className="flex items-center gap-1"><span className="w-1.5 h-1.5 rounded-full bg-slate-400 inline-block" /> Cambios pendientes</span>}
          {estado === 'guardando' && <span className="flex items-center gap-1"><span className="w-1.5 h-1.5 rounded-full bg-amber-400 animate-pulse inline-block" /> Guardando…</span>}
          {estado === 'guardado' && <span className="flex items-center gap-1"><span className="w-1.5 h-1.5 rounded-full bg-emerald-500 inline-block" /> Guardado</span>}
          {estado === 'error' && <span className="flex items-center gap-1.5 text-red-600 font-semibold"><span className="w-1.5 h-1.5 rounded-full bg-red-500 inline-block" /> Error al guardar — comprueba la conexión</span>}
        </div>
      </div>

      {estado === 'conflicto' && (
        <div className="bg-amber-50 border border-amber-200 text-amber-800 text-sm rounded-lg px-4 py-3 flex items-center justify-between gap-3">
          <span>Alguien más ha guardado cambios en este informe mientras lo editabas. Lo que has escrito sigue aquí, sin guardar todavía.</span>
          <button onClick={recargarTrasConflicto} className="btn-secondary text-xs shrink-0">Ver la versión más reciente</button>
        </div>
      )}

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
          <p className="text-xs text-slate-400 mb-2">Pre-rellenada desde el tratamiento al ingreso. Edita lo que necesites.</p>
          <TablaMedicacion filas={filasMed}
            onChange={v => update('medicacion_estructurada', v)} />
        </div>
        {field('otras_recomendaciones', 'Otras recomendaciones')}
      </div>

      <div className="flex justify-end gap-3">
        <button type="button"
          onClick={async () => {
            if (!ingreso) return
            const ok = await save()
            if (!ok) return
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
