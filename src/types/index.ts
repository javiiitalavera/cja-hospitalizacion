export type Rol = 'medico' | 'enfermeria' | 'auxiliar' | 'administrativo' | 'tecnico'
export type EstadoIngreso = 'activo' | 'alta' | 'exitus'
export type Sexo = 'hombre' | 'mujer' | 'otro'

export interface Profesional {
  id: string
  nombre: string
  apellidos: string
  rol: Rol
  activo: boolean
  created_at: string
}

export interface Paciente {
  id: string
  cipna?: string
  nhc?: string
  nombre: string
  primer_apellido: string
  segundo_apellido?: string
  fecha_nacimiento?: string
  sexo?: Sexo
  dni?: string
  municipio?: string
  medico_cabecera?: string
  contacto_familiar_nombre?: string
  contacto_familiar_telefono?: string
  created_at: string
}

export interface Ingreso {
  id: string
  paciente_id: string
  fecha_ingreso: string
  fecha_alta?: string
  habitacion?: number
  medico_responsable_id?: string
  motivo_ingreso?: string
  estado: EstadoIngreso
  created_at: string
  // joins
  paciente?: Paciente
  medico_responsable?: Profesional
}

export interface InformeIngreso {
  id: string
  ingreso_id: string
  alergias?: string
  antecedentes_medicos?: string
  antecedentes_quirurgicos?: string
  antecedentes_familiares?: string
  tratamiento_ingreso?: string
  vgi_social?: string
  vgi_funcional?: string
  barthel?: number
  lawton?: number
  vgi_cognitivo?: string
  vgi_sensorial?: string
  vgi_nutricional?: string
  vgi_dolor?: string
  vgi_otros?: string
  personalidad_previa?: string
  evolucion?: string
  situacion_cognitivo?: string
  situacion_conductual?: string
  situacion_animico?: string
  situacion_funcional?: string
  situacion_social?: string
  exploracion_fisica?: string
  exploracion_neurologica?: string
  exploracion_psicopatologica?: string
  exploraciones_complementarias?: string
  impresion_diagnostica?: string
  plan_objetivos?: string
  plan_medicacion?: string
  plan_otros_cuidados?: string
  created_at: string
  updated_at: string
}

export interface InformeAlta {
  id: string
  ingreso_id: string
  exploraciones_durante_ingreso?: string
  estudio_neuropsicologico?: string
  informe_fisioterapia?: string
  informe_terapia_ocupacional?: string
  evolucion_clinica?: string
  juicios_clinicos?: string
  recomendaciones_conductuales?: string
  cuidados_enfermeria?: string
  medicacion_alta?: string
  otras_recomendaciones?: string
  created_at: string
  updated_at: string
}

export interface ItemsPaciente {
  id: string
  ingreso_id: string
  dependencia_avd?: 1 | 2
  panial_dia?: 'ninguno' | 'BP' | 'CA'
  panial_noche?: 'ninguno' | 'BP' | 'CA' | 'CA+malla'
  colector: boolean
  sonda_vesical: boolean
  dentadura?: 'ninguna' | 'superior' | 'inferior' | 'completa' | 'fija' | 'puente'
  audifonos?: 'ninguno' | 'derecho' | 'izquierdo' | 'ambos'
  gafas?: 'no' | 'si' | 'solo_tv'
  higiene?: 'lavabo' | 'cama'
  vestido?: string
  ducha?: 'pie' | 'sentado'
  banio: boolean
  siestas: boolean
  deambulacion?: string
  ayudas_deambulacion?: 'ninguna' | 'baston' | 'andador_2r' | 'andador_4r' | 'silla_ruedas'
  bipedestador: boolean
  grua: boolean
  cambios_posturales: boolean
  cama_45: boolean
  ingestas?: 'autonomo' | 'dependiente'
  oxigenoterapia: boolean
  botella_noche: boolean
  sujecion_cama: string[]
  sujecion_silla_ruedas: string[]
  sujecion_sillon: string[]
  colchon_antiescaras: boolean
  patucos_coderas: boolean
  sensor_cama: boolean
  motivo_sujecion: string[]
  observaciones_sujeciones?: string
  created_at: string
  updated_at: string
}

export interface Evento {
  id: string
  ingreso_id: string
  fecha: string
  tipo: 'caida' | 'ulcera' | 'infeccion_nosocomial' | 'agresion' | 'autoagresion' | 'elopement' | 'otro'
  descripcion?: string
  consecuencias?: string
  medidas_tomadas?: string
  registrado_por_id?: string
  created_at: string
  registrado_por?: Profesional
}
