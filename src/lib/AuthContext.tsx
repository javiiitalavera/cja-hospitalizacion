import { createContext, useContext, useEffect, useState } from 'react'
import type { ReactNode } from 'react'
import type { Session } from '@supabase/supabase-js'
import { supabase } from './supabase'
import type { Profesional, Rol } from '../types'

// Lo que la app puede saber sobre quién ha iniciado sesión.
interface AuthState {
  session: Session | null
  profesional: Profesional | null   // ficha enlazada del profesional
  rol: Rol | null                    // atajo cómodo para permisos por rol
  loading: boolean                   // true mientras aún no sabemos a dónde llevar al usuario
  signOut: () => Promise<void>
}

const AuthContext = createContext<AuthState | undefined>(undefined)

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null)
  const [profesional, setProfesional] = useState<Profesional | null>(null)
  const [loading, setLoading] = useState(true)

  // ── Paso 1: la sesión ───────────────────────────────────────
  // IMPORTANTE: dentro de estos callbacks de Supabase solo tocamos
  // la sesión (nada de consultas a la base de datos aquí, o se bloquea).
  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session)
      if (!data.session) setLoading(false) // sin sesión, ya podemos decidir: al login
    })

    const { data: sub } = supabase.auth.onAuthStateChange((_evento, nuevaSesion) => {
      setSession(nuevaSesion)
      if (!nuevaSesion) setLoading(false)   // al cerrar sesión, decisión inmediata
    })

    return () => sub.subscription.unsubscribe()
  }, [])

  // ── Paso 2: la ficha del profesional ────────────────────────
  // Efecto separado que reacciona cuando cambia el usuario. Al estar
  // fuera de los callbacks de auth, la consulta ya no se bloquea.
  useEffect(() => {
    const userId = session?.user?.id
    if (!userId) {
      setProfesional(null)
      return
    }
    let cancelado = false
    setLoading(true)
    supabase
      .from('profesionales')
      .select('*')
      .eq('user_id', userId)
      .maybeSingle()
      .then(({ data }) => {
        if (cancelado) return
        setProfesional((data as Profesional) ?? null)
        setLoading(false) // ya sabemos todo lo necesario para decidir
      })
    return () => { cancelado = true }
  }, [session?.user?.id])

  async function signOut() {
    await supabase.auth.signOut()
    // El listener de arriba se encarga de limpiar sesión y profesional.
  }

  return (
    <AuthContext.Provider
      value={{ session, profesional, rol: profesional?.rol ?? null, loading, signOut }}
    >
      {children}
    </AuthContext.Provider>
  )
}

// Hook cómodo para usar en cualquier componente: const { rol } = useAuth()
export function useAuth(): AuthState {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth debe usarse dentro de <AuthProvider>')
  return ctx
}
