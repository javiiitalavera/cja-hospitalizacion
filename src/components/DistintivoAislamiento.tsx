// Distintivo de aislamiento (contacto / gotas) para listas: Inicio, y donde haga falta ver de un vistazo que un paciente
// necesita precauciones. Mismos colores que la casilla marcada de la Pauta de cuidados.

import { ShieldAlert } from 'lucide-react'
import { AISLAMIENTOS, type Aislamiento } from '../types/pautaCuidados'
import { AISLAMIENTO_MARCADO } from './ViasDispositivos'

export function DistintivoAislamiento({ aislamiento, className = '' }: { aislamiento?: Aislamiento[] | null; className?: string }) {
  const lista = AISLAMIENTOS.filter((a) => (aislamiento ?? []).includes(a.clave))
  if (lista.length === 0) return null
  const texto = lista.map((a) => a.corta).join(' + ')
  return (
    <span data-aislamiento={lista.map((a) => a.clave).join(',')} title={`Aislamiento: ${lista.map((a) => a.etiqueta.toLowerCase()).join(' y ')}`}
      className={`inline-flex items-center gap-1 text-[11px] font-semibold leading-none px-1.5 py-1 rounded-md whitespace-nowrap ${AISLAMIENTO_MARCADO} ${className}`}>
      <ShieldAlert aria-hidden className="w-3 h-3 shrink-0" />
      <span><span className="sr-only">Aislamiento de </span>{texto}</span>
    </span>
  )
}
