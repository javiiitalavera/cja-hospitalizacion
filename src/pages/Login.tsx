import { useState } from 'react'
import { Navigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useAuth } from '../lib/AuthContext'
import { Activity, LogIn, Loader2 } from 'lucide-react'

export default function Login() {
  const { session } = useAuth()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [enviando, setEnviando] = useState(false)

  // Si ya hay sesión, no mostramos el login: directos a la app.
  if (session) return <Navigate to="/" replace />

  async function entrar() {
    if (!email || !password) {
      setError('Escribe tu correo y tu contraseña.')
      return
    }
    setEnviando(true)
    setError('')
    const { error } = await supabase.auth.signInWithPassword({ email, password })
    setEnviando(false)
    if (error) {
      // Mensaje en la voz de la app: qué ha pasado y qué hacer.
      setError('No hemos podido iniciar sesión. Revisa el correo y la contraseña.')
      return
    }
    // Si va bien, el AuthProvider detecta la sesión y el guard deja pasar.
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-50 p-4">
      <div className="w-full max-w-sm">
        {/* Cabecera con el mismo logo que la barra lateral */}
        <div className="flex flex-col items-center mb-6">
          <div className="w-11 h-11 bg-primary-600 rounded-xl flex items-center justify-center mb-3">
            <Activity className="w-6 h-6 text-white" />
          </div>
          <h1 className="text-lg font-bold text-slate-800">CJA Hospital</h1>
          <p className="text-xs text-slate-400">Clínica Josefina Arregui · Alsasua</p>
        </div>

        <div className="card p-6 space-y-4">
          <div>
            <label className="label" htmlFor="email">Correo</label>
            <input
              id="email"
              type="email"
              autoComplete="username"
              className="input"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && entrar()}
            />
          </div>
          <div>
            <label className="label" htmlFor="password">Contraseña</label>
            <input
              id="password"
              type="password"
              autoComplete="current-password"
              className="input"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && entrar()}
            />
          </div>

          {error && (
            <p className="text-sm text-red-600 bg-red-50 border border-red-100 rounded-lg px-3 py-2">
              {error}
            </p>
          )}

          <button onClick={entrar} disabled={enviando} className="btn-primary w-full justify-center">
            {enviando ? <Loader2 className="w-4 h-4 animate-spin" /> : <LogIn className="w-4 h-4" />}
            {enviando ? 'Entrando…' : 'Entrar'}
          </button>
        </div>

        <p className="text-center text-[11px] text-slate-400 mt-4">
          Acceso restringido al personal de la unidad.
        </p>
      </div>
    </div>
  )
}
