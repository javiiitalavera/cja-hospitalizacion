import { useEffect, useState, useMemo, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { fetchContencionesPorIngreso } from '../lib/contenciones'
import { useAuth } from '../lib/AuthContext'
import type { ItemsPaciente } from '../types'
import { SEMAFORO_CAIDAS_COLOR as SEMAFORO_COLOR } from '../types'
import { Printer, History, RefreshCw } from 'lucide-react'
import type { ContencionDia, ContencionNoche } from '../types/contenciones'
import type { IngresoConItems } from './hojaItems/tipos'
import { FILAS_PLANAS } from './hojaItems/constantes'
import { printHoja } from './hojaItems/imprimir'
import PanelEdicion from './hojaItems/PanelEdicion'
import Bloque from './hojaItems/Bloque'

// Convierte items_historico al mismo formato que IngresoConItems, para
// poder reutilizar el mismo componente Bloque en el modo "por fecha".
function snapshotToIngresos(snaps: any[]): IngresoConItems[] {
  return snaps.map((s) => ({
    id: s.ingreso_id,
    habitacion: s.datos?._habitacion_snapshot ?? s.ingreso?.habitacion ?? null,
    estado: 'activo' as const,
    fecha_ingreso: '',
    paciente_id: '',
    paciente: s.ingreso?.paciente ?? null,
    medico_responsable: s.ingreso?.medico_responsable ?? null,
    items: s.datos as ItemsPaciente,
    // Reconstruida a partir de lo que el snapshot nocturno guardó ese
    // día — antes esto no se guardaba en absoluto, así que el
    // histórico siempre mostraba la contención vacía, sin que "vacío"
    // quisiera decir "no había contención": simplemente nunca se
    // llegó a copiar. Ver generar_snapshot_items() en el esquema.
    contencion: { dia: s.datos?._contencion_dia ?? null, noche: s.datos?._contencion_noche ?? null },
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
  const [refreshing, setRefreshing] = useState(false)
  const [error, setError] = useState('')
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
  const [pacientesConHistorial, setPacientesConHistorial] = useState<any[]>([])
  const [pacienteSeleccionadoHist, setPacienteSeleccionadoHist] = useState<any>(null)
  const [historialPaciente, setHistorialPaciente] = useState<any[]>([])
  const [loadingHistorial, setLoadingHistorial] = useState(false)

  async function fetchFechas() {
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

  // Antes había que escribir el apellido a mano, sin saber de
  // antemano si esa persona tenía algún día registrado — una lista
  // ya filtrada a quien sí tiene histórico es más rápida de usar y no
  // depende de acertar la ortografía.
  async function fetchPacientesConHistorial() {
    const { data } = await supabase
      .from('items_historico')
      .select('ingreso:ingresos(paciente:pacientes(id, nombre, primer_apellido, segundo_apellido))')
    const vistos = new Map<string, any>()
    ;(data ?? []).forEach((row: any) => {
      const p = row.ingreso?.paciente
      if (p && !vistos.has(p.id)) vistos.set(p.id, p)
    })
    setPacientesConHistorial(
      [...vistos.values()].sort((a, b) => (a.primer_apellido ?? '').localeCompare(b.primer_apellido ?? ''))
    )
  }

  async function cargarHistorialPaciente(pacienteId: string) {
    const paciente = pacientesConHistorial.find((p) => p.id === pacienteId) ?? null
    setLoadingHistorial(true)
    setPacienteSeleccionadoHist(paciente)
    try {
      const { data: ings } = await supabase
        .from('ingresos')
        .select('id, habitacion, fecha_ingreso, fecha_alta, estado')
        .eq('paciente_id', pacienteId)
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
      const ingresoMap = Object.fromEntries((ings ?? []).map((i: any) => [i.id, i]))
      setHistorialPaciente(
        (hist ?? []).map((h: any) => ({ ...h, ingreso: ingresoMap[h.ingreso_id] }))
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
    setRefreshing(true)
    try {
      const { data: ingresos, error: errPrincipal } = await supabase
        .from('ingresos')
        .select(
          '*, paciente:pacientes(nombre,primer_apellido), medico_responsable:profesionales(nombre), items:items_paciente(*)'
        )
        .eq('estado', 'activo')
        .order('habitacion', { ascending: true })

      if (errPrincipal) {
        // Sin esto, un fallo real de carga se veía igual que "planta
        // vacía" — que para quien lo mira es lo contrario de lo que
        // está pasando de verdad. No se toca "data": si ya había una
        // lista cargada de antes, se queda visible en vez de
        // borrarse, hasta que una recarga funcione de verdad.
        setError('No se ha podido cargar la Hoja de Ítems: ' + errPrincipal.message)
        return
      }

      const ids = (ingresos ?? []).map((i: any) => i.id)
      const { mapa: contencionesMap, error: errContenciones } = await fetchContencionesPorIngreso(ids)
      if (errContenciones) {
        // Aquí sí se sigue mostrando la hoja (los ítems son correctos),
        // pero avisando de que la contención podría no estarlo — antes
        // un fallo aquí hacía que todo el mundo pareciera "sin
        // contención pautada", que no es lo mismo que "no se pudo
        // comprobar".
        setError('Los ítems se han cargado, pero no se pudo comprobar la contención: ' + errContenciones)
      } else {
        setError('')
      }

      setData(
        (ingresos ?? []).map((i: any) => ({
          ...i,
          items: Array.isArray(i.items) ? (i.items[0] ?? null) : (i.items ?? null),
          contencion: contencionesMap[i.id],
        })) as IngresoConItems[]
      )
    } finally {
      setLoading(false)
      setRefreshing(false)
    }
  }

  useEffect(() => {
    fetchData()
    fetchFechas()
  }, [])

  // Igual que en Inicio: si se deja esta pestaña abierta un buen rato
  // y otra persona cambia algo, al volver se actualiza sola. Se omite
  // mientras hay un panel abierto — no por riesgo de perder el
  // cambio (el guardado en curso termina igual en segundo plano),
  // sino para no mover la pantalla de golpe mientras alguien está
  // mirando o editando a un paciente en concreto.
  useEffect(() => {
    function alVolver() {
      if (document.visibilityState === 'visible' && !selected) fetchData()
    }
    function alEnfocar() {
      if (!selected) fetchData()
    }
    window.addEventListener('focus', alEnfocar)
    document.addEventListener('visibilitychange', alVolver)
    return () => {
      window.removeEventListener('focus', alEnfocar)
      document.removeEventListener('visibilitychange', alVolver)
    }
  }, [selected])

  function handleSaved(ingresoId: string, updated: ItemsPaciente) {
    setData((prev) => prev.map((i) => (i.id === ingresoId ? { ...i, items: updated } : i)))
    setSelected((prev) => (prev?.id === ingresoId ? { ...prev, items: updated } : prev))
  }

  function handleContencionChanged(ingresoId: string, nueva: { dia: ContencionDia | null; noche: ContencionNoche[] | null }) {
    setData((prev) => prev.map((i) => (i.id === ingresoId ? { ...i, contencion: nueva } : i)))
    setSelected((prev) => (prev?.id === ingresoId ? { ...prev, contencion: nueva } : prev))
  }

  function handleHabitacionChange(ingresoId: string, nuevaHab: number) {
    setData((prev) => prev.map((i) => (i.id === ingresoId ? { ...i, habitacion: nuevaHab } : i)))
    setSelected((prev) => (prev?.id === ingresoId ? { ...prev, habitacion: nuevaHab } : prev))
  }

  const habs1_16 = useMemo(() => data.filter((i) => i.habitacion && i.habitacion <= 16), [data])
  const habs17_max = useMemo(() => data.filter((i) => i.habitacion && i.habitacion > 16), [data])
  const maxHab = useMemo(() => Math.max(33, ...data.map((i) => i.habitacion ?? 0)), [data])

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
            onClick={fetchData}
            disabled={refreshing}
            title="Actualizar"
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-slate-200 text-slate-500 hover:bg-slate-50 text-sm font-medium disabled:opacity-60"
          >
            <RefreshCw className={`w-4 h-4 ${refreshing ? 'animate-spin' : ''}`} />
          </button>
          <button
            onClick={() => {
              setVerHistorico((v) => !v)
              if (!verHistorico) {
                if (fechasSnapshot.length > 0) cargarSnapshot(fechasSnapshot[0])
                if (pacientesConHistorial.length === 0) fetchPacientesConHistorial()
              }
            }}
            className={`btn-secondary ${verHistorico ? 'bg-slate-100' : ''}`}
          >
            <History className="w-4 h-4" />
            {verHistorico ? 'Ver hoy' : 'Histórico'}
          </button>
          {/* Antes este botón imprimía siempre la hoja de HOY, incluso
              estando dentro de la vista de histórico — parecía que
              imprimía lo que se estaba viendo, y no era así. Se
              oculta mientras se consulta el histórico; cada modo
              tiene ahora su propio botón de imprimir, sin ambigüedad. */}
          {!verHistorico && (
            <button onClick={() => printHoja(data, today)} className="btn-secondary">
              <Printer className="w-4 h-4" />
              Imprimir
            </button>
          )}
        </div>
      </div>

      {error && (
        <div className="mb-4 bg-red-50 border border-red-200 text-red-700 text-sm rounded-lg px-4 py-3 flex items-center justify-between gap-3">
          <span>{error}</span>
          <button onClick={fetchData} className="btn-secondary text-xs shrink-0">Reintentar</button>
        </div>
      )}

      {/* Vista histórico */}
      {verHistorico ? (
        <div className="space-y-4">
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
                        weekday: 'long', day: 'numeric', month: 'long', year: 'numeric',
                      })}
                  </span>
                  {snapshotData.length > 0 && (
                    <button
                      onClick={() => {
                        const fechaLabel = new Date(fechaSeleccionada).toLocaleDateString('es-ES', {
                          weekday: 'long', day: 'numeric', month: 'long', year: 'numeric',
                        })
                        printHoja(snapshotToIngresos(snapshotData), fechaLabel)
                      }}
                      className="btn-secondary ml-auto"
                    >
                      <Printer className="w-4 h-4" />
                      Imprimir este día
                    </button>
                  )}
                </div>
                {loadingSnapshot ? (
                  <div className="text-slate-400 text-sm py-8 text-center">Cargando…</div>
                ) : snapshotData.length === 0 ? (
                  <div className="card p-8 text-center text-slate-400 text-sm">Sin datos para esta fecha.</div>
                ) : (
                  (() => {
                    const converted = snapshotToIngresos(snapshotData)
                    const habs1 = converted.filter((i) => i.habitacion && i.habitacion <= 16)
                    const habs2 = converted.filter((i) => i.habitacion && i.habitacion > 16)
                    const maxHabSnapshot = Math.max(33, ...converted.map((i) => i.habitacion ?? 0))
                    return (
                      <>
                        <Bloque habs={habs1} offset={0} count={16} onSelect={() => {}} selectedId={null} readOnly />
                        <Bloque habs={habs2} offset={16} count={maxHabSnapshot - 16} onSelect={() => {}} selectedId={null} readOnly />
                      </>
                    )
                  })()
                )}
              </>
            ))}

          {/* MODO PACIENTE */}
          {modoHistorico === 'paciente' && (
            <div className="space-y-4">
              <div className="max-w-sm">
                <select
                  className="input"
                  value={pacienteSeleccionadoHist?.id ?? ''}
                  onChange={(e) => { if (e.target.value) cargarHistorialPaciente(e.target.value) }}
                >
                  <option value="">— Elige un paciente —</option>
                  {pacientesConHistorial.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.primer_apellido} {p.segundo_apellido ?? ''}, {p.nombre}
                    </option>
                  ))}
                </select>
                {pacientesConHistorial.length === 0 && (
                  <p className="text-xs text-slate-400 mt-1">Ningún paciente tiene todavía histórico registrado.</p>
                )}
              </div>

              {pacienteSeleccionadoHist &&
                (loadingHistorial ? (
                  <div className="text-slate-400 text-sm py-8 text-center">Cargando historial…</div>
                ) : historialPaciente.length === 0 ? (
                  <div className="card p-8 text-center text-slate-400 text-sm">
                    Sin histórico de ítems para {pacienteSeleccionadoHist.primer_apellido}, {pacienteSeleccionadoHist.nombre}.
                  </div>
                ) : (
                  <div className="space-y-3">
                    <p className="text-sm font-semibold text-slate-700">
                      {pacienteSeleccionadoHist.primer_apellido}, {pacienteSeleccionadoHist.nombre}
                      <span className="font-normal text-slate-400 ml-2">· {historialPaciente.length} registros</span>
                    </p>
                    {/* Antes solo se mostraban 8 de más de 25 campos
                        registrados. Con tantas columnas, hace falta
                        desplazamiento horizontal — sin él, se habrían
                        aplastado igual que le pasaba a la rejilla
                        principal con el panel abierto. */}
                    <div className="card overflow-x-auto">
                      <table className="text-xs" style={{ minWidth: `${140 + FILAS_PLANAS.length * 90}px` }}>
                        <thead>
                          <tr className="border-b bg-slate-50">
                            <th className="px-3 py-2 text-left font-semibold text-slate-500 sticky left-0 bg-slate-50">Fecha</th>
                            <th className="px-3 py-2 text-left font-semibold text-slate-500">Hab.</th>
                            {FILAS_PLANAS.map((f) => (
                              <th key={f.key} className="px-3 py-2 text-left font-semibold text-slate-500 whitespace-nowrap">{f.label}</th>
                            ))}
                          </tr>
                        </thead>
                        <tbody className="divide-y">
                          {historialPaciente.map((h: any, idx: number) => {
                            const it = h.datos ?? {}
                            const prev = historialPaciente[idx + 1]?.datos ?? {}
                            // La habitación del snapshot, no la actual del
                            // ingreso — si hubo un traslado interno después,
                            // "la actual" mentiría sobre dónde estaba ese día.
                            const habDelDia = it._habitacion_snapshot ?? h.ingreso?.habitacion ?? '—'
                            const iSintetico = { contencion: { dia: it._contencion_dia ?? null, noche: it._contencion_noche ?? null } } as any
                            const esUltimo = idx === historialPaciente.length - 1
                            return (
                              <tr key={`${h.ingreso_id}-${h.fecha}`} className="hover:bg-slate-50">
                                <td className="px-3 py-2 font-medium text-slate-800 whitespace-nowrap sticky left-0 bg-white">
                                  {new Date(h.fecha).toLocaleDateString('es-ES', { day: 'numeric', month: 'short', year: 'numeric' })}
                                </td>
                                <td className="px-3 py-2 text-slate-500">{habDelDia}</td>
                                {FILAS_PLANAS.map((f) => {
                                  // Los snapshots de antes de este arreglo no
                                  // tienen estas dos claves en absoluto —
                                  // "vacío" en esos días no significa "sin
                                  // contención pautada", significa "nunca se
                                  // llegó a guardar". Hay que distinguirlo,
                                  // o parecería que nadie tuvo contención
                                  // nunca antes de hoy.
                                  const esCampoContencion = f.key === 'cont_dia' || f.key === 'cont_noche' || f.key === 'sensor'
                                  const noDisponible = esCampoContencion && !('_contencion_dia' in it)
                                  const valor = noDisponible ? 'No disponible' : f.get(it, iSintetico) || '—'
                                  const cambio = !esUltimo && JSON.stringify(it[f.key]) !== JSON.stringify(prev[f.key])
                                  return (
                                    <td key={f.key} className={`px-3 py-2 whitespace-nowrap ${
                                      noDisponible ? 'text-slate-300 italic' : cambio ? 'font-semibold text-primary-700' : 'text-slate-600'
                                    }`}>
                                      {valor}
                                    </td>
                                  )
                                })}
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
