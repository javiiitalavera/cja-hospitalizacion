// Pendientes de Inicio: qué queda por hacer hoy en la unidad, según el
// perfil de quien mira. La parte que decide (calcularPendientes) es una
// función pura, sin acceso a la base de datos, para poder probarla; la que
// trae los datos que Inicio todavía no tenía es cargarExtrasPendientes.

import { supabase } from '../../lib/supabase'
import { estaVacio } from '../../lib/informesEstado'
import { necesitaConfirmacion } from '../../types/contenciones'
import type { ContencionDia, ContencionNoche } from '../../types/contenciones'
import { DIAS_HISTORIAL_CURAS, fechasQueTocaLesion, ordenarValoraciones, sumarDias } from '../curas/tipos'
import type { Valoracion } from '../curas/tipos'

// Umbrales (días). Cambiar aquí cambia los avisos.
export const DIAS_INFORME_INGRESO = 7
export const DIAS_SIN_VALORACION = 7
export const DIAS_ALTA_RECIENTE = 7

export interface IngresoPendientes {
  id: string
  habitacion: number | null
  fecha_ingreso: string
}

export interface LesionPendientes {
  ingreso_id: string
  fecha_inicio: string
  valoraciones: Pick<Valoracion, 'fecha' | 'created_at' | 'tipo_cura' | 'frecuencia_horas' | 'dias_semana'>[]
}

export interface AltaReciente {
  id: string
  habitacion: number | null
  informeVacio: boolean
}

// Lo que Inicio no cargaba antes de esta pantalla.
export interface ExtrasPendientes {
  lesiones: LesionPendientes[]
  // ingresos con la cura de hoy ya marcada; null = no se pudo saber
  // (sin esto, un fallo de red haría parecer que ninguna cura está hecha)
  curasHoy: string[] | null
  // marcas de cura de los últimos días (para las pautas "cada X h"); si falta,
  // solo se cuenta la de hoy
  curasRecientes?: { ingreso_id: string; fecha: string }[]
  // ingresos activos con más de DIAS_INFORME_INGRESO días y el informe de ingreso vacío
  informesIngresoVacios: string[]
  altasRecientes: AltaReciente[]
}

export const EXTRAS_VACIOS: ExtrasPendientes = { lesiones: [], curasHoy: [], informesIngresoVacios: [], altasRecientes: [] }

export interface EntradaPendientes {
  hoy: string
  esMedico: boolean
  ingresos: IngresoPendientes[]
  // null = no se pudo cargar: esas líneas no se muestran (un fallo no debe
  // parecer "ningún paciente tiene pauta")
  contenciones: Record<string, { dia: ContencionDia | string | null; noche: (ContencionNoche | string)[] | null; confirmado_por_id: string | null }> | null
  // semáforo de caídas por ingreso; sin fila en items = sin semáforo
  semaforos: Record<string, string | null | undefined> | null
  eventosPendientes: { ingreso_id: string; tipo: string }[]
  extras: ExtrasPendientes
}

export type AccionPendiente =
  | { tipo: 'ruta'; ruta: string }
  | { tipo: 'contencion'; ingresoId: string }

export interface LineaPendiente {
  id: string
  texto: string
  // Habitaciones afectadas, ya redactadas ("Hab. 4, 9, 12").
  detalle: string
  accion: AccionPendiente
}

const MAX_HABS = 6

export function textoHabitaciones(habs: (number | null | undefined)[]): string {
  const unicas = [...new Set(habs.filter((h): h is number => h != null))].sort((a, b) => a - b)
  if (unicas.length === 0) return ''
  const mostradas = unicas.slice(0, MAX_HABS).join(', ')
  return `Hab. ${mostradas}${unicas.length > MAX_HABS ? '…' : ''}`
}

const plural = (n: number, uno: string, varios: string) => (n === 1 ? uno : varios)

export function calcularPendientes(e: EntradaPendientes): LineaPendiente[] {
  const lineas: LineaPendiente[] = []
  const habDe = new Map(e.ingresos.map((i) => [i.id, i.habitacion]))
  const activos = new Set(e.ingresos.map((i) => i.id))
  const primero = (ids: string[]) => ids[0]
  // Orden estable por habitación para que "el primero" sea el de la
  // habitación más baja y no el que haya devuelto la base de datos.
  const porHab = (ids: string[]) =>
    [...ids].sort((a, b) => (habDe.get(a) ?? 999) - (habDe.get(b) ?? 999))
  const detalle = (ids: string[]) => textoHabitaciones(ids.map((id) => habDe.get(id)))

  // ── Incidencias pendientes de completar (todos) ───────────────
  const pend = e.eventosPendientes.filter((ev) => activos.has(ev.ingreso_id))
  const caidas = pend.filter((ev) => ev.tipo === 'caida')
  const otras = pend.filter((ev) => ev.tipo !== 'caida')
  if (caidas.length > 0) {
    const n = caidas.length
    lineas.push({
      id: 'caidas',
      texto: `${n} ${plural(n, 'caída pendiente', 'caídas pendientes')} de completar`,
      detalle: detalle([...new Set(caidas.map((c) => c.ingreso_id))]),
      accion: { tipo: 'ruta', ruta: '/eventos?incidencias=pendiente&tipo_incidencia=caida' },
    })
  }
  if (otras.length > 0) {
    const n = otras.length
    const nombre = caidas.length > 0 ? plural(n, 'otra incidencia pendiente', 'otras incidencias pendientes') : plural(n, 'incidencia pendiente', 'incidencias pendientes')
    lineas.push({
      id: 'incidencias',
      texto: `${n} ${nombre} de completar`,
      detalle: detalle([...new Set(otras.map((c) => c.ingreso_id))]),
      accion: { tipo: 'ruta', ruta: '/eventos?incidencias=pendiente' },
    })
  }

  // ── Contención ────────────────────────────────────────────────
  // "Sin pautar": nunca se ha revisado ni de día ni de noche. Distinto de
  // "revisada, nada pautado" (día 'ninguna', noche []).
  const contenciones = e.contenciones
  const sinPautar = !contenciones ? [] : porHab(
    e.ingresos.filter((i) => {
      const c = contenciones[i.id]
      return !c || (c.dia === null && c.noche === null)
    }).map((i) => i.id)
  )
  if (sinPautar.length > 0) {
    const n = sinPautar.length
    lineas.push({
      id: 'contencion_sin_pautar',
      texto: `${n} ${plural(n, 'paciente', 'pacientes')} sin pauta de contención`,
      detalle: detalle(sinPautar),
      accion: { tipo: 'contencion', ingresoId: primero(sinPautar) },
    })
  }
  // Solo el médico puede confirmarla; para el resto no es accionable.
  if (e.esMedico && contenciones) {
    const sinConfirmar = porHab(
      e.ingresos.filter((i) => {
        const c = contenciones[i.id]
        return c && necesitaConfirmacion(c.dia as ContencionDia | null, c.noche as ContencionNoche[] | null) && !c.confirmado_por_id
      }).map((i) => i.id)
    )
    if (sinConfirmar.length > 0) {
      const n = sinConfirmar.length
      lineas.push({
        id: 'contencion_sin_confirmar',
        texto: `${n} ${plural(n, 'contención pendiente', 'contenciones pendientes')} de confirmación médica`,
        detalle: detalle(sinConfirmar),
        accion: { tipo: 'contencion', ingresoId: primero(sinConfirmar) },
      })
    }
  }

  // ── Curas (solo quien las hace) ───────────────────────────────
  const lesionesActivas = e.extras.lesiones.filter((l) => activos.has(l.ingreso_id))
  if (!e.esMedico && e.extras.curasHoy) {
    const hechas = new Set(e.extras.curasHoy)
    const fechasHechas = new Map<string, Set<string>>()
    for (const r of e.extras.curasRecientes ?? []) {
      if (!fechasHechas.has(r.ingreso_id)) fechasHechas.set(r.ingreso_id, new Set())
      fechasHechas.get(r.ingreso_id)!.add(r.fecha)
    }
    for (const id of hechas) {
      if (!fechasHechas.has(id)) fechasHechas.set(id, new Set())
      fechasHechas.get(id)!.add(e.hoy)
    }
    const tocan = new Set<string>()
    for (const l of lesionesActivas) {
      const marcas = fechasHechas.get(l.ingreso_id) ?? new Set<string>()
      if (fechasQueTocaLesion(l.valoraciones as Valoracion[], e.hoy, e.hoy, marcas, e.hoy).has(e.hoy)) tocan.add(l.ingreso_id)
    }
    const sinHacer = porHab([...tocan].filter((id) => !hechas.has(id)))
    if (sinHacer.length > 0) {
      const n = sinHacer.length
      lineas.push({
        id: 'curas_hoy',
        texto: `${n} ${plural(n, 'cura de hoy sin hacer', 'curas de hoy sin hacer')}`,
        detalle: detalle(sinHacer),
        accion: { tipo: 'ruta', ruta: '/curas' },
      })
    }
  }

  // Lesiones sin valoración nueva en más de DIAS_SIN_VALORACION días (todos).
  const limiteValoracion = sumarDias(e.hoy, -DIAS_SIN_VALORACION)
  const sinValorar = lesionesActivas.filter((l) => {
    const ultima = ordenarValoraciones(l.valoraciones as Valoracion[])[0]?.fecha ?? l.fecha_inicio
    return ultima < limiteValoracion
  })
  if (sinValorar.length > 0) {
    const n = sinValorar.length
    const ingresosAfectados = porHab([...new Set(sinValorar.map((l) => l.ingreso_id))])
    lineas.push({
      id: 'lesiones_sin_valorar',
      texto: `${n} ${plural(n, 'lesión', 'lesiones')} sin valoración en más de ${DIAS_SIN_VALORACION} días`,
      detalle: detalle(ingresosAfectados),
      accion: { tipo: 'ruta', ruta: `/ingresos/${primero(ingresosAfectados)}?tab=plan&sub=curas` },
    })
  }

  // ── Semáforo de caídas (solo quien rellena la hoja de ítems) ──
  if (!e.esMedico && e.semaforos) {
    const semaforos = e.semaforos
    const sinSemaforo = porHab(e.ingresos.filter((i) => !semaforos[i.id]).map((i) => i.id))
    if (sinSemaforo.length > 0) {
      const n = sinSemaforo.length
      lineas.push({
        id: 'sin_semaforo',
        texto: `${n} ${plural(n, 'paciente', 'pacientes')} sin semáforo de caídas`,
        detalle: detalle(sinSemaforo),
        accion: { tipo: 'ruta', ruta: '/items' },
      })
    }
  }

  // ── Informes (solo médicos) ───────────────────────────────────
  if (e.esMedico) {
    const limiteIngreso = sumarDias(e.hoy, -DIAS_INFORME_INGRESO)
    const vacios = new Set(e.extras.informesIngresoVacios)
    const ingresoSinInforme = porHab(
      e.ingresos.filter((i) => i.fecha_ingreso <= limiteIngreso && vacios.has(i.id)).map((i) => i.id)
    )
    if (ingresoSinInforme.length > 0) {
      const n = ingresoSinInforme.length
      lineas.push({
        id: 'informe_ingreso',
        texto: `${n} ${plural(n, 'informe de ingreso sin empezar', 'informes de ingreso sin empezar')} (más de ${DIAS_INFORME_INGRESO} días de ingreso)`,
        detalle: detalle(ingresoSinInforme),
        accion: { tipo: 'ruta', ruta: `/ingresos/${primero(ingresoSinInforme)}?tab=informes&sub=ingreso` },
      })
    }
    const altasSinInforme = e.extras.altasRecientes.filter((a) => a.informeVacio)
    if (altasSinInforme.length > 0) {
      const n = altasSinInforme.length
      lineas.push({
        id: 'informe_alta',
        texto: `${n} ${plural(n, 'informe de alta sin hacer', 'informes de alta sin hacer')} (altas de los últimos ${DIAS_ALTA_RECIENTE} días)`,
        detalle: textoHabitaciones(altasSinInforme.map((a) => a.habitacion)),
        accion: { tipo: 'ruta', ruta: `/ingresos/${altasSinInforme[0].id}?tab=informes&sub=alta` },
      })
    }
  }

  return lineas
}

// ── Carga de lo que Inicio no tenía ──────────────────────────────

export async function cargarExtrasPendientes(
  ingresos: IngresoPendientes[],
  hoy: string,
  esMedico: boolean
): Promise<{ extras: ExtrasPendientes; error: string | null }> {
  const extras: ExtrasPendientes = { lesiones: [], curasHoy: esMedico ? [] : null, informesIngresoVacios: [], altasRecientes: [] }
  const errores: string[] = []
  const ids = ingresos.map((i) => i.id)
  if (ids.length === 0 && !esMedico) return { extras: { ...extras, curasHoy: [] }, error: null }

  const limiteIngreso = sumarDias(hoy, -DIAS_INFORME_INGRESO)
  const idsAntiguos = ingresos.filter((i) => i.fecha_ingreso <= limiteIngreso).map((i) => i.id)

  const [lesiones, registros, informesIngreso, altas] = await Promise.all([
    ids.length > 0
      ? supabase
          .from('curas_lesiones')
          .select('ingreso_id, fecha_inicio, valoraciones:curas_valoraciones(fecha, created_at, tipo_cura, frecuencia_horas, dias_semana)')
          .in('ingreso_id', ids)
          .is('fecha_fin', null)
      : Promise.resolve({ data: [], error: null }),
    !esMedico && ids.length > 0
      ? supabase.from('curas_registro').select('ingreso_id, fecha').in('ingreso_id', ids).gte('fecha', sumarDias(hoy, -DIAS_HISTORIAL_CURAS)).lte('fecha', hoy).order('fecha', { ascending: false })
      : Promise.resolve({ data: [], error: null }),
    esMedico && idsAntiguos.length > 0
      ? supabase.from('informe_ingreso').select('*').in('ingreso_id', idsAntiguos)
      : Promise.resolve({ data: [], error: null }),
    esMedico
      ? supabase
          .from('ingresos')
          .select('id, habitacion')
          .neq('estado', 'activo')
          .gte('fecha_alta', sumarDias(hoy, -DIAS_ALTA_RECIENTE))
      : Promise.resolve({ data: [], error: null }),
  ])

  if (lesiones.error) errores.push(lesiones.error.message)
  else extras.lesiones = (lesiones.data ?? []) as unknown as LesionPendientes[]

  if (registros.error) errores.push(registros.error.message)
  else if (!esMedico) {
    const filas = (registros.data ?? []) as { ingreso_id: string; fecha: string }[]
    extras.curasHoy = filas.filter((r) => r.fecha === hoy).map((r) => r.ingreso_id)
    extras.curasRecientes = filas
  }

  if (informesIngreso.error) errores.push(informesIngreso.error.message)
  else {
    const conContenido = new Set(
      ((informesIngreso.data ?? []) as Record<string, unknown>[]).filter((f) => !estaVacio(f)).map((f) => f.ingreso_id as string)
    )
    extras.informesIngresoVacios = idsAntiguos.filter((id) => !conContenido.has(id))
  }

  if (altas.error) errores.push(altas.error.message)
  else {
    const recientes = (altas.data ?? []) as { id: string; habitacion: number | null }[]
    if (recientes.length > 0) {
      const { data: informes, error: errAlta } = await supabase
        .from('informe_alta')
        .select('*')
        .in('ingreso_id', recientes.map((r) => r.id))
      if (errAlta) errores.push(errAlta.message)
      else {
        const conContenido = new Set(
          ((informes ?? []) as Record<string, unknown>[]).filter((f) => !estaVacio(f)).map((f) => f.ingreso_id as string)
        )
        extras.altasRecientes = recientes.map((r) => ({
          id: r.id,
          habitacion: r.habitacion ?? null,
          informeVacio: !conContenido.has(r.id),
        }))
      }
    }
  }

  return { extras, error: errores.length > 0 ? errores.join(' · ') : null }
}
