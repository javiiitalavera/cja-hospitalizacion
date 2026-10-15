import { useNavigate } from 'react-router-dom'
import { Segmentado } from './Segmentado'

// Un solo «Buscador» con dos listados: pacientes e informes. Al cambiar de uno a otro se conserva lo escrito en el
// buscador (va en la dirección como «q»); cada listado guarda por su cuenta sus filtros y su orden.
const MODOS = [
  { clave: 'pacientes', etiqueta: 'Pacientes', ruta: '/pacientes' },
  { clave: 'informes', etiqueta: 'Informes', ruta: '/informes' },
] as const

export type ModoBusqueda = typeof MODOS[number]['clave']

export function SelectorBusqueda({ activo, texto }: { activo: ModoBusqueda; texto: string }) {
  const navigate = useNavigate()
  return (
    <Segmentado
      etiqueta="Qué buscar"
      valor={activo}
      opciones={MODOS.map((m) => ({ clave: m.clave, etiqueta: m.etiqueta }))}
      onChange={(clave) => {
        const m = MODOS.find((x) => x.clave === clave)!
        const q = texto.trim()
        navigate(q ? `${m.ruta}?q=${encodeURIComponent(q)}` : m.ruta)
      }}
    />
  )
}
