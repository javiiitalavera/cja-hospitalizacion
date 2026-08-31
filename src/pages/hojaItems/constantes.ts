import type { ItemsPaciente } from '../../types'
import { SEMAFORO_CAIDAS_COLOR as SEMAFORO_COLOR } from '../../types'
import type { IngresoConItems } from './tipos'

export function habBg(ingreso: IngresoConItems | null): string {
  if (!ingreso) return '#FFFFFF'
  const sem = ingreso.items?.semaforo_caidas as string | undefined
  if (sem && SEMAFORO_COLOR[sem]) return SEMAFORO_COLOR[sem]
  return '#FFFFFF'
}
export function textColor(bg: string) {
  return bg === '#FF0000' ? '#FFFFFF' : '#000000'
}

export const SUJECION_SHORT: Record<string, string> = {
  normal: '—',
  una_barra: '1B',
  dos_barras: '2B',
  sujecion_fisica: 'SF',
  sensor_presion: 'SP',
  cota_cero: 'C0',
}

// Etiquetas cortas de la contención día/noche actual, pensadas para
// caber en una columna estrecha de la Hoja de Ítems (a diferencia de
// SUJECION_SHORT arriba, que es del sistema antiguo y solo se usa ya
// para mostrar fotos históricas de antes de este cambio).
export const DIA_SHORT: Record<string, string> = {
  ninguna: '—',
  continua_seguridad: 'X',
  si_precisa_asistencial: 'A',
  si_precisa_paciente: 'S/P',
}
export const NOCHE_SHORT: Record<string, string> = {
  '1_barra': '1B',
  '2_barras': '2B',
  cota_cero: 'C0',
  sensor_presion: 'SP',
  contencion_fija: 'CF',
  contencion_si_precisa: 'CSP',
}
export function diaStr(v: string | null | undefined): string {
  if (!v || v === 'ninguna') return ''
  return DIA_SHORT[v] ?? v
}
export function nocheStr(arr: string[] | null | undefined): string {
  if (!arr || arr.length === 0) return ''
  // El sensor de presión no se repite aquí como texto — ya tiene su
  // propia fila justo debajo, con una simple marca X.
  const sinSensor = arr.filter((x) => x !== 'sensor_presion')
  return sinSensor.map((x) => NOCHE_SHORT[x] ?? x).join('+')
}

// Agrupado en bloques con sentido clínico, en vez de una lista plana
// sin criterio. Cada grupo imprime su propia fila de cabecera antes
// de sus ítems (ver buildBloque / Bloque más abajo).
export const GRUPOS: { titulo: string; mostrarTitulo?: boolean; filas: { key: string; label: string; get: (it: any, i: IngresoConItems) => string }[] }[] = [
  {
    titulo: 'Identidad',
    mostrarTitulo: false, // se sobreentiende, no hace falta el rótulo
    filas: [
      { key: 'nombre', label: 'NOMBRE', get: (_: any, i: IngresoConItems) => `${i.paciente?.primer_apellido ?? ''} ${i.paciente?.nombre ?? ''}`.trim() },
      { key: 'medico', label: 'MÉDICO', get: (_: any, i: IngresoConItems) => i.medico_responsable?.nombre?.toUpperCase() ?? '' },
    ],
  },
  {
    titulo: 'Seguridad y conducta',
    filas: [
      { key: 'cont_dia', label: 'Contención día', get: (_: any, i: IngresoConItems) => diaStr(i.contencion?.dia) },
      { key: 'cont_noche', label: 'Contención noche', get: (_: any, i: IngresoConItems) => nocheStr(i.contencion?.noche) },
      { key: 'sensor', label: 'Sensor', get: (_: any, i: IngresoConItems) => (i.contencion?.noche?.includes('sensor_presion') ? 'X' : '') },
      {
        key: 'alerta',
        label: 'Alerta conducta',
        get: (it: ItemsPaciente) => {
          const arr = (it?.alerta_conducta as string[]) ?? []
          const short: Record<string, string> = { riesgo_autolitico: 'Autol.', agresion_imprevisible: 'Agres.', riesgo_fuga: 'Fuga' }
          return arr.map((x) => short[x] ?? x).join('+')
        },
      },
      { key: 'objetos_calma', label: 'Objetos de calma', get: (it: ItemsPaciente) => (it as any)?.objetos_calma ?? '' },
    ],
  },
  {
    titulo: 'Movilidad',
    filas: [
      {
        key: 'deambulacion',
        label: 'Deambulación',
        get: (it: ItemsPaciente) => {
          const v = (it as any)?.deambulacion
          return v === 'autonomo' ? 'Autón.' : v === '1_persona' ? '1P' : v === '2_personas' ? '2P' : ''
        },
      },
      {
        key: 'ayudas',
        label: 'Ayudas deambulación',
        get: (it: ItemsPaciente) =>
          it?.ayudas_deambulacion
            ?.replace('andador_2r', 'And.2r')
            .replace('andador_4r', 'And.4r')
            .replace('silla_ruedas', 'SR')
            .replace('baston', 'Bast.') ?? '',
      },
      { key: 'bipedestador', label: 'Bipedestador', get: (it: ItemsPaciente) => (it?.bipedestador ? 'X' : '') },
      { key: 'grua', label: 'Grúa', get: (it: ItemsPaciente) => (it?.grua ? 'X' : '') },
      { key: 'cabecero', label: 'Cabecero elevado', get: (it: ItemsPaciente) => (it as any)?.cabecero_grados ?? '' },
    ],
  },
  {
    titulo: 'Alimentación',
    filas: [
      { key: 'ingestas', label: 'Ingestas', get: (it: ItemsPaciente) => (it?.ingestas === 'autonomo' ? 'A' : it?.ingestas === 'dependiente' ? 'D' : '') },
    ],
  },
  {
    titulo: 'Higiene y continencia',
    filas: [
      { key: 'dep', label: 'Dependencia', get: (it: ItemsPaciente) => it?.dependencia_avd != null ? `${it.dependencia_avd}P` : '' },
      { key: 'panial_dia', label: 'Pañal día', get: (it: ItemsPaciente) => it?.panial_dia ?? '' },
      { key: 'panial_noche', label: 'Pañal noche', get: (it: ItemsPaciente) => it?.panial_noche ?? '' },
      { key: 'colector', label: 'Colector', get: (it: ItemsPaciente) => (it?.colector ? 'X' : '') },
      { key: 'sonda', label: 'Sonda vesical', get: (it: ItemsPaciente) => (it?.sonda_vesical ? 'X' : '') },
      { key: 'higiene', label: 'Higiene', get: (it: ItemsPaciente) => (it?.higiene === 'lavabo' ? 'L' : it?.higiene === 'cama' ? 'C' : '') },
      { key: 'ducha', label: 'Ducha', get: (it: ItemsPaciente) => (it?.ducha === 'pie' ? 'P' : it?.ducha === 'sentado' ? 'S' : '') },
      { key: 'vestido', label: 'Vestido', get: (it: ItemsPaciente) => ((it as any)?.vestido === 'autonomo' ? 'A' : (it as any)?.vestido === 'dependiente' ? 'D' : '') },
      { key: 'banio', label: 'Baño acompañado', get: (it: ItemsPaciente) => (it?.banio ? 'X' : '') },
    ],
  },
  {
    titulo: 'Piel y postura',
    filas: [
      { key: 'antiescaras', label: 'C. antiescaras', get: (it: ItemsPaciente) => (it?.colchon_antiescaras ? 'X' : '') },
      { key: 'patucos', label: 'Patucos coderas', get: (it: ItemsPaciente) => (it?.patucos_coderas ? 'X' : '') },
      { key: 'cambios', label: 'Cambios posturales', get: (it: ItemsPaciente) => (it?.cambios_posturales ? 'X' : '') },
    ],
  },
  {
    titulo: 'Prótesis y sensorial',
    filas: [
      { key: 'dentadura', label: 'Dentadura', get: (it: ItemsPaciente) => it?.dentadura ?? '' },
      { key: 'audifonos', label: 'Audífonos', get: (it: ItemsPaciente) => it?.audifonos ?? '' },
      { key: 'gafas', label: 'Gafas', get: (it: ItemsPaciente) => (it?.gafas === 'si' ? 'Sí' : it?.gafas === 'solo_tv' ? 'TV' : '') },
    ],
  },
  {
    titulo: 'Otros',
    filas: [
      { key: 'oxigeno', label: 'Oxigenoterapia', get: (it: ItemsPaciente) => (it?.oxigenoterapia ? 'X' : '') },
      { key: 'botella', label: 'Botella noche', get: (it: ItemsPaciente) => (it?.botella_noche ? 'X' : '') },
      { key: 'timbre', label: 'Timbre habitación', get: (it: ItemsPaciente) => ((it as any)?.timbre_habitacion ? 'X' : '') },
      { key: 'siestas', label: 'Siesta tarde', get: (it: ItemsPaciente) => (it?.siestas ? 'X' : '') },
    ],
  },
  {
    titulo: 'Observaciones',
    mostrarTitulo: false, // innecesario, la propia fila ya lo dice
    filas: [
      { key: 'observaciones', label: 'Observaciones', get: (it: ItemsPaciente) => (it as any)?.observaciones ?? '' },
    ],
  },
]

// Lista plana derivada, para lo que solo necesita recorrer todas las
// filas sin que le importen los grupos.

export const BOLD_ROWS = new Set(['nombre', 'medico'])
export const LABEL_BOLD_ROWS = new Set(['nombre', 'medico', 'dep'])
