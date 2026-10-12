import { useEffect, useMemo, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '../../lib/supabase'
import type { Filtros, EstadoCarga } from './tipos'
import { TarjetaMetrica, EstadoCargando, EstadoError, EstadoSinDatos } from './ComponentesDashboard'
import InfoIndicador from './InfoIndicador'
import { atajoDeRaton, FOCO_CELDA } from '../../lib/accesibilidad'
import { porcentajeNum, useAporteExportacion, type AporteExport, type Celda } from './exportar'

const TIPO_LABEL: Record<string, string> = {
  caida: 'Caída', ulcera: 'Úlcera por presión', error_medicacion: 'Error de medicación',
  efecto_adverso_medicacion: 'Efecto adverso', infeccion_nosocomial: 'Infección nosocomial',
  agresividad_fisica: 'Agresividad física', fuga: 'Fuga', atragantamiento: 'Atragantamiento',
}

// Cuántos pacientes con caídas repetidas se listan; el resto se resume en una línea.
const MAX_REPETIDAS = 10

// Los campos marcados como opcionales no existen hasta que se ejecuta el SQL correspondiente (migración 20261018 y
// anteriores): la pantalla no se rompe sin ellos, enseña «—».
interface Seguridad {
  por_tipo: { tipo: string; total: number; pacientes_afectados: number; pendientes: number; tasa_1000: number | null }[]
  caidas: {
    total: number; con_lesion: number; pendientes_valoracion: number; graves: number
    tasa_total_1000: number | null; tasa_con_lesion_1000: number | null
    pacientes_con_caidas_repetidas?: number
    repetidas?: { ingreso_id: string; paciente: string; caidas: number }[]
  }
  ulceras: {
    presentes_al_ingreso: number; aparecidas_durante: number; grado_iii_iv: number; tasa_aparecidas_1000: number | null
    sin_origen?: number; pacientes_afectados?: number; sin_grado?: number; grado_no_clasificable?: number
  }
  otras: {
    errores_medicacion: number; efectos_adversos: number; infecciones_nosocomiales: number; agresiones: number; fugas: number
    pendientes_completar: number
    atragantamientos?: number; derivaciones_urgencias?: number; ingresos_hospitalarios?: number
  }
  contenciones: {
    pacientes_con_contencion_activa: number; pacientes_con_si_precisa: number; pendientes_confirmacion: number
    pacientes_ingresados?: number
  }
  dias_estancia?: number
}

function porcentaje(n: number, total: number | undefined): string | undefined {
  if (!total) return undefined
  return `${((n / total) * 100).toLocaleString('es-ES', { maximumFractionDigits: 1 })} % de los ingresados`
}

// Un hueco de la franja «Pendiente de revisar»: cada pendiente conserva su nombre, no se suman entre sí.
function Pendiente({ etiqueta, valor, nota, onClick }: { etiqueta: string; valor: number | string; nota?: string; onClick?: () => void }) {
  const Contenedor = onClick ? 'button' : 'div'
  const hayPendiente = typeof valor === 'number' && valor > 0
  return (
    <Contenedor
      type={onClick ? 'button' : undefined}
      onClick={onClick}
      className={`px-4 py-3 text-left flex flex-col items-start justify-start ${onClick ? 'hover:bg-primary-50/30 transition-colors cursor-pointer' : ''}`}
    >
      <p className="text-xs text-slate-500 font-medium">{etiqueta}</p>
      <p className={`text-xl font-bold mt-0.5 tabular-nums ${hayPendiente ? 'text-amber-700' : 'text-slate-800'}`}>{valor}</p>
      {nota && <p className="text-xs text-slate-500 mt-0.5">{nota}</p>}
    </Contenedor>
  )
}

export function SeguridadDashboard({ filtros, desde, hasta, onExplorar, onExplorarEpisodios }: {
  filtros: Filtros
  desde: string
  hasta: string
  onExplorar: (filtroExtra?: Record<string, string>) => void
  onExplorarEpisodios: (filtroExtra?: Record<string, string>) => void
}) {
  const [datos, setDatos] = useState<Seguridad | null>(null)
  const [estado, setEstado] = useState<EstadoCarga>('cargando')
  const [error, setError] = useState('')
  const secuenciaRef = useRef(0)

  async function cargar() {
    const miSecuencia = ++secuenciaRef.current
    setEstado('cargando')
    setError('')
    const { data, error: err } = await supabase.rpc('dashboard_seguridad', {
      p_desde: desde, p_hasta: hasta, p_medico_id: filtros.medicoId,
    })
    if (miSecuencia !== secuenciaRef.current) return
    if (err) { setError(err.message); setEstado('error'); return }
    setDatos(data)
    setEstado('listo')
  }

  useEffect(() => { cargar() }, [desde, hasta, filtros.medicoId])

  // Lo que se lleva el botón «Exportar datos de esta vista». Sin nombres de pacientes (de las caídas repetidas, solo el recuento).
  const aporte = useMemo<AporteExport | null>(() => {
    if (estado !== 'listo' || !datos) return null
    const { caidas, ulceras, otras, contenciones, por_tipo } = datos
    const v = (x: number | null | undefined): Celda => x ?? null
    const ing = contenciones.pacientes_ingresados
    return {
      orden: 0,
      definiciones: ['seg_incidencias', 'seg_pendientes', 'seg_tasa', 'caidas_con_lesion', 'caidas_graves', 'caidas_pendientes', 'caidas_repetidas', 'upp_producidas', 'upp_grado', 'upp_sin_grado', 'derivaciones', 'infeccion_nosocomial', 'contencion_activa', 'contencion_si_precisa'],
      base: datos.dias_estancia != null ? [{ etiqueta: 'Días-estancia del periodo (denominador de las tasas)', valor: datos.dias_estancia }] : [],
      hojas: [
        {
          nombre: 'Pendiente de revisar',
          columnas: ['Indicador', 'Valor', 'Referencia'],
          filas: [
            ['Incidencias sin completar', otras.pendientes_completar, 'Todos los tipos, en el periodo'],
            ['Caídas pendientes de valoración', caidas.pendientes_valoracion, 'En el periodo'],
            ['Úlceras sin origen indicado', v(ulceras.sin_origen), 'En el periodo'],
            ['Úlceras sin grado valorado', v(ulceras.sin_grado), 'En el periodo'],
            ['Pautas de contención sin confirmar', contenciones.pendientes_confirmacion, 'Hoy'],
          ],
        },
        {
          nombre: 'Incidencias por tipo',
          columnas: ['Tipo', 'Incidencias', 'Pacientes afectados', 'Pendientes', 'Tasa por 1.000 días-estancia'],
          filas: por_tipo.map((t) => [TIPO_LABEL[t.tipo] ?? t.tipo, t.total, t.pacientes_afectados, t.pendientes, t.tasa_1000]),
          nota: 'Por la fecha en que ocurrió la incidencia. Las úlceras por presión y las infecciones nosocomiales no son incidencias.',
        },
        {
          nombre: 'Caídas',
          columnas: ['Indicador', 'Valor'],
          filas: [
            ['Caídas (total)', caidas.total],
            ['Con lesión', caidas.con_lesion],
            ['Graves (gravedad grave, fractura o TCE)', caidas.graves],
            ['Pendientes de valoración', caidas.pendientes_valoracion],
            ['Pacientes con 2 o más caídas', v(caidas.pacientes_con_caidas_repetidas)],
            ['Tasa total por 1.000 días-estancia', caidas.tasa_total_1000],
            ['Tasa con lesión por 1.000 días-estancia', caidas.tasa_con_lesion_1000],
          ],
        },
        {
          nombre: 'Úlceras por presión',
          columnas: ['Indicador', 'Valor'],
          filas: [
            ['Producidas en el centro', ulceras.aparecidas_durante],
            ['Presentes al ingreso', ulceras.presentes_al_ingreso],
            ['Pacientes afectados', v(ulceras.pacientes_afectados)],
            ['Sin origen indicado', v(ulceras.sin_origen)],
            ['Grados III-IV (grado máximo registrado)', ulceras.grado_iii_iv],
            ['Sin grado valorado', v(ulceras.sin_grado)],
            ['No clasificables', v(ulceras.grado_no_clasificable)],
            ['Tasa de aparición por 1.000 días-estancia (solo las producidas en el centro)', ulceras.tasa_aparecidas_1000],
          ],
          nota: 'Se registran en Curas, no como incidencia. El periodo se cuenta por la fecha de inicio o detección.',
        },
        {
          nombre: 'Consecuencias e infecciones',
          columnas: ['Indicador', 'Valor'],
          filas: [
            ['Derivaciones a urgencias, sin ingreso', v(otras.derivaciones_urgencias)],
            ['Ingresos hospitalarios', v(otras.ingresos_hospitalarios)],
            ['Episodios con infección nosocomial', otras.infecciones_nosocomiales],
          ],
          nota: 'Derivaciones e ingresos: de caídas, agresiones, efectos adversos y atragantamientos. Infecciones: episodios del periodo con la casilla del CMBD marcada, no infecciones nuevas fechadas en el periodo.',
        },
        {
          nombre: 'Contenciones (hoy)',
          columnas: ['Indicador', 'Pacientes', '% de los ingresados'],
          filas: [
            ['Con pauta de contención activa', contenciones.pacientes_con_contencion_activa, ing ? porcentajeNum(contenciones.pacientes_con_contencion_activa, ing) : null],
            ['Con pauta «si precisa»', contenciones.pacientes_con_si_precisa, ing ? porcentajeNum(contenciones.pacientes_con_si_precisa, ing) : null],
            ['Pacientes ingresados hoy', v(ing), null],
          ],
          nota: 'Situación de hoy: no depende de las fechas del filtro. Mide la pauta registrada, no cuántas veces se ha aplicado.',
        },
      ],
    }
  }, [estado, datos])
  useAporteExportacion('seguridad', aporte)

  function irATipo(tipo: string) {
    onExplorar({ desde, hasta, tipo_incidencia: tipo })
  }

  // Las úlceras por presión viven en Curas, no en Incidencias: el listado que las explica es el de episodios con
  // alguna úlcera. Ese listado no filtra por la fecha de la úlcera ni por su categoría, así que solo hay UN enlace
  // (con el aviso escrito) y no uno por tarjeta, para que ninguna cifra abra un listado que no cuadra con ella.
  function irAEpisodiosConUPP() {
    onExplorarEpisodios({ solapa_desde: desde, solapa_hasta: hasta, con_incidencias: 'si', tipo_incidencia: 'ulcera' })
  }

  return (
    <div className="space-y-6">
      {estado === 'cargando' && <EstadoCargando />}
      {estado === 'error' && <EstadoError mensaje={error} onReintentar={cargar} />}

      {estado === 'listo' && datos && (() => {
        const { caidas, ulceras, otras, contenciones } = datos
        const repetidas = caidas.repetidas ?? []
        const ingresados = contenciones.pacientes_ingresados
        return (
          <>
            {/* ── Pendiente de revisar ────────────────────────── */}
            <section>
              <p className="section-title">Pendiente de revisar</p>
              <div className="card overflow-hidden grid grid-cols-2 md:grid-cols-5 divide-y md:divide-y-0 md:divide-x" data-pendientes>
                <Pendiente etiqueta="Incidencias sin completar" valor={otras.pendientes_completar} nota="Todos los tipos, en el periodo"
                  onClick={() => onExplorar({ desde, hasta, incidencias: 'pendiente' })} />
                <Pendiente etiqueta="Caídas pendientes de valoración" valor={caidas.pendientes_valoracion} nota="En el periodo" />
                <Pendiente etiqueta="Úlceras sin origen indicado" valor={ulceras.sin_origen ?? '—'} nota="Se completa en Curas" />
                <Pendiente etiqueta="Úlceras sin grado valorado" valor={ulceras.sin_grado ?? '—'} nota="Se completa en Curas" />
                <Pendiente etiqueta="Pautas de contención sin confirmar" valor={contenciones.pendientes_confirmacion} nota="Hoy" />
              </div>
            </section>

            {/* ── Tabla por tipo ──────────────────────────────── */}
            <section>
              <p className="section-title">Incidencias por tipo</p>
              <div className="card overflow-hidden">
                {datos.por_tipo.length === 0 ? <EstadoSinDatos mensaje="Sin incidencias en este periodo." /> : (
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b bg-slate-50 text-left text-xs font-semibold text-slate-500">
                        <th className="px-4 py-2">Tipo</th>
                        <th className="px-4 py-2 text-right">Incidencias <InfoIndicador clave="seg_incidencias" /></th>
                        <th className="px-4 py-2 text-right">Pacientes afectados</th>
                        <th className="px-4 py-2 text-right">Pendientes <InfoIndicador clave="seg_pendientes" /></th>
                        <th className="px-4 py-2 text-right">Tasa / 1.000 días-estancia <InfoIndicador clave="seg_tasa" /></th>
                      </tr>
                    </thead>
                    <tbody className="divide-y">
                      {datos.por_tipo.map((t) => (
                        <tr key={t.tipo} className="hover:bg-slate-50 cursor-pointer" onClick={atajoDeRaton(() => irATipo(t.tipo))}>
                          <td className="px-4 py-2 font-medium text-slate-700">
                            <button type="button" onClick={() => irATipo(t.tipo)} className={`text-left hover:text-primary-700 hover:underline ${FOCO_CELDA}`}>{TIPO_LABEL[t.tipo] ?? t.tipo}</button>
                          </td>
                          <td className="px-4 py-2 text-right tabular-nums">{t.total}</td>
                          <td className="px-4 py-2 text-right tabular-nums">{t.pacientes_afectados}</td>
                          <td className="px-4 py-2 text-right tabular-nums">{t.pendientes}</td>
                          <td className="px-4 py-2 text-right tabular-nums text-slate-500">{t.tasa_1000 ?? '—'}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </div>
            </section>

            {/* ── Caídas ──────────────────────────────────────── */}
            <section>
              <p className="section-title">Caídas</p>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                <TarjetaMetrica info="caidas_con_lesion" etiqueta="Con lesión" valor={caidas.con_lesion}
                  subvalor={caidas.tasa_con_lesion_1000 != null ? `${caidas.tasa_con_lesion_1000} / 1.000 días-estancia` : undefined} />
                <TarjetaMetrica info="caidas_graves" etiqueta="Graves" valor={caidas.graves} />
                <TarjetaMetrica info="caidas_pendientes" etiqueta="Pendientes de valoración" valor={caidas.pendientes_valoracion} />
                <TarjetaMetrica info="caidas_repetidas" etiqueta="Pacientes con 2 o más caídas" valor={caidas.pacientes_con_caidas_repetidas ?? '—'} subvalor="En el periodo" />
              </div>
              {repetidas.length > 0 && (
                <div className="card overflow-hidden mt-3" data-caidas-repetidas>
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b bg-slate-50 text-left text-xs font-semibold text-slate-500">
                        <th className="px-4 py-2">Paciente</th>
                        <th className="px-4 py-2 text-right">Caídas en el periodo</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y">
                      {repetidas.slice(0, MAX_REPETIDAS).map((r) => (
                        <tr key={r.ingreso_id} className="hover:bg-slate-50">
                          <td className="px-4 py-2 font-medium text-slate-700">
                            <Link to={`/ingresos/${r.ingreso_id}`} className={`hover:text-primary-700 hover:underline ${FOCO_CELDA}`}>{r.paciente}</Link>
                          </td>
                          <td className="px-4 py-2 text-right tabular-nums">{r.caidas}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  {repetidas.length > MAX_REPETIDAS && (
                    <p className="text-xs text-slate-500 px-4 py-2 border-t">
                      Y {repetidas.length - MAX_REPETIDAS} pacientes más con 2 o más caídas. Se ordenan de más a menos caídas.
                    </p>
                  )}
                </div>
              )}
            </section>

            {/* ── Úlceras ─────────────────────────────────────── */}
            <section>
              <p className="section-title">Úlceras por presión</p>
              <p className="text-xs text-slate-500 -mt-3 mb-2">
                Se registran en Plan de cuidados → Pauta de curas.
              </p>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3" data-ulceras>
                <TarjetaMetrica info="upp_producidas" etiqueta="Producidas en el centro" valor={ulceras.aparecidas_durante}
                  subvalor={ulceras.tasa_aparecidas_1000 != null ? `${ulceras.tasa_aparecidas_1000} / 1.000 días-estancia` : 'Origen: dentro del centro'} />
                <TarjetaMetrica etiqueta="Presentes al ingreso" valor={ulceras.presentes_al_ingreso} subvalor="Origen: fuera del centro" />
                <TarjetaMetrica etiqueta="Pacientes afectados" valor={ulceras.pacientes_afectados ?? '—'} />
                <TarjetaMetrica etiqueta="Sin origen indicado" valor={ulceras.sin_origen ?? '—'} subvalor="Pendientes de completar en Curas" />
                <TarjetaMetrica info="upp_grado" etiqueta="Grados III-IV" valor={ulceras.grado_iii_iv} />
                <TarjetaMetrica info="upp_sin_grado" etiqueta="Sin grado valorado" valor={ulceras.sin_grado ?? '—'} />
                <TarjetaMetrica etiqueta="No clasificables" valor={ulceras.grado_no_clasificable ?? '—'} subvalor="Ya valoradas como «no clasificable»; no son trabajo pendiente" />
              </div>
              <button type="button" onClick={irAEpisodiosConUPP}
                className="text-xs text-primary-700 underline hover:text-primary-800 mt-2 text-left" data-ver-episodios-upp>
                Ver los episodios del periodo con alguna úlcera por presión
              </button>
              <p className="text-xs text-slate-500">
                Ese listado incluye episodios con úlceras que empezaron en otra fecha, así que puede mostrar más casos que las cifras de arriba.
              </p>
            </section>

            {/* ── Consecuencias ───────────────────────────────── */}
            <section>
              <p className="section-title">Consecuencias de las incidencias</p>
              <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                <TarjetaMetrica info="derivaciones" etiqueta="Derivaciones a urgencias" valor={otras.derivaciones_urgencias ?? '—'} />
                <TarjetaMetrica info="derivaciones" etiqueta="Ingresos hospitalarios" valor={otras.ingresos_hospitalarios ?? '—'} />
              </div>
            </section>

            {/* ── Infecciones ─────────────────────────────────── */}
            <section>
              <p className="section-title">Infecciones nosocomiales</p>
              <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                <TarjetaMetrica info="infeccion_nosocomial" etiqueta="Episodios con infección nosocomial" valor={otras.infecciones_nosocomiales}
                  onClick={() => irATipo('infeccion_nosocomial')} />
              </div>
            </section>

            {/* ── Contenciones: situación de hoy ─────────────── */}
            <section className="border-t pt-6" data-contenciones-hoy>
              <div className="flex items-center gap-2 mb-3">
                <p className="section-title !mb-0">Contenciones</p>
                <span className="text-xs font-semibold bg-white border text-slate-700 rounded-full px-2 py-0.5">Hoy</span>
              </div>
              <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                <TarjetaMetrica info="contencion_activa" etiqueta="Con pauta de contención activa"
                  valor={ingresados ? `${contenciones.pacientes_con_contencion_activa} de ${ingresados}` : contenciones.pacientes_con_contencion_activa}
                  subvalor={porcentaje(contenciones.pacientes_con_contencion_activa, ingresados)} />
                <TarjetaMetrica info="contencion_si_precisa" etiqueta="Con pauta «si precisa»"
                  valor={ingresados ? `${contenciones.pacientes_con_si_precisa} de ${ingresados}` : contenciones.pacientes_con_si_precisa}
                  subvalor={porcentaje(contenciones.pacientes_con_si_precisa, ingresados)} />
              </div>
            </section>
          </>
        )
      })()}
    </div>
  )
}
