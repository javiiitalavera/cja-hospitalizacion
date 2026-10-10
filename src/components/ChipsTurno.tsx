// Selector de turnos (Mañana / Tarde / Noche) de una indicación de la pauta de cuidados.
// Lo usan la ficha del paciente y la pantalla de Hojas de turno.

import { TODOS_TURNOS, TURNOS, type Turno } from '../types/pautaCuidados'

export function ChipsTurno({ valor, onChange, deshabilitado, compacto }: {
  valor: Turno[]
  onChange?: (t: Turno[]) => void
  deshabilitado?: boolean
  compacto?: boolean
}) {
  return (
    <div className={`flex flex-wrap ${compacto ? 'gap-1' : 'gap-1.5'}`}>
      {TURNOS.map((t) => {
        const activo = valor.includes(t.clave)
        const siguiente = activo ? valor.filter((x) => x !== t.clave) : [...valor, t.clave]
        return (
          <button
            key={t.clave}
            type="button"
            disabled={deshabilitado || !onChange}
            // Siempre debe quedar al menos un turno marcado.
            onClick={() => siguiente.length > 0 && onChange?.(TODOS_TURNOS.filter((x) => siguiente.includes(x)))}
            aria-pressed={activo}
            className={`${compacto ? 'text-[11px] px-2 py-0.5' : 'text-xs px-2.5 py-1'} rounded-full border transition-colors ${
              activo ? 'bg-primary-50 border-primary-300 text-primary-800 font-semibold' : 'bg-white border-slate-200 text-slate-400'
            } ${deshabilitado || !onChange ? 'cursor-default' : 'hover:border-primary-300'}`}
          >
            {t.etiqueta}
          </button>
        )
      })}
    </div>
  )
}
