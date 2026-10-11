// Campo de fecha para filtros y consultas. Un <input type="date"> da valores «válidos» a medias mientras se
// teclea (año 0002, 0020…, o vacío si se borra un trozo): si cada uno se aplica de inmediato, la pantalla se
// recarga con fechas absurdas y reescribe el campo, y no se puede terminar de escribir. Aquí se guarda lo tecleado
// aparte y solo se avisa con `onChange` cuando la fecha está completa y es razonable (tras una breve pausa), al salir
// del campo o con Enter. Una fecha incompleta o fuera de rango se descarta y vuelve el valor anterior.

import { useEffect, useRef } from 'react'

const PRIMER_ANIO = '1990-01-01'
const PAUSA_MS = 500

// El campo no es «controlado» por React: mientras se teclea, el navegador lleva sus propios trozos (día, mes, año) y
// reescribirle el valor en cada cambio le hace perder el sitio. Solo se le escribe la fecha desde fuera cuando
// cambia `value` y el campo no se está editando, o al volver al valor anterior si lo tecleado no vale.
export function InputFecha({ value, onChange, min, max, className, disabled }: {
  value: string
  onChange: (fecha: string) => void       // fecha completa («AAAA-MM-DD») o '' si se vació el campo
  min?: string
  max?: string
  className?: string
  disabled?: boolean
}) {
  const campo = useRef<HTMLInputElement>(null)
  const temporizador = useRef<ReturnType<typeof setTimeout> | null>(null)
  const ultimo = useRef({ value, onChange })
  ultimo.current = { value, onChange }
  useEffect(() => {
    const el = campo.current
    if (el && el.value !== value && document.activeElement !== el) el.value = value
  }, [value])
  useEffect(() => () => { if (temporizador.current) clearTimeout(temporizador.current) }, [])

  const valida = (t: string) => t === '' || (t >= PRIMER_ANIO && (!min || t >= min) && (!max || t <= max))

  function confirmar(t: string) {
    if (temporizador.current) { clearTimeout(temporizador.current); temporizador.current = null }
    if (t === ultimo.current.value) return
    if (valida(t)) ultimo.current.onChange(t)
    else if (campo.current) campo.current.value = ultimo.current.value
  }

  return (
    <input
      ref={campo}
      type="date"
      className={className ?? 'input'}
      defaultValue={value}
      min={min}
      max={max}
      disabled={disabled}
      onChange={(e) => {
        const t = e.target.value
        if (temporizador.current) clearTimeout(temporizador.current)
        // Vacío (se borró un trozo mientras se edita) solo se aplica al salir del campo.
        if (t !== '' && valida(t)) temporizador.current = setTimeout(() => confirmar(t), PAUSA_MS)
      }}
      onBlur={(e) => confirmar(e.target.value)}
      onKeyDown={(e) => { if (e.key === 'Enter') confirmar(e.currentTarget.value) }}
    />
  )
}
