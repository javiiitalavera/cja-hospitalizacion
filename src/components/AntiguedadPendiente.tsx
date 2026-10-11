// Cuántos días lleva abierta una incidencia «pendiente de completar». Pasados DIAS_PENDIENTE_AVISO días se destaca en rojo.
// Se cuenta desde que se registró (created_at); si no se tiene ese dato, desde la fecha del suceso.

import { DIAS_PENDIENTE_AVISO, diasPendiente } from '../types/eventos'

export function textoAbierta(dias: number): string {
  return dias === 0 ? 'abierta hoy' : dias === 1 ? 'abierta desde ayer' : `abierta hace ${dias} días`
}

export function AntiguedadPendiente({ ev }: { ev: { created_at?: string | null; fecha: string } }) {
  const dias = diasPendiente(ev)
  const urgente = dias > DIAS_PENDIENTE_AVISO
  return (
    <span
      data-testid="antiguedad-pendiente"
      className={`px-2 py-0.5 rounded-full text-xs font-semibold border whitespace-nowrap ${urgente ? 'bg-red-100 text-red-700 border-red-200' : 'bg-white text-amber-700 border-amber-200'}`}
      title={urgente ? `Lleva más de ${DIAS_PENDIENTE_AVISO} días sin completar` : undefined}
    >
      {textoAbierta(dias)}
    </span>
  )
}
