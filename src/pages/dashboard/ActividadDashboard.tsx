import { useEffect, useRef, useState } from 'react'
import { supabase } from '../../lib/supabase'
import { BarChart, Bar, LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts'
import type { Filtros, ResumenPeriodo, SerieDashboard, EstadoCarga } from './tipos'
import { TarjetaMetrica, EstadoCargando, EstadoError, EstadoSinDatos } from './ComponentesDashboard'

interface ActividadDetalle {
  distribucion_estancia: Record<string, number>
  activos_mas_30: number
  activos_mas_60: number
  activos_mas_90: number
  por_medico: { medico_id: string; nombre: string; ingresos: number }[]
  por_sexo: Record<string, number>
  edad_media: number
}

const BANDAS_ESTANCIA = [
  { clave: '0-15', etiqueta: '0-15 días' },
  { clave: '16-30', etiqueta: '16-30 días' },
  { clave: '31-60', etiqueta: '31-60 días' },
  { clave: '61-90', etiqueta: '61-90 días' },
  { clave: 'mas_90', etiqueta: 'Más de 90 días' },
]

export function ActividadDashboard({ filtros, desde, hasta }: {
  filtros: Filtros
  desde: string
  hasta: string
}) {
  const [resumen, setResumen] = useState<ResumenPeriodo | null>(null)
  const [estadoResumen, setEstadoResumen] = useState<EstadoCarga>('cargando')
  const [errorResumen, setErrorResumen] = useState('')

  const [series, setSeries] = useState<SerieDashboard | null>(null)
  const [estadoSeries, setEstadoSeries] = useState<EstadoCarga>('cargando')
  const [errorSeries, setErrorSeries] = useState('')

  const [detalle, setDetalle] = useState<ActividadDetalle | null>(null)
  const [estadoDetalle, setEstadoDetalle] = useState<EstadoCarga>('cargando')
  const [errorDetalle, setErrorDetalle] = useState('')

  const secuenciaRef = useRef(0)

  async function cargar() {
    const miSecuencia = ++secuenciaRef.current
    setEstadoResumen('cargando'); setErrorResumen('')
    setEstadoSeries('cargando'); setErrorSeries('')
    setEstadoDetalle('cargando'); setErrorDetalle('')

    const params = { p_desde: desde, p_hasta: hasta, p_medico_id: filtros.medicoId, p_estado_filtro: filtros.estado }

    const [rResumen, rSeries, rDetalle] = await Promise.all([
      supabase.rpc('dashboard_resumen', params),
      supabase.rpc('dashboard_series', params),
      supabase.rpc('dashboard_actividad_detalle', params),
    ])

    if (miSecuencia !== secuenciaRef.current) return

    if (rResumen.error) { setErrorResumen(rResumen.error.message); setEstadoResumen('error') }
    else { setResumen(rResumen.data); setEstadoResumen('listo') }

    if (rSeries.error) { setErrorSeries(rSeries.error.message); setEstadoSeries('error') }
    else { setSeries(rSeries.data); setEstadoSeries('listo') }

    if (rDetalle.error) { setErrorDetalle(rDetalle.error.message); setEstadoDetalle('error') }
    else { setDetalle(rDetalle.data); setEstadoDetalle('listo') }
  }

  useEffect(() => { cargar() }, [desde, hasta, filtros.medicoId, filtros.estado])

  const balance = resumen ? resumen.ingresos_nuevos - resumen.salidas_totales : null
  const maxBanda = detalle ? Math.max(1, ...BANDAS_ESTANCIA.map((b) => detalle.distribucion_estancia[b.clave] ?? 0)) : 1
  const totalPorSexo = detalle ? Object.values(detalle.por_sexo).reduce((a, b) => a + b, 0) : 0

  return (
    <div className="space-y-6">
      {/* ── Ocupación ────────────────────────────────────────── */}
      <section>
        <p className="section-title">Ocupación</p>
        {estadoResumen === 'cargando' && <EstadoCargando />}
        {estadoResumen === 'error' && <EstadoError mensaje={errorResumen} onReintentar={cargar} />}
        {estadoResumen === 'listo' && resumen && (
          <div className="grid grid-cols-3 gap-3 mb-4">
            <TarjetaMetrica etiqueta="Ocupación media" valor={`${resumen.ocupacion_media_pct}%`} />
            <TarjetaMetrica etiqueta="Ocupación mínima" valor={`${resumen.ocupacion_min_pct}%`} />
            <TarjetaMetrica etiqueta="Ocupación máxima" valor={`${resumen.ocupacion_max_pct}%`} />
          </div>
        )}
        <div className="card p-4">
          {estadoSeries === 'cargando' && <EstadoCargando />}
          {estadoSeries === 'error' && <EstadoError mensaje={errorSeries} onReintentar={cargar} />}
          {estadoSeries === 'listo' && series && series.ocupacion_diaria.length > 0 && (
            <ResponsiveContainer width="100%" height={260}>
              <LineChart data={series.ocupacion_diaria}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                <XAxis dataKey="fecha" tick={{ fontSize: 10 }} />
                <YAxis tick={{ fontSize: 10 }} />
                <Tooltip />
                <Line type="monotone" dataKey="camas" stroke="#2563eb" strokeWidth={2} dot={false} name="Camas ocupadas" />
              </LineChart>
            </ResponsiveContainer>
          )}
        </div>
      </section>

      {/* ── Ingresos y salidas ───────────────────────────────── */}
      <section>
        <p className="section-title">Ingresos y salidas</p>
        {estadoResumen === 'listo' && resumen && (
          <div className="grid grid-cols-2 md:grid-cols-5 gap-3 mb-4">
            <TarjetaMetrica etiqueta="Ingresos nuevos" valor={resumen.ingresos_nuevos} />
            <TarjetaMetrica etiqueta="Altas" valor={resumen.altas} />
            <TarjetaMetrica etiqueta="Traslados" valor={resumen.traslados} />
            <TarjetaMetrica etiqueta="Éxitus" valor={resumen.exitus} />
            <TarjetaMetrica etiqueta="Balance" valor={balance != null ? (balance > 0 ? `+${balance}` : balance) : '—'}
              subvalor="Ingresos − salidas, sin signo de bueno o malo" />
          </div>
        )}
        <div className="card p-4">
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
      </section>

      {/* ── Estancia ─────────────────────────────────────────── */}
      <section>
        <p className="section-title">Estancia</p>
        {estadoResumen === 'listo' && resumen && (
          <div className="grid grid-cols-2 md:grid-cols-3 gap-3 mb-4">
            <TarjetaMetrica etiqueta="Días-estancia" valor={resumen.dias_estancia} />
            <TarjetaMetrica etiqueta="Estancia media" valor={`${resumen.estancia_media_dias} d`} />
            <TarjetaMetrica etiqueta="Estancia mediana" valor={`${resumen.estancia_mediana_dias} d`} />
          </div>
        )}
        <div className="card p-4">
          <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-3">Distribución por bandas de estancia (altas del periodo)</p>
          {estadoDetalle === 'cargando' && <EstadoCargando />}
          {estadoDetalle === 'error' && <EstadoError mensaje={errorDetalle} onReintentar={cargar} />}
          {estadoDetalle === 'listo' && detalle && (
            <div className="space-y-2">
              {BANDAS_ESTANCIA.map((b) => {
                const valor = detalle.distribucion_estancia[b.clave] ?? 0
                return (
                  <div key={b.clave} className="flex items-center gap-3">
                    <span className="text-xs text-slate-500 w-24 shrink-0">{b.etiqueta}</span>
                    <div className="flex-1 bg-slate-100 rounded-full h-4 overflow-hidden">
                      <div className="bg-primary-500 h-full rounded-full" style={{ width: `${(valor / maxBanda) * 100}%` }} />
                    </div>
                    <span className="text-xs font-semibold text-slate-700 w-6 text-right shrink-0">{valor}</span>
                  </div>
                )
              })}
            </div>
          )}
        </div>
      </section>

      {/* ── Episodios activos de larga duración ──────────────── */}
      <section>
        <p className="section-title">Episodios activos de larga duración</p>
        {estadoDetalle === 'listo' && detalle && (
          <div className="grid grid-cols-3 gap-3">
            <TarjetaMetrica etiqueta="Más de 30 días" valor={detalle.activos_mas_30} />
            <TarjetaMetrica etiqueta="Más de 60 días" valor={detalle.activos_mas_60} />
            <TarjetaMetrica etiqueta="Más de 90 días" valor={detalle.activos_mas_90} />
          </div>
        )}
      </section>

      {/* ── Reparto por médico responsable ───────────────────── */}
      <section>
        <p className="section-title">Ingresos por médico responsable</p>
        <p className="text-xs text-slate-400 -mt-3 mb-2">
          Un recuento, no una medida de productividad — y no refleja cambios de médico responsable durante el ingreso, que la aplicación no registra.
        </p>
        <div className="card overflow-hidden">
          {estadoDetalle === 'cargando' && <EstadoCargando />}
          {estadoDetalle === 'error' && <EstadoError mensaje={errorDetalle} onReintentar={cargar} />}
          {estadoDetalle === 'listo' && detalle && detalle.por_medico.length === 0 && <EstadoSinDatos />}
          {estadoDetalle === 'listo' && detalle && detalle.por_medico.length > 0 && (
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b bg-slate-50 text-left text-xs font-semibold text-slate-500 uppercase tracking-wide">
                  <th className="px-4 py-2">Médico</th>
                  <th className="px-4 py-2 text-right">Ingresos nuevos</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {detalle.por_medico.map((m) => (
                  <tr key={m.medico_id}>
                    <td className="px-4 py-2 text-slate-700">{m.nombre}</td>
                    <td className="px-4 py-2 text-right tabular-nums font-medium">{m.ingresos}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </section>

      {/* ── Edad y sexo: información secundaria ──────────────── */}
      <section>
        <p className="section-title">Edad y sexo · información secundaria</p>
        {estadoDetalle === 'listo' && detalle && (
          <div className="card p-4 flex flex-wrap items-center gap-6 text-sm text-slate-600">
            <span>Edad media al ingreso: <strong className="text-slate-800">{detalle.edad_media} años</strong></span>
            {totalPorSexo > 0 && (
              <span>
                Hombres: <strong className="text-slate-800">{detalle.por_sexo.hombre ?? 0}</strong> ·{' '}
                Mujeres: <strong className="text-slate-800">{detalle.por_sexo.mujer ?? 0}</strong>
                {(detalle.por_sexo.otro ?? 0) > 0 && <> · Otro: <strong className="text-slate-800">{detalle.por_sexo.otro}</strong></>}
                {(detalle.por_sexo.sin_dato ?? 0) > 0 && <> · Sin dato: <strong className="text-slate-800">{detalle.por_sexo.sin_dato}</strong></>}
              </span>
            )}
          </div>
        )}
      </section>
    </div>
  )
}
