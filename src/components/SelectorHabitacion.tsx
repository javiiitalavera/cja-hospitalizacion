import { forwardRef, useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'

// Selector de habitaciones libres, compartido entre "Nuevo ingreso" y
// el cambio de habitación de alguien ya ingresado. En el segundo
// caso, la habitación PROPIA del paciente cuenta como disponible
// para él — está "ocupada", pero por sí mismo, y tiene que poder
// seguir eligiéndola (o cambiar a cualquier otra que sí esté libre
// de verdad). Nunca se ofrece una habitación ocupada por otra
// persona: aunque se pudiera forzar, la base de datos lo rechazaría.
const SelectorHabitacion = forwardRef<HTMLSelectElement, {
  value: string
  onChange: (v: string) => void
  habitacionActual?: number | null
}>(function SelectorHabitacion({ value, onChange, habitacionActual }, ref) {
  const [ocupadas, setOcupadas] = useState<Set<number>>(new Set())
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(false)

  useEffect(() => {
    supabase
      .from('ingresos')
      .select('habitacion')
      .eq('estado', 'activo')
      .then(({ data, error: err }) => {
        if (err) { setError(true); setLoading(false); return }
        setOcupadas(new Set((data ?? []).map((i: any) => i.habitacion).filter((h: any) => h != null)))
        setLoading(false)
      })
  }, [])

  // Si la lista de ocupadas no se pudo cargar, no se bloquea el
  // formulario entero por eso — se cae al campo de número libre, que
  // es peor pero sigue dejando trabajar.
  if (error) {
    return (
      <input
        ref={ref as any}
        type="number" min={1} max={33} className="input"
        value={value} onChange={(e) => onChange(e.target.value)}
        placeholder="Nº de habitación"
      />
    )
  }

  const habitaciones = Array.from({ length: 33 }, (_, i) => i + 1)
  const disponibles = habitaciones.filter((n) => !ocupadas.has(n) || n === habitacionActual)

  return (
    <select ref={ref} className="input" value={value} onChange={(e) => onChange(e.target.value)} disabled={loading}>
      <option value="">— Sin asignar —</option>
      {disponibles.map((n) => (
        <option key={n} value={n}>
          Habitación {n}{n === habitacionActual ? ' (actual)' : ''}
        </option>
      ))}
    </select>
  )
})

export default SelectorHabitacion
