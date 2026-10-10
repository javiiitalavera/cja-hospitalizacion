// Histórico de las hojas de turno: cada noche se guarda una copia de la pauta de cada paciente ingresado
// (pauta_historico). Se consulta por fecha (la hoja de ese día, que se puede volver a imprimir) o por
// paciente (cómo ha ido cambiando su pauta).

import { useEffect, useMemo, useState } from 'react'
import { Cargando } from '../../components/Cargando'
import { Printer } from 'lucide-react'
import { supabase } from '../../lib/supabase'
import { imprimirHTMLEnMarco } from '../../lib/imprimir'
import { TURNOS, VIA_LABEL, type Turno } from '../../types/pautaCuidados'
import { TabsTurno } from './TabsTurno'
import { TablaHoja } from './TablaHoja'
import {
  avisosAutomaticos, construirHojaHTML, fechaDesdeTexto, pacienteDesdeHistorico, textoDiuresis,
  type FilaHistorico, type PacienteHoja,
} from './hoja'

const fechaLarga = (t: string) =>
  fechaDesdeTexto(t).toLocaleDateString('es-ES', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })

const botonModo = (activo: boolean) =>
  `px-4 py-2 rounded-lg text-sm font-medium border transition-colors ${
    activo ? 'bg-primary-600 text-white border-primary-600' : 'bg-white text-slate-600 border-slate-300 hover:bg-slate-50'
  }`

export function HistoricoHojas() {
  const [modo, setModo] = useState<'fecha' | 'paciente'>('fecha')
  return (
    <div className="space-y-4">
      <div className="flex gap-2">
        <button onClick={() => setModo('fecha')} className={botonModo(modo === 'fecha')}>Por fecha</button>
        <button onClick={() => setModo('paciente')} className={botonModo(modo === 'paciente')}>Por paciente</button>
      </div>
      {modo === 'fecha' ? <PorFecha /> : <PorPaciente />}
    </div>
  )
}

// ── Por fecha ────────────────────────────────────────────────
function PorFecha() {
  const [turno, setTurno] = useState<Turno>('manana')
  const [limites, setLimites] = useState<{ primera: string; ultima: string } | null | undefined>(undefined)
  const [fecha, setFecha] = useState('')
  const [filas, setFilas] = useState<FilaHistorico[]>([])
  const [cargando, setCargando] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    let vivo = true
    async function cargarLimites() {
      const [a, b] = await Promise.all([
        supabase.from('pauta_historico').select('fecha').order('fecha', { ascending: false }).limit(1),
        supabase.from('pauta_historico').select('fecha').order('fecha', { ascending: true }).limit(1),
      ])
      if (!vivo) return
      if (a.error || b.error) { setError('No se pudo cargar el histórico: ' + (a.error?.message ?? b.error?.message)); setLimites(null); return }
      const ultima = (a.data as { fecha: string }[] | null)?.[0]?.fecha
      const primera = (b.data as { fecha: string }[] | null)?.[0]?.fecha
      if (!ultima || !primera) { setLimites(null); return }
      setLimites({ primera, ultima })
      setFecha(ultima)
    }
    cargarLimites()
    return () => { vivo = false }
  }, [])

  useEffect(() => {
    if (!fecha) return
    let vivo = true
    setCargando(true)
    setError('')
    supabase.from('pauta_historico').select('ingreso_id, fecha, datos').eq('fecha', fecha).then(({ data, error: e }) => {
      if (!vivo) return
      if (e) setError('No se pudo cargar la hoja de ese día: ' + e.message)
      setFilas((data ?? []) as FilaHistorico[])
      setCargando(false)
    })
    return () => { vivo = false }
  }, [fecha])

  const pacientes = useMemo(
    () => filas.map(pacienteDesdeHistorico).filter((p): p is PacienteHoja => !!p),
    [filas],
  )

  if (limites === undefined) return <Cargando />
  if (limites === null) {
    return (
      <div className="card p-10 text-center text-slate-500 text-sm">
        {error || 'Todavía no hay hojas guardadas. Cada noche se guarda una copia de la pauta de todos los pacientes ingresados.'}
      </div>
    )
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3 flex-wrap">
        <input
          type="date"
          className="input max-w-[200px]"
          value={fecha}
          min={limites.primera}
          max={limites.ultima}
          onChange={(e) => { if (e.target.value) setFecha(e.target.value) }}
        />
        <span className="text-sm text-slate-500">{fecha && fechaLarga(fecha)}</span>
        {pacientes.length > 0 && (
          <button
            onClick={() => imprimirHTMLEnMarco(construirHojaHTML(turno, pacientes, fechaDesdeTexto(fecha)))}
            className="btn-secondary ml-auto"
          >
            <Printer className="w-4 h-4" /> Imprimir este día ({TURNOS.find((t) => t.clave === turno)?.etiqueta.toLowerCase()})
          </button>
        )}
      </div>
      <TabsTurno turno={turno} onChange={setTurno} />
      {error && <div className="text-sm text-red-700 bg-red-50 border border-red-200 rounded-lg px-3 py-2">{error}</div>}
      {cargando ? (
        <Cargando />
      ) : pacientes.length === 0 ? (
        <div className="card p-8 text-center text-slate-500 text-sm">No hay hoja guardada para esta fecha.</div>
      ) : (
        <>
          <p className="text-xs text-slate-500">Copia guardada esa noche. Solo lectura.</p>
          <TablaHoja turno={turno} pacientes={pacientes} />
        </>
      )}
    </div>
  )
}

// ── Por paciente ─────────────────────────────────────────────
interface PacienteLista { id: string; nombre: string; primer_apellido: string; segundo_apellido: string | null }

const etiquetaTurnos = (ts: Turno[]) => (ts.length === 3 ? 'todos los turnos' : ts.map((t) => TURNOS.find((x) => x.clave === t)?.etiqueta).join(' + '))

// Lo que cambia de un día a otro: la vía y las indicaciones (texto y turnos).
const firma = (p: PacienteHoja) => JSON.stringify([p.via, p.indicaciones.map((i) => [i.texto, i.turnos])])

function PorPaciente() {
  const [lista, setLista] = useState<PacienteLista[] | undefined>(undefined)
  const [elegido, setElegido] = useState('')
  const [dias, setDias] = useState<{ fecha: string; ingresoId: string; p: PacienteHoja }[]>([])
  const [cargando, setCargando] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    let vivo = true
    // Solo ingresos que tienen alguna copia guardada (join interno).
    supabase.from('ingresos')
      .select('id, paciente:pacientes(id, nombre, primer_apellido, segundo_apellido), pauta_historico!inner(fecha)')
      .limit(1, { referencedTable: 'pauta_historico' })
      .then(({ data, error: e }) => {
        if (!vivo) return
        if (e) { setError('No se pudo cargar la lista de pacientes: ' + e.message); setLista([]); return }
        const vistos = new Map<string, PacienteLista>()
        for (const r of (data ?? []) as any[]) {
          const p = Array.isArray(r.paciente) ? r.paciente[0] : r.paciente
          if (p && !vistos.has(p.id)) vistos.set(p.id, p)
        }
        setLista([...vistos.values()].sort((a, b) => a.primer_apellido.localeCompare(b.primer_apellido, 'es')))
      })
    return () => { vivo = false }
  }, [])

  async function elegir(id: string) {
    setElegido(id)
    setDias([])
    if (!id) return
    setCargando(true)
    setError('')
    const { data: ings, error: eI } = await supabase.from('ingresos').select('id').eq('paciente_id', id)
    if (eI) { setError('No se pudo cargar el historial: ' + eI.message); setCargando(false); return }
    const ids = (ings ?? []).map((i: any) => i.id)
    const { data, error: eH } = ids.length
      ? await supabase.from('pauta_historico').select('ingreso_id, fecha, datos').in('ingreso_id', ids).order('fecha', { ascending: false })
      : { data: [], error: null }
    if (eH) { setError('No se pudo cargar el historial: ' + eH.message); setCargando(false); return }
    setDias(((data ?? []) as FilaHistorico[]).flatMap((f) => {
      const p = pacienteDesdeHistorico(f)
      return p ? [{ fecha: f.fecha, ingresoId: f.ingreso_id, p }] : []
    }))
    setCargando(false)
  }

  const sel = lista?.find((p) => p.id === elegido)

  return (
    <div className="space-y-4">
      <div className="max-w-sm">
        <select className="input" value={elegido} onChange={(e) => void elegir(e.target.value)} disabled={lista === undefined}>
          <option value="">— Elige un paciente —</option>
          {(lista ?? []).map((p) => (
            <option key={p.id} value={p.id}>{p.primer_apellido} {p.segundo_apellido ?? ''}, {p.nombre}</option>
          ))}
        </select>
        {lista !== undefined && lista.length === 0 && !error && (
          <p className="text-xs text-slate-500 mt-1">Ningún paciente tiene todavía histórico registrado.</p>
        )}
      </div>
      {error && <div className="text-sm text-red-700 bg-red-50 border border-red-200 rounded-lg px-3 py-2">{error}</div>}

      {elegido && (cargando ? (
        <Cargando texto="Cargando historial…" />
      ) : dias.length === 0 ? (
        <div className="card p-8 text-center text-slate-500 text-sm">
          Sin histórico de pauta para {sel ? `${sel.primer_apellido}, ${sel.nombre}` : 'este paciente'}.
        </div>
      ) : (
        <div className="space-y-3">
          <p className="text-sm font-semibold text-slate-700">
            {sel && `${sel.primer_apellido}, ${sel.nombre}`}
            <span className="font-normal text-slate-500 ml-2">· {dias.length} {dias.length === 1 ? 'día' : 'días'} guardados</span>
          </p>
          <div className="card overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="bg-slate-50 text-left font-semibold text-slate-500">
                  <th className="px-3 py-2 whitespace-nowrap">Fecha</th>
                  <th className="px-3 py-2">Hab.</th>
                  <th className="px-3 py-2">Vía</th>
                  <th className="px-3 py-2">Avisos de la app</th>
                  <th className="px-3 py-2 min-w-[20rem]">Indicaciones</th>
                </tr>
              </thead>
              <tbody>
                {dias.map((d, idx) => {
                  // Se compara con el día anterior guardado (la fila siguiente: van de más nuevo a más antiguo).
                  const previo = dias[idx + 1]
                  const cambio = !!previo && previo.ingresoId === d.ingresoId && firma(previo.p) !== firma(d.p)
                  const diu = textoDiuresis(d.p)
                  const av = [diu, ...avisosAutomaticos(d.p, 'manana').filter((a) => !a.startsWith('Contención'))].filter(Boolean)
                  return (
                    <tr key={`${d.ingresoId}-${d.fecha}`} className={`border-t align-top ${cambio ? 'bg-primary-50/40' : ''}`}>
                      <td className="px-3 py-2 font-medium text-slate-800 whitespace-nowrap">
                        {fechaDesdeTexto(d.fecha).toLocaleDateString('es-ES', { day: 'numeric', month: 'short', year: 'numeric' })}
                        {cambio && <span className="ml-2 text-[10px] font-semibold text-primary-700">CAMBIOS</span>}
                      </td>
                      <td className="px-3 py-2 text-slate-500">{d.p.habitacion}</td>
                      <td className="px-3 py-2 text-slate-600">{d.p.via ? VIA_LABEL[d.p.via] : <span className="text-slate-300">—</span>}</td>
                      <td className="px-3 py-2 text-slate-600">{av.length ? av.join(' · ') : <span className="text-slate-300">—</span>}</td>
                      <td className="px-3 py-2">
                        {d.p.indicaciones.length === 0 ? <span className="text-slate-300">—</span> : (
                          <ul className="space-y-1">
                            {d.p.indicaciones.map((i, k) => (
                              <li key={k} className="text-slate-800">
                                {i.texto} <span className="text-slate-400">({etiquetaTurnos(i.turnos)})</span>
                              </li>
                            ))}
                          </ul>
                        )}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
          <p className="text-xs text-slate-500">Las filas resaltadas son los días en que cambió la vía o alguna indicación respecto al día anterior guardado.</p>
        </div>
      ))}
    </div>
  )
}
