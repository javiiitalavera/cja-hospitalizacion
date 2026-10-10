// Textos y formatos de la pantalla de Auditoría: nombres legibles de tablas, acciones y campos, y cómo se
// convierte cada fila en lo que se enseña al desplegarla (qué campos cambiaron, de qué a qué).

export const TABLA_LABEL: Record<string, string> = {
  pacientes: 'Paciente',
  ingresos: 'Ingreso',
  informe_ingreso: 'Informe de ingreso',
  informe_alta: 'Informe de alta',
  informe_enfermeria: 'Informe de enfermería',
  informes_puntuales: 'Otro informe',
  cmbd: 'CMBD',
  items_paciente: 'Hoja de ítems',
  profesionales: 'Personal',
  eventos: 'Incidencia',
  contencion: 'Contención',
  escalas_clinicas: 'Escalas clínicas',
  curas_lesiones: 'Cura (lesión)',
  curas_valoraciones: 'Cura (valoración)',
  curas_registro: 'Cura (marca diaria)',
  pauta_cuidados: 'Pauta de cuidados',
  pauta_via: 'Pauta de cuidados (vía)',
  farmacos_alias: 'Marca de fármaco',
}

// Las claves van en mayúsculas a propósito: se busca siempre con la acción pasada a mayúsculas, así da igual
// que un disparador escriba «insert» y otro «INSERT».
export const ACCION_LABEL: Record<string, string> = {
  INSERT: 'Creación',
  UPDATE: 'Edición',
  DELETE: 'Borrado',
  PASSWORD_RESET: 'Restablecer contraseña',
  CAMBIO_EMAIL: 'Cambio de correo',
  PAUTA_CREADA: 'Pauta creada',
  PAUTA_MODIFICADA: 'Pauta modificada',
  CONFIRMADA: 'Confirmada',
  CONFIRMACION_RETIRADA: 'Confirmación retirada',
  REAPERTURA: 'Episodio reabierto',
}

const ACCION_COLOR: Record<string, string> = {
  INSERT: 'bg-emerald-50 text-emerald-700',
  UPDATE: 'bg-amber-50 text-amber-700',
  DELETE: 'bg-red-50 text-red-700',
  PASSWORD_RESET: 'bg-blue-50 text-blue-700',
  CAMBIO_EMAIL: 'bg-blue-50 text-blue-700',
  PAUTA_CREADA: 'bg-emerald-50 text-emerald-700',
  PAUTA_MODIFICADA: 'bg-amber-50 text-amber-700',
  CONFIRMADA: 'bg-emerald-50 text-emerald-700',
  CONFIRMACION_RETIRADA: 'bg-red-50 text-red-700',
  REAPERTURA: 'bg-amber-50 text-amber-700',
}

export const accionLabel = (a: string) => ACCION_LABEL[a.toUpperCase()] ?? a
export const accionColor = (a: string) => ACCION_COLOR[a.toUpperCase()] ?? 'bg-slate-100 text-slate-600'

// Filtro «Acción» de la pantalla (las tres básicas; el resto sale en «Todas»).
export const ACCIONES_FILTRO: { valor: string; etiqueta: string }[] = [
  { valor: 'INSERT', etiqueta: 'Creación' },
  { valor: 'UPDATE', etiqueta: 'Edición' },
  { valor: 'DELETE', etiqueta: 'Borrado' },
]

// ─── Registro de accesos ─────────────────────────────────────

export const ACCESO_LABEL: Record<string, { etiqueta: string; color: string }> = {
  inicio_sesion: { etiqueta: 'Entró en la aplicación', color: 'bg-blue-50 text-blue-700' },
  expediente: { etiqueta: 'Abrió un expediente', color: 'bg-emerald-50 text-emerald-700' },
  ficha_paciente: { etiqueta: 'Abrió una ficha de paciente', color: 'bg-emerald-50 text-emerald-700' },
  impresion: { etiqueta: 'Imprimió', color: 'bg-amber-50 text-amber-700' },
  exportacion_word: { etiqueta: 'Exportó a Word', color: 'bg-amber-50 text-amber-700' },
}

// ─── Qué cambió ──────────────────────────────────────────────

// Una fila de auditoría ya unificada (de la tabla `auditoria` o del historial de contención).
export interface FilaAuditoria {
  id: string
  fecha: string
  fechaFin: string | null          // último guardado, si se juntaron varios
  nGuardados: number
  tabla: string
  registroId: string | null
  accion: string
  actorTipo: 'auth' | 'profesional'   // 'auth': auth.uid() · 'profesional': profesionales.id (así guarda la contención)
  actorId: string | null
  nivel: 'normal' | 'seguridad'
  pacienteId: string | null
  ingresoId: string | null
  cambios: Record<string, { antes: unknown; despues: unknown }> | null
  antes: Record<string, any> | null
  despues: Record<string, any> | null
}

const CAMPO_LABEL: Record<string, string> = {
  rol: 'Rol', es_admin: 'Administrador', activo: 'Activo', nombre: 'Nombre', apellidos: 'Apellidos', user_id: 'Cuenta de acceso',
  colegiado: 'Nº de colegiado', especialidad: 'Especialidad', estado: 'Estado', habitacion: 'Habitación',
  fecha_ingreso: 'Fecha de ingreso', fecha_alta: 'Fecha de alta', motivo_ingreso: 'Motivo de ingreso',
  medico_responsable_id: 'Médico responsable', semaforo_caidas: 'Semáforo de caídas', alergias: 'Alergias',
  evolucion: 'Evolución', impresion_diagnostica: 'Impresión diagnóstica', observaciones: 'Observaciones',
  tratamiento_ingreso_estructurado: 'Tratamiento al ingreso', medicacion_estructurada: 'Medicación al alta',
  nhc: 'NHC', primer_apellido: 'Primer apellido', segundo_apellido: 'Segundo apellido', fecha_nacimiento: 'Fecha de nacimiento',
  circunstancia_alta: 'Circunstancia del alta', diagnostico_principal: 'Diagnóstico principal', completado: 'Completado',
  texto: 'Texto', turnos: 'Turnos', via: 'Vía', atc: 'ATC', clave: 'Nombre', sonda_vesical: 'Sonda vesical', colector: 'Colector',
  alerta_conducta: 'Alertas de conducta', objetos_calma: 'Objetos que le calman', tipo: 'Tipo', notas: 'Notas', hora: 'Hora',
  turno: 'Turno', fecha: 'Fecha', dia: 'Día', noche: 'Noche', dni: 'DNI', sexo: 'Sexo', municipio: 'Municipio',
}

export function etiquetaCampo(campo: string): string {
  const sinPrefijo = campo.startsWith('campos.') ? campo.slice(7) : campo
  if (CAMPO_LABEL[sinPrefijo]) return CAMPO_LABEL[sinPrefijo]
  const t = sinPrefijo.replace(/_/g, ' ').trim()
  return t.charAt(0).toUpperCase() + t.slice(1)
}

export function formatearValor(v: unknown): string {
  if (v === null || v === undefined) return '—'
  if (typeof v === 'boolean') return v ? 'Sí' : 'No'
  if (typeof v === 'string') return v === '' ? '(vacío)' : v
  if (typeof v === 'number') return String(v)
  if (Array.isArray(v)) {
    if (v.length === 0) return '(vacío)'
    // Listas de medicación: «Donepezilo 10 mg; Quetiapina 25 mg».
    if (v.every((x) => x && typeof x === 'object' && 'farmaco' in x)) {
      return v.map((x: any) => [x.farmaco, x.dosis].filter(Boolean).join(' ')).join('; ')
    }
    if (v.every((x) => typeof x === 'string')) return v.join(', ')
  }
  return JSON.stringify(v)
}

// Campos que no interesa enseñar al listar el contenido de algo creado o borrado.
const OCULTOS = new Set([
  'id', 'created_at', 'updated_at', 'version', 'ingreso_id', 'paciente_id', 'registrado_por_id', 'actualizado_por_id',
  'actualizado_en', 'lesion_id', 'elaborado_por_id', 'realizada_por_id', 'evento_origen_id',
  'nombre_normalizado', 'primer_apellido_normalizado', 'segundo_apellido_normalizado',
])

export interface LineaCambio { campo: string; antes: unknown; despues: unknown }
export interface LineaContenido { campo: string; valor: unknown }

export type DetalleFila =
  | { tipo: 'cambios'; lineas: LineaCambio[] }
  | { tipo: 'contenido'; titulo: string; lineas: LineaContenido[] }
  | { tipo: 'contencion' }
  | null

function contenido(obj: Record<string, any>): LineaContenido[] {
  return Object.entries(obj)
    .filter(([k, v]) => !OCULTOS.has(k) && v !== null && v !== undefined && v !== '' && !(Array.isArray(v) && v.length === 0))
    .map(([k, v]) => ({ campo: k, valor: v }))
}

// Lo que se enseña al desplegar una fila.
export function detalleDeFila(f: FilaAuditoria): DetalleFila {
  if (f.tabla === 'contencion') return f.despues ? { tipo: 'contencion' } : null
  if (f.cambios) {
    return { tipo: 'cambios', lineas: Object.entries(f.cambios).map(([campo, c]) => ({ campo, antes: c.antes, despues: c.despues })) }
  }
  // Filas antiguas con el antes y el después completos (incidencias, reapertura): se enseña solo lo que cambió.
  if (f.antes && f.despues) {
    const claves = new Set([...Object.keys(f.antes), ...Object.keys(f.despues)])
    const lineas: LineaCambio[] = []
    for (const k of claves) {
      if (OCULTOS.has(k)) continue
      if (JSON.stringify(f.antes[k] ?? null) !== JSON.stringify(f.despues[k] ?? null)) lineas.push({ campo: k, antes: f.antes[k], despues: f.despues[k] })
    }
    return { tipo: 'cambios', lineas }
  }
  if (f.antes) return { tipo: 'contenido', titulo: 'Contenido que se borró', lineas: contenido(f.antes) }
  if (f.despues) return { tipo: 'contenido', titulo: 'Contenido registrado', lineas: contenido(f.despues) }
  return null
}
