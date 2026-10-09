// Habitación del paciente, grande y con el color de su semáforo de caídas,
// para verlos de un vistazo al abrir la ficha. Mismos colores que Inicio y
// la Hoja de ítems (SEMAFORO_CAIDAS_COLOR).

import { SEMAFORO_CAIDAS_COLOR } from '../../types'

const SEMAFORO_TEXTO: Record<string, string> = {
  verde: 'verde',
  amarillo: 'amarillo',
  naranja: 'naranja',
  rojo: 'rojo',
}

export function BadgeHabitacion({
  habitacion,
  semaforo,
  cerrado,
}: {
  habitacion: number
  semaforo: string | null
  // Con el episodio cerrado la habitación ya no es del paciente y el
  // semáforo ya no es actual: se muestra apagada, solo como dato.
  cerrado: boolean
}) {
  const color = !cerrado && semaforo ? SEMAFORO_CAIDAS_COLOR[semaforo] : undefined
  const texto = color
    ? `Habitación ${habitacion} · semáforo de caídas ${SEMAFORO_TEXTO[semaforo!] ?? semaforo}`
    : cerrado
      ? `Habitación que ocupó el paciente: ${habitacion}`
      : `Habitación ${habitacion} · sin semáforo de caídas`

  return (
    <div
      role="img"
      aria-label={texto}
      title={texto}
      data-testid="badge-habitacion"
      className={`w-16 h-16 rounded-xl shrink-0 flex flex-col items-center justify-center leading-none ${
        color ? 'shadow-sm' : 'bg-slate-100 border border-dashed border-slate-300 text-slate-600'
      }`}
      style={color ? { backgroundColor: color, color: semaforo === 'rojo' ? '#FFFFFF' : '#000000' } : undefined}
    >
      <span className="text-[10px] font-semibold uppercase tracking-wider opacity-80">Hab.</span>
      <span className="text-3xl font-extrabold tabular-nums mt-0.5">{habitacion}</span>
    </div>
  )
}
