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
  loading: boolean                   // true mientras comprobamos la sesión
  signOut: () => Promise<void>
}

const AuthContext = createContext<AuthState | undefined>(undefined)

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null)
  const [profesional, setProfesional] = useState<Profesional | null>(null)
  const [loading, setLoading] = useState(true)

  // Busca la ficha de profesional enlazada a la cuenta que ha entrado.
  async function cargarProfesional(userId: string) {
    const { data } = await supabase
      .from('profesionales')
      .select('*')
      .eq('user_id', userId)
      .maybeSingle()
    setProfesional((data as Profesional) ?? null)
  }

  useEffect(() => {
    // 1) Al arrancar, recuperamos la sesión guardada (si la hay).
    supabase.auth.getSession().then(async ({ data }) => {
      setSession(data.session)
      if (data.session) await cargarProfesional(data.session.user.id)
      setLoading(false)
    })

    // 2) Nos suscribimos a cambios: login, logout, renovación de token…
    const { data: sub } = supabase.auth.onAuthStateChange(async (_evento, nuevaSesion) => {
      setSession(nuevaSesion)
      if (nuevaSesion) await cargarProfesional(nuevaSesion.user.id)
      else setProfesional(null)
    })

    return () => sub.subscription.unsubscribe()
  }, [])

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
