// Recuadro "Pendiente" de Inicio: una línea por cosa que queda por hacer,
// ya filtrada por perfil (ver calcularPendientes). Cada línea lleva
// directamente adonde hace falta ir. No aparece si no hay nada.

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
    <div className="mb-5 card px-4 py-3" role="region" aria-label="Pendiente">
      <p className="text-sm font-semibold text-slate-800 mb-2">
        Pendiente <span className="font-normal text-slate-500">· {lineas.length}</span>
      </p>
      <div className="md:columns-2 md:gap-x-10">
        {lineas.map((l) => (
          <button
            key={l.id}
            type="button"
            data-linea={l.id}
            onClick={() => onAccion(l)}
            className="block w-full text-left text-sm text-slate-700 hover:text-slate-900 group py-0.5 break-inside-avoid"
          >
            <span aria-hidden className="inline-block w-1.5 h-1.5 rounded-full bg-amber-500 mr-2 align-middle" />
            <span className="group-hover:underline">{l.texto}</span>
            {l.detalle && <span className="text-xs text-slate-500"> · {l.detalle}</span>}
          </button>
        ))}
      </div>
    </div>
  )
}
