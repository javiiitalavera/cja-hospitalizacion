import { BrowserRouter, Routes, Route } from 'react-router-dom'
import Layout from './components/Layout'
import Home from './pages/Home'
import Pacientes from './pages/Pacientes'
import DetallePaciente from './pages/DetallePaciente'
import NuevoIngreso from './pages/NuevoIngreso'
import DetalleIngreso from './pages/DetalleIngreso'
import HojaItems from './pages/HojaItems'
import { Eventos, Dashboard, Configuracion } from './pages/Placeholders'

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<Layout />}>
          <Route index element={<Home />} />
          <Route path="pacientes" element={<Pacientes />} />
          <Route path="pacientes/nuevo" element={<NuevoIngreso />} />
          <Route path="pacientes/:id" element={<DetallePaciente />} />
          <Route path="ingresos/:id" element={<DetalleIngreso />} />
          <Route path="items" element={<HojaItems />} />
          <Route path="eventos" element={<Eventos />} />
          <Route path="dashboard" element={<Dashboard />} />
          <Route path="configuracion" element={<Configuracion />} />
        </Route>
      </Routes>
    </BrowserRouter>
  )
}
