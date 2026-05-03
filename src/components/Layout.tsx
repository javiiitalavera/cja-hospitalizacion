import { useState } from 'react'
import { NavLink, Outlet } from "react-router-dom"
import {
  Users, ClipboardList, AlertTriangle,
  BarChart2, Settings, Activity, Home, ChevronLeft
} from 'lucide-react'

const navItems = [
  { to: '/', icon: Home, label: 'Inicio', end: true },
  { to: '/pacientes', icon: Users, label: 'Pacientes' },
  { to: '/items', icon: ClipboardList, label: 'Hoja de Ítems' },
  { to: '/eventos', icon: AlertTriangle, label: 'Incidencias' },
  { to: '/dashboard', icon: BarChart2, label: 'Dashboard' },
  { to: '/configuracion', icon: Settings, label: 'Configuración' },
]

export default function Layout() {
  const [collapsed, setCollapsed] = useState(false)

  return (
    <div className="flex h-screen overflow-hidden bg-slate-50">
      <aside className={`bg-white border-r flex flex-col shrink-0 transition-all duration-200 ${collapsed ? 'w-14' : 'w-56'}`}>
        {/* Cabecera */}
        <div className="border-b px-3 py-4 flex items-center justify-between gap-2">
          {/* Icono — siempre visible, expande si colapsado */}
          <button
            onClick={() => collapsed && setCollapsed(false)}
            className={`w-7 h-7 bg-primary-600 rounded-lg flex items-center justify-center shrink-0 ${collapsed ? 'hover:bg-primary-700 cursor-pointer' : 'cursor-default'} transition-colors`}
            title={collapsed ? 'Expandir menú' : undefined}
          >
            <Activity className="w-4 h-4 text-white" />
          </button>

          {/* Texto + botón colapsar — solo cuando expandido */}
          {!collapsed && (
            <>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-bold text-slate-800 leading-tight">CJA</p>
                <p className="text-[10px] text-slate-400 leading-tight">Hospitalización</p>
              </div>
              <button onClick={() => setCollapsed(true)}
                className="text-slate-300 hover:text-slate-500 transition-colors p-1 rounded shrink-0">
                <ChevronLeft className="w-4 h-4" />
              </button>
            </>
          )}
        </div>

        {/* Nav */}
        <nav className="flex-1 py-4 px-2 space-y-0.5 overflow-y-auto">
          {navItems.map(({ to, icon: Icon, label, end }) => (
            <NavLink
              key={to}
              to={to}
              end={end}
              title={collapsed ? label : undefined}
              className={({ isActive }) =>
                `flex items-center gap-3 px-2 py-2 rounded-lg text-sm transition-colors duration-100 ${
                  collapsed ? 'justify-center' : ''
                } ${
                  isActive
                    ? 'bg-primary-50 text-primary-700 font-semibold'
                    : 'text-slate-500 hover:bg-slate-50 hover:text-slate-700'
                }`
              }
            >
              <Icon className="w-4 h-4 shrink-0" />
              {!collapsed && label}
            </NavLink>
          ))}
        </nav>

        {/* Footer */}
        {!collapsed && (
          <div className="px-4 py-3 border-t">
            <p className="text-[10px] text-slate-400">Clínica Josefina Arregui</p>
            <p className="text-[10px] text-slate-400">Alsasua · v1.0.0</p>
          </div>
        )}
      </aside>

      <main className="flex-1 overflow-y-auto">
        <Outlet />
      </main>
    </div>
  )
}
