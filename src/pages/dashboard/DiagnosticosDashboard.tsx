import { useEffect, useMemo, useRef, useState } from 'react'
import { supabase } from '../../lib/supabase'
import type { Filtros, EstadoCarga } from './tipos'
import { TarjetaMetrica, EstadoCargando, EstadoError, EstadoSinDatos } from './ComponentesDashboard'
import {
  COLUMNAS_CMBD_DX, TIPOS_DEMENCIA, episodioDesdeFila, masFrecuentes, resumenDemencias,
  type EpisodioDx,
} from './diagnosticos'
import { porcentajeNum, useAporteExportacion, type AporteExport } from './exportar'

const PAGINA = 1000

function pct(n: number, total: number): string {
  return total > 0 ? `${Math.round((n / total) * 1000) / 10}%`.replace('.', ',') : '—'
}

function Barra({ valor, max }: { valor: number; max: number }) {
  return (
    <div className="flex-1 bg-slate-100 rounded-full h-3.5 overflow-hidden">
      <div className="bg-primary-500 h-full rounded-full" style={{ width: `${max > 0 ? (valor / max) * 100 : 0}%` }} />
    </div>
  )
}

export function DiagnosticosDashboard({ filtros, desde, hasta }: { filtros: Filtros; desde: string; hasta: string }) {
  const [altas, setAltas] = useState(0)                  // salidas del periodo (altas, traslados y éxitus)
  const [episodios, setEpisodios] = useState<EpisodioDx[]>([])   // con diagnóstico principal codificado
  const [estado, setEstado] = useState<EstadoCarga>('cargando')
  const [error, setError] = useState('')
  const [modo, setModo] = useState<'principal' | 'todos'>('principal')
  const secuenciaRef = useRef(0)

  async function cargar() {
    const mi = ++secuenciaRef.current
    setEstado('cargando'); setError('')
    // Se parte de las altas del periodo (es donde se codifica) y se le une el CMBD de cada una:
    // así se sabe cuántas altas hay en total y cuántas ya tienen sus códigos.
    const filas: any[] = []
    for (let desdeFila = 0; ; desdeFila += PAGINA) {
      let q = supabase.from('ingresos').select(`id, cmbd(${COLUMNAS_CMBD_DX})`)
        .gte('fecha_alta', desde).lte('fecha_alta', hasta)
      if (filtros.medicoId) q = q.eq('medico_responsable_id', filtros.medicoId)
      const { data, error: err } = await q.order('id').range(desdeFila, desdeFila + PAGINA - 1)
      if (mi !== secuenciaRef.current) return
      if (err) { setError(err.message); setEstado('error'); return }
      filas.push(...(data ?? []))
      if ((data?.length ?? 0) < PAGINA) break
    }
    const eps: EpisodioDx[] = []
    for (const f of filas) {
      // cmbd es uno por ingreso (la clave es única): llega como objeto, o como lista de uno
      const cmbd = Array.isArray(f.cmbd) ? f.cmbd[0] : f.cmbd
      const e = episodioDesdeFila(cmbd)
      if (e && e.principal) eps.push(e)
    }
    setAltas(filas.length)
    setEpisodios(eps)
    setEstado(filas.length === 0 ? 'sin_datos' : 'listo')
  }

  useEffect(() => { cargar() }, [desde, hasta, filtros.medicoId])

  const frecuentes = useMemo(() => masFrecuentes(episodios, modo, 15), [episodios, modo])
  const demencias = useMemo(() => resumenDemencias(episodios), [episodios])
  const maxFrec = Math.max(1, ...frecuentes.map((f) => f.n))
  const tiposConDatos = demencias.porTipo.filter((t) => t.n > 0)
  const maxTipo = Math.max(1, ...demencias.porTipo.map((t) => t.n))
  const sinCodificar = altas - episodios.length

  // Lo que se lleva el botón «Exportar datos de esta vista».
  const aporte = useMemo<AporteExport | null>(() => {
    if (estado !== 'listo') return null
    const filasFrecuentes = (modo: 'principal' | 'todos') => masFrecuentes(episodios, modo, 50)
      .map((f) => [f.codigo, f.descripcion, f.n, porcentajeNum(f.n, episodios.length)] as (string | number | null)[])
    const cols = ['Código', 'Descripción', 'Salidas', '% sobre las salidas con diagnóstico principal codificado']
    return {
      orden: 0,
      base: [
        { etiqueta: 'Salidas del periodo (altas, traslados y éxitus)', valor: altas },
        { etiqueta: 'Con diagnóstico principal codificado', valor: episodios.length },
        { etiqueta: 'Sin codificar', valor: altas - episodios.length },
      ],
      hojas: [
        { nombre: 'Frecuentes (principal)', columnas: cols, filas: filasFrecuentes('principal'), nota: 'Los 50 códigos más frecuentes como diagnóstico principal.' },
        { nombre: 'Frecuentes (todos)', columnas: cols, filas: filasFrecuentes('todos'), nota: 'Los 50 códigos más frecuentes en cualquier posición; cada salida cuenta una vez por código.' },
        {
          nombre: 'Demencias por tipo',
          columnas: ['Tipo', 'Códigos', 'Salidas', '% sobre las salidas con demencia'],
          filas: [
            ...TIPOS_DEMENCIA.map((t) => {
              const n = demencias.porTipo.find((x) => x.clave === t.clave)?.n ?? 0
              return [t.etiqueta, t.codigos, n, porcentajeNum(n, demencias.conDemencia)] as (string | number | null)[]
            }),
            ['Total con demencia codificada', '', demencias.conDemencia, porcentajeNum(demencias.conDemencia, demencias.episodios)],
            ['Con código de demencia de la OMS que no existe en la CIE-10-ES', demencias.codigosOMS.join(', '), demencias.conCodigoOMS, null],
            ['… de ellas, sin demencia contada por ese motivo', '', demencias.omsSinContar, null],
          ],
          nota: 'Cada salida se clasifica una sola vez según todos sus códigos. El deterioro cognitivo leve (G31.84) no cuenta como demencia.',
        },
      ],
    }
  }, [estado, altas, episodios, demencias])
  useAporteExportacion('diagnosticos', aporte)

  if (estado === 'cargando') return <EstadoCargando />
  if (estado === 'error') return <EstadoError mensaje={error} onReintentar={cargar} />
  if (estado === 'sin_datos') return <EstadoSinDatos mensaje="No hay salidas (altas, traslados o éxitus) en este periodo." />

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-3 gap-3">
        <TarjetaMetrica etiqueta="Salidas del periodo" valor={altas} subvalor="Altas, traslados y éxitus" />
        <TarjetaMetrica etiqueta="Con diagnóstico principal codificado" valor={episodios.length} subvalor={pct(episodios.length, altas)} />
        <TarjetaMetrica etiqueta="Sin codificar" valor={sinCodificar}
          subvalor={sinCodificar > 0 ? 'Los códigos se ponen al alta, en el informe de alta o en la pestaña CMBD' : undefined} />
      </div>
      {sinCodificar > 0 && (
        <p className="text-xs text-slate-500 -mt-3">
          Las cifras de abajo cuentan solo las salidas con diagnóstico principal codificado: cuantas más se codifiquen, más fiables.
        </p>
      )}

      {/* ── Diagnósticos más frecuentes ───────────────────────── */}
      <section>
        <div className="flex items-center justify-between gap-3 mb-3">
          <p className="section-title mb-0">Diagnósticos más frecuentes</p>
          <div className="flex rounded-lg border overflow-hidden text-xs font-medium">
            {([['principal', 'Principal'], ['todos', 'Principal + secundarios']] as const).map(([v, et]) => (
              <button key={v} onClick={() => setModo(v)}
                className={`px-3 py-1.5 ${modo === v ? 'bg-primary-50 text-primary-700' : 'text-slate-500 hover:bg-slate-50'}`}>{et}</button>
            ))}
          </div>
        </div>
        <div className="card p-4">
          {frecuentes.length === 0 ? <EstadoSinDatos mensaje="Todavía no hay diagnósticos codificados en este periodo." /> : (
            <div className="space-y-2">
              {frecuentes.map((f) => (
                <div key={f.codigo} className="flex items-center gap-3">
                  <span className="font-mono text-xs font-bold text-primary-700 w-16 shrink-0">{f.codigo}</span>
                  <span className="text-xs text-slate-600 w-1/2 md:w-2/5 shrink-0 truncate" title={f.descripcion}>{f.descripcion || '—'}</span>
                  <Barra valor={f.n} max={maxFrec} />
                  <span className="text-xs font-semibold text-slate-700 w-14 text-right shrink-0 tabular-nums">
                    {f.n} <span className="font-normal text-slate-500">· {pct(f.n, episodios.length)}</span>
                  </span>
                </div>
              ))}
            </div>
          )}
          <p className="text-xs text-slate-500 mt-3">
            {modo === 'principal'
              ? 'Porcentaje sobre las salidas con diagnóstico principal codificado.'
              : 'Cada salida cuenta una vez por código, esté como principal o como secundario. Porcentaje sobre las salidas con diagnóstico principal codificado.'}
          </p>
        </div>
      </section>

      {/* ── Demencias por tipo ───────────────────────────────── */}
      <section>
        <p className="section-title">Demencias por tipo</p>
        <div className="grid grid-cols-2 gap-3 mb-4">
          <TarjetaMetrica etiqueta="Salidas con demencia codificada" valor={demencias.conDemencia}
            subvalor={`${pct(demencias.conDemencia, demencias.episodios)} de las salidas codificadas`} />
          <TarjetaMetrica etiqueta="Tipo más frecuente"
            valor={tiposConDatos.length > 0
              ? TIPOS_DEMENCIA.find((t) => t.clave === [...tiposConDatos].sort((a, b) => b.n - a.n)[0].clave)!.etiqueta
              : '—'} />
        </div>
        {demencias.conCodigoOMS > 0 && (
          <p data-codigos-oms className="text-xs text-amber-700 mb-3">
            {demencias.conCodigoOMS} {demencias.conCodigoOMS === 1 ? 'salida tiene' : 'salidas tienen'} un código de demencia de la CIE-10 de la OMS
            ({demencias.codigosOMS.slice(0, 4).join(', ')}) que no existe en la CIE-10-ES con la que se codifica el CMBD. Hay que corregirlo en la pestaña CMBD
            (por ejemplo, Alzheimer: G30.x + F02.8x).
            {demencias.omsSinContar > 0 && <> {demencias.omsSinContar === 1 ? 'Esa salida no cuenta' : `${demencias.omsSinContar} de ellas no cuentan`} como demencia en este recuento hasta que se corrija.</>}
          </p>
        )}
        <div className="card p-4">
          {demencias.conDemencia === 0 ? <EstadoSinDatos mensaje="Ninguna salida de este periodo tiene una demencia codificada con la CIE-10-ES." /> : (
            <div className="space-y-2.5">
              {TIPOS_DEMENCIA.map((t) => {
                const n = demencias.porTipo.find((x) => x.clave === t.clave)?.n ?? 0
                return (
                  <div key={t.clave} className="flex items-center gap-3">
                    <span className="text-xs text-slate-700 w-48 md:w-64 shrink-0 leading-tight">
                      {t.etiqueta}
                      <span className="block text-[0.7rem] text-slate-500 font-mono mt-0.5">{t.codigos}</span>
                    </span>
                    <Barra valor={n} max={maxTipo} />
                    <span className="text-xs font-semibold text-slate-700 w-14 text-right shrink-0 tabular-nums">
                      {n} <span className="font-normal text-slate-500">· {pct(n, demencias.conDemencia)}</span>
                    </span>
                  </div>
                )
              })}
            </div>
          )}
          <p className="text-xs text-slate-500 mt-3">
            Cada alta se clasifica una sola vez según todos sus códigos (principal y secundarios): p. ej. G30.1 + F02.811 es una demencia de Alzheimer.
            Porcentajes sobre las salidas con demencia. El deterioro cognitivo leve (G31.84) no cuenta como demencia.
          </p>
        </div>
      </section>
    </div>
  )
}
