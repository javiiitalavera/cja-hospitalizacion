// Cambiar de paciente sin salir de la ficha: flechas para ir a la
// habitación anterior o siguiente (la ronda de siempre) y un buscador por
// habitación o apellido. Mantiene la pestaña en la que se está: si estás en
// Curas del paciente de la 11, pasas a Curas del de la 12.

import { useEffect, useMemo, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { ChevronLeft, ChevronRight, Search } from 'lucide-react'
import { supabase } from '../../lib/supabase'
import { quitarTildes } from '../../lib/busqueda'
import { nombreCompleto } from '../../types'

interface Item {
  id: string
  habitacion: number | null
  nombre: string
  buscable: string
}

const MAX_RESULTADOS = 8

export function NavegadorPacientes({ ingresoId }: { ingresoId: string }) {
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const [lista, setLista] = useState<Item[]>([])
  const [error, setError] = useState(false)
  const [q, setQ] = useState('')
  const [abierto, setAbierto] = useState(false)
  const [sel, setSel] = useState(0)

  useEffect(() => {
    let vivo = true
    supabase
      .from('ingresos')
      .select('id, habitacion, paciente:pacientes(nombre, primer_apellido, segundo_apellido)')
      .eq('estado', 'activo')
      .order('habitacion', { ascending: true })
      .then(({ data, error: err }) => {
        if (!vivo) return
        if (err) { setError(true); return }
        setError(false)
        setLista(
          ((data ?? []) as unknown as { id: string; habitacion: number | null; paciente: { nombre: string; primer_apellido: string; segundo_apellido: string | null } | null }[])
            .filter((i) => i.paciente)
            .map((i) => {
              const nombre = nombreCompleto(i.paciente!)
              return { id: i.id, habitacion: i.habitacion ?? null, nombre, buscable: quitarTildes(nombre).toLowerCase() }
            })
        )
      })
    return () => { vivo = false }
  }, [])

  // Para las flechas solo cuentan los pacientes con habitación, en orden.
  const ordenados = useMemo(
    () => lista.filter((i) => i.habitacion != null).sort((a, b) => a.habitacion! - b.habitacion!),
    [lista]
  )
  const pos = ordenados.findIndex((i) => i.id === ingresoId)
  const anterior = pos > 0 ? ordenados[pos - 1] : null
  const siguiente = pos >= 0 && pos < ordenados.length - 1 ? ordenados[pos + 1] : null

  const resultados = useMemo(() => {
    const t = quitarTildes(q.trim()).toLowerCase()
    if (!t) return []
    const esNumero = /^\d+$/.test(t)
    return lista
      .filter((i) => i.id !== ingresoId)
      .filter((i) => i.buscable.includes(t) || (esNumero && i.habitacion != null && String(i.habitacion).startsWith(t)))
      .sort((a, b) => {
        const ea = esNumero && String(a.habitacion) === t ? 0 : 1
        const eb = esNumero && String(b.habitacion) === t ? 0 : 1
        if (ea !== eb) return ea - eb
        return (a.habitacion ?? 999) - (b.habitacion ?? 999)
      })
      .slice(0, MAX_RESULTADOS)
  }, [q, lista, ingresoId])

  // replace: para que la flecha de volver de la ficha lleve a donde se
  // venía (Inicio, Curas…) y no recorra uno a uno los pacientes visitados.
  function ir(id: string) {
    const params = new URLSearchParams()
    for (const k of ['tab', 'sub']) {
      const v = searchParams.get(k)
      if (v) params.set(k, v)
    }
    const qs = params.toString()
    setQ('')
    setAbierto(false)
    navigate(`/ingresos/${id}${qs ? `?${qs}` : ''}`, { replace: true })
  }

  function etiqueta(i: Item | null) {
    return i ? `Hab. ${i.habitacion} · ${i.nombre}` : ''
  }

  const boton = 'p-1.5 rounded-lg border border-slate-200 text-slate-500 hover:bg-slate-50 disabled:opacity-30 disabled:hover:bg-transparent'

  if (error) return null

  return (
    <div className="flex items-center gap-1.5">
      <button
        type="button"
        aria-label="Paciente anterior"
        title={anterior ? etiqueta(anterior) : 'No hay habitación anterior'}
        disabled={!anterior}
        onClick={() => anterior && ir(anterior.id)}
        className={boton}
      >
        <ChevronLeft className="w-4 h-4" />
      </button>
      <button
        type="button"
        aria-label="Paciente siguiente"
        title={siguiente ? etiqueta(siguiente) : 'No hay habitación siguiente'}
        disabled={!siguiente}
        onClick={() => siguiente && ir(siguiente.id)}
        className={boton}
      >
        <ChevronRight className="w-4 h-4" />
      </button>

      <div className="relative">
        <Search className="w-3.5 h-3.5 text-slate-500 absolute left-2 top-1/2 -translate-y-1/2 pointer-events-none" />
        <input
          type="text"
          aria-label="Buscar paciente"
          placeholder="Hab. o apellido…"
          value={q}
          onChange={(e) => { setQ(e.target.value); setAbierto(true); setSel(0) }}
          onFocus={() => setAbierto(true)}
          onBlur={() => setTimeout(() => setAbierto(false), 120)}
          onKeyDown={(e) => {
            if (e.key === 'ArrowDown') { e.preventDefault(); setSel((s) => Math.min(s + 1, resultados.length - 1)) }
            else if (e.key === 'ArrowUp') { e.preventDefault(); setSel((s) => Math.max(s - 1, 0)) }
            else if (e.key === 'Enter' && resultados[sel]) { e.preventDefault(); ir(resultados[sel].id) }
            else if (e.key === 'Escape') { setQ(''); setAbierto(false) }
          }}
          className="input !py-1.5 !pl-7 !text-xs w-36"
        />
        {abierto && q.trim() !== '' && (
          <div role="listbox" className="absolute right-0 top-full mt-1 w-72 bg-white border border-slate-200 rounded-lg shadow-lg z-30 py-1">
            {resultados.length === 0 ? (
              <p className="px-3 py-2 text-xs text-slate-500">Ningún paciente ingresado coincide.</p>
            ) : (
              resultados.map((r, idx) => (
                <button
                  key={r.id}
                  type="button"
                  role="option"
                  aria-selected={idx === sel}
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => ir(r.id)}
                  className={`w-full text-left px-3 py-1.5 text-sm flex items-center gap-2 ${idx === sel ? 'bg-primary-50 text-primary-700' : 'text-slate-700 hover:bg-slate-50'}`}
                >
                  <span className="text-xs text-slate-500 w-10 shrink-0">{r.habitacion != null ? `Hab. ${r.habitacion}` : 'Sin hab.'}</span>
                  <span className="truncate">{r.nombre}</span>
                </button>
              ))
            )}
          </div>
        )}
      </div>
    </div>
  )
}
