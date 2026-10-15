import { Fragment, useMemo, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { ChevronDown, ChevronRight } from 'lucide-react'
import { atajoDeRaton, FOCO_CELDA } from '../../lib/accesibilidad'
import { nombreCompleto } from '../../types'
import {
  TIPO_EVENTO_LABEL, TIPO_EVENTO_COLOR, TURNO_LABEL, CAMPOS_POR_TIPO, DIAS_PENDIENTE_AVISO, diasPendiente, type TipoEvento,
} from '../../types/eventos'
import { AntiguedadPendiente } from '../../components/AntiguedadPendiente'
import { TIPOS_ORDEN, rutaIncidencia, DIAS_VENTANA_ACTUALES } from './util'

export interface EventoActual {
  id: string
  tipo: TipoEvento
  fecha: string
  hora?: string
  turno?: string
  datos: Record<string, string>
  notas?: string
  estado?: 'pendiente' | 'completa'
  created_at?: string
  habitacion_evento?: number | null   // habitación del paciente cuando ocurrió (la fija la base de datos; un traslado posterior no la cambia)
  registrado_por?: { nombre: string; apellidos: string }
  ingreso: {
    id: string
    habitacion?: number
    estado: string
    paciente: { nombre: string; primer_apellido: string; segundo_apellido?: string }
  }
}

// «Actuales»: lo pendiente de completar y lo ocurrido en los últimos 30 días. Para lo anterior, el Histórico.
export function Actuales({ eventos, desde, cargando, error, onReintentar, onIrAHistorico }: {
  eventos: EventoActual[]            // los de los últimos 30 días (de cualquier ingreso) y los pendientes (de cualquier fecha)
  desde: string                      // primer día de la ventana (AAAA-MM-DD)
  cargando: boolean
  error: string
  onReintentar: () => void
  onIrAHistorico: () => void
}) {
  const navigate = useNavigate()
  const [filtroTipo, setFiltroTipo] = useState<TipoEvento | ''>('')
  const [abierta, setAbierta] = useState<string | null>(null)

  // Pendientes de los ingresos activos, las que más tiempo llevan abiertas primero.
  const pendientes = useMemo(
    () => eventos.filter((e) => e.estado === 'pendiente' && e.ingreso.estado === 'activo').sort((a, b) => diasPendiente(b) - diasPendiente(a)),
    [eventos],
  )
  const recientes = useMemo(
    () => eventos.filter((e) => e.fecha >= desde).sort((a, b) => (b.fecha.localeCompare(a.fecha)) || ((b.created_at ?? '').localeCompare(a.created_at ?? ''))),
    [eventos, desde],
  )
  const contador = useMemo(() => {
    const c: Partial<Record<TipoEvento, number>> = {}
    recientes.forEach((e) => { c[e.tipo] = (c[e.tipo] ?? 0) + 1 })
    return c
  }, [recientes])
  const visibles = filtroTipo ? recientes.filter((e) => e.tipo === filtroTipo) : recientes
  const atrasadas = pendientes.filter((e) => diasPendiente(e) > DIAS_PENDIENTE_AVISO).length

  if (cargando) return <div className="card px-4 py-10 text-center text-slate-500 text-sm">Cargando…</div>
  if (error) {
    return (
      <div className="card px-4 py-10 text-center">
        <p className="text-red-600 text-sm mb-2">{error}</p>
        <button onClick={onReintentar} className="btn-secondary btn-sm">Reintentar</button>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {pendientes.length > 0 && (
        <section>
          <div className="bg-amber-50 border border-amber-200 rounded-xl p-4">
            <p className="text-xs font-semibold text-amber-700 mb-3">
              {pendientes.length} {pendientes.length === 1 ? 'incidencia pendiente' : 'incidencias pendientes'} de completar
              {atrasadas > 0 && (
                <span className="text-red-700"> · {atrasadas} {atrasadas === 1 ? 'lleva' : 'llevan'} más de {DIAS_PENDIENTE_AVISO} días</span>
              )}
            </p>
            <div className="space-y-1.5">
              {pendientes.map((ev) => (
                <button
                  key={ev.id}
                  onClick={() => navigate(rutaIncidencia(ev.ingreso.id, ev.id))}
                  className="w-full flex items-center justify-between gap-3 bg-white rounded-lg px-3 py-2 text-left hover:bg-amber-100/50 transition-colors border border-amber-100"
                >
                  <span className="flex items-center gap-2 text-sm flex-wrap">
                    <span className={`px-2 py-0.5 rounded-full text-xs font-medium border ${TIPO_EVENTO_COLOR[ev.tipo]}`}>
                      {TIPO_EVENTO_LABEL[ev.tipo]}
                    </span>
                    <span className="font-medium text-slate-700">{nombreCompleto(ev.ingreso.paciente)}</span>
                    <span className="text-slate-500">Hab. {ev.ingreso.habitacion ?? '—'}</span>
                  </span>
                  <span className="flex items-center gap-2">
                    <span className="text-xs text-slate-500">{new Date(ev.fecha).toLocaleDateString('es-ES')}</span>
                    <AntiguedadPendiente ev={ev} />
                  </span>
                </button>
              ))}
            </div>
          </div>
        </section>
      )}

      <section>
        <div className="flex items-end justify-between gap-3 flex-wrap mb-3">
          <p className="section-title !mb-0">Últimos {DIAS_VENTANA_ACTUALES} días · {recientes.length} {recientes.length === 1 ? 'incidencia' : 'incidencias'}</p>
          <button type="button" onClick={onIrAHistorico} className="text-xs font-medium text-primary-700 hover:underline">
            Ver anteriores en Histórico
          </button>
        </div>

        {recientes.length > 0 && (
          <div className="flex gap-1.5 flex-wrap mb-3" role="group" aria-label="Filtrar por tipo">
            <ChipTipo activo={filtroTipo === ''} onClick={() => setFiltroTipo('')} texto="Todas" n={recientes.length} />
            {TIPOS_ORDEN.filter((t) => (contador[t] ?? 0) > 0).map((t) => (
              <ChipTipo key={t} activo={filtroTipo === t} onClick={() => setFiltroTipo(filtroTipo === t ? '' : t)} texto={TIPO_EVENTO_LABEL[t]} n={contador[t] ?? 0} />
            ))}
          </div>
        )}

        <div className="card overflow-hidden">
          {visibles.length === 0 ? (
            <p className="px-4 py-10 text-center text-slate-500 text-sm">No hay incidencias en los últimos {DIAS_VENTANA_ACTUALES} días.</p>
          ) : (
            <table className="w-full text-sm min-w-[640px]">
              <thead>
                <tr className="border-b bg-slate-50 text-left text-xs font-semibold text-slate-500">
                  <th className="px-4 py-2.5 w-8"></th>
                  <th className="px-4 py-2.5">Fecha</th>
                  <th className="px-4 py-2.5">Tipo</th>
                  <th className="px-4 py-2.5">Paciente</th>
                  <th className="px-4 py-2.5">Hab.</th>
                  <th className="px-4 py-2.5">Estado</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {visibles.map((ev) => {
                  const abierto = abierta === ev.id
                  const alta = ev.ingreso.estado !== 'activo'
                  const alternar = () => setAbierta((a) => (a === ev.id ? null : ev.id))
                  const campos = CAMPOS_POR_TIPO[ev.tipo] ?? []
                  const conDato = Object.entries(ev.datos ?? {}).filter(([, v]) => v !== '' && v != null)
                  return (
                    <Fragment key={ev.id}>
                      <tr className="hover:bg-slate-50 cursor-pointer" onClick={atajoDeRaton(alternar)}>
                        <td className="px-4 py-2.5 text-slate-500">
                          {abierto ? <ChevronDown aria-hidden className="w-3.5 h-3.5" /> : <ChevronRight aria-hidden className="w-3.5 h-3.5" />}
                        </td>
                        <td className="px-4 py-2.5 text-xs text-slate-500 whitespace-nowrap">
                          {new Date(ev.fecha).toLocaleDateString('es-ES')}
                          {ev.hora ? ` · ${ev.hora.slice(0, 5)}` : ev.turno ? ` · ${TURNO_LABEL[ev.turno as keyof typeof TURNO_LABEL]}` : ''}
                        </td>
                        <td className="px-4 py-2.5">
                          <button type="button" onClick={alternar} aria-expanded={abierto} className={`text-left ${FOCO_CELDA}`}>
                            <span className={`px-2 py-0.5 rounded-full text-xs font-medium border ${TIPO_EVENTO_COLOR[ev.tipo]}`}>
                              {TIPO_EVENTO_LABEL[ev.tipo]}
                            </span>
                          </button>
                        </td>
                        <td className="px-4 py-2.5 font-medium text-slate-700">
                          <Link to={rutaIncidencia(ev.ingreso.id, ev.id)} onClick={(e) => e.stopPropagation()}
                            className={`hover:text-primary-700 hover:underline ${FOCO_CELDA}`}>{nombreCompleto(ev.ingreso.paciente)}</Link>
                          {alta && <span className="ml-2 text-xs font-normal text-slate-500">· episodio cerrado</span>}
                        </td>
                        <td className="px-4 py-2.5" title={ev.habitacion_evento != null && ev.ingreso.habitacion != null && ev.habitacion_evento !== ev.ingreso.habitacion ? `Habitación en el momento del suceso (ahora está en la ${ev.ingreso.habitacion})` : undefined}>
                          {ev.habitacion_evento ?? ev.ingreso.habitacion ?? '—'}
                        </td>
                        <td className="px-4 py-2.5 whitespace-nowrap">
                          {ev.estado === 'pendiente'
                            ? <span className="text-xs font-medium text-amber-700">Pendiente</span>
                            : <span className="text-xs text-slate-500">Completa</span>}
                        </td>
                      </tr>
                      {abierto && (
                        <tr>
                          <td colSpan={6} className="bg-slate-50 px-6 py-3">
                            {conDato.length > 0 ? (
                              <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-x-6 gap-y-1 mb-2">
                                {conDato.map(([k, v]) => (
                                  <div key={k} className="text-xs">
                                    <span className="text-slate-500">{campos.find((c) => c.key === k)?.label ?? k.replace(/_/g, ' ')}: </span>
                                    <span className="text-slate-700 font-medium">{v}</span>
                                  </div>
                                ))}
                              </div>
                            ) : (
                              <p className="text-xs text-slate-500 mb-2">{ev.estado === 'pendiente' ? 'Faltan datos por completar.' : 'Sin más datos registrados.'}</p>
                            )}
                            {ev.notas && <p className="text-xs text-slate-600 italic mb-2">{ev.notas}</p>}
                            <div className="flex items-center justify-between gap-3 flex-wrap">
                              <p className="text-xs text-slate-500">
                                {ev.registrado_por ? `Registrado por ${ev.registrado_por.nombre} ${ev.registrado_por.apellidos}` : ''}
                              </p>
                              <Link to={rutaIncidencia(ev.ingreso.id, ev.id)} className="btn-secondary btn-sm">
                                {ev.estado === 'pendiente' ? 'Completar' : 'Abrir'}
                              </Link>
                            </div>
                          </td>
                        </tr>
                      )}
                    </Fragment>
                  )
                })}
              </tbody>
            </table>
          )}
        </div>
      </section>
    </div>
  )
}

function ChipTipo({ activo, onClick, texto, n }: { activo: boolean; onClick: () => void; texto: string; n: number }) {
  return (
    <button
      type="button"
      aria-pressed={activo}
      onClick={onClick}
      className={`px-3 py-1 rounded-full text-xs font-medium border transition-colors ${
        activo ? 'bg-primary-600 text-white border-primary-600' : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-50'
      }`}
    >
      {texto} <span className={activo ? 'text-white/80' : 'text-slate-500'}>{n}</span>
    </button>
  )
}
