import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../lib/AuthContext'
import type { Profesional, Rol } from '../types'
import { UserPlus, Shield, Loader2, X, Trash2 } from 'lucide-react'

const ROLES: { valor: Rol; etiqueta: string }[] = [
  { valor: 'medico', etiqueta: 'Médico/a' },
  { valor: 'enfermeria', etiqueta: 'Enfermería' },
  { valor: 'auxiliar', etiqueta: 'Auxiliar' },
  { valor: 'tecnico', etiqueta: 'Técnico/a' },
]

export function Personal() {
  const { esAdmin, profesional: yo } = useAuth()
  const [lista, setLista] = useState<Profesional[]>([])
  const [cargando, setCargando] = useState(true)
  const [mostrarForm, setMostrarForm] = useState(false)

  async function cargar() {
    const { data } = await supabase
      .from('profesionales')
      .select('*')
      .order('apellidos', { ascending: true })
    setLista((data as Profesional[]) ?? [])
    setCargando(false)
  }

  useEffect(() => { cargar() }, [])

  // Protección en la interfaz (el candado de la BD protege por debajo igualmente).
  if (!esAdmin) {
    return (
      <div className="p-8">
        <div className="card p-6 max-w-md">
          <p className="font-semibold text-slate-800">Acceso restringido</p>
          <p className="text-sm text-slate-500 mt-1">
            Solo los administradores pueden gestionar al personal.
          </p>
        </div>
      </div>
    )
  }

  async function cambiarRol(id: string, rol: Rol) {
    await supabase.from('profesionales').update({ rol }).eq('id', id)
    cargar()
  }

  async function alternarAdmin(p: Profesional) {
    await supabase.from('profesionales').update({ es_admin: !p.es_admin }).eq('id', p.id)
    cargar()
  }

  async function alternarActivo(p: Profesional) {
    // Baja/alta completa: la función segura marca la ficha Y bloquea o
    // desbloquea el acceso, todo a la vez y sin borrar nada.
    const { data, error } = await supabase.functions.invoke('acceso-profesional', {
      body: { profesionalId: p.id, activo: !p.activo },
    })
    if (error || (data && (data as any).error)) {
      alert((data as any)?.error ?? 'No se pudo cambiar el acceso.')
      return
    }
    cargar()
  }

  async function eliminar(p: Profesional) {
    const ok = window.confirm(
      `¿Eliminar por completo a ${p.nombre} ${p.apellidos}?\n\n` +
      `Esto borra su ficha y su cuenta de acceso y no se puede deshacer. ` +
      `Si tiene registros clínicos a su nombre, no se podrá borrar (usa la baja en su lugar).`
    )
    if (!ok) return
    const { data, error } = await supabase.functions.invoke('eliminar-profesional', {
      body: { profesionalId: p.id },
    })
    if (error || (data && (data as any).error)) {
      alert((data as any)?.error ?? 'No se pudo eliminar.')
      return
    }
    cargar()
  }

  return (
    <div className="p-6 md:p-8 max-w-4xl">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-xl font-bold text-slate-800">Personal</h1>
          <p className="text-sm text-slate-500">Gestión de cuentas, roles y permisos.</p>
        </div>
        <button onClick={() => setMostrarForm(true)} className="btn-primary">
          <UserPlus className="w-4 h-4" /> Nuevo profesional
        </button>
      </div>

      {cargando ? (
        <p className="text-slate-400">Cargando…</p>
      ) : (
        <div className="card overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 text-slate-500 text-left">
              <tr>
                <th className="px-4 py-2 font-medium">Nombre</th>
                <th className="px-4 py-2 font-medium">Rol</th>
                <th className="px-4 py-2 font-medium">Cuenta</th>
                <th className="px-4 py-2 font-medium text-center">Admin</th>
                <th className="px-4 py-2 font-medium text-center" title="Desmarcar = baja completa: bloquea el acceso sin borrar datos">Activo</th>
                <th className="px-4 py-2"></th>
              </tr>
            </thead>
            <tbody>
              {lista.map((p) => (
                <tr key={p.id} className={`border-t border-slate-100 ${!p.activo ? 'opacity-50' : ''}`}>
                  <td className="px-4 py-2 text-slate-800">
                    {p.nombre} {p.apellidos}
                    {!p.activo && <span className="ml-2 text-xs text-slate-400">(inactivo)</span>}
                  </td>
                  <td className="px-4 py-2">
                    <select
                      className="input py-1 text-sm"
                      value={p.rol}
                      onChange={(e) => cambiarRol(p.id, e.target.value as Rol)}
                    >
                      {ROLES.map((r) => (
                        <option key={r.valor} value={r.valor}>{r.etiqueta}</option>
                      ))}
                    </select>
                  </td>
                  <td className="px-4 py-2 text-slate-500">
                    {p.user_id ? 'Con cuenta' : <span className="text-amber-600">Sin cuenta</span>}
                  </td>
                  <td className="px-4 py-2 text-center">
                    <input
                      type="checkbox"
                      checked={p.es_admin}
                      onChange={() => alternarAdmin(p)}
                      // No permitirse quitarse a uno mismo el último admin por error.
                      disabled={p.id === yo?.id}
                      title={p.id === yo?.id ? 'No puedes cambiar tu propio permiso de admin' : ''}
                    />
                  </td>
                  <td className="px-4 py-2 text-center">
                    <input
                      type="checkbox"
                      checked={p.activo}
                      onChange={() => alternarActivo(p)}
                      disabled={p.id === yo?.id}
                    />
                  </td>
                  <td className="px-4 py-2 text-center">
                    {p.id !== yo?.id && (
                      <button
                        onClick={() => eliminar(p)}
                        title="Eliminar por completo"
                        className="text-slate-300 hover:text-red-600 transition-colors"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <p className="text-xs text-slate-400 mt-3 flex items-center gap-1">
        <Shield className="w-3 h-3" />
        Crear un profesional genera su cuenta de acceso. Comunícale su contraseña de forma segura.
      </p>

      {mostrarForm && (
        <FormularioNuevo
          onCerrar={() => setMostrarForm(false)}
          onCreado={() => { setMostrarForm(false); cargar() }}
        />
      )}
    </div>
  )
}

function FormularioNuevo({ onCerrar, onCreado }: { onCerrar: () => void; onCreado: () => void }) {
  const [nombre, setNombre] = useState('')
  const [apellidos, setApellidos] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [rol, setRol] = useState<Rol>('enfermeria')
  const [error, setError] = useState('')
  const [enviando, setEnviando] = useState(false)

  async function crear() {
    setError('')
    if (!nombre || !apellidos || !email || !password) {
      setError('Rellena nombre, apellidos, correo y contraseña.')
      return
    }
    if (password.length < 8) {
      setError('La contraseña debe tener al menos 8 caracteres.')
      return
    }
    setEnviando(true)
    // Llamada a la Edge Function segura (crea cuenta + ficha).
    const { data, error: fnError } = await supabase.functions.invoke('crear-profesional', {
      body: { nombre, apellidos, email, password, rol },
    })
    setEnviando(false)

    if (fnError || (data && (data as any).error)) {
      setError((data as any)?.error ?? 'No se pudo crear el profesional. Revisa los datos.')
      return
    }
    onCreado()
  }

  return (
    <div className="fixed inset-0 bg-black/30 flex items-center justify-center p-4 z-50">
      <div className="card p-6 w-full max-w-md">
        <div className="flex items-center justify-between mb-4">
          <h2 className="font-semibold text-slate-800">Nuevo profesional</h2>
          <button onClick={onCerrar} className="text-slate-400 hover:text-slate-600">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="label">Nombre</label>
              <input className="input" value={nombre} onChange={(e) => setNombre(e.target.value)} />
            </div>
            <div>
              <label className="label">Apellidos</label>
              <input className="input" value={apellidos} onChange={(e) => setApellidos(e.target.value)} />
            </div>
          </div>
          <div>
            <label className="label">Rol</label>
            <select className="input" value={rol} onChange={(e) => setRol(e.target.value as Rol)}>
              {ROLES.map((r) => (
                <option key={r.valor} value={r.valor}>{r.etiqueta}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="label">Correo (usuario de acceso)</label>
            <input className="input" type="email" value={email} onChange={(e) => setEmail(e.target.value)} />
          </div>
          <div>
            <label className="label">Contraseña inicial</label>
            <input className="input" type="text" value={password} onChange={(e) => setPassword(e.target.value)} />
            <p className="text-[11px] text-slate-400 mt-1">Mínimo 8 caracteres. Comunícasela a la persona de forma segura.</p>
          </div>

          {error && (
            <p className="text-sm text-red-600 bg-red-50 border border-red-100 rounded-lg px-3 py-2">{error}</p>
          )}

          <div className="flex justify-end gap-2 pt-1">
            <button onClick={onCerrar} className="text-sm text-slate-500 px-3 py-2">Cancelar</button>
            <button onClick={crear} disabled={enviando} className="btn-primary">
              {enviando ? <Loader2 className="w-4 h-4 animate-spin" /> : <UserPlus className="w-4 h-4" />}
              {enviando ? 'Creando…' : 'Crear'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
