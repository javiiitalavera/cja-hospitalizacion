import { useEffect, useState } from 'react'
import { Link, NavLink, Outlet, useLocation, useNavigate } from "react-router-dom"
import {
  ClipboardList, AlertTriangle,
  BarChart2, Home, ChevronLeft, LogOut, UserCog, History, Search, Bandage, ClipboardCheck, Menu, X
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
  { to: '/curas', icon: Bandage, label: 'Curas y piel', grupo: 2 },
  { to: '/eventos', icon: AlertTriangle, label: 'Incidencias', grupo: 2 },
  { to: '/dashboard', icon: BarChart2, label: 'Dashboard', soloAdmin: true, grupo: 3 },
  { to: '/personal', icon: UserCog, label: 'Personal', soloAdmin: true, grupo: 3 },
  { to: '/auditoria', icon: History, label: 'Auditoría', soloAdmin: true, grupo: 3 },
]

// Anchos de pantalla (los mismos que «md» y «lg» de Tailwind):
//  · móvil (< 768 px): el menú es un cajón que se abre con el botón de la barra superior.
//  · tablet (768 – 1023 px): el menú empieza plegado, solo con los iconos.
//  · escritorio (≥ 1024 px): el menú empieza desplegado.
const CONSULTA_MOVIL = '(max-width: 767px)'
const CONSULTA_TABLET = '(max-width: 1023px)'

function useConsulta(consulta: string): boolean {
  const [coincide, setCoincide] = useState(() => typeof window !== 'undefined' && window.matchMedia(consulta).matches)
  useEffect(() => {
    const m = window.matchMedia(consulta)
    const alCambiar = () => setCoincide(m.matches)
    alCambiar()
    m.addEventListener('change', alCambiar)
    return () => m.removeEventListener('change', alCambiar)
  }, [consulta])
  return coincide
}

export default function Layout() {
  const esMovil = useConsulta(CONSULTA_MOVIL)
  const [collapsed, setCollapsed] = useState(() => typeof window !== 'undefined' && window.matchMedia(CONSULTA_TABLET).matches)
  const [menuAbierto, setMenuAbierto] = useState(false)   // el cajón, solo en móvil
  const navigate = useNavigate()
  const location = useLocation()
  const { permitirSalida, dialogoSalida } = useConfirmarSalida()

  // En móvil el menú siempre se ve completo (con texto); el plegado solo existe en tablet y escritorio.
  const compacto = collapsed && !esMovil

  // El cajón se cierra al cambiar de pantalla, al pulsar Escape y al pasar a una pantalla más ancha.
  useEffect(() => { setMenuAbierto(false) }, [location.pathname])
  useEffect(() => { if (!esMovil) setMenuAbierto(false) }, [esMovil])
  useEffect(() => {
    if (!menuAbierto) return
    const alPulsar = (e: KeyboardEvent) => { if (e.key === 'Escape') setMenuAbierto(false) }
    document.addEventListener('keydown', alPulsar)
    return () => document.removeEventListener('keydown', alPulsar)
  }, [menuAbierto])

  // Enlaces del menú: con cambios sin guardar se pregunta antes de salir; sin ellos funcionan como siempre.
  async function irConAviso(e: React.MouseEvent, to: string) {
    setMenuAbierto(false)
    if (!hayCambiosSinGuardar()) return
    e.preventDefault()
    if (await permitirSalida()) navigate(to)
  }
  const { profesional, rol, esAdmin, signOut } = useAuth()
  const items = navItems.filter((i) => !i.soloAdmin || esAdmin)

  return (
    <div className="app-fondo flex flex-col md:flex-row h-dvh overflow-hidden bg-slate-50">

      {/* Barra superior: solo en móvil. Lleva el botón que abre el menú. */}
      <header className="md:hidden app-lateral shrink-0 flex items-center gap-2 bg-white border-b px-2 h-14 pt-[env(safe-area-inset-top)] box-content">
        <button
          type="button"
          onClick={() => setMenuAbierto(true)}
          aria-label="Abrir el menú"
          aria-expanded={menuAbierto}
          className="p-2 rounded-lg text-slate-600"
        >
          <Menu className="w-6 h-6" />
        </button>
        <img src={logo} alt="" className="w-7 h-7 block" />
        <span className="text-sm font-bold text-slate-800">CJA Hospital</span>
      </header>

      {/* Fondo oscuro tras el cajón (móvil). */}
      {menuAbierto && (
        <div className="md:hidden fixed inset-0 bg-black/40 z-30" onClick={() => setMenuAbierto(false)} aria-hidden />
      )}

      <aside
        className={`app-lateral bg-white border-r flex flex-col shrink-0 transition-all duration-200
          fixed inset-y-0 left-0 z-40 w-64 pt-[env(safe-area-inset-top)] pb-[env(safe-area-inset-bottom)] ${menuAbierto ? 'translate-x-0' : '-translate-x-full invisible'}
          md:static md:z-auto md:translate-x-0 md:visible md:pt-0 md:pb-0 ${compacto ? 'md:w-14' : 'md:w-56'}`}
      >
        {/* Cabecera */}
        <div className="border-b px-3 py-4 flex items-center justify-between gap-2">
          {/* Logo — siempre visible, expande si colapsado */}
          <button
            onClick={async () => {
              if (compacto) { setCollapsed(false); return }
              if (await permitirSalida()) { setMenuAbierto(false); navigate('/') }
            }}
            className="shrink-0 rounded-lg hover:opacity-80 cursor-pointer transition-opacity"
            title={compacto ? 'Expandir menú' : 'Ir a Inicio'}
            aria-label={compacto ? 'Expandir menú' : 'Ir a Inicio'}
          >
            <img src={logo} alt="" className="w-8 h-8 block" />
          </button>

          {/* Texto + botón colapsar — solo cuando expandido */}
          {!compacto && (
            <>
              <div className="flex-1 min-w-0">
                <Link to="/" title="Ir a Inicio" onClick={(e) => irConAviso(e, '/')} className="text-sm font-bold text-slate-800 leading-tight hover:text-primary-700">CJA Hospital</Link>
              </div>
              <button onClick={() => setCollapsed(true)}
                aria-label="Plegar el menú"
                className="hidden md:block text-slate-500 hover:text-slate-800 transition-colors p-1 rounded shrink-0">
                <ChevronLeft className="w-4 h-4" />
              </button>
              <button onClick={() => setMenuAbierto(false)}
                aria-label="Cerrar el menú"
                className="md:hidden text-slate-500 p-2 rounded shrink-0">
                <X className="w-5 h-5" />
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
              title={compacto ? label : undefined}
              className={({ isActive: activoRuta }) => {
                const isActive = activoRuta || (tambien ?? []).some((r) => location.pathname === r || location.pathname.startsWith(r + '/'))
                return `flex items-center gap-3 px-2 py-2 rounded-lg text-sm transition-colors duration-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-300 ${
                  compacto ? 'justify-center' : ''
                } ${
                  isActive
                    ? 'bg-primary-50 text-primary-700 font-semibold'
                    : 'text-slate-500 hover:bg-slate-50 hover:text-slate-700'
                }`
              }}
            >
              <Icon className="w-4 h-4 shrink-0" />
              {!compacto && label}
            </NavLink>
            </div>
          ))}
        </nav>

        {/* Footer: usuario + cerrar sesión */}
        <div className="border-t">
          {!compacto ? (
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
                className="flex items-center gap-2 text-xs text-slate-500 hover:text-red-600 transition-colors tactil:py-2"
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
                aria-label="Cerrar sesión"
                className="text-slate-500 hover:text-red-600 transition-colors p-1"
              >
                <LogOut className="w-4 h-4" />
              </button>
            </div>
          )}
        </div>
      </aside>

      {/* min-w-0: sin esto, una tabla ancha ensancha toda la página en vez de desplazarse dentro de su recuadro. */}
      <main className="flex-1 min-w-0 overflow-y-auto pb-[env(safe-area-inset-bottom)]">
        {dialogoSalida}
        {/* key: al cambiar de pantalla el error se descarta y la nueva pantalla carga normal */}
        <ErrorBoundary key={location.pathname}>
          <Outlet />
        </ErrorBoundary>
      </main>
    </div>
  )
}
