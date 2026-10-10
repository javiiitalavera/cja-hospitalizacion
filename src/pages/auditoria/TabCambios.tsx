import { Fragment, useEffect, useRef, useState } from 'react'
import { Cargando } from '../../components/Cargando'
import { CONTENCION_DIA_LABEL, CONTENCION_NOCHE_LABEL, type ContencionDia, type ContencionNoche } from '../../types/contenciones'
import { FILTROS_CAMBIOS_VACIOS, pedirCambios, type FiltrosCambios } from './consultas'
import {
  ACCIONES_FILTRO, TABLA_LABEL, accionColor, accionLabel, detalleDeFila, etiquetaCampo, formatearValor, type FilaAuditoria,
} from './etiquetas'
import { usePacientesNombres, type Personal } from './personal'
import { AvisoError, BarraFiltros, formatoFecha, formatoHora } from './Filtros'

function textoAfecta(f: FilaAuditoria, mapaPacientes: Record<string, string>, personal: Personal): string {
  if (f.tabla === 'profesionales') {
    const n = f.registroId ? personal.porProf[f.registroId] : undefined
    if (n) return n
    const a = f.antes
    return a?.nombre ? `${a.nombre} ${a.apellidos ?? ''}`.trim() + ' (eliminado)' : '—'
  }
  if (f.tabla === 'farmacos_alias') return f.antes?.clave ?? f.cambios?.clave?.despues as string ?? '—'
  if (f.tabla === 'pacientes' && f.accion.toUpperCase() === 'DELETE' && f.antes?.nombre) {
    return `${f.antes.nombre} ${f.antes.primer_apellido ?? ''}`.trim() + ' (eliminado)'
  }
  if (f.pacienteId) return mapaPacientes[f.pacienteId] === undefined ? '…' : (mapaPacientes[f.pacienteId] || 'Paciente eliminado')
  return '—'
}

function DetalleDesplegado({ f }: { f: FilaAuditoria }) {
  const d = detalleDeFila(f)
  if (!d) return null
  if (d.tipo === 'contencion') {
    const v = f.despues ?? {}
    const dia = v.dia && v.dia !== 'ninguna' ? CONTENCION_DIA_LABEL[v.dia as ContencionDia] ?? v.dia : 'Ninguna'
    const noche = ((v.noche as ContencionNoche[]) ?? []).map((n) => CONTENCION_NOCHE_LABEL[n] ?? n)
    return <p className="text-xs text-slate-700">Quedó así — Día: {dia} · Noche: {noche.length > 0 ? noche.join(', ') : 'Ninguna'}</p>
  }
  if (d.tipo === 'contenido') {
    return (
      <div className="text-xs">
        <p className="font-semibold text-slate-500 uppercase tracking-wide mb-1">{d.titulo}</p>
        {d.lineas.length === 0 ? <p className="text-slate-500 italic">Sin datos.</p> : (
          <dl className="grid grid-cols-[minmax(8rem,12rem)_1fr] gap-x-4 gap-y-1 bg-white rounded-lg border p-2">
            {d.lineas.map((l) => (
              <Fragment key={l.campo}>
                <dt className="text-slate-500">{etiquetaCampo(l.campo)}</dt>
                <dd className="text-slate-800 whitespace-pre-wrap break-words">{formatearValor(l.valor)}</dd>
              </Fragment>
            ))}
          </dl>
        )}
      </div>
    )
  }
  return (
    <div className="text-xs">
      {f.nGuardados > 1 && (
        <p className="text-slate-500 mb-1">
          {f.nGuardados} guardados seguidos{f.fechaFin ? ` (de ${formatoHora(f.fecha)} a ${formatoHora(f.fechaFin)})` : ''}, juntos en una sola fila. Se enseña de dónde se partió y cómo quedó.
        </p>
      )}
      {d.lineas.length === 0 ? (
        <p className="text-slate-500 italic">Sin cambios netos: lo que se tocó volvió a quedar como estaba.</p>
      ) : (
        <div className="bg-white rounded-lg border overflow-hidden">
          <div className="grid grid-cols-[minmax(8rem,12rem)_1fr_1fr] bg-slate-50 text-slate-500 font-semibold uppercase tracking-wide">
            <div className="px-2 py-1">Campo</div><div className="px-2 py-1">Antes</div><div className="px-2 py-1">Después</div>
          </div>
          {d.lineas.map((l) => (
            <div key={l.campo} className="grid grid-cols-[minmax(8rem,12rem)_1fr_1fr] border-t border-slate-100">
              <div className="px-2 py-1 text-slate-600 font-medium">{etiquetaCampo(l.campo)}</div>
              <div className="px-2 py-1 text-slate-600 whitespace-pre-wrap break-words max-h-40 overflow-auto">{formatearValor(l.antes)}</div>
              <div className="px-2 py-1 text-slate-900 whitespace-pre-wrap break-words max-h-40 overflow-auto">{formatearValor(l.despues)}</div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

export function TabCambios({ personal }: { personal: Personal }) {
  const [filtros, setFiltros] = useState<FiltrosCambios>(FILTROS_CAMBIOS_VACIOS)
  const [filas, setFilas] = useState<FilaAuditoria[]>([])
  const [hayMas, setHayMas] = useState(false)
  const [cargando, setCargando] = useState(true)
  const [cargandoMas, setCargandoMas] = useState(false)
  const [errorAuditoria, setErrorAuditoria] = useState('')
  const [errorContencion, setErrorContencion] = useState('')
  const [expandido, setExpandido] = useState<string | null>(null)
  const { mapa: pacientes, resolver } = usePacientesNombres()
  const ultima = useRef(0)

  async function cargar(reiniciar: boolean) {
    const mia = ++ultima.current
    if (reiniciar) { setCargando(true); setExpandido(null) } else setCargandoMas(true)
    const antes = reiniciar || filas.length === 0 ? undefined : filas[filas.length - 1].fecha
    const r = await pedirCambios(filtros, personal, antes)
    if (mia !== ultima.current) return             // ya se pidió otra cosa distinta: esta respuesta llegó tarde
    setErrorAuditoria(r.errorAuditoria)
    setErrorContencion(r.errorContencion)
    setFilas((previas) => (reiniciar ? r.filas : [...previas, ...r.filas]))
    setHayMas(r.hayMas)
    setCargando(false)
    setCargandoMas(false)
    resolver(r.filas.map((f) => f.pacienteId))
  }

  // Esperar a tener el personal cargado: el filtro de contención por persona lo necesita.
  useEffect(() => { if (personal.cargado) cargar(true) }, [filtros, personal.cargado])

  const hayFiltros = JSON.stringify(filtros) !== JSON.stringify(FILTROS_CAMBIOS_VACIOS)

  return (
    <>
      <BarraFiltros
        filtros={filtros} onChange={setFiltros} personal={personal}
        hayFiltros={hayFiltros} onLimpiar={() => setFiltros(FILTROS_CAMBIOS_VACIOS)}
        hijos={
          <>
            <div>
              <label className="label">Tipo</label>
              <select className="input" value={filtros.tabla} onChange={(e) => setFiltros({ ...filtros, tabla: e.target.value })}>
                <option value="">Todos</option>
                {Object.entries(TABLA_LABEL).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
              </select>
            </div>
            <div>
              <label className="label">Acción</label>
              <select className="input" value={filtros.accion} onChange={(e) => setFiltros({ ...filtros, accion: e.target.value })}>
                <option value="">Todas</option>
                {ACCIONES_FILTRO.map((a) => <option key={a.valor} value={a.valor}>{a.etiqueta}</option>)}
              </select>
            </div>
          </>
        }
      />
      <label className="flex items-center gap-2 text-sm text-slate-700 mb-4 -mt-1 cursor-pointer w-fit">
        <input type="checkbox" checked={filtros.soloSeguridad} onChange={(e) => setFiltros({ ...filtros, soloSeguridad: e.target.checked })} />
        Solo cambios de seguridad <span className="text-xs text-slate-500">(permisos, administradores, altas y bajas de personal)</span>
      </label>

      {(errorAuditoria || errorContencion || personal.error) && (
        <div className="mb-4 space-y-2">
          {errorAuditoria && <AvisoError texto={errorAuditoria} onReintentar={() => cargar(true)} />}
          {errorContencion && <AvisoError texto={errorContencion} onReintentar={() => cargar(true)} />}
          {personal.error && <AvisoError color="ambar" texto={`${personal.error} — los cambios se ven igual, pero sin el nombre de quién los hizo.`} onReintentar={personal.recargar} />}
        </div>
      )}

      {cargando ? (
        <Cargando />
      ) : filas.length === 0 ? (
        errorAuditoria || errorContencion ? null : (
          <div className="card p-10 text-center text-slate-500 text-sm">
            {hayFiltros ? 'Ningún cambio coincide con esos filtros.' : 'No hay cambios registrados.'}
          </div>
        )
      ) : (
        <div className="card overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 text-slate-500 text-left">
              <tr>
                <th className="px-4 py-2 font-medium">Fecha y hora</th>
                <th className="px-4 py-2 font-medium">Quién</th>
                <th className="px-4 py-2 font-medium">Tipo</th>
                <th className="px-4 py-2 font-medium">Acción</th>
                <th className="px-4 py-2 font-medium">Afecta a</th>
                <th className="px-4 py-2 w-8"></th>
              </tr>
            </thead>
            <tbody>
              {filas.map((f) => {
                const tieneDetalle = detalleDeFila(f) !== null
                const nombreActor = f.actorId ? (f.actorTipo === 'auth' ? personal.porAuth[f.actorId] : personal.porProf[f.actorId]) : null
                return (
                  <Fragment key={f.id}>
                    <tr className={`border-t border-slate-100 ${tieneDetalle ? 'cursor-pointer hover:bg-slate-50' : ''}`}
                      onClick={() => tieneDetalle && setExpandido((e) => (e === f.id ? null : f.id))}>
                      <td className="px-4 py-2 text-slate-600 whitespace-nowrap">
                        {formatoFecha(f.fecha)}
                        {f.fechaFin && f.nGuardados > 1 && <span className="text-slate-400"> – {formatoHora(f.fechaFin)}</span>}
                      </td>
                      <td className="px-4 py-2 text-slate-800">
                        {f.actorId ? (nombreActor ?? 'Usuario desconocido') : (
                          // Un identificador nulo no demuestra que fuera un proceso automático: solo que no se sabe quién fue.
                          <span className="text-slate-500">Autor no identificado</span>
                        )}
                      </td>
                      <td className="px-4 py-2 text-slate-600">{TABLA_LABEL[f.tabla] ?? f.tabla}</td>
                      <td className="px-4 py-2 whitespace-nowrap">
                        <span className={`px-2 py-0.5 rounded-full text-xs font-semibold ${accionColor(f.accion)}`}>{accionLabel(f.accion)}</span>
                        {f.nivel === 'seguridad' && (
                          <span className="ml-1.5 px-2 py-0.5 rounded-full text-xs font-semibold bg-red-100 text-red-800" title="Cambio de permisos, de cuenta, o alta o baja de personal">Seguridad</span>
                        )}
                        {f.nGuardados > 1 && <span className="ml-1.5 text-xs text-slate-400">{f.nGuardados} guardados</span>}
                      </td>
                      <td className="px-4 py-2 text-slate-500">{textoAfecta(f, pacientes, personal)}</td>
                      <td className="px-4 py-2 text-slate-400">{tieneDetalle && (expandido === f.id ? '▾' : '▸')}</td>
                    </tr>
                    {expandido === f.id && tieneDetalle && (
                      <tr className="bg-slate-50 border-t border-slate-100">
                        <td colSpan={6} className="px-4 py-3"><DetalleDesplegado f={f} /></td>
                      </tr>
                    )}
                  </Fragment>
                )
              })}
            </tbody>
          </table>
        </div>
      )}

      {!cargando && filas.length > 0 && (
        <div className="mt-3 flex items-center gap-3">
          {hayMas && (
            <button onClick={() => cargar(false)} disabled={cargandoMas} className="btn-secondary">
              {cargandoMas ? 'Cargando…' : 'Cargar más'}
            </button>
          )}
          <p className="text-xs text-slate-500">
            {filas.length} {filas.length === 1 ? 'cambio' : 'cambios'}{hayMas ? ' (hay más antiguos)' : ' — no hay más'}.
            Los guardados automáticos seguidos de la misma persona se juntan en una sola fila.
          </p>
        </div>
      )}
    </>
  )
}
