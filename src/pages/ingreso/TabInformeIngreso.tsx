import { useEffect, useRef, useState } from 'react'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../lib/AuthContext'
import type { FilaMedicacion, Ingreso, InformeIngreso } from '../../types'
import { Download, Lock, AlertTriangle } from 'lucide-react'
import { AutoTextarea, FILAS_CAMPO } from './AutoTextarea'
import { TablaMedicacion } from './TablaMedicacion'
import { exportarInformeIngreso } from '../../lib/exportWord'
import { EscalaBarthel, EscalaLawton, EscalaNPIQ, EscalaGDSFAST, TarjetaEscala, ModalEscala } from '../../components/EscalasClinicas'
import { totalBarthel, totalLawton, totalNPI } from '../../types/escalas'
import { CAMPOS_REVISAR } from '../../lib/reingreso'
import { añadirResumen, textoEscalasCognitivo, textoEscalasFuncional } from '../../lib/resumenEscalas'
import type { EscalaClinica } from '../../types/escalas'
import { AvisoGuardado } from '../../components/AvisoGuardado'
import { useConfirmar } from '../../components/useConfirmar'

// Apartados que no se rellenan siempre: salen plegados ("+ añadir") salvo que ya tengan texto.
const OPCIONALES_VGI: [keyof InformeIngreso, string][] = [
  ['vgi_sensorial', 'Sensorial'], ['vgi_nutricional', 'Nutricional'], ['vgi_dolor', 'Dolor'], ['vgi_otros', 'Otros síndromes geriátricos'],
]
const OPCIONALES_SITUACION: [keyof InformeIngreso, string][] = [
  ['situacion_cognitivo', 'Cognitiva'], ['situacion_conductual', 'Conductual'], ['situacion_animico', 'Anímica'],
  ['situacion_funcional', 'Funcional'], ['situacion_social', 'Social'],
]
// Cada uno sale en su sitio, con su propio "+ añadir" mientras está vacío.
const OPCIONAL_FAMILIARES: [keyof InformeIngreso, string][] = [['antecedentes_familiares', 'Antecedentes familiares']]
const OPCIONAL_PERSONALIDAD: [keyof InformeIngreso, string][] = [['personalidad_previa', 'Personalidad previa']]
const OPCIONALES_EXPLORACION: [keyof InformeIngreso, string][] = [
  ['exploracion_neurologica', 'Exploración neurológica al ingreso'], ['exploracion_psicopatologica', 'Exploración psicopatológica al ingreso'],
]
const CAMPOS_OPCIONALES = [...OPCIONAL_FAMILIARES, ...OPCIONALES_EXPLORACION, ...OPCIONALES_VGI, ...OPCIONAL_PERSONALIDAD, ...OPCIONALES_SITUACION].map(([k]) => k as string)

type EstadoGuardado = 'inactivo' | 'pendiente' | 'guardando' | 'guardado' | 'error' | 'conflicto'

function TabInformeIngreso({ ingresoId, ingreso }: { ingresoId: string; ingreso: Ingreso | null }) {
  const { confirmar, dialogo } = useConfirmar()
  const { esMedico } = useAuth()
  const [data, setData] = useState<Partial<InformeIngreso & { version: number }>>({})
  const [estado, setEstado] = useState<EstadoGuardado>('inactivo')
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const dataRef = useRef(data)
  dataRef.current = data
  const saveSeqRef = useRef(0)
  // Campos opcionales desplegados (los que tienen texto se abren solos) y el último abierto, para darle el foco.
  const [abiertos, setAbiertos] = useState<Set<string>>(new Set())
  const [recienAbierto, setRecienAbierto] = useState<string | null>(null)

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
  const escalasEnCursoRef = useRef<Promise<boolean> | null>(null)   // guardado de escalas en vuelo
  const escalasSuciasRef = useRef(false)                             // hay cambios sin guardar

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
      .then(({ data: d }) => {
        setData(d ?? {})
        setAbiertos(new Set(CAMPOS_OPCIONALES.filter((k) => ((d as Record<string, unknown> | null)?.[k] as string | undefined)?.trim())))
      })
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
    escalasSuciasRef.current = true
    if (debounceEscalasRef.current) clearTimeout(debounceEscalasRef.current)
    debounceEscalasRef.current = setTimeout(() => saveEscalas(next), 1500)
  }

  function saveEscalas(next = escalasRef.current): Promise<boolean> {
    const p = hacerGuardadoEscalas(next)
    escalasEnCursoRef.current = p
    return p
  }

  // «Guardar» del modal de una escala: guarda ya, sin esperar al guardado automático, y avisa.
  async function guardarEscalasDesdeModal(): Promise<boolean> {
    if (estadoEscalas === 'conflicto') return false
    if (debounceEscalasRef.current) { clearTimeout(debounceEscalasRef.current); debounceEscalasRef.current = null }
    if (escalasEnCursoRef.current) await escalasEnCursoRef.current
    if (escalasSuciasRef.current) return saveEscalas()
    // Nada pendiente: ya estaba guardado; se confirma igualmente.
    setEstadoEscalas('guardado')
    setTimeout(() => setEstadoEscalas((e) => (e === 'guardado' ? 'inactivo' : e)), 2500)
    return true
  }

  async function hacerGuardadoEscalas(next: Partial<EscalaClinica>): Promise<boolean> {
    const miSecuencia = ++saveEscalasSeqRef.current
    escalasSuciasRef.current = false
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
      if (miSecuencia !== saveEscalasSeqRef.current) return true
      if (error) { escalasSuciasRef.current = true; setEstadoEscalas('error'); return false }
      if (!guardado) { escalasSuciasRef.current = true; setEstadoEscalas('conflicto'); return false }
      setEscalas(guardado)
    } else {
      // Primer guardado: todavía no existe la fila.
      const { data: creado, error } = await supabase
        .from('escalas_clinicas')
        .insert({ ingreso_id: ingresoId, momento: 'ingreso', ...campos })
        .select()
        .maybeSingle()
      if (miSecuencia !== saveEscalasSeqRef.current) return true
      if (error) { escalasSuciasRef.current = true; setEstadoEscalas('error'); return false }
      setEscalas(creado ?? next)
    }
    setEstadoEscalas('guardado')
    setTimeout(() => setEstadoEscalas((e) => (e === 'guardado' ? 'inactivo' : e)), 2500)
    return true
  }

  async function recargarEscalasTrasConflicto() {
    const { data: d } = await supabase.from('escalas_clinicas').select('*').eq('ingreso_id', ingresoId).eq('momento', 'ingreso').maybeSingle()
    setEscalas(d ?? {})
    setEstadoEscalas('inactivo')
  }

  async function save(d = dataRef.current): Promise<boolean> {
    // Un guardado manual cancela el automático pendiente: si no, este saldría después con la
    // versión vieja y chocaría con el que acaba de hacerse (falso «alguien más ha guardado»).
    if (debounceRef.current) { clearTimeout(debounceRef.current); debounceRef.current = null }
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
    // Solo se toma la versión nueva: lo que se haya tecleado mientras se guardaba se queda como está.
    setData((prev) => ({ ...prev, version: guardado.version, updated_at: guardado.updated_at }))
    setEstado('guardado')
    setTimeout(() => setEstado((e) => (e === 'guardado' ? 'inactivo' : e)), 2500)
    return true
  }

  async function recargarTrasConflicto() {
    const { data: d } = await supabase.from('informe_ingreso').select('*').eq('ingreso_id', ingresoId).maybeSingle()
    setData(d ?? {})
    setAbiertos((prev) => new Set([...prev, ...CAMPOS_OPCIONALES.filter((k) => ((d as Record<string, unknown> | null)?.[k] as string | undefined)?.trim())]))
    setEstado('inactivo')
  }

  function update(key: keyof InformeIngreso, value: any, conservarAviso = false) {
    if (soloLectura || estado === 'conflicto') return
    const next = { ...dataRef.current, [key]: value }
    // Editar un campo copiado del ingreso anterior cuenta como revisarlo.
    if (!conservarAviso && next.campos_por_revisar?.includes(key as string)) {
      next.campos_por_revisar = next.campos_por_revisar.filter((k) => k !== key)
    }
    setData(next)
    setEstado('pendiente')
    if (debounceRef.current) clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(() => save(next), 1500)
  }

  const porRevisar = data.campos_por_revisar ?? []
  function confirmarRevisado(key: string) {
    update('campos_por_revisar', porRevisar.filter((k) => k !== key))
  }
  // Aviso de un campo copiado del ingreso anterior que aún no se ha revisado.
  const avisoRevisar = (key: string) => porRevisar.includes(key) && (
    <div className="flex items-center justify-between gap-3 text-xs text-amber-800 bg-amber-50 border border-amber-200 rounded-md px-2.5 py-1.5 mb-1.5">
      <span className="flex items-center gap-1.5"><AlertTriangle className="w-3.5 h-3.5 shrink-0" />Copiado del ingreso anterior: revísalo.</span>
      {!soloLectura && <button type="button" onClick={() => confirmarRevisado(key)} className="font-semibold underline underline-offset-2 shrink-0">Sigue vigente</button>}
    </div>
  )

  const field = (key: keyof InformeIngreso, label: string, accion?: React.ReactNode) => (
    <div key={key}>
      <div className="flex items-end justify-between gap-3">
        <span className="label">{label}</span>
        {accion}
      </div>
      {avisoRevisar(key as string)}
      <AutoTextarea value={(data[key] as string) ?? ''} onChange={(v) => update(key, v)} disabled={soloLectura}
        filas={FILAS_CAMPO[key]} autoFocus={recienAbierto === key} />
    </div>
  )

  // Campos opcionales: se muestran los que tienen texto o se han abierto; el resto, como "+ etiqueta".
  const opcionales = (keys: [keyof InformeIngreso, string][]) => {
    const visibles = keys.filter(([k]) => abiertos.has(k as string) || ((data[k] as string | undefined) ?? '').trim() !== '')
    const ocultos = keys.filter(([k]) => !visibles.some(([v]) => v === k))
    return (
      <>
        {visibles.map(([k, l]) => field(k, l))}
        {!soloLectura && ocultos.length > 0 && (
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-xs text-slate-500">Añadir:</span>
            {ocultos.map(([k, l]) => (
              <button key={k as string} type="button"
                onClick={() => { setAbiertos((prev) => new Set(prev).add(k as string)); setRecienAbierto(k as string) }}
                className="text-xs px-2.5 py-1 rounded-full border border-slate-300 text-slate-600 hover:bg-slate-50">
                + {l}
              </button>
            ))}
          </div>
        )}
      </>
    )
  }

  // Botón que escribe en el campo el resultado de las escalas del INGRESO ya calculadas.
  const botonEscalas = (key: keyof InformeIngreso, resumen: string, texto: string, ayuda: string) => !soloLectura && (
    <button type="button"
      disabled={!resumen}
      title={resumen ? `Añade al campo: ${resumen}` : ayuda}
      onClick={() => update(key, añadirResumen(data[key] as string | undefined, resumen), true)}
      className="text-xs font-medium text-primary-700 hover:underline disabled:text-slate-400 disabled:no-underline disabled:cursor-not-allowed">
      {texto}
    </button>
  )

  const filasIngreso: FilaMedicacion[] = (data.tratamiento_ingreso_estructurado as FilaMedicacion[]) ?? []

  return (
    <div className="max-w-3xl space-y-6">
      {dialogo}
      <AvisoGuardado avisos={[
        { estado, etiqueta: 'Informe' },
        { estado: estadoEscalas, etiqueta: 'Escalas', texto: 'Escalas guardadas' },
      ]} />
      <div className="flex items-center justify-between gap-3">
        {soloLectura ? (
          <span className="flex items-center gap-1.5 text-xs text-slate-500">
            <Lock className="w-3.5 h-3.5" /> Solo lectura: solo un médico puede editar este informe.
          </span>
        ) : episodioCerrado ? (
          <span className="flex items-center gap-1.5 text-xs text-amber-600 bg-amber-50 border border-amber-200 rounded-full px-2.5 py-1">
            <Lock className="w-3.5 h-3.5" /> Episodio cerrado. Las modificaciones realizadas quedarán registradas en Auditoría.
          </span>
        ) : <span />}
        <div className="flex items-center gap-3 text-xs text-slate-500">
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
        {opcionales(OPCIONAL_FAMILIARES)}
        <div>
          <span className="label">Tratamiento al ingreso</span>
          {avisoRevisar('tratamiento_ingreso_estructurado')}
          <TablaMedicacion filas={filasIngreso}
            onChange={v => update('tratamiento_ingreso_estructurado', v)} disabled={soloLectura} />
        </div>
      </div>

      <div className="card p-6 space-y-4">
        <p className="section-title">Valoración Geriátrica Integral</p>
        {field('vgi_social', 'Social')}
        {field('vgi_funcional', 'Funcional', botonEscalas('vgi_funcional', textoEscalasFuncional(escalas), 'Insertar Barthel y Lawton', 'Completa antes el Barthel o el Lawton (más abajo, en Escalas clínicas al ingreso)'))}
        {field('vgi_cognitivo', 'Cognitivo', botonEscalas('vgi_cognitivo', textoEscalasCognitivo(escalas), 'Insertar GDS y FAST', 'Completa antes el GDS/FAST (más abajo, en Escalas clínicas al ingreso)'))}
        {opcionales(OPCIONALES_VGI)}
      </div>

      <div className="card p-6 space-y-4">
        <p className="section-title">Enfermedad actual</p>
        {opcionales(OPCIONAL_PERSONALIDAD)}
        {field('evolucion', 'Evolución')}
        <p className="text-sm font-semibold text-slate-600 pt-1">Situación actual</p>
        {opcionales(OPCIONALES_SITUACION)}
      </div>

      <div className="card p-6 space-y-4">
        <p className="section-title">Exploraciones</p>
        {field('exploracion_fisica', 'Exploración física al ingreso')}
        {opcionales(OPCIONALES_EXPLORACION)}
        {field('exploraciones_complementarias', 'Exploraciones complementarias')}
      </div>

      <div className="card p-6 space-y-6">
        <div className="flex items-center justify-between">
          <p className="section-title mb-0">Escalas clínicas al ingreso</p>
          <span className="text-xs text-slate-500">
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
          <ModalEscala titulo="Índice de Barthel" onCerrar={() => setModalEscala(null)} estado={estadoEscalas}
            onGuardar={soloLectura ? undefined : guardarEscalasDesdeModal} completa={escalas.barthel_total != null} faltaTexto="faltan apartados por marcar">
            <EscalaBarthel value={escalas.barthel_respuestas} disabled={soloLectura}
              onChange={(v) => updateEscala({ barthel_respuestas: v, barthel_total: totalBarthel(v) })} />
          </ModalEscala>
        )}
        {modalEscala === 'lawton' && (
          <ModalEscala titulo="Índice de Lawton" onCerrar={() => setModalEscala(null)} estado={estadoEscalas}
            onGuardar={soloLectura ? undefined : guardarEscalasDesdeModal} completa={escalas.lawton_total != null} faltaTexto="faltan apartados por marcar">
            <EscalaLawton value={escalas.lawton_respuestas} disabled={soloLectura}
              onChange={(v) => updateEscala({ lawton_respuestas: v, lawton_total: totalLawton(v) })} />
          </ModalEscala>
        )}
        {modalEscala === 'npi' && (
          <ModalEscala titulo="NPI-Q (gravedad)" onCerrar={() => setModalEscala(null)} estado={estadoEscalas}
            onGuardar={soloLectura ? undefined : guardarEscalasDesdeModal} completa={escalas.npi_gravedad_total != null} faltaTexto="faltan dominios por responder">
            <EscalaNPIQ value={escalas.npi_respuestas} disabled={soloLectura}
              onChange={(v) => updateEscala({ npi_respuestas: v, npi_gravedad_total: totalNPI(v) })} />
          </ModalEscala>
        )}
        {modalEscala === 'gdsfast' && (
          <ModalEscala titulo="GDS (Reisberg) y FAST" onCerrar={() => setModalEscala(null)} estado={estadoEscalas}
            onGuardar={soloLectura ? undefined : guardarEscalasDesdeModal} completa={!!escalas.gds_estadio && !!escalas.fast_estadio} faltaTexto="falta el GDS o el FAST">
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
        {field('plan_medicacion', 'Cambios de medicación propuestos')}
        {field('plan_otros_cuidados', 'Otros cuidados / intervenciones')}
      </div>

      <div className="flex justify-end gap-3">
        <button type="button"
          onClick={async () => {
            if (!ingreso) return
            if (porRevisar.length > 0 && !(await confirmar({
              titulo: 'Hay apartados sin revisar',
              mensaje: `Estos apartados se copiaron del ingreso anterior y aún no los has revisado:\n\n• ${porRevisar.map((k) => CAMPOS_REVISAR[k] ?? k).join('\n• ')}\n\n¿Exportar el Word igualmente?`,
              textoConfirmar: 'Exportar igualmente',
            }))) return
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
          <button type="button" onClick={() => save()} disabled={estado === 'guardando'} className="btn-primary disabled:opacity-60">
            {estado === 'guardando' ? 'Guardando…' : estado === 'guardado' ? '✓ Guardado' : 'Guardar ahora'}
          </button>
        )}
      </div>
    </div>
  )
}

export { TabInformeIngreso }
