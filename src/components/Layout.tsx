import { NavLink, Outlet } from "react-router-dom"
import {
  Users, ClipboardList, AlertTriangle,
  BarChart2, Settings, Activity, Home
} from 'lucide-react'

const navItems = [
  { to: '/', icon: Home, label: 'Inicio', end: true },
  { to: '/pacientes', icon: Users, label: 'Pacientes' },
  { to: '/items', icon: ClipboardList, label: 'Hoja de Ítems' },
  { to: '/eventos', icon: AlertTriangle, label: 'Eventos' },
  { to: '/dashboard', icon: BarChart2, label: 'Dashboard' },
  { to: '/configuracion', icon: Settings, label: 'Configuración' },
]

export default function Layout() {
  return (
    <div className="flex h-screen overflow-hidden bg-slate-50">
      {/* Sidebar */}
      <aside className="w-56 bg-white border-r flex flex-col shrink-0">
        {/* Logo */}
        <div className="px-5 py-5 border-b">
          <div className="flex items-center gap-2">
            <div className="w-7 h-7 bg-primary-600 rounded-lg flex items-center justify-center">
              <Activity className="w-4 h-4 text-white" />
            </div>
            <div>
              <p className="text-sm font-bold text-slate-800 leading-tight">CJA</p>
              <p className="text-[10px] text-slate-400 leading-tight">Hospitalización</p>
            </div>
          </div>
        </div>

        {/* Nav */}
        <nav className="flex-1 py-4 px-3 space-y-0.5 overflow-y-auto">
          {navItems.map(({ to, icon: Icon, label, end }) => (
            <NavLink
              key={to}
              to={to}
              end={end}
              className={({ isActive }) =>
                `flex items-center gap-3 px-3 py-2 rounded-lg text-sm transition-colors duration-100 ${
                  isActive
                    ? 'bg-primary-50 text-primary-700 font-semibold'
                    : 'text-slate-500 hover:bg-slate-50 hover:text-slate-700'
                }`
              }
            >
              <Icon className="w-4 h-4 shrink-0" />
              {label}
            </NavLink>
          ))}
        </nav>

        {/* Footer */}
        <div className="px-5 py-4 border-t">
          <p className="text-[10px] text-slate-400">Clínica Josefina Arregui</p>
          <p className="text-[10px] text-slate-400">Alsasua · v1.0.0</p>
        </div>
      </aside>

      {/* Main content */}
      <main className="flex-1 overflow-y-auto">
        <Outlet />
      </main>
    </div>
  )
}
