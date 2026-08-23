import { BrowserRouter, Routes, Route, Outlet, Navigate } from 'react-router-dom'
import { Suspense, lazy } from 'react'
import { AuthProvider, useAuth } from './lib/AuthContext'
import Layout from './components/Layout'
import Login from './pages/Login'

// Carga diferida: cada pantalla se descarga solo cuando se entra en
// ella, no todas de golpe al arrancar la app. Antes, toda la app
// (Dashboard, CMBD, Auditoría, la Hoja de Ítems…) viajaba en un único
// bloque de ~1,1 MB, así que la primera vez que se abría cualquier
// pantalla pesada había que descargar y ejecutar el código de todas
// las demás también.
const Home = lazy(() => import('./pages/Home'))
const Pacientes = lazy(() => import('./pages/Pacientes'))
const DetallePaciente = lazy(() => import('./pages/DetallePaciente'))
const NuevoIngreso = lazy(() => import('./pages/NuevoIngreso'))
const DetalleIngreso = lazy(() => import('./pages/DetalleIngreso'))
const HojaItems = lazy(() => import('./pages/HojaItems'))
const Eventos = lazy(() => import('./pages/Eventos').then((m) => ({ default: m.Eventos })))
const Dashboard = lazy(() => import('./pages/Dashboard').then((m) => ({ default: m.Dashboard })))
const Personal = lazy(() => import('./pages/Personal').then((m) => ({ default: m.Personal })))
const Auditoria = lazy(() => import('./pages/Auditoria').then((m) => ({ default: m.Auditoria })))
const Informes = lazy(() => import('./pages/Informes').then((m) => ({ default: m.Informes })))

// Pantalla breve mientras se descarga el código de la página elegida
// (solo se ve un instante, y solo la primera vez que se visita cada
// pantalla en la sesión: el navegador la guarda en caché después).
function CargandoPagina() {
  return <div className="p-8 text-slate-400 text-sm">Cargando…</div>
}

// Guardián: decide si se puede pasar a las rutas protegidas.
function RequireAuth() {
  const { session, profesional, loading } = useAuth()

  // Mientras comprobamos si hay sesión, pantalla de espera sobria.
  if (loading) {
    return <div className="min-h-screen flex items-center justify-center text-slate-400">Cargando…</div>
  }

  // Sin sesión → al login.
  if (!session) return <Navigate to="/login" replace />

  // Con sesión pero sin ficha de profesional enlazada: avisamos claro
  // en lugar de dejar la app a medias sin rol.
  if (!profesional) {
    return (
      <div className="min-h-screen flex items-center justify-center p-4">
        <div className="card p-6 max-w-sm text-center space-y-2">
          <p className="font-semibold text-slate-800">Cuenta sin profesional asignado</p>
          <p className="text-sm text-slate-500">
            Tu cuenta ha iniciado sesión, pero no está enlazada a ninguna ficha de profesional.
            Pídele a un administrador que la enlace.
          </p>
        </div>
      </div>
    )
  }

  return <Outlet />
}

export default function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <Routes>
          <Route path="/login" element={<Login />} />

          {/* Todo lo demás queda detrás del guardián */}
          <Route element={<RequireAuth />}>
            <Route path="/" element={<Layout />}>
              <Route index element={<Suspense fallback={<CargandoPagina />}><Home /></Suspense>} />
              <Route path="pacientes" element={<Suspense fallback={<CargandoPagina />}><Pacientes /></Suspense>} />
              <Route path="pacientes/nuevo" element={<Suspense fallback={<CargandoPagina />}><NuevoIngreso /></Suspense>} />
              <Route path="pacientes/:id" element={<Suspense fallback={<CargandoPagina />}><DetallePaciente /></Suspense>} />
              <Route path="ingresos/:id" element={<Suspense fallback={<CargandoPagina />}><DetalleIngreso /></Suspense>} />
              <Route path="items" element={<Suspense fallback={<CargandoPagina />}><HojaItems /></Suspense>} />
              <Route path="eventos" element={<Suspense fallback={<CargandoPagina />}><Eventos /></Suspense>} />
              <Route path="informes" element={<Suspense fallback={<CargandoPagina />}><Informes /></Suspense>} />
              <Route path="dashboard" element={<Suspense fallback={<CargandoPagina />}><Dashboard /></Suspense>} />
              <Route path="personal" element={<Suspense fallback={<CargandoPagina />}><Personal /></Suspense>} />
              <Route path="auditoria" element={<Suspense fallback={<CargandoPagina />}><Auditoria /></Suspense>} />
            </Route>
          </Route>
        </Routes>
      </BrowserRouter>
    </AuthProvider>
  )
}
