// "Otros informes": tipos y plantillas. Un informe puntual es una lista de
// secciones (título + texto) que arranca de una plantilla y después se
// edita con total libertad: se pueden renombrar, quitar, añadir y
// reordenar secciones.

export type PlantillaId = 'derivacion_urgencias' | 'trabajo_social' | 'estado_actual' | 'libre'

export interface SeccionInforme {
  titulo: string
  texto: string
  // De qué dato de la ficha se puede (re)rellenar la sección. null/ausente:
  // sección de redacción libre.
  origen?: string | null
}

export interface ProfesionalFirma {
  nombre: string
  apellidos: string
  colegiado?: string | null
  especialidad?: string | null
}

export interface InformePuntual {
  id: string
  ingreso_id: string
  plantilla: PlantillaId
  titulo: string
  destinatario: string | null
  fecha: string
  secciones: SeccionInforme[]
  estado: 'borrador' | 'firmado'
  firmado_por_id: string | null
  firmado_en: string | null
  reemplaza_a_id: string | null
  version: number
  registrado_por_id: string | null
  created_at: string
  updated_at: string
  registrado_por?: ProfesionalFirma | null
  firmado_por?: ProfesionalFirma | null
}

// Etiqueta de cada origen (para el botón "Rellenar desde la ficha").
export const ORIGEN_LABEL: Record<string, string> = {
  datos_ingreso: 'datos del ingreso',
  diagnosticos: 'diagnósticos (CMBD)',
  impresion: 'impresión diagnóstica',
  antecedentes: 'antecedentes',
  alergias: 'alergias',
  medicacion: 'medicación',
  escalas: 'escalas clínicas',
  autonomia: 'hoja de ítems',
  alerta_conducta: 'alertas de conducta',
  curas: 'curas activas',
  situacion: 'situación al ingreso',
  social: 'situación social',
  contacto: 'contacto familiar',
}

// Título por defecto al añadir a mano una sección de la ficha.
export const ORIGEN_TITULO: Record<string, string> = {
  datos_ingreso: 'Datos del ingreso',
  diagnosticos: 'Diagnósticos',
  impresion: 'Impresión diagnóstica',
  antecedentes: 'Antecedentes de interés',
  alergias: 'Alergias',
  medicacion: 'Tratamiento actual',
  escalas: 'Escalas clínicas',
  autonomia: 'Autonomía y cuidados',
  alerta_conducta: 'Alertas de conducta y manejo',
  curas: 'Curas y cuidados de enfermería',
  situacion: 'Situación cognitiva, conductual y afectiva',
  social: 'Situación sociofamiliar',
  contacto: 'Contacto familiar',
}

interface SeccionPlantilla { titulo: string; origen?: string }

interface Plantilla {
  id: PlantillaId
  label: string
  descripcion: string
  titulo: string
  destinatario: string
  secciones: SeccionPlantilla[]
}

export const PLANTILLAS: Plantilla[] = [
  {
    id: 'derivacion_urgencias',
    label: 'Derivación a urgencias',
    descripcion: 'Informe breve para el hospital: motivo, antecedentes, alergias, tratamiento y situación basal.',
    titulo: 'Informe de derivación a urgencias',
    destinatario: 'Servicio de Urgencias',
    secciones: [
      { titulo: 'Motivo de derivación' },
      { titulo: 'Clínica actual y exploración' },
      { titulo: 'Antecedentes de interés', origen: 'antecedentes' },
      { titulo: 'Alergias', origen: 'alergias' },
      { titulo: 'Tratamiento actual', origen: 'medicacion' },
      { titulo: 'Situación basal cognitiva y funcional', origen: 'escalas' },
      { titulo: 'Autonomía y cuidados', origen: 'autonomia' },
      { titulo: 'Alertas de conducta y manejo', origen: 'alerta_conducta' },
      { titulo: 'Pruebas realizadas' },
      { titulo: 'Se solicita' },
    ],
  },
  {
    id: 'trabajo_social',
    label: 'Trabajadora social (valoración de recursos)',
    descripcion: 'Para valorar recursos o traslado a residencia: diagnósticos, autonomía, cuidados y situación social.',
    titulo: 'Informe para valoración de recursos',
    destinatario: 'Trabajo social',
    secciones: [
      { titulo: 'Datos del ingreso', origen: 'datos_ingreso' },
      { titulo: 'Diagnósticos', origen: 'diagnosticos' },
      { titulo: 'Situación cognitiva, conductual y afectiva', origen: 'situacion' },
      { titulo: 'Escalas clínicas', origen: 'escalas' },
      { titulo: 'Autonomía y necesidades de cuidado', origen: 'autonomia' },
      { titulo: 'Curas y cuidados de enfermería', origen: 'curas' },
      { titulo: 'Alertas de conducta y manejo', origen: 'alerta_conducta' },
      { titulo: 'Situación sociofamiliar', origen: 'social' },
      { titulo: 'Contacto familiar', origen: 'contacto' },
      { titulo: 'Valoración y recurso recomendado' },
    ],
  },
  {
    id: 'estado_actual',
    label: 'Estado actual (familia o residencia)',
    descripcion: 'Informe de situación actual para la familia o para una residencia que lo solicita.',
    titulo: 'Informe del estado actual',
    destinatario: 'Familia / Residencia',
    secciones: [
      { titulo: 'Datos del ingreso', origen: 'datos_ingreso' },
      { titulo: 'Diagnósticos', origen: 'diagnosticos' },
      { titulo: 'Evolución y situación actual' },
      { titulo: 'Escalas clínicas', origen: 'escalas' },
      { titulo: 'Autonomía y cuidados', origen: 'autonomia' },
      { titulo: 'Tratamiento actual', origen: 'medicacion' },
      { titulo: 'Alertas de conducta y manejo', origen: 'alerta_conducta' },
      { titulo: 'Curas y cuidados de enfermería', origen: 'curas' },
      { titulo: 'Conclusiones y recomendaciones' },
    ],
  },
  {
    id: 'libre',
    label: 'Informe libre',
    descripcion: 'Una página en blanco: tú decides el título y las secciones. Puedes añadir datos de la ficha.',
    titulo: 'Informe médico',
    destinatario: '',
    secciones: [{ titulo: 'Contenido' }],
  },
]

export function plantillaPorId(id: string): Plantilla {
  return PLANTILLAS.find((p) => p.id === id) ?? PLANTILLAS[PLANTILLAS.length - 1]
}

export const PLANTILLA_LABEL: Record<string, string> = Object.fromEntries(
  PLANTILLAS.map((p) => [p.id, p.label])
)

// Límites que también impone la base de datos.
export const MAX_SECCIONES = 40
export const MAX_TEXTO = 20000
export const MAX_TITULO_SECCION = 200
