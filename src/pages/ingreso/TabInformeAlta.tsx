import { useEffect, useRef, useState } from 'react'
import { supabase } from '../../lib/supabase'
import type { FilaMedicacion, Ingreso, InformeAlta, InformeIngreso } from '../../types'
import { Download } from 'lucide-react'
import { AutoTextarea } from './AutoTextarea'
import { TablaMedicacion } from './TablaMedicacion'
import { exportarInformeAlta } from '../../lib/exportWord'
import { EscalaBarthel, EscalaLawton, EscalaNPIQ, EscalaGDSFAST, TarjetaEscala, ModalEscala } from '../../components/EscalasClinicas'
import { totalBarthel, totalLawton, totalNPI } from '../../types/escalas'
import type { EscalaClinica } from '../../types/escalas'

type EstadoGuardado = 'inactivo' | 'pendiente' | 'guardando' | 'guardado' | 'error' | 'conflicto'

function TabInformeAlta({ ingresoId, ingreso }: { ingresoId: string; ingreso: Ingreso | null }) {
  const [data, setData] = useState<Partial<InformeAlta & { version: number }>>({})
  const [estado, setEstado] = useState<EstadoGuardado>('inactivo')
  const [informeIngreso, setInformeIngreso] = useState<Partial<InformeIngreso>>({})

  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const dataRef = useRef(data)
  dataRef.current = data
  const saveSeqRef = useRef(0)

  // Escala del ingreso: en lectura, solo para comparar. Escala del
  // alta: editable, con su propio guardado — tabla y ciclo
  // independientes del informe de alta en sí, igual que en el
  // informe de ingreso.
  const [escalaIngreso, setEscalaIngreso] = useState<EscalaClinica>({})
  const [escalaAlta, setEscalaAlta] = useState<EscalaClinica>({})
  const [estadoEscalas, setEstadoEscalas] = useState<EstadoGuardado>('inactivo')
  const [modalEscala, setModalEscala] = useState<
    'ing-barthel' | 'ing-lawton' | 'ing-npi' | 'ing-gdsfast' |
    'alta-barthel' | 'alta-lawton' | 'alta-npi' | 'alta-gdsfast' | null
  >(null)
  const debounceEscalasRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const escalaAltaRef = useRef(escalaAlta)
  escalaAltaRef.current = escalaAlta
  const saveEscalasSeqRef = useRef(0)

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
      // Por ingreso_id de ESTE episodio — en un reingreso nunca puede
      // traer, ni por accidente, las escalas de un ingreso anterior.
      supabase.from('escalas_clinicas').select('*').eq('ingreso_id', ingresoId).eq('momento', 'ingreso').maybeSingle(),
      supabase.from('escalas_clinicas').select('*').eq('ingreso_id', ingresoId).eq('momento', 'alta').maybeSingle(),
    ]).then(([rAlta, rIngreso, rEscalaIngreso, rEscalaAlta]) => {
      const dAlta = rAlta.data as Partial<InformeAlta> | null
      const dIngreso = rIngreso.data as InformeIngreso | null

      setInformeIngreso(dIngreso ?? {})
      setEscalaIngreso((rEscalaIngreso.data as EscalaClinica) ?? {})
      setEscalaAlta((rEscalaAlta.data as EscalaClinica) ?? {})

      let base: Partial<InformeAlta> = dAlta ?? {}
      const yaRellenada = (base.medicacion_estructurada as FilaMedicacion[] | undefined)?.length ?? 0
      if (yaRellenada === 0 && dIngreso?.tratamiento_ingreso_estructurado) {
        base = { ...base, medicacion_estructurada: dIngreso.tratamiento_ingreso_estructurado }
      }
      setData(base)
    })
  }, [ingresoId])

  function updateEscalaAlta(cambios: Partial<EscalaClinica>) {
    if (estadoEscalas === 'conflicto') return
    const next = { ...escalaAltaRef.current, ...cambios }
    setEscalaAlta(next)
    setEstadoEscalas('pendiente')
    if (debounceEscalasRef.current) clearTimeout(debounceEscalasRef.current)
    debounceEscalasRef.current = setTimeout(() => saveEscalaAlta(next), 1500)
  }

  async function saveEscalaAlta(next = escalaAltaRef.current): Promise<void> {
    const miSecuencia = ++saveEscalasSeqRef.current
    setEstadoEscalas('guardando')
    const campos = {
      barthel_respuestas: next.barthel_respuestas ?? null,
      barthel_total: next.barthel_total ?? null,
      lawton_respuestas: next.lawton_respuestas ?? null,
      lawton_total: next.lawton_total ?? null,
      npi_respuestas: next.npi_respuestas ?? null,
      npi_gravedad_total: next.npi_gravedad_total ?? null,
      gds_estadio: next.gds_estadio ?? null,
      fast_estadio: next.fast_estadio ?? null,
    }

    if (next.id) {
      const { data: guardado, error } = await supabase
        .from('escalas_clinicas')
        .update(campos)
        .eq('id', next.id)
        .eq('version', next.version ?? 1)
        .select()
        .maybeSingle()
      if (miSecuencia !== saveEscalasSeqRef.current) return
      if (error) { setEstadoEscalas('error'); return }
      if (!guardado) { setEstadoEscalas('conflicto'); return }
      setEscalaAlta(guardado)
    } else {
      const { data: creado, error } = await supabase
        .from('escalas_clinicas')
        .insert({ ingreso_id: ingresoId, momento: 'alta', ...campos })
        .select()
        .maybeSingle()
      if (miSecuencia !== saveEscalasSeqRef.current) return
      if (error) { setEstadoEscalas('error'); return }
      setEscalaAlta(creado ?? next)
    }
    setEstadoEscalas('guardado')
    setTimeout(() => setEstadoEscalas((e) => (e === 'guardado' ? 'inactivo' : e)), 2500)
  }

  async function recargarEscalaAltaTrasConflicto() {
    const { data: d } = await supabase.from('escalas_clinicas').select('*').eq('ingreso_id', ingresoId).eq('momento', 'alta').maybeSingle()
    setEscalaAlta(d ?? {})
    setEstadoEscalas('inactivo')
  }

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
      </div>

      <div className="card p-6 space-y-6">
        <div className="flex items-center justify-between">
          <p className="section-title mb-0">Escalas clínicas al alta</p>
          <span className="text-xs text-slate-400">
            {estadoEscalas === 'pendiente' && '● Cambios pendientes'}
            {estadoEscalas === 'guardando' && '● Guardando…'}
            {estadoEscalas === 'guardado' && <span className="text-emerald-600">✓ Guardado</span>}
            {estadoEscalas === 'error' && <span className="text-red-600 font-semibold">✗ Error al guardar</span>}
          </span>
        </div>
        {estadoEscalas === 'conflicto' && (
          <div className="bg-amber-50 border border-amber-200 text-amber-800 text-sm rounded-lg px-4 py-3 flex items-center justify-between gap-3">
            <span>Alguien más ha guardado cambios en las escalas mientras las editabas. Lo marcado sigue aquí, sin guardar todavía.</span>
            <button onClick={recargarEscalaAltaTrasConflicto} className="btn-secondary text-xs shrink-0">Ver la versión más reciente</button>
          </div>
        )}

        {/* Comparación — solo se enseñan los números de los dos
            momentos, sin etiquetar ninguna diferencia como mejoría o
            empeoramiento: la dirección no se interpreta igual en
            todas las escalas. */}
        <div className="overflow-x-auto">
          <table className="w-full text-sm border-collapse">
            <thead>
              <tr className="border-b bg-slate-50 text-left text-xs font-semibold text-slate-500 uppercase tracking-wide">
                <th className="px-3 py-2">Escala</th>
                <th className="px-3 py-2 text-right">Ingreso</th>
                <th className="px-3 py-2 text-right">Alta</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              <tr>
                <td className="px-3 py-2 text-slate-600">Barthel</td>
                <td className="px-3 py-2 text-right tabular-nums">{escalaIngreso.barthel_total != null ? `${escalaIngreso.barthel_total}/100` : '—'}</td>
                <td className="px-3 py-2 text-right tabular-nums font-medium text-slate-800">{escalaAlta.barthel_total != null ? `${escalaAlta.barthel_total}/100` : 'Incompleta'}</td>
              </tr>
              <tr>
                <td className="px-3 py-2 text-slate-600">Lawton</td>
                <td className="px-3 py-2 text-right tabular-nums">{escalaIngreso.lawton_total != null ? `${escalaIngreso.lawton_total}/8` : '—'}</td>
                <td className="px-3 py-2 text-right tabular-nums font-medium text-slate-800">{escalaAlta.lawton_total != null ? `${escalaAlta.lawton_total}/8` : 'Incompleta'}</td>
              </tr>
              <tr>
                <td className="px-3 py-2 text-slate-600">NPI-Q gravedad</td>
                <td className="px-3 py-2 text-right tabular-nums">{escalaIngreso.npi_gravedad_total != null ? `${escalaIngreso.npi_gravedad_total}/36` : '—'}</td>
                <td className="px-3 py-2 text-right tabular-nums font-medium text-slate-800">{escalaAlta.npi_gravedad_total != null ? `${escalaAlta.npi_gravedad_total}/36` : 'Incompleta'}</td>
              </tr>
              <tr>
                <td className="px-3 py-2 text-slate-600">GDS / FAST</td>
                <td className="px-3 py-2 text-right tabular-nums">
                  {escalaIngreso.gds_estadio ? `GDS ${escalaIngreso.gds_estadio}` : '—'}
                  {escalaIngreso.fast_estadio ? ` · FAST ${escalaIngreso.fast_estadio}` : ''}
                </td>
                <td className="px-3 py-2 text-right tabular-nums font-medium text-slate-800">
                  {escalaAlta.gds_estadio ? `GDS ${escalaAlta.gds_estadio}` : '—'}
                  {escalaAlta.fast_estadio ? ` · FAST ${escalaAlta.fast_estadio}` : ''}
                </td>
              </tr>
            </tbody>
          </table>
        </div>

        <div>
          <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-2">Resultado del ingreso (lectura)</p>
          <div className="space-y-2">
            <TarjetaEscala titulo="Índice de Barthel" soloLectura onAbrir={() => setModalEscala('ing-barthel')}
              resultado={escalaIngreso.barthel_total != null ? `${escalaIngreso.barthel_total}/100` : '—'}
              incompleta={escalaIngreso.barthel_total == null} />
            <TarjetaEscala titulo="Índice de Lawton" soloLectura onAbrir={() => setModalEscala('ing-lawton')}
              resultado={escalaIngreso.lawton_total != null ? `${escalaIngreso.lawton_total}/8` : '—'}
              incompleta={escalaIngreso.lawton_total == null} />
            <TarjetaEscala titulo="NPI-Q (gravedad)" soloLectura onAbrir={() => setModalEscala('ing-npi')}
              resultado={escalaIngreso.npi_gravedad_total != null ? `${escalaIngreso.npi_gravedad_total}/36` : '—'}
              incompleta={escalaIngreso.npi_gravedad_total == null} />
            <TarjetaEscala titulo="GDS / FAST" soloLectura onAbrir={() => setModalEscala('ing-gdsfast')}
              resultado={escalaIngreso.gds_estadio || escalaIngreso.fast_estadio ? `GDS ${escalaIngreso.gds_estadio ?? '—'} · FAST ${escalaIngreso.fast_estadio ?? '—'}` : '—'}
              incompleta={!escalaIngreso.gds_estadio && !escalaIngreso.fast_estadio} />
          </div>
        </div>

        <div>
          <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-2">Escala al alta</p>
          <div className="space-y-2">
            <TarjetaEscala titulo="Índice de Barthel" onAbrir={() => setModalEscala('alta-barthel')}
              resultado={escalaAlta.barthel_total != null ? `${escalaAlta.barthel_total}/100` : 'Incompleta'}
              incompleta={escalaAlta.barthel_total == null} />
            <TarjetaEscala titulo="Índice de Lawton" onAbrir={() => setModalEscala('alta-lawton')}
              resultado={escalaAlta.lawton_total != null ? `${escalaAlta.lawton_total}/8` : 'Incompleta'}
              incompleta={escalaAlta.lawton_total == null} />
            <TarjetaEscala titulo="NPI-Q (gravedad)" onAbrir={() => setModalEscala('alta-npi')}
              resultado={escalaAlta.npi_gravedad_total != null ? `${escalaAlta.npi_gravedad_total}/36` : 'Incompleta'}
              incompleta={escalaAlta.npi_gravedad_total == null} />
            <TarjetaEscala titulo="GDS / FAST" onAbrir={() => setModalEscala('alta-gdsfast')}
              resultado={escalaAlta.gds_estadio || escalaAlta.fast_estadio ? `GDS ${escalaAlta.gds_estadio ?? '—'} · FAST ${escalaAlta.fast_estadio ?? '—'}` : 'Incompleta'}
              incompleta={!escalaAlta.gds_estadio && !escalaAlta.fast_estadio} />
          </div>
        </div>

        {modalEscala === 'ing-barthel' && (
          <ModalEscala titulo="Índice de Barthel — al ingreso" onCerrar={() => setModalEscala(null)}>
            <EscalaBarthel value={escalaIngreso.barthel_respuestas} disabled onChange={() => {}} />
          </ModalEscala>
        )}
        {modalEscala === 'ing-lawton' && (
          <ModalEscala titulo="Índice de Lawton — al ingreso" onCerrar={() => setModalEscala(null)}>
            <EscalaLawton value={escalaIngreso.lawton_respuestas} disabled onChange={() => {}} />
          </ModalEscala>
        )}
        {modalEscala === 'ing-npi' && (
          <ModalEscala titulo="NPI-Q — al ingreso" onCerrar={() => setModalEscala(null)}>
            <EscalaNPIQ value={escalaIngreso.npi_respuestas} disabled onChange={() => {}} />
          </ModalEscala>
        )}
        {modalEscala === 'ing-gdsfast' && (
          <ModalEscala titulo="GDS / FAST — al ingreso" onCerrar={() => setModalEscala(null)}>
            <EscalaGDSFAST gds={escalaIngreso.gds_estadio} fast={escalaIngreso.fast_estadio} disabled onCambiarGds={() => {}} onChangeFast={() => {}} />
          </ModalEscala>
        )}

        {modalEscala === 'alta-barthel' && (
          <ModalEscala titulo="Índice de Barthel — al alta" onCerrar={() => setModalEscala(null)}>
            <EscalaBarthel value={escalaAlta.barthel_respuestas}
              onChange={(v) => updateEscalaAlta({ barthel_respuestas: v, barthel_total: totalBarthel(v) })} />
          </ModalEscala>
        )}
        {modalEscala === 'alta-lawton' && (
          <ModalEscala titulo="Índice de Lawton — al alta" onCerrar={() => setModalEscala(null)}>
            <EscalaLawton value={escalaAlta.lawton_respuestas}
              onChange={(v) => updateEscalaAlta({ lawton_respuestas: v, lawton_total: totalLawton(v) })} />
          </ModalEscala>
        )}
        {modalEscala === 'alta-npi' && (
          <ModalEscala titulo="NPI-Q — al alta" onCerrar={() => setModalEscala(null)}>
            <EscalaNPIQ value={escalaAlta.npi_respuestas}
              onChange={(v) => updateEscalaAlta({ npi_respuestas: v, npi_gravedad_total: totalNPI(v) })} />
          </ModalEscala>
        )}
        {modalEscala === 'alta-gdsfast' && (
          <ModalEscala titulo="GDS / FAST — al alta" onCerrar={() => setModalEscala(null)}>
            <EscalaGDSFAST gds={escalaAlta.gds_estadio} fast={escalaAlta.fast_estadio}
              onCambiarGds={(gds, fastDirecto) => updateEscalaAlta({ gds_estadio: gds, fast_estadio: fastDirecto ?? '' })}
              onChangeFast={(v) => updateEscalaAlta({ fast_estadio: v })} />
          </ModalEscala>
        )}
      </div>

      <div className="card p-6 space-y-4">
        <p className="section-title">Diagnósticos</p>
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
            await exportarInformeAlta(ingreso, informeIngreso as InformeIngreso, data as InformeAlta, escalaIngreso, escalaAlta)
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
