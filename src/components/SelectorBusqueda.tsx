import { useNavigate } from 'react-router-dom'

// Un solo «Buscar» con dos listados: pacientes e informes. Al cambiar de uno a otro se conserva lo escrito en el
// buscador (va en la dirección como «q»); cada listado guarda por su cuenta sus filtros y su orden.
const MODOS = [
  { clave: 'pacientes', etiqueta: 'Pacientes', ruta: '/pacientes' },
  { clave: 'informes', etiqueta: 'Informes', ruta: '/informes' },
] as const

export type ModoBusqueda = typeof MODOS[number]['clave']

export function SelectorBusqueda({ activo, texto }: { activo: ModoBusqueda; texto: string }) {
  const navigate = useNavigate()
  return (
    <div className="segmentado" role="group" aria-label="Qué buscar">
      {MODOS.map((m) => (
        <button
          key={m.clave}
          type="button"
          aria-pressed={activo === m.clave}
          onClick={() => {
            if (activo === m.clave) return
            const q = texto.trim()
            navigate(q ? `${m.ruta}?q=${encodeURIComponent(q)}` : m.ruta)
          }}
          className={`segmentado-btn ${activo === m.clave ? 'activo' : ''}`}
        >
          {m.etiqueta}
        </button>
      ))}
    </div>
  )
}
