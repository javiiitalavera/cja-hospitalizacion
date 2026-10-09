// "Otros informes": tipos y plantillas. Cada tipo de informe tiene unos
// campos fijos (como los informes de ingreso y de alta); lo escrito se
// guarda como un objeto {campo: texto}.

export type PlantillaId = 'derivacion_urgencias' | 'estado_actual' | 'libre'

export interface CampoInforme {
  key: string
  label: string
  // Encabezado de grupo en el documento Word (solo campos heredados).
  grupo?: string
  // Tamaño inicial del cuadro, en líneas; luego crece solo.
  filas?: number
}

export interface InformePuntual {
  id: string
  ingreso_id: string
  plantilla: PlantillaId
  campos: Record<string, string>
  version: number
  registrado_por_id: string | null
  created_at: string
  updated_at: string
  registrado_por?: { nombre: string; apellidos: string } | null
}

export interface Plantilla {
  id: PlantillaId
  label: string
  // Una línea que explica para qué sirve el informe.
  subtitulo: string
  // Título dentro del documento y título corto de la cabecera del Word.
  titulo: string
  tituloCabecera: string
  // Campos que se escriben en este informe.
  campos: CampoInforme[]
  // Campos que NO se editan aquí: se leen del informe de ingreso (y de
  // alta, para medicación y escalas) en el momento de exportar, y salen
  // en el Word antes de los campos propios.
  heredados?: CampoInforme[]
  avisoHeredados?: string
}

// Campos del informe de ingreso (mismos nombres que su tabla, para leerlos
// tal cual). "tratamiento" y "escalas" se construyen al exportar.
const HEREDADOS_INGRESO: CampoInforme[] = [
  { key: 'alergias', label: 'Alergias', grupo: 'ANTECEDENTES PATOLÓGICOS' },
  { key: 'antecedentes_medicos', label: 'Antecedentes médicos', grupo: 'ANTECEDENTES PATOLÓGICOS' },
  { key: 'antecedentes_quirurgicos', label: 'Intervenciones quirúrgicas', grupo: 'ANTECEDENTES PATOLÓGICOS' },
  { key: 'antecedentes_familiares', label: 'Antecedentes familiares', grupo: 'ANTECEDENTES PATOLÓGICOS' },
  { key: 'tratamiento', label: 'Tratamiento', grupo: 'ANTECEDENTES PATOLÓGICOS' },
  { key: 'vgi_social', label: 'Social', grupo: 'VALORACIÓN GERIÁTRICA INTEGRAL' },
  { key: 'vgi_funcional', label: 'Funcional', grupo: 'VALORACIÓN GERIÁTRICA INTEGRAL' },
  { key: 'vgi_cognitivo', label: 'Cognitivo', grupo: 'VALORACIÓN GERIÁTRICA INTEGRAL' },
  { key: 'vgi_sensorial', label: 'Sensorial', grupo: 'VALORACIÓN GERIÁTRICA INTEGRAL' },
  { key: 'vgi_nutricional', label: 'Nutricional', grupo: 'VALORACIÓN GERIÁTRICA INTEGRAL' },
  { key: 'vgi_dolor', label: 'Dolor', grupo: 'VALORACIÓN GERIÁTRICA INTEGRAL' },
  { key: 'vgi_otros', label: 'Otros síndromes geriátricos', grupo: 'VALORACIÓN GERIÁTRICA INTEGRAL' },
  { key: 'personalidad_previa', label: 'Personalidad previa', grupo: 'ENFERMEDAD ACTUAL' },
  { key: 'evolucion', label: 'Evolución del deterioro cognitivo, conductual y funcional', grupo: 'ENFERMEDAD ACTUAL' },
  { key: 'situacion_cognitivo', label: 'Situación actual: cognitivo', grupo: 'ENFERMEDAD ACTUAL' },
  { key: 'situacion_conductual', label: 'Situación actual: conductual', grupo: 'ENFERMEDAD ACTUAL' },
  { key: 'situacion_animico', label: 'Situación actual: anímico', grupo: 'ENFERMEDAD ACTUAL' },
  { key: 'situacion_funcional', label: 'Situación actual: funcional', grupo: 'ENFERMEDAD ACTUAL' },
  { key: 'situacion_social', label: 'Situación actual: social', grupo: 'ENFERMEDAD ACTUAL' },
  { key: 'exploracion_fisica', label: 'Exploración física', grupo: 'EXPLORACIÓN' },
  { key: 'exploracion_neurologica', label: 'Exploración neurológica', grupo: 'EXPLORACIÓN' },
  { key: 'exploracion_psicopatologica', label: 'Exploración psicopatológica', grupo: 'EXPLORACIÓN' },
  { key: 'exploraciones_complementarias', label: 'Exploraciones complementarias', grupo: 'EXPLORACIÓN' },
  { key: 'escalas', label: 'Escalas clínicas', grupo: 'ESCALAS Y DIAGNÓSTICO' },
  { key: 'impresion_diagnostica', label: 'Impresión diagnóstica (al ingreso)', grupo: 'ESCALAS Y DIAGNÓSTICO' },
  { key: 'plan_objetivos', label: 'Plan terapéutico: objetivos', grupo: 'PLAN TERAPÉUTICO AL INGRESO' },
  { key: 'plan_medicacion', label: 'Plan terapéutico: cambios de medicación propuestos', grupo: 'PLAN TERAPÉUTICO AL INGRESO' },
  { key: 'plan_otros_cuidados', label: 'Plan terapéutico: otros cuidados/intervenciones', grupo: 'PLAN TERAPÉUTICO AL INGRESO' },
]

export const PLANTILLAS: Plantilla[] = [
  {
    id: 'derivacion_urgencias',
    label: 'Derivación a urgencias',
    subtitulo: 'Para el hospital al que se deriva al paciente.',
    titulo: 'Informe de derivación a urgencias',
    tituloCabecera: 'INFORME DE DERIVACIÓN',
    campos: [
      { key: 'motivo', label: 'Motivo de derivación', filas: 3 },
      { key: 'enfermedad_actual', label: 'Enfermedad actual', filas: 8 },
      { key: 'plan', label: 'Plan', filas: 5 },
    ],
  },
  {
    id: 'estado_actual',
    label: 'Estado actual',
    subtitulo: 'Para la trabajadora social, la familia o una residencia que piden el estado actual.',
    titulo: 'Informe de estado actual',
    tituloCabecera: 'INFORME DE ESTADO ACTUAL',
    campos: [
      { key: 'evolucion_clinica', label: 'Evolución clínica', filas: 8 },
      { key: 'diagnosticos', label: 'Diagnósticos', filas: 4 },
      { key: 'plan', label: 'Plan', filas: 5 },
    ],
    heredados: HEREDADOS_INGRESO,
    avisoHeredados: 'Los datos del informe de ingreso se heredan al exportar (medicación y escalas, las más recientes).',
  },
  {
    id: 'libre',
    label: 'Informe libre',
    subtitulo: 'Informe médico sin estructura fija.',
    titulo: 'Informe médico',
    tituloCabecera: 'INFORME MÉDICO',
    campos: [{ key: 'contenido', label: 'Contenido', filas: 14 }],
  },
]

export function plantillaPorId(id: string): Plantilla {
  return PLANTILLAS.find((p) => p.id === id) ?? PLANTILLAS[PLANTILLAS.length - 1]
}

export const PLANTILLA_LABEL: Record<string, string> = Object.fromEntries(PLANTILLAS.map((p) => [p.id, p.label]))

// Mismo límite que impone la base de datos.
export const MAX_TEXTO = 30000
