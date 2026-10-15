import type { TipoEvento } from '../../types/eventos'

// Orden en que se ofrecen los tipos de incidencia en filtros y chips.
export const TIPOS_ORDEN: TipoEvento[] = [
  'caida', 'agresividad_fisica',
  'fuga', 'error_medicacion', 'efecto_adverso_medicacion', 'atragantamiento',
]

export const MAYUS = (t: string) => t.charAt(0).toUpperCase() + t.slice(1)

// Dirección de una incidencia concreta: la ficha del ingreso, con esa incidencia abierta para verla o completarla.
export const rutaIncidencia = (ingresoId: string, eventoId: string) => `/ingresos/${ingresoId}?tab=eventos&evento=${eventoId}`

// Ventana de «Actuales»: los últimos 30 días.
export const DIAS_VENTANA_ACTUALES = 30
