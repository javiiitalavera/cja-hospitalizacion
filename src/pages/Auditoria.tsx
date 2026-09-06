import { Fragment, useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../lib/AuthContext'
import { History } from 'lucide-react'
import { TIPO_EVENTO_LABEL } from '../types/eventos'
import { CONTENCION_DIA_LABEL, CONTENCION_NOCHE_LABEL, type ContencionDia, type ContencionNoche } from '../types/contenciones'

// Etiquetas legibles
const TABLA_LABEL: Record<string, string> = {
  pacientes: 'Paciente',
  ingresos: 'Ingreso',
  informe_ingreso: 'Informe de ingreso',
  informe_alta: 'Informe de alta',
  cmbd: 'CMBD',
  profesionales: 'Personal',
  eventos: 'Incidencia',
  contencion: 'Contención',
}

// Las claves van en mayúsculas a propósito — la búsqueda siempre
// normaliza a mayúsculas antes de mirar aquí, así da igual que un
// disparador concreto haya escrito "insert" o "INSERT".
const ACCION_LABEL: Record<string, string> = {
  INSERT: 'Creación',
  UPDATE: 'Edición',
  DELETE: 'Borrado',
  PASSWORD_RESET: 'Restablecer contraseña',
  CAMBIO_EMAIL: 'Cambio de correo',
  PAUTA_CREADA: 'Pauta creada',
  PAUTA_MODIFICADA: 'Pauta modificada',
  CONFIRMADA: 'Confirmada',
  CONFIRMACION_RETIRADA: 'Confirmación retirada',
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
}

function accionLabel(accion: string): string {
  return ACCION_LABEL[accion.toUpperCase()] ?? accion
}
function accionColor(accion: string): string {
  return ACCION_COLOR[accion.toUpperCase()] ?? 'bg-slate-100 text-slate-600'
}

// Para contención, ya existen los diccionarios de etiquetas humanas
// en el resto de la aplicación — se reutilizan aquí en vez de volcar
// el JSON en crudo con códigos como "continua_seguridad". El resto
// de tablas, con formas muy distintas entre sí, se queda con el
// JSON tal cual: traducir campo a campo cada una sería una solución
// genérica mucho más grande para un beneficio menor.
function formatearValor(tabla: string, valor: Record<string, any>): string {
  if (tabla === 'contencion') {
    const dia = valor.dia && valor.dia !== 'ninguna' ? CONTENCION_DIA_LABEL[valor.dia as ContencionDia] ?? valor.dia : 'Ninguna'
    const noche = ((valor.noche as ContencionNoche[]) ?? []).map((n) => CONTENCION_NOCHE_LABEL[n] ?? n)
    return `Día: ${dia}\nNoche: ${noche.length > 0 ? noche.join(', ') : 'Ninguna'}`
  }
  return JSON.stringify(valor, null, 2)
}

// Fila unificada: mezcla registros de "auditoria" (identificados por
// auth.uid()) y de "contenciones_historial" (identificados por
// profesionales.id, un esquema distinto pero igual de válido dentro
// del propio sistema de contención) — cada una se resuelve con su
// mapa correspondiente, nunca se mezclan entre sí.
interface Fila {
  id: string
  fecha: string
  tabla: string
  registro_id: string | null
  accion: string
  actorTipo: 'auth' | 'profesional'
  actorId: string | null
  valores_antes: Record<string, any> | null
  valores_despues: Record<string, any> | null
}

export function Auditoria() {
  const { esAdmin } = useAuth()
  const [filas, setFilas] = useState<Fila[]>([])
  const [nombresPorAuthId, setNombresPorAuthId] = useState<Record<string, string>>({})
  const [nombresPorProfId, setNombresPorProfId] = useState<Record<string, string>>({})
  const [afecta, setAfecta] = useState<Record<string, string>>({}) // clave: `${tabla}:${registro_id}`
  const [cargando, setCargando] = useState(true)
  const [filtroTabla, setFiltroTabla] = useState('')
  const [expandido, setExpandido] = useState<string | null>(null)

  // Tres cosas pueden fallar por separado, y cada una debe decir lo
  // suyo — antes un fallo cualquiera se veía igual que "no hay
  // cambios registrados", que es justo lo contrario de lo que pasa.
  const [errorCambios, setErrorCambios] = useState('')
  const [errorContencion, setErrorContencion] = useState('')
  const [errorNombres, setErrorNombres] = useState('')

  async function cargar() {
    setCargando(true)
    setErrorCambios('')
    setErrorContencion('')
    setErrorNombres('')

    // Últimos 300 cambios de las tablas generales + últimos 300 de
    // contención, cargados en paralelo, cada uno con su propio error.
    const [resAud, resHist] = await Promise.all([
      supabase.from('auditoria').select('*').order('fecha', { ascending: false }).limit(300),
      supabase
        .from('contenciones_historial')
        .select('ingreso_id, dia, noche, cambiado_en, tipo_accion, actor_id')
        .order('cambiado_en', { ascending: false })
        .limit(300),
    ])

    const filasAud: Fila[] = resAud.error
      ? []
      : ((resAud.data ?? []) as any[]).map((r) => ({
          id: `aud-${r.id}`,
          fecha: r.fecha,
          tabla: r.tabla,
          registro_id: r.registro_id,
          accion: r.accion,
          actorTipo: 'auth' as const,
          actorId: r.usuario_id,
          valores_antes: r.valores_antes,
          valores_despues: r.valores_despues,
        }))
    if (resAud.error) setErrorCambios('No se pudieron cargar los cambios: ' + resAud.error.message)

    // contenciones_historial se queda como única fuente de estos
    // cambios — aquí solo se lee para mostrarla junto a lo demás, no
    // se copia ni se duplica en "auditoria".
    const filasHist: Fila[] = resHist.error
      ? []
      : ((resHist.data ?? []) as any[]).map((r, i) => ({
          id: `hist-${r.ingreso_id}-${r.cambiado_en}-${i}`,
          fecha: r.cambiado_en,
          tabla: 'contencion',
          registro_id: r.ingreso_id,
          accion: r.tipo_accion ?? 'update',
          actorTipo: 'profesional' as const,
          actorId: r.actor_id,
          valores_antes: null,
          valores_despues: { dia: r.dia, noche: r.noche },
        }))
    if (resHist.error) setErrorContencion('No se pudo cargar el historial de contención: ' + resHist.error.message)

    const todas = [...filasAud, ...filasHist].sort((a, b) => (a.fecha < b.fecha ? 1 : -1))
    setFilas(todas)
    setCargando(false)

    // Nombres: dos mapas distintos, uno por cada esquema de
    // identificador (ver el comentario en la interfaz Fila).
    const { data: profs, error: errProfs } = await supabase.from('profesionales').select('id, user_id, nombre, apellidos')
    if (errProfs) {
      setErrorNombres('No se pudieron cargar los nombres del personal: ' + errProfs.message)
    } else {
      const porAuth: Record<string, string> = {}
      const porId: Record<string, string> = {}
      ;(profs ?? []).forEach((p: any) => {
        const nombre = `${p.nombre} ${p.apellidos}`
        if (p.user_id) porAuth[p.user_id] = nombre
        porId[p.id] = nombre
      })
      setNombresPorAuthId(porAuth)
      setNombresPorProfId(porId)
    }

    // "Afecta a": una consulta agrupada por tipo de tabla presente en
    // esta página, no una por fila — con el número de tablas que hay
    // en total (7 fijas, no crece), esto no se dispara nunca por
    // mucho que haya de cada una.
    await resolverAfecta(todas)
  }

  async function resolverAfecta(todas: Fila[]) {
    const nuevo: Record<string, string> = {}

    function idsDe(tabla: string) {
      return [...new Set(todas.filter((f) => f.tabla === tabla && f.registro_id).map((f) => f.registro_id as string))]
    }

    const idsPacientes = idsDe('pacientes')
    const idsProfesionales = idsDe('profesionales')
    const idsIngresos = idsDe('ingresos')
    const idsEventos = idsDe('eventos')
    const idsInformeIngreso = idsDe('informe_ingreso')
    const idsInformeAlta = idsDe('informe_alta')
    const idsCmbd = idsDe('cmbd')
    // Los de contención usan el propio ingreso_id como registro_id.
    const idsContencion = idsDe('contencion')

    const consultas: PromiseLike<any>[] = []

    if (idsPacientes.length) {
      consultas.push(
        supabase.from('pacientes').select('id, nombre, primer_apellido').in('id', idsPacientes).then(({ data }) => {
          ;(data ?? []).forEach((p: any) => { nuevo[`pacientes:${p.id}`] = `${p.nombre} ${p.primer_apellido}` })
        })
      )
    }
    if (idsProfesionales.length) {
      consultas.push(
        supabase.from('profesionales').select('id, nombre, apellidos').in('id', idsProfesionales).then(({ data }) => {
          ;(data ?? []).forEach((p: any) => { nuevo[`profesionales:${p.id}`] = `${p.nombre} ${p.apellidos}` })
        })
      )
    }
    if (idsIngresos.length) {
      consultas.push(
        supabase.from('ingresos').select('id, paciente:pacientes(nombre, primer_apellido)').in('id', idsIngresos).then(({ data }) => {
          ;(data ?? []).forEach((i: any) => {
            if (i.paciente) nuevo[`ingresos:${i.id}`] = `${i.paciente.nombre} ${i.paciente.primer_apellido}`
          })
        })
      )
    }
    if (idsEventos.length) {
      consultas.push(
        supabase
          .from('eventos')
          .select('id, tipo, ingreso:ingresos(paciente:pacientes(nombre, primer_apellido))')
          .in('id', idsEventos)
          .then(async ({ data }) => {
            const encontrados = new Set<string>()
            ;(data ?? []).forEach((e: any) => {
              encontrados.add(e.id)
              const tipoLegible = TIPO_EVENTO_LABEL[e.tipo as keyof typeof TIPO_EVENTO_LABEL] ?? e.tipo
              const paciente = e.ingreso?.paciente ? `${e.ingreso.paciente.nombre} ${e.ingreso.paciente.primer_apellido}` : null
              nuevo[`eventos:${e.id}`] = paciente ? `${tipoLegible} · ${paciente}` : tipoLegible
            })

            // Una incidencia borrada ya no aparece en la consulta de
            // arriba — sin esto, "Afecta a" se quedaba en "—" para
            // cualquier cambio sobre algo ya eliminado. valores_antes
            // conserva el tipo y el ingreso de cuando existía, así
            // que se puede reconstruir igual, con una única consulta
            // agrupada más, no una por fila.
            const faltantes = todas.filter((f) => f.tabla === 'eventos' && f.registro_id && !encontrados.has(f.registro_id))
            const porIngreso = new Map<string, { registroId: string; tipo: string }>()
            faltantes.forEach((f) => {
              const va = f.valores_antes as any
              if (va?.ingreso_id) porIngreso.set(va.ingreso_id, { registroId: f.registro_id!, tipo: va.tipo })
            })
            if (porIngreso.size > 0) {
              const { data: ingsBorrados } = await supabase
                .from('ingresos')
                .select('id, paciente:pacientes(nombre, primer_apellido)')
                .in('id', [...porIngreso.keys()])
              ;(ingsBorrados ?? []).forEach((i: any) => {
                const info = porIngreso.get(i.id)
                if (!info) return
                const tipoLegible = TIPO_EVENTO_LABEL[info.tipo as keyof typeof TIPO_EVENTO_LABEL] ?? info.tipo
                const paciente = i.paciente ? `${i.paciente.nombre} ${i.paciente.primer_apellido}` : null
                nuevo[`eventos:${info.registroId}`] = paciente ? `${tipoLegible} · ${paciente} (eliminada)` : `${tipoLegible} (eliminada)`
              })
            }
          })
      )
    }
    // Las tres tienen la misma forma: informe -> ingreso -> paciente.
    for (const [tabla, ids] of [
      ['informe_ingreso', idsInformeIngreso],
      ['informe_alta', idsInformeAlta],
      ['cmbd', idsCmbd],
    ] as const) {
      if (ids.length) {
        consultas.push(
          supabase.from(tabla).select('id, ingreso:ingresos(paciente:pacientes(nombre, primer_apellido))').in('id', ids).then(({ data }) => {
            ;(data ?? []).forEach((r: any) => {
              if (r.ingreso?.paciente) nuevo[`${tabla}:${r.id}`] = `${r.ingreso.paciente.nombre} ${r.ingreso.paciente.primer_apellido}`
            })
          })
        )
      }
    }
    if (idsContencion.length) {
      consultas.push(
        supabase.from('ingresos').select('id, paciente:pacientes(nombre, primer_apellido)').in('id', idsContencion).then(({ data }) => {
          ;(data ?? []).forEach((i: any) => {
            if (i.paciente) nuevo[`contencion:${i.id}`] = `${i.paciente.nombre} ${i.paciente.primer_apellido}`
          })
        })
      )
    }

    await Promise.all(consultas)
    setAfecta(nuevo)
  }

  useEffect(() => { cargar() }, [])

  const filasFiltradas = filtroTabla ? filas.filter((f) => f.tabla === filtroTabla) : filas

  if (!esAdmin) {
    return (
      <div className="p-8">
        <div className="card p-6 max-w-md">
          <p className="font-semibold text-slate-800">Acceso restringido</p>
          <p className="text-sm text-slate-500 mt-1">
            Solo los administradores pueden consultar la auditoría.
          </p>
        </div>
      </div>
    )
  }

  return (
    <div className="p-6 md:p-8 max-w-6xl">
      <div className="flex items-center gap-2 mb-1">
        <History className="w-5 h-5 text-slate-400" />
        <h1 className="text-2xl font-bold text-slate-800">Auditoría de cambios</h1>
      </div>
      <p className="text-sm text-slate-500 mb-6">Quién ha creado, editado o borrado, y cuándo.</p>

      {(errorCambios || errorContencion || errorNombres) && (
        <div className="mb-4 space-y-2">
          {errorCambios && (
            <div className="text-sm rounded-lg px-3 py-2 border bg-red-50 text-red-600 border-red-100 flex items-center justify-between gap-3">
              <span>{errorCambios}</span>
              <button onClick={cargar} className="btn-secondary text-xs shrink-0">Reintentar</button>
            </div>
          )}
          {errorContencion && (
            <div className="text-sm rounded-lg px-3 py-2 border bg-red-50 text-red-600 border-red-100 flex items-center justify-between gap-3">
              <span>{errorContencion}</span>
              <button onClick={cargar} className="btn-secondary text-xs shrink-0">Reintentar</button>
            </div>
          )}
          {errorNombres && (
            <div className="text-sm rounded-lg px-3 py-2 border bg-amber-50 text-amber-700 border-amber-100 flex items-center justify-between gap-3">
              <span>{errorNombres} — los cambios se ven igual, pero sin el nombre de quién los hizo.</span>
              <button onClick={cargar} className="btn-secondary text-xs shrink-0">Reintentar</button>
            </div>
          )}
        </div>
      )}

      <div className="mb-4 max-w-xs">
        <label className="label">Filtrar por tipo</label>
        <select className="input" value={filtroTabla} onChange={(e) => setFiltroTabla(e.target.value)}>
          <option value="">Todos</option>
          {Object.entries(TABLA_LABEL).map(([v, l]) => (
            <option key={v} value={v}>{l}</option>
          ))}
        </select>
      </div>

      {cargando ? (
        <p className="text-slate-400">Cargando…</p>
      ) : filasFiltradas.length === 0 ? (
        errorCambios || errorContencion ? null : (
          <div className="card p-10 text-center text-slate-400 text-sm">No hay cambios registrados.</div>
        )
      ) : (
        <div className="card overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 text-slate-500 text-left">
              <tr>
                <th className="px-4 py-2 font-medium">Fecha y hora</th>
                <th className="px-4 py-2 font-medium">Quién</th>
                <th className="px-4 py-2 font-medium">Tipo</th>
                <th className="px-4 py-2 font-medium">Acción</th>
                <th className="px-4 py-2 font-medium">Afecta a</th>
                <th className="px-4 py-2 w-8"></th>
              </tr>
            </thead>
            <tbody>
              {filasFiltradas.map((f) => {
                const tieneDetalle = f.valores_antes != null || f.valores_despues != null
                const nombreActor =
                  f.actorTipo === 'auth'
                    ? (f.actorId ? nombresPorAuthId[f.actorId] : null)
                    : (f.actorId ? nombresPorProfId[f.actorId] : null)
                const claveAfecta = f.registro_id ? `${f.tabla}:${f.registro_id}` : null
                return (
                  <Fragment key={f.id}>
                    <tr
                      className={`border-t border-slate-100 ${tieneDetalle ? 'cursor-pointer hover:bg-slate-50' : ''}`}
                      onClick={() => tieneDetalle && setExpandido((e) => (e === f.id ? null : f.id))}
                    >
                      <td className="px-4 py-2 text-slate-600 whitespace-nowrap">
                        {new Date(f.fecha).toLocaleString('es-ES', {
                          day: '2-digit', month: '2-digit', year: 'numeric',
                          hour: '2-digit', minute: '2-digit',
                        })}
                      </td>
                      <td className="px-4 py-2 text-slate-800">
                        {f.actorId ? (nombreActor ?? 'Usuario desconocido') : (
                          // Un identificador nulo no demuestra que lo
                          // hiciera un proceso automático — solo que
                          // no se sabe quién fue.
                          <span className="text-slate-400">Autor no identificado</span>
                        )}
                      </td>
                      <td className="px-4 py-2 text-slate-600">{TABLA_LABEL[f.tabla] ?? f.tabla}</td>
                      <td className="px-4 py-2">
                        <span className={`px-2 py-0.5 rounded-full text-xs font-semibold ${accionColor(f.accion)}`}>
                          {accionLabel(f.accion)}
                        </span>
                      </td>
                      <td className="px-4 py-2 text-slate-500">
                        {claveAfecta ? (afecta[claveAfecta] ?? '—') : '—'}
                      </td>
                      <td className="px-4 py-2 text-slate-300">
                        {tieneDetalle && (expandido === f.id ? '▾' : '▸')}
                      </td>
                    </tr>
                    {expandido === f.id && tieneDetalle && (
                      <tr className="bg-slate-50 border-t border-slate-100">
                        <td colSpan={6} className="px-4 py-3">
                          <div className="grid grid-cols-2 gap-4 text-xs">
                            <div>
                              <p className="font-semibold text-slate-500 uppercase tracking-wide mb-1">Antes</p>
                              {f.valores_antes ? (
                                <pre className="whitespace-pre-wrap text-slate-600 bg-white rounded-lg border p-2">
                                  {formatearValor(f.tabla, f.valores_antes)}
                                </pre>
                              ) : (
                                <p className="text-slate-400 italic">No existía todavía</p>
                              )}
                            </div>
                            <div>
                              <p className="font-semibold text-slate-500 uppercase tracking-wide mb-1">Después</p>
                              {f.valores_despues ? (
                                <pre className="whitespace-pre-wrap text-slate-600 bg-white rounded-lg border p-2">
                                  {formatearValor(f.tabla, f.valores_despues)}
                                </pre>
                              ) : (
                                <p className="text-slate-400 italic">Se ha eliminado</p>
                              )}
                            </div>
                          </div>
                        </td>
                      </tr>
                    )}
                  </Fragment>
                )
              })}
            </tbody>
          </table>
        </div>
      )}

      <p className="text-xs text-slate-400 mt-3">
        Se muestran los últimos 300 cambios generales y los últimos 300 de contención.
      </p>
    </div>
  )
}
