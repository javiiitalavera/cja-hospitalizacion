import { useEffect, useMemo, useRef, useState } from 'react'
import { supabase } from '../../lib/supabase'
import type { Filtros, EstadoCarga } from './tipos'
import { TarjetaMetrica, EstadoCargando, EstadoError, EstadoSinDatos } from './ComponentesDashboard'
import InfoIndicador from './InfoIndicador'
import {
  COLUMNAS_EVOLUCION, episodioEscalasDesdeFila, resumenEvolucion, type EpisodioEscalas, type ResumenEscala,
} from './evolucion'
import { useAporteExportacion, type AporteExport } from './exportar'

const PAGINA = 1000
const POCOS_CASOS = 10

function num(x: number, dec = 1): string {
  return x.toFixed(dec).replace('.', ',')
}
function signo(x: number): string {
  return `${x > 0 ? '+' : ''}${num(x)}`
}
function pct(n: number, total: number): string {
  return total > 0 ? `${Math.round((n / total) * 100)}%` : '—'
}

// Barra con tres tramos: mejoran / igual / empeoran. Los números van siempre escritos al lado,
// el color solo refuerza.
function BarraCambio({ r }: { r: ResumenEscala }) {
  const n = r.conAmbas
  if (n === 0) return <span className="text-slate-500">—</span>
  const tramos = [
    { v: r.mejoran, color: 'bg-teal-600', et: 'mejoran' },
    { v: r.igual, color: 'bg-slate-300', et: 'igual' },
    { v: r.empeoran, color: 'bg-amber-500', et: 'empeoran' },
  ]
  return (
    <div
      className="flex h-2.5 w-full rounded-full overflow-hidden bg-slate-100"
      role="img"
      aria-label={`${r.def.etiqueta}: ${r.mejoran} mejoran, ${r.igual} igual, ${r.empeoran} empeoran`}
    >
      {tramos.map((t) => t.v > 0 && (
        <div key={t.et} className={t.color} style={{ width: `${(t.v / n) * 100}%` }} />
      ))}
    </div>
  )
}

export function EvolucionDashboard({ filtros, desde, hasta }: { filtros: Filtros; desde: string; hasta: string }) {
  const [episodios, setEpisodios] = useState<EpisodioEscalas[]>([])
  const [estado, setEstado] = useState<EstadoCarga>('cargando')
  const [error, setError] = useState('')
  const secuenciaRef = useRef(0)

  async function cargar() {
    const mi = ++secuenciaRef.current
    setEstado('cargando'); setError('')
    // Las altas del periodo, cada una con sus escalas del ingreso y del alta.
    const filas: Record<string, any>[] = []
    for (let desdeFila = 0; ; desdeFila += PAGINA) {
      let q = supabase.from('ingresos').select(`id, ${COLUMNAS_EVOLUCION}`)
        .gte('fecha_alta', desde).lte('fecha_alta', hasta)
      if (filtros.medicoId) q = q.eq('medico_responsable_id', filtros.medicoId)
      const { data, error: err } = await q.order('id').range(desdeFila, desdeFila + PAGINA - 1)
      if (mi !== secuenciaRef.current) return
      if (err) { setError(err.message); setEstado('error'); return }
      filas.push(...(data ?? []))
      if ((data?.length ?? 0) < PAGINA) break
    }
    setEpisodios(filas.map(episodioEscalasDesdeFila))
    setEstado(filas.length === 0 ? 'sin_datos' : 'listo')
  }

  useEffect(() => { cargar() }, [desde, hasta, filtros.medicoId])

  const r = useMemo(() => resumenEvolucion(episodios), [episodios])

  // Lo que se lleva el botón «Exportar datos de esta vista».
  const aporte = useMemo<AporteExport | null>(() => {
    if (estado !== 'listo') return null
    return {
      orden: 0,
      definiciones: ['salidas', 'escala_ambas', 'escala_media', 'escala_cambio', 'escala_mejoran'],
      base: [{ etiqueta: 'Salidas del periodo (altas, traslados y éxitus)', valor: r.altas }],
      hojas: [{
        nombre: 'Cambio ingreso-alta',
        columnas: ['Escala', 'Tema', 'Rango', 'Sentido', 'Con valoración al ingreso', 'Con valoración al alta', 'Con ambas', 'Media al ingreso', 'Media al alta',
          'Cambio medio', 'Cambio mediano', 'Mejoran', 'Igual', 'Empeoran'],
        filas: r.escalas.map((e) => [e.def.etiqueta, e.def.tema, e.def.rango, e.def.sentido, e.conIngreso, e.conAlta, e.conAmbas,
          e.mediaIngreso, e.mediaAlta, e.cambioMedio, e.cambioMediano, e.mejoran, e.igual, e.empeoran]),
        nota: 'Medias y cambios solo con las salidas que tienen la escala en los dos momentos. «Mejoran»: menos puntos en NPI-Q, más en Barthel y Lawton. Lawton cuenta solo cuando está completo.',
      }],
    }
  }, [estado, r])
  useAporteExportacion('evolucion', aporte)

  if (estado === 'cargando') return <EstadoCargando />
  if (estado === 'error') return <EstadoError mensaje={error} onReintentar={cargar} />
  if (estado === 'sin_datos') return <EstadoSinDatos mensaje="No hay salidas (altas, traslados o éxitus) en este periodo." />

  const poco = r.escalas.some((e) => e.conAmbas < POCOS_CASOS)

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <TarjetaMetrica info="salidas" etiqueta="Salidas del periodo" valor={r.altas} />
        {r.escalas.map((e) => (
          <TarjetaMetrica
            key={e.def.clave}
            info="escala_cambio"
            etiqueta={`${e.def.tema} · ${e.def.etiqueta}`}
            valor={e.cambioMedio != null ? signo(e.cambioMedio) : '—'}
            subvalor={e.conAmbas > 0
              ? `Cambio medio ingreso → alta · ${e.conAmbas} de ${r.altas} salidas con ambas valoraciones`
              : `Ninguna alta con ambas valoraciones (${e.conIngreso} al ingreso, ${e.conAlta} al alta)`}
          />
        ))}
      </div>

      <section>
        <p className="section-title">Cambio entre el ingreso y el alta</p>
        <div className="card overflow-x-auto" tabIndex={0} role="region" aria-label="Cambio de conducta y autonomía: tabla con desplazamiento horizontal">
          <table className="w-full text-sm min-w-[54rem]">
            <thead>
              <tr className="border-b bg-slate-50 text-left text-xs font-semibold text-slate-500">
                <th className="px-4 py-2 w-60">Escala</th>
                <th className="px-4 py-2 text-right whitespace-nowrap">Con ambas valoraciones <InfoIndicador clave="escala_ambas" /></th>
                <th className="px-4 py-2 text-right whitespace-nowrap">Media ingreso → alta <InfoIndicador clave="escala_media" /></th>
                <th className="px-4 py-2 text-right whitespace-nowrap">Cambio medio (mediana) <InfoIndicador clave="escala_cambio" /></th>
                <th className="px-4 py-2 w-72">Pacientes que mejoran · igual · empeoran <InfoIndicador clave="escala_mejoran" /></th>
              </tr>
            </thead>
            <tbody>
              {r.escalas.map((e) => (
                <tr key={e.def.clave} className="border-b last:border-0 align-top" data-escala={e.def.clave}>
                  <td className="px-4 py-3">
                    <p className="font-medium text-slate-800">{e.def.etiqueta}</p>
                    <p className="text-xs text-slate-500">{e.def.tema} · {e.def.rango} · {e.def.sentido}</p>
                  </td>
                  <td className="px-4 py-3 text-right tabular-nums text-slate-700 whitespace-nowrap">
                    <span className="font-semibold">{e.conAmbas}</span>
                    <span className="text-slate-500"> de {r.altas}</span>
                  </td>
                  <td className="px-4 py-3 text-right tabular-nums text-slate-700 whitespace-nowrap">
                    {e.conAmbas > 0 ? `${num(e.mediaIngreso!)} → ${num(e.mediaAlta!)}` : '—'}
                  </td>
                  <td className="px-4 py-3 text-right tabular-nums text-slate-700 whitespace-nowrap">
                    {e.conAmbas > 0 ? (
                      <>
                        <span className="font-semibold">{signo(e.cambioMedio!)}</span>
                        <span className="text-slate-500"> ({signo(e.cambioMediano!)})</span>
                      </>
                    ) : '—'}
                  </td>
                  <td className="px-4 py-3">
                    <BarraCambio r={e} />
                    {e.conAmbas > 0 && (
                      <p className="text-xs text-slate-600 mt-1.5 tabular-nums">
                        <span className="font-semibold text-teal-700">{e.mejoran}</span> mejoran ({pct(e.mejoran, e.conAmbas)}) ·{' '}
                        <span className="font-semibold">{e.igual}</span> igual ({pct(e.igual, e.conAmbas)}) ·{' '}
                        <span className="font-semibold text-amber-700">{e.empeoran}</span> empeoran ({pct(e.empeoran, e.conAmbas)})
                      </p>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="text-xs text-slate-500 mt-2 space-y-1">
          <p>
            Conducta y autonomía se muestran por separado a propósito: no se combinan en una puntuación única.
            {poco && ' Con menos de 10 salidas comparables en alguna escala, las cifras son orientativas.'}
          </p>
        </div>
      </section>
    </div>
  )
}
