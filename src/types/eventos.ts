import { diasEntre } from '../lib/fechas'

export type TipoEvento =
  | 'caida'
  | 'ulcera'
  | 'error_medicacion'
  | 'efecto_adverso_medicacion'
  | 'infeccion_nosocomial'
  | 'agresividad_fisica'
  | 'fuga'
  | 'atragantamiento'

export const TIPO_EVENTO_LABEL: Record<TipoEvento, string> = {
  caida: 'Caída',
  ulcera: 'Úlcera por presión',
  error_medicacion: 'Error de medicación',
  efecto_adverso_medicacion: 'Efecto adverso de medicación',
  infeccion_nosocomial: 'Infección nosocomial',
  agresividad_fisica: 'Agresividad física grave',
  fuga: 'Fuga',
  atragantamiento: 'Atragantamiento',
}

// Las úlceras por presión ya no son una incidencia: se registran en Plan de
// cuidados → Curas. El tipo se conserva aquí solo para poder mostrar (por
// ejemplo en Auditoría) los eventos antiguos; no se ofrece al registrar ni se
// muestra en los listados de Incidencias.
export const TIPO_EVENTO_RETIRADO: TipoEvento = 'ulcera'
export const TIPOS_REGISTRABLES = (Object.keys(TIPO_EVENTO_LABEL) as TipoEvento[]).filter((t) => t !== TIPO_EVENTO_RETIRADO)

export const TIPO_EVENTO_COLOR: Record<TipoEvento, string> = {
  caida: 'bg-orange-100 text-orange-700 border-orange-200',
  ulcera: 'bg-red-100 text-red-700 border-red-200',
  error_medicacion: 'bg-purple-100 text-purple-700 border-purple-200',
  efecto_adverso_medicacion: 'bg-pink-100 text-pink-700 border-pink-200',
  infeccion_nosocomial: 'bg-yellow-100 text-yellow-700 border-yellow-200',
  agresividad_fisica: 'bg-rose-100 text-rose-700 border-rose-200',
  fuga: 'bg-slate-100 text-slate-700 border-slate-200',
  atragantamiento: 'bg-cyan-100 text-cyan-700 border-cyan-200',
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
  actualizado_por_id?: string
  actualizado_en?: string
  // Para lo que se sabrá con certeza más adelante (por ejemplo, una
  // caída cuyas consecuencias se confirman días después) — no exige
  // rellenar con un valor inventado con tal de poder guardar.
  estado?: 'pendiente' | 'completa'
  created_at: string
  registrado_por?: { nombre: string; apellidos: string; rol: string }
  ingreso?: {
    paciente: { nombre: string; primer_apellido: string; segundo_apellido?: string; habitacion?: number }
    habitacion?: number
  }
}

// Las franjas reales de turno de la clínica: 22-8 noche, 8-15 mañana,
// 15-22 tarde. Se usa para proponer el turno según la hora, o avisar
// si no coinciden — sin obligar, por si alguien registra la
// incidencia más tarde de cuando pasó de verdad.
export function turnoSegunHora(hora: string): 'manana' | 'tarde' | 'noche' | null {
  if (!hora) return null
  const [h] = hora.split(':').map(Number)
  if (Number.isNaN(h)) return null
  if (h >= 8 && h < 15) return 'manana'
  if (h >= 15 && h < 22) return 'tarde'
  return 'noche'
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

const LUGARES = ['Habitación', 'Baño', 'Pasillo', 'Sala común', 'Comedor', 'Gimnasio', 'Sala de terapia', 'Exterior']
const DETALLES_LUGAR = ['Azul', 'Verde', 'Violeta', 'Gris', 'Sala 1', 'Sala 2']

// Campo común: si el paciente tuvo que salir del centro por lo ocurrido. Se pide en las incidencias que pueden
// acabar en urgencias (caída, agresión, efecto adverso, infección, atragantamiento).
export const DERIVACION: CampoEvento = {
  key: 'derivacion', label: 'Derivación a urgencias / hospital', tipo: 'select',
  opciones: ['No', 'Urgencias, sin ingreso', 'Ingreso hospitalario'], requerido: true,
}
export const DERIVACIONES_A_HOSPITAL = ['Urgencias, sin ingreso', 'Ingreso hospitalario']

// Campos que se añadieron después de que ya hubiera incidencias registradas: al editar una incidencia antigua que no
// los tiene no se exigen (obligarían a inventar el dato de algo que ocurrió hace tiempo).
export const CAMPOS_AÑADIDOS_DESPUES = ['derivacion', 'presenciada', 'mecanismo']

export const CAMPOS_POR_TIPO: Record<TipoEvento, CampoEvento[]> = {
  caida: [
    { key: 'con_lesion', label: 'Con lesión', tipo: 'select', opciones: ['Sí', 'No', 'Pendiente de valoración'], requerido: true },
    { key: 'gravedad', label: 'Gravedad', tipo: 'select', opciones: ['Sin lesión', 'Leve', 'Moderada', 'Grave', 'Pendiente de valoración'] },
    { key: 'lugar', label: 'Lugar', tipo: 'select', opciones: LUGARES, requerido: true },
    // Solo se pide si el lugar es un pasillo o la sala de terapia (ver DETALLE_LUGAR).
    { key: 'lugar_detalle', label: 'Pasillo / sala', tipo: 'select', opciones: DETALLES_LUGAR },
    { key: 'presenciada', label: 'Presenciada', tipo: 'select', opciones: ['Presenciada por el personal', 'No presenciada (hallado en el suelo)'], requerido: true },
    { key: 'mecanismo', label: 'Mecanismo', tipo: 'select', opciones: ['Levantándose de la cama', 'Levantándose del sillón / silla', 'Caminando', 'Sentándose', 'Cayó de la cama', 'En el aseo / ducha', 'Durante una transferencia', 'Otro / se desconoce'], requerido: true },
    { key: 'circunstancias', label: 'Circunstancias', tipo: 'select', opciones: ['Solo', 'Supervisado', 'Con sujeción activa'] },
    { key: 'consecuencias', label: 'Consecuencias', tipo: 'select', opciones: ['Sin lesión', 'Contusión', 'Herida', 'Fractura', 'TCE', 'Otro', 'Pendiente de valoración'] },
    DERIVACION,
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
    DERIVACION,
  ],

  infeccion_nosocomial: [
    { key: 'tipo', label: 'Tipo de infección', tipo: 'select', opciones: ['Urinaria (ITU)', 'Respiratoria', 'Herida quirúrgica', 'Gastrointestinal', 'Piel / partes blandas', 'Otra'], requerido: true },
    { key: 'agente', label: 'Agente causal (si conocido)', tipo: 'text' },
    { key: 'confirmacion', label: 'Confirmación diagnóstica', tipo: 'select', opciones: ['Sospecha clínica', 'Confirmada por microbiología'], requerido: true },
    DERIVACION,
  ],

  agresividad_fisica: [
    { key: 'dirigida_a', label: 'Dirigida a', tipo: 'select', opciones: ['Personal sanitario', 'Otro paciente', 'Familiar', 'Objeto / mobiliario'], requerido: true },
    { key: 'tipo', label: 'Tipo de agresión', tipo: 'select', opciones: ['Golpes', 'Mordeduras', 'Empujones', 'Arañazos', 'Lanzamiento de objetos', 'Otra'], requerido: true },
    { key: 'gravedad', label: 'Gravedad / consecuencias', tipo: 'select', opciones: ['Sin lesión a terceros', 'Lesión leve', 'Lesión grave', 'Daños materiales'], requerido: true },
    { key: 'lugar', label: 'Lugar', tipo: 'select', opciones: LUGARES, requerido: true },
    { key: 'lugar_detalle', label: 'Pasillo / sala', tipo: 'select', opciones: DETALLES_LUGAR },
    { key: 'medidas', label: 'Medidas adoptadas', tipo: 'select', opciones: ['Contención verbal', 'Rescate farmacológico', 'Contención física', 'Notificación a dirección', 'Varias'], requerido: true },
    DERIVACION,
  ],

  fuga: [
    { key: 'resolucion', label: 'Resolución', tipo: 'select', opciones: ['Regreso voluntario', 'Recuperado por personal', 'Recuperado por familia', 'Intervención policial'], requerido: true },
    { key: 'duracion', label: 'Duración de la ausencia', tipo: 'text' },
    { key: 'destino_conocido', label: 'Destino conocido', tipo: 'select', opciones: ['Sí', 'No'] },
  ],

  atragantamiento: [
    { key: 'situacion', label: 'Situación', tipo: 'select', opciones: ['Durante una comida', 'Durante la toma de medicación', 'Fuera de las comidas'], requerido: true },
    { key: 'material', label: 'Qué lo provocó', tipo: 'select', opciones: ['Sólido', 'Líquido', 'Saliva / secreciones', 'Medicación'], requerido: true },
    { key: 'textura', label: 'Textura de la dieta en ese momento', tipo: 'select', opciones: ['Normal', 'Blanda', 'Triturada', 'Líquidos espesados', 'No consta'] },
    { key: 'actuacion', label: 'Actuación', tipo: 'select', opciones: ['Tos eficaz, sin intervención', 'Maniobra de desobstrucción (Heimlich)', 'Aspiración de la vía aérea', 'Soporte vital / emergencias'], requerido: true },
    { key: 'consecuencias', label: 'Consecuencias', tipo: 'select', opciones: ['Sin consecuencias', 'Sospecha de aspiración (vigilar)', 'Aspiración confirmada'], requerido: true },
    DERIVACION,
  ],
}

// Lugares que hay que concretar: en qué pasillo (Azul, Verde, Violeta o Gris) o en qué sala de terapia (1 o 2).
export const DETALLE_LUGAR: Record<string, { label: string; opciones: string[] }> = {
  'Pasillo': { label: 'Pasillo', opciones: ['Azul', 'Verde', 'Violeta', 'Gris'] },
  'Sala de terapia': { label: 'Sala de terapia', opciones: ['Sala 1', 'Sala 2'] },
}

// El campo tal como se muestra en el formulario con los datos actuales, o null si hoy no toca (el detalle del lugar
// solo aparece cuando el lugar es un pasillo o la sala de terapia, y entonces es obligatorio).
export function campoVisible(c: CampoEvento, datos: Record<string, string>): CampoEvento | null {
  if (c.key !== 'lugar_detalle') return c
  const d = DETALLE_LUGAR[datos.lugar ?? '']
  return d ? { ...c, label: d.label, opciones: d.opciones, requerido: true } : null
}

export const TURNO_LABEL: Record<string, string> = {
  manana: 'Mañana',
  tarde: 'Tarde',
  noche: 'Noche',
}

// Una incidencia «pendiente de completar» que lleva abierta más de este número de días se destaca.
export const DIAS_PENDIENTE_AVISO = 7

// Días que lleva abierta una incidencia pendiente: desde que se registró (created_at) o, si no se tiene, desde el suceso.
export function diasPendiente(ev: { created_at?: string | null; fecha: string }): number {
  return Math.max(0, diasEntre(ev.created_at ?? ev.fecha) ?? 0)
}
