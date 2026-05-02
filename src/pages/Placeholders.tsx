import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import type { Profesional, Rol } from '../types'
import { Plus, Pencil, X, Save, UserCheck, UserX } from 'lucide-react'

export function Eventos() {
  const [eventos, setEventos] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [filtroTipo, setFiltroTipo] = useState('')
  const [filtroDesde, setFiltroDesde] = useState('')
  const [filtroHasta, setFiltroHasta] = useState('')
  const [filtroPaciente, setFiltroPaciente] = useState('')
  const [modalEvento, setModalEvento] = useState<any>(null)

  const TIPOS: Record<string,string> = {
    caida:'Caída', ulcera:'Úlcera', error_medicacion:'Error medicación',
    efecto_adverso_medicacion:'Efecto adverso', infeccion_nosocomial:'Infección nosocomial',
    contencion_fisica:'Contención física', agresividad_fisica:'Agresividad física', fuga:'Fuga',
  }
  const TIPO_COLOR: Record<string,string> = {
    caida:'bg-orange-100 text-orange-700', ulcera:'bg-red-100 text-red-700',
    error_medicacion:'bg-purple-100 text-purple-700', efecto_adverso_medicacion:'bg-pink-100 text-pink-700',
    infeccion_nosocomial:'bg-yellow-100 text-yellow-700', contencion_fisica:'bg-blue-100 text-blue-700',
    agresividad_fisica:'bg-rose-100 text-rose-700', fuga:'bg-slate-100 text-slate-700',
  }
  const TURNO: Record<string,string> = { manana:'Mañana', tarde:'Tarde', noche:'Noche' }

  async function fetchEventos() {
    let query = supabase
      .from('eventos')
      .select('*, registrado_por:profesionales(nombre,apellidos), ingreso:ingresos(habitacion, paciente:pacientes(nombre,primer_apellido))')
      .order('fecha', { ascending: false })
      .order('created_at', { ascending: false })
    if (filtroTipo) query = query.eq('tipo', filtroTipo)
    if (filtroDesde) query = query.gte('fecha', filtroDesde)
    if (filtroHasta) query = query.lte('fecha', filtroHasta)
    const { data } = await query
    let list = data ?? []
    if (filtroPaciente.trim()) {
      const q = filtroPaciente.toLowerCase()
      list = list.filter((ev: any) => {
        const p = ev.ingreso?.paciente
        if (!p) return false
        return `${p.primer_apellido} ${p.nombre}`.toLowerCase().includes(q)
      })
    }
    setEventos(list)
    setLoading(false)
  }

  useEffect(() => { fetchEventos() }, [filtroTipo, filtroDesde, filtroHasta])

  function handleBuscar() { setLoading(true); fetchEventos() }

  return (
    <div className="p-6">
      <div className="mb-5">
        <h1 className="text-2xl font-bold text-slate-800">Eventos</h1>
        <p className="text-sm text-slate-400 mt-0.5">Registro global de incidencias</p>
      </div>

      {/* Filtros */}
      <div className="card p-4 mb-5">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <div>
            <label className="label">Tipo</label>
            <select className="input" value={filtroTipo} onChange={e=>setFiltroTipo(e.target.value)}>
              <option value="">Todos</option>
              {Object.entries(TIPOS).map(([k,v])=><option key={k} value={k}>{v}</option>)}
            </select>
          </div>
          <div>
            <label className="label">Paciente</label>
            <input className="input" placeholder="Buscar por apellido…" value={filtroPaciente}
              onChange={e=>setFiltroPaciente(e.target.value)}
              onKeyDown={e=>e.key==='Enter'&&handleBuscar()} />
          </div>
          <div>
            <label className="label">Desde</label>
            <input type="date" className="input" value={filtroDesde} onChange={e=>setFiltroDesde(e.target.value)} />
          </div>
          <div>
            <label className="label">Hasta</label>
            <input type="date" className="input" value={filtroHasta} onChange={e=>setFiltroHasta(e.target.value)} />
          </div>
        </div>
        <div className="flex justify-between items-center mt-3">
          <p className="text-xs text-slate-400">{eventos.length} resultado{eventos.length!==1?'s':''}</p>
          <div className="flex gap-2">
            <button onClick={()=>{setFiltroTipo('');setFiltroDesde('');setFiltroHasta('');setFiltroPaciente('')}} className="btn-secondary text-xs py-1.5">
              Limpiar
            </button>
            <button onClick={handleBuscar} className="btn-primary text-xs py-1.5">
              Buscar
            </button>
          </div>
        </div>
      </div>

      {/* Lista */}
      {loading ? (
        <div className="text-slate-400 text-center py-10">Cargando…</div>
      ) : eventos.length === 0 ? (
        <div className="card p-10 text-center text-slate-400 text-sm">No hay eventos con estos filtros.</div>
      ) : (
        <div className="space-y-2">
          {eventos.map((ev:any) => {
            const p = ev.ingreso?.paciente
            const hab = ev.ingreso?.habitacion
            return (
              <div key={ev.id} className="card p-4 cursor-pointer hover:shadow-md transition-shadow"
                onClick={()=>setModalEvento(ev)}>
                <div className="flex items-start gap-3">
                  <span className={`px-2 py-0.5 rounded-full text-xs font-semibold shrink-0 mt-0.5 ${TIPO_COLOR[ev.tipo]??'bg-slate-100 text-slate-600'}`}>
                    {TIPOS[ev.tipo]??ev.tipo}
                  </span>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-medium text-sm text-slate-800">
                        {p?`${p.primer_apellido}, ${p.nombre}`:'—'}
                      </span>
                      {hab&&<span className="text-xs text-slate-400">Hab. {hab}</span>}
                    </div>
                    {Object.entries(ev.datos??{}).length>0&&(
                      <div className="flex flex-wrap gap-x-4 gap-y-0.5 mt-1">
                        {Object.entries(ev.datos).map(([k,v]:any)=>(
                          <span key={k} className="text-xs text-slate-500">
                            <span className="capitalize">{k.replace(/_/g,' ')}: </span>
                            <span className="font-medium text-slate-700">{v}</span>
                          </span>
                        ))}
                      </div>
                    )}
                    {ev.notas&&<p className="text-xs text-slate-500 italic mt-1 truncate">{ev.notas}</p>}
                  </div>
                  <div className="text-right shrink-0">
                    <p className="text-xs font-medium text-slate-600">
                      {new Date(ev.fecha).toLocaleDateString('es-ES')}
                      {ev.hora&&` · ${ev.hora.slice(0,5)}`}
                    </p>
                    {ev.turno&&<p className="text-xs text-slate-400">{TURNO[ev.turno]??ev.turno}</p>}
                    {ev.registrado_por&&(
                      <p className="text-xs text-slate-400 mt-1">{ev.registrado_por.nombre} {ev.registrado_por.apellidos}</p>
                    )}
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      )}

      {/* Modal detalle */}
      {modalEvento&&(
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4"
          onClick={()=>setModalEvento(null)}>
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md p-6" onClick={e=>e.stopPropagation()}>
            <div className="flex justify-between items-start mb-4">
              <span className={`px-2 py-0.5 rounded-full text-xs font-semibold ${TIPO_COLOR[modalEvento.tipo]??'bg-slate-100'}`}>
                {TIPOS[modalEvento.tipo]??modalEvento.tipo}
              </span>
              <button onClick={()=>setModalEvento(null)} className="text-slate-400 hover:text-slate-600">
                <X className="w-4 h-4"/>
              </button>
            </div>
            <div className="space-y-2 text-sm">
              <p><span className="font-medium">Paciente: </span>{modalEvento.ingreso?.paciente?.primer_apellido}, {modalEvento.ingreso?.paciente?.nombre}</p>
              <p><span className="font-medium">Fecha: </span>{new Date(modalEvento.fecha).toLocaleDateString('es-ES')}{modalEvento.hora&&` · ${modalEvento.hora.slice(0,5)}`}{modalEvento.turno&&` · Turno ${TURNO[modalEvento.turno]}`}</p>
              {Object.entries(modalEvento.datos??{}).map(([k,v]:any)=>(
                <p key={k}><span className="font-medium capitalize">{k.replace(/_/g,' ')}: </span>{v}</p>
              ))}
              {modalEvento.notas&&<p><span className="font-medium">Notas: </span>{modalEvento.notas}</p>}
              {modalEvento.registrado_por&&<p className="text-slate-400 text-xs pt-2 border-t">Registrado por {modalEvento.registrado_por.nombre} {modalEvento.registrado_por.apellidos}</p>}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

export function Dashboard() {
  return (
    <div className="p-8">
      <h1 className="text-2xl font-bold text-slate-800 mb-2">Dashboard</h1>
      <p className="text-slate-400 text-sm">Cuadro de mandos — próximamente</p>
    </div>
  )
}

// ─── CONFIGURACIÓN ────────────────────────────────────────────

const ROL_LABEL: Record<Rol, string> = {
  medico: 'Médico',
  enfermeria: 'Enfermería',
  auxiliar: 'Auxiliar de enfermería',
  administrativo: 'Administrativo',
  tecnico: 'Técnico',
}

const ROL_COLOR: Record<Rol, string> = {
  medico: 'bg-primary-50 text-primary-700',
  enfermeria: 'bg-emerald-50 text-emerald-700',
  auxiliar: 'bg-teal-50 text-teal-700',
  administrativo: 'bg-slate-100 text-slate-600',
  tecnico: 'bg-violet-50 text-violet-700',
}

const PROFESIONAL_VACIO = {
  nombre: '', apellidos: '', rol: 'enfermeria' as Rol, activo: true,
}

export function Configuracion() {
  const [profesionales, setProfesionales] = useState<Profesional[]>([])
  const [loading, setLoading] = useState(true)
  const [modal, setModal] = useState(false)
  const [editando, setEditando] = useState<Profesional | null>(null)
  const [form, setForm] = useState({ ...PROFESIONAL_VACIO })
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [filtroRol, setFiltroRol] = useState<Rol | 'todos'>('todos')
  const [filtroActivo, setFiltroActivo] = useState<'activos' | 'todos'>('activos')

  async function fetch() {
    const { data } = await supabase
      .from('profesionales')
      .select('*')
      .order('apellidos')
      .order('nombre')
    setProfesionales(data ?? [])
    setLoading(false)
  }

  useEffect(() => { fetch() }, [])

  function abrirNuevo() {
    setEditando(null)
    setForm({ ...PROFESIONAL_VACIO })
    setError('')
    setModal(true)
  }

  function abrirEditar(p: Profesional) {
    setEditando(p)
    setForm({ nombre: p.nombre, apellidos: p.apellidos, rol: p.rol, activo: p.activo })
    setError('')
    setModal(true)
  }

  function cerrar() {
    setModal(false)
    setEditando(null)
    setError('')
  }

  async function guardar() {
    setError('')
    if (!form.nombre.trim()) { setError('El nombre es obligatorio.'); return }
    if (!form.rol) { setError('El rol es obligatorio.'); return }
    setSaving(true)
    if (editando) {
      await supabase.from('profesionales').update(form).eq('id', editando.id)
    } else {
      await supabase.from('profesionales').insert([form])
    }
    setSaving(false)
    cerrar()
    fetch()
  }

  async function toggleActivo(p: Profesional) {
    await supabase.from('profesionales').update({ activo: !p.activo }).eq('id', p.id)
    fetch()
  }

  const filtrados = profesionales.filter(p => {
    if (filtroActivo === 'activos' && !p.activo) return false
    if (filtroRol !== 'todos' && p.rol !== filtroRol) return false
    return true
  })

  const porRol = (rol: Rol) => profesionales.filter(p => p.activo && p.rol === rol).length

  return (
    <div className="p-8 max-w-4xl">
      <div className="mb-7">
        <h1 className="text-2xl font-bold text-slate-800">Configuración</h1>
        <p className="text-sm text-slate-400 mt-0.5">Gestión de profesionales de la unidad</p>
      </div>

      {/* Resumen por rol */}
      <div className="grid grid-cols-5 gap-3 mb-7">
        {(Object.keys(ROL_LABEL) as Rol[]).map(rol => (
          <div key={rol} className="card p-4 text-center">
            <p className="text-2xl font-bold text-slate-800">{porRol(rol)}</p>
            <p className="text-xs text-slate-500 mt-0.5">{ROL_LABEL[rol]}</p>
          </div>
        ))}
      </div>

      {/* Filtros + botón nuevo */}
      <div className="flex items-center gap-3 mb-4 flex-wrap">
        <div className="flex gap-1">
          {(['todos', ...Object.keys(ROL_LABEL)] as (Rol | 'todos')[]).map(r => (
            <button key={r}
              onClick={() => setFiltroRol(r)}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                filtroRol === r
                  ? 'bg-primary-600 text-white'
                  : 'bg-white border text-slate-500 hover:bg-slate-50'
              }`}>
              {r === 'todos' ? 'Todos' : ROL_LABEL[r as Rol]}
            </button>
          ))}
        </div>
        <button
          onClick={() => setFiltroActivo(f => f === 'activos' ? 'todos' : 'activos')}
          className={`px-3 py-1.5 rounded-lg text-xs font-medium border transition-colors ${
            filtroActivo === 'todos' ? 'bg-slate-100 text-slate-600' : 'bg-white text-slate-500 hover:bg-slate-50'
          }`}>
          {filtroActivo === 'activos' ? 'Mostrando activos' : 'Mostrando todos'}
        </button>
        <div className="flex-1" />
        <button onClick={abrirNuevo} className="btn-primary">
          <Plus className="w-4 h-4" />
          Nuevo profesional
        </button>
      </div>

      {/* Tabla */}
      <div className="card overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b bg-slate-50">
              <th className="px-4 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-wide">Nombre</th>
              <th className="px-4 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-wide">Rol</th>
              <th className="px-4 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-wide">Estado</th>
              <th className="px-4 py-3 w-24"></th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {loading ? (
              <tr><td colSpan={4} className="px-4 py-10 text-center text-slate-400">Cargando…</td></tr>
            ) : filtrados.length === 0 ? (
              <tr><td colSpan={4} className="px-4 py-10 text-center text-slate-400">No hay profesionales</td></tr>
            ) : filtrados.map(p => (
              <tr key={p.id} className={`hover:bg-slate-50 transition-colors ${!p.activo ? 'opacity-50' : ''}`}>
                <td className="px-4 py-3 font-medium text-slate-800">
                  {p.apellidos} {p.nombre}
                </td>
                <td className="px-4 py-3">
                  <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${ROL_COLOR[p.rol]}`}>
                    {ROL_LABEL[p.rol]}
                  </span>
                </td>
                <td className="px-4 py-3">
                  <span className={`text-xs font-medium ${p.activo ? 'text-emerald-600' : 'text-slate-400'}`}>
                    {p.activo ? 'Activo' : 'Inactivo'}
                  </span>
                </td>
                <td className="px-4 py-3">
                  <div className="flex gap-1 justify-end">
                    <button onClick={() => abrirEditar(p)}
                      className="p-1.5 text-slate-400 hover:text-primary-600 hover:bg-primary-50 rounded-lg transition-colors"
                      title="Editar">
                      <Pencil className="w-3.5 h-3.5" />
                    </button>
                    <button onClick={() => toggleActivo(p)}
                      className={`p-1.5 rounded-lg transition-colors ${
                        p.activo
                          ? 'text-slate-400 hover:text-amber-600 hover:bg-amber-50'
                          : 'text-slate-400 hover:text-emerald-600 hover:bg-emerald-50'
                      }`}
                      title={p.activo ? 'Dar de baja' : 'Reactivar'}>
                      {p.activo ? <UserX className="w-3.5 h-3.5" /> : <UserCheck className="w-3.5 h-3.5" />}
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Modal */}
      {modal && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md">
            <div className="flex items-center justify-between px-6 py-4 border-b">
              <h2 className="text-base font-bold text-slate-800">
                {editando ? 'Editar profesional' : 'Nuevo profesional'}
              </h2>
              <button onClick={cerrar} className="text-slate-400 hover:text-slate-600">
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="px-6 py-5 space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="label">Nombre *</label>
                  <input className="input" value={form.nombre}
                    onChange={e => setForm(f => ({ ...f, nombre: e.target.value }))} />
                </div>
                <div>
                  <label className="label">Apellidos</label>
                  <input className="input" value={form.apellidos}
                    onChange={e => setForm(f => ({ ...f, apellidos: e.target.value }))} />
                </div>
              </div>
              <div>
                <label className="label">Rol *</label>
                <select className="input" value={form.rol}
                  onChange={e => setForm(f => ({ ...f, rol: e.target.value as Rol }))}>
                  {(Object.entries(ROL_LABEL) as [Rol, string][]).map(([k, v]) => (
                    <option key={k} value={k}>{v}</option>
                  ))}
                </select>
              </div>
              <div className="flex items-center gap-2">
                <input type="checkbox" id="activo" className="w-4 h-4 rounded text-primary-600"
                  checked={form.activo}
                  onChange={e => setForm(f => ({ ...f, activo: e.target.checked }))} />
                <label htmlFor="activo" className="text-sm text-slate-700 cursor-pointer">Activo</label>
              </div>
              {error && (
                <div className="p-3 bg-red-50 border border-red-200 text-red-700 text-sm rounded-lg">{error}</div>
              )}
            </div>

            <div className="px-6 py-4 border-t flex justify-end gap-3">
              <button onClick={cerrar} className="btn-secondary">Cancelar</button>
              <button onClick={guardar} disabled={saving} className="btn-primary">
                <Save className="w-4 h-4" />
                {saving ? 'Guardando…' : 'Guardar'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
