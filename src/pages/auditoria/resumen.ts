// Cómo se resume una fila de Cambios: a quién afecta y qué se tocó. Lo usan la tabla y la exportación a CSV.

import { CONTENCION_DIA_LABEL, CONTENCION_NOCHE_LABEL, type ContencionDia, type ContencionNoche } from '../../types/contenciones'
import { detalleDeFila, etiquetaCampo, formatearValor, type FilaAuditoria } from './etiquetas'
import type { Personal } from './personal'

export function textoAfecta(f: FilaAuditoria, mapaPacientes: Record<string, string>, personal: Personal): string {
  if (f.tabla === 'profesionales') {
    const n = f.registroId ? personal.porProf[f.registroId] : undefined
    if (n) return n
    const a = f.antes
    return a?.nombre ? `${a.nombre} ${a.apellidos ?? ''}`.trim() + ' (eliminado)' : '—'
  }
  if (f.tabla === 'farmacos_alias') return f.antes?.clave ?? f.cambios?.clave?.despues as string ?? '—'
  if (f.tabla === 'pacientes' && f.accion.toUpperCase() === 'DELETE' && f.antes?.nombre) {
    return `${f.antes.nombre} ${f.antes.primer_apellido ?? ''}`.trim() + ' (eliminado)'
  }
  if (f.pacienteId) return mapaPacientes[f.pacienteId] === undefined ? '…' : (mapaPacientes[f.pacienteId] || 'Paciente eliminado')
  return '—'
}

// Texto de la pauta de contención tal como quedó.
function textoContencion(f: FilaAuditoria): string {
  const v = f.despues ?? {}
  const dia = v.dia && v.dia !== 'ninguna' ? CONTENCION_DIA_LABEL[v.dia as ContencionDia] ?? v.dia : 'Ninguna'
  const noche = ((v.noche as ContencionNoche[]) ?? []).map((n) => CONTENCION_NOCHE_LABEL[n] ?? n)
  return `Día: ${dia} · Noche: ${noche.length > 0 ? noche.join(', ') : 'Ninguna'}`
}

// Resumen corto para la propia fila, para no tener que desplegarla: los primeros campos tocados («Evolución, Alergias +2»).
export function resumenCambio(f: FilaAuditoria): string {
  const d = detalleDeFila(f)
  if (!d) return ''
  if (d.tipo === 'contencion') return textoContencion(f)
  if (d.tipo === 'contenido') return ''          // creación o borrado: ya lo dicen el tipo y la acción
  if (d.lineas.length === 0) return 'Sin cambios netos'
  const nombres = d.lineas.map((l) => etiquetaCampo(l.campo))
  return nombres.length <= 3 ? nombres.join(', ') : `${nombres.slice(0, 3).join(', ')} +${nombres.length - 3}`
}

const recorta = (s: string, n = 300) => (s.length > n ? s.slice(0, n) + '…' : s)

// Detalle completo en una sola celda, para el CSV.
export function detalleParaCsv(f: FilaAuditoria): string {
  const d = detalleDeFila(f)
  if (!d) return ''
  if (d.tipo === 'contencion') return textoContencion(f)
  if (d.tipo === 'contenido') return `${d.titulo}: ` + d.lineas.map((l) => `${etiquetaCampo(l.campo)} = ${recorta(formatearValor(l.valor))}`).join(' | ')
  return d.lineas.map((l) => `${etiquetaCampo(l.campo)}: ${recorta(formatearValor(l.antes))} → ${recorta(formatearValor(l.despues))}`).join(' | ')
}
