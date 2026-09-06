// ============================================================
// Contenido clínico de las cuatro escalas — ítems, descripciones y
// reglas de puntuación de las versiones en español habitualmente
// usadas en valoración geriátrica. No se han inventado ítems ni
// reglas: cada uno se puntúa según su convención estándar.
// ============================================================

export interface OpcionEscala {
  valor: string
  etiqueta: string
  puntos: number
}

export interface ItemEscala {
  key: string
  label: string
  opciones: OpcionEscala[]
}

// ─── BARTHEL — 10 ítems, 0 a 100 ───────────────────────────────

export const BARTHEL_ITEMS: ItemEscala[] = [
  {
    key: 'comer', label: 'Comer', opciones: [
      { valor: 'independiente', etiqueta: 'Independiente', puntos: 10 },
      { valor: 'ayuda', etiqueta: 'Necesita ayuda (cortar, extender, etc.)', puntos: 5 },
      { valor: 'dependiente', etiqueta: 'Dependiente', puntos: 0 },
    ],
  },
  {
    key: 'banio', label: 'Lavarse / bañarse', opciones: [
      { valor: 'independiente', etiqueta: 'Independiente (entra y sale solo del baño)', puntos: 5 },
      { valor: 'dependiente', etiqueta: 'Dependiente', puntos: 0 },
    ],
  },
  {
    key: 'vestirse', label: 'Vestirse', opciones: [
      { valor: 'independiente', etiqueta: 'Independiente (botones, cordones, etc.)', puntos: 10 },
      { valor: 'ayuda', etiqueta: 'Necesita ayuda, pero hace al menos la mitad', puntos: 5 },
      { valor: 'dependiente', etiqueta: 'Dependiente', puntos: 0 },
    ],
  },
  {
    key: 'arreglarse', label: 'Arreglarse (aseo personal)', opciones: [
      { valor: 'independiente', etiqueta: 'Independiente (cara, manos, peinarse, afeitarse)', puntos: 5 },
      { valor: 'dependiente', etiqueta: 'Necesita ayuda', puntos: 0 },
    ],
  },
  {
    key: 'deposicion', label: 'Deposición (control de heces)', opciones: [
      { valor: 'continente', etiqueta: 'Continente', puntos: 10 },
      { valor: 'ocasional', etiqueta: 'Accidente ocasional (o necesita ayuda con enemas/supositorios)', puntos: 5 },
      { valor: 'incontinente', etiqueta: 'Incontinente', puntos: 0 },
    ],
  },
  {
    key: 'miccion', label: 'Micción (control de orina)', opciones: [
      { valor: 'continente', etiqueta: 'Continente (o se cuida solo de la sonda)', puntos: 10 },
      { valor: 'ocasional', etiqueta: 'Accidente ocasional (máx. una vez/24h)', puntos: 5 },
      { valor: 'incontinente', etiqueta: 'Incontinente', puntos: 0 },
    ],
  },
  {
    key: 'retrete', label: 'Uso del retrete', opciones: [
      { valor: 'independiente', etiqueta: 'Independiente (entra, sale, se limpia, se viste)', puntos: 10 },
      { valor: 'ayuda', etiqueta: 'Necesita ayuda para el equilibrio o la ropa', puntos: 5 },
      { valor: 'dependiente', etiqueta: 'Dependiente', puntos: 0 },
    ],
  },
  {
    key: 'traslado', label: 'Traslado cama / sillón', opciones: [
      { valor: 'independiente', etiqueta: 'Independiente', puntos: 15 },
      { valor: 'minima_ayuda', etiqueta: 'Mínima ayuda física o supervisión', puntos: 10 },
      { valor: 'gran_ayuda', etiqueta: 'Gran ayuda, pero se mantiene sentado sin apoyo', puntos: 5 },
      { valor: 'dependiente', etiqueta: 'Dependiente, no se mantiene sentado', puntos: 0 },
    ],
  },
  {
    key: 'deambulacion', label: 'Deambulación (superficie llana)', opciones: [
      { valor: 'independiente', etiqueta: 'Independiente 50 m (puede usar bastón/muletas)', puntos: 15 },
      { valor: 'ayuda', etiqueta: 'Necesita ayuda física o supervisión, 50 m', puntos: 10 },
      { valor: 'silla_ruedas', etiqueta: 'Independiente en silla de ruedas, 50 m', puntos: 5 },
      { valor: 'dependiente', etiqueta: 'Dependiente / inmóvil', puntos: 0 },
    ],
  },
  {
    key: 'escalones', label: 'Subir y bajar escalones', opciones: [
      { valor: 'independiente', etiqueta: 'Independiente', puntos: 10 },
      { valor: 'ayuda', etiqueta: 'Necesita ayuda física o supervisión', puntos: 5 },
      { valor: 'dependiente', etiqueta: 'Dependiente / incapaz', puntos: 0 },
    ],
  },
]

// ─── LAWTON — 8 ítems, 0 a 8 (1 = independiente, 0 = el resto) ──

export const LAWTON_ITEMS: ItemEscala[] = [
  {
    key: 'telefono', label: 'Uso del teléfono', opciones: [
      { valor: 'iniciativa', etiqueta: 'Utiliza el teléfono por iniciativa propia, busca y marca números', puntos: 1 },
      { valor: 'algunos', etiqueta: 'Marca bien algunos números familiares', puntos: 1 },
      { valor: 'contesta', etiqueta: 'Contesta el teléfono, pero no marca', puntos: 1 },
      { valor: 'no_usa', etiqueta: 'No usa el teléfono en absoluto', puntos: 0 },
    ],
  },
  {
    key: 'compras', label: 'Hacer compras', opciones: [
      { valor: 'independiente', etiqueta: 'Realiza todas las compras necesarias independientemente', puntos: 1 },
      { valor: 'pequenas', etiqueta: 'Realiza independientemente pequeñas compras', puntos: 0 },
      { valor: 'acompanado', etiqueta: 'Necesita ir acompañado para cualquier compra', puntos: 0 },
      { valor: 'incapaz', etiqueta: 'Totalmente incapaz de comprar', puntos: 0 },
    ],
  },
  {
    key: 'comida', label: 'Preparación de la comida', opciones: [
      { valor: 'independiente', etiqueta: 'Organiza, prepara y sirve las comidas por sí sola', puntos: 1 },
      { valor: 'ingredientes', etiqueta: 'Prepara adecuadamente si se le dan los ingredientes', puntos: 0 },
      { valor: 'calienta', etiqueta: 'Calienta y sirve, pero no sigue una dieta adecuada', puntos: 0 },
      { valor: 'necesita', etiqueta: 'Necesita que le preparen y sirvan la comida', puntos: 0 },
    ],
  },
  {
    key: 'casa', label: 'Cuidado de la casa', opciones: [
      { valor: 'sola', etiqueta: 'Mantiene la casa sola o con ayuda ocasional para trabajos pesados', puntos: 1 },
      { valor: 'ligeras', etiqueta: 'Realiza tareas ligeras (platos, camas)', puntos: 1 },
      { valor: 'ligeras_sin_limpieza', etiqueta: 'Tareas ligeras, sin mantener una limpieza adecuada', puntos: 1 },
      { valor: 'ayuda_todo', etiqueta: 'Necesita ayuda en todas las labores de la casa', puntos: 1 },
      { valor: 'no_participa', etiqueta: 'No participa en ninguna labor de la casa', puntos: 0 },
    ],
  },
  {
    key: 'lavado', label: 'Lavado de la ropa', opciones: [
      { valor: 'toda', etiqueta: 'Lava por sí sola toda su ropa', puntos: 1 },
      { valor: 'pequenas', etiqueta: 'Lava por sí sola pequeñas prendas', puntos: 1 },
      { valor: 'otro', etiqueta: 'Todo el lavado debe ser realizado por otra persona', puntos: 0 },
    ],
  },
  {
    key: 'transporte', label: 'Medio de transporte', opciones: [
      { valor: 'solo', etiqueta: 'Viaja sola en transporte público o conduce su coche', puntos: 1 },
      { valor: 'taxi', etiqueta: 'Es capaz de coger un taxi, pero no otro medio', puntos: 1 },
      { valor: 'acompanada', etiqueta: 'Viaja en transporte público si va acompañada', puntos: 1 },
      { valor: 'ayuda', etiqueta: 'Utiliza taxi o coche solo con ayuda de otros', puntos: 0 },
      { valor: 'no_viaja', etiqueta: 'No viaja en absoluto', puntos: 0 },
    ],
  },
  {
    key: 'medicacion', label: 'Responsabilidad sobre su medicación', opciones: [
      { valor: 'correcta', etiqueta: 'Toma su medicación a la hora y dosis correcta', puntos: 1 },
      { valor: 'preparada', etiqueta: 'Toma la medicación si la dosis se prepara previamente', puntos: 0 },
      { valor: 'incapaz', etiqueta: 'No es capaz de administrarse la medicación', puntos: 0 },
    ],
  },
  {
    key: 'economia', label: 'Manejo de asuntos económicos', opciones: [
      { valor: 'sola', etiqueta: 'Se encarga de sus asuntos económicos por sí sola', puntos: 1 },
      { valor: 'compras_diarias', etiqueta: 'Compras diarias sí, grandes compras/bancos necesitan ayuda', puntos: 1 },
      { valor: 'incapaz', etiqueta: 'Incapaz de manejar dinero', puntos: 0 },
    ],
  },
]

// ─── NPI-Q — 12 dominios, solo gravedad, 0 a 36 ────────────────
// (sin malestar del cuidador, tal como se ha pedido)

export const NPI_DOMINIOS: { key: string; label: string }[] = [
  { key: 'delirios', label: 'Delirios (ideas delirantes)' },
  { key: 'alucinaciones', label: 'Alucinaciones' },
  { key: 'agitacion', label: 'Agitación / agresividad' },
  { key: 'depresion', label: 'Depresión / disforia' },
  { key: 'ansiedad', label: 'Ansiedad' },
  { key: 'euforia', label: 'Euforia / júbilo' },
  { key: 'apatia', label: 'Apatía / indiferencia' },
  { key: 'desinhibicion', label: 'Desinhibición' },
  { key: 'irritabilidad', label: 'Irritabilidad / labilidad' },
  { key: 'motora', label: 'Conducta motora aberrante' },
  { key: 'sueno', label: 'Sueño y conducta nocturna' },
  { key: 'apetito', label: 'Apetito y alimentación' },
]

export const NPI_GRAVEDAD_OPCIONES = [
  { valor: 'leve', etiqueta: 'Leve', puntos: 1 },
  { valor: 'moderada', etiqueta: 'Moderada', puntos: 2 },
  { valor: 'grave', etiqueta: 'Grave', puntos: 3 },
]

// ─── GDS (Reisberg) — 7 estadios ───────────────────────────────

export const GDS_ESTADIOS: { estadio: number; descripcion: string }[] = [
  { estadio: 1, descripcion: 'Sin déficit cognitivo. No hay quejas de pérdida de memoria ni déficit aparente en la entrevista clínica.' },
  { estadio: 2, descripcion: 'Déficit cognitivo muy leve. Quejas subjetivas de pérdida de memoria (dónde ha colocado objetos, olvido de nombres antes bien conocidos); no hay evidencia objetiva en la entrevista.' },
  { estadio: 3, descripcion: 'Déficit cognitivo leve. Primeros defectos claros: dificultad para orientarse en lugares no familiares, rendimiento laboral disminuido, dificultad para encontrar palabras o nombres, retención escasa al leer; puede negar los defectos, ansiedad leve-moderada.' },
  { estadio: 4, descripcion: 'Déficit cognitivo moderado. Défictis claros en una entrevista clínica cuidadosa: conocimiento disminuido de sucesos actuales y recientes, dificultad para manejar finanzas o viajar solo, incapacidad para tareas complejas; negación como mecanismo de defensa, embotamiento afectivo.' },
  { estadio: 5, descripcion: 'Déficit cognitivo moderadamente grave. No puede sobrevivir sin asistencia: no recuerda datos relevantes de su vida actual (dirección, teléfono), cierta desorientación en tiempo o lugar; necesita ayuda para elegir la ropa, conserva el conocimiento de sí mismo y de su familia.' },
  { estadio: 6, descripcion: 'Déficit cognitivo grave. Puede olvidar el nombre del cónyuge, desorientación temporoespacial casi completa, necesita asistencia para las actividades básicas de la vida diaria, incontinencia, alteraciones de conducta (delirios, síntomas obsesivos, ansiedad, agitación).' },
  { estadio: 7, descripcion: 'Déficit cognitivo muy grave. Pérdida progresiva de las capacidades verbales y psicomotoras, dependencia total para todas las actividades básicas de la vida diaria.' },
]

// ─── FAST — 7 estadios, con subestadios en 6 y 7 ───────────────

export const FAST_ESTADIOS: { estadio: string; descripcion: string }[] = [
  { estadio: '1', descripcion: 'Sin dificultades, ni subjetivas ni objetivas.' },
  { estadio: '2', descripcion: 'Quejas subjetivas de olvido (p. ej., de dónde se han puesto las cosas).' },
  { estadio: '3', descripcion: 'Dificultad para el trabajo o en situaciones sociales complejas, perceptible por compañeros o familia.' },
  { estadio: '4', descripcion: 'Dificultad para tareas complejas de la vida diaria: planificar una comida para invitados, manejar las finanzas familiares, hacer las compras.' },
  { estadio: '5', descripcion: 'Necesita ayuda para elegir la ropa adecuada a la ocasión o al clima.' },
  { estadio: '6a', descripcion: 'Necesita ayuda para vestirse correctamente (puede ponerse la ropa al revés, o no conseguir ponérsela sin ayuda).' },
  { estadio: '6b', descripcion: 'Necesita ayuda para bañarse correctamente (p. ej., miedo al baño, dificultad para regular la temperatura del agua).' },
  { estadio: '6c', descripcion: 'Necesita ayuda con la mecánica del uso del retrete (tirar de la cadena, limpiarse, colocar el papel adecuadamente).' },
  { estadio: '6d', descripcion: 'Incontinencia urinaria (ocasional o más frecuente).' },
  { estadio: '6e', descripcion: 'Incontinencia fecal (ocasional o más frecuente).' },
  { estadio: '7a', descripcion: 'Capacidad de hablar limitada a media docena de palabras inteligibles o menos, en el curso de un día o de una entrevista.' },
  { estadio: '7b', descripcion: 'Capacidad de hablar limitada a una única palabra inteligible.' },
  { estadio: '7c', descripcion: 'Pérdida de la capacidad de deambular (de caminar sin ayuda).' },
  { estadio: '7d', descripcion: 'Pérdida de la capacidad de sentarse sin ayuda.' },
  { estadio: '7e', descripcion: 'Pérdida de la capacidad de sonreír.' },
  { estadio: '7f', descripcion: 'Pérdida de la capacidad de mantener la cabeza erguida.' },
]

export interface EscalaClinica {
  id?: string
  ingreso_id?: string
  momento?: 'ingreso' | 'alta'
  barthel_respuestas?: Record<string, string> | null
  barthel_total?: number | null
  lawton_respuestas?: Record<string, string> | null
  lawton_total?: number | null
  npi_respuestas?: Record<string, NPIRespuestaDominio> | null
  npi_gravedad_total?: number | null
  gds_estadio?: number | null
  fast_estadio?: string | null
  version?: number
}

// ─── Cálculo de totales ─────────────────────────────────────────
// Una escala incompleta no calcula total — se necesitan TODOS los
// ítems respondidos, nunca se trata "sin responder" como si fuera
// un cero.

export function totalBarthel(respuestas: Record<string, string> | null | undefined): number | null {
  if (!respuestas) return null
  let total = 0
  for (const item of BARTHEL_ITEMS) {
    const valor = respuestas[item.key]
    if (!valor) return null
    const opcion = item.opciones.find((o) => o.valor === valor)
    if (!opcion) return null
    total += opcion.puntos
  }
  return total
}

export function totalLawton(respuestas: Record<string, string> | null | undefined): number | null {
  if (!respuestas) return null
  let total = 0
  for (const item of LAWTON_ITEMS) {
    const valor = respuestas[item.key]
    if (!valor) return null
    const opcion = item.opciones.find((o) => o.valor === valor)
    if (!opcion) return null
    total += opcion.puntos
  }
  return total
}

// Estructura de cada dominio NPI-Q respondido: { presente: boolean, gravedad?: 'leve'|'moderada'|'grave' }
export interface NPIRespuestaDominio {
  presente: boolean
  gravedad?: string
}

export function totalNPI(respuestas: Record<string, NPIRespuestaDominio> | null | undefined): number | null {
  if (!respuestas) return null
  let total = 0
  for (const dominio of NPI_DOMINIOS) {
    const r = respuestas[dominio.key]
    if (!r) return null // sin responder — ni siquiera se ha marcado "ausente"
    if (!r.presente) continue // ausente cuenta 0, pero SÍ hay que haberlo marcado
    const opcion = NPI_GRAVEDAD_OPCIONES.find((o) => o.valor === r.gravedad)
    if (!opcion) return null // marcado presente pero sin gravedad todavía
    total += opcion.puntos
  }
  return total
}
