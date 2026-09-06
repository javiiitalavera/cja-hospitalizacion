import { useEffect, useRef, useState } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../lib/AuthContext'
import type { Profesional, Rol } from '../types'
import { UserPlus, Shield, Loader2, X, Trash2, KeyRound, Pencil, Eye, EyeOff } from 'lucide-react'

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
  const [busqueda, setBusqueda] = useState('')
  const [filtroRol, setFiltroRol] = useState<Rol | 'todos'>('todos')
  const [filtroEstado, setFiltroEstado] = useState<'todos' | 'activos' | 'inactivos'>('activos')
  const [mostrarForm, setMostrarForm] = useState(false)
  const [resetTarget, setResetTarget] = useState<Profesional | null>(null)
  const [editTarget, setEditTarget] = useState<Profesional | null>(null)
  const [busyId, setBusyId] = useState<string | null>(null)
  const [feedback, setFeedback] = useState<{ tipo: 'ok' | 'error'; texto: string } | null>(null)
  const [confirmar, setConfirmar] = useState<ConfirmData | null>(null)
  const timerRef = useRef<number | undefined>(undefined)

  // Aviso en línea (verde/rojo) que se desvanece solo. Sustituye a los alert().
  function notificar(tipo: 'ok' | 'error', texto: string) {
    setFeedback({ tipo, texto })
    if (timerRef.current) window.clearTimeout(timerRef.current)
    timerRef.current = window.setTimeout(() => setFeedback(null), 4000)
  }

  const [errorCarga, setErrorCarga] = useState('')
  const [accesos, setAccesos] = useState<Record<string, { email: string | null; ultimo_acceso: string | null }>>({})

  async function cargar() {
    setErrorCarga('')
    const { data, error } = await supabase
      .from('profesionales')
      .select('*')
      .order('apellidos', { ascending: true })
    if (error) {
      // Sin esto, un fallo real de carga (red, permisos...) se veía
      // exactamente igual que "no hay ningún profesional dado de
      // alta" — algo que además nunca pasa de verdad en una clínica
      // en marcha, así que era una señal clara de que algo iba mal
      // sin que nadie se enterase.
      setErrorCarga('No se pudo cargar el personal: ' + error.message)
      setCargando(false)
      return
    }
    setLista((data as Profesional[]) ?? [])
    setCargando(false)

    // El correo y el último acceso viven en Auth, no en esta tabla —
    // se piden aparte, y si fallan no se bloquea el resto de la
    // pantalla por ello (se ve el personal igual, solo sin esos dos
    // datos concretos).
    const resp = await supabase.functions.invoke('listar-accesos')
    if (!resp.error && resp.data?.accesos) setAccesos(resp.data.accesos)
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

  function pedirCambiarRol(p: Profesional, nuevoRol: Rol) {
    if (nuevoRol === p.rol) return
    const etiquetaAntes = ROLES.find((r) => r.valor === p.rol)?.etiqueta ?? p.rol
    const etiquetaDespues = ROLES.find((r) => r.valor === nuevoRol)?.etiqueta ?? nuevoRol
    // Un clic de más en el desplegable cambiaba el rol al instante —
    // y el rol determina permisos clínicos reales (quién puede
    // confirmar una contención, por ejemplo), así que un despiste no
    // debería bastar para cambiarlo.
    setConfirmar({
      titulo: 'Cambiar rol',
      mensaje: `Cambiar a ${p.nombre} de ${etiquetaAntes} a ${etiquetaDespues}. Esto cambia sus permisos clínicos de inmediato.`,
      textoBoton: 'Cambiar rol',
      peligro: false,
      accion: async () => {
        setBusyId(p.id)
        const { error } = await supabase.from('profesionales').update({ rol: nuevoRol }).eq('id', p.id)
        setBusyId(null)
        if (error) { notificar('error', 'No se pudo cambiar el rol.'); return }
        notificar('ok', `Rol de ${p.nombre} actualizado.`)
        cargar()
      },
    })
  }

  function pedirAlternarAdmin(p: Profesional) {
    const quitar = p.es_admin
    setConfirmar({
      titulo: quitar ? 'Quitar administrador' : 'Nombrar administrador',
      mensaje: quitar
        ? `${p.nombre} ${p.apellidos} dejará de poder gestionar personal, permisos y auditoría.`
        : `${p.nombre} ${p.apellidos} podrá gestionar personal, permisos y contraseñas, y ver la auditoría.`,
      textoBoton: quitar ? 'Quitar admin' : 'Nombrar admin',
      peligro: quitar,
      accion: async () => {
        setBusyId(p.id)
        const { error } = await supabase.from('profesionales').update({ es_admin: !p.es_admin }).eq('id', p.id)
        setBusyId(null)
        if (error) { notificar('error', 'No se pudo cambiar el permiso.'); return }
        notificar('ok', quitar ? `${p.nombre} ya no es administrador.` : `${p.nombre} es ahora administrador.`)
        cargar()
      },
    })
  }

  async function ejecutarActivo(p: Profesional) {
    setBusyId(p.id)
    const { data, error } = await supabase.functions.invoke('acceso-profesional', {
      body: { profesionalId: p.id, activo: !p.activo },
    })
    setBusyId(null)
    if (error || (data && (data as any).error)) {
      notificar('error', (data as any)?.error ?? 'No se pudo cambiar el acceso.')
      return
    }
    notificar('ok', p.activo ? `${p.nombre} ${p.apellidos} dado de baja.` : `${p.nombre} ${p.apellidos} reactivado.`)
    cargar()
  }

  function pedirAlternarActivo(p: Profesional) {
    if (!p.activo) { ejecutarActivo(p); return } // reactivar es restaurar: directo
    setConfirmar({
      titulo: 'Dar de baja',
      mensaje: `${p.nombre} ${p.apellidos} quedará inactivo y se bloqueará su acceso: no podrá iniciar sesión. No se borra nada y es reversible.`,
      textoBoton: 'Dar de baja',
      peligro: true,
      accion: () => ejecutarActivo(p),
    })
  }

  function pedirEliminar(p: Profesional) {
    setConfirmar({
      titulo: 'Eliminar profesional',
      mensaje: `Se borrará por completo la ficha y la cuenta de ${p.nombre} ${p.apellidos}. No se puede deshacer. Si tiene registros clínicos a su nombre, no se podrá borrar (usa la baja en su lugar).`,
      textoBoton: 'Eliminar',
      peligro: true,
      accion: async () => {
        setBusyId(p.id)
        const { data, error } = await supabase.functions.invoke('eliminar-profesional', {
          body: { profesionalId: p.id },
        })
        setBusyId(null)
        if (error || (data && (data as any).error)) {
          notificar('error', (data as any)?.error ?? 'No se pudo eliminar.')
          return
        }
        notificar('ok', `${p.nombre} ${p.apellidos} eliminado.`)
        cargar()
      },
    })
  }

  const listaFiltrada = lista.filter((p) => {
    if (filtroRol !== 'todos' && p.rol !== filtroRol) return false
    if (filtroEstado === 'activos' && !p.activo) return false
    if (filtroEstado === 'inactivos' && p.activo) return false
    const q = busqueda.toLowerCase().trim()
    if (!q) return true
    const correo = accesos[p.user_id ?? '']?.email ?? ''
    return `${p.nombre} ${p.apellidos}`.toLowerCase().includes(q) || correo.toLowerCase().includes(q)
  })

  return (
    <div className="p-6 md:p-8 max-w-6xl">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-slate-800">Personal</h1>
          <p className="text-sm text-slate-500">Gestión de cuentas, roles y permisos.</p>
        </div>
        <button onClick={() => setMostrarForm(true)} className="btn-primary">
          <UserPlus className="w-4 h-4" /> Nuevo profesional
        </button>
      </div>

      {errorCarga && (
        <div className="mb-4 text-sm rounded-lg px-3 py-2 border bg-red-50 text-red-600 border-red-100 flex items-center justify-between gap-3">
          <span>{errorCarga}</span>
          <button onClick={() => { setCargando(true); cargar() }} className="btn-secondary text-xs shrink-0">Reintentar</button>
        </div>
      )}

      {feedback && (
        <div className={`mb-4 text-sm rounded-lg px-3 py-2 border ${
          feedback.tipo === 'ok'
            ? 'bg-emerald-50 text-emerald-700 border-emerald-100'
            : 'bg-red-50 text-red-600 border-red-100'
        }`}>
          {feedback.texto}
        </div>
      )}

      <div className="flex items-center gap-3 mb-4">
        <input
          className="input max-w-xs"
          placeholder="Buscar por nombre o correo…"
          value={busqueda}
          onChange={(e) => setBusqueda(e.target.value)}
        />
        <select className="input py-1.5 max-w-[160px]" value={filtroRol} onChange={(e) => setFiltroRol(e.target.value as Rol | 'todos')}>
          <option value="todos">Todos los roles</option>
          {ROLES.map((r) => <option key={r.valor} value={r.valor}>{r.etiqueta}</option>)}
        </select>
        <select className="input py-1.5 max-w-[160px]" value={filtroEstado} onChange={(e) => setFiltroEstado(e.target.value as typeof filtroEstado)}>
          <option value="activos">Activos</option>
          <option value="inactivos">De baja</option>
          <option value="todos">Todos</option>
        </select>
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
                <th className="px-4 py-2 font-medium">Correo</th>
                <th className="px-4 py-2 font-medium">Último acceso</th>
                <th className="px-4 py-2 font-medium text-center">Admin</th>
                <th className="px-4 py-2 font-medium text-center" title="Desmarcar = baja completa: bloquea el acceso sin borrar datos">Activo</th>
                <th className="px-4 py-2"></th>
              </tr>
            </thead>
            <tbody>
              {listaFiltrada.length === 0 ? (
                <tr><td colSpan={7} className="px-4 py-8 text-center text-slate-400">Nadie coincide con este filtro.</td></tr>
              ) : listaFiltrada.map((p) => {
                const ocupada = busyId === p.id
                const esYo = p.id === yo?.id
                return (
                <tr key={p.id} className={`border-t border-slate-100 ${!p.activo ? 'opacity-50' : ''}`}>
                  <td className="px-4 py-2 text-slate-800">
                    {p.nombre} {p.apellidos}
                    {!p.activo && <span className="ml-2 text-xs text-slate-400">(inactivo)</span>}
                  </td>
                  <td className="px-4 py-2">
                    <select
                      className="input py-1 text-sm"
                      value={p.rol}
                      disabled={ocupada}
                      onChange={(e) => pedirCambiarRol(p, e.target.value as Rol)}
                    >
                      {ROLES.map((r) => (
                        <option key={r.valor} value={r.valor}>{r.etiqueta}</option>
                      ))}
                    </select>
                  </td>
                  <td className="px-4 py-2">
                    {p.user_id ? (
                      <span className="text-slate-600">{accesos[p.user_id]?.email ?? 'Con cuenta'}</span>
                    ) : (
                      <button
                        onClick={() => setEditTarget(p)}
                        className="text-amber-600 font-medium hover:underline"
                      >
                        Dar acceso →
                      </button>
                    )}
                  </td>
                  <td className="px-4 py-2 text-slate-400 text-xs">
                    {p.user_id
                      ? accesos[p.user_id]?.ultimo_acceso
                        ? new Date(accesos[p.user_id]!.ultimo_acceso!).toLocaleDateString('es-ES')
                        : 'Nunca ha entrado'
                      : '—'}
                  </td>
                  <td className="px-4 py-2 text-center">
                    <input
                      type="checkbox"
                      checked={p.es_admin}
                      onChange={() => pedirAlternarAdmin(p)}
                      disabled={esYo || ocupada}
                      title={esYo ? 'No puedes cambiar tu propio permiso de admin' : 'Nombrar o quitar administrador'}
                    />
                  </td>
                  <td className="px-4 py-2 text-center">
                    <input
                      type="checkbox"
                      checked={p.activo}
                      onChange={() => pedirAlternarActivo(p)}
                      disabled={esYo || ocupada}
                      title={esYo ? 'No puedes cambiar tu propio acceso' : 'Activo · desmarcar da de baja completa'}
                    />
                  </td>
                  <td className="px-4 py-2">
                    {ocupada ? (
                      <div className="flex justify-center">
                        <Loader2 className="w-4 h-4 animate-spin text-slate-400" />
                      </div>
                    ) : (
                      <div className="flex items-center justify-center gap-3">
                        <button
                          onClick={() => setEditTarget(p)}
                          title="Editar datos"
                          className="text-slate-400 hover:text-primary-600 transition-colors"
                        >
                          <Pencil className="w-4 h-4" />
                        </button>
                        {p.user_id && (
                          <button
                            onClick={() => setResetTarget(p)}
                            title="Restablecer contraseña"
                            className="text-slate-400 hover:text-primary-600 transition-colors"
                          >
                            <KeyRound className="w-4 h-4" />
                          </button>
                        )}
                        {!esYo && (
                          <button
                            onClick={() => pedirEliminar(p)}
                            title="Eliminar por completo"
                            className="text-slate-400 hover:text-red-600 transition-colors"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        )}
                      </div>
                    )}
                  </td>
                </tr>
                )
              })}
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

      {resetTarget && (
        <ModalPassword
          profesional={resetTarget}
          onCerrar={() => setResetTarget(null)}
        />
      )}

      {editTarget && (
        <ModalEditar
          profesional={editTarget}
          emailActual={editTarget.user_id ? accesos[editTarget.user_id]?.email : null}
          onCerrar={() => setEditTarget(null)}
          onGuardado={(msg) => { setEditTarget(null); notificar('ok', msg); cargar() }}
        />
      )}

      {confirmar && (
        <ConfirmDialog
          datos={confirmar}
          onCerrar={() => setConfirmar(null)}
        />
      )}
    </div>
  )
}

// ── Diálogo de confirmación reutilizable ──────────────────────
interface ConfirmData {
  titulo: string
  mensaje: string
  textoBoton: string
  peligro?: boolean
  accion: () => void | Promise<void>
}

function ConfirmDialog({ datos, onCerrar }: { datos: ConfirmData; onCerrar: () => void }) {
  const [procesando, setProcesando] = useState(false)
  async function confirmar() {
    setProcesando(true)
    await datos.accion()
    setProcesando(false)
    onCerrar()
  }
  return (
    <div className="fixed inset-0 bg-black/30 flex items-center justify-center p-4 z-50">
      <div className="card p-6 w-full max-w-sm">
        <h2 className="font-semibold text-slate-800 mb-1">{datos.titulo}</h2>
        <p className="text-sm text-slate-500 mb-5">{datos.mensaje}</p>
        <div className="flex justify-end gap-2">
          <button onClick={onCerrar} disabled={procesando} className="text-sm text-slate-500 px-3 py-2">
            Cancelar
          </button>
          <button
            onClick={confirmar}
            disabled={procesando}
            className={datos.peligro ? 'btn-danger' : 'btn-primary'}
          >
            {procesando && <Loader2 className="w-4 h-4 animate-spin" />}
            {procesando ? 'Un momento…' : datos.textoBoton}
          </button>
        </div>
      </div>
    </div>
  )
}

function ModalPassword({ profesional, onCerrar }: { profesional: Profesional; onCerrar: () => void }) {
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [hecho, setHecho] = useState(false)
  const [enviando, setEnviando] = useState(false)

  async function guardar() {
    setError('')
    if (password.length < 8) {
      setError('La contraseña debe tener al menos 8 caracteres.')
      return
    }
    setEnviando(true)
    const { data, error: fnError } = await supabase.functions.invoke('restablecer-password', {
      body: { profesionalId: profesional.id, nuevaPassword: password },
    })
    setEnviando(false)
    if (fnError || (data && (data as any).error)) {
      setError((data as any)?.error ?? 'No se pudo restablecer la contraseña.')
      return
    }
    setHecho(true)
  }

  return (
    <div className="fixed inset-0 bg-black/30 flex items-center justify-center p-4 z-50">
      <div className="card p-6 w-full max-w-sm">
        <div className="flex items-center justify-between mb-4">
          <h2 className="font-semibold text-slate-800">Restablecer contraseña</h2>
          <button onClick={onCerrar} className="text-slate-400 hover:text-slate-600">
            <X className="w-5 h-5" />
          </button>
        </div>

        {hecho ? (
          <div className="space-y-4">
            <p className="text-sm text-slate-600">
              Contraseña cambiada para <span className="font-medium">{profesional.nombre} {profesional.apellidos}</span>.
              Comunícasela de forma segura.
            </p>
            <div className="flex justify-end">
              <button onClick={onCerrar} className="btn-primary">Hecho</button>
            </div>
          </div>
        ) : (
          <div className="space-y-3">
            <p className="text-sm text-slate-500">
              Nueva contraseña para <span className="font-medium">{profesional.nombre} {profesional.apellidos}</span>.
            </p>
            <div>
              <label className="label">Nueva contraseña</label>
              <CampoContrasena value={password} onChange={setPassword} onEnter={guardar} />
              <p className="text-[11px] text-slate-400 mt-1">Mínimo 8 caracteres.</p>
            </div>

            {error && (
              <p className="text-sm text-red-600 bg-red-50 border border-red-100 rounded-lg px-3 py-2">{error}</p>
            )}

            <div className="flex justify-end gap-2 pt-1">
              <button onClick={onCerrar} className="text-sm text-slate-500 px-3 py-2">Cancelar</button>
              <button onClick={guardar} disabled={enviando} className="btn-primary">
                {enviando ? <Loader2 className="w-4 h-4 animate-spin" /> : <KeyRound className="w-4 h-4" />}
                {enviando ? 'Guardando…' : 'Restablecer'}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

function FormularioNuevo({ onCerrar, onCreado }: { onCerrar: () => void; onCreado: () => void }) {
  const [nombre, setNombre] = useState('')
  const [apellidos, setApellidos] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [rol, setRol] = useState<Rol>('enfermeria')
  const [colegiado, setColegiado] = useState('')
  const [especialidad, setEspecialidad] = useState('')
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
    // Llamada a la Edge Function segura (crea cuenta + ficha). El
    // servidor ya admitía colegiado/especialidad desde el principio —
    // solo faltaba pedirlos aquí, para no tener que crear primero y
    // editar después solo para rellenar estos dos campos.
    const { data, error: fnError } = await supabase.functions.invoke('crear-profesional', {
      body: { nombre, apellidos, email, password, rol, colegiado: colegiado.trim() || null, especialidad: especialidad.trim() || null },
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
          {/* Opcionales — el servidor ya los admitía, antes solo se
              podían rellenar editando después de crear. */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="label">Nº Colegiado (opcional)</label>
              <input className="input" value={colegiado} onChange={(e) => setColegiado(e.target.value)} />
            </div>
            <div>
              <label className="label">Especialidad (opcional)</label>
              <input className="input" value={especialidad} onChange={(e) => setEspecialidad(e.target.value)} />
            </div>
          </div>
          <div>
            <label className="label">Correo (usuario de acceso)</label>
            <input className="input" type="email" value={email} onChange={(e) => setEmail(e.target.value)} />
          </div>
          <div>
            <label className="label">Contraseña inicial</label>
            <CampoContrasena value={password} onChange={setPassword} />
            <p className="text-[11px] text-slate-400 mt-1">Mínimo 8 caracteres. Comunícasela a la persona de forma segura.</p>
          </div>

          {error && (
            <p className="text-sm text-red-600 bg-red-50 border border-red-100 rounded-lg px-3 py-2">{error}</p>
          )}

          <div className="flex justify-end gap-2 pt-1">
            <button onClick={onCerrar} className="text-sm text-slate-500 px-3 py-2">Cancelar</button>
            <button onClick={crear} disabled={enviando || !nombre || !apellidos || !email || !password} className="btn-primary">
              {enviando ? <Loader2 className="w-4 h-4 animate-spin" /> : <UserPlus className="w-4 h-4" />}
              {enviando ? 'Creando…' : 'Crear'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

function ModalEditar({ profesional, emailActual, onCerrar, onGuardado }: {
  profesional: Profesional
  emailActual?: string | null
  onCerrar: () => void
  onGuardado: (mensaje: string) => void
}) {
  const [nombre, setNombre] = useState(profesional.nombre)
  const [apellidos, setApellidos] = useState(profesional.apellidos)
  const [colegiado, setColegiado] = useState(profesional.colegiado ?? '')
  const [especialidad, setEspecialidad] = useState(profesional.especialidad ?? '')
  const [error, setError] = useState('')
  const [guardando, setGuardando] = useState(false)

  // Sección de cuenta (solo si aún no tiene)
  const sinCuenta = !profesional.user_id
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [errorCuenta, setErrorCuenta] = useState('')
  const [creandoCuenta, setCreandoCuenta] = useState(false)

  // Cambiar el correo de una cuenta que ya existe — antes no había
  // forma de corregir una errata o un cambio de correo institucional
  // sin entrar directamente en Supabase.
  const [nuevoEmail, setNuevoEmail] = useState(emailActual ?? '')
  const [errorEmail, setErrorEmail] = useState('')
  const [cambiandoEmail, setCambiandoEmail] = useState(false)

  async function cambiarEmail() {
    setErrorEmail('')
    if (!nuevoEmail.trim()) {
      setErrorEmail('Escribe un correo.')
      return
    }
    if (nuevoEmail.trim() === emailActual) {
      setErrorEmail('Ese ya es su correo actual.')
      return
    }
    setCambiandoEmail(true)
    const { data, error: fnError } = await supabase.functions.invoke('cambiar-email-profesional', {
      body: { profesionalId: profesional.id, nuevoEmail: nuevoEmail.trim() },
    })
    setCambiandoEmail(false)
    if (fnError || (data && (data as any).error)) {
      setErrorEmail((data as any)?.error ?? 'No se pudo cambiar el correo.')
      return
    }
    onGuardado('Correo de acceso actualizado.')
  }

  async function guardarDatos() {
    setError('')
    if (!nombre.trim() || !apellidos.trim()) {
      setError('Nombre y apellidos son obligatorios.')
      return
    }
    setGuardando(true)
    const { error } = await supabase
      .from('profesionales')
      .update({
        nombre: nombre.trim(),
        apellidos: apellidos.trim(),
        colegiado: colegiado.trim() || null,
        especialidad: especialidad.trim() || null,
      })
      .eq('id', profesional.id)
    setGuardando(false)
    if (error) {
      setError('No se pudieron guardar los datos.')
      return
    }
    onGuardado('Datos actualizados.')
  }

  async function crearCuenta() {
    setErrorCuenta('')
    if (!email.trim() || !password) {
      setErrorCuenta('Escribe correo y contraseña.')
      return
    }
    if (password.length < 8) {
      setErrorCuenta('La contraseña debe tener al menos 8 caracteres.')
      return
    }
    setCreandoCuenta(true)
    const { data, error: fnError } = await supabase.functions.invoke('crear-cuenta-existente', {
      body: { profesionalId: profesional.id, email: email.trim(), password },
    })
    setCreandoCuenta(false)
    if (fnError || (data && (data as any).error)) {
      setErrorCuenta((data as any)?.error ?? 'No se pudo crear la cuenta.')
      return
    }
    onGuardado('Cuenta de acceso creada.')
  }

  return (
    <div className="fixed inset-0 bg-black/30 flex items-center justify-center p-4 z-50">
      <div className="card p-6 w-full max-w-md">
        <div className="flex items-center justify-between mb-4">
          <h2 className="font-semibold text-slate-800">Editar profesional</h2>
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
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="label">Nº Colegiado</label>
              <input className="input" value={colegiado} onChange={(e) => setColegiado(e.target.value)} />
            </div>
            <div>
              <label className="label">Especialidad</label>
              <input className="input" value={especialidad} onChange={(e) => setEspecialidad(e.target.value)} />
            </div>
          </div>

          {error && (
            <p className="text-sm text-red-600 bg-red-50 border border-red-100 rounded-lg px-3 py-2">{error}</p>
          )}

          <div className="flex justify-end gap-2 pt-1">
            <button onClick={onCerrar} className="text-sm text-slate-500 px-3 py-2">Cerrar</button>
            <button onClick={guardarDatos} disabled={guardando} className="btn-primary">
              {guardando ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
              {guardando ? 'Guardando…' : 'Guardar datos'}
            </button>
          </div>
        </div>

        {/* Cuenta de acceso: solo si aún no la tiene */}
        {sinCuenta && (
          <div className="mt-5 pt-4 border-t">
            <p className="text-sm font-semibold text-slate-700 mb-1">Dar acceso</p>
            <p className="text-xs text-slate-400 mb-3">
              Esta persona no tiene cuenta. Créale una para que pueda entrar.
            </p>
            <div className="space-y-3">
              <div>
                <label className="label">Correo (usuario de acceso)</label>
                <input className="input" type="email" value={email} onChange={(e) => setEmail(e.target.value)} />
              </div>
              <div>
                <label className="label">Contraseña inicial</label>
                <CampoContrasena value={password} onChange={setPassword} />
                <p className="text-[11px] text-slate-400 mt-1">Mínimo 8 caracteres. Comunícasela de forma segura.</p>
              </div>

              {errorCuenta && (
                <p className="text-sm text-red-600 bg-red-50 border border-red-100 rounded-lg px-3 py-2">{errorCuenta}</p>
              )}

              <div className="flex justify-end">
                <button onClick={crearCuenta} disabled={creandoCuenta} className="btn-primary">
                  {creandoCuenta ? <Loader2 className="w-4 h-4 animate-spin" /> : <KeyRound className="w-4 h-4" />}
                  {creandoCuenta ? 'Creando…' : 'Crear cuenta'}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Si ya tiene cuenta, se puede corregir su correo — antes
            había que entrar directamente en Supabase para esto. */}
        {!sinCuenta && (
          <div className="mt-5 pt-4 border-t">
            <p className="text-sm font-semibold text-slate-700 mb-1">Correo de acceso</p>
            <p className="text-xs text-slate-400 mb-3">
              Con qué correo entra esta persona. Cámbialo si hay una errata o ha cambiado de correo institucional.
            </p>
            <div className="space-y-3">
              <input className="input" type="email" value={nuevoEmail} onChange={(e) => setNuevoEmail(e.target.value)} />

              {errorEmail && (
                <p className="text-sm text-red-600 bg-red-50 border border-red-100 rounded-lg px-3 py-2">{errorEmail}</p>
              )}

              <div className="flex justify-end">
                <button onClick={cambiarEmail} disabled={cambiandoEmail} className="btn-secondary">
                  {cambiandoEmail ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
                  {cambiandoEmail ? 'Cambiando…' : 'Cambiar correo'}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

// Campo de contraseña: oculto por defecto (no se ve por encima del
// hombro ni en una captura de pantalla compartida sin querer), con
// un botón para mostrarla un momento si hay que copiarla bien.
function CampoContrasena({ value, onChange, onEnter }: {
  value: string
  onChange: (v: string) => void
  onEnter?: () => void
}) {
  const [visible, setVisible] = useState(false)
  return (
    <div className="relative">
      <input
        className="input pr-9"
        type={visible ? 'text' : 'password'}
        autoComplete="new-password"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={(e) => e.key === 'Enter' && onEnter?.()}
      />
      <button
        type="button"
        onClick={() => setVisible((v) => !v)}
        className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
        tabIndex={-1}
      >
        {visible ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
      </button>
    </div>
  )
}
