import { useEffect, useState, useMemo, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { escaparBusquedaIlike, quitarTildes } from '../lib/busqueda'
import { useAuth } from '../lib/AuthContext'
import type { ItemsPaciente } from '../types'
import { SEMAFORO_CAIDAS_COLOR as SEMAFORO_COLOR, nombreCompleto } from '../types'
import { Printer, History } from 'lucide-react'
import type { ContencionDia, ContencionNoche } from '../types/contenciones'
import type { IngresoConItems } from './hojaItems/tipos'
import { SUJECION_SHORT } from './hojaItems/constantes'
import { printHoja } from './hojaItems/imprimir'
import PanelEdicion from './hojaItems/PanelEdicion'
import Bloque from './hojaItems/Bloque'

// Convierte items_historico al mismo formato que IngresoConItems
function snapshotToIngresos(snaps: any[]): IngresoConItems[] {
  return snaps.map((s) => ({
    id: s.ingreso_id,
    // Prioriza la habitación tal como estaba capturada EN ESE DÍA.
    // Las fotos anteriores a este arreglo no la tienen guardada (ese
    // dato nunca se llegó a capturar entonces), así que para esas se
    // recurre a la habitación actual como aproximación, no exacta.
    habitacion: s.datos?._habitacion_snapshot ?? s.ingreso?.habitacion ?? null,
    estado: 'activo' as const,
    fecha_ingreso: '',
    paciente_id: '',
    paciente: s.ingreso?.paciente ?? null,
    medico_responsable: s.ingreso?.medico_responsable ?? null,
    items: s.datos as ItemsPaciente,
    created_at: '',
  }))
}

// ─── PÁGINA PRINCIPAL ─────────────────────────────────────────

export default function HojaItems() {
  const navigate = useNavigate()
  const { rol } = useAuth()
  const esMedico = rol === 'medico'
  const [data, setData] = useState<IngresoConItems[]>([])
  const [loading, setLoading] = useState(true)
  const [selected, setSelected] = useState<IngresoConItems | null>(null)

  const today = new Date().toLocaleDateString('es-ES', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  })

  const [verHistorico, setVerHistorico] = useState(false)
  const [fechasSnapshot, setFechasSnapshot] = useState<string[]>([])
  const [fechaSeleccionada, setFechaSeleccionada] = useState<string>('')
  const [snapshotData, setSnapshotData] = useState<any[]>([])
  const [loadingSnapshot, setLoadingSnapshot] = useState(false)
  const [modoHistorico, setModoHistorico] = useState<'fecha' | 'paciente'>('fecha')
  const [busquedaPaciente, setBusquedaPaciente] = useState('')
  const [pacienteResultados, setPacienteResultados] = useState<any[]>([])
  const [pacienteSeleccionadoHist, setPacienteSeleccionadoHist] = useState<any>(null)
  const [historialPaciente, setHistorialPaciente] = useState<any[]>([])
  const [loadingHistorial, setLoadingHistorial] = useState(false)

  async function fetchFechas() {
    // Solo necesitamos saber si hay datos y la fecha más reciente
    const { data } = await supabase
      .from('items_historico')
      .select('fecha')
      .order('fecha', { ascending: false })
      .limit(1)
    if (data && data.length > 0) {
      setFechasSnapshot([data[0].fecha])
      if (!fechaSeleccionada) setFechaSeleccionada(data[0].fecha)
    }
  }

  async function buscarPaciente(q: string) {
    if (q.trim().length < 2) {
      setPacienteResultados([])
      return
    }
    // Mismo criterio que en Pacientes y Nuevo Ingreso: se escapa el
    // texto (una coma o un paréntesis, si no, rompía la consulta) y
    // se busca sin tildes en los dos lados.
    const qEscapado = escaparBusquedaIlike(quitarTildes(q.trim()))
    const { data } = await supabase
      .from('pacientes')
      .select('id, nombre, primer_apellido, segundo_apellido')
      .or(`primer_apellido_normalizado.ilike.${qEscapado},segundo_apellido_normalizado.ilike.${qEscapado},nombre_normalizado.ilike.${qEscapado}`)
      .order('primer_apellido')
      .limit(8)
    setPacienteResultados(data ?? [])
  }

  async function cargarHistorialPaciente(paciente: any) {
    setLoadingHistorial(true)
    setPacienteSeleccionadoHist(paciente)
    setPacienteResultados([])
    setBusquedaPaciente(nombreCompleto(paciente))
    try {
      // Buscar todos los ingresos del paciente que tengan histórico
      const { data: ings } = await supabase
        .from('ingresos')
        .select('id, habitacion, fecha_ingreso, fecha_alta, estado')
        .eq('paciente_id', paciente.id)
        .order('fecha_ingreso', { ascending: false })
      const ingresoIds = (ings ?? []).map((i: any) => i.id)
      if (ingresoIds.length === 0) {
        setHistorialPaciente([])
        return
      }
      const { data: hist } = await supabase
        .from('items_historico')
        .select('fecha, datos, ingreso_id')
        .in('ingreso_id', ingresoIds)
        .order('fecha', { ascending: false })
      // Enriquecer con datos del ingreso
      const ingresoMap = Object.fromEntries((ings ?? []).map((i: any) => [i.id, i]))
      setHistorialPaciente(
        (hist ?? []).map((h: any) => ({
          ...h,
          ingreso: ingresoMap[h.ingreso_id],
        }))
      )
    } finally {
      setLoadingHistorial(false)
    }
  }

  async function cargarSnapshot(fecha: string) {
    setLoadingSnapshot(true)
    setFechaSeleccionada(fecha)
    try {
      const { data: snaps } = await supabase
        .from('items_historico')
        .select(
          '*, ingreso:ingresos(habitacion, paciente:pacientes(nombre, primer_apellido), medico_responsable:profesionales(nombre))'
        )
        .eq('fecha', fecha)
        .order('ingreso(habitacion)', { ascending: true })
      setSnapshotData(snaps ?? [])
    } finally {
      setLoadingSnapshot(false)
    }
  }

  async function fetchData() {
    try {
      const { data: ingresos } = await supabase
        .from('ingresos')
        .select(
          '*, paciente:pacientes(nombre,primer_apellido), medico_responsable:profesionales(nombre), items:items_paciente(*)'
        )
        .eq('estado', 'activo')
        .order('habitacion', { ascending: true })

      const ids = (ingresos ?? []).map((i: any) => i.id)
      const { data: contencionesData } = ids.length
        ? await supabase.from('contenciones').select('ingreso_id, dia, noche').in('ingreso_id', ids)
        : { data: [] as any[] }
      const contencionesMap: Record<string, { dia: any; noche: any }> = {}
      ;(contencionesData ?? []).forEach((c: any) => { contencionesMap[c.ingreso_id] = { dia: c.dia, noche: c.noche } })

      setData(
        (ingresos ?? []).map((i: any) => ({
          ...i,
          items: Array.isArray(i.items) ? (i.items[0] ?? null) : (i.items ?? null),
          contencion: contencionesMap[i.id],
        })) as IngresoConItems[]
      )
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchData()
    fetchFechas()
  }, [])

  function handleSaved(ingresoId: string, updated: ItemsPaciente) {
    setData((prev) => prev.map((i) => (i.id === ingresoId ? { ...i, items: updated } : i)))
    setSelected((prev) => (prev?.id === ingresoId ? { ...prev, items: updated } : prev))
  }

  // Sin esto, pautar o retirar una contención desde el panel lateral
  // solo actualizaba el propio panel — la rejilla principal (que
  // muestra "Contención día/noche" como filas) se quedaba con el
  // valor viejo hasta recargar la página entera.
  function handleContencionChanged(ingresoId: string, nueva: { dia: ContencionDia | null; noche: ContencionNoche[] | null }) {
    setData((prev) => prev.map((i) => (i.id === ingresoId ? { ...i, contencion: nueva } : i)))
    setSelected((prev) => (prev?.id === ingresoId ? { ...prev, contencion: nueva } : prev))
  }

  function handleHabitacionChange(ingresoId: string, nuevaHab: number) {
    setData((prev) => prev.map((i) => (i.id === ingresoId ? { ...i, habitacion: nuevaHab } : i)))
    setSelected((prev) => (prev?.id === ingresoId ? { ...prev, habitacion: nuevaHab } : prev))
  }

  // Memoizados: sin esto, Bloque se volvería a dibujar entero en cada
  // tecla del buscador o cualquier otra interacción, porque recibiría
  // un array "nuevo" (aunque con el mismo contenido) en cada renderizado.
  const habs1_16 = useMemo(() => data.filter((i) => i.habitacion && i.habitacion <= 16), [data])
  const habs17_max = useMemo(() => data.filter((i) => i.habitacion && i.habitacion > 16), [data])
  const maxHab = useMemo(() => Math.max(33, ...data.map((i) => i.habitacion ?? 0)), [data])

  // Estable entre renderizados por el mismo motivo: si no, Bloque
  // recibiría una función "nueva" cada vez y su memoización no serviría
  // de nada, aunque el resto de props no hubieran cambiado.
  const handleSelectVacia = useCallback(
    (n: number) => { if (esMedico) navigate(`/pacientes/nuevo?habitacion=${n}`) },
    [esMedico, navigate]
  )

  if (loading) return <div className="p-8 text-slate-400">Cargando…</div>

  return (
    <div className={`p-4 transition-all duration-200 ${selected ? 'mr-80' : ''}`}>
      <div className="flex items-center justify-between mb-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-800">Hoja de ítems</h1>
          <p className="text-sm text-slate-400 capitalize">{today}</p>
          {!selected && <p className="text-xs text-slate-400 mt-0.5">Click en un paciente para editar sus ítems</p>}
        </div>
        <div className="flex items-center gap-3">
          {/* Leyenda semáforo */}
          <div className="flex items-center gap-2 text-xs text-slate-500">
            {['verde', 'amarillo', 'naranja', 'rojo'].map((c) => (
              <span key={c} className="flex items-center gap-1">
                <span
                  className="w-3 h-3 rounded-full inline-block border border-slate-300"
                  style={{ backgroundColor: SEMAFORO_COLOR[c] }}
                />
                {c}
              </span>
            ))}
          </div>
          <button
            onClick={() => {
              setVerHistorico((v) => !v)
              if (!verHistorico && fechasSnapshot.length > 0) cargarSnapshot(fechasSnapshot[0])
            }}
            className={`btn-secondary ${verHistorico ? 'bg-slate-100' : ''}`}
          >
            <History className="w-4 h-4" />
            {verHistorico ? 'Ver hoy' : 'Histórico'}
          </button>
          <button onClick={() => printHoja(data, today)} className="btn-secondary">
            <Printer className="w-4 h-4" />
            Imprimir
          </button>
        </div>
      </div>

      {/* Vista histórico */}
      {verHistorico ? (
        <div className="space-y-4">
          {/* Selector de modo */}
          <div className="flex gap-2">
            <button
              onClick={() => setModoHistorico('fecha')}
              className={`px-4 py-2 rounded-lg text-sm font-medium border transition-colors ${modoHistorico === 'fecha' ? 'bg-primary-600 text-white border-primary-600' : 'bg-white text-slate-600 border-slate-300 hover:bg-slate-50'}`}
            >
              Por fecha
            </button>
            <button
              onClick={() => setModoHistorico('paciente')}
              className={`px-4 py-2 rounded-lg text-sm font-medium border transition-colors ${modoHistorico === 'paciente' ? 'bg-primary-600 text-white border-primary-600' : 'bg-white text-slate-600 border-slate-300 hover:bg-slate-50'}`}
            >
              Por paciente
            </button>
          </div>

          {/* MODO FECHA */}
          {modoHistorico === 'fecha' &&
            (fechasSnapshot.length === 0 ? (
              <div className="card p-10 text-center text-slate-400 text-sm">No hay snapshots guardados aún.</div>
            ) : (
              <>
                <div className="flex items-center gap-3">
                  <input
                    type="date"
                    className="input max-w-[200px]"
                    value={fechaSeleccionada}
                    max={fechasSnapshot[0]}
                    onChange={(e) => {
                      if (e.target.value) cargarSnapshot(e.target.value)
                    }}
                  />
                  <span className="text-sm text-slate-400">
                    {fechaSeleccionada &&
                      new Date(fechaSeleccionada).toLocaleDateString('es-ES', {
                        weekday: 'long',
                        day: 'numeric',
                        month: 'long',
                        year: 'numeric',
                      })}
                  </span>
                  {snapshotData.length > 0 && (
                    <button
                      onClick={() => {
                        const fechaLabel = new Date(fechaSeleccionada).toLocaleDateString('es-ES', {
                          weekday: 'long',
                          day: 'numeric',
                          month: 'long',
                          year: 'numeric',
                        })
                        printHoja(snapshotToIngresos(snapshotData), fechaLabel)
                      }}
                      className="btn-secondary ml-auto"
                    >
                      <Printer className="w-4 h-4" />
                      Imprimir
                    </button>
                  )}
                </div>
                {loadingSnapshot ? (
                  <div className="text-slate-400 text-sm py-8 text-center">Cargando…</div>
                ) : snapshotData.length === 0 ? (
                  <div className="card p-8 text-center text-slate-400 text-sm">Sin datos para esta fecha.</div>
                ) : (
                  <>
                    {(() => {
                      const converted = snapshotToIngresos(snapshotData)
                      const habs1 = converted.filter((i) => i.habitacion && i.habitacion <= 16)
                      const habs2 = converted.filter((i) => i.habitacion && i.habitacion > 16)
                      // Igual que en la vista actual: el segundo bloque se
                      // adapta a cuántas habitaciones haya de verdad, para
                      // no perder la 33 (u otras futuras) en el histórico.
                      const maxHabSnapshot = Math.max(33, ...converted.map((i) => i.habitacion ?? 0))
                      return (
                        <>
                          <Bloque habs={habs1} offset={0} count={16} onSelect={() => {}} selectedId={null} readOnly />
                          <Bloque habs={habs2} offset={16} count={maxHabSnapshot - 16} onSelect={() => {}} selectedId={null} readOnly />
                        </>
                      )
                    })()}
                  </>
                )}
              </>
            ))}

          {/* MODO PACIENTE */}
          {modoHistorico === 'paciente' && (
            <div className="space-y-4">
              {/* Buscador */}
              <div className="relative max-w-sm">
                <input
                  className="input pr-8"
                  placeholder="Buscar por apellido…"
                  value={busquedaPaciente}
                  onChange={(e) => {
                    setBusquedaPaciente(e.target.value)
                    buscarPaciente(e.target.value)
                  }}
                />
                {pacienteResultados.length > 0 && (
                  <div className="absolute top-full left-0 right-0 mt-1 bg-white border rounded-xl shadow-lg z-20 overflow-hidden">
                    {pacienteResultados.map((p: any) => (
                      <button
                        key={p.id}
                        onClick={() => cargarHistorialPaciente(p)}
                        className="w-full text-left px-4 py-2.5 text-sm hover:bg-slate-50 border-b last:border-0"
                      >
                        {p.primer_apellido}, {p.nombre}
                      </button>
                    ))}
                  </div>
                )}
              </div>

              {/* Historial del paciente */}
              {pacienteSeleccionadoHist &&
                (loadingHistorial ? (
                  <div className="text-slate-400 text-sm py-8 text-center">Cargando historial…</div>
                ) : historialPaciente.length === 0 ? (
                  <div className="card p-8 text-center text-slate-400 text-sm">
                    Sin histórico de ítems para {pacienteSeleccionadoHist.primer_apellido},{' '}
                    {pacienteSeleccionadoHist.nombre}.
                  </div>
                ) : (
                  <div className="space-y-3">
                    <p className="text-sm font-semibold text-slate-700">
                      {pacienteSeleccionadoHist.primer_apellido}, {pacienteSeleccionadoHist.nombre}
                      <span className="font-normal text-slate-400 ml-2">· {historialPaciente.length} registros</span>
                    </p>
                    <div className="card overflow-hidden">
                      <table className="w-full text-xs">
                        <thead>
                          <tr className="border-b bg-slate-50">
                            <th className="px-3 py-2 text-left font-semibold text-slate-500">Fecha</th>
                            <th className="px-3 py-2 text-left font-semibold text-slate-500">Hab.</th>
                            <th className="px-3 py-2 text-left font-semibold text-slate-500">Riesgo caída</th>
                            <th className="px-3 py-2 text-left font-semibold text-slate-500">Dependencia</th>
                            <th className="px-3 py-2 text-left font-semibold text-slate-500">Ingestas</th>
                            <th className="px-3 py-2 text-left font-semibold text-slate-500">Higiene</th>
                            <th className="px-3 py-2 text-left font-semibold text-slate-500">Sujeción cama</th>
                            <th className="px-3 py-2 text-left font-semibold text-slate-500">Deambulación</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y">
                          {historialPaciente.map((h: any, idx: number) => {
                            const it = h.datos ?? {}
                            const sem = it.semaforo_caidas
                            const semBg = sem ? SEMAFORO_COLOR[sem] : null
                            const semTxt = sem === 'rojo' ? '#fff' : '#000'
                            const sujCama =
                              Array.isArray(it.sujecion_cama) && it.sujecion_cama.length > 0
                                ? it.sujecion_cama.map((x: string) => SUJECION_SHORT[x] ?? x).join('+')
                                : '—'
                            // Detectar cambios respecto al día anterior
                            const prev = historialPaciente[idx + 1]?.datos ?? {}
                            const changed = (key: string) => JSON.stringify(it[key]) !== JSON.stringify(prev[key])
                            const cellCls = (key: string) =>
                              changed(key) && idx < historialPaciente.length - 1
                                ? 'px-3 py-2 font-semibold text-primary-700'
                                : 'px-3 py-2 text-slate-600'
                            return (
                              <tr key={`${h.ingreso_id}-${h.fecha}`} className="hover:bg-slate-50">
                                <td className="px-3 py-2 font-medium text-slate-800 whitespace-nowrap">
                                  {new Date(h.fecha).toLocaleDateString('es-ES', {
                                    day: 'numeric',
                                    month: 'short',
                                    year: 'numeric',
                                  })}
                                </td>
                                <td className="px-3 py-2 text-slate-500">{h.ingreso?.habitacion ?? '—'}</td>
                                <td className="px-3 py-2">
                                  {sem ? (
                                    <span
                                      className="px-2 py-0.5 rounded-full text-xs font-medium capitalize"
                                      style={{ backgroundColor: semBg!, color: semTxt }}
                                    >
                                      {sem}
                                    </span>
                                  ) : (
                                    '—'
                                  )}
                                </td>
                                <td className={cellCls('dependencia_avd')}>{it.dependencia_avd ?? '—'}</td>
                                <td className={cellCls('ingestas')}>
                                  {it.ingestas === 'autonomo'
                                    ? 'Autónomo'
                                    : it.ingestas === 'dependiente'
                                      ? 'Dependiente'
                                      : '—'}
                                </td>
                                <td className={cellCls('higiene')}>
                                  {it.higiene === 'lavabo' ? 'Lavabo' : it.higiene === 'cama' ? 'Cama' : '—'}
                                </td>
                                <td className={cellCls('sujecion_cama')}>{sujCama}</td>
                                <td className={cellCls('deambulacion')}>{it.deambulacion ?? '—'}</td>
                              </tr>
                            )
                          })}
                        </tbody>
                      </table>
                    </div>
                  </div>
                ))}
            </div>
          )}
        </div>
      ) : (
        <>
          <div className="mb-4">
            <Bloque
              habs={habs1_16}
              offset={0}
              count={16}
              onSelect={setSelected}
              onSelectVacia={handleSelectVacia}
              selectedId={selected?.id ?? null}
            />
          </div>
          <div className="my-3 border-t-2 border-slate-400" />
          <div className="mb-4">
            <Bloque
              habs={habs17_max}
              offset={16}
              count={maxHab - 16}
              onSelect={setSelected}
              onSelectVacia={handleSelectVacia}
              selectedId={selected?.id ?? null}
            />
          </div>
        </>
      )}

      {selected && (
        <PanelEdicion
          key={selected.id}
          ingreso={selected}
          onClose={() => setSelected(null)}
          onSaved={(updated) => handleSaved(selected.id, updated)}
          onHabitacionChange={handleHabitacionChange}
          onContencionChanged={handleContencionChanged}
        />
      )}
    </div>
  )
}
