import { useEffect, useRef, useState } from 'react'
import { X } from 'lucide-react'
import { supabase } from '../../lib/supabase'
import { escaparBusquedaIlike, quitarTildes } from '../../lib/busqueda'

interface Sugerencia { id: string; nombre: string; detalle: string }

// Filtro «Paciente»: se escribe parte del nombre o del apellido y se elige de la lista.
export function BuscadorPaciente({ valor, onChange }: {
  valor: { id: string; nombre: string } | null
  onChange: (p: { id: string; nombre: string } | null) => void
}) {
  const [texto, setTexto] = useState('')
  const [sugerencias, setSugerencias] = useState<Sugerencia[]>([])
  const [abierto, setAbierto] = useState(false)
  const [buscando, setBuscando] = useState(false)
  const contador = useRef(0)

  useEffect(() => {
    const q = texto.trim()
    if (q.length < 2) { setSugerencias([]); return }
    const mia = ++contador.current
    setBuscando(true)
    const t = setTimeout(async () => {
      const patron = escaparBusquedaIlike(quitarTildes(q))
      const { data } = await supabase
        .from('pacientes')
        .select('id, nombre, primer_apellido, segundo_apellido')
        .or(`primer_apellido_normalizado.ilike.${patron},segundo_apellido_normalizado.ilike.${patron},nombre_normalizado.ilike.${patron}`)
        .limit(8)
      if (mia !== contador.current) return
      setSugerencias(((data ?? []) as any[]).map((p) => ({
        id: p.id,
        nombre: `${p.nombre} ${p.primer_apellido}`.trim(),
        detalle: [p.primer_apellido, p.segundo_apellido].filter(Boolean).join(' ') + ', ' + p.nombre,
      })))
      setBuscando(false)
    }, 250)
    return () => clearTimeout(t)
  }, [texto])

  if (valor) {
    return (
      <div className="input flex items-center justify-between gap-2">
        <span className="truncate">{valor.nombre}</span>
        <button type="button" aria-label="Quitar el filtro de paciente" onClick={() => { onChange(null); setTexto('') }}
          className="text-slate-400 hover:text-slate-700 shrink-0"><X className="w-4 h-4" /></button>
      </div>
    )
  }

  return (
    <div className="relative">
      <input className="input" value={texto} placeholder="Nombre o apellido…" autoComplete="off"
        onChange={(e) => { setTexto(e.target.value); setAbierto(true) }}
        onFocus={() => setAbierto(true)}
        onBlur={() => setTimeout(() => setAbierto(false), 150)} />
      {abierto && texto.trim().length >= 2 && (
        <div className="absolute z-30 left-0 right-0 mt-1 bg-white border rounded-xl shadow-lg overflow-hidden">
          {sugerencias.length === 0 ? (
            <p className="px-3 py-2 text-xs text-slate-500">{buscando ? 'Buscando…' : 'Ningún paciente coincide.'}</p>
          ) : sugerencias.map((s) => (
            <button type="button" key={s.id}
              className="w-full text-left px-3 py-1.5 text-sm hover:bg-primary-50 border-b last:border-0"
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => { onChange({ id: s.id, nombre: s.nombre }); setTexto(''); setAbierto(false) }}>
              {s.detalle}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
