// Personal con cuenta: para poner nombre a quien hizo cada cosa y para el filtro «Persona».
// Las filas de la auditoría guardan el identificador de la cuenta (auth.uid()); el historial de contención
// guarda el de la ficha de profesional: cada uno se resuelve con su propio mapa.

import { useCallback, useEffect, useState } from 'react'
import { supabase } from '../../lib/supabase'

export interface Personal {
  cargado: boolean
  error: string
  porAuth: Record<string, string>      // auth.uid() → nombre
  porProf: Record<string, string>      // profesionales.id → nombre
  authDeProf: Record<string, string>   // profesionales.id → auth.uid()
  profDeAuth: Record<string, string>   // auth.uid() → profesionales.id
  lista: { userId: string; nombre: string }[]
  recargar: () => void
}

const VACIO = { porAuth: {}, porProf: {}, authDeProf: {}, profDeAuth: {}, lista: [] as { userId: string; nombre: string }[] }

export function usePersonal(): Personal {
  const [estado, setEstado] = useState({ ...VACIO, cargado: false, error: '' })

  const cargar = useCallback(async () => {
    const { data, error } = await supabase.from('profesionales').select('id, user_id, nombre, apellidos')
    if (error) {
      setEstado((e) => ({ ...e, cargado: true, error: 'No se pudieron cargar los nombres del personal: ' + error.message }))
      return
    }
    const porAuth: Record<string, string> = {}
    const porProf: Record<string, string> = {}
    const authDeProf: Record<string, string> = {}
    const profDeAuth: Record<string, string> = {}
    const lista: { userId: string; nombre: string }[] = []
    for (const p of (data ?? []) as any[]) {
      const nombre = `${p.nombre} ${p.apellidos}`.trim()
      porProf[p.id] = nombre
      if (p.user_id) {
        porAuth[p.user_id] = nombre
        authDeProf[p.id] = p.user_id
        profDeAuth[p.user_id] = p.id
        lista.push({ userId: p.user_id, nombre })
      }
    }
    lista.sort((a, b) => a.nombre.localeCompare(b.nombre, 'es'))
    setEstado({ porAuth, porProf, authDeProf, profDeAuth, lista, cargado: true, error: '' })
  }, [])

  useEffect(() => { cargar() }, [cargar])
  return { ...estado, recargar: cargar }
}

// Nombres de pacientes por identificador, pedidos de una vez por tanda y guardados. '' = ya no existe.
export function usePacientesNombres() {
  const [mapa, setMapa] = useState<Record<string, string>>({})
  const [pedidos] = useState(() => new Set<string>())

  const resolver = useCallback(async (ids: (string | null | undefined)[]) => {
    const nuevos = [...new Set(ids.filter((x): x is string => !!x))].filter((id) => !pedidos.has(id))
    if (nuevos.length === 0) return
    nuevos.forEach((id) => pedidos.add(id))
    const encontrados: Record<string, string> = {}
    for (let i = 0; i < nuevos.length; i += 100) {
      const trozo = nuevos.slice(i, i + 100)
      const { data } = await supabase.from('pacientes').select('id, nombre, primer_apellido').in('id', trozo)
      for (const p of (data ?? []) as any[]) encontrados[p.id] = `${p.nombre} ${p.primer_apellido}`.trim()
    }
    const resultado: Record<string, string> = {}
    for (const id of nuevos) resultado[id] = encontrados[id] ?? ''
    setMapa((m) => ({ ...m, ...resultado }))
  }, [pedidos])

  return { mapa, resolver }
}
