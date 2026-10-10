import { useEffect, useRef, useState } from 'react'
import { Cargando } from '../../components/Cargando'
import { FILTROS_ACCESOS_VACIOS, pedirAccesos, type FilaAcceso, type FiltrosAccesos } from './consultas'
import { ACCESO_LABEL } from './etiquetas'
import { usePacientesNombres, type Personal } from './personal'
import { AvisoError, BarraFiltros, formatoFecha } from './Filtros'

export function TabAccesos({ personal }: { personal: Personal }) {
  const [filtros, setFiltros] = useState<FiltrosAccesos>(FILTROS_ACCESOS_VACIOS)
  const [filas, setFilas] = useState<FilaAcceso[]>([])
  const [hayMas, setHayMas] = useState(false)
  const [cargando, setCargando] = useState(true)
  const [cargandoMas, setCargandoMas] = useState(false)
  const [error, setError] = useState('')
  const { mapa: pacientes, resolver } = usePacientesNombres()
  const ultima = useRef(0)

  async function cargar(reiniciar: boolean) {
    const mia = ++ultima.current
    if (reiniciar) setCargando(true); else setCargandoMas(true)
    const antes = reiniciar || filas.length === 0 ? undefined : filas[filas.length - 1].fecha
    const r = await pedirAccesos(filtros, antes)
    if (mia !== ultima.current) return
    setError(r.error)
    setFilas((previas) => (reiniciar ? r.filas : [...previas, ...r.filas]))
    setHayMas(r.hayMas)
    setCargando(false)
    setCargandoMas(false)
    resolver(r.filas.map((f) => f.pacienteId))
  }

  useEffect(() => { cargar(true) }, [filtros])

  const hayFiltros = JSON.stringify(filtros) !== JSON.stringify(FILTROS_ACCESOS_VACIOS)

  return (
    <>
      <p className="text-sm text-slate-600 mb-3 max-w-3xl">
        Quién ha abierto un expediente o una ficha, quién ha imprimido o exportado a Word, y cuándo se ha entrado en la aplicación.
        Si alguien repite lo mismo en pocos minutos solo se apunta una vez.
      </p>
      <BarraFiltros
        filtros={filtros} onChange={setFiltros} personal={personal}
        hayFiltros={hayFiltros} onLimpiar={() => setFiltros(FILTROS_ACCESOS_VACIOS)}
        hijos={
          <div>
            <label className="label">Qué hizo</label>
            <select className="input" value={filtros.tipo} onChange={(e) => setFiltros({ ...filtros, tipo: e.target.value })}>
              <option value="">Todo</option>
              {Object.entries(ACCESO_LABEL).map(([v, a]) => <option key={v} value={v}>{a.etiqueta}</option>)}
            </select>
          </div>
        }
      />

      {(error || personal.error) && (
        <div className="mb-4 space-y-2">
          {error && <AvisoError texto={error} onReintentar={() => cargar(true)} />}
          {personal.error && <AvisoError color="ambar" texto={personal.error} onReintentar={personal.recargar} />}
        </div>
      )}

      {cargando ? (
        <Cargando />
      ) : filas.length === 0 ? (
        error ? null : (
          <div className="card p-10 text-center text-slate-500 text-sm">
            {hayFiltros ? 'Ningún acceso coincide con esos filtros.' : 'Todavía no hay accesos registrados.'}
          </div>
        )
      ) : (
        <div className="card overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 text-slate-500 text-left">
              <tr>
                <th className="px-4 py-2 font-medium">Fecha y hora</th>
                <th className="px-4 py-2 font-medium">Quién</th>
                <th className="px-4 py-2 font-medium">Qué hizo</th>
                <th className="px-4 py-2 font-medium">Paciente / documento</th>
              </tr>
            </thead>
            <tbody>
              {filas.map((f) => {
                const a = ACCESO_LABEL[f.tipo] ?? { etiqueta: f.tipo, color: 'bg-slate-100 text-slate-600' }
                const nombre = f.usuarioId ? personal.porAuth[f.usuarioId] : null
                const pac = f.pacienteId ? (pacientes[f.pacienteId] === undefined ? '…' : (pacientes[f.pacienteId] || 'Paciente eliminado')) : null
                return (
                  <tr key={f.id} className="border-t border-slate-100">
                    <td className="px-4 py-2 text-slate-600 whitespace-nowrap">{formatoFecha(f.fecha)}</td>
                    <td className="px-4 py-2 text-slate-800">
                      {f.usuarioId ? (nombre ?? 'Usuario desconocido') : <span className="text-slate-500">Autor no identificado</span>}
                    </td>
                    <td className="px-4 py-2">
                      <span className={`px-2 py-0.5 rounded-full text-xs font-semibold ${a.color}`}>{a.etiqueta}</span>
                    </td>
                    <td className="px-4 py-2 text-slate-600">
                      {[pac, f.detalle].filter(Boolean).join(' · ') || <span className="text-slate-400">—</span>}
                    </td>
                  </tr>
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
          <p className="text-xs text-slate-500">{filas.length} {filas.length === 1 ? 'acceso' : 'accesos'}{hayMas ? ' (hay más antiguos)' : ' — no hay más'}.</p>
        </div>
      )}
    </>
  )
}
