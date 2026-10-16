import { useEffect, useMemo, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend } from 'recharts'
import { supabase } from '../../lib/supabase'
import type { Filtros, EstadoCarga } from './tipos'
import { TarjetaMetrica, EstadoCargando, EstadoError, EstadoSinDatos } from './ComponentesDashboard'
import InfoIndicador from './InfoIndicador'
import { FOCO_CELDA } from '../../lib/accesibilidad'
import { fechaES, porcentajeNum, useAporteExportacion, type AporteExport, type Celda } from './exportar'
import { CONTENCION_DIA_LABEL, CONTENCION_NOCHE_LABEL, type ContencionDia, type ContencionNoche } from '../../types/contenciones'

// ─── Lo que devuelve la función dashboard_contenciones ───────

type Categoria = 'activa' | 'si_precisa' | 'ninguna' | 'sin_dato'

interface Contenciones {
  agrupacion: 'day' | 'week' | 'month'
  umbral_dias: number
  ventana_ingreso_dias: number
  serie: { inicio: string; fin: string; dias_paciente: number; dias_activa: number; dias_si_precisa: number; dias_sin_dato: number }[]
  medidas: {
    dias_paciente: number
    dia_sin_dato: number
    noche_sin_dato: number
    dia: { clave: string; dias: number; pacientes: number }[]
    noche: { clave: string; dias: number; pacientes: number }[]
    noche_resumen: { con_contencion: number; solo_alternativas: number; sin_nada: number }
  }
  duracion: {
    vigentes: { ingreso_id: string; paciente: string; habitacion: number | null; desde: string; dias: number }[]
    terminadas: { n: number; mediana: number | null; media: number | null; maximo: number | null; mas_del_umbral: number }
  }
  sucesos: {
    tipos: Record<string, { total: number; sin_turno: number; sin_pauta: number; con_sujecion_declarada: number }>
    franjas: { tipo: string; franja: 'dia' | 'noche'; con_contencion: boolean; sucesos: number; dias: number }[]
  }
  ingreso_vs_alta: { altas: number; combinaciones: { al_ingreso: Categoria; al_alta: Categoria; n: number }[] }
}

const CATEGORIAS: { clave: Categoria; etiqueta: string }[] = [
  { clave: 'activa', etiqueta: 'Contención activa' },
  { clave: 'si_precisa', etiqueta: 'Solo «si precisa»' },
  { clave: 'ninguna', etiqueta: 'Sin contención' },
  { clave: 'sin_dato', etiqueta: 'Sin dato' },
]

const NOCHE_ES_CONTENCION = new Set(['contencion_fija', 'contencion_si_precisa'])

// Pocos casos: por debajo de esto las tasas y los porcentajes se mueven demasiado para sacar conclusiones.
const POCOS_SUCESOS = 10

const num1 = (x: number) => x.toLocaleString('es-ES', { maximumFractionDigits: 1 })
const pct = (n: number, d: number): string => (d > 0 ? `${num1((n / d) * 100)} %` : '—')
const pctNum = (n: number, d: number): number | null => porcentajeNum(n, d)
const tasa = (n: number, d: number): number | null => (d > 0 ? Math.round((n / d) * 10000) / 10 : null)

function etiquetaDia(clave: string): string {
  return CONTENCION_DIA_LABEL[clave as ContencionDia] ?? 'Revisada, sin nada pautado'
}
function etiquetaNoche(clave: string): string {
  return clave === 'ninguna' ? 'Revisada, sin nada pautado' : (CONTENCION_NOCHE_LABEL[clave as ContencionNoche] ?? clave)
}

function etiquetaTramo(inicio: string, agrupacion: Contenciones['agrupacion']): string {
  const [, m, d] = inicio.split('-')
  if (agrupacion === 'day') return `${d}/${m}`
  if (agrupacion === 'month') return `${m}/${inicio.slice(0, 4)}`
  return `${d}/${m}`
}

const SUCESO_LABEL: Record<string, string> = { caida: 'Caídas', agresividad_fisica: 'Agresiones físicas' }

export function ContencionesDashboard({ filtros, desde, hasta }: { filtros: Filtros; desde: string; hasta: string }) {
  const [datos, setDatos] = useState<Contenciones | null>(null)
  const [estado, setEstado] = useState<EstadoCarga>('cargando')
  const [error, setError] = useState('')
  const secuenciaRef = useRef(0)

  async function cargar() {
    const mi = ++secuenciaRef.current
    setEstado('cargando')
    setError('')
    const { data, error: err } = await supabase.rpc('dashboard_contenciones', {
      p_desde: desde, p_hasta: hasta, p_medico_id: filtros.medicoId,
    })
    if (mi !== secuenciaRef.current) return
    if (err) { setError(err.message); setEstado('error'); return }
    setDatos(data)
    setEstado((data?.medidas?.dias_paciente ?? 0) > 0 ? 'listo' : 'sin_datos')
  }

  useEffect(() => { cargar() }, [desde, hasta, filtros.medicoId])

  const grafico = useMemo(() => {
    if (!datos) return []
    return datos.serie.map((t) => ({
      etiqueta: etiquetaTramo(t.inicio, datos.agrupacion),
      tramo: `${fechaES(t.inicio)}${t.fin !== t.inicio ? ` – ${fechaES(t.fin)}` : ''}`,
      activa: pctNum(t.dias_activa, t.dias_paciente),
      activa_o_si_precisa: pctNum(t.dias_activa + t.dias_si_precisa, t.dias_paciente),
      sin_registro: pctNum(t.dias_sin_dato, t.dias_paciente),
    }))
  }, [datos])

  // Lo que se lleva el botón «Exportar datos de esta vista».
  const aporte = useMemo<AporteExport | null>(() => {
    if (estado !== 'listo' || !datos) return null
    const { serie, medidas, duracion, sucesos, ingreso_vs_alta } = datos
    const diaDen = medidas.dias_paciente - medidas.dia_sin_dato
    const nocheDen = medidas.dias_paciente - medidas.noche_sin_dato
    const unidad = datos.agrupacion === 'day' ? 'día' : datos.agrupacion === 'week' ? 'semana' : 'mes'
    const franja = (tipo: string, f: 'dia' | 'noche', con: boolean) => sucesos.franjas.find((x) => x.tipo === tipo && x.franja === f && x.con_contencion === con)
    const filasSucesos: Celda[][] = []
    for (const tipo of Object.keys(SUCESO_LABEL)) {
      for (const [f, con, texto] of [
        ['dia', true, 'De día · con contención continua'], ['dia', false, 'De día · sin contención continua'],
        ['noche', true, 'De noche · con contención fija'], ['noche', false, 'De noche · sin contención fija'],
      ] as const) {
        const x = franja(tipo, f, con)
        filasSucesos.push([SUCESO_LABEL[tipo], texto, x?.sucesos ?? 0, x?.dias ?? 0, x ? tasa(x.sucesos, x.dias) : null])
      }
      const t = sucesos.tipos[tipo]
      filasSucesos.push([SUCESO_LABEL[tipo], 'Sin turno ni hora (no se pueden clasificar)', t?.sin_turno ?? 0, null, null])
      filasSucesos.push([SUCESO_LABEL[tipo], 'Sin pauta de contención registrada en ese momento', t?.sin_pauta ?? 0, null, null])
      if (tipo === 'caida') filasSucesos.push([SUCESO_LABEL[tipo], 'Registradas con «Con sujeción activa» en circunstancias', t?.con_sujecion_declarada ?? 0, null, null])
    }
    return {
      orden: 0,
      definiciones: ['con_evolucion', 'con_sin_registro', 'con_medidas', 'con_noche_resumen', 'con_vigentes', 'con_terminadas', 'con_sucesos', 'con_ingreso_alta'],
      base: [{ etiqueta: 'Días-paciente del periodo (pacientes ingresados × días)', valor: medidas.dias_paciente }],
      hojas: [
        {
          nombre: 'Evolución',
          columnas: ['Desde', 'Hasta', 'Días-paciente', 'Con contención activa', '% activa', 'Con «si precisa»', '% activa + «si precisa»', 'Sin registro', '% sin registro'],
          filas: serie.map((t) => [fechaES(t.inicio), fechaES(t.fin), t.dias_paciente, t.dias_activa, pctNum(t.dias_activa, t.dias_paciente),
            t.dias_si_precisa, pctNum(t.dias_activa + t.dias_si_precisa, t.dias_paciente), t.dias_sin_dato, pctNum(t.dias_sin_dato, t.dias_paciente)]),
          nota: `Agrupado por ${unidad}. Un día-paciente es un paciente ingresado esa noche, con la pauta que tenía al terminar el día. «Sin registro»: días anteriores al primer registro de pauta del episodio.`,
        },
        {
          nombre: 'Medidas de día',
          columnas: ['Medida', 'Días-paciente', '% de los días con pauta', 'Pacientes'],
          filas: [
            ...medidas.dia.map((m): Celda[] => [etiquetaDia(m.clave), m.dias, pctNum(m.dias, diaDen), m.pacientes]),
            ['Sin registro de pauta', medidas.dia_sin_dato, null, null],
          ],
        },
        {
          nombre: 'Medidas de noche',
          columnas: ['Medida', 'Tipo', 'Días-paciente', '% de las noches con pauta', 'Pacientes'],
          filas: [
            ...medidas.noche.map((m): Celda[] => [etiquetaNoche(m.clave), NOCHE_ES_CONTENCION.has(m.clave) ? 'Contención' : m.clave === 'ninguna' ? '' : 'Seguridad / alternativa', m.dias, pctNum(m.dias, nocheDen), m.pacientes]),
            ['Sin registro de pauta', '', medidas.noche_sin_dato, null, null],
            ['Noches con contención (fija o «si precisa»)', '', medidas.noche_resumen.con_contencion, pctNum(medidas.noche_resumen.con_contencion, nocheDen), null],
            ['Noches solo con alternativas (barras, cota cero o sensor)', '', medidas.noche_resumen.solo_alternativas, pctNum(medidas.noche_resumen.solo_alternativas, nocheDen), null],
            ['Noches sin nada pautado', '', medidas.noche_resumen.sin_nada, pctNum(medidas.noche_resumen.sin_nada, nocheDen), null],
          ],
          nota: 'De noche se pueden pautar varias medidas a la vez, así que los porcentajes de las medidas sueltas suman más de 100 %.',
        },
        {
          nombre: 'Contención vigente hoy',
          columnas: ['Paciente', 'Habitación', 'Desde', 'Días seguidos'],
          filas: duracion.vigentes.map((v): Celda[] => [v.paciente, v.habitacion, fechaES(v.desde), v.dias]),
          nota: `Pacientes ingresados hoy con contención activa. Situación de hoy: no depende del periodo. Aviso a partir de ${datos.umbral_dias} días.`,
        },
        {
          nombre: 'Duración retiradas',
          columnas: ['Indicador', 'Valor'],
          filas: [
            ['Contenciones retiradas en el periodo', duracion.terminadas.n],
            ['Duración mediana (días)', duracion.terminadas.mediana],
            ['Duración media (días)', duracion.terminadas.media],
            ['Duración máxima (días)', duracion.terminadas.maximo],
            [`Con más de ${datos.umbral_dias} días`, duracion.terminadas.mas_del_umbral],
          ],
          nota: 'Tramos seguidos de contención activa cuya retirada cae dentro del periodo. No incluye los que acabaron por el alta.',
        },
        {
          nombre: 'Caídas y agresiones',
          columnas: ['Suceso', 'Situación', 'Sucesos', 'Días-paciente', 'Por 1.000 días-paciente'],
          filas: filasSucesos,
          nota: 'Asociación, no causa: la contención se pauta a quien tiene más riesgo. De día cuenta la contención continua; de noche, la fija. Noche = 22-8 h.',
        },
        {
          nombre: 'Ingreso frente a alta',
          columnas: ['Al ingreso', ...CATEGORIAS.map((c) => `Al alta: ${c.etiqueta}`), 'Total'],
          filas: CATEGORIAS.map((ing): Celda[] => {
            const fila = CATEGORIAS.map((al) => ingreso_vs_alta.combinaciones.find((c) => c.al_ingreso === ing.clave && c.al_alta === al.clave)?.n ?? 0)
            return [ing.etiqueta, ...fila, fila.reduce((a, b) => a + b, 0)]
          }),
          nota: `Salidas del periodo (altas, traslados y éxitus): ${ingreso_vs_alta.altas}. «Al ingreso»: primera pauta, si se registró en los primeros ${datos.ventana_ingreso_dias} días.`,
        },
      ],
    }
  }, [estado, datos])
  useAporteExportacion('contenciones', aporte)

  if (estado === 'cargando') return <EstadoCargando />
  if (estado === 'error') return <EstadoError mensaje={error} onReintentar={cargar} />
  if (estado === 'sin_datos' || !datos) return <EstadoSinDatos mensaje="No hay pacientes ingresados en este periodo." />

  const { serie, medidas, duracion, sucesos, ingreso_vs_alta } = datos
  const totales = serie.reduce(
    (a, t) => ({ pd: a.pd + t.dias_paciente, act: a.act + t.dias_activa, sp: a.sp + t.dias_si_precisa, sd: a.sd + t.dias_sin_dato }),
    { pd: 0, act: 0, sp: 0, sd: 0 },
  )
  const diaDen = medidas.dias_paciente - medidas.dia_sin_dato
  const nocheDen = medidas.dias_paciente - medidas.noche_sin_dato
  const unidad = datos.agrupacion === 'day' ? 'día' : datos.agrupacion === 'week' ? 'semana' : 'mes'
  const muchoSinRegistro = totales.pd > 0 && totales.sd / totales.pd >= 0.2

  return (
    <div className="space-y-8" data-contenciones>
      <p className="text-xs text-slate-600 max-w-3xl">
        Todo se reconstruye con el historial de cambios de la pauta: cada pauta vale desde el día en que se registró hasta que se cambió.
        Los días anteriores al primer registro de un episodio quedan como «sin registro»: no se sabe qué había y no se cuentan como «sin contención».
      </p>

      {/* ── 1. Evolución ───────────────────────────────────── */}
      <section data-con-evolucion>
        <p className="section-title">Evolución</p>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <TarjetaMetrica info="con_evolucion" etiqueta="Con contención activa" valor={pct(totales.act, totales.pd)} subvalor="De los días-paciente del periodo" />
          <TarjetaMetrica info="con_evolucion" etiqueta="Con «si precisa» (sin activa)" valor={pct(totales.sp, totales.pd)} subvalor="De los días-paciente del periodo" />
          <TarjetaMetrica info="con_evolucion" etiqueta="Activa o «si precisa»" valor={pct(totales.act + totales.sp, totales.pd)} subvalor="De los días-paciente del periodo" />
          <TarjetaMetrica info="con_sin_registro" etiqueta="Sin registro de pauta" valor={pct(totales.sd, totales.pd)} subvalor="Días anteriores al primer registro" />
        </div>
        {muchoSinRegistro && (
          <p className="aviso aviso-info mt-3 text-xs">
            Una parte importante de los días no tiene pauta registrada: estas cifras infravaloran la contención real hasta que los episodios tengan su pauta desde el ingreso.
          </p>
        )}
        <div className="card p-4 mt-3">
          <ResponsiveContainer width="100%" height={260}>
            <LineChart data={grafico}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
              <XAxis dataKey="etiqueta" tick={{ fontSize: 12 }} />
              <YAxis tick={{ fontSize: 12 }} unit=" %" domain={[0, 100]} />
              <Tooltip formatter={(v) => (v == null ? '—' : `${num1(Number(v))} %`)} labelFormatter={(_, p) => p?.[0]?.payload?.tramo ?? ''} />
              <Legend wrapperStyle={{ fontSize: 12 }} />
              <Line type="linear" dataKey="activa" stroke="#dc2626" strokeWidth={2} dot={false} name="Contención activa" connectNulls />
              <Line type="linear" dataKey="activa_o_si_precisa" stroke="#f59e0b" strokeWidth={2} dot={false} name="Activa o «si precisa»" connectNulls />
              <Line type="linear" dataKey="sin_registro" stroke="#94a3b8" strokeWidth={1.5} strokeDasharray="4 4" dot={false} name="Sin registro" connectNulls />
            </LineChart>
          </ResponsiveContainer>
          <p className="text-xs text-slate-500 mt-1">
            % de los días-paciente de cada {unidad} (el primer y el último tramo pueden ser parciales).
          </p>
        </div>
      </section>

      {/* ── 2. Medidas ─────────────────────────────────────── */}
      <section data-con-medidas>
        <p className="section-title">Medidas de día y de noche <InfoIndicador clave="con_medidas" /></p>
        <div className="grid md:grid-cols-2 gap-4 items-start">
          <div className="card overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b bg-slate-50 text-left text-xs font-semibold text-slate-500">
                  <th className="px-4 py-2">De día</th>
                  <th className="px-4 py-2 text-right">Días-paciente</th>
                  <th className="px-4 py-2 text-right">% con pauta</th>
                  <th className="px-4 py-2 text-right">Pacientes</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {medidas.dia.map((m) => (
                  <tr key={m.clave}>
                    <td className="px-4 py-2 text-slate-700">{etiquetaDia(m.clave)}</td>
                    <td className="px-4 py-2 text-right tabular-nums">{m.dias}</td>
                    <td className="px-4 py-2 text-right tabular-nums text-slate-500 whitespace-nowrap">{pct(m.dias, diaDen)}</td>
                    <td className="px-4 py-2 text-right tabular-nums text-slate-500">{m.pacientes}</td>
                  </tr>
                ))}
                <tr className="bg-slate-50/60">
                  <td className="px-4 py-2 text-slate-500">Sin registro de pauta</td>
                  <td className="px-4 py-2 text-right tabular-nums text-slate-500">{medidas.dia_sin_dato}</td>
                  <td colSpan={2} />
                </tr>
              </tbody>
            </table>
          </div>

          <div className="card overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b bg-slate-50 text-left text-xs font-semibold text-slate-500">
                  <th className="px-4 py-2">De noche</th>
                  <th className="px-4 py-2 text-right">Días-paciente</th>
                  <th className="px-4 py-2 text-right">% con pauta</th>
                  <th className="px-4 py-2 text-right">Pacientes</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {medidas.noche.map((m) => (
                  <tr key={m.clave}>
                    <td className="px-4 py-2 text-slate-700">
                      {etiquetaNoche(m.clave)}
                      {NOCHE_ES_CONTENCION.has(m.clave) && <span className="ml-2 text-[11px] font-semibold text-red-700 bg-red-50 border border-red-100 rounded px-1.5 py-0.5">Contención</span>}
                      {m.clave !== 'ninguna' && !NOCHE_ES_CONTENCION.has(m.clave) && <span className="ml-2 text-[11px] font-semibold text-teal-700 bg-teal-50 border border-teal-100 rounded px-1.5 py-0.5">Alternativa</span>}
                    </td>
                    <td className="px-4 py-2 text-right tabular-nums">{m.dias}</td>
                    <td className="px-4 py-2 text-right tabular-nums text-slate-500 whitespace-nowrap">{pct(m.dias, nocheDen)}</td>
                    <td className="px-4 py-2 text-right tabular-nums text-slate-500">{m.pacientes}</td>
                  </tr>
                ))}
                <tr className="bg-slate-50/60">
                  <td className="px-4 py-2 text-slate-500">Sin registro de pauta</td>
                  <td className="px-4 py-2 text-right tabular-nums text-slate-500">{medidas.noche_sin_dato}</td>
                  <td colSpan={2} />
                </tr>
              </tbody>
            </table>
          </div>
        </div>

        {nocheDen > 0 && (
          <div className="card p-4 mt-3" data-con-noche-resumen>
            <p className="text-xs font-semibold text-slate-500 mb-2">Noches con pauta registrada <InfoIndicador clave="con_noche_resumen" /></p>
            <div className="flex h-3 rounded-full overflow-hidden bg-slate-100" role="img"
              aria-label={`Con contención ${pct(medidas.noche_resumen.con_contencion, nocheDen)}, solo alternativas ${pct(medidas.noche_resumen.solo_alternativas, nocheDen)}, sin nada ${pct(medidas.noche_resumen.sin_nada, nocheDen)}`}>
              <div className="bg-red-500" style={{ width: `${(medidas.noche_resumen.con_contencion / nocheDen) * 100}%` }} />
              <div className="bg-teal-500" style={{ width: `${(medidas.noche_resumen.solo_alternativas / nocheDen) * 100}%` }} />
              <div className="bg-slate-300" style={{ width: `${(medidas.noche_resumen.sin_nada / nocheDen) * 100}%` }} />
            </div>
            <p className="text-xs text-slate-600 mt-2 tabular-nums">
              <span className="font-semibold text-red-700">{pct(medidas.noche_resumen.con_contencion, nocheDen)}</span> con contención ·{' '}
              <span className="font-semibold text-teal-700">{pct(medidas.noche_resumen.solo_alternativas, nocheDen)}</span> solo con alternativas (barras, cota cero o sensor) ·{' '}
              <span className="font-semibold">{pct(medidas.noche_resumen.sin_nada, nocheDen)}</span> sin nada pautado
            </p>
          </div>
        )}
      </section>

      {/* ── 3. Duración ────────────────────────────────────── */}
      <section data-con-duracion>
        <p className="section-title">Duración de la contención activa</p>
        <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
          <TarjetaMetrica info="con_terminadas" etiqueta="Retiradas en el periodo" valor={duracion.terminadas.n} />
          <TarjetaMetrica info="con_terminadas" etiqueta="Duración mediana" valor={duracion.terminadas.mediana != null ? `${num1(duracion.terminadas.mediana)} días` : '—'} />
          <TarjetaMetrica info="con_terminadas" etiqueta="Duración media" valor={duracion.terminadas.media != null ? `${num1(duracion.terminadas.media)} días` : '—'} />
          <TarjetaMetrica info="con_terminadas" etiqueta="Duración máxima" valor={duracion.terminadas.maximo != null ? `${duracion.terminadas.maximo} días` : '—'} />
          <TarjetaMetrica info="con_terminadas" etiqueta={`Con más de ${datos.umbral_dias} días`} valor={duracion.terminadas.mas_del_umbral} />
        </div>

        <div className="flex items-center gap-2 mt-4 mb-2">
          <p className="text-sm font-semibold text-slate-700">Con contención activa ahora</p>
          <span className="text-xs font-semibold bg-white border text-slate-700 rounded-full px-2 py-0.5">Hoy</span>
          <InfoIndicador clave="con_vigentes" />
        </div>
        <div className="card overflow-x-auto" data-con-vigentes>
          {duracion.vigentes.length === 0 ? <EstadoSinDatos mensaje="Nadie tiene contención activa ahora." /> : (
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b bg-slate-50 text-left text-xs font-semibold text-slate-500">
                  <th className="px-4 py-2">Paciente</th>
                  <th className="px-4 py-2 text-right">Hab.</th>
                  <th className="px-4 py-2 text-right">Desde</th>
                  <th className="px-4 py-2 text-right">Días seguidos</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {duracion.vigentes.map((v) => {
                  const largo = v.dias > datos.umbral_dias
                  return (
                    <tr key={v.ingreso_id} className={largo ? 'bg-amber-50/60' : 'hover:bg-slate-50'}>
                      <td className="px-4 py-2 font-medium text-slate-700">
                        <Link to={`/ingresos/${v.ingreso_id}`} className={`hover:text-primary-700 hover:underline ${FOCO_CELDA}`}>{v.paciente}</Link>
                      </td>
                      <td className="px-4 py-2 text-right tabular-nums text-slate-500">{v.habitacion ?? '—'}</td>
                      <td className="px-4 py-2 text-right tabular-nums text-slate-500">{fechaES(v.desde)}</td>
                      <td className={`px-4 py-2 text-right tabular-nums ${largo ? 'font-semibold text-amber-700' : ''}`}>
                        {v.dias}{largo && <span className="ml-2 text-[11px] font-semibold text-amber-700">más de {datos.umbral_dias}</span>}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          )}
        </div>
      </section>

      {/* ── 5. Caídas y agresiones ─────────────────────────── */}
      <section data-con-sucesos>
        <p className="section-title">Caídas y agresiones según la contención <InfoIndicador clave="con_sucesos" /></p>
        <p className="aviso aviso-info text-xs mb-3 max-w-3xl">
          Esto muestra una asociación, no una causa. La contención se pauta a los pacientes con más riesgo, así que es normal que tengan más sucesos;
          no indica que la contención los provoque ni que los evite.
        </p>
        <div className="grid lg:grid-cols-2 gap-4">
          {Object.keys(SUCESO_LABEL).map((tipo) => {
            const t = sucesos.tipos[tipo] ?? { total: 0, sin_turno: 0, sin_pauta: 0, con_sujecion_declarada: 0 }
            const filas = [
              { f: 'dia' as const, con: true, texto: 'De día · con contención continua' },
              { f: 'dia' as const, con: false, texto: 'De día · sin contención continua' },
              { f: 'noche' as const, con: true, texto: 'De noche · con contención fija' },
              { f: 'noche' as const, con: false, texto: 'De noche · sin contención fija' },
            ].map((r) => ({ ...r, x: sucesos.franjas.find((x) => x.tipo === tipo && x.franja === r.f && x.con_contencion === r.con) }))
            const clasificados = filas.reduce((a, r) => a + (r.x?.sucesos ?? 0), 0)
            return (
              <div key={tipo} className="card overflow-x-auto" data-con-suceso={tipo}>
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b bg-slate-50 text-left text-xs font-semibold text-slate-500">
                      <th className="px-4 py-2">{SUCESO_LABEL[tipo]} · {t.total} en el periodo</th>
                      <th className="px-4 py-2 text-right">Sucesos</th>
                      <th className="px-4 py-2 text-right">Días-paciente</th>
                      <th className="px-4 py-2 text-right">Por 1.000</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y">
                    {filas.map((r) => (
                      <tr key={r.texto}>
                        <td className="px-4 py-2 text-slate-700">{r.texto}</td>
                        <td className="px-4 py-2 text-right tabular-nums">{r.x?.sucesos ?? 0}</td>
                        <td className="px-4 py-2 text-right tabular-nums text-slate-500">{r.x?.dias ?? 0}</td>
                        <td className="px-4 py-2 text-right tabular-nums text-slate-500">{r.x ? (tasa(r.x.sucesos, r.x.dias)?.toLocaleString('es-ES') ?? '—') : '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                <div className="text-xs text-slate-500 px-4 py-2 border-t space-y-0.5">
                  {clasificados < POCOS_SUCESOS && <p className="text-amber-700">Con menos de {POCOS_SUCESOS} sucesos clasificados, las tasas no son fiables.</p>}
                  {(t.sin_turno > 0 || t.sin_pauta > 0) && (
                    <p>
                      No se han podido clasificar: {t.sin_turno} sin turno ni hora y {t.sin_pauta} sin pauta de contención registrada en ese momento.
                    </p>
                  )}
                  {tipo === 'caida' && <p>{t.con_sujecion_declarada === 1 ? '1 caída se registró' : `${t.con_sujecion_declarada} caídas se registraron`} como «Con sujeción activa» (dato escrito al registrar la caída).</p>}
                </div>
              </div>
            )
          })}
        </div>
      </section>

      {/* ── 6. Ingreso frente a alta ───────────────────────── */}
      <section data-con-ingreso-alta>
        <p className="section-title">Contención al ingreso y al alta <InfoIndicador clave="con_ingreso_alta" /></p>
        {ingreso_vs_alta.altas === 0 ? <EstadoSinDatos mensaje="No hay salidas (altas, traslados o éxitus) en este periodo." /> : (() => {
          const n = (ing: Categoria, al: Categoria) => ingreso_vs_alta.combinaciones.find((c) => c.al_ingreso === ing && c.al_alta === al)?.n ?? 0
          const conIngreso = (['activa'] as Categoria[]).flatMap((i) => CATEGORIAS.map((a) => n(i, a.clave))).reduce((a, b) => a + b, 0)
          const activaYSeVanSin = n('activa', 'ninguna') + n('activa', 'si_precisa')
          const sinYSeVanCon = n('ninguna', 'activa') + n('si_precisa', 'activa')
          const mantienen = n('activa', 'activa')
          return (
            <>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                <TarjetaMetrica info="con_ingreso_alta" etiqueta="Salidas del periodo" valor={ingreso_vs_alta.altas} />
                <TarjetaMetrica info="con_ingreso_alta" etiqueta="Ingresan con activa y se van sin ella" valor={activaYSeVanSin} subvalor={conIngreso > 0 ? `De ${conIngreso} que ingresaron con contención activa` : undefined} />
                <TarjetaMetrica info="con_ingreso_alta" etiqueta="Ingresan y salen con activa" valor={mantienen} />
                <TarjetaMetrica info="con_ingreso_alta" etiqueta="Salen con activa sin haber ingresado con ella" valor={sinYSeVanCon} />
              </div>
              <div className="card overflow-x-auto mt-3">
                <table className="w-full text-sm min-w-[36rem]">
                  <thead>
                    <tr className="border-b bg-slate-50 text-left text-xs font-semibold text-slate-500">
                      <th className="px-4 py-2">Al ingreso ↓ · Al alta →</th>
                      {CATEGORIAS.map((c) => <th key={c.clave} className="px-4 py-2 text-right">{c.etiqueta}</th>)}
                    </tr>
                  </thead>
                  <tbody className="divide-y">
                    {CATEGORIAS.map((ing) => (
                      <tr key={ing.clave}>
                        <td className="px-4 py-2 font-medium text-slate-700">{ing.etiqueta}</td>
                        {CATEGORIAS.map((al) => {
                          const v = n(ing.clave, al.clave)
                          return <td key={al.clave} className={`px-4 py-2 text-right tabular-nums ${v === 0 ? 'text-slate-300' : 'text-slate-800 font-semibold'}`}>{v}</td>
                        })}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <p className="text-xs text-slate-500 mt-2">
                «Sin dato»: no había pauta registrada en ese momento. Al ingreso cuenta la primera pauta si se registró en los primeros {datos.ventana_ingreso_dias} días.
              </p>
            </>
          )
        })()}
      </section>
    </div>
  )
}
