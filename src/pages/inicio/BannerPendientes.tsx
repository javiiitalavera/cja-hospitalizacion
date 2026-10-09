// Recuadro "Pendiente" de Inicio: una línea por cosa que queda por hacer,
// ya filtrada por perfil (ver calcularPendientes). Cada línea lleva
// directamente adonde hace falta ir. No aparece si no hay nada.

import { AlertTriangle } from 'lucide-react'
import type { LineaPendiente } from './pendientes'

export function BannerPendientes({
  lineas,
  onAccion,
}: {
  lineas: LineaPendiente[]
  onAccion: (l: LineaPendiente) => void
}) {
  if (lineas.length === 0) return null
  return (
    <div className="mb-5 bg-amber-50 border border-amber-200 rounded-xl px-4 py-3" role="region" aria-label="Pendiente">
      <p className="text-xs font-semibold text-amber-800 uppercase tracking-wide mb-1.5">Pendiente</p>
      <div className="space-y-1">
        {lineas.map((l) => (
          <button
            key={l.id}
            type="button"
            data-linea={l.id}
            onClick={() => onAccion(l)}
            className="flex items-baseline gap-1.5 text-left text-sm text-amber-800 hover:text-amber-900 group"
          >
            <AlertTriangle className="w-3.5 h-3.5 shrink-0 self-center" />
            <span className="group-hover:underline">{l.texto}</span>
            {l.detalle && <span className="text-xs text-amber-700/80">· {l.detalle}</span>}
          </button>
        ))}
      </div>
    </div>
  )
}
