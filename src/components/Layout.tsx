import { useState } from 'react'
import { NavLink, Outlet } from "react-router-dom"
import {
  Users, ClipboardList, AlertTriangle,
  BarChart2, Settings, Activity, Home, ChevronLeft, ChevronRight
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
  const [collapsed, setCollapsed] = useState(false)

  return (
    <div className="relative flex h-screen overflow-hidden bg-slate-50">
      {/* Sidebar */}
      <aside className={`bg-white border-r flex flex-col shrink-0 transition-all duration-200 ${collapsed ? 'w-14' : 'w-56'}`}>
        {/* Logo + toggle */}
        <div className={`border-b flex items-center ${collapsed ? 'justify-center py-4 px-0' : 'px-4 py-4 justify-between'}`}>
          {!collapsed && (
            <div className="flex items-center gap-2">
              <div className="w-7 h-7 bg-primary-600 rounded-lg flex items-center justify-center shrink-0">
                <Activity className="w-4 h-4 text-white" />
              </div>
              <div>
                <p className="text-sm font-bold text-slate-800 leading-tight">CJA</p>
                <p className="text-[10px] text-slate-400 leading-tight">Hospitalización</p>
              </div>
            </div>
          )}
          {collapsed && (
            <button onClick={() => setCollapsed(false)}
              title="Expandir menú"
              className="w-7 h-7 bg-primary-600 rounded-lg flex items-center justify-center hover:bg-primary-700 transition-colors">
              <Activity className="w-4 h-4 text-white" />
            </button>
          )}
          {!collapsed && (
            <button onClick={() => setCollapsed(true)}
              className="text-slate-300 hover:text-slate-500 transition-colors p-1 rounded">
              <ChevronLeft className="w-4 h-4" />
            </button>
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

      {/* Floating toggle button on sidebar edge */}
      <button
        onClick={() => setCollapsed(v => !v)}
        className="absolute top-6 z-10 flex items-center justify-center w-5 h-10 bg-white border border-slate-200 rounded-r-lg shadow-sm hover:bg-slate-50 hover:shadow-md transition-all"
        style={{ left: collapsed ? '3.5rem' : '14rem' }}
        title={collapsed ? 'Expandir menú' : 'Colapsar menú'}
      >
        {collapsed
          ? <ChevronRight className="w-3 h-3 text-slate-400" />
          : <ChevronLeft className="w-3 h-3 text-slate-400" />
        }
      </button>

      {/* Main content */}
      <main className="flex-1 overflow-y-auto">
        <Outlet />
      </main>
    </div>
  )
}
