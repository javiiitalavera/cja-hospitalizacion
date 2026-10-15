import { useState } from 'react'
import { Link, NavLink, Outlet, useLocation, useNavigate } from "react-router-dom"
import {
  ClipboardList, AlertTriangle,
  BarChart2, Home, ChevronLeft, LogOut, UserCog, History, Search, Bandage, ClipboardCheck
} from 'lucide-react'
import { useAuth } from '../lib/AuthContext'
import { hayCambiosSinGuardar } from '../lib/avisoSalida'
import { useConfirmarSalida } from './useConfirmarSalida'
import { ErrorBoundary } from './ErrorBoundary'
import logo from '../assets/logo.png'

const ROL_LABEL: Record<string, string> = {
  medico: 'Médico/a',
  enfermeria: 'Enfermería',
  auxiliar: 'Auxiliar',
  tecnico: 'Técnico/a',
}

const navItems = [
  // grupo: los bloques se separan con una línea fina (navegar / registro diario / administración).
  { to: '/', icon: Home, label: 'Inicio', end: true, grupo: 1 },
  // «Buscador» reúne pacientes e informes (selector dentro de la pantalla): se ve activo en las dos direcciones.
  { to: '/pacientes', icon: Search, label: 'Buscador', grupo: 1, tambien: ['/informes'] },
  { to: '/items', icon: ClipboardList, label: 'Hoja de ítems', grupo: 2 },
  { to: '/hojas-turno', icon: ClipboardCheck, label: 'Hojas de turno', grupo: 2 },
  { to: '/curas', icon: Bandage, label: 'Pauta de curas', grupo: 2 },
  { to: '/eventos', icon: AlertTriangle, label: 'Incidencias', grupo: 2 },
  { to: '/dashboard', icon: BarChart2, label: 'Dashboard', soloAdmin: true, grupo: 3 },
  { to: '/personal', icon: UserCog, label: 'Personal', soloAdmin: true, grupo: 3 },
  { to: '/auditoria', icon: History, label: 'Auditoría', soloAdmin: true, grupo: 3 },
]

export default function Layout() {
  const [collapsed, setCollapsed] = useState(false)
  const navigate = useNavigate()
  const location = useLocation()
  const { permitirSalida, dialogoSalida } = useConfirmarSalida()
  // Enlaces del menú: con cambios sin guardar se pregunta antes de salir; sin ellos funcionan como siempre.
  async function irConAviso(e: React.MouseEvent, to: string) {
    if (!hayCambiosSinGuardar()) return
    e.preventDefault()
    if (await permitirSalida()) navigate(to)
  }
  const { profesional, rol, esAdmin, signOut } = useAuth()
  const items = navItems.filter((i) => !i.soloAdmin || esAdmin)

  return (
    <div className="app-fondo flex h-screen overflow-hidden bg-slate-50">
      <aside className={`app-lateral bg-white border-r flex flex-col shrink-0 transition-all duration-200 ${collapsed ? 'w-14' : 'w-56'}`}>
        {/* Cabecera */}
        <div className="border-b px-3 py-4 flex items-center justify-between gap-2">
          {/* Logo — siempre visible, expande si colapsado */}
          <button
            onClick={async () => {
              if (collapsed) { setCollapsed(false); return }
              if (await permitirSalida()) navigate('/')
            }}
            className="shrink-0 rounded-lg hover:opacity-80 cursor-pointer transition-opacity"
            title={collapsed ? 'Expandir menú' : 'Ir a Inicio'}
            aria-label={collapsed ? 'Expandir menú' : 'Ir a Inicio'}
          >
            <img src={logo} alt="" className="w-8 h-8 block" />
          </button>

          {/* Texto + botón colapsar — solo cuando expandido */}
          {!collapsed && (
            <>
              <div className="flex-1 min-w-0">
                <Link to="/" title="Ir a Inicio" onClick={(e) => irConAviso(e, '/')} className="text-sm font-bold text-slate-800 leading-tight hover:text-primary-700">CJA Hospital</Link>
              </div>
              <button onClick={() => setCollapsed(true)}
                className="text-slate-500 hover:text-slate-800 transition-colors p-1 rounded shrink-0">
                <ChevronLeft className="w-4 h-4" />
              </button>
            </>
          )}
        </div>

        {/* Nav */}
        <nav className="flex-1 py-4 px-2 space-y-0.5 overflow-y-auto">
          {items.map(({ to, icon: Icon, label, end, grupo, tambien }, i) => (
            <div key={to} className={i > 0 && items[i - 1].grupo !== grupo ? 'pt-2 mt-2 border-t border-slate-100' : ''}>
            <NavLink
              to={to}
              end={end}
              onClick={(e) => irConAviso(e, to)}
              title={collapsed ? label : undefined}
              className={({ isActive: activoRuta }) => {
                const isActive = activoRuta || (tambien ?? []).some((r) => location.pathname === r || location.pathname.startsWith(r + '/'))
                return `flex items-center gap-3 px-2 py-2 rounded-lg text-sm transition-colors duration-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-300 ${
                  collapsed ? 'justify-center' : ''
                } ${
                  isActive
                    ? 'bg-primary-50 text-primary-700 font-semibold'
                    : 'text-slate-500 hover:bg-slate-50 hover:text-slate-700'
                }`
              }}
            >
              <Icon className="w-4 h-4 shrink-0" />
              {!collapsed && label}
            </NavLink>
            </div>
          ))}
        </nav>

        {/* Footer: usuario + cerrar sesión */}
        <div className="border-t">
          {!collapsed ? (
            <div className="px-3 py-3">
              {profesional && (
                <div className="mb-2">
                  <p className="text-xs font-semibold text-slate-700 leading-tight truncate">
                    {profesional.nombre} {profesional.apellidos}
                  </p>
                  <p className="text-xs text-slate-500">{rol ? ROL_LABEL[rol] ?? rol : ''}</p>
                </div>
              )}
              <button
                onClick={signOut}
                className="flex items-center gap-2 text-xs text-slate-500 hover:text-red-600 transition-colors"
              >
                <LogOut className="w-3.5 h-3.5" />
                Cerrar sesión
              </button>
              <p className="text-xs text-slate-500 mt-2">Clínica Josefina Arregui · Alsasua · v1.0.0</p>
            </div>
          ) : (
            <div className="py-3 flex justify-center">
              <button
                onClick={signOut}
                title="Cerrar sesión"
                className="text-slate-500 hover:text-red-600 transition-colors p-1"
              >
                <LogOut className="w-4 h-4" />
              </button>
            </div>
          )}
        </div>
      </aside>

      <main className="flex-1 overflow-y-auto">
        {dialogoSalida}
        {/* key: al cambiar de pantalla el error se descarta y la nueva pantalla carga normal */}
        <ErrorBoundary key={location.pathname}>
          <Outlet />
        </ErrorBoundary>
      </main>
    </div>
  )
}
