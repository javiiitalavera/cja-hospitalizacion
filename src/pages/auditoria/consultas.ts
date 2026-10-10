// Consultas de la pantalla de Auditoría. Los filtros se aplican en la base de datos y se pagina por fecha
// (de más nuevo a más viejo): cada «Cargar más» pide lo anterior a la última fila que ya se ve.

import { supabase } from '../../lib/supabase'
import type { FilaAuditoria } from './etiquetas'
import type { Personal } from './personal'

export const PAGINA = 50

export interface FiltrosCambios {
  tabla: string          // '' = todas; 'contencion' = solo el historial de contención
  accion: string         // '' = todas, o INSERT / UPDATE / DELETE
  usuario: string        // auth.uid() de la persona, o ''
  paciente: { id: string; nombre: string } | null
  desde: string          // AAAA-MM-DD, o ''
  hasta: string
  soloSeguridad: boolean
}

export const FILTROS_CAMBIOS_VACIOS: FiltrosCambios = { tabla: '', accion: '', usuario: '', paciente: null, desde: '', hasta: '', soloSeguridad: false }

export interface FiltrosAccesos {
  tipo: string
  usuario: string
  paciente: { id: string; nombre: string } | null
  desde: string
  hasta: string
}

export const FILTROS_ACCESOS_VACIOS: FiltrosAccesos = { tipo: '', usuario: '', paciente: null, desde: '', hasta: '' }

// «Desde» es el comienzo de ese día y «hasta» el comienzo del siguiente (en la hora del que mira).
const inicioDia = (d: string) => new Date(`${d}T00:00:00`).toISOString()
const inicioDiaSiguiente = (d: string) => { const x = new Date(`${d}T00:00:00`); x.setDate(x.getDate() + 1); return x.toISOString() }

// El tope superior de fecha: el menor entre «hasta» y el cursor de «cargar más».
function techo(hasta: string, antes?: string): string | undefined {
  const h = hasta ? inicioDiaSiguiente(hasta) : undefined
  if (h && antes) return h < antes ? h : antes
  return h ?? antes
}

export interface ResultadoCambios { filas: FilaAuditoria[]; hayMas: boolean; errorAuditoria: string; errorContencion: string }

export async function pedirCambios(f: FiltrosCambios, personal: Personal, antes?: string): Promise<ResultadoCambios> {
  const tope = techo(f.hasta, antes)

  // ── Cambios generales ──
  async function generales(): Promise<{ filas: FilaAuditoria[]; error: string }> {
    if (f.tabla === 'contencion') return { filas: [], error: '' }
    let q = supabase.from('auditoria').select('*').order('fecha', { ascending: false }).limit(PAGINA + 1)
    if (f.tabla) q = q.eq('tabla', f.tabla)
    if (f.accion) q = q.ilike('accion', f.accion)
    if (f.usuario) q = q.eq('usuario_id', f.usuario)
    if (f.paciente) q = q.eq('paciente_id', f.paciente.id)
    if (f.soloSeguridad) q = q.eq('nivel', 'seguridad')
    if (f.desde) q = q.gte('fecha', inicioDia(f.desde))
    if (tope) q = q.lt('fecha', tope)
    const { data, error } = await q
    if (error) return { filas: [], error: 'No se pudieron cargar los cambios: ' + error.message }
    return {
      error: '',
      filas: ((data ?? []) as any[]).map((r): FilaAuditoria => ({
        id: `aud-${r.id}`,
        fecha: r.fecha,
        fechaFin: r.fecha_fin ?? null,
        nGuardados: r.n_cambios ?? 1,
        tabla: r.tabla,
        registroId: r.registro_id,
        accion: r.accion,
        actorTipo: 'auth',
        actorId: r.usuario_id,
        nivel: r.nivel === 'seguridad' ? 'seguridad' : 'normal',
        pacienteId: r.paciente_id ?? null,
        ingresoId: r.ingreso_id ?? null,
        cambios: r.cambios ?? null,
        antes: r.valores_antes ?? null,
        despues: r.valores_despues ?? null,
      })),
    }
  }

  // ── Historial de contención (otra tabla, con su propio esquema de autor) ──
  async function contencion(): Promise<{ filas: FilaAuditoria[]; error: string }> {
    const incluir = (!f.tabla || f.tabla === 'contencion') && !f.accion && !f.soloSeguridad
    if (!incluir) return { filas: [], error: '' }
    let q = supabase
      .from('contenciones_historial')
      .select('ingreso_id, dia, noche, cambiado_en, tipo_accion, actor_id')
      .order('cambiado_en', { ascending: false })
      .limit(PAGINA + 1)
    if (f.usuario) {
      const prof = personal.profDeAuth[f.usuario]
      if (!prof) return { filas: [], error: '' }          // esa cuenta no tiene ficha: no puede haber nada suyo aquí
      q = q.eq('actor_id', prof)
    }
    if (f.paciente) {
      const { data: ings, error: eIng } = await supabase.from('ingresos').select('id').eq('paciente_id', f.paciente.id)
      if (eIng) return { filas: [], error: 'No se pudo cargar el historial de contención: ' + eIng.message }
      const ids = ((ings ?? []) as any[]).map((i) => i.id)
      if (ids.length === 0) return { filas: [], error: '' }
      q = q.in('ingreso_id', ids)
    }
    if (f.desde) q = q.gte('cambiado_en', inicioDia(f.desde))
    if (tope) q = q.lt('cambiado_en', tope)
    const { data, error } = await q
    if (error) return { filas: [], error: 'No se pudo cargar el historial de contención: ' + error.message }
    const crudas = (data ?? []) as any[]

    // Paciente de cada ingreso, de una sola consulta.
    const ingresoIds = [...new Set(crudas.map((r) => r.ingreso_id as string))]
    const pacientePorIngreso: Record<string, string> = {}
    if (ingresoIds.length) {
      const { data: ings } = await supabase.from('ingresos').select('id, paciente_id').in('id', ingresoIds)
      for (const i of (ings ?? []) as any[]) pacientePorIngreso[i.id] = i.paciente_id
    }
    return {
      error: '',
      filas: crudas.map((r, i): FilaAuditoria => ({
        id: `hist-${r.ingreso_id}-${r.cambiado_en}-${i}`,
        fecha: r.cambiado_en,
        fechaFin: null,
        nGuardados: 1,
        tabla: 'contencion',
        registroId: r.ingreso_id,
        accion: r.tipo_accion ?? 'update',
        actorTipo: 'profesional',
        actorId: r.actor_id,
        nivel: 'normal',
        pacienteId: pacientePorIngreso[r.ingreso_id] ?? null,
        ingresoId: r.ingreso_id,
        cambios: null,
        antes: null,
        despues: { dia: r.dia, noche: r.noche },
      })),
    }
  }

  const [g, c] = await Promise.all([generales(), contencion()])
  const todas = [...g.filas, ...c.filas].sort((a, b) => (a.fecha < b.fecha ? 1 : -1))
  return {
    filas: todas.slice(0, PAGINA),
    hayMas: todas.length > PAGINA,
    errorAuditoria: g.error,
    errorContencion: c.error,
  }
}

// ─── Accesos ─────────────────────────────────────────────────

export interface FilaAcceso {
  id: number
  fecha: string
  usuarioId: string | null
  tipo: string
  ingresoId: string | null
  pacienteId: string | null
  detalle: string | null
}

export async function pedirAccesos(f: FiltrosAccesos, antes?: string): Promise<{ filas: FilaAcceso[]; hayMas: boolean; error: string }> {
  const tope = techo(f.hasta, antes)
  let q = supabase.from('registro_accesos').select('*').order('fecha', { ascending: false }).limit(PAGINA + 1)
  if (f.tipo) q = q.eq('tipo', f.tipo)
  if (f.usuario) q = q.eq('usuario_id', f.usuario)
  if (f.paciente) q = q.eq('paciente_id', f.paciente.id)
  if (f.desde) q = q.gte('fecha', inicioDia(f.desde))
  if (tope) q = q.lt('fecha', tope)
  const { data, error } = await q
  if (error) return { filas: [], hayMas: false, error: 'No se pudo cargar el registro de accesos: ' + error.message }
  const filas = ((data ?? []) as any[]).map((r): FilaAcceso => ({
    id: r.id, fecha: r.fecha, usuarioId: r.usuario_id, tipo: r.tipo, ingresoId: r.ingreso_id ?? null, pacienteId: r.paciente_id ?? null, detalle: r.detalle ?? null,
  }))
  return { filas: filas.slice(0, PAGINA), hayMas: filas.length > PAGINA, error: '' }
}
