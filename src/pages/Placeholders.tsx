import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import type { Profesional, Rol } from '../types'
import { Plus, Pencil, X, Save, UserCheck, UserX } from 'lucide-react'

// ─── CONFIGURACIÓN ────────────────────────────────────────────

const ROL_LABEL: Record<Rol, string> = {
  medico: 'Médico',
  enfermeria: 'Enfermería',
  auxiliar: 'Auxiliar de enfermería',
  tecnico: 'Técnico',
}

const ROL_COLOR: Record<Rol, string> = {
  medico: 'bg-primary-50 text-primary-700',
  enfermeria: 'bg-emerald-50 text-emerald-700',
  auxiliar: 'bg-teal-50 text-teal-700',
  tecnico: 'bg-violet-50 text-violet-700',
}

const PROFESIONAL_VACIO = {
  nombre: '',
  apellidos: '',
  rol: 'enfermeria' as Rol,
  activo: true,
  colegiado: '',
  especialidad: '',
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
    const { data } = await supabase.from('profesionales').select('*').order('apellidos').order('nombre')
    setProfesionales(data ?? [])
    setLoading(false)
  }

  useEffect(() => {
    fetch()
  }, [])

  function abrirNuevo() {
    setEditando(null)
    setForm({ ...PROFESIONAL_VACIO })
    setError('')
    setModal(true)
  }

  function abrirEditar(p: Profesional) {
    setEditando(p)
    setForm({ nombre: p.nombre, apellidos: p.apellidos, rol: p.rol, activo: p.activo, colegiado: p.colegiado ?? '', especialidad: p.especialidad ?? '' })
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
    if (!form.nombre.trim()) {
      setError('El nombre es obligatorio.')
      return
    }
    if (!form.rol) {
      setError('El rol es obligatorio.')
      return
    }
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

  const filtrados = profesionales.filter((p) => {
    if (filtroActivo === 'activos' && !p.activo) return false
    if (filtroRol !== 'todos' && p.rol !== filtroRol) return false
    return true
  })

  const porRol = (rol: Rol) => profesionales.filter((p) => p.activo && p.rol === rol).length

  return (
    <div className="p-8 max-w-4xl">
      <div className="mb-7">
        <h1 className="text-2xl font-bold text-slate-800">Configuración</h1>
        <p className="text-sm text-slate-400 mt-0.5">Gestión de profesionales de la unidad</p>
      </div>

      {/* Resumen por rol */}
      <div className="grid grid-cols-5 gap-3 mb-7">
        {(Object.keys(ROL_LABEL) as Rol[]).map((rol) => (
          <div key={rol} className="card p-4 text-center">
            <p className="text-2xl font-bold text-slate-800">{porRol(rol)}</p>
            <p className="text-xs text-slate-500 mt-0.5">{ROL_LABEL[rol]}</p>
          </div>
        ))}
      </div>

      {/* Filtros + botón nuevo */}
      <div className="flex items-center gap-3 mb-4 flex-wrap">
        <div className="flex gap-1">
          {(['todos', ...Object.keys(ROL_LABEL)] as (Rol | 'todos')[]).map((r) => (
            <button
              key={r}
              onClick={() => setFiltroRol(r)}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                filtroRol === r ? 'bg-primary-600 text-white' : 'bg-white border text-slate-500 hover:bg-slate-50'
              }`}
            >
              {r === 'todos' ? 'Todos' : ROL_LABEL[r as Rol]}
            </button>
          ))}
        </div>
        <button
          onClick={() => setFiltroActivo((f) => (f === 'activos' ? 'todos' : 'activos'))}
          className={`px-3 py-1.5 rounded-lg text-xs font-medium border transition-colors ${
            filtroActivo === 'todos' ? 'bg-slate-100 text-slate-600' : 'bg-white text-slate-500 hover:bg-slate-50'
          }`}
        >
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
              <th className="px-4 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-wide">
                Nombre
              </th>
              <th className="px-4 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-wide">Rol</th>
              <th className="px-4 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-wide">
                Estado
              </th>
              <th className="px-4 py-3 w-24"></th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {loading ? (
              <tr>
                <td colSpan={4} className="px-4 py-10 text-center text-slate-400">
                  Cargando…
                </td>
              </tr>
            ) : filtrados.length === 0 ? (
              <tr>
                <td colSpan={4} className="px-4 py-10 text-center text-slate-400">
                  No hay profesionales
                </td>
              </tr>
            ) : (
              filtrados.map((p) => (
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
                      <button
                        onClick={() => abrirEditar(p)}
                        className="p-1.5 text-slate-400 hover:text-primary-600 hover:bg-primary-50 rounded-lg transition-colors"
                        title="Editar"
                      >
                        <Pencil className="w-3.5 h-3.5" />
                      </button>
                      <button
                        onClick={() => toggleActivo(p)}
                        className={`p-1.5 rounded-lg transition-colors ${
                          p.activo
                            ? 'text-slate-400 hover:text-amber-600 hover:bg-amber-50'
                            : 'text-slate-400 hover:text-emerald-600 hover:bg-emerald-50'
                        }`}
                        title={p.activo ? 'Dar de baja' : 'Reactivar'}
                      >
                        {p.activo ? <UserX className="w-3.5 h-3.5" /> : <UserCheck className="w-3.5 h-3.5" />}
                      </button>
                    </div>
                  </td>
                </tr>
              ))
            )}
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
                  <input
                    className="input"
                    value={form.nombre}
                    onChange={(e) => setForm((f) => ({ ...f, nombre: e.target.value }))}
                  />
                </div>
                <div>
                  <label className="label">Apellidos</label>
                  <input
                    className="input"
                    value={form.apellidos}
                    onChange={(e) => setForm((f) => ({ ...f, apellidos: e.target.value }))}
                  />
                </div>
              </div>
              <div>
                <label className="label">Rol *</label>
                <select
                  className="input"
                  value={form.rol}
                  onChange={(e) => setForm((f) => ({ ...f, rol: e.target.value as Rol }))}
                >
                  {(Object.entries(ROL_LABEL) as [Rol, string][]).map(([k, v]) => (
                    <option key={k} value={k}>
                      {v}
                    </option>
                  ))}
                </select>
              </div>
              {/* Colegiado y especialidad — solo visibles para médicos */}
              {form.rol === 'medico' && (
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="label">Nº colegiado</label>
                    <input className="input" placeholder="ej. 312865870"
                      value={(form as any).colegiado ?? ''}
                      onChange={(e) => setForm((f) => ({ ...f, colegiado: e.target.value }))} />
                  </div>
                  <div>
                    <label className="label">Especialidad</label>
                    <input className="input" placeholder="ej. Médico Especialista en Neurología"
                      value={(form as any).especialidad ?? ''}
                      onChange={(e) => setForm((f) => ({ ...f, especialidad: e.target.value }))} />
                  </div>
                </div>
              )}
              <div className="flex items-center gap-2">
                <input
                  type="checkbox"
                  id="activo"
                  className="w-4 h-4 rounded text-primary-600"
                  checked={form.activo}
                  onChange={(e) => setForm((f) => ({ ...f, activo: e.target.checked }))}
                />
                <label htmlFor="activo" className="text-sm text-slate-700 cursor-pointer">
                  Activo
                </label>
              </div>
              {error && (
                <div className="p-3 bg-red-50 border border-red-200 text-red-700 text-sm rounded-lg">{error}</div>
              )}
            </div>

            <div className="px-6 py-4 border-t flex justify-end gap-3">
              <button onClick={cerrar} className="btn-secondary">
                Cancelar
              </button>
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
