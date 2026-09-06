import { useEffect, useRef, useState } from 'react'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../lib/AuthContext'
import type { FilaMedicacion, Ingreso, InformeIngreso } from '../../types'
import { Download, Lock } from 'lucide-react'
import { AutoTextarea } from './AutoTextarea'
import { TablaMedicacion } from './TablaMedicacion'
import { exportarInformeIngreso } from '../../lib/exportWord'
import { EscalaBarthel, EscalaLawton, EscalaNPIQ, EscalaGDSFAST, TarjetaEscala, ModalEscala } from '../../components/EscalasClinicas'
import { totalBarthel, totalLawton, totalNPI } from '../../types/escalas'
import type { EscalaClinica } from '../../types/escalas'

type EstadoGuardado = 'inactivo' | 'pendiente' | 'guardando' | 'guardado' | 'error' | 'conflicto'

function TabInformeIngreso({ ingresoId, ingreso }: { ingresoId: string; ingreso: Ingreso | null }) {
  const { rol } = useAuth()
  const esMedico = rol === 'medico'
  const [data, setData] = useState<Partial<InformeIngreso & { version: number }>>({})
  const [estado, setEstado] = useState<EstadoGuardado>('inactivo')
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const dataRef = useRef(data)
  dataRef.current = data
  const saveSeqRef = useRef(0)

  // Escalas clínicas: tabla y ciclo de guardado propios, separados
  // del informe — cada una tiene su propia versión, y a diferencia
  // del informe (que siempre existe ya creado), la fila de escalas
  // no existe hasta el primer guardado.
  const [escalas, setEscalas] = useState<EscalaClinica>({})
  const [estadoEscalas, setEstadoEscalas] = useState<EstadoGuardado>('inactivo')
  const [modalEscala, setModalEscala] = useState<'barthel' | 'lawton' | 'npi' | 'gdsfast' | null>(null)
  const debounceEscalasRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const escalasRef = useRef(escalas)
  escalasRef.current = escalas
  const saveEscalasSeqRef = useRef(0)

  // El informe de alta se apoya en los antecedentes, alergias,
  // exploraciones y tratamiento de este informe — si se detecta un
  // error después del alta, tiene que poder corregirse. Por eso ya
  // no se bloquea por el estado del episodio, solo por el rol: un
  // médico puede seguir editándolo, el resto de roles nunca ha
  // podido y sigue sin poder.
  const soloLectura = !esMedico
  const episodioCerrado = ingreso != null && ingreso.estado !== 'activo'

  useEffect(() => {
    supabase.from('informe_ingreso').select('*').eq('ingreso_id', ingresoId).maybeSingle()
      .then(({ data: d }) => setData(d ?? {}))
    // Se busca por ingreso_id (el de ESTE episodio, siempre nuevo en
    // un reingreso) — nunca puede traer, ni por accidente, las
    // escalas de un ingreso anterior del mismo paciente.
    supabase.from('escalas_clinicas').select('*').eq('ingreso_id', ingresoId).eq('momento', 'ingreso').maybeSingle()
      .then(({ data: d }) => setEscalas(d ?? {}))
  }, [ingresoId])

  function updateEscala(cambios: Partial<EscalaClinica>) {
    if (soloLectura || estadoEscalas === 'conflicto') return
    const next = { ...escalasRef.current, ...cambios }
    setEscalas(next)
    setEstadoEscalas('pendiente')
    if (debounceEscalasRef.current) clearTimeout(debounceEscalasRef.current)
    debounceEscalasRef.current = setTimeout(() => saveEscalas(next), 1500)
  }

  async function saveEscalas(next = escalasRef.current): Promise<void> {
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
      // Ya existe la fila: actualizar con la versión que se leyó.
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
      setEscalas(guardado)
    } else {
      // Primer guardado: todavía no existe la fila.
      const { data: creado, error } = await supabase
        .from('escalas_clinicas')
        .insert({ ingreso_id: ingresoId, momento: 'ingreso', ...campos })
        .select()
        .maybeSingle()
      if (miSecuencia !== saveEscalasSeqRef.current) return
      if (error) { setEstadoEscalas('error'); return }
      setEscalas(creado ?? next)
    }
    setEstadoEscalas('guardado')
    setTimeout(() => setEstadoEscalas((e) => (e === 'guardado' ? 'inactivo' : e)), 2500)
  }

  async function recargarEscalasTrasConflicto() {
    const { data: d } = await supabase.from('escalas_clinicas').select('*').eq('ingreso_id', ingresoId).eq('momento', 'ingreso').maybeSingle()
    setEscalas(d ?? {})
    setEstadoEscalas('inactivo')
  }

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
            <Lock className="w-3.5 h-3.5" /> Solo lectura: solo un médico puede editar este informe.
          </span>
        ) : episodioCerrado ? (
          <span className="flex items-center gap-1.5 text-xs text-amber-600 bg-amber-50 border border-amber-200 rounded-full px-2.5 py-1">
            <Lock className="w-3.5 h-3.5" /> Episodio cerrado. Las modificaciones realizadas quedarán registradas en Auditoría.
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

      <div className="card p-6 space-y-6">
        <div className="flex items-center justify-between">
          <p className="section-title mb-0">Escalas clínicas al ingreso</p>
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
            <button onClick={recargarEscalasTrasConflicto} className="btn-secondary text-xs shrink-0">Ver la versión más reciente</button>
          </div>
        )}
        {/* Tarjetas, no las cuatro escalas desplegadas — cada una se
            rellena en su propio modal, sin convertir el informe en
            un scroll interminable. */}
        <div className="space-y-2">
          <TarjetaEscala titulo="Índice de Barthel" onAbrir={() => setModalEscala('barthel')} soloLectura={soloLectura}
            resultado={escalas.barthel_total != null ? `${escalas.barthel_total}/100` : 'Incompleta'}
            incompleta={escalas.barthel_total == null} />
          <TarjetaEscala titulo="Índice de Lawton" onAbrir={() => setModalEscala('lawton')} soloLectura={soloLectura}
            resultado={escalas.lawton_total != null ? `${escalas.lawton_total}/8` : 'Incompleta'}
            incompleta={escalas.lawton_total == null} />
          <TarjetaEscala titulo="NPI-Q (gravedad)" onAbrir={() => setModalEscala('npi')} soloLectura={soloLectura}
            resultado={escalas.npi_gravedad_total != null ? `${escalas.npi_gravedad_total}/36` : 'Incompleta'}
            incompleta={escalas.npi_gravedad_total == null} />
          <TarjetaEscala titulo="GDS / FAST" onAbrir={() => setModalEscala('gdsfast')} soloLectura={soloLectura}
            resultado={escalas.gds_estadio || escalas.fast_estadio ? `GDS ${escalas.gds_estadio ?? '—'} · FAST ${escalas.fast_estadio ?? '—'}` : 'Incompleta'}
            incompleta={!escalas.gds_estadio && !escalas.fast_estadio} />
        </div>

        {modalEscala === 'barthel' && (
          <ModalEscala titulo="Índice de Barthel" onCerrar={() => setModalEscala(null)}>
            <EscalaBarthel value={escalas.barthel_respuestas} disabled={soloLectura}
              onChange={(v) => updateEscala({ barthel_respuestas: v, barthel_total: totalBarthel(v) })} />
          </ModalEscala>
        )}
        {modalEscala === 'lawton' && (
          <ModalEscala titulo="Índice de Lawton" onCerrar={() => setModalEscala(null)}>
            <EscalaLawton value={escalas.lawton_respuestas} disabled={soloLectura}
              onChange={(v) => updateEscala({ lawton_respuestas: v, lawton_total: totalLawton(v) })} />
          </ModalEscala>
        )}
        {modalEscala === 'npi' && (
          <ModalEscala titulo="NPI-Q (gravedad)" onCerrar={() => setModalEscala(null)}>
            <EscalaNPIQ value={escalas.npi_respuestas} disabled={soloLectura}
              onChange={(v) => updateEscala({ npi_respuestas: v, npi_gravedad_total: totalNPI(v) })} />
          </ModalEscala>
        )}
        {modalEscala === 'gdsfast' && (
          <ModalEscala titulo="GDS (Reisberg) y FAST" onCerrar={() => setModalEscala(null)}>
            <EscalaGDSFAST gds={escalas.gds_estadio} fast={escalas.fast_estadio} disabled={soloLectura}
              onCambiarGds={(gds, fastDirecto) => updateEscala({ gds_estadio: gds, fast_estadio: fastDirecto ?? '' })}
              onChangeFast={(v) => updateEscala({ fast_estadio: v })} />
          </ModalEscala>
        )}
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
            await exportarInformeIngreso(ingreso, data as InformeIngreso, escalas)
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
