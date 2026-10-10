import { RefreshCw } from 'lucide-react'

// Botón «Actualizar» de las pantallas que cargan datos: siempre el mismo aspecto.
export function BotonActualizar({ onClick, cargando }: { onClick: () => void; cargando?: boolean }) {
  return (
    <button type="button" onClick={onClick} disabled={cargando} title="Actualizar" aria-label="Actualizar"
      className="btn-secondary !px-2.5 disabled:opacity-60">
      <RefreshCw className={`w-4 h-4 ${cargando ? 'animate-spin' : ''}`} />
    </button>
  )
}
