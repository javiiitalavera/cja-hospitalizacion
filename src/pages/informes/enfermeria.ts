// Informe de enfermería ("Continuidad de cuidados de enfermería"): un único
// informe por ingreso, con campos fijos agrupados. Lo escribe enfermería;
// el resto del equipo lo lee y lo exporta a Word.
//
// Lo escrito se guarda como un objeto {campo: texto} (columna "campos").
// Añadir, quitar o renombrar un campo aquí NO requiere tocar la base de
// datos: los informes ya guardados conservan lo que tuvieran.

export interface CampoEnfermeria {
  key: string
  label: string
  // Tamaño inicial del cuadro, en líneas; luego crece solo.
  filas?: number
  // Respuestas rápidas: botones que rellenan el campo cuando está vacío
  // (la mayoría de los campos son "no precisa" / "no").
  atajos?: string[]
}

export interface GrupoEnfermeria {
  titulo: string
  campos: CampoEnfermeria[]
}

const NO_PRECISA = ['No precisa.']
const NO = ['No.']

export const GRUPOS_ENFERMERIA: GrupoEnfermeria[] = [
  {
    titulo: 'Oxigenación',
    campos: [{ key: 'oxigenoterapia', label: 'Oxigenoterapia', filas: 1, atajos: NO_PRECISA }],
  },
  {
    titulo: 'Alimentación',
    campos: [
      { key: 'alimentacion_tipo', label: 'Tipo de alimentación', filas: 2 },
      { key: 'alimentacion_dependiente', label: 'Dependiente', filas: 1, atajos: NO },
    ],
  },
  {
    titulo: 'Continencia',
    campos: [{ key: 'continencia', label: 'Pañal / continencia', filas: 1, atajos: ['Continente de ambos esfínteres.'] }],
  },
  {
    titulo: 'Movilización',
    campos: [
      { key: 'deambulacion', label: 'Deambulación', filas: 2 },
      { key: 'cambios_posturales', label: 'Cambios posturales en cama', filas: 1, atajos: NO_PRECISA },
    ],
  },
  {
    titulo: 'Reposo y sueño',
    campos: [{ key: 'sueno', label: 'Cómo duerme', filas: 2, atajos: ['Duerme adecuadamente.'] }],
  },
  {
    titulo: 'Contenciones',
    campos: [
      { key: 'contencion_cama', label: 'Cama', filas: 1, atajos: NO_PRECISA },
      { key: 'contencion_sillon', label: 'Sillón', filas: 1, atajos: NO_PRECISA },
    ],
  },
  {
    titulo: 'Integridad cutánea',
    campos: [
      { key: 'piel', label: 'Integridad de la piel', filas: 2 },
      { key: 'ulceras', label: 'Úlceras (localización y tratamiento)', filas: 2, atajos: NO },
      { key: 'lesiones', label: 'Lesiones cutáneas', filas: 2, atajos: NO },
    ],
  },
  {
    titulo: 'Higiene',
    campos: [{ key: 'higiene', label: 'Dependiente', filas: 2 }],
  },
  {
    titulo: 'Técnicas',
    campos: [
      { key: 'via_intravenosa', label: 'Vía intravenosa', filas: 1, atajos: NO_PRECISA },
      { key: 'sondaje_vesical', label: 'Sondaje vesical', filas: 1, atajos: NO_PRECISA },
      { key: 'sondaje_nasogastrico', label: 'Sondaje nasogástrico', filas: 1, atajos: NO_PRECISA },
      { key: 'tecnicas_otros', label: 'Otros', filas: 1, atajos: NO },
    ],
  },
  // Añadidos a los del modelo original (pensados para la continuidad de
  // cuidados de pacientes con deterioro cognitivo).
  {
    titulo: 'Comunicación y conducta',
    campos: [
      { key: 'comunicacion', label: 'Comunicación (orientación, lenguaje)', filas: 2 },
      { key: 'conducta', label: 'Conducta (agitación, errancia, otras)', filas: 2 },
    ],
  },
  {
    titulo: 'Prótesis y ayudas técnicas',
    campos: [{ key: 'protesis', label: 'Dentadura, gafas, audífonos, ayudas para caminar', filas: 2, atajos: NO_PRECISA }],
  },
  {
    titulo: 'Seguridad',
    campos: [{ key: 'riesgo_caidas', label: 'Riesgo de caídas y medidas', filas: 2 }],
  },
  {
    titulo: 'Observaciones',
    campos: [{ key: 'observaciones', label: 'Otras indicaciones para la continuidad de cuidados', filas: 3 }],
  },
]

export interface InformeEnfermeria {
  id: string
  ingreso_id: string
  campos: Record<string, string>
  version: number
  elaborado_por_id: string | null
  created_at: string
  updated_at: string
  elaborado_por?: { nombre: string; apellidos: string } | null
}

// Mismo límite que impone la base de datos para cada campo.
export const MAX_TEXTO_ENFERMERIA = 30000

// ¿Tiene algún texto el informe? (para el estado en la lista de informes)
export function informeEnfermeriaVacio(campos: Record<string, string> | null | undefined): boolean {
  return Object.values(campos ?? {}).every((v) => !v || !v.trim())
}
