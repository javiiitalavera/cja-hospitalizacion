import { useEffect, useMemo, useRef, useState } from 'react'
import { supabase } from '../../lib/supabase'
import type { Filtros, EstadoCarga } from './tipos'
import { TarjetaMetrica, EstadoCargando, EstadoError } from './ComponentesDashboard'
import { COLUMNAS_DEMORA, altaDemoraDesdeFila, resumenDemora, type AltaDemora } from './demoras'
import { porcentajeNum, useAporteExportacion, type AporteExport } from './exportar'

const PAGINA = 1000

function num(x: number, dec = 1): string {
  return x.toFixed(dec).replace('.', ',')
}

// Demora al alta: pacientes con demora, media y mediana, leídos del CMBD de las altas del periodo.
export function DemorasDashboard({ filtros, desde, hasta }: { filtros: Filtros; desde: string; hasta: string }) {
  const [altas, setAltas] = useState<AltaDemora[]>([])
  const [estado, setEstado] = useState<EstadoCarga>('cargando')
  const [error, setError] = useState('')
  const secuenciaRef = useRef(0)

  async function cargar() {
    const mi = ++secuenciaRef.current
    setEstado('cargando'); setError('')
    const filas: Record<string, any>[] = []
    for (let desdeFila = 0; ; desdeFila += PAGINA) {
      let q = supabase.from('ingresos').select(COLUMNAS_DEMORA)
        .gte('fecha_alta', desde).lte('fecha_alta', hasta)
        .neq('estado', 'exitus')   // un éxitus no tiene demora al alta
      if (filtros.medicoId) q = q.eq('medico_responsable_id', filtros.medicoId)
      const { data, error: err } = await q.order('id').range(desdeFila, desdeFila + PAGINA - 1)
      if (mi !== secuenciaRef.current) return
      if (err) { setError(err.message); setEstado('error'); return }
      filas.push(...(data ?? []))
      if ((data?.length ?? 0) < PAGINA) break
    }
    setAltas(filas.map(altaDemoraDesdeFila))
    setEstado('listo')
  }

  useEffect(() => { cargar() }, [desde, hasta, filtros.medicoId])

  const r = useMemo(() => resumenDemora(altas), [altas])

  // Lo que se lleva el botón «Exportar datos de esta vista» (Actividad).
  const aporte = useMemo<AporteExport | null>(() => {
    if (estado !== 'listo') return null
    return {
      orden: 10,
      definiciones: ['demora_pacientes', 'demora_media', 'demora_mediana'],
      base: [
        { etiqueta: 'Salidas del periodo sin éxitus (base de la demora al alta)', valor: r.altas },
        { etiqueta: 'Con la pregunta «¿Hubo demora al alta?» contestada', valor: r.valoradas },
      ],
      hojas: [
        {
          nombre: 'Demora al alta',
          columnas: ['Indicador', 'Valor'],
          filas: [
            ['Con demora al alta', r.conDemora],
            ['Sin demora al alta', r.sinDemora],
            ['Pregunta sin contestar', r.sinValorar],
            ['% con demora sobre las contestadas', porcentajeNum(r.conDemora, r.valoradas)],
            ['Con demora pero sin días indicados', r.conDemoraSinDias],
            ['Demora media (días)', r.mediaDias],
            ['Demora mediana (días)', r.medianaDias],
            ['Días de demora en total', r.diasTotales],
          ],
          nota: 'Media y mediana solo con las demoras que tienen los días indicados. Los éxitus no se incluyen.',
        },
        {
          nombre: 'Demora por motivo',
          columnas: ['Motivo', 'Pacientes', 'Días de demora', 'Demora media (días)'],
          filas: r.porMotivo.map((m) => [m.etiqueta, m.pacientes, m.conDias > 0 ? m.dias : null, m.conDias > 0 ? m.dias / m.conDias : null]),
        },
      ],
    }
  }, [estado, r])
  useAporteExportacion('demora', aporte)

  return (
    <section data-demoras-dashboard>
      <p className="section-title">Demora al alta</p>

      {estado === 'cargando' && <EstadoCargando />}
      {estado === 'error' && <EstadoError mensaje={error} onReintentar={cargar} />}

      {estado === 'listo' && (
        <div className="space-y-4">
          <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
            <TarjetaMetrica info="demora_pacientes" etiqueta="Pacientes con demora al alta" valor={r.valoradas > 0 ? r.conDemora : '—'}
              subvalor={r.altas === 0
                ? 'Sin salidas en este periodo'
                : r.valoradas === 0
                  ? `Sin datos evaluados: la pregunta no está contestada en ninguna de las ${r.altas} ${r.altas === 1 ? 'salida' : 'salidas'}`
                  : `de ${r.valoradas} con la pregunta contestada (${r.altas} ${r.altas === 1 ? 'salida' : 'salidas'}) · ${Math.round((r.conDemora / r.valoradas) * 100)}%`} />
            <TarjetaMetrica info="demora_media" etiqueta="Demora media" valor={r.mediaDias != null ? `${num(r.mediaDias)} días` : '—'}
              subvalor={r.mediaDias != null ? `${r.diasTotales} días en total` : 'Ninguna demora con días indicados'} />
            <TarjetaMetrica info="demora_mediana" etiqueta="Demora mediana" valor={r.medianaDias != null ? `${num(r.medianaDias)} días` : '—'} />
          </div>

          {(r.sinValorar > 0 || r.conDemoraSinDias > 0) && (
            <p data-demora-aviso className="text-xs text-amber-700">
              {r.sinValorar > 0 && <>En {r.sinValorar} {r.sinValorar === 1 ? 'salida' : 'salidas'} la pregunta «¿Hubo demora al alta?» del CMBD está sin contestar: no se {r.sinValorar === 1 ? 'cuenta' : 'cuentan'} ni como demora ni como no demora. </>}
              {r.conDemoraSinDias > 0 && <>En {r.conDemoraSinDias} {r.conDemoraSinDias === 1 ? 'salida con demora falta' : 'salidas con demora faltan'} los días: no {r.conDemoraSinDias === 1 ? 'entra' : 'entran'} en la media ni en la mediana.</>}
            </p>
          )}

          {r.porMotivo.length > 0 && (
            <div>
              <p className="text-xs font-semibold text-slate-600 mb-1.5">Por motivo de la demora</p>
              <div className="card tabla-scroll">
                <table className="w-full text-sm" data-por-motivo>
                  <thead>
                    <tr className="border-b bg-slate-50 text-left text-xs font-semibold text-slate-500">
                      <th className="px-4 py-2">Motivo</th>
                      <th className="px-4 py-2 text-right">Pacientes</th>
                      <th className="px-4 py-2 text-right">Días de demora</th>
                      <th className="px-4 py-2 text-right">Media</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y">
                    {r.porMotivo.map((m) => (
                      <tr key={m.clave} data-motivo={m.clave}>
                        <td className="px-4 py-2 text-slate-700">{m.etiqueta}</td>
                        <td className="px-4 py-2 text-right tabular-nums font-medium">{m.pacientes}</td>
                        <td className="px-4 py-2 text-right tabular-nums">{m.conDias > 0 ? m.dias : '—'}</td>
                        <td className="px-4 py-2 text-right tabular-nums">{m.conDias > 0 ? num(m.dias / m.conDias) : '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      )}
    </section>
  )
}
