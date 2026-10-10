// Pauta de cuidados: indicaciones de enfermería que ven las auxiliares en las hojas de trabajo de
// cada turno. Una indicación se escribe una vez y vale para los turnos que se marquen.

export type Turno = 'manana' | 'tarde' | 'noche'
export const TURNOS: { clave: Turno; etiqueta: string }[] = [
  { clave: 'manana', etiqueta: 'Mañana' },
  { clave: 'tarde', etiqueta: 'Tarde' },
  { clave: 'noche', etiqueta: 'Noche' },
]
export const TODOS_TURNOS: Turno[] = ['manana', 'tarde', 'noche']
export const MAX_TEXTO_PAUTA = 600

export interface IndicacionCuidado {
  id: string
  ingreso_id: string
  texto: string
  turnos: Turno[]
  created_at: string
}

export type ViaPaciente = 'venosa' | 'subcutanea'
export const VIA_LABEL: Record<ViaPaciente, string> = { venosa: 'Vía venosa', subcutanea: 'Vía subcutánea' }
