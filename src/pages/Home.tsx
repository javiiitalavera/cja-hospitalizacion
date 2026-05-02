import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { Users, ClipboardList, AlertTriangle, BedDouble, Clock } from 'lucide-react'
import { TIPO_EVENTO_LABEL, TIPO_EVENTO_COLOR, type Evento } from '../types/eventos'

export default function Home() {
  const [eventosRecientes, setEventosRecientes] = useState<Evento[]>([])
  const [stats, setStats] = useState({
    pacientesActivos: 0,
    ingresosHoy: 0,
    eventosEsteMes: 0,
    camasLibres: 0,
  })
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    async function fetchStats() {
      const ayer = new Date()
    ayer.setDate(ayer.getDate() - 1)

    const [{ count: activos }, { count: eventosEsteMes }, { data: recientes }] = await Promise.all([
        supabase.from('ingresos').select('*', { count: 'exact', head: true }).eq('estado', 'activo'),
        supabase.from('eventos').select('*', { count: 'exact', head: true })
          .gte('fecha', new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString()),
        supabase.from('eventos')
          .select('*, registrado_por:profesionales(nombre, apellidos), ingreso:ingresos(habitacion, paciente:pacientes(nombre, primer_apellido))')
          .gte('fecha', ayer.toISOString().split('T')[0])
          .order('created_at', { ascending: false })
          .limit(5),
      ])
      setEventosRecientes((recientes ?? []) as Evento[])
      setStats({
        pacientesActivos: activos ?? 0,
        ingresosHoy: 0,
        eventosEsteMes: eventosEsteMes ?? 0,
        camasLibres: 32 - (activos ?? 0),
      })
      setLoading(false)
    }
    fetchStats()
  }, [])

  const today = new Date().toLocaleDateString('es-ES', {
    weekday: 'long', year: 'numeric', month: 'long', day: 'numeric'
  })

  const cards = [
    {
      label: 'Pacientes ingresados',
      value: stats.pacientesActivos,
      icon: Users,
      color: 'text-primary-600 bg-primary-50',
      to: '/pacientes',
    },
    {
      label: 'Camas libres',
      value: stats.camasLibres,
      icon: BedDouble,
      color: 'text-emerald-600 bg-emerald-50',
      to: '/pacientes',
    },
    {
      label: 'Eventos este mes',
      value: stats.eventosEsteMes,
      icon: AlertTriangle,
      color: 'text-amber-600 bg-amber-50',
      to: '/eventos',
    },
    {
      label: 'Hoja de ítems',
      value: 'Ver hoy',
      icon: ClipboardList,
      color: 'text-violet-600 bg-violet-50',
      to: '/items',
    },
  ]

  return (
    <div className="p-8">
      {/* Header */}
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-slate-800">Unidad de Hospitalización</h1>
        <p className="text-sm text-slate-400 capitalize mt-0.5">{today}</p>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 xl:grid-cols-4 gap-4 mb-8">
        {cards.map(({ label, value, icon: Icon, color, to }) => (
          <Link key={label} to={to} className="card p-5 hover:shadow-md transition-shadow">
            <div className={`w-9 h-9 rounded-lg flex items-center justify-center mb-3 ${color}`}>
              <Icon className="w-5 h-5" />
            </div>
            <p className="text-2xl font-bold text-slate-800 mb-0.5">
              {loading ? '—' : value}
            </p>
            <p className="text-xs text-slate-500">{label}</p>
          </Link>
        ))}
      </div>

      {/* Quick actions */}
      <div className="card p-6">
        <p className="section-title">Acciones rápidas</p>
        <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
          <Link to="/pacientes/nuevo" className="btn-primary justify-center py-3">
            <Users className="w-4 h-4" />
            Nuevo ingreso
          </Link>
          <Link to="/items" className="btn-secondary justify-center py-3">
            <ClipboardList className="w-4 h-4" />
            Abrir hoja de ítems
          </Link>
          <Link to="/eventos/nuevo" className="btn-secondary justify-center py-3">
            <AlertTriangle className="w-4 h-4" />
            Registrar evento
          </Link>
        </div>
      </div>

      {/* Panel alertas eventos recientes */}
      {eventosRecientes.length > 0 && (
        <div className="card p-6 mt-5">
          <div className="flex items-center gap-2 mb-4">
            <Clock className="w-4 h-4 text-amber-500" />
            <p className="section-title mb-0">Eventos últimas 24h</p>
          </div>
          <div className="space-y-2">
            {eventosRecientes.map(ev => {
              const paciente = (ev.ingreso as any)?.paciente
              const hab = (ev.ingreso as any)?.habitacion
              return (
                <div key={ev.id} className="flex items-center gap-3 py-2 border-b last:border-0">
                  <span className={`px-2 py-0.5 rounded-full text-xs font-semibold border shrink-0 ${TIPO_EVENTO_COLOR[ev.tipo]}`}>
                    {TIPO_EVENTO_LABEL[ev.tipo]}
                  </span>
                  <span className="text-sm text-slate-700 flex-1">
                    {paciente ? `${paciente.primer_apellido}, ${paciente.nombre}` : '—'}
                    {hab && <span className="text-slate-400"> · Hab. {hab}</span>}
                  </span>
                  <span className="text-xs text-slate-400 shrink-0">
                    {new Date(ev.fecha).toLocaleDateString('es-ES')}
                  </span>
                </div>
              )
            })}
          </div>
        </div>
      )}
    </div>
  )
}
