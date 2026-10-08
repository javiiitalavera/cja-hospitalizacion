import { useEffect, useRef, useState } from 'react'
import { ArrowLeft, Check, ChevronDown, ChevronUp, Copy, Download, FileText, Lock, Plus, RefreshCw, Trash2 } from 'lucide-react'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../lib/AuthContext'
import { hoyLocal } from '../../lib/fechas'
import { exportarInformePuntual } from '../../lib/exportWord'
import type { Ingreso } from '../../types'
import { fechaLarga } from '../curas/tipos'
import { cargarDatosFicha, textoDeOrigen } from '../informes/datosFicha'
import {
  MAX_SECCIONES, MAX_TEXTO, MAX_TITULO_SECCION, ORIGEN_LABEL, ORIGEN_TITULO, PLANTILLAS, PLANTILLA_LABEL, plantillaPorId,
} from '../informes/plantillas'
import type { InformePuntual, PlantillaId, SeccionInforme } from '../informes/plantillas'
import { AutoTextarea } from './AutoTextarea'

const SELECT_INFORME =
  '*, registrado_por:profesionales!registrado_por_id(nombre, apellidos, colegiado, especialidad), ' +
  'firmado_por:profesionales!firmado_por_id(nombre, apellidos, colegiado, especialidad)'

const nombreProf = (p?: { nombre: string; apellidos: string } | null) => (p ? `${p.nombre} ${p.apellidos}` : '—')
const fechaHora = (iso?: string | null) =>
  iso ? new Date(iso).toLocaleString('es-ES', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : ''

// ═════════════════════════════════════════════════════════════
// Pestaña: lista de informes puntuales del ingreso + editor
// ═════════════════════════════════════════════════════════════

export function TabOtrosInformes({ ingresoId, ingreso }: { ingresoId: string; ingreso: Ingreso }) {
  const { rol, profesional } = useAuth()
  const esMedico = rol === 'medico'

  const [lista, setLista] = useState<InformePuntual[]>([])
  const [loading, setLoading] = useState(true)
  const [errorCarga, setErrorCarga] = useState('')
  const [abierto, setAbierto] = useState<InformePuntual | null>(null)
  const [notasIniciales, setNotasIniciales] = useState<Record<number, string>>({})
  const [eligiendo, setEligiendo] = useState(false)
  const [creando, setCreando] = useState(false)
  const [errorCrear, setErrorCrear] = useState('')

  async function cargar() {
    setLoading(true)
    setErrorCarga('')
    const { data, error } = await supabase
      .from('informes_puntuales')
      .select(SELECT_INFORME)
      .eq('ingreso_id', ingresoId)
      .order('created_at', { ascending: false })
    if (error) { setErrorCarga('No se pudieron cargar los informes: ' + error.message); setLoading(false); return }
    setLista((data as unknown as InformePuntual[]) ?? [])
    setLoading(false)
  }

  useEffect(() => { setAbierto(null); setEligiendo(false); cargar() }, [ingresoId])

  async function crear(plantilla: PlantillaId) {
    if (!profesional) return
    setCreando(true)
    setErrorCrear('')
    try {
      const def = plantillaPorId(plantilla)
      const ficha = await cargarDatosFicha(ingreso)
      const notas: Record<number, string> = {}
      const secciones: SeccionInforme[] = def.secciones.map((s, i) => {
        if (!s.origen) return { titulo: s.titulo, texto: '', origen: null }
        const r = textoDeOrigen(s.origen, ficha)
        notas[i] = r.texto ? (r.nota ?? '') : 'No hay datos en la ficha para esta sección: escríbela a mano.'
        return { titulo: s.titulo, texto: r.texto, origen: s.origen }
      })
      const { data, error } = await supabase
        .from('informes_puntuales')
        .insert({
          ingreso_id: ingresoId,
          plantilla,
          titulo: def.titulo,
          destinatario: def.destinatario || null,
          fecha: hoyLocal(),
          secciones,
          registrado_por_id: profesional.id,
        })
        .select(SELECT_INFORME)
        .single()
      if (error || !data) { setErrorCrear('No se pudo crear el informe: ' + (error?.message ?? 'sin respuesta')); return }
      setEligiendo(false)
      setNotasIniciales(notas)
      setAbierto(data as unknown as InformePuntual)
      cargar()
    } catch (e) {
      setErrorCrear('No se pudo crear el informe: ' + (e instanceof Error ? e.message : String(e)))
    } finally {
      setCreando(false)
    }
  }

  async function nuevaVersion(origen: InformePuntual) {
    if (!profesional) return
    const { data, error } = await supabase
      .from('informes_puntuales')
      .insert({
        ingreso_id: ingresoId,
        plantilla: origen.plantilla,
        titulo: origen.titulo,
        destinatario: origen.destinatario,
        fecha: hoyLocal(),
        secciones: origen.secciones,
        reemplaza_a_id: origen.id,
        registrado_por_id: profesional.id,
      })
      .select(SELECT_INFORME)
      .single()
    if (error || !data) { alert('No se pudo crear la nueva versión: ' + (error?.message ?? 'sin respuesta')); return }
    setNotasIniciales({})
    setAbierto(data as unknown as InformePuntual)
    cargar()
  }

  // ── Editor abierto ──
  if (abierto) {
    const reemplazado = lista.find((x) => x.id === abierto.reemplaza_a_id) ?? null
    const posterior = lista.some((x) => x.reemplaza_a_id === abierto.id)
    return (
      <EditorInforme
        key={abierto.id}
        informe={abierto}
        ingreso={ingreso}
        esMedico={esMedico}
        reemplazado={reemplazado}
        tienePosterior={posterior}
        notasIniciales={notasIniciales}
        onVolver={() => { setAbierto(null); cargar() }}
        onNuevaVersion={nuevaVersion}
      />
    )
  }

  // ── Elegir plantilla ──
  if (eligiendo) {
    return (
      <div className="max-w-3xl space-y-4">
        <button onClick={() => setEligiendo(false)} className="text-sm text-slate-500 hover:text-slate-700 flex items-center gap-1">
          <ArrowLeft className="w-4 h-4" /> Volver a la lista
        </button>
        <div>
          <h2 className="text-base font-bold text-slate-800">Nuevo informe</h2>
          <p className="text-sm text-slate-500">
            Elige el tipo. Se rellenará con los datos de la ficha que correspondan y podrás cambiar todo: textos, secciones, orden.
          </p>
        </div>
        {errorCrear && <p className="text-sm text-red-600 bg-red-50 border border-red-100 rounded-lg px-3 py-2">{errorCrear}</p>}
        <div className="grid gap-3">
          {PLANTILLAS.map((pl) => (
            <button
              key={pl.id}
              disabled={creando}
              onClick={() => crear(pl.id)}
              className="card p-4 text-left hover:border-primary-300 hover:bg-primary-50/30 transition-colors disabled:opacity-60"
            >
              <p className="font-semibold text-slate-800">{pl.label}</p>
              <p className="text-sm text-slate-500 mt-0.5">{pl.descripcion}</p>
            </button>
          ))}
        </div>
        {creando && <p className="text-sm text-slate-400">Creando el informe con los datos de la ficha…</p>}
      </div>
    )
  }

  // ── Lista ──
  return (
    <div className="max-w-3xl space-y-4">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h2 className="text-base font-bold text-slate-800">Otros informes</h2>
          <p className="text-sm text-slate-500">
            Informes puntuales (derivación a urgencias, trabajo social, estado actual…), además de los de ingreso y alta.
          </p>
        </div>
        {esMedico && (
          <button onClick={() => { setErrorCrear(''); setEligiendo(true) }} className="btn-primary shrink-0">
            <Plus className="w-4 h-4" /> Nuevo informe
          </button>
        )}
      </div>

      {!esMedico && (
        <div className="flex items-center gap-2 text-sm text-amber-700 bg-amber-50 border border-amber-100 rounded-lg px-3 py-2">
          <Lock className="w-4 h-4 shrink-0" />
          Solo un médico puede redactar y firmar estos informes. Tú puedes consultarlos y exportarlos.
        </div>
      )}

      {loading && <p className="text-sm text-slate-400">Cargando…</p>}
      {errorCarga && (
        <div className="card p-4 text-sm">
          <p className="text-red-600">{errorCarga}</p>
          <button onClick={cargar} className="btn-secondary text-xs mt-2">Reintentar</button>
        </div>
      )}
      {!loading && !errorCarga && lista.length === 0 && (
        <div className="card p-8 text-center text-sm text-slate-400">
          <FileText className="w-6 h-6 mx-auto mb-2 text-slate-300" />
          Todavía no hay informes puntuales en este ingreso.
        </div>
      )}

      <div className="space-y-2">
        {lista.map((inf) => {
          const sustituido = lista.some((x) => x.reemplaza_a_id === inf.id)
          return (
            <button
              key={inf.id}
              onClick={() => { setNotasIniciales({}); setAbierto(inf) }}
              className={`card w-full p-4 text-left hover:border-primary-300 transition-colors ${sustituido ? 'opacity-60' : ''}`}
            >
              <div className="flex items-center justify-between gap-3">
                <p className="font-semibold text-slate-800">{inf.titulo}</p>
                <div className="flex items-center gap-1.5 shrink-0">
                  {sustituido && <span className="text-[11px] px-2 py-0.5 rounded-full bg-slate-100 text-slate-500">Sustituido</span>}
                  <span className={`text-[11px] font-medium px-2 py-0.5 rounded-full ${
                    inf.estado === 'firmado' ? 'bg-emerald-100 text-emerald-700' : 'bg-amber-100 text-amber-700'
                  }`}>
                    {inf.estado === 'firmado' ? 'Firmado' : 'Borrador'}
                  </span>
                </div>
              </div>
              <p className="text-xs text-slate-500 mt-1">
                {PLANTILLA_LABEL[inf.plantilla] ?? inf.plantilla} · {fechaLarga(inf.fecha)}
                {inf.destinatario ? ` · Para: ${inf.destinatario}` : ''} · {inf.estado === 'firmado'
                  ? `Firmado por ${nombreProf(inf.firmado_por)}`
                  : `Redactado por ${nombreProf(inf.registrado_por)}`}
                {inf.reemplaza_a_id ? ' · Nueva versión' : ''}
              </p>
            </button>
          )
        })}
      </div>
    </div>
  )
}

// ═════════════════════════════════════════════════════════════
// Editor de un informe
// ═════════════════════════════════════════════════════════════

type EstadoGuardado = 'inactivo' | 'pendiente' | 'guardando' | 'guardado' | 'error' | 'conflicto'

interface ItemUI extends SeccionInforme { k: number }

let contadorClaves = 0
const conClave = (s: SeccionInforme): ItemUI => ({ ...s, k: ++contadorClaves })

function EditorInforme({
  informe, ingreso, esMedico, reemplazado, tienePosterior, notasIniciales, onVolver, onNuevaVersion,
}: {
  informe: InformePuntual
  ingreso: Ingreso
  esMedico: boolean
  reemplazado: InformePuntual | null
  tienePosterior: boolean
  notasIniciales: Record<number, string>
  onVolver: () => void
  // Recibe el informe tal y como está AHORA en el editor (firmado), no la copia con la que se abrió.
  onNuevaVersion: (origen: InformePuntual) => void
}) {
  const [meta, setMeta] = useState(informe)                  // estado del servidor (estado, firma, versión…)
  const [titulo, setTitulo] = useState(informe.titulo)
  const [destinatario, setDestinatario] = useState(informe.destinatario ?? '')
  const [fecha, setFecha] = useState(informe.fecha)
  const [items, setItems] = useState<ItemUI[]>(() => (informe.secciones ?? []).map(conClave))
  // Avisos por sección (clave de ItemUI). Los de la primera carga llegan por posición.
  const [notas, setNotas] = useState<Record<number, string>>(() => {
    const mapa: Record<number, string> = {}
    items.forEach((it, i) => { if (notasIniciales[i]) mapa[it.k] = notasIniciales[i] })
    return mapa
  })
  const [guardado, setGuardado] = useState<EstadoGuardado>('inactivo')
  const [errorGuardado, setErrorGuardado] = useState('')
  const [accionando, setAccionando] = useState(false)
  const [errorAccion, setErrorAccion] = useState('')
  const [confirmarFirma, setConfirmarFirma] = useState(false)
  const [confirmarBorrar, setConfirmarBorrar] = useState(false)
  const [nuevaSeccion, setNuevaSeccion] = useState('')

  const editable = esMedico && meta.estado === 'borrador'

  // Estado vivo para el guardado (los temporizadores no ven el estado de React de su render).
  const vivo = useRef({ titulo, destinatario, fecha, items })
  useEffect(() => { vivo.current = { titulo, destinatario, fecha, items } })
  const versionRef = useRef(informe.version)
  const sucioRef = useRef(false)
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const cadenaRef = useRef<Promise<boolean>>(Promise.resolve(true))
  const conflictoRef = useRef(false)

  function programarGuardado() {
    if (conflictoRef.current) return
    sucioRef.current = true
    setGuardado('pendiente')
    if (debounceRef.current) clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(() => { guardar() }, 1500)
  }

  // Los guardados se encadenan: cada uno usa la versión que dejó el anterior,
  // así dos guardados seguidos del mismo usuario nunca se confunden con un
  // conflicto con otra persona.
  function guardar(): Promise<boolean> {
    const p = cadenaRef.current.then(() => hacerGuardado())
    cadenaRef.current = p.catch(() => false)
    return p
  }

  async function hacerGuardado(): Promise<boolean> {
    if (conflictoRef.current) return false
    if (!sucioRef.current) return true
    if (debounceRef.current) { clearTimeout(debounceRef.current); debounceRef.current = null }
    sucioRef.current = false
    setGuardado('guardando')
    const v = vivo.current
    const { data, error } = await supabase
      .from('informes_puntuales')
      .update({
        titulo: v.titulo.trim() || informe.titulo,
        destinatario: v.destinatario.trim() || null,
        fecha: v.fecha,
        secciones: v.items.map(({ titulo: t, texto, origen }) => ({ titulo: t, texto, origen: origen ?? null })),
      })
      .eq('id', informe.id)
      .eq('version', versionRef.current)
      .select('version')
      .maybeSingle()
    if (error) { sucioRef.current = true; setErrorGuardado(error.message); setGuardado('error'); return false }
    if (!data) { conflictoRef.current = true; setGuardado('conflicto'); return false }
    versionRef.current = data.version
    // Si mientras se guardaba se escribió algo más, el siguiente guardado ya está en marcha.
    if (!sucioRef.current) {
      setGuardado('guardado')
      setTimeout(() => setGuardado((g) => (g === 'guardado' ? 'inactivo' : g)), 2500)
    }
    return true
  }

  async function recargarTrasConflicto() {
    const { data } = await supabase.from('informes_puntuales').select(SELECT_INFORME).eq('id', informe.id).maybeSingle()
    if (!data) { onVolver(); return }
    const d = data as unknown as InformePuntual
    conflictoRef.current = false
    sucioRef.current = false
    versionRef.current = d.version
    setMeta(d)
    setTitulo(d.titulo)
    setDestinatario(d.destinatario ?? '')
    setFecha(d.fecha)
    setItems((d.secciones ?? []).map(conClave))
    setNotas({})
    setGuardado('inactivo')
  }

  // ── edición ──
  function cambiaMeta(setter: (v: string) => void, valor: string) {
    if (!editable || conflictoRef.current) return
    setter(valor)
    programarGuardado()
  }

  function cambiaItems(fn: (prev: ItemUI[]) => ItemUI[]) {
    if (!editable || conflictoRef.current) return
    setItems((prev) => fn(prev))
    programarGuardado()
  }

  function cambiaSeccion(k: number, campo: 'titulo' | 'texto', valor: string) {
    cambiaItems((prev) => prev.map((it) => (it.k === k ? { ...it, [campo]: valor } : it)))
  }

  function mover(k: number, delta: -1 | 1) {
    cambiaItems((prev) => {
      const i = prev.findIndex((it) => it.k === k)
      const j = i + delta
      if (i < 0 || j < 0 || j >= prev.length) return prev
      const copia = [...prev]
      ;[copia[i], copia[j]] = [copia[j], copia[i]]
      return copia
    })
  }

  function quitar(k: number) {
    const it = items.find((x) => x.k === k)
    if (it && it.texto.trim() && !window.confirm(`¿Quitar la sección «${it.titulo}» con su texto?`)) return
    cambiaItems((prev) => prev.filter((x) => x.k !== k))
  }

  async function rellenar(k: number, origen: string, abrirNota = true) {
    const ficha = await cargarDatosFicha(ingreso)
    const r = textoDeOrigen(origen, ficha)
    if (!r.texto) { setNotas((n) => ({ ...n, [k]: 'No hay datos en la ficha para esta sección: no se ha cambiado nada.' })); return }
    const actual = vivo.current.items.find((x) => x.k === k)
    if (actual?.texto.trim() && actual.texto.trim() !== r.texto.trim()
        && !window.confirm('Esta sección ya tiene texto. ¿Sustituirlo por los datos de la ficha?')) return
    cambiaItems((prev) => prev.map((it) => (it.k === k ? { ...it, texto: r.texto.slice(0, MAX_TEXTO), origen } : it)))
    if (abrirNota) setNotas((n) => ({ ...n, [k]: r.nota ?? '' }))
  }

  async function anadir() {
    if (items.length >= MAX_SECCIONES) return
    const origen = nuevaSeccion
    setNuevaSeccion('')
    if (!origen) {
      cambiaItems((prev) => [...prev, conClave({ titulo: 'Nueva sección', texto: '', origen: null })])
      return
    }
    const ficha = await cargarDatosFicha(ingreso)
    const r = textoDeOrigen(origen, ficha)
    const nuevo = conClave({ titulo: ORIGEN_TITULO[origen] ?? origen, texto: r.texto.slice(0, MAX_TEXTO), origen })
    cambiaItems((prev) => [...prev, nuevo])
    setNotas((n) => ({ ...n, [nuevo.k]: r.texto ? (r.nota ?? '') : 'No hay datos en la ficha para esta sección: escríbela a mano.' }))
  }

  // ── acciones ──
  async function volver() {
    if (editable) {
      const ok = await guardar()
      if (!ok) { setErrorAccion('No se ha podido guardar el informe, así que no se sale. Revisa el aviso de guardado.'); return }
    }
    onVolver()
  }

  async function exportar() {
    if (editable) {
      const ok = await guardar()
      if (!ok) return
    }
    const v = vivo.current
    const actual: InformePuntual = {
      ...meta,
      titulo: editable ? (v.titulo.trim() || meta.titulo) : meta.titulo,
      destinatario: editable ? (v.destinatario.trim() || null) : meta.destinatario,
      fecha: editable ? v.fecha : meta.fecha,
      secciones: editable ? v.items.map(({ titulo: t, texto, origen }) => ({ titulo: t, texto, origen: origen ?? null })) : meta.secciones,
    }
    await exportarInformePuntual(ingreso, actual)
  }

  async function firmar() {
    setAccionando(true)
    setErrorAccion('')
    const ok = await guardar()
    if (!ok) { setAccionando(false); setConfirmarFirma(false); setErrorAccion('No se pudo guardar el informe antes de firmarlo. Revisa el aviso de guardado.'); return }
    const { data, error } = await supabase
      .from('informes_puntuales')
      .update({ estado: 'firmado' })
      .eq('id', informe.id)
      .eq('version', versionRef.current)
      .select(SELECT_INFORME)
      .maybeSingle()
    setAccionando(false)
    if (error) { setConfirmarFirma(false); setErrorAccion(error.message); return }
    if (!data) { setConfirmarFirma(false); conflictoRef.current = true; setGuardado('conflicto'); return }
    const d = data as unknown as InformePuntual
    versionRef.current = d.version
    setMeta(d)
    setConfirmarFirma(false)
  }

  async function borrar() {
    setAccionando(true)
    setErrorAccion('')
    if (debounceRef.current) clearTimeout(debounceRef.current)
    sucioRef.current = false
    const { data, error } = await supabase.from('informes_puntuales').delete().eq('id', informe.id).select('id')
    setAccionando(false)
    if (error || !data || data.length === 0) {
      setConfirmarBorrar(false)
      setErrorAccion('No se pudo eliminar el borrador' + (error ? ': ' + error.message : ' (solo puede hacerlo su autor o un administrador).'))
      return
    }
    onVolver()
  }

  const v = { titulo, destinatario, fecha }
  const numSecciones = items.length

  return (
    <div className="max-w-3xl space-y-5">
      <div className="flex items-center justify-between gap-3">
        <button onClick={volver} className="text-sm text-slate-500 hover:text-slate-700 flex items-center gap-1">
          <ArrowLeft className="w-4 h-4" /> Volver a la lista
        </button>
        <div className="text-xs text-slate-400 flex items-center gap-1">
          {guardado === 'pendiente' && <><span className="w-1.5 h-1.5 rounded-full bg-slate-400 inline-block" /> Cambios pendientes</>}
          {guardado === 'guardando' && <><span className="w-1.5 h-1.5 rounded-full bg-amber-400 animate-pulse inline-block" /> Guardando…</>}
          {guardado === 'guardado' && <><span className="w-1.5 h-1.5 rounded-full bg-emerald-500 inline-block" /> Guardado</>}
          {guardado === 'error' && <span className="text-red-600 font-semibold">Error al guardar — {errorGuardado || 'comprueba la conexión'}</span>}
        </div>
      </div>

      {guardado === 'conflicto' && (
        <div className="bg-amber-50 border border-amber-200 text-amber-800 text-sm rounded-lg px-4 py-3 flex items-center justify-between gap-3">
          <span>Alguien más ha guardado cambios en este informe mientras lo editabas. Lo que has escrito sigue aquí, sin guardar todavía.</span>
          <button onClick={recargarTrasConflicto} className="btn-secondary text-xs shrink-0">Ver la versión más reciente</button>
        </div>
      )}

      {/* Estado del informe */}
      <div className="flex flex-wrap items-center gap-2 text-xs">
        <span className="px-2 py-0.5 rounded-full bg-slate-100 text-slate-600 font-medium">{PLANTILLA_LABEL[meta.plantilla] ?? meta.plantilla}</span>
        <span className={`px-2 py-0.5 rounded-full font-medium ${meta.estado === 'firmado' ? 'bg-emerald-100 text-emerald-700' : 'bg-amber-100 text-amber-700'}`}>
          {meta.estado === 'firmado' ? 'Firmado' : 'Borrador'}
        </span>
        {meta.estado === 'firmado' && (
          <span className="text-slate-500">Firmado por {nombreProf(meta.firmado_por)} el {fechaHora(meta.firmado_en)}</span>
        )}
        {reemplazado && (
          <span className="text-slate-500">· Nueva versión de «{reemplazado.titulo}»{reemplazado.firmado_en ? ` (firmado el ${fechaHora(reemplazado.firmado_en)})` : ''}</span>
        )}
      </div>

      {meta.estado === 'firmado' && (
        <div className="flex items-center gap-2 text-sm text-slate-600 bg-slate-100 border border-slate-200 rounded-lg px-3 py-2">
          <Lock className="w-4 h-4 shrink-0" />
          Informe firmado: ya no se puede modificar. Si hay que corregir algo, crea una nueva versión.
        </div>
      )}
      {!esMedico && meta.estado === 'borrador' && (
        <div className="flex items-center gap-2 text-sm text-amber-700 bg-amber-50 border border-amber-100 rounded-lg px-3 py-2">
          <Lock className="w-4 h-4 shrink-0" />
          Solo lectura: este informe es un borrador y solo un médico puede editarlo.
        </div>
      )}

      {/* Cabecera del informe */}
      <div className="card p-6 space-y-4">
        <div>
          <span className="label">Título del informe</span>
          {editable
            ? <input className="input" maxLength={200} value={v.titulo} onChange={(e) => cambiaMeta(setTitulo, e.target.value)} />
            : <p className="text-sm font-semibold text-slate-800">{meta.titulo}</p>}
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div className="sm:col-span-2">
            <span className="label">Dirigido a</span>
            {editable
              ? <input className="input" maxLength={300} placeholder="(opcional)" value={v.destinatario} onChange={(e) => cambiaMeta(setDestinatario, e.target.value)} />
              : <p className="text-sm text-slate-700">{meta.destinatario || '—'}</p>}
          </div>
          <div>
            <span className="label">Fecha del informe</span>
            {editable
              ? <input type="date" className="input" value={v.fecha} onChange={(e) => e.target.value && cambiaMeta(setFecha, e.target.value)} />
              : <p className="text-sm text-slate-700">{fechaLarga(meta.fecha)}</p>}
          </div>
        </div>
      </div>

      {/* Secciones */}
      <div className="space-y-4">
        {(editable ? items : (meta.secciones ?? []).map((s, i) => ({ ...s, k: -i - 1 }))).map((it, idx, arr) => (
          <div key={it.k} className="card p-5 space-y-3">
            {editable ? (
              <>
                <div className="flex items-center gap-2">
                  <input
                    className="input font-semibold"
                    maxLength={MAX_TITULO_SECCION}
                    value={it.titulo}
                    onChange={(e) => cambiaSeccion(it.k, 'titulo', e.target.value)}
                    aria-label="Título de la sección"
                  />
                  <button type="button" disabled={idx === 0} onClick={() => mover(it.k, -1)} className="p-2 text-slate-400 hover:text-slate-700 disabled:opacity-30" title="Subir">
                    <ChevronUp className="w-4 h-4" />
                  </button>
                  <button type="button" disabled={idx === arr.length - 1} onClick={() => mover(it.k, 1)} className="p-2 text-slate-400 hover:text-slate-700 disabled:opacity-30" title="Bajar">
                    <ChevronDown className="w-4 h-4" />
                  </button>
                  <button type="button" onClick={() => quitar(it.k)} className="p-2 text-slate-400 hover:text-red-600" title="Quitar sección">
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
                <AutoTextarea value={it.texto} onChange={(t) => cambiaSeccion(it.k, 'texto', t.slice(0, MAX_TEXTO))} />
                {it.origen && (
                  <button type="button" onClick={() => rellenar(it.k, it.origen!)} className="text-xs text-primary-700 hover:underline flex items-center gap-1">
                    <RefreshCw className="w-3 h-3" /> {it.texto.trim() ? 'Volver a rellenar' : 'Rellenar'} desde la ficha ({ORIGEN_LABEL[it.origen] ?? it.origen})
                  </button>
                )}
                {notas[it.k] && (
                  <p className="text-xs text-amber-700 bg-amber-50 border border-amber-100 rounded px-2 py-1">{notas[it.k]}</p>
                )}
              </>
            ) : (
              <>
                <p className="text-sm font-bold text-slate-800">{it.titulo}</p>
                <p className="text-sm text-slate-700 whitespace-pre-wrap">{it.texto || <span className="text-slate-300 italic">Sin texto (no se imprime)</span>}</p>
              </>
            )}
          </div>
        ))}
      </div>

      {editable && (
        <div className="flex items-center gap-2">
          <select className="input max-w-xs" value={nuevaSeccion} onChange={(e) => setNuevaSeccion(e.target.value)}>
            <option value="">Sección en blanco</option>
            {Object.entries(ORIGEN_LABEL).map(([o, l]) => (
              <option key={o} value={o}>Con datos de la ficha: {l}</option>
            ))}
          </select>
          <button type="button" onClick={anadir} disabled={numSecciones >= MAX_SECCIONES} className="btn-secondary">
            <Plus className="w-4 h-4" /> Añadir sección
          </button>
        </div>
      )}
      {editable && <p className="text-xs text-slate-400">Las secciones sin texto no aparecen en el documento Word.</p>}

      {errorAccion && <p className="text-sm text-red-600 bg-red-50 border border-red-100 rounded-lg px-3 py-2">{errorAccion}</p>}

      {/* Acciones */}
      <div className="flex flex-wrap justify-end gap-3 pt-2">
        {editable && (
          <button type="button" onClick={() => setConfirmarBorrar(true)} className="btn-secondary text-red-600">
            <Trash2 className="w-4 h-4" /> Eliminar borrador
          </button>
        )}
        <button type="button" onClick={exportar} className="btn-secondary">
          <Download className="w-4 h-4" /> Exportar Word
        </button>
        {editable && (
          <>
            <button type="button" onClick={() => guardar()} className="btn-secondary">Guardar ahora</button>
            <button type="button" onClick={() => setConfirmarFirma(true)} className="btn-primary">
              <Check className="w-4 h-4" /> Firmar informe
            </button>
          </>
        )}
        {esMedico && meta.estado === 'firmado' && !tienePosterior && (
          <button type="button" onClick={() => onNuevaVersion(meta)} className="btn-primary">
            <Copy className="w-4 h-4" /> Crear nueva versión
          </button>
        )}
        {meta.estado === 'firmado' && tienePosterior && (
          <span className="text-xs text-slate-400 self-center">Ya existe una versión posterior de este informe.</span>
        )}
      </div>

      {/* Confirmar firma */}
      {confirmarFirma && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4" onClick={() => !accionando && setConfirmarFirma(false)}>
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm p-6" onClick={(e) => e.stopPropagation()}>
            <h2 className="text-base font-bold text-slate-800 mb-2">Firmar informe</h2>
            <p className="text-sm text-slate-500 mb-4">
              Una vez firmado, el informe no se puede modificar ni borrar: si hay que corregirlo, se crea una nueva versión.
              Queda registrado quién lo firma y cuándo.
            </p>
            <div className="flex gap-3">
              <button onClick={() => setConfirmarFirma(false)} disabled={accionando} className="btn-secondary flex-1">Cancelar</button>
              <button onClick={firmar} disabled={accionando} className="btn-primary flex-1">
                <Check className="w-4 h-4" /> {accionando ? 'Firmando…' : 'Firmar'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Confirmar borrado */}
      {confirmarBorrar && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4" onClick={() => !accionando && setConfirmarBorrar(false)}>
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm p-6" onClick={(e) => e.stopPropagation()}>
            <h2 className="text-base font-bold text-slate-800 mb-2">Eliminar borrador</h2>
            <p className="text-sm text-slate-500 mb-4">Se eliminará este borrador. No se puede deshacer.</p>
            <div className="flex gap-3">
              <button onClick={() => setConfirmarBorrar(false)} disabled={accionando} className="btn-secondary flex-1">Cancelar</button>
              <button onClick={borrar} disabled={accionando} className="btn-danger flex-1">
                <Trash2 className="w-4 h-4" /> {accionando ? 'Eliminando…' : 'Eliminar'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
