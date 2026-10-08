// Tipos, etiquetas y utilidades del módulo de Curas. Un único sitio, para
// que la pestaña de la ficha y la tabla semanal de la unidad lo muestren
// igual.

export type Caracteristica =
  | 'upp'
  | 'herida_quirurgica'
  | 'ulcera_vascular'
  | 'lesion_humedad'
  | 'desgarro_cutaneo'
  | 'herida_traumatica'
  | 'cuidado_piel'
  | 'otra'

export const CARACTERISTICA_LABEL: Record<Caracteristica, string> = {
  upp: 'Úlcera por presión',
  herida_quirurgica: 'Herida quirúrgica',
  ulcera_vascular: 'Úlcera vascular',
  lesion_humedad: 'Lesión por humedad',
  desgarro_cutaneo: 'Desgarro cutáneo',
  herida_traumatica: 'Herida traumática',
  cuidado_piel: 'Cuidado de la piel',
  otra: 'Otra',
}

export const GRADO_LABEL: Record<string, string> = {
  I: 'Grado I',
  II: 'Grado II',
  III: 'Grado III',
  IV: 'Grado IV',
  no_clasificable: 'No clasificable',
}

// Sugerencias (no limitan: el campo es libre). Salen de las hojas actuales.
export const LOCALIZACIONES_SUGERIDAS = [
  'Sacro', 'Glúteo', 'Trocánter derecho', 'Trocánter izquierdo',
  'Talón derecho', 'Talón izquierdo', 'Maléolo derecho', 'Maléolo izquierdo',
  'Tibia derecha', 'Tibia izquierda', 'Codo derecho', 'Codo izquierdo',
  'Oreja derecha', 'Oreja izquierda', 'Ceja', 'Pómulo', 'Ingles y escroto',
  'Zona vaginal', 'Piernas', 'Espalda', 'Pie derecho', 'Pie izquierdo',
]

export const CURAS_SUGERIDAS = [
  'Hidrogel', 'Anticongestiva', 'Linovera', 'Mepitel', 'Mepilex', 'Urgoclean Ag',
  'Urgo Start', 'Biatain', 'AGHO', 'Betadine', 'Mupirocina', 'Clotrimazol polvo',
  'Crema hidratante', 'Parche', 'Protección', 'Al aire',
]

// Días de la semana: 1 = lunes … 7 = domingo (igual que en la base de datos).
export const DIAS_CORTO = ['L', 'M', 'X', 'J', 'V', 'S', 'D']
export const DIAS_LARGO = ['Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado', 'Domingo']

export interface Valoracion {
  id: string
  lesion_id: string
  fecha: string
  medidas: string | null
  grado: string | null
  frotis: boolean
  tipo_cura: string | null
  frecuencia_horas: number | null
  dias_semana: number[]
  norton: number | null
  braden: number | null
  emina: number | null
  notas: string | null
  registrado_por_id: string | null
  created_at: string
}

export interface Lesion {
  id: string
  ingreso_id: string
  caracteristicas: Caracteristica
  localizacion: string
  fecha_inicio: string
  fecha_fin: string | null
  origen: 'centro' | 'fuera' | null
  notas: string | null
  registrado_por_id: string | null
  created_at: string
  valoraciones?: Valoracion[]
  registrado_por?: { nombre: string; apellidos: string } | null
}

export interface RegistroCura {
  id: string
  ingreso_id: string
  fecha: string
  realizada_por_id: string | null
  realizada_por?: { nombre: string; apellidos: string } | null
}

// ── Utilidades ───────────────────────────────────────────────

// Valoraciones de la más reciente a la más antigua (por fecha y, a
// igualdad, por orden de registro).
export function ordenarValoraciones(vals: Valoracion[] = []): Valoracion[] {
  return [...vals].sort((a, b) =>
    a.fecha !== b.fecha ? (a.fecha < b.fecha ? 1 : -1) : (a.created_at < b.created_at ? 1 : -1)
  )
}

// La pauta vigente de una lesión es la de su última valoración que
// indica algún tipo de cura (una valoración solo de medidas no borra la
// pauta anterior).
export function pautaVigente(vals: Valoracion[] = []): Valoracion | null {
  return ordenarValoraciones(vals).find((v) => v.tipo_cura && v.tipo_cura.trim() !== '') ?? null
}

export function textoPauta(v: Valoracion | null): string {
  if (!v) return 'Sin pauta de cura'
  const partes = [v.tipo_cura ?? '']
  if (v.frecuencia_horas) partes.push(`cada ${v.frecuencia_horas} h`)
  if (v.dias_semana?.length) partes.push([...v.dias_semana].sort().map((d) => DIAS_CORTO[d - 1]).join(' '))
  return partes.filter(Boolean).join(' · ')
}

// ── Fechas (AAAA-MM-DD, siempre con componentes locales: nunca por UTC) ──

function aFecha(s: string): Date {
  const [y, m, d] = s.split('-').map(Number)
  return new Date(y, m - 1, d)
}
function deFecha(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}
export function sumarDias(fecha: string, n: number): string {
  const d = aFecha(fecha)
  d.setDate(d.getDate() + n)
  return deFecha(d)
}
// 1 = lunes … 7 = domingo
export function diaSemanaISO(fecha: string): number {
  const d = aFecha(fecha).getDay()
  return d === 0 ? 7 : d
}
export function lunesDe(fecha: string): string {
  return sumarDias(fecha, -(diaSemanaISO(fecha) - 1))
}
export function fechaCorta(fecha: string): string {
  const [, m, d] = fecha.split('-')
  return `${d}/${m}`
}
export function fechaLarga(fecha: string): string {
  const [y, m, d] = fecha.split('-')
  return `${d}/${m}/${y}`
}
