import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { X, Pencil, Trash2, Download } from 'lucide-react'
import FormularioEvento from '../components/FormularioEvento'
import {
  TIPO_EVENTO_LABEL, TIPO_EVENTO_COLOR,
  TURNO_LABEL, CAMPOS_POR_TIPO,
  type TipoEvento, type Evento,
} from '../types/eventos'

// ─── CONSTANTES ────────────────────────────────────────────────

const TIPOS_ORDEN: TipoEvento[] = [
  'caida', 'ulcera', 'contencion_fisica', 'agresividad_fisica',
  'fuga', 'infeccion_nosocomial', 'error_medicacion', 'efecto_adverso_medicacion',
]

// ─── PÁGINA PRINCIPAL ─────────────────────────────────────────

export function Eventos() {
  const navigate = useNavigate()

  // ── Estado listado ────────────────────────────────────────
  const [loadingLista, setLoadingLista] = useState(true)
  const [eventosLista, setEventosLista] = useState<any[]>([])
  const [filtroTipo, setFiltroTipo] = useState('')
  const [filtroDesde, setFiltroDesde] = useState('')
  const [filtroHasta, setFiltroHasta] = useState('')
  const [filtroPaciente, setFiltroPaciente] = useState('')
  const [modalEvento, setModalEvento] = useState<Evento | null>(null)
  const [editandoEvento, setEditandoEvento] = useState<Evento | null>(null)

  // ── Fetch listado ─────────────────────────────────────────
  useEffect(() => {
    fetchLista()
  }, [filtroTipo, filtroDesde, filtroHasta])

  async function fetchLista() {
    setLoadingLista(true)
    let query = supabase
      .from('eventos')
      .select('*, registrado_por:profesionales(nombre,apellidos), ingreso:ingresos(habitacion, paciente:pacientes(nombre,primer_apellido))')
      .order('fecha', { ascending: false })
      .order('created_at', { ascending: false })
    if (filtroTipo)  query = query.eq('tipo', filtroTipo)
    if (filtroDesde) query = query.gte('fecha', filtroDesde)
    if (filtroHasta) query = query.lte('fecha', filtroHasta)
    const { data } = await query
    let list = data ?? []
    if (filtroPaciente.trim()) {
      const q = filtroPaciente.toLowerCase()
      list = list.filter((ev: any) => {
        const p = ev.ingreso?.paciente
        return p && `${p.primer_apellido} ${p.nombre}`.toLowerCase().includes(q)
      })
    }
    setEventosLista(list)
    setLoadingLista(false)
  }

  function handleBuscar() { setLoadingLista(true); fetchLista() }

  async function eliminarEvento(id: string) {
    if (!confirm('¿Eliminar esta incidencia? Esta acción no se puede deshacer.')) return
    await supabase.from('eventos').delete().eq('id', id)
    setModalEvento(null)
    fetchLista()
  }

  // Exportación CSV del listado actual
  function exportarCSV() {
    const ESTADO_LABEL: Record<string, string> = {
      manana: 'Mañana', tarde: 'Tarde', noche: 'Noche',
    }
    const filas = eventosLista.map((ev: any) => {
      const p = ev.ingreso?.paciente
      const paciente = p ? `${p.primer_apellido}, ${p.nombre}` : ''
      const campos = CAMPOS_POR_TIPO[ev.tipo as TipoEvento] ?? []
      const datosStr = campos
        .map(c => `${c.label}: ${ev.datos?.[c.key] ?? ''}`)
        .join(' | ')
      return [
        ev.fecha,
        ev.hora?.slice(0, 5) ?? '',
        ev.turno ? (ESTADO_LABEL[ev.turno] ?? ev.turno) : '',
        TIPO_EVENTO_LABEL[ev.tipo as TipoEvento] ?? ev.tipo,
        paciente,
        ev.ingreso?.habitacion ?? '',
        datosStr,
        ev.notas ?? '',
        ev.registrado_por ? `${ev.registrado_por.nombre} ${ev.registrado_por.apellidos}` : '',
      ].map(v => `"${String(v).replace(/"/g, '""')}"`).join(',')
    })
    const cabecera = ['Fecha', 'Hora', 'Turno', 'Tipo', 'Paciente', 'Habitación', 'Datos específicos', 'Notas', 'Registrado por']
      .map(v => `"${v}"`).join(',')
    const csv = '\uFEFF' + [cabecera, ...filas].join('\r\n')
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `eventos_${new Date().toISOString().split('T')[0]}.csv`
    a.click()
    URL.revokeObjectURL(url)
  }

  // ── Render ────────────────────────────────────────────────

  return (
    <div className="p-6 space-y-6">

      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-800">Incidencias</h1>
          <p className="text-sm text-slate-400 mt-0.5">Registro de incidencias y seguridad del paciente</p>
        </div>
      </div>

      {/* ── BLOQUE LISTADO ── */}
      <section>
        <div className="flex items-center justify-between mb-0">
          <p className="section-title mb-0">Registro de incidencias</p>
          <button onClick={exportarCSV} disabled={eventosLista.length === 0}
            className="btn-secondary text-xs py-1.5 gap-1.5 disabled:opacity-40 disabled:cursor-not-allowed">
            <Download className="w-3.5 h-3.5" />
            Exportar CSV ({eventosLista.length})
          </button>
        </div>

        {/* Filtros */}
        <div className="card p-4 mb-4">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <div>
              <label className="label">Tipo</label>
              <select className="input" value={filtroTipo} onChange={e => setFiltroTipo(e.target.value)}>
                <option value="">Todos</option>
                {TIPOS_ORDEN.map(k => (
                  <option key={k} value={k}>{TIPO_EVENTO_LABEL[k]}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="label">Paciente</label>
              <input className="input" placeholder="Buscar por apellido…" value={filtroPaciente}
                onChange={e => setFiltroPaciente(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && handleBuscar()} />
            </div>
            <div>
              <label className="label">Desde</label>
              <input type="date" className="input" value={filtroDesde} onChange={e => setFiltroDesde(e.target.value)} />
            </div>
            <div>
              <label className="label">Hasta</label>
              <input type="date" className="input" value={filtroHasta} onChange={e => setFiltroHasta(e.target.value)} />
            </div>
          </div>
          <div className="flex justify-between items-center mt-3">
            <p className="text-xs text-slate-400">{eventosLista.length} resultado{eventosLista.length !== 1 ? 's' : ''}</p>
            <div className="flex gap-2">
              <button onClick={() => { setFiltroTipo(''); setFiltroDesde(''); setFiltroHasta(''); setFiltroPaciente('') }}
                className="btn-secondary text-xs py-1.5">
                Limpiar
              </button>
              <button onClick={handleBuscar} className="btn-primary text-xs py-1.5">
                Buscar
              </button>
            </div>
          </div>
        </div>

        {/* Lista */}
        {loadingLista ? (
          <div className="text-slate-400 text-center py-10">Cargando…</div>
        ) : eventosLista.length === 0 ? (
          <div className="card p-10 text-center text-slate-400 text-sm">No hay incidencias con estos filtros.</div>
        ) : (
          <div className="space-y-2">
            {eventosLista.map((ev: any) => {
              const p = ev.ingreso?.paciente
              const hab = ev.ingreso?.habitacion
              const colorClass = TIPO_EVENTO_COLOR[ev.tipo as TipoEvento] ?? 'bg-slate-100 text-slate-600'
              return (
                <div key={ev.id}
                  className="card p-4 cursor-pointer hover:shadow-md transition-shadow"
                  onClick={() => setModalEvento(ev)}>
                  <div className="flex items-start gap-3">
                    <span className={`px-2 py-0.5 rounded-full text-xs font-semibold shrink-0 mt-0.5 ${colorClass}`}>
                      {TIPO_EVENTO_LABEL[ev.tipo as TipoEvento] ?? ev.tipo}
                    </span>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-medium text-sm text-slate-800">
                          {p ? `${p.primer_apellido}, ${p.nombre}` : '—'}
                        </span>
                        {hab && <span className="text-xs text-slate-400">Hab. {hab}</span>}
                      </div>
                      {Object.entries(ev.datos ?? {}).length > 0 && (
                        <div className="flex flex-wrap gap-x-4 gap-y-0.5 mt-1">
                          {Object.entries(ev.datos).map(([k, v]: any) => {
                            const campo = CAMPOS_POR_TIPO[ev.tipo as TipoEvento]?.find(c => c.key === k)
                            return (
                              <span key={k} className="text-xs text-slate-500">
                                <span className="capitalize">{campo?.label ?? k.replace(/_/g, ' ')}: </span>
                                <span className="font-medium text-slate-700">{v}</span>
                              </span>
                            )
                          })}
                        </div>
                      )}
                      {ev.notas && (
                        <p className="text-xs text-slate-500 italic mt-1 truncate">{ev.notas}</p>
                      )}
                    </div>
                    <div className="text-right shrink-0">
                      <p className="text-xs font-medium text-slate-600">
                        {new Date(ev.fecha).toLocaleDateString('es-ES')}
                        {ev.hora && ` · ${ev.hora.slice(0, 5)}`}
                      </p>
                      {ev.turno && (
                        <p className="text-xs text-slate-400">{TURNO_LABEL[ev.turno] ?? ev.turno}</p>
                      )}
                      {ev.registrado_por && (
                        <p className="text-xs text-slate-400 mt-1">
                          {ev.registrado_por.nombre} {ev.registrado_por.apellidos}
                        </p>
                      )}
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </section>

      {/* Modal detalle evento */}
      {modalEvento && !editandoEvento && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4"
          onClick={() => setModalEvento(null)}>
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md p-6"
            onClick={e => e.stopPropagation()}>
            <div className="flex justify-between items-start mb-4">
              <span className={`px-2 py-0.5 rounded-full text-xs font-semibold ${TIPO_EVENTO_COLOR[modalEvento.tipo] ?? 'bg-slate-100'}`}>
                {TIPO_EVENTO_LABEL[modalEvento.tipo] ?? modalEvento.tipo}
              </span>
              <button onClick={() => setModalEvento(null)} className="text-slate-400 hover:text-slate-600">
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="space-y-2 text-sm mb-5">
              {modalEvento.ingreso?.paciente && (
                <p>
                  <span className="font-medium">Paciente: </span>
                  <button
                    onClick={() => navigate(`/ingresos/${modalEvento.ingreso_id}`)}
                    className="text-primary-600 hover:underline">
                    {modalEvento.ingreso.paciente.primer_apellido}, {modalEvento.ingreso.paciente.nombre}
                  </button>
                </p>
              )}
              <p>
                <span className="font-medium">Fecha: </span>
                {new Date(modalEvento.fecha).toLocaleDateString('es-ES')}
                {modalEvento.hora && ` · ${modalEvento.hora.slice(0, 5)}`}
                {modalEvento.turno && ` · Turno ${TURNO_LABEL[modalEvento.turno] ?? modalEvento.turno}`}
              </p>
              {Object.entries(modalEvento.datos ?? {}).map(([k, v]: any) => {
                const campo = CAMPOS_POR_TIPO[modalEvento.tipo]?.find(c => c.key === k)
                return (
                  <p key={k}>
                    <span className="font-medium capitalize">{campo?.label ?? k.replace(/_/g, ' ')}: </span>{v}
                  </p>
                )
              })}
              {modalEvento.notas && (
                <p><span className="font-medium">Notas: </span>{modalEvento.notas}</p>
              )}
              {modalEvento.registrado_por && (
                <p className="text-slate-400 text-xs pt-2 border-t">
                  Registrado por {modalEvento.registrado_por.nombre} {modalEvento.registrado_por.apellidos}
                </p>
              )}
            </div>
            <div className="flex gap-2 pt-4 border-t">
              <button onClick={() => eliminarEvento(modalEvento.id)} className="btn-danger">
                <Trash2 className="w-4 h-4" /> Eliminar
              </button>
              <div className="flex-1" />
              <button onClick={() => setModalEvento(null)} className="btn-secondary">Cerrar</button>
              <button onClick={() => setEditandoEvento(modalEvento)} className="btn-primary">
                <Pencil className="w-4 h-4" /> Editar
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal edición */}
      {editandoEvento && (
        <FormularioEvento
          ingresoId={editandoEvento.ingreso_id}
          eventoExistente={editandoEvento}
          onClose={() => setEditandoEvento(null)}
          onGuardado={() => {
            setEditandoEvento(null)
            setModalEvento(null)
            fetchLista()
          }}
        />
      )}
    </div>
  )
}
