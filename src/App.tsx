import { BrowserRouter, Routes, Route, Outlet, Navigate } from 'react-router-dom'
import { AuthProvider, useAuth } from './lib/AuthContext'
import Layout from './components/Layout'
import Login from './pages/Login'
import Home from './pages/Home'
import Pacientes from './pages/Pacientes'
import DetallePaciente from './pages/DetallePaciente'
import NuevoIngreso from './pages/NuevoIngreso'
import DetalleIngreso from './pages/DetalleIngreso'
import HojaItems from './pages/HojaItems'
import { Eventos } from './pages/Eventos'
import { Configuracion } from './pages/Placeholders'
import { Dashboard } from './pages/Dashboard'
import { Personal } from './pages/Personal'

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
              <Route index element={<Home />} />
              <Route path="pacientes" element={<Pacientes />} />
              <Route path="pacientes/nuevo" element={<NuevoIngreso />} />
              <Route path="pacientes/:id" element={<DetallePaciente />} />
              <Route path="ingresos/:id" element={<DetalleIngreso />} />
              <Route path="items" element={<HojaItems />} />
              <Route path="eventos" element={<Eventos />} />
              <Route path="dashboard" element={<Dashboard />} />
              <Route path="personal" element={<Personal />} />
              <Route path="configuracion" element={<Configuracion />} />
            </Route>
          </Route>
        </Routes>
      </BrowserRouter>
    </AuthProvider>
  )
}
