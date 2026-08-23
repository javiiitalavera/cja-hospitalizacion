export type Rol = 'medico' | 'enfermeria' | 'auxiliar' | 'tecnico'
export type EstadoIngreso = 'activo' | 'alta' | 'alta_traslado' | 'exitus'

// Etiqueta y color de cada estado de ingreso. Vive aquí, junto al tipo,
// para que no se redefina por separado en cada pantalla que lo usa
// (antes estaba repetido igual en 5 archivos distintos).
export const ESTADO_INGRESO_LABEL: Record<string, string> = {
  activo: 'Ingresado',
  alta: 'Alta',
  alta_traslado: 'Traslado',
  exitus: 'Éxitus',
}
export const ESTADO_INGRESO_COLOR: Record<string, string> = {
  activo: 'bg-emerald-100 text-emerald-700',
  alta: 'bg-slate-100 text-slate-500',
  alta_traslado: 'bg-blue-100 text-blue-600',
  exitus: 'bg-red-100 text-red-600',
}

// Colores del semáforo de caídas. Antes repetidos, idénticos, en
// Home.tsx, HojaItems.tsx y Dashboard.tsx.
export const SEMAFORO_CAIDAS_COLOR: Record<string, string> = {
  verde: '#92D050',
  amarillo: '#FFFF00',
  naranja: '#FF9900',
  rojo: '#FF0000',
}
export type Sexo = 'hombre' | 'mujer' | 'otro'

export interface Profesional {
  id: string
  nombre: string
  apellidos: string
  rol: Rol
  activo: boolean
  es_admin: boolean
  user_id?: string | null
  colegiado?: string
  especialidad?: string
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

// "Apellidos, Nombre" con los dos apellidos si existen. Antes estaba
// repetido en al menos 8 archivos, y dos variantes distintas convivían:
// unas pantallas mostraban el segundo apellido y otras lo omitían en
// silencio. Se usa siempre la versión completa.
export function nombreCompleto(p: { nombre: string; primer_apellido: string; segundo_apellido?: string | null }): string {
  const apellidos = p.segundo_apellido ? `${p.primer_apellido} ${p.segundo_apellido}` : p.primer_apellido
  return `${apellidos}, ${p.nombre}`
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
  tratamiento_ingreso_estructurado?: FilaMedicacion[]
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
  plan_medicacion_estructurado?: FilaMedicacion[]
  plan_otros_cuidados?: string
  created_at: string
  updated_at: string
}

export interface FilaMedicacion {
  farmaco: string
  dosis: string
  desayuno: string
  comida: string
  merienda: string
  cena: string
  acostar: string
  observaciones: string
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
  medicacion_estructurada?: FilaMedicacion[]
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
  sujecion_silla_ruedas?: 'no' | 'si_precisa' | 'continuo'
  sujecion_sillon?: 'no' | 'si_precisa' | 'continuo'
  colchon_antiescaras: boolean
  patucos_coderas: boolean
  sensor_cama: boolean
  motivo_sujecion: string[]
  observaciones_sujeciones?: string
  semaforo_caidas?: 'verde' | 'amarillo' | 'naranja' | 'rojo'
  created_at: string
  updated_at: string
}
