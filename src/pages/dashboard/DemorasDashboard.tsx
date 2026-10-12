import { useEffect, useMemo, useRef, useState } from 'react'
import { supabase } from '../../lib/supabase'
import type { Filtros, EstadoCarga } from './tipos'
import { TarjetaMetrica, EstadoCargando, EstadoError } from './ComponentesDashboard'
import { COLUMNAS_DEMORA, altaDemoraDesdeFila, resumenDemora, type AltaDemora } from './demoras'

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

  return (
    <section data-demoras-dashboard>
      <p className="section-title">Demora al alta</p>
      <p className="text-xs text-slate-500 -mt-3 mb-3">
        Altas del periodo en las que el CMBD indica que el paciente siguió ingresado estando ya listo para el alta.
      </p>

      {estado === 'cargando' && <EstadoCargando />}
      {estado === 'error' && <EstadoError mensaje={error} onReintentar={cargar} />}

      {estado === 'listo' && (
        <div className="space-y-4">
          <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
            <TarjetaMetrica etiqueta="Pacientes con demora al alta" valor={r.conDemora}
              subvalor={r.altas > 0
                ? `de ${r.altas} ${r.altas === 1 ? 'alta' : 'altas'} · ${Math.round((r.conDemora / r.altas) * 100)}%`
                : 'Sin altas en este periodo'} />
            <TarjetaMetrica etiqueta="Demora media" valor={r.mediaDias != null ? `${num(r.mediaDias)} días` : '—'}
              subvalor={r.mediaDias != null ? `${r.diasTotales} días en total` : 'Ninguna demora con días indicados'} />
            <TarjetaMetrica etiqueta="Demora mediana" valor={r.medianaDias != null ? `${num(r.medianaDias)} días` : '—'}
              subvalor="Mitad de las demoras por debajo de este valor" />
          </div>

          {(r.sinValorar > 0 || r.conDemoraSinDias > 0) && (
            <p data-demora-aviso className="text-xs text-amber-700">
              {r.sinValorar > 0 && <>En {r.sinValorar} {r.sinValorar === 1 ? 'alta' : 'altas'} la pregunta «¿Hubo demora al alta?» del CMBD está sin contestar: no se {r.sinValorar === 1 ? 'cuenta' : 'cuentan'} ni como demora ni como no demora. </>}
              {r.conDemoraSinDias > 0 && <>En {r.conDemoraSinDias} {r.conDemoraSinDias === 1 ? 'alta con demora falta' : 'altas con demora faltan'} los días: no {r.conDemoraSinDias === 1 ? 'entra' : 'entran'} en la media ni en la mediana.</>}
            </p>
          )}

          {r.porMotivo.length > 0 && (
            <div>
              <p className="text-xs font-semibold text-slate-600 mb-1.5">Por motivo de la demora</p>
              <div className="card overflow-hidden">
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
