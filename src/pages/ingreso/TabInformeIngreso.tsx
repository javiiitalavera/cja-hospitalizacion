import { useEffect, useRef, useState } from 'react'
import { supabase } from '../../lib/supabase'
import type { FilaMedicacion, Ingreso, InformeIngreso } from '../../types'
import { Download, Lock } from 'lucide-react'
import { AutoTextarea } from './AutoTextarea'
import { TablaMedicacion } from './TablaMedicacion'
import { exportarInformeIngreso } from '../../lib/exportWord'

type EstadoGuardado = 'inactivo' | 'pendiente' | 'guardando' | 'guardado' | 'error' | 'conflicto'

function TabInformeIngreso({ ingresoId, ingreso }: { ingresoId: string; ingreso: Ingreso | null }) {
  const [data, setData] = useState<Partial<InformeIngreso & { version: number }>>({})
  const [estado, setEstado] = useState<EstadoGuardado>('inactivo')
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const dataRef = useRef(data)
  dataRef.current = data
  const saveSeqRef = useRef(0)

  // Una vez cerrado el episodio, este informe pasa a ser un documento
  // histórico: se puede seguir exportando, pero no editando. El
  // informe de alta es distinto a propósito — ese sí sigue editable
  // después del alta, por decisión explícita.
  const soloLectura = ingreso != null && ingreso.estado !== 'activo'

  useEffect(() => {
    supabase.from('informe_ingreso').select('*').eq('ingreso_id', ingresoId).maybeSingle()
      .then(({ data: d }) => setData(d ?? {}))
  }, [ingresoId])

  async function save(d = dataRef.current): Promise<boolean> {
    const miSecuencia = ++saveSeqRef.current
    setEstado('guardando')
    const { data: guardado, error } = await supabase
      .from('informe_ingreso')
      .update(d)
      .eq('ingreso_id', ingresoId)
      .eq('version', d.version ?? 1)
      .select()
      .maybeSingle()
    if (miSecuencia !== saveSeqRef.current) return true // ya hay un guardado más nuevo en curso; esta respuesta no pinta nada
    if (error) { setEstado('error'); return false }
    if (!guardado) {
      // Nadie ha pisado nada: la actualización simplemente no
      // encontró la versión que se leyó, porque alguien más guardó
      // mientras tanto. El texto que la persona ha escrito se queda
      // tal cual en pantalla — no se descarta ni se recarga sola.
      setEstado('conflicto')
      return false
    }
    setData(guardado)
    setEstado('guardado')
    setTimeout(() => setEstado((e) => (e === 'guardado' ? 'inactivo' : e)), 2500)
    return true
  }

  async function recargarTrasConflicto() {
    const { data: d } = await supabase.from('informe_ingreso').select('*').eq('ingreso_id', ingresoId).maybeSingle()
    setData(d ?? {})
    setEstado('inactivo')
  }

  function update(key: keyof InformeIngreso, value: any) {
    if (soloLectura || estado === 'conflicto') return
    const next = { ...dataRef.current, [key]: value }
    setData(next)
    setEstado('pendiente')
    if (debounceRef.current) clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(() => save(next), 1500)
  }

  const field = (key: keyof InformeIngreso, label: string) => (
    <div key={key}>
      <span className="label">{label}</span>
      <AutoTextarea value={(data[key] as string) ?? ''} onChange={(v) => update(key, v)} disabled={soloLectura} />
    </div>
  )

  const filasIngreso: FilaMedicacion[] = (data.tratamiento_ingreso_estructurado as FilaMedicacion[]) ?? []

  return (
    <div className="max-w-3xl space-y-6">
      <div className="flex items-center justify-between gap-3">
        {soloLectura ? (
          <span className="flex items-center gap-1.5 text-xs text-slate-400">
            <Lock className="w-3.5 h-3.5" /> Episodio cerrado — solo lectura
          </span>
        ) : <span />}
        <div className="flex items-center gap-3 text-xs text-slate-400">
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
        <p className="section-title">Antecedentes patológicos</p>
        {field('alergias', 'Alergias')}
        {field('antecedentes_medicos', 'Antecedentes médicos')}
        {field('antecedentes_quirurgicos', 'Intervenciones quirúrgicas')}
        {field('antecedentes_familiares', 'Antecedentes familiares')}
        <div>
          <span className="label">Tratamiento al ingreso</span>
          <TablaMedicacion filas={filasIngreso}
            onChange={v => update('tratamiento_ingreso_estructurado', v)} disabled={soloLectura} />
        </div>
      </div>

      <div className="card p-6 space-y-4">
        <p className="section-title">Valoración Geriátrica Integral</p>
        {field('vgi_social', 'Social')}
        {field('vgi_funcional', 'Funcional')}
        <div className="grid grid-cols-2 gap-4">
          <div>
            <span className="label">I. Barthel (/100)</span>
            <input type="number" min={0} max={100} className="input" disabled={soloLectura}
              value={data.barthel ?? ''}
              onChange={e => update('barthel', e.target.value === '' ? undefined : parseInt(e.target.value, 10))} />
          </div>
          <div>
            <span className="label">I. Lawton (/8)</span>
            <input type="number" min={0} max={8} className="input" disabled={soloLectura}
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
            if (!soloLectura) {
              const ok = await save()
              if (!ok) return
            }
            await exportarInformeIngreso(ingreso, data as InformeIngreso)
          }}
          className="btn-secondary">
          <Download className="w-4 h-4" />
          Exportar Word
        </button>
        {!soloLectura && (
          <button type="button" onClick={() => save()} className="btn-primary">
            Guardar ahora
          </button>
        )}
      </div>
    </div>
  )
}

export { TabInformeIngreso }
