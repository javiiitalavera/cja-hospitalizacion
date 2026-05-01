import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { Users, ClipboardList, AlertTriangle, BedDouble } from 'lucide-react'

export default function Home() {
  const [stats, setStats] = useState({
    pacientesActivos: 0,
    ingresosHoy: 0,
    eventosEsteMes: 0,
    camasLibres: 0,
  })
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    async function fetchStats() {
      const [{ count: activos }, { count: eventosEsteMes }] = await Promise.all([
        supabase.from('ingresos').select('*', { count: 'exact', head: true }).eq('estado', 'activo'),
        supabase.from('eventos').select('*', { count: 'exact', head: true })
          .gte('fecha', new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString()),
      ])
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
    </div>
  )
}
