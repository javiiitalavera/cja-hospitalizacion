import { useEffect, useRef, useState } from 'react'
import { supabase } from '../../lib/supabase'
import type { Filtros, EstadoCarga } from './tipos'
import { TarjetaMetrica, EstadoCargando, EstadoError, EstadoSinDatos } from './ComponentesDashboard'

const TIPO_LABEL: Record<string, string> = {
  caida: 'Caída', ulcera: 'Úlcera por presión', error_medicacion: 'Error de medicación',
  efecto_adverso_medicacion: 'Efecto adverso', infeccion_nosocomial: 'Infección nosocomial',
  agresividad_fisica: 'Agresividad física', fuga: 'Fuga',
}

interface Seguridad {
  por_tipo: { tipo: string; total: number; pacientes_afectados: number; pendientes: number; tasa_1000: number | null }[]
  caidas: { total: number; con_lesion: number; pendientes_valoracion: number; graves: number; tasa_total_1000: number | null; tasa_con_lesion_1000: number | null }
  ulceras: { presentes_al_ingreso: number; aparecidas_durante: number; grado_iii_iv: number; tasa_aparecidas_1000: number | null }
  otras: { errores_medicacion: number; efectos_adversos: number; infecciones_nosocomiales: number; agresiones: number; fugas: number; pendientes_completar: number }
  contenciones: { pacientes_con_contencion_activa: number; pendientes_confirmacion: number; cambios_pauta_periodo: number }
}

export function SeguridadDashboard({ filtros, desde, hasta, onExplorar }: {
  filtros: Filtros
  desde: string
  hasta: string
  onExplorar: (filtroExtra?: Record<string, string>) => void
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
      p_desde: desde, p_hasta: hasta, p_medico_id: filtros.medicoId, p_estado_filtro: null,
    })
    if (miSecuencia !== secuenciaRef.current) return
    if (err) { setError(err.message); setEstado('error'); return }
    setDatos(data)
    setEstado('listo')
  }

  useEffect(() => { cargar() }, [desde, hasta, filtros.medicoId])

  function irATipo(tipo: string) {
    onExplorar({ desde, hasta, tipo_incidencia: tipo })
  }

  return (
    <div className="space-y-6">
      {estado === 'cargando' && <EstadoCargando />}
      {estado === 'error' && <EstadoError mensaje={error} onReintentar={cargar} />}

      {estado === 'listo' && datos && (
        <>
          {/* ── Tabla por tipo ──────────────────────────────── */}
          <section>
            <p className="section-title">Incidencias por tipo</p>
            <div className="card overflow-hidden">
              {datos.por_tipo.length === 0 ? <EstadoSinDatos mensaje="Sin incidencias en este periodo." /> : (
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b bg-slate-50 text-left text-xs font-semibold text-slate-500 uppercase tracking-wide">
                      <th className="px-4 py-2">Tipo</th>
                      <th className="px-4 py-2 text-right">Incidencias</th>
                      <th className="px-4 py-2 text-right">Pacientes afectados</th>
                      <th className="px-4 py-2 text-right">Pendientes</th>
                      <th className="px-4 py-2 text-right">Tasa / 1.000 días-estancia</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y">
                    {datos.por_tipo.map((t) => (
                      <tr key={t.tipo} className="hover:bg-slate-50 cursor-pointer" onClick={() => irATipo(t.tipo)}>
                        <td className="px-4 py-2 font-medium text-slate-700">{TIPO_LABEL[t.tipo] ?? t.tipo}</td>
                        <td className="px-4 py-2 text-right tabular-nums">{t.total}</td>
                        <td className="px-4 py-2 text-right tabular-nums">{t.pacientes_afectados}</td>
                        <td className="px-4 py-2 text-right tabular-nums">{t.pendientes || <span className="text-slate-300">—</span>}</td>
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
            <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
              <TarjetaMetrica etiqueta="Total" valor={datos.caidas.total} onClick={() => irATipo('caida')} />
              <TarjetaMetrica etiqueta="Con lesión" valor={datos.caidas.con_lesion} subvalor={datos.caidas.tasa_con_lesion_1000 != null ? `${datos.caidas.tasa_con_lesion_1000} / 1.000 días` : undefined} />
              <TarjetaMetrica etiqueta="Pendientes de valoración" valor={datos.caidas.pendientes_valoracion} />
              <TarjetaMetrica etiqueta="Graves" valor={datos.caidas.graves} subvalor="Gravedad grave, fractura o TCE" />
              <TarjetaMetrica etiqueta="Tasa total" valor={datos.caidas.tasa_total_1000 ?? '—'} subvalor="por 1.000 días-estancia" />
            </div>
          </section>

          {/* ── Úlceras ─────────────────────────────────────── */}
          <section>
            <p className="section-title">Úlceras por presión</p>
            <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
              <TarjetaMetrica etiqueta="Presentes al ingreso" valor={datos.ulceras.presentes_al_ingreso} />
              <TarjetaMetrica etiqueta="Aparecidas durante el ingreso" valor={datos.ulceras.aparecidas_durante} onClick={() => irATipo('ulcera')} />
              <TarjetaMetrica etiqueta="Grados III-IV" valor={datos.ulceras.grado_iii_iv} />
              <TarjetaMetrica etiqueta="Tasa de aparición" valor={datos.ulceras.tasa_aparecidas_1000 ?? '—'} subvalor="por 1.000 días-estancia, solo las aparecidas durante" />
            </div>
          </section>

          {/* ── Otras incidencias ───────────────────────────── */}
          <section>
            <p className="section-title">Otras incidencias</p>
            <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
              <TarjetaMetrica etiqueta="Errores de medicación" valor={datos.otras.errores_medicacion} onClick={() => irATipo('error_medicacion')} />
              <TarjetaMetrica etiqueta="Efectos adversos" valor={datos.otras.efectos_adversos} onClick={() => irATipo('efecto_adverso_medicacion')} />
              <TarjetaMetrica etiqueta="Infecciones nosocomiales" valor={datos.otras.infecciones_nosocomiales} onClick={() => irATipo('infeccion_nosocomial')} />
              <TarjetaMetrica etiqueta="Agresiones" valor={datos.otras.agresiones} onClick={() => irATipo('agresividad_fisica')} />
              <TarjetaMetrica etiqueta="Fugas" valor={datos.otras.fugas} onClick={() => irATipo('fuga')} />
              <TarjetaMetrica etiqueta="Pendientes de completar" valor={datos.otras.pendientes_completar} onClick={() => onExplorar({ desde, hasta, incidencias: 'pendiente' })} />
            </div>
          </section>

          {/* ── Contenciones ────────────────────────────────── */}
          <section>
            <p className="section-title">Contenciones</p>
            <div className="grid grid-cols-3 gap-3">
              <TarjetaMetrica etiqueta="Pacientes con contención activa" valor={datos.contenciones.pacientes_con_contencion_activa} />
              <TarjetaMetrica etiqueta="Pendientes de confirmación" valor={datos.contenciones.pendientes_confirmacion} />
              <TarjetaMetrica etiqueta="Cambios de pauta en el periodo" valor={datos.contenciones.cambios_pauta_periodo} />
            </div>
          </section>
        </>
      )}
    </div>
  )
}
