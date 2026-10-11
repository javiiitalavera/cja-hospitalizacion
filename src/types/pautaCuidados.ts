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
  updated_at?: string   // marca del servidor: sirve para no pisar un cambio de otra persona
}

// Vías, dispositivos y aislamiento: viven en la Hoja de ítems (items_paciente), que es la única fuente. La Pauta de
// cuidados de la ficha, la Hoja de ítems y las Hojas de turno leen y escriben las mismas columnas.
export type Via = 'venosa' | 'subcutanea' | 'central' | 'sng' | 'peg' | 'ostomia' | 'traqueostomia'
export const VIAS: { clave: Via; etiqueta: string; corta: string }[] = [
  { clave: 'venosa', etiqueta: 'Venosa (IV)', corta: 'IV' },
  { clave: 'subcutanea', etiqueta: 'Subcutánea (SC)', corta: 'SC' },
  { clave: 'central', etiqueta: 'Catéter central', corta: 'Central' },
  { clave: 'sng', etiqueta: 'Sonda nasogástrica (SNG)', corta: 'SNG' },
  { clave: 'peg', etiqueta: 'Gastrostomía (PEG)', corta: 'PEG' },
  { clave: 'ostomia', etiqueta: 'Ostomía', corta: 'Ostom.' },
  { clave: 'traqueostomia', etiqueta: 'Traqueostomía', corta: 'Traq.' },
]

export type Aislamiento = 'contacto' | 'gotas'
export const AISLAMIENTOS: { clave: Aislamiento; etiqueta: string; corta: string }[] = [
  { clave: 'contacto', etiqueta: 'Contacto', corta: 'Contacto' },
  { clave: 'gotas', etiqueta: 'Gotas', corta: 'Gotas' },
]

export type DispositivoOxigeno = 'gafas' | 'mascarilla' | 'reservorio'
export const DISPOSITIVOS_OXIGENO: { clave: DispositivoOxigeno; etiqueta: string }[] = [
  { clave: 'gafas', etiqueta: 'Gafas nasales' },
  { clave: 'mascarilla', etiqueta: 'Mascarilla' },
  { clave: 'reservorio', etiqueta: 'Reservorio' },
]

// Los campos de ítems que usan estos selectores.
export interface DatosDispositivos {
  vias?: Via[] | null
  aislamiento?: Aislamiento[] | null
  sonda_vesical?: boolean | null
  sonda_fecha?: string | null
  sonda_calibre?: number | null
  oxigenoterapia?: boolean | null
  oxigeno_dispositivo?: DispositivoOxigeno | null
  oxigeno_flujo?: number | null
}
export const CAMPOS_DISPOSITIVOS: (keyof DatosDispositivos)[] = [
  'vias', 'aislamiento', 'sonda_vesical', 'sonda_fecha', 'sonda_calibre', 'oxigenoterapia', 'oxigeno_dispositivo', 'oxigeno_flujo',
]

// Vías en el orden de la lista, en texto corto («IV, SC, Ostom.»). Acepta también un valor suelto, que es como las
// copias antiguas del histórico guardaban la vía.
export function textoVias(vias: readonly string[] | string | null | undefined, corto = true): string {
  const lista = typeof vias === 'string' ? [vias] : (vias ?? [])
  return VIAS.filter((v) => lista.includes(v.clave)).map((v) => (corto ? v.corta : v.etiqueta)).join(', ')
}

// Cambios que hay que guardar al marcar o desmarcar la sonda vesical o el oxígeno: al quitarlos se borra su detalle
// (la base de datos solo admite detalle si la casilla está marcada).
export function cambiosDispositivo(campo: 'sonda_vesical' | 'oxigenoterapia', activo: boolean): DatosDispositivos {
  if (activo) return { [campo]: true }
  return campo === 'sonda_vesical'
    ? { sonda_vesical: false, sonda_fecha: null, sonda_calibre: null }
    : { oxigenoterapia: false, oxigeno_dispositivo: null, oxigeno_flujo: null }
}
