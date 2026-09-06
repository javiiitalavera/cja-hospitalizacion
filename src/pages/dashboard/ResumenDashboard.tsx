import { useEffect, useRef, useState } from 'react'
import { supabase } from '../../lib/supabase'
import { BarChart, Bar, LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts'
import type { Filtros, SituacionActual, ResumenPeriodo, SerieDashboard, EstadoCarga } from './tipos'
import { calcularRangoComparacion, variacion } from './metricas'
import { TarjetaMetrica, EstadoCargando, EstadoError } from './ComponentesDashboard'

export function ResumenDashboard({ filtros, desde, hasta, onExplorar, onExplorarEpisodios }: {
  filtros: Filtros
  desde: string
  hasta: string
  onExplorar: (filtroExtra?: Record<string, string>) => void
  onExplorarEpisodios: (filtroExtra?: Record<string, string>) => void
}) {
  // Cuatro apartados, cuatro estados independientes — que falle uno
  // no debe apagar los demás, ni disfrazarse de un cero.
  const [situacion, setSituacion] = useState<SituacionActual | null>(null)
  const [estadoSituacion, setEstadoSituacion] = useState<EstadoCarga>('cargando')
  const [errorSituacion, setErrorSituacion] = useState('')

  const [resumen, setResumen] = useState<ResumenPeriodo | null>(null)
  const [resumenAnterior, setResumenAnterior] = useState<ResumenPeriodo | null>(null)
  const [estadoResumen, setEstadoResumen] = useState<EstadoCarga>('cargando')
  const [errorResumen, setErrorResumen] = useState('')

  const [series, setSeries] = useState<SerieDashboard | null>(null)
  const [estadoSeries, setEstadoSeries] = useState<EstadoCarga>('cargando')
  const [errorSeries, setErrorSeries] = useState('')

  // Evita que una petición vieja (de un filtro ya abandonado)
  // sobrescriba el resultado de la petición más reciente.
  const secuenciaRef = useRef(0)

  async function cargarSituacion() {
    setEstadoSituacion('cargando')
    setErrorSituacion('')
    const { data, error } = await supabase.rpc('dashboard_situacion_actual')
    if (error) {
      setErrorSituacion(error.message)
      setEstadoSituacion('error')
      return
    }
    setSituacion(data)
    setEstadoSituacion('listo')
  }

  async function cargarResumenYSeries() {
    const miSecuencia = ++secuenciaRef.current
    setEstadoResumen('cargando')
    setErrorResumen('')
    setEstadoSeries('cargando')
    setErrorSeries('')

    const params = {
      p_desde: desde,
      p_hasta: hasta,
      p_medico_id: filtros.medicoId,
      p_estado_filtro: null,
    }

    const [resActual, resSerie] = await Promise.all([
      supabase.rpc('dashboard_resumen', params),
      supabase.rpc('dashboard_series', params),
    ])

    if (miSecuencia !== secuenciaRef.current) return // ya hay un filtro más nuevo en curso

    if (resActual.error) {
      setErrorResumen(resActual.error.message)
      setEstadoResumen('error')
    } else {
      setResumen(resActual.data)
      setEstadoResumen('listo')
    }

    if (resSerie.error) {
      setErrorSeries(resSerie.error.message)
      setEstadoSeries('error')
    } else {
      setSeries(resSerie.data)
      setEstadoSeries('listo')
    }

    if (filtros.comparar && filtros.periodo !== 'todo') {
      const rangoAnt = calcularRangoComparacion(filtros.periodo, desde, hasta)
      if (rangoAnt) {
        const { data } = await supabase.rpc('dashboard_resumen', {
          p_desde: rangoAnt.desde, p_hasta: rangoAnt.hasta,
          p_medico_id: filtros.medicoId, p_estado_filtro: null,
        })
        if (miSecuencia === secuenciaRef.current) setResumenAnterior(data ?? null)
      }
    } else {
      setResumenAnterior(null)
    }
  }

  useEffect(() => { cargarSituacion() }, [])
  useEffect(() => { cargarResumenYSeries() }, [desde, hasta, filtros.medicoId, filtros.comparar, filtros.periodo])

  function comparacionTexto(actual: number, etiqueta: string, esPct = false): string | undefined {
    if (!resumenAnterior) return undefined
    const anterior = (resumenAnterior as any)[etiqueta]
    if (anterior == null) return undefined
    const { absoluta, pct } = variacion(actual, anterior)
    const signo = absoluta > 0 ? '+' : ''
    // Para porcentajes, la diferencia se expresa en puntos
    // porcentuales (pp), no en "%" — decir "+17.7%" de una cifra que
    // ya era un porcentaje sería un porcentaje de un porcentaje, que
    // no es lo que nadie quiere leer aquí.
    if (esPct) {
      return `Periodo anterior: ${anterior}% (${signo}${absoluta} pp)`
    }
    return `Periodo anterior: ${anterior} (${signo}${absoluta}${pct != null ? `, ${signo}${pct}%` : ''})`
  }

  return (
    <div className="space-y-6">
      {/* ── Situación actual ─────────────────────────────────── */}
      <section>
        <div className="flex items-center justify-between mb-2">
          <p className="section-title mb-0">Situación actual</p>
          <span className="text-xs text-slate-400">A fecha de hoy — no cambia con el periodo elegido</span>
        </div>
        {estadoSituacion === 'cargando' && <EstadoCargando />}
        {estadoSituacion === 'error' && <EstadoError mensaje={errorSituacion} onReintentar={cargarSituacion} />}
        {estadoSituacion === 'listo' && situacion && (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <TarjetaMetrica etiqueta="Ingresados ahora" valor={situacion.pacientes_ingresados} subvalor={`${situacion.ocupacion_actual_pct}% de ocupación`} />
            <TarjetaMetrica etiqueta="Estancia ≥ 60 días" valor={situacion.estancia_larga_60} />
            {/* Sin onClick a propósito: Incidencias no puede explicar
                qué pacientes componen el semáforo de caídas — eso es
                un dato de Hoja de Ítems, no de eventos. Una tarjeta
                que no puede abrir exactamente lo que representa no
                debería ser pulsable. */}
            <TarjetaMetrica etiqueta="Semáforo rojo/naranja" valor={situacion.semaforo_riesgo} />
            <TarjetaMetrica etiqueta="Con contención activa" valor={situacion.contencion_activa} />
            <TarjetaMetrica etiqueta="Contención sin confirmar" valor={situacion.contencion_pendiente_confirmacion} />
            <TarjetaMetrica etiqueta="Incidencias pendientes" valor={situacion.incidencias_pendientes} onClick={() => onExplorar({ incidencias: 'pendiente' })} />
          </div>
        )}
      </section>

      {/* ── Actividad del periodo ────────────────────────────── */}
      <section>
        <p className="section-title">Actividad del periodo</p>
        {estadoResumen === 'cargando' && <EstadoCargando />}
        {estadoResumen === 'error' && <EstadoError mensaje={errorResumen} onReintentar={cargarResumenYSeries} />}
        {estadoResumen === 'listo' && resumen && (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <TarjetaMetrica etiqueta="Ingresos nuevos" valor={resumen.ingresos_nuevos}
              comparacion={comparacionTexto(resumen.ingresos_nuevos, 'ingresos_nuevos')}
              onClick={() => onExplorarEpisodios({ desde_ingreso: desde, hasta_ingreso: hasta })} />
            <TarjetaMetrica etiqueta="Altas" valor={resumen.altas}
              comparacion={comparacionTexto(resumen.altas, 'altas')}
              onClick={() => onExplorarEpisodios({ desde_alta: desde, hasta_alta: hasta, estado: 'alta' })} />
            <TarjetaMetrica etiqueta="Traslados" valor={resumen.traslados}
              comparacion={comparacionTexto(resumen.traslados, 'traslados')}
              onClick={() => onExplorarEpisodios({ desde_alta: desde, hasta_alta: hasta, estado: 'alta_traslado' })} />
            <TarjetaMetrica etiqueta="Éxitus" valor={resumen.exitus}
              comparacion={comparacionTexto(resumen.exitus, 'exitus')}
              onClick={() => onExplorarEpisodios({ desde_alta: desde, hasta_alta: hasta, estado: 'exitus' })} />
            <TarjetaMetrica etiqueta="Días-estancia" valor={resumen.dias_estancia}
              comparacion={comparacionTexto(resumen.dias_estancia, 'dias_estancia')} />
            <TarjetaMetrica etiqueta="Ocupación media" valor={`${resumen.ocupacion_media_pct}%`}
              subvalor={`Mín. ${resumen.ocupacion_min_pct}% · Máx. ${resumen.ocupacion_max_pct}%`}
              comparacion={comparacionTexto(resumen.ocupacion_media_pct, 'ocupacion_media_pct', true)} />
            <TarjetaMetrica etiqueta="Estancia media" valor={`${resumen.estancia_media_dias} d`}
              subvalor={`Mediana: ${resumen.estancia_mediana_dias} d`} />
            <TarjetaMetrica etiqueta="Reingresos ≤30 días" valor={`${resumen.reingresos_30d} de ${resumen.ingresos_nuevos}`}
              subvalor={resumen.ingresos_nuevos > 0 ? `${Math.round(resumen.reingresos_30d / resumen.ingresos_nuevos * 1000) / 10}%` : undefined} />
            <TarjetaMetrica etiqueta="Incidencias" valor={resumen.incidencias_total}
              subvalor={resumen.incidencias_tasa_1000 != null ? `${resumen.incidencias_tasa_1000} por 1.000 días-estancia` : undefined}
              comparacion={comparacionTexto(resumen.incidencias_total, 'incidencias_total')}
              onClick={() => onExplorar({ incidencias: 'todas', desde, hasta })} />
          </div>
        )}

        {/* Gráficos: solo los dos que pide esta vista */}
        <div className="grid md:grid-cols-2 gap-4 mt-4">
          <div className="card p-4">
            <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-2">Ocupación</p>
            {estadoSeries === 'cargando' && <EstadoCargando />}
            {estadoSeries === 'error' && <EstadoError mensaje={errorSeries} onReintentar={cargarResumenYSeries} />}
            {estadoSeries === 'listo' && series && series.ocupacion_diaria.length > 0 && (
              <ResponsiveContainer width="100%" height={220}>
                <LineChart data={series.ocupacion_diaria}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                  <XAxis dataKey="fecha" tick={{ fontSize: 10 }} />
                  <YAxis tick={{ fontSize: 10 }} />
                  <Tooltip />
                  <Line type="monotone" dataKey="camas" stroke="#2563eb" strokeWidth={2} dot={false} />
                </LineChart>
              </ResponsiveContainer>
            )}
          </div>
          <div className="card p-4">
            <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-2">Ingresos y salidas</p>
            {estadoSeries === 'cargando' && <EstadoCargando />}
            {estadoSeries === 'error' && <EstadoError mensaje={errorSeries} onReintentar={cargarResumenYSeries} />}
            {estadoSeries === 'listo' && series && series.movimientos.length > 0 && (
              <ResponsiveContainer width="100%" height={220}>
                <BarChart data={series.movimientos}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                  <XAxis dataKey="inicio" tick={{ fontSize: 10 }} />
                  <YAxis tick={{ fontSize: 10 }} />
                  <Tooltip />
                  <Bar dataKey="ingresos" fill="#2563eb" name="Ingresos" />
                  <Bar dataKey="salidas" fill="#94a3b8" name="Salidas" />
                </BarChart>
              </ResponsiveContainer>
            )}
          </div>
        </div>
      </section>
    </div>
  )
}
