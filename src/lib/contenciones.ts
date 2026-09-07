// ─── CONTENCIÓN FÍSICA: modelo día / noche ─────────────────────
//
// Dos ejes independientes por ingreso. "Nunca revisado" y "revisado,
// nada pautado" son cosas distintas y se representan de forma
// distinta a propósito (ver el esquema, tabla "contenciones"):
//   día:   null = nunca revisado; 'ninguna' = revisado, nada pautado
//   noche: null = nunca revisado; []        = revisado, nada pautado

export type ContencionDia =
  | 'ninguna'
  | 'continua_seguridad'
  | 'si_precisa_supervision'
  | 'si_precisa_paciente'

export type ContencionNoche =
  | '1_barra'
  | '2_barras'
  | 'cota_cero'
  | 'sensor_presion'
  | 'contencion_fija'
  | 'contencion_si_precisa'

export const DIA_OPCIONES: ContencionDia[] = [
  'ninguna', 'continua_seguridad', 'si_precisa_supervision', 'si_precisa_paciente',
]

export const NOCHE_OPCIONES: ContencionNoche[] = [
  '1_barra', '2_barras', 'cota_cero', 'sensor_presion', 'contencion_fija', 'contencion_si_precisa',
]

export const CONTENCION_DIA_LABEL: Record<ContencionDia, string> = {
  ninguna: 'Ninguna',
  continua_seguridad: 'Continua por seguridad',
  si_precisa_supervision: 'Si precisa — supervisión',
  si_precisa_paciente: 'Si precisa — situación del paciente',
}

export const CONTENCION_DIA_DESC: Record<ContencionDia, string> = {
  ninguna: '',
  continua_seguridad: 'Se retira si deja de ser necesaria.',
  si_precisa_supervision: 'Vigilancia insuficiente ahora mismo.',
  si_precisa_paciente: 'Según el estado del paciente.',
}

export const CONTENCION_NOCHE_LABEL: Record<ContencionNoche, string> = {
  '1_barra': '1 barra',
  '2_barras': '2 barras',
  cota_cero: 'Cama a cota cero',
  sensor_presion: 'Sensor de presión',
  contencion_fija: 'Contención fija',
  contencion_si_precisa: 'Contención si precisa',
}

// De las seis medidas nocturnas, solo estas dos cuentan como
// contención de verdad para recuentos/estadísticas — el resto son
// medidas de seguridad (barras, cota cero, sensor), no contención.
export const NOCHE_ES_CONTENCION: ContencionNoche[] = ['contencion_fija', 'contencion_si_precisa']

export interface EstadoContencion {
  ingreso_id: string
  dia: ContencionDia | null
  noche: ContencionNoche[] | null
  actualizado_por_id?: string
  actualizado_en?: string
  actualizado_por?: { nombre: string; apellidos: string }
  confirmado_por_id?: string | null
  confirmado_en?: string | null
  confirmado_por?: { nombre: string; apellidos: string } | null
  version: number
}

export interface HistorialContencion {
  id: string
  ingreso_id: string
  dia: ContencionDia | null
  noche: ContencionNoche[] | null
  cambiado_en: string
  // Qué pasó exactamente, y quién lo hizo de verdad — para confirmar
  // o retirar una confirmación, es una persona distinta de quien
  // había editado la pauta por última vez. Antes la pantalla solo
  // mostraba "quién editó el contenido" para cada fila, así que una
  // confirmación médica se veía atribuida a quien había tocado la
  // pauta antes, no a quien confirmó — un fallo de atribución real,
  // no cosmético.
  tipo_accion?: 'pauta_creada' | 'pauta_modificada' | 'confirmada' | 'confirmacion_retirada'
  actor_id?: string
  actor?: { nombre: string; apellidos: string }
}

// ─── Gravedad y color, compartidos entre el modal y los iconos ──
//
// La misma función decide el color en Inicio, en la Hoja de Ítems y
// en el propio modal — un único criterio, no uno por pantalla.

export type SeveridadContencion = 'sin_revisar' | 'ninguna' | 'seguridad' | 'si_precisa' | 'activa'

export function severidadDia(dia: ContencionDia | null | undefined): SeveridadContencion {
  if (dia == null) return 'sin_revisar'
  if (dia === 'ninguna') return 'ninguna'
  if (dia === 'continua_seguridad') return 'activa'
  return 'si_precisa'
}

export function severidadNoche(noche: ContencionNoche[] | null | undefined): SeveridadContencion {
  if (noche == null) return 'sin_revisar'
  if (noche.length === 0) return 'ninguna'
  if (noche.includes('contencion_fija')) return 'activa'
  if (noche.includes('contencion_si_precisa')) return 'si_precisa'
  return 'seguridad'
}

export const SEVERIDAD_ESTILO: Record<SeveridadContencion, {
  bg: string; text: string; border: string; label: string
}> = {
  sin_revisar: { bg: 'bg-slate-100', text: 'text-slate-400', border: 'border-slate-200', label: 'Sin revisar' },
  ninguna: { bg: 'bg-emerald-50', text: 'text-emerald-600', border: 'border-emerald-200', label: 'Ninguna' },
  seguridad: { bg: 'bg-blue-50', text: 'text-blue-600', border: 'border-blue-200', label: 'Medida de seguridad' },
  si_precisa: { bg: 'bg-amber-50', text: 'text-amber-700', border: 'border-amber-200', label: 'Si precisa' },
  activa: { bg: 'bg-red-50', text: 'text-red-700', border: 'border-red-200', label: 'Activa' },
}

// Solo una contención de verdad necesita el visto bueno de un
// médico — las medidas de seguridad puras (barras, cota cero, sensor)
// y "ninguna" no lo requieren, para no cargar al equipo con
// confirmaciones de trámite sin ningún peso clínico real.
export function necesitaConfirmacion(dia: ContencionDia | null | undefined, noche: ContencionNoche[] | null | undefined): boolean {
  const sevDia = severidadDia(dia)
  const sevNoche = severidadNoche(noche)
  return sevDia === 'activa' || sevDia === 'si_precisa' || sevNoche === 'activa' || sevNoche === 'si_precisa'
}

// Para distinguir visualmente cada fila del historial — antes todas
// se veían igual, sin decir si esa fila era la pauta al crearse, un
// cambio de contenido, una confirmación, o una confirmación retirada.
export const TIPO_ACCION_HISTORIAL_LABEL: Record<string, string> = {
  pauta_creada: 'Pauta creada',
  pauta_modificada: 'Pauta modificada',
  confirmada: 'Confirmada',
  confirmacion_retirada: 'Confirmación retirada',
}
export const TIPO_ACCION_HISTORIAL_COLOR: Record<string, string> = {
  pauta_creada: 'bg-slate-100 text-slate-600',
  pauta_modificada: 'bg-amber-50 text-amber-700',
  confirmada: 'bg-emerald-50 text-emerald-700',
  confirmacion_retirada: 'bg-red-50 text-red-700',
}
