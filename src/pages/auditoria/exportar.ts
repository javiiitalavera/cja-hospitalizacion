// Exportar a CSV lo que se ve en Auditoría, con los mismos filtros. Se piden todas las páginas (hasta un tope) y la
// exportación queda apuntada en Accesos, como el resto de salidas de datos de pacientes.

import { registrarAcceso } from '../../lib/accesos'

export const MAX_FILAS_EXPORTAR = 5000

const celda = (v: string) => `"${String(v).replace(/"/g, '""')}"`

export function descargarCSV(nombreArchivo: string, lineaFiltros: string, cabecera: string[], filas: string[][]) {
  const contenido = '﻿' + [celda(`Filtros: ${lineaFiltros}`), cabecera.map(celda).join(','), ...filas.map((f) => f.map(celda).join(','))].join('\r\n')
  const blob = new Blob([contenido], { type: 'text/csv;charset=utf-8;' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `${nombreArchivo}_${new Date().toISOString().slice(0, 10)}.csv`
  a.click()
  URL.revokeObjectURL(url)
  registrarAcceso('exportacion_csv', { detalle: `Auditoría: ${nombreArchivo}` })
}

// Pide página tras página (de más nuevo a más viejo) hasta que no haya más o se llegue al tope.
export async function reunirTodas<T extends { fecha: string }>(
  pedir: (antes?: string) => Promise<{ filas: T[]; hayMas: boolean; error: string }>,
): Promise<{ filas: T[]; truncado: boolean; error: string }> {
  const todas: T[] = []
  let antes: string | undefined
  for (;;) {
    const r = await pedir(antes)
    if (r.error) return { filas: todas, truncado: false, error: r.error }
    todas.push(...r.filas)
    if (!r.hayMas || r.filas.length === 0) return { filas: todas, truncado: false, error: '' }
    if (todas.length >= MAX_FILAS_EXPORTAR) return { filas: todas.slice(0, MAX_FILAS_EXPORTAR), truncado: true, error: '' }
    antes = r.filas[r.filas.length - 1].fecha
  }
}

// Resumen de los filtros aplicados, para la primera línea del archivo.
export function resumenFiltrosAuditoria(
  f: { usuario: string; paciente: { nombre: string } | null; desde: string; hasta: string },
  nombrePersona: (userId: string) => string | undefined,
  extra: string[] = [],
): string {
  const partes = [...extra]
  if (f.desde || f.hasta) partes.push(`Del ${f.desde || '...'} al ${f.hasta || 'hoy'}`)
  if (f.usuario) partes.push(`Persona: ${nombrePersona(f.usuario) ?? 'desconocida'}`)
  if (f.paciente) partes.push(`Paciente: ${f.paciente.nombre}`)
  return partes.length > 0 ? partes.join(' · ') : 'Sin filtros'
}
