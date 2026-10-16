// Recuadro "Pendiente" de Inicio: una línea por cosa que queda por hacer,
// ya filtrada por perfil (ver calcularPendientes). Pulsar el texto lleva a la primera habitación afectada (o a la
// lista); pulsar una habitación concreta lleva a esa. No aparece si no hay nada.

import type { AccionPendiente, LineaPendiente } from './pendientes'

export function BannerPendientes({
  lineas,
  onAccion,
}: {
  lineas: LineaPendiente[]
  onAccion: (a: AccionPendiente) => void
}) {
  if (lineas.length === 0) return null
  return (
    // Resalte suave: fondo ámbar muy tenue y borde fino por todos los lados (sin barra lateral); el texto va en gris oscuro.
    <div
      className="mb-5 rounded-xl border border-amber-200 bg-amber-50/60 px-4 py-3 shadow-sm"
      role="region"
      aria-label="Pendiente"
    >
      <p className="text-sm font-semibold text-amber-900 mb-2">
        Pendiente <span className="font-normal text-amber-800/70">· {lineas.length}</span>
      </p>
      <div className="md:columns-2 md:gap-x-10">
        {lineas.map((l) => (
          // El punto va aparte del texto (flex): un botón nunca se comporta como texto en línea, así que, con el punto dentro del mismo párrafo, si la frase no cabía entera el punto se quedaba solo en una línea.
          <div key={l.id} className="py-0.5 text-sm text-slate-800 break-inside-avoid flex items-start gap-2">
            <span aria-hidden className="shrink-0 w-1.5 h-1.5 rounded-full bg-amber-500 mt-[0.45rem]" />
            <div className="min-w-0">
            <button
              type="button"
              data-linea={l.id}
              onClick={() => onAccion(l.accion)}
              className="text-left hover:text-slate-950 hover:underline underline-offset-2"
            >
              {l.texto}
            </button>
            {l.destinos && l.destinos.length > 0 ? (
              <span className="text-xs text-slate-500">
                {' · Hab. '}
                {l.destinos.map((d, i) => (
                  <span key={d.hab} className="whitespace-nowrap">
                    <button
                      type="button"
                      data-hab={d.hab}
                      data-linea-hab={l.id}
                      title={`Abrir la habitación ${d.hab}`}
                      onClick={() => onAccion(d.accion)}
                      className="px-1 -mx-0.5 rounded font-semibold text-primary-700 hover:bg-amber-100 hover:underline underline-offset-2"
                    >
                      {d.hab}
                    </button>
                    {i < l.destinos!.length - 1 ? ', ' : ''}
                  </span>
                ))}
                {(l.detalle.includes('…')) && '…'}
                {l.nota && ` · ${l.nota}`}
              </span>
            ) : (
              l.detalle && <span className="text-xs text-slate-500"> · {l.detalle}</span>
            )}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
