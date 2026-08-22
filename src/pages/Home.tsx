import { useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useAuth } from '../lib/AuthContext'
import type { Ingreso } from '../types'
import { Plus, ClipboardList, ChevronRight, AlertTriangle } from 'lucide-react'
import FormularioEvento from '../components/FormularioEvento'
import { TIPO_EVENTO_LABEL, TIPO_EVENTO_COLOR, type TipoEvento } from '../types/eventos'

type IngresoConPaciente = Ingreso & {
  paciente: {
    nombre: string
    primer_apellido: string
    segundo_apellido?: string
    fecha_nacimiento?: string
    nhc?: string
  } | null
  medico_responsable: { nombre: string; apellidos: string } | null
}

const SEMAFORO: Record<string, string> = {
  verde: '#92D050',
  amarillo: '#FFFF00',
  naranja: '#FF9900',
  rojo: '#FF0000',
}

function edad(fnac?: string) {
  if (!fnac) return null
  return Math.floor((Date.now() - new Date(fnac).getTime()) / 31557600000)
}

function diasIngresado(fecha?: string) {
  if (!fecha) return null
  return Math.floor((Date.now() - new Date(fecha).getTime()) / 86400000)
}

export default function Home() {
  const [ingresos, setIngresos] = useState<IngresoConPaciente[]>([])
  const [items, setItems] = useState<Record<string, { semaforo_caidas?: string }>>({})
  const [informes, setInformes] = useState<Record<string, { impresion_diagnostica?: string; motivo_ingreso?: string }>>(
    {}
  )
  const [eventosPorIngreso, setEventosPorIngreso] = useState<Record<string, string[]>>({})
  const [loading, setLoading] = useState(true)
  const [modalEvento, setModalEvento] = useState<string | null>(null) // ingresoId
  const navigate = useNavigate()
  const { rol } = useAuth()
  const esMedico = rol === 'medico'

  const today = new Date().toLocaleDateString('es-ES', {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  })

  async function fetchData() {
    const { data } = await supabase
      .from('ingresos')
      .select(
        '*, paciente:pacientes(nombre,primer_apellido,segundo_apellido,fecha_nacimiento,nhc), medico_responsable:profesionales(nombre,apellidos)'
      )
      .eq('estado', 'activo')
      .order('habitacion', { ascending: true })

    const list = (data ?? []) as IngresoConPaciente[]
    setIngresos(list)

    if (list.length > 0) {
      const ids = list.map((i) => i.id)

      const [{ data: itemsData }, { data: informesData }, { data: eventosData }] = await Promise.all([
        supabase.from('items_paciente').select('ingreso_id,semaforo_caidas').in('ingreso_id', ids),
        supabase.from('informe_ingreso').select('ingreso_id,impresion_diagnostica').in('ingreso_id', ids),
        supabase.from('eventos').select('ingreso_id,tipo').in('ingreso_id', ids),
      ])

      const itemsMap: Record<string, { semaforo_caidas?: string }> = {}
      ;(itemsData ?? []).forEach((it: any) => {
        itemsMap[it.ingreso_id] = it
      })
      setItems(itemsMap)

      const informesMap: Record<string, { impresion_diagnostica?: string }> = {}
      ;(informesData ?? []).forEach((inf: any) => {
        informesMap[inf.ingreso_id] = inf
      })
      setInformes(informesMap)

      // Tipos de incidencia por ingreso, para el aviso rápido en la tabla.
      const eventosMap: Record<string, string[]> = {}
      ;(eventosData ?? []).forEach((ev: any) => {
        if (!eventosMap[ev.ingreso_id]) eventosMap[ev.ingreso_id] = []
        eventosMap[ev.ingreso_id].push(ev.tipo)
      })
      setEventosPorIngreso(eventosMap)
    }
    setLoading(false)
  }

  useEffect(() => {
    fetchData()
  }, [])

  const slots: (IngresoConPaciente | null)[] = Array(32).fill(null)
  ingresos.forEach((i) => {
    if (i.habitacion && i.habitacion >= 1 && i.habitacion <= 32) slots[i.habitacion - 1] = i
  })

  const ocupadas = ingresos.length
  const libres = 32 - ocupadas

  // Find the ingreso for the evento modal
  const ingresoParaEvento = ingresos.find((i) => i.id === modalEvento) ?? null

  return (
    <div className="p-6">
      {/* Header */}
      <div className="flex items-start justify-between mb-5">
        <div>
          <h1 className="text-2xl font-bold text-slate-800">Unidad de Hospitalización</h1>
          <p className="text-sm text-slate-400 capitalize mt-0.5">{today}</p>
        </div>
        <div className="flex items-center gap-2 text-sm">
          <span className="px-3 py-1 bg-emerald-50 text-emerald-700 rounded-full font-medium">
            {ocupadas} ingresados
          </span>
          <span className="px-3 py-1 bg-slate-100 text-slate-500 rounded-full font-medium">{libres} libres</span>
        </div>
      </div>

      {/* Acciones rápidas */}
      <div className="flex gap-2 mb-5">
        {esMedico && (
          <Link to="/pacientes/nuevo" className="btn-primary">
            <Plus className="w-4 h-4" /> Nuevo ingreso
          </Link>
        )}
        <Link to="/items" className="btn-secondary">
          <ClipboardList className="w-4 h-4" /> Hoja de ítems
        </Link>
      </div>

      {/* Tabla de habitaciones */}
      {loading ? (
        <div className="text-slate-400 py-12 text-center">Cargando…</div>
      ) : (
        <div className="grid grid-cols-1 gap-1">
          {/* Cabecera */}
          <div
            className="grid gap-px text-xs font-semibold text-slate-400 uppercase tracking-wide px-3 pb-1"
            style={{ gridTemplateColumns: '2.5rem minmax(0,1.4fr) 3rem 3.5rem 5.5rem minmax(0,0.9fr) 3rem 7rem 2rem' }}
          >
            <div>Hab.</div>
            <div>Paciente</div>
            <div>Edad</div>
            <div>Días</div>
            <div>Ingreso</div>
            <div>Médico</div>
            <div></div>
            <div>Incidencia</div>
            <div></div>
          </div>

          {slots.map((ingreso, idx) => {
            const n = idx + 1
            const sem = ingreso ? items[ingreso.id]?.semaforo_caidas : undefined
            const semColor = sem ? SEMAFORO[sem] : null
            const textClr = sem === 'rojo' ? '#fff' : '#000'

            if (!ingreso) {
              return (
                <div
                  key={n}
                  className={`grid items-center border border-dashed border-slate-150 rounded-lg px-3 py-1.5 transition-colors ${
                    esMedico ? 'cursor-pointer hover:border-primary-300 hover:bg-primary-50/30' : ''
                  }`}
                  style={{ gridTemplateColumns: '2.5rem minmax(0,1.4fr) 3rem 3.5rem 5.5rem minmax(0,0.9fr) 3rem 7rem 2rem' }}
                  onClick={esMedico ? () => navigate(`/pacientes/nuevo?habitacion=${n}`) : undefined}
                  title={esMedico ? `Ingresar en habitación ${n}` : `Habitación ${n} libre`}
                >
                  <span className="text-xs font-bold text-slate-200">{n}</span>
                  <span className="text-xs text-slate-200">— libre —</span>
                  <span />
                  <span />
                  <span />
                  <span />
                  <span />
                  <span />
                  <span />
                </div>
              )
            }

            const p = ingreso.paciente
            const nombreCompleto = p
              ? `${p.primer_apellido}${p.segundo_apellido ? ' ' + p.segundo_apellido : ''}, ${p.nombre}`
              : '—'
            const e = edad(p?.fecha_nacimiento ?? undefined)
            const dias = diasIngresado(ingreso.fecha_ingreso)
            const fingreso = ingreso.fecha_ingreso
              ? new Date(ingreso.fecha_ingreso).toLocaleDateString('es-ES', {
                  day: '2-digit',
                  month: '2-digit',
                  year: '2-digit',
                })
              : '—'
            const medico = ingreso.medico_responsable
              ? `${ingreso.medico_responsable.nombre} ${ingreso.medico_responsable.apellidos}`.trim()
              : '—'
            const diagnostico = informes[ingreso.id]?.impresion_diagnostica ?? ingreso.motivo_ingreso ?? ''
            const diagnosticoCorto = diagnostico.length > 60 ? diagnostico.slice(0, 57) + '…' : diagnostico

            return (
              <div key={n} className="group">
                <div
                  className="grid items-center bg-white border border-slate-200 rounded-lg px-3 py-2 hover:shadow-sm hover:border-primary-200 transition-all cursor-pointer"
                  style={{ gridTemplateColumns: '2.5rem minmax(0,1.4fr) 3rem 3.5rem 5.5rem minmax(0,0.9fr) 3rem 7rem 2rem' }}
                  onClick={() => navigate(`/ingresos/${ingreso.id}`)}
                >
                  {/* Hab con semáforo */}
                  <div>
                    <div
                      className="w-7 h-7 rounded-lg flex items-center justify-center font-bold text-xs"
                      style={
                        semColor
                          ? { backgroundColor: semColor, color: textClr }
                          : { backgroundColor: '#f1f5f9', color: '#475569' }
                      }
                    >
                      {n}
                    </div>
                  </div>
                  {/* Nombre + diagnóstico */}
                  <div className="min-w-0 pr-2">
                    <p className="font-semibold text-slate-800 text-sm leading-tight truncate">{nombreCompleto}</p>
                    {diagnosticoCorto && (
                      <p className="text-xs text-slate-400 truncate leading-tight">{diagnosticoCorto}</p>
                    )}
                  </div>
                  {/* Edad */}
                  <div className="text-slate-500 text-xs">{e != null ? `${e}a` : '—'}</div>
                  {/* Días */}
                  <div>
                    {dias != null && (
                      <span
                        className={`text-xs font-medium px-1.5 py-0.5 rounded-full ${
                          dias > 60
                            ? 'bg-amber-100 text-amber-700'
                            : dias > 30
                              ? 'bg-yellow-50 text-yellow-600'
                              : 'text-slate-400'
                        }`}
                      >
                        {dias}d
                      </span>
                    )}
                  </div>
                  {/* F. ingreso */}
                  <div className="text-slate-400 text-xs">{fingreso}</div>
                  {/* Médico */}
                  <div className="text-slate-500 text-xs truncate">{medico}</div>
                  {/* Aviso de incidencias registradas, si las hay */}
                  {(() => {
                    const tipos = eventosPorIngreso[ingreso.id]
                    if (!tipos || tipos.length === 0) return <div />
                    // Contar por tipo, respetando el orden habitual de tipos
                    const conteo: Record<string, number> = {}
                    tipos.forEach((t) => { conteo[t] = (conteo[t] ?? 0) + 1 })
                    const entradas = Object.entries(conteo).sort((a, b) => b[1] - a[1])
                    return (
                      <div className="relative group/badge">
                        <div className="flex items-center gap-1 text-red-600 text-xs font-medium cursor-default w-fit">
                          <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
                          {tipos.length}
                        </div>
                        {/* Tooltip a medida: oculto por defecto, aparece al pasar el ratón */}
                        <div className="hidden group-hover/badge:block absolute z-20 left-1/2 -translate-x-1/2 bottom-full mb-1.5 w-max max-w-[220px]">
                          <div className="bg-slate-800 text-white rounded-lg shadow-lg py-2 px-3 space-y-1">
                            <p className="text-[10px] font-semibold text-slate-300 uppercase tracking-wide mb-1">
                              Incidencias registradas
                            </p>
                            {entradas.map(([tipo, n]) => (
                              <div key={tipo} className="flex items-center gap-1.5 text-xs">
                                <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${
                                  (TIPO_EVENTO_COLOR[tipo as TipoEvento] ?? '').split(' ').find(c => c.startsWith('bg-')) ?? 'bg-slate-400'
                                }`} />
                                <span className="text-slate-100">{TIPO_EVENTO_LABEL[tipo as TipoEvento] ?? tipo}</span>
                                <span className="text-slate-400 ml-auto">×{n}</span>
                              </div>
                            ))}
                          </div>
                          {/* Flechita apuntando hacia el icono */}
                          <div className="w-2 h-2 bg-slate-800 rotate-45 absolute left-1/2 -translate-x-1/2 -bottom-1" />
                        </div>
                      </div>
                    )
                  })()}
                  {/* Botón evento */}
                  <div
                    onClick={(e) => {
                      e.stopPropagation()
                      setModalEvento(ingreso.id)
                    }}
                    className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-amber-50 border border-amber-200 text-amber-700 hover:bg-amber-100 transition-colors text-xs font-medium cursor-pointer"
                    title="Registrar incidencia"
                  >
                    <AlertTriangle className="w-3 h-3 shrink-0" />
                    Incidencia
                  </div>
                  {/* Arrow */}
                  <div className="flex justify-end">
                    <ChevronRight className="w-4 h-4 text-slate-200 group-hover:text-slate-400 transition-colors" />
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      )}

      {/* Modal registro de evento */}
      {modalEvento && ingresoParaEvento && (
        <FormularioEvento
          ingresoId={modalEvento}
          eventoExistente={null}
          onClose={() => setModalEvento(null)}
          onGuardado={() => {
            setModalEvento(null)
            fetchData()
          }}
        />
      )}
    </div>
  )
}
