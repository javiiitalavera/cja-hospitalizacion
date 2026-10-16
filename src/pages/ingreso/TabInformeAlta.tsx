import { useEffect, useRef, useState } from 'react'
import { supabase } from '../../lib/supabase'
import type { FilaMedicacion, Ingreso, InformeAlta, InformeIngreso } from '../../types'
import { Download } from 'lucide-react'
import { BloqueDiagnosticosCMBD } from '../../components/DiagnosticosCIE'
import { AutoTextarea, FILAS_CAMPO } from './AutoTextarea'
import { TablaMedicacion, AvisoTextoAntiguo } from './TablaMedicacion'
import { exportarInformeAlta } from '../../lib/exportWord'
import { EscalaBarthel, EscalaLawton, EscalaNPIQ, EscalaGDSFAST, ModalEscala } from '../../components/EscalasClinicas'
import { totalBarthel, totalLawton, totalNPI } from '../../types/escalas'
import type { EscalaClinica } from '../../types/escalas'
import { AvisoGuardado } from '../../components/AvisoGuardado'
import { encadenar } from '../../lib/colaGuardado'
import { IndicadorGuardado, TEXTO_GUARDADO, TEXTO_GUARDANDO } from '../../components/IndicadorGuardado'
import { AvisoFicha } from '../../components/AvisoFicha'
import { Info } from 'lucide-react'
import { TituloSeccion } from '../../components/TituloSeccion'

// Apartados que no siempre existen: salen plegados («+ añadir») salvo que ya tengan texto.
// Se muestran siempre en este orden, se abran cuando se abran.
const OPCIONALES_DURANTE_INGRESO: [keyof InformeAlta, string][] = [
  ['estudio_neuropsicologico', 'Estudio neuropsicológico'],
  ['informe_fisioterapia', 'Informe de fisioterapia'],
  ['informe_terapia_ocupacional', 'Informe de terapia ocupacional'],
]
const OPCIONALES_RECOMENDACIONES: [keyof InformeAlta, string][] = [
  ['recomendaciones_conductuales', 'Recomendaciones de manejo conductual'],
  ['cuidados_enfermeria', 'Cuidados de enfermería'],
]
const CAMPOS_OPCIONALES = [...OPCIONALES_DURANTE_INGRESO, ...OPCIONALES_RECOMENDACIONES].map(([k]) => k as string)

type EstadoGuardado = 'inactivo' | 'pendiente' | 'guardando' | 'guardado' | 'error' | 'conflicto'

function TabInformeAlta({ ingresoId, ingreso }: { ingresoId: string; ingreso: Ingreso | null }) {
  const [data, setData] = useState<Partial<InformeAlta & { version: number }>>({})
  const [estado, setEstado] = useState<EstadoGuardado>('inactivo')
  const [informeIngreso, setInformeIngreso] = useState<Partial<InformeIngreso>>({})

  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const dataRef = useRef(data)
  dataRef.current = data
  const saveSeqRef = useRef(0)
  // Cuenta las ediciones del informe: un guardado solo da «Guardado» si no se ha tecleado nada desde que empezó.
  const editRevRef = useRef(0)
  function marcarGuardado(rev: number) {
    if (editRevRef.current !== rev) return // hay cambios nuevos pendientes: el estado sigue siendo «pendiente»
    setEstado('guardado')
    setTimeout(() => setEstado((e) => (e === 'guardado' ? 'inactivo' : e)), 2500)
  }
  // Guardados en cola + versión que dejó el último guardado propio (null = la que trae la carga).
  const cadenaRef = useRef<Promise<boolean>>(Promise.resolve(true))
  const versionGuardadaRef = useRef<number | null>(null)
  const [abiertos, setAbiertos] = useState<Set<string>>(new Set())
  const [recienAbierto, setRecienAbierto] = useState<string | null>(null)

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
  const escalasEnCursoRef = useRef<Promise<boolean> | null>(null)
  const escalasSuciasRef = useRef(false)
  const cadenaEscalasRef = useRef<Promise<boolean>>(Promise.resolve(true))
  const escalaGuardadaRef = useRef<{ id: string; version: number } | null>(null)

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
      escalaGuardadaRef.current = null
      versionGuardadaRef.current = null

      let base: Partial<InformeAlta> = dAlta ?? {}
      // Solo se hereda la medicación del ingreso si la del alta NUNCA se ha tocado (null/ausente).
      // Una lista vacía ([]) es una decisión expresa («sin medicación al alta»): antes se confundía
      // con «sin inicializar» y la medicación quitada reaparecía al volver a abrir el informe, y al
      // exportar se volvía a guardar.
      if (base.medicacion_estructurada == null && dIngreso?.tratamiento_ingreso_estructurado) {
        base = { ...base, medicacion_estructurada: dIngreso.tratamiento_ingreso_estructurado }
      }
      setData(base)
      setAbiertos(new Set(CAMPOS_OPCIONALES.filter((k) => ((base as Record<string, unknown>)[k] as string | undefined)?.trim())))
    })
  }, [ingresoId])

  function updateEscalaAlta(cambios: Partial<EscalaClinica>) {
    if (estadoEscalas === 'conflicto') return
    const next = { ...escalaAltaRef.current, ...cambios }
    setEscalaAlta(next)
    setEstadoEscalas('pendiente')
    escalasSuciasRef.current = true
    if (debounceEscalasRef.current) clearTimeout(debounceEscalasRef.current)
    debounceEscalasRef.current = setTimeout(() => saveEscalaAlta(next), 1500)
  }

  function saveEscalaAlta(next = escalaAltaRef.current): Promise<boolean> {
    const p = hacerGuardadoEscalaAlta(next)
    escalasEnCursoRef.current = p
    return p
  }

  // «Guardar» del modal de una escala: guarda ya, sin esperar al guardado automático, y avisa.
  async function guardarEscalaAltaDesdeModal(): Promise<boolean> {
    if (estadoEscalas === 'conflicto') return false
    if (debounceEscalasRef.current) { clearTimeout(debounceEscalasRef.current); debounceEscalasRef.current = null }
    if (escalasEnCursoRef.current) await escalasEnCursoRef.current
    if (escalasSuciasRef.current) return saveEscalaAlta()
    setEstadoEscalas('guardado')
    setTimeout(() => setEstadoEscalas((e) => (e === 'guardado' ? 'inactivo' : e)), 2500)
    return true
  }

  function hacerGuardadoEscalaAlta(next: Partial<EscalaClinica>): Promise<boolean> {
    const miSecuencia = ++saveEscalasSeqRef.current
    escalasSuciasRef.current = false
    setEstadoEscalas('guardando')
    return encadenar(cadenaEscalasRef, () => ejecutarGuardadoEscalaAlta(next, miSecuencia))
  }

  async function ejecutarGuardadoEscalaAlta(next: Partial<EscalaClinica>, miSecuencia: number): Promise<boolean> {
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
    // Id y versión que dejó el guardado anterior (si lo hubo): el formulario puede llevar los de antes.
    const conocida = escalaGuardadaRef.current
    const id = conocida?.id ?? next.id
    const version = conocida?.version ?? next.version ?? 1

    if (id) {
      const { data: guardado, error } = await supabase
        .from('escalas_clinicas')
        .update(campos)
        .eq('id', id)
        .eq('version', version)
        .select()
        .maybeSingle()
      if (guardado) escalaGuardadaRef.current = { id: guardado.id, version: guardado.version }
      if (miSecuencia !== saveEscalasSeqRef.current) return true
      if (error) { escalasSuciasRef.current = true; setEstadoEscalas('error'); return false }
      if (!guardado) { escalasSuciasRef.current = true; setEstadoEscalas('conflicto'); return false }
      // Solo id y versión: lo que se haya cambiado mientras se guardaba no se pisa.
      setEscalaAlta((prev) => ({ ...prev, id: guardado.id, version: guardado.version }))
    } else {
      const { data: creado, error } = await supabase
        .from('escalas_clinicas')
        .insert({ ingreso_id: ingresoId, momento: 'alta', ...campos })
        .select()
        .maybeSingle()
      if (creado) escalaGuardadaRef.current = { id: creado.id, version: creado.version }
      if (miSecuencia !== saveEscalasSeqRef.current) return true
      if (error) { escalasSuciasRef.current = true; setEstadoEscalas('error'); return false }
      if (creado) setEscalaAlta((prev) => ({ ...prev, id: creado.id, version: creado.version }))
    }
    // Si se ha cambiado algo mientras se guardaba, sigue «pendiente»: no se da por guardado.
    if (escalasSuciasRef.current) return true
    setEstadoEscalas('guardado')
    setTimeout(() => setEstadoEscalas((e) => (e === 'guardado' ? 'inactivo' : e)), 2500)
    return true
  }

  async function recargarEscalaAltaTrasConflicto() {
    const { data: d } = await supabase.from('escalas_clinicas').select('*').eq('ingreso_id', ingresoId).eq('momento', 'alta').maybeSingle()
    escalaGuardadaRef.current = null
    setEscalaAlta(d ?? {})
    setEstadoEscalas('inactivo')
  }

  function save(d = dataRef.current): Promise<boolean> {
    // Un guardado manual cancela el automático pendiente (si no, saldría después con la versión vieja).
    if (debounceRef.current) { clearTimeout(debounceRef.current); debounceRef.current = null }
    const miSecuencia = ++saveSeqRef.current
    const rev = editRevRef.current
    setEstado('guardando')
    return encadenar(cadenaRef, () => ejecutarGuardado(d, miSecuencia, rev))
  }

  async function ejecutarGuardado(d: Partial<InformeAlta & { version: number }>, miSecuencia: number, rev: number): Promise<boolean> {
    // La versión que dejó el guardado anterior, no la que llevaba el formulario al teclear.
    const conocida = versionGuardadaRef.current ?? dataRef.current.version ?? d.version
    if (conocida == null) {
      // El episodio no tiene todavía fila de este informe (episodios antiguos, anteriores a que se creara
      // al ingresar): se crea con el primer guardado. Antes se intentaba actualizar una fila inexistente y
      // salía un falso «alguien más ha guardado».
      const { version: _v, id: _i, updated_at: _u, ...campos } = d as Record<string, unknown>
      const { data: creado, error: errCrear } = await supabase
        .from('informe_alta')
        .insert({ ingreso_id: ingresoId, ...campos })
        .select()
        .maybeSingle()
      if (creado) versionGuardadaRef.current = creado.version
      if (miSecuencia !== saveSeqRef.current) return true
      if (errCrear) {
        // 23505: otra persona la ha creado justo antes (ingreso_id es único) → conflicto de verdad.
        setEstado(errCrear.code === '23505' ? 'conflicto' : 'error')
        return false
      }
      if (!creado) { setEstado('error'); return false }
      setData((prev) => ({ ...prev, id: creado.id, version: creado.version, updated_at: creado.updated_at }))
      marcarGuardado(rev)
      return true
    }
    const version = conocida
    const { data: guardado, error } = await supabase
      .from('informe_alta')
      .update(d)
      .eq('ingreso_id', ingresoId)
      .eq('version', version)
      .select()
      .maybeSingle()
    if (guardado) versionGuardadaRef.current = guardado.version
    if (miSecuencia !== saveSeqRef.current) return true
    if (error) { setEstado('error'); return false }
    if (!guardado) {
      // Igual que en informe de ingreso: el texto escrito se queda
      // en pantalla, no se pisa ni se recarga sin avisar.
      setEstado('conflicto')
      return false
    }
    // Solo se toma la versión nueva: lo que se haya tecleado mientras se guardaba se queda como está.
    setData((prev) => ({ ...prev, version: guardado.version, updated_at: guardado.updated_at }))
    marcarGuardado(rev)
    return true
  }

  async function recargarTrasConflicto() {
    if (debounceRef.current) { clearTimeout(debounceRef.current); debounceRef.current = null }
    const { data: d } = await supabase.from('informe_alta').select('*').eq('ingreso_id', ingresoId).maybeSingle()
    versionGuardadaRef.current = null
    setData(d ?? {})
    setAbiertos((prev) => new Set([...prev, ...CAMPOS_OPCIONALES.filter((k) => ((d as Record<string, unknown> | null)?.[k] as string | undefined)?.trim())]))
    setEstado('inactivo')
  }

  function update(key: keyof InformeAlta, value: any) {
    if (estado === 'conflicto') return
    const next = { ...dataRef.current, [key]: value }
    setData(next)
    editRevRef.current++
    setEstado('pendiente')
    if (debounceRef.current) clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(() => save(next), 1500)
  }

  const field = (key: keyof InformeAlta, label: string) => (
    <div key={key}>
      <span className="label">{label}</span>
      <AutoTextarea value={(data[key] as string) ?? ''} onChange={(v) => update(key, v)} filas={FILAS_CAMPO[key]} autoFocus={recienAbierto === key} />
    </div>
  )

  // Apartados opcionales: salen los que tienen texto o se han abierto, siempre en el orden de la lista;
  // el resto, como «+ etiqueta».
  const opcionales = (keys: [keyof InformeAlta, string][]) => {
    const visibles = keys.filter(([k]) => abiertos.has(k as string) || ((data[k] as string | undefined) ?? '').trim() !== '')
    const ocultos = keys.filter(([k]) => !visibles.some(([v]) => v === k))
    return (
      <>
        {visibles.map(([k, l]) => field(k, l))}
        {ocultos.length > 0 && (
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

  const filasMed: FilaMedicacion[] = (data.medicacion_estructurada as FilaMedicacion[]) ?? []

  return (
    <div className="ancho-formulario space-y-6">
      <AvisoGuardado avisos={[
        { estado, etiqueta: 'Informe' },
        { estado: estadoEscalas, etiqueta: 'Escalas', texto: 'Escalas guardadas' },
      ]} />

      <div className="flex items-start justify-between gap-4">
        <TituloSeccion titulo="Informe de alta" subtitulo="Evolución, juicios clínicos y medicación al alta." />
        <IndicadorGuardado estado={estado} className="shrink-0 pt-1" />
      </div>
      <AvisoFicha icono={Info}>
        Los antecedentes e informe de ingreso se heredan al exportar. La medicación al alta se pre-rellena desde el tratamiento al ingreso.
      </AvisoFicha>

      {estado === 'conflicto' && (
        <AvisoFicha tono="atencion" accion={
          <button onClick={recargarTrasConflicto} className="btn-secondary btn-sm shrink-0">Ver la versión más reciente</button>
        }>
          Alguien más ha guardado cambios en este informe mientras lo editabas. Lo que has escrito sigue aquí, sin guardar todavía.
        </AvisoFicha>
      )}

      <div className="card p-6 space-y-4">
        <p className="section-title">Durante el ingreso</p>
        {field('exploraciones_durante_ingreso', 'Exploraciones complementarias durante el ingreso')}
        {opcionales(OPCIONALES_DURANTE_INGRESO)}
      </div>

      <div className="card p-6 space-y-4">
        <p className="section-title">Evolución y diagnósticos</p>
        {field('evolucion_clinica', 'Evolución clínica')}
      </div>

      <div className="card p-6 space-y-6">
        <div className="flex items-center justify-between">
          <p className="section-title mb-0">Escalas clínicas al alta</p>
          <IndicadorGuardado estado={estadoEscalas} />
        </div>
        {estadoEscalas === 'conflicto' && (
          <AvisoFicha tono="atencion" accion={
            <button onClick={recargarEscalaAltaTrasConflicto} className="btn-secondary btn-sm shrink-0">Ver la versión más reciente</button>
          }>
            Alguien más ha guardado cambios en las escalas mientras las editabas. Lo marcado sigue aquí, sin guardar todavía.
          </AvisoFicha>
        )}

        {/* Comparación — y también el punto donde se completa cada
            escala: pinchar en "Alta" abre esa escala para rellenarla,
            pinchar en "Ingreso" la abre en lectura. Sin esto, las
            mismas ocho escalas se repetían dos veces: aquí como
            números, y otra vez debajo como tarjetas para abrir el
            modal — la tabla ya es toda la información que hace
            falta. Sin etiquetar ninguna diferencia como mejoría o
            empeoramiento: la dirección no se interpreta igual en
            todas las escalas. */}
        <div className="tabla-scroll">
          <table className="w-full text-sm border-collapse">
            <thead>
              <tr className="border-b bg-slate-50 text-left text-xs font-semibold text-slate-500">
                <th className="px-3 py-2">Escala</th>
                <th className="px-3 py-2 text-right">Ingreso</th>
                <th className="px-3 py-2 text-right">Alta</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              <tr>
                <td className="px-3 py-2 text-slate-600">Barthel</td>
                <td className="px-3 py-2 text-right tabular-nums">
                  <button type="button" onClick={() => setModalEscala('ing-barthel')} className="hover:underline hover:text-primary-700">
                    {escalaIngreso.barthel_total != null ? `${escalaIngreso.barthel_total}/100` : '—'}
                  </button>
                </td>
                <td className="px-3 py-2 text-right tabular-nums font-medium text-slate-800">
                  <button type="button" onClick={() => setModalEscala('alta-barthel')} className="hover:underline hover:text-primary-700">
                    {escalaAlta.barthel_total != null ? `${escalaAlta.barthel_total}/100` : 'Incompleta'}
                  </button>
                </td>
              </tr>
              <tr>
                <td className="px-3 py-2 text-slate-600">Lawton</td>
                <td className="px-3 py-2 text-right tabular-nums">
                  <button type="button" onClick={() => setModalEscala('ing-lawton')} className="hover:underline hover:text-primary-700">
                    {escalaIngreso.lawton_total != null ? `${escalaIngreso.lawton_total}/8` : '—'}
                  </button>
                </td>
                <td className="px-3 py-2 text-right tabular-nums font-medium text-slate-800">
                  <button type="button" onClick={() => setModalEscala('alta-lawton')} className="hover:underline hover:text-primary-700">
                    {escalaAlta.lawton_total != null ? `${escalaAlta.lawton_total}/8` : 'Incompleta'}
                  </button>
                </td>
              </tr>
              <tr>
                <td className="px-3 py-2 text-slate-600">NPI-Q gravedad</td>
                <td className="px-3 py-2 text-right tabular-nums">
                  <button type="button" onClick={() => setModalEscala('ing-npi')} className="hover:underline hover:text-primary-700">
                    {escalaIngreso.npi_gravedad_total != null ? `${escalaIngreso.npi_gravedad_total}/36` : '—'}
                  </button>
                </td>
                <td className="px-3 py-2 text-right tabular-nums font-medium text-slate-800">
                  <button type="button" onClick={() => setModalEscala('alta-npi')} className="hover:underline hover:text-primary-700">
                    {escalaAlta.npi_gravedad_total != null ? `${escalaAlta.npi_gravedad_total}/36` : 'Incompleta'}
                  </button>
                </td>
              </tr>
              <tr>
                <td className="px-3 py-2 text-slate-600">GDS / FAST</td>
                <td className="px-3 py-2 text-right tabular-nums">
                  <button type="button" onClick={() => setModalEscala('ing-gdsfast')} className="hover:underline hover:text-primary-700">
                    {escalaIngreso.gds_estadio ? `GDS ${escalaIngreso.gds_estadio}` : '—'}
                    {escalaIngreso.fast_estadio ? ` · FAST ${escalaIngreso.fast_estadio}` : ''}
                  </button>
                </td>
                <td className="px-3 py-2 text-right tabular-nums font-medium text-slate-800">
                  <button type="button" onClick={() => setModalEscala('alta-gdsfast')} className="hover:underline hover:text-primary-700">
                    {escalaAlta.gds_estadio ? `GDS ${escalaAlta.gds_estadio}` : 'Incompleta'}
                    {escalaAlta.fast_estadio ? ` · FAST ${escalaAlta.fast_estadio}` : ''}
                  </button>
                </td>
              </tr>
            </tbody>
          </table>
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
          <ModalEscala titulo="Índice de Barthel — al alta" onCerrar={() => setModalEscala(null)} estado={estadoEscalas}
            onGuardar={guardarEscalaAltaDesdeModal} completa={escalaAlta.barthel_total != null} faltaTexto="faltan apartados por marcar">
            <EscalaBarthel value={escalaAlta.barthel_respuestas}
              onChange={(v) => updateEscalaAlta({ barthel_respuestas: v, barthel_total: totalBarthel(v) })} />
          </ModalEscala>
        )}
        {modalEscala === 'alta-lawton' && (
          <ModalEscala titulo="Índice de Lawton — al alta" onCerrar={() => setModalEscala(null)} estado={estadoEscalas}
            onGuardar={guardarEscalaAltaDesdeModal} completa={escalaAlta.lawton_total != null} faltaTexto="faltan apartados por marcar">
            <EscalaLawton value={escalaAlta.lawton_respuestas}
              onChange={(v) => updateEscalaAlta({ lawton_respuestas: v, lawton_total: totalLawton(v) })} />
          </ModalEscala>
        )}
        {modalEscala === 'alta-npi' && (
          <ModalEscala titulo="NPI-Q — al alta" onCerrar={() => setModalEscala(null)} estado={estadoEscalas}
            onGuardar={guardarEscalaAltaDesdeModal} completa={escalaAlta.npi_gravedad_total != null} faltaTexto="faltan dominios por responder">
            <EscalaNPIQ value={escalaAlta.npi_respuestas}
              onChange={(v) => updateEscalaAlta({ npi_respuestas: v, npi_gravedad_total: totalNPI(v) })} />
          </ModalEscala>
        )}
        {modalEscala === 'alta-gdsfast' && (
          <ModalEscala titulo="GDS / FAST — al alta" onCerrar={() => setModalEscala(null)} estado={estadoEscalas}
            onGuardar={guardarEscalaAltaDesdeModal} completa={!!escalaAlta.gds_estadio && !!escalaAlta.fast_estadio} faltaTexto="falta el GDS o el FAST">
            <EscalaGDSFAST gds={escalaAlta.gds_estadio} fast={escalaAlta.fast_estadio}
              onCambiarGds={(gds, fastDirecto) => updateEscalaAlta({ gds_estadio: gds, fast_estadio: fastDirecto ?? '' })}
              onChangeFast={(v) => updateEscalaAlta({ fast_estadio: v })} />
          </ModalEscala>
        )}
      </div>

      <div className="card p-6 space-y-4">
        <p className="section-title">Diagnósticos</p>
        {field('juicios_clinicos', 'Juicios clínicos')}
        <BloqueDiagnosticosCMBD ingresoId={ingresoId} />
      </div>

      <div className="card p-6 space-y-4">
        <p className="section-title">Tratamiento y recomendaciones al alta</p>
        {opcionales(OPCIONALES_RECOMENDACIONES)}
        <div>
          <span className="label">Medicación al alta</span>
          <p className="text-xs text-slate-500 mb-2">Pre-rellenada desde el tratamiento al ingreso.</p>
          <AvisoTextoAntiguo texto={data.medicacion_alta} filas={filasMed} />
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
        <button type="button" onClick={() => save()} disabled={estado === 'guardando'} className="btn-primary disabled:opacity-60">
          {estado === 'guardando' ? TEXTO_GUARDANDO : estado === 'guardado' ? TEXTO_GUARDADO : 'Guardar ahora'}
        </button>
      </div>
    </div>
  )
}

export { TabInformeAlta }
