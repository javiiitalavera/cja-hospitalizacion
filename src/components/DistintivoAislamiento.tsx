// Distintivo de aislamiento (contacto / gotas) para listas: Inicio, y donde haga falta ver de un vistazo que un paciente
// necesita precauciones. Mismos colores que la casilla marcada de la Pauta de cuidados.

import { Link } from 'react-router-dom'
import { ShieldAlert } from 'lucide-react'
import { AISLAMIENTOS, type Aislamiento } from '../types/pautaCuidados'
import { AISLAMIENTO_MARCADO } from './ViasDispositivos'

export function DistintivoAislamiento({ aislamiento, ingresoId, className = '' }: { aislamiento?: Aislamiento[] | null; ingresoId?: string; className?: string }) {
  const lista = AISLAMIENTOS.filter((a) => (aislamiento ?? []).includes(a.clave))
  if (lista.length === 0) return null
  const texto = lista.map((a) => a.corta).join(' + ')
  const clases = `inline-flex items-center gap-1 text-[11px] font-semibold leading-none px-1.5 py-1 rounded-md whitespace-nowrap ${AISLAMIENTO_MARCADO} ${className}`
  const contenido = (
    <>
      <ShieldAlert aria-hidden className="w-3 h-3 shrink-0" />
      <span><span className="sr-only">Aislamiento de </span>{texto}</span>
    </>
  )
  const comun = { 'data-aislamiento': lista.map((a) => a.clave).join(',') }
  // Con ingreso, el distintivo lleva a la Pauta de cuidados (donde se marca y se quita). Va por encima del enlace
  // que cubre toda la fila (relative), para que pulsarlo no abra la ficha en otra pestaña.
  if (ingresoId) {
    return (
      <Link to={`/ingresos/${ingresoId}?tab=plan&sub=cuidados`} {...comun}
        title={`Aislamiento: ${lista.map((a) => a.etiqueta.toLowerCase()).join(' y ')}. Ver pauta de cuidados`}
        className={`${clases} relative hover:bg-violet-800 focus:outline-none focus-visible:ring-2 focus-visible:ring-violet-400 focus-visible:ring-offset-1`}>
        {contenido}
      </Link>
    )
  }
  return <span {...comun} title={`Aislamiento: ${lista.map((a) => a.etiqueta.toLowerCase()).join(' y ')}`} className={clases}>{contenido}</span>
}
