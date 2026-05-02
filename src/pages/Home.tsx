import { useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import type { Ingreso } from '../types'
import { Plus, ClipboardList, AlertTriangle, ChevronRight } from 'lucide-react'

type IngresoConPaciente = Ingreso & {
  paciente: { nombre: string; primer_apellido: string; segundo_apellido?: string; fecha_nacimiento?: string; nhc?: string } | null
  medico_responsable: { nombre: string; apellidos: string } | null
}

const SEMAFORO: Record<string, string> = {
  verde: '#92D050', amarillo: '#FFFF00', naranja: '#FF9900', rojo: '#FF0000',
}

function edad(fnac?: string) {
  if (!fnac) return null
  return Math.floor((Date.now() - new Date(fnac).getTime()) / 31557600000)
}

export default function Home() {
  const [ingresos, setIngresos] = useState<IngresoConPaciente[]>([])
  const [items, setItems] = useState<Record<string, { semaforo_caidas?: string }>>({})
  const [loading, setLoading] = useState(true)
  const navigate = useNavigate()

  const today = new Date().toLocaleDateString('es-ES', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })

  useEffect(() => {
    async function fetch() {
      const { data } = await supabase
        .from('ingresos')
        .select('*, paciente:pacientes(nombre,primer_apellido,segundo_apellido,fecha_nacimiento,nhc), medico_responsable:profesionales(nombre,apellidos)')
        .eq('estado', 'activo')
        .order('habitacion', { ascending: true })

      const list = (data ?? []) as IngresoConPaciente[]
      setIngresos(list)

      // Fetch semaforo for each ingreso
      if (list.length > 0) {
        const ids = list.map(i => i.id)
        const { data: itemsData } = await supabase
          .from('items_paciente')
          .select('ingreso_id, semaforo_caidas')
          .in('ingreso_id', ids)
        const map: Record<string, { semaforo_caidas?: string }> = {}
        ;(itemsData ?? []).forEach((it: any) => { map[it.ingreso_id] = it })
        setItems(map)
      }
      setLoading(false)
    }
    fetch()
  }, [])

  // Build grid of 33 slots
  const slots: (IngresoConPaciente | null)[] = Array(33).fill(null)
  ingresos.forEach(i => { if (i.habitacion && i.habitacion >= 1 && i.habitacion <= 33) slots[i.habitacion - 1] = i })

  const ocupadas = ingresos.length
  const libres = 33 - ocupadas

  return (
    <div className="p-6">
      {/* Header */}
      <div className="flex items-start justify-between mb-5">
        <div>
          <h1 className="text-2xl font-bold text-slate-800">Unidad de Hospitalización</h1>
          <p className="text-sm text-slate-400 capitalize mt-0.5">{today}</p>
        </div>
        <div className="flex items-center gap-2 text-sm">
          <span className="px-3 py-1 bg-emerald-50 text-emerald-700 rounded-full font-medium">{ocupadas} ingresados</span>
          <span className="px-3 py-1 bg-slate-100 text-slate-500 rounded-full font-medium">{libres} libres</span>
        </div>
      </div>

      {/* Acciones rápidas */}
      <div className="flex gap-2 mb-5">
        <Link to="/pacientes/nuevo" className="btn-primary">
          <Plus className="w-4 h-4" /> Nuevo ingreso
        </Link>
        <Link to="/items" className="btn-secondary">
          <ClipboardList className="w-4 h-4" /> Hoja de ítems
        </Link>
        <Link to="/eventos" className="btn-secondary">
          <AlertTriangle className="w-4 h-4" /> Ver eventos
        </Link>
      </div>

      {/* Grid de habitaciones */}
      {loading ? (
        <div className="text-slate-400 py-12 text-center">Cargando…</div>
      ) : (
        <div className="grid grid-cols-1 gap-1.5">
          {/* Cabecera */}
          <div className="grid grid-cols-12 gap-px text-xs font-semibold text-slate-400 uppercase tracking-wide px-3 pb-1">
            <div className="col-span-1">Hab.</div>
            <div className="col-span-3">Paciente</div>
            <div className="col-span-1">Edad</div>
            <div className="col-span-2">NHC</div>
            <div className="col-span-2">Ingreso</div>
            <div className="col-span-2">Médico</div>
            <div className="col-span-1"></div>
          </div>

          {slots.map((ingreso, idx) => {
            const n = idx + 1
            const sem = ingreso ? items[ingreso.id]?.semaforo_caidas : undefined
            const semColor = sem ? SEMAFORO[sem] : null
            const textClr = sem === 'rojo' ? '#fff' : '#000'

            if (!ingreso) {
              return (
                <div key={n} className="grid grid-cols-12 gap-px items-center bg-white border border-dashed border-slate-200 rounded-lg px-3 py-2 text-xs text-slate-300">
                  <div className="col-span-1 font-bold text-slate-300">{n}</div>
                  <div className="col-span-11 text-slate-200">— libre —</div>
                </div>
              )
            }

            const p = ingreso.paciente
            const nombreCompleto = p ? `${p.primer_apellido} ${p.segundo_apellido ?? ''}, ${p.nombre}`.trim() : '—'
            const e = edad(p?.fecha_nacimiento ?? undefined)
            const fingreso = ingreso.fecha_ingreso
              ? new Date(ingreso.fecha_ingreso).toLocaleDateString('es-ES', { day: '2-digit', month: '2-digit', year: '2-digit' })
              : '—'
            const medico = ingreso.medico_responsable?.nombre ?? '—'

            return (
              <div key={n}
                className="grid grid-cols-12 gap-px items-center bg-white border border-slate-200 rounded-lg px-3 py-2.5 text-sm hover:shadow-sm hover:border-primary-200 transition-all cursor-pointer"
                onClick={() => navigate(`/pacientes/${ingreso.id}`)}>
                {/* Hab con semáforo */}
                <div className="col-span-1">
                  <div className="w-8 h-8 rounded-lg flex items-center justify-center font-bold text-sm"
                    style={semColor
                      ? { backgroundColor: semColor, color: textClr }
                      : { backgroundColor: '#f1f5f9', color: '#475569' }}>
                    {n}
                  </div>
                </div>
                {/* Nombre */}
                <div className="col-span-3">
                  <p className="font-semibold text-slate-800 text-sm leading-tight truncate">{nombreCompleto}</p>
                </div>
                {/* Edad */}
                <div className="col-span-1 text-slate-500 text-xs">{e ? `${e}a` : '—'}</div>
                {/* NHC */}
                <div className="col-span-2 text-slate-400 text-xs font-mono">{p?.nhc ?? '—'}</div>
                {/* Ingreso */}
                <div className="col-span-2 text-slate-400 text-xs">{fingreso}</div>
                {/* Médico */}
                <div className="col-span-2 text-slate-500 text-xs">{medico}</div>
                {/* Arrow */}
                <div className="col-span-1 flex justify-end">
                  <ChevronRight className="w-4 h-4 text-slate-300" />
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
