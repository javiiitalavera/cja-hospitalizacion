// Tipos compartidos por todo el Dashboard — un solo sitio que los
// define, para que cada vista (Resumen, Actividad, Seguridad,
// Explorador) hable el mismo idioma sin repetir las formas.

export type Periodo = 'mes' | 'trimestre' | 'anio' | 'todo' | 'personalizado'

export interface Filtros {
  periodo: Periodo
  desde: string
  hasta: string
  medicoId: string | null
  // "estado" ya no vive aquí: representa la situación final/actual
  // del episodio, y aplicado a datos históricos daba resultados
  // engañosos (p. ej. "Activo" seguía mostrando altas del periodo).
  // Se queda únicamente en el Explorador de episodios, donde sí
  // tiene sentido — filtrar la lista de episodios por su estado real.
  comparar: boolean
}

export interface SituacionActual {
  pacientes_ingresados: number
  ocupacion_actual_pct: number
  estancia_larga_60: number
  semaforo_riesgo: number
  contencion_activa: number
  contencion_pendiente_confirmacion: number
  incidencias_pendientes: number
}

export interface ResumenPeriodo {
  ingresos_nuevos: number
  altas: number
  traslados: number
  exitus: number
  salidas_totales: number
  dias_estancia: number
  ocupacion_media_pct: number
  ocupacion_min_pct: number
  ocupacion_max_pct: number
  estancia_media_dias: number
  estancia_mediana_dias: number
  reingresos_30d: number
  incidencias_total: number
  incidencias_tasa_1000: number | null
}

export interface SerieDashboard {
  agrupacion: 'day' | 'week' | 'month'
  ocupacion_diaria: { fecha: string; camas: number }[]
  movimientos: { inicio: string; fin: string; ingresos: number; salidas: number }[]
}

// Los tres estados que puede tener cualquier apartado, más allá de
// "cargando" — sin esto, un fallo de red se acaba pareciendo a un
// "cero" real, que es justo el problema que no queremos repetir.
export type EstadoCarga = 'cargando' | 'listo' | 'sin_datos' | 'error'
