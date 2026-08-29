export type TipoEvento =
  | 'caida'
  | 'ulcera'
  | 'error_medicacion'
  | 'efecto_adverso_medicacion'
  | 'infeccion_nosocomial'
  | 'agresividad_fisica'
  | 'fuga'

export const TIPO_EVENTO_LABEL: Record<TipoEvento, string> = {
  caida: 'Caída',
  ulcera: 'Úlcera por presión',
  error_medicacion: 'Error de medicación',
  efecto_adverso_medicacion: 'Efecto adverso de medicación',
  infeccion_nosocomial: 'Infección nosocomial',
  agresividad_fisica: 'Agresividad física grave',
  fuga: 'Fuga',
}

export const TIPO_EVENTO_COLOR: Record<TipoEvento, string> = {
  caida: 'bg-orange-100 text-orange-700 border-orange-200',
  ulcera: 'bg-red-100 text-red-700 border-red-200',
  error_medicacion: 'bg-purple-100 text-purple-700 border-purple-200',
  efecto_adverso_medicacion: 'bg-pink-100 text-pink-700 border-pink-200',
  infeccion_nosocomial: 'bg-yellow-100 text-yellow-700 border-yellow-200',
  agresividad_fisica: 'bg-rose-100 text-rose-700 border-rose-200',
  fuga: 'bg-slate-100 text-slate-700 border-slate-200',
}

export interface Evento {
  id: string
  ingreso_id: string
  tipo: TipoEvento
  fecha: string
  hora?: string
  turno?: 'manana' | 'tarde' | 'noche'
  datos: Record<string, string>
  notas?: string
  registrado_por_id?: string
  created_at: string
  registrado_por?: { nombre: string; apellidos: string; rol: string }
  ingreso?: {
    paciente: { nombre: string; primer_apellido: string; segundo_apellido?: string; habitacion?: number }
    habitacion?: number
  }
}

// ─── DEFINICIÓN DE CAMPOS POR TIPO ───────────────────────────

export type CampoTipo = 'select' | 'text' | 'time'

export interface CampoEvento {
  key: string
  label: string
  tipo: CampoTipo
  opciones?: string[]
  requerido?: boolean
}

export const CAMPOS_POR_TIPO: Record<TipoEvento, CampoEvento[]> = {
  caida: [
    { key: 'con_lesion', label: 'Con lesión', tipo: 'select', opciones: ['Sí', 'No'], requerido: true },
    { key: 'gravedad', label: 'Gravedad', tipo: 'select', opciones: ['Sin lesión', 'Leve', 'Moderada', 'Grave'] },
    { key: 'lugar', label: 'Lugar', tipo: 'select', opciones: ['Habitación', 'Baño', 'Pasillo', 'Sala común', 'Comedor', 'Gimnasio', 'Sala de terapia', 'Exterior'], requerido: true },
    { key: 'circunstancias', label: 'Circunstancias', tipo: 'select', opciones: ['Solo', 'Supervisado', 'Con sujeción activa'] },
    { key: 'consecuencias', label: 'Consecuencias', tipo: 'select', opciones: ['Sin lesión', 'Contusión', 'Herida', 'Fractura', 'TCE', 'Otro'] },
  ],

  ulcera: [
    { key: 'momento', label: 'Momento de aparición', tipo: 'select', opciones: ['Al ingreso', 'Durante el ingreso'], requerido: true },
    { key: 'grado', label: 'Grado', tipo: 'select', opciones: ['Grado I', 'Grado II', 'Grado III', 'Grado IV'], requerido: true },
    { key: 'localizacion', label: 'Localización', tipo: 'select', opciones: ['Sacro', 'Talón derecho', 'Talón izquierdo', 'Maléolo', 'Isquión', 'Trocánter', 'Occipucio', 'Otra'], requerido: true },
    { key: 'tamano', label: 'Tamaño aproximado', tipo: 'text' },
  ],

  error_medicacion: [
    { key: 'tipo_error', label: 'Tipo de error', tipo: 'select', opciones: ['Dosis incorrecta', 'Medicamento incorrecto', 'Vía incorrecta', 'Omisión', 'Duplicidad', 'Hora incorrecta'], requerido: true },
    { key: 'gravedad', label: 'Gravedad', tipo: 'select', opciones: ['Sin daño', 'Daño leve', 'Daño moderado', 'Daño grave'], requerido: true },
    { key: 'medicamento', label: 'Medicamento afectado', tipo: 'text', requerido: true },
    { key: 'medidas', label: 'Medidas correctoras', tipo: 'text' },
  ],

  efecto_adverso_medicacion: [
    { key: 'medicamento', label: 'Medicamento sospechoso', tipo: 'text', requerido: true },
    { key: 'tipo_reaccion', label: 'Tipo de reacción', tipo: 'select', opciones: ['Alérgica', 'Tóxica', 'Idiosincrática', 'Interacción farmacológica'], requerido: true },
    { key: 'gravedad', label: 'Gravedad', tipo: 'select', opciones: ['Leve', 'Moderada', 'Grave'], requerido: true },
    { key: 'medidas', label: 'Medidas tomadas', tipo: 'text' },
  ],

  infeccion_nosocomial: [
    { key: 'tipo', label: 'Tipo de infección', tipo: 'select', opciones: ['Urinaria (ITU)', 'Respiratoria', 'Herida quirúrgica', 'Gastrointestinal', 'Piel / partes blandas', 'Otra'], requerido: true },
    { key: 'agente', label: 'Agente causal (si conocido)', tipo: 'text' },
    { key: 'confirmacion', label: 'Confirmación diagnóstica', tipo: 'select', opciones: ['Sospecha clínica', 'Confirmada por microbiología'], requerido: true },
  ],

  agresividad_fisica: [
    { key: 'dirigida_a', label: 'Dirigida a', tipo: 'select', opciones: ['Personal sanitario', 'Otro paciente', 'Familiar', 'Objeto / mobiliario'], requerido: true },
    { key: 'tipo', label: 'Tipo de agresión', tipo: 'select', opciones: ['Golpes', 'Mordeduras', 'Empujones', 'Arañazos', 'Lanzamiento de objetos', 'Otra'], requerido: true },
    { key: 'gravedad', label: 'Gravedad / consecuencias', tipo: 'select', opciones: ['Sin lesión a terceros', 'Lesión leve', 'Lesión grave', 'Daños materiales'], requerido: true },
    { key: 'medidas', label: 'Medidas adoptadas', tipo: 'select', opciones: ['Contención verbal', 'Rescate farmacológico', 'Contención física', 'Notificación a dirección', 'Varias'], requerido: true },
  ],

  fuga: [
    { key: 'resolucion', label: 'Resolución', tipo: 'select', opciones: ['Regreso voluntario', 'Recuperado por personal', 'Recuperado por familia', 'Intervención policial'], requerido: true },
    { key: 'duracion', label: 'Duración de la ausencia', tipo: 'text' },
    { key: 'destino_conocido', label: 'Destino conocido', tipo: 'select', opciones: ['Sí', 'No'] },
  ],
}

export const TURNO_LABEL: Record<string, string> = {
  manana: 'Mañana',
  tarde: 'Tarde',
  noche: 'Noche',
}

// ─── PAUTA DE CONTENCIÓN FÍSICA ───────────────────────────────
// A diferencia de las incidencias de arriba, esto no es un registro
// puntual: es una orden médica vigente hasta que se retira. Por eso
// vive en su propia tabla (pautas_contencion), no en "eventos".

export type TipoContencion =
  | 'cama_una_barra'
  | 'cama_dos_barras'
  | 'cama_sujecion_fisica'
  | 'cama_sensor_presion'
  | 'cama_cota_cero'
  | 'sillon'
  | 'silla_ruedas'
  | 'contencion_manual'
  | 'aislamiento'

export type MotivoContencion =
  | 'agitacion'
  | 'riesgo_caida'
  | 'retirada_vias'
  | 'riesgo_fuga'
  | 'otro'

export const TIPO_CONTENCION_LABEL: Record<TipoContencion, string> = {
  cama_una_barra: 'Cama — una barra',
  cama_dos_barras: 'Cama — dos barras',
  cama_sujecion_fisica: 'Cama — sujeción física',
  cama_sensor_presion: 'Cama — sensor de presión',
  cama_cota_cero: 'Cama — cota cero',
  sillon: 'Sillón',
  silla_ruedas: 'Silla de ruedas',
  contencion_manual: 'Contención manual',
  aislamiento: 'Aislamiento',
}

// Agrupación visual: todas las medidas de cama se muestran juntas en
// la Hoja de Ítems, igual que antes se agrupaban en un único campo.
export const CONTENCION_AMBITO: Record<TipoContencion, 'cama' | 'sillon' | 'silla_ruedas' | 'otro'> = {
  cama_una_barra: 'cama',
  cama_dos_barras: 'cama',
  cama_sujecion_fisica: 'cama',
  cama_sensor_presion: 'cama',
  cama_cota_cero: 'cama',
  sillon: 'sillon',
  silla_ruedas: 'silla_ruedas',
  contencion_manual: 'otro',
  aislamiento: 'otro',
}

export const MOTIVO_CONTENCION_LABEL: Record<MotivoContencion, string> = {
  agitacion: 'Agitación',
  riesgo_caida: 'Riesgo de caída',
  retirada_vias: 'Retirada de vías',
  riesgo_fuga: 'Riesgo de fuga',
  otro: 'Otro',
}

export interface PautaContencion {
  id: string
  ingreso_id: string
  tipo: TipoContencion
  motivo: MotivoContencion
  notas?: string
  pautada_por_id: string
  fecha_inicio: string
  retirada_por_id?: string
  fecha_fin?: string
  pautada_por?: { nombre: string; apellidos: string }
  retirada_por?: { nombre: string; apellidos: string }
}
