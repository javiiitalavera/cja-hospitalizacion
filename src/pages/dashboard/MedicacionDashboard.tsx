import { useEffect, useMemo, useRef, useState } from 'react'
import { supabase } from '../../lib/supabase'
import { useCatalogoFarmacos } from '../../lib/farmacos'
import type { Filtros, EstadoCarga } from './tipos'
import { TarjetaMetrica, EstadoCargando, EstadoError, EstadoSinDatos } from './ComponentesDashboard'
import InfoIndicador from './InfoIndicador'
import { COLUMNAS_MED, episodioMedDesdeFila, resumenPeriodo, type EpisodioMed } from './medicacion'
import { porcentajeNum, useAporteExportacion, type AporteExport } from './exportar'

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

  // Lo que se lleva el botón «Exportar datos de esta vista».
  const aporte = useMemo<AporteExport | null>(() => {
    if (estado !== 'listo' || !catalogoListo) return null
    const trio = (n: { ingreso: number; alta: number }): (string | number | null)[] =>
      [n.ingreso, porcentajeNum(n.ingreso, r.conMedicacion.ingreso), n.alta, porcentajeNum(n.alta, r.conMedicacion.alta)]
    const colsMomento = ['Al ingreso (salidas)', '% al ingreso', 'Al alta (salidas)', '% al alta']
    return {
      orden: 0,
      definiciones: ['salidas', 'med_farmacos', 'med_psicofarmacos', 'med_cambio', 'med_polifarmacia', 'med_dos_antipsicoticos', 'med_cambio_grupo', 'med_grupos'],
      base: [
        { etiqueta: 'Salidas del periodo (altas, traslados y éxitus)', valor: r.altas },
        { etiqueta: 'Con medicación escrita en el informe de ingreso', valor: r.conMedicacion.ingreso },
        { etiqueta: 'Con medicación escrita en el informe de alta', valor: r.conMedicacion.alta },
        { etiqueta: 'Con medicación en los dos informes', valor: r.conAmbos },
      ],
      hojas: [
        {
          nombre: 'Medicación: resumen',
          columnas: ['Indicador', 'Al ingreso', 'Al alta'],
          filas: [
            ['Fármacos por paciente (media)', r.medias.ingreso.farmacos, r.medias.alta.farmacos],
            ['Psicofármacos por paciente (media)', r.medias.ingreso.psicofarmacos, r.medias.alta.psicofarmacos],
            ['Cambio medio ingreso → alta: fármacos', r.cambioMedio?.farmacos ?? null, null],
            ['Cambio medio ingreso → alta: psicofármacos', r.cambioMedio?.psicofarmacos ?? null, null],
          ],
          nota: 'Las medias cuentan solo las salidas con fármacos escritos en ese informe. El cambio medio, solo las que tienen los dos.',
        },
        {
          nombre: 'Polifarmacia',
          columnas: ['Indicador', ...colsMomento],
          filas: [
            ['5 o más fármacos', ...trio({ ingreso: r.polifarmacia.ingreso.cinco, alta: r.polifarmacia.alta.cinco })],
            ['10 o más fármacos', ...trio({ ingreso: r.polifarmacia.ingreso.diez, alta: r.polifarmacia.alta.diez })],
            ['2 o más antipsicóticos', ...trio(r.dosOMasAntipsicoticos)],
          ],
          nota: 'Porcentaje sobre las salidas con medicación en ese informe.',
        },
        {
          nombre: 'Cambio antipsicóticos y benzo',
          columnas: ['Grupo', 'Con ambos informes', 'Aumentan', '% aumentan', 'Igual', '% igual', 'Reducen', '% reducen', 'Empiezan', 'Se retiran'],
          filas: r.cambioPorGrupo.map((c) => [c.etiqueta, c.conAmbos, c.aumentan, porcentajeNum(c.aumentan, c.conAmbos), c.igual, porcentajeNum(c.igual, c.conAmbos),
            c.reducen, porcentajeNum(c.reducen, c.conAmbos), c.inician, c.suspenden]),
          nota: '«Empiezan» y «Se retiran» ya están contados dentro de «aumentan» o «reducen». Cambiar un antipsicótico por otro cuenta como «igual».',
        },
        {
          nombre: 'Fármacos por grupo',
          columnas: ['Grupo', ...colsMomento],
          filas: r.grupos.filter((g) => !(['estabilizador', 'otro'].includes(g.clave) && g.n.ingreso + g.n.alta === 0)).map((g) => [g.etiqueta, ...trio(g.n)]),
          nota: 'Salidas con al menos un fármaco del grupo. Los grupos se solapan.',
        },
        ...(r.sinClasificar.length + r.dudosos.length > 0 ? [{
          nombre: 'Pendientes de marcar',
          columnas: ['Fármaco', 'Situación', 'Veces'],
          filas: [
            ...r.dudosos.map((x): (string | number | null)[] => [x.texto, 'De uso mixto, sin marcar', x.n]),
            ...r.sinClasificar.map((x): (string | number | null)[] => [x.texto, 'No reconocido por el catálogo', x.n]),
          ],
          nota: 'Cuentan como fármaco, pero no entran en el recuento de psicofármacos hasta que alguien los marque.',
        }] : []),
      ],
    }
  }, [estado, catalogoListo, r])
  useAporteExportacion('medicacion', aporte)

  if (estado === 'cargando') return <EstadoCargando />
  if (estado === 'error') return <EstadoError mensaje={error} onReintentar={cargar} />
  if (estado === 'sin_datos') return <EstadoSinDatos mensaje="No hay salidas (altas, traslados o éxitus) en este periodo." />
  if (!catalogoListo) return <EstadoCargando />

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <TarjetaMetrica info="salidas" etiqueta="Salidas del periodo" valor={r.altas}
          subvalor={`Altas, traslados y éxitus · ${r.conMedicacion.ingreso} con medicación al ingreso · ${r.conMedicacion.alta} al alta`} />
        <TarjetaMetrica info="med_farmacos" etiqueta="Fármacos por paciente" valor={`${num(r.medias.ingreso.farmacos)} → ${num(r.medias.alta.farmacos)}`}
          subvalor="Media al ingreso → al alta" />
        <TarjetaMetrica info="med_psicofarmacos" etiqueta="Psicofármacos por paciente" valor={`${num(r.medias.ingreso.psicofarmacos)} → ${num(r.medias.alta.psicofarmacos)}`}
          subvalor="Media al ingreso → al alta" />
        <TarjetaMetrica info="med_cambio" etiqueta="Cambio medio ingreso → alta"
          valor={r.cambioMedio ? `${signo(r.cambioMedio.farmacos)} fármacos` : '—'}
          subvalor={r.cambioMedio ? `${signo(r.cambioMedio.psicofarmacos)} psicofármacos · ${r.conAmbos} salidas con ambos informes` : 'Faltan salidas con medicación en los dos informes'} />
      </div>
      <p className="text-xs text-slate-500 -mt-3">
        Las medias cuentan solo las salidas que tienen fármacos escritos en ese informe. Un mismo principio activo se cuenta una vez.
        Psicofármacos: antipsicóticos, litio, ansiolíticos, hipnóticos, antidepresivos, psicoestimulantes/nootrópicos y antidemencia (grupos N05 y N06 de la clasificación ATC).
      </p>

      <section>
        <p className="section-title">Polifarmacia y antipsicóticos</p>
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
                  <td className="py-2 text-slate-700">{et} <InfoIndicador clave="med_polifarmacia" /></td>
                  {(['ingreso', 'alta'] as const).map((m) => (
                    <td key={m} className="py-2 text-right tabular-nums text-slate-700">
                      <span className="font-semibold">{r.polifarmacia[m][k]}</span>
                      <span className="text-slate-500"> · {pct(r.polifarmacia[m][k], r.conMedicacion[m])}</span>
                    </td>
                  ))}
                </tr>
              ))}
              <tr className="border-b last:border-0" data-dos-antipsicoticos>
                <td className="py-2 text-slate-700">2 o más antipsicóticos <InfoIndicador clave="med_dos_antipsicoticos" /></td>
                {(['ingreso', 'alta'] as const).map((m) => (
                  <td key={m} className="py-2 text-right tabular-nums text-slate-700">
                    <span className="font-semibold">{r.dosOMasAntipsicoticos[m]}</span>
                    <span className="text-slate-500"> · {pct(r.dosOMasAntipsicoticos[m], r.conMedicacion[m])}</span>
                  </td>
                ))}
              </tr>
            </tbody>
          </table>
        </div>
      </section>

      <section>
        <p className="section-title">Antipsicóticos y benzodiacepinas: cambio entre el ingreso y el alta</p>
        <div className="card p-4">
          <table className="w-full text-sm" data-cambio-psicofarmacos>
            <thead>
              <tr className="text-xs text-slate-500 border-b">
                <th className="text-left font-semibold py-2">Grupo <InfoIndicador clave="med_cambio_grupo" /></th>
                <th className="text-right font-semibold py-2 whitespace-nowrap">Con ambos informes</th>
                <th className="text-right font-semibold py-2">Aumentan</th>
                <th className="text-right font-semibold py-2">Igual</th>
                <th className="text-right font-semibold py-2">Reducen</th>
                <th className="text-right font-semibold py-2 whitespace-nowrap">Empiezan</th>
                <th className="text-right font-semibold py-2 whitespace-nowrap">Se retiran</th>
              </tr>
            </thead>
            <tbody>
              {r.cambioPorGrupo.map((c) => (
                <tr key={c.clave} className="border-b last:border-0" data-grupo={c.clave}>
                  <td className="py-2 text-slate-700">{c.etiqueta}</td>
                  <td className="py-2 text-right tabular-nums text-slate-700 font-semibold">{c.conAmbos}</td>
                  {([c.aumentan, c.igual, c.reducen, c.inician, c.suspenden]).map((n, i) => (
                    <td key={i} className="py-2 text-right tabular-nums text-slate-700">
                      <span className="font-semibold">{n}</span>
                      <span className="text-slate-500"> · {pct(n, c.conAmbos)}</span>
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
          <p className="text-xs text-slate-500 mt-3">
            Se compara cuántos fármacos del grupo tiene cada paciente en el informe de ingreso y en el de alta, solo en las salidas con medicación escrita en los dos.
            «Empiezan»: sin ninguno al ingreso y con alguno al alta. «Se retiran»: con alguno al ingreso y ninguno al alta; ambos ya están contados dentro de «aumentan» o «reducen».
            Cambiar un antipsicótico por otro cuenta como «igual». Reducir fármacos no demuestra por sí solo una mejor atención: hay que interpretarlo junto con la evolución clínica.
          </p>
        </div>
      </section>

      <section>
        <p className="section-title">Pacientes con al menos un fármaco de cada grupo</p>
        <div className="card p-4">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-xs text-slate-500 border-b">
                <th className="text-left font-semibold py-2">Grupo <InfoIndicador clave="med_grupos" /></th>
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
                      <span className="text-slate-500"> · {pct(g.n[m], r.conMedicacion[m])}</span>
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
          <p className="text-xs text-slate-500 mt-3">
            Porcentaje sobre las salidas con medicación en ese informe. Los grupos se solapan: un paciente con un antipsicótico y una benzodiacepina cuenta en las dos filas.
          </p>
        </div>
      </section>

      {(r.sinClasificar.length > 0 || r.dudosos.length > 0) && (
        <section>
          <p className="section-title">Pendientes de marcar: ¿son psicofármacos?</p>
          <div className="card p-4 space-y-4">
            <p className="text-xs text-slate-500">
              Hay {r.conPendientes.ingreso} {r.conPendientes.ingreso === 1 ? 'salida' : 'salidas'} con algo pendiente en el informe de ingreso y {r.conPendientes.alta} en el de alta.
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
