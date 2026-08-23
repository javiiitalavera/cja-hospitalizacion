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
  esAdmin: boolean                   // true si gestiona el personal
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
    supabase.auth.getSession()
      .then(({ data }) => {
        setSession(data.session)
        if (!data.session) setLoading(false) // sin sesión, ya podemos decidir: al login
      })
      .catch(() => {
        // Si falla incluso comprobar si hay sesión (ej. almacenamiento
        // corrupto), no dejamos la app bloqueada en "Cargando…" para
        // siempre: se trata como si no hubiera sesión, al login.
        setSession(null)
        setLoading(false)
      })

    const { data: sub } = supabase.auth.onAuthStateChange((_evento, nuevaSesion) => {
      setSession(nuevaSesion)
      if (!nuevaSesion) setLoading(false)   // al cerrar sesión, decisión inmediata
    })

    return () => sub.subscription.unsubscribe()
  }, [])

  // ── Paso 2: la ficha del profesional ────────────────────────
  // Efecto separado, fuera de los callbacks de auth: así la consulta
  // a la base de datos no bloquea el flujo de inicio/cierre de sesión.
  useEffect(() => {
    const userId = session?.user?.id
    if (!userId) {
      setProfesional(null)
      return
    }
    let cancelado = false
    setLoading(true)

    async function cargarProfesional() {
      try {
        const { data } = await supabase
          .from('profesionales')
          .select('*')
          .eq('user_id', userId!)
          .maybeSingle()
        if (cancelado) return
        setProfesional((data as Profesional) ?? null)
      } catch {
        // Un fallo de red aquí no debe dejar la app entera atascada.
        // Sin ficha, RequireAuth mostrará el aviso de "cuenta sin
        // profesional asignado" en vez de colgarse en "Cargando…".
        if (cancelado) return
        setProfesional(null)
      } finally {
        if (!cancelado) setLoading(false)
      }
    }
    cargarProfesional()
    return () => { cancelado = true }
  }, [session?.user?.id])

  async function signOut() {
    await supabase.auth.signOut()
    // El listener de arriba se encarga de limpiar sesión y profesional.
  }

  return (
    <AuthContext.Provider
      value={{
        session,
        profesional,
        rol: profesional?.rol ?? null,
        esAdmin: profesional?.es_admin ?? false,
        loading,
        signOut,
      }}
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
