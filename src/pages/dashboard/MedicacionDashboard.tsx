import { useEffect, useMemo, useRef, useState } from 'react'
import { supabase } from '../../lib/supabase'
import { useCatalogoFarmacos } from '../../lib/farmacos'
import type { Filtros, EstadoCarga } from './tipos'
import { TarjetaMetrica, EstadoCargando, EstadoError, EstadoSinDatos } from './ComponentesDashboard'
import { COLUMNAS_MED, episodioMedDesdeFila, resumenPeriodo, type EpisodioMed } from './medicacion'

const PAGINA = 1000

function pct(n: number, total: number): string {
  return total > 0 ? `${Math.round((n / total) * 1000) / 10}%`.replace('.', ',') : '—'
}
function num(x: number, dec = 1): string {
  return x.toFixed(dec).replace('.', ',')
}
function signo(x: number): string {
  return `${x > 0 ? '+' : ''}${num(x)}`
}

export function MedicacionDashboard({ filtros, desde, hasta }: { filtros: Filtros; desde: string; hasta: string }) {
  const [episodios, setEpisodios] = useState<EpisodioMed[]>([])
  const [estado, setEstado] = useState<EstadoCarga>('cargando')
  const [error, setError] = useState('')
  const secuenciaRef = useRef(0)
  const catalogoListo = useCatalogoFarmacos(true)

  async function cargar() {
    const mi = ++secuenciaRef.current
    setEstado('cargando'); setError('')
    // Las altas del periodo, cada una con los fármacos de su informe de ingreso y de su informe de alta.
    const filas: Record<string, any>[] = []
    for (let desdeFila = 0; ; desdeFila += PAGINA) {
      let q = supabase.from('ingresos').select(`id, ${COLUMNAS_MED}`)
        .gte('fecha_alta', desde).lte('fecha_alta', hasta)
      if (filtros.medicoId) q = q.eq('medico_responsable_id', filtros.medicoId)
      const { data, error: err } = await q.order('id').range(desdeFila, desdeFila + PAGINA - 1)
      if (mi !== secuenciaRef.current) return
      if (err) { setError(err.message); setEstado('error'); return }
      filas.push(...(data ?? []))
      if ((data?.length ?? 0) < PAGINA) break
    }
    // Se guardan las filas en bruto: se interpretan cuando el catálogo de fármacos está cargado.
    setBruto(filas)
    setEstado(filas.length === 0 ? 'sin_datos' : 'listo')
  }
  const [bruto, setBruto] = useState<Record<string, any>[]>([])

  useEffect(() => { cargar() }, [desde, hasta, filtros.medicoId])
  useEffect(() => {
    if (catalogoListo) setEpisodios(bruto.map(episodioMedDesdeFila))
  }, [bruto, catalogoListo])

  const r = useMemo(() => resumenPeriodo(episodios), [episodios])

  if (estado === 'cargando') return <EstadoCargando />
  if (estado === 'error') return <EstadoError mensaje={error} onReintentar={cargar} />
  if (estado === 'sin_datos') return <EstadoSinDatos mensaje="No hay altas en este periodo." />
  if (!catalogoListo) return <EstadoCargando />

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <TarjetaMetrica etiqueta="Altas del periodo" valor={r.altas}
          subvalor={`${r.conMedicacion.ingreso} con medicación al ingreso · ${r.conMedicacion.alta} al alta`} />
        <TarjetaMetrica etiqueta="Fármacos por paciente" valor={`${num(r.medias.ingreso.farmacos)} → ${num(r.medias.alta.farmacos)}`}
          subvalor="Media al ingreso → al alta" />
        <TarjetaMetrica etiqueta="Psicofármacos por paciente" valor={`${num(r.medias.ingreso.psicofarmacos)} → ${num(r.medias.alta.psicofarmacos)}`}
          subvalor="Media al ingreso → al alta" />
        <TarjetaMetrica etiqueta="Cambio medio ingreso → alta"
          valor={r.cambioMedio ? `${signo(r.cambioMedio.farmacos)} fármacos` : '—'}
          subvalor={r.cambioMedio ? `${signo(r.cambioMedio.psicofarmacos)} psicofármacos · ${r.conAmbos} altas con ambos informes` : 'Faltan altas con medicación en los dos informes'} />
      </div>
      <p className="text-xs text-slate-500 -mt-3">
        Las medias cuentan solo las altas que tienen fármacos escritos en ese informe. Un mismo principio activo se cuenta una vez.
        Psicofármacos: antipsicóticos, litio, ansiolíticos, hipnóticos, antidepresivos, psicoestimulantes/nootrópicos y antidemencia (grupos N05 y N06 de la clasificación ATC).
      </p>

      <section>
        <p className="section-title">Polifarmacia</p>
        <div className="card p-4">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-xs text-slate-500 border-b">
                <th className="text-left font-semibold py-2"></th>
                <th className="text-right font-semibold py-2 w-40">Al ingreso</th>
                <th className="text-right font-semibold py-2 w-40">Al alta</th>
              </tr>
            </thead>
            <tbody>
              {([['cinco', '5 o más fármacos'], ['diez', '10 o más fármacos']] as const).map(([k, et]) => (
                <tr key={k} className="border-b last:border-0">
                  <td className="py-2 text-slate-700">{et}</td>
                  {(['ingreso', 'alta'] as const).map((m) => (
                    <td key={m} className="py-2 text-right tabular-nums text-slate-700">
                      <span className="font-semibold">{r.polifarmacia[m][k]}</span>
                      <span className="text-slate-400"> · {pct(r.polifarmacia[m][k], r.conMedicacion[m])}</span>
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section>
        <p className="section-title">Pacientes con al menos un fármaco de cada grupo</p>
        <div className="card p-4">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-xs text-slate-500 border-b">
                <th className="text-left font-semibold py-2">Grupo</th>
                <th className="text-right font-semibold py-2 w-40">Al ingreso</th>
                <th className="text-right font-semibold py-2 w-40">Al alta</th>
              </tr>
            </thead>
            <tbody>
              {r.grupos.filter((g) => !(['estabilizador', 'otro'].includes(g.clave) && g.n.ingreso + g.n.alta === 0)).map((g) => (
                <tr key={g.clave} className="border-b last:border-0">
                  <td className="py-2 text-slate-700">{g.etiqueta}</td>
                  {(['ingreso', 'alta'] as const).map((m) => (
                    <td key={m} className="py-2 text-right tabular-nums text-slate-700">
                      <span className="font-semibold">{g.n[m]}</span>
                      <span className="text-slate-400"> · {pct(g.n[m], r.conMedicacion[m])}</span>
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
          <p className="text-xs text-slate-400 mt-3">
            Porcentaje sobre las altas con medicación en ese informe. Los grupos se solapan: un paciente con un antipsicótico y una benzodiacepina cuenta en las dos filas.
          </p>
        </div>
      </section>

      {(r.sinClasificar.length > 0 || r.dudosos.length > 0) && (
        <section>
          <p className="section-title">Pendientes de marcar: ¿son psicofármacos?</p>
          <div className="card p-4 space-y-4">
            <p className="text-xs text-slate-500">
              Hay {r.conPendientes.ingreso} {r.conPendientes.ingreso === 1 ? 'alta' : 'altas'} con algo pendiente en el ingreso y {r.conPendientes.alta} en el alta.
              Estos fármacos cuentan como fármaco, pero <strong>no entran en el recuento de psicofármacos</strong> hasta que alguien los marque
              «Sí» (o «No») en la tabla de medicación del informe.
            </p>
            {r.dudosos.length > 0 && (
              <div>
                <p className="text-xs font-semibold text-slate-600 mb-1.5">De uso mixto (según el caso, estabilizador del ánimo o antiepiléptico)</p>
                <div className="flex flex-wrap gap-2">
                  {r.dudosos.map((x) => (
                    <span key={x.texto} className="text-xs px-2 py-1 rounded-full bg-amber-50 text-amber-800 border border-amber-200">
                      {x.texto} <span className="font-semibold">· {x.n}</span>
                    </span>
                  ))}
                </div>
              </div>
            )}
            {r.sinClasificar.length > 0 && (
              <div>
                <p className="text-xs font-semibold text-slate-600 mb-1.5">Que el catálogo no reconoce (si se repiten, conviene añadirlos al catálogo)</p>
                <div className="flex flex-wrap gap-2">
                  {r.sinClasificar.map((x) => (
                    <span key={x.texto} className="text-xs px-2 py-1 rounded-full bg-amber-50 text-amber-800 border border-amber-200">
                      {x.texto} <span className="font-semibold">· {x.n}</span>
                    </span>
                  ))}
                </div>
              </div>
            )}
          </div>
        </section>
      )}
    </div>
  )
}
