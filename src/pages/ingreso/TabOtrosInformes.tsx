import { useEffect, useRef, useState } from 'react'
import { ArrowLeft, ChevronDown, ChevronRight, Download, FileText, Lock, Plus, Trash2 } from 'lucide-react'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../lib/AuthContext'
import { exportarInformePuntual } from '../../lib/exportWord'
import type { Ingreso } from '../../types'
import { cargarCamposIniciales } from '../informes/datosFicha'
import { MAX_TEXTO, PLANTILLAS, PLANTILLA_LABEL, plantillaPorId } from '../informes/plantillas'
import type { CampoInforme, InformePuntual, PlantillaId } from '../informes/plantillas'
import { AutoTextarea } from './AutoTextarea'

const SELECT_INFORME = '*, registrado_por:profesionales!registrado_por_id(nombre, apellidos)'

const fechaHora = (iso: string) =>
  new Date(iso).toLocaleString('es-ES', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })

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
      const campos = await cargarCamposIniciales(ingresoId, plantilla)
      const { data, error } = await supabase
        .from('informes_puntuales')
        .insert({ ingreso_id: ingresoId, plantilla, campos, registrado_por_id: profesional.id })
        .select(SELECT_INFORME)
        .single()
      if (error || !data) { setErrorCrear('No se pudo crear el informe: ' + (error?.message ?? 'sin respuesta')); return }
      setEligiendo(false)
      setAbierto(data as unknown as InformePuntual)
    } catch (e) {
      setErrorCrear('No se pudo crear el informe: ' + (e instanceof Error ? e.message : String(e)))
    } finally {
      setCreando(false)
    }
  }

  if (abierto) {
    return (
      <EditorInforme
        key={abierto.id}
        informe={abierto}
        ingreso={ingreso}
        esMedico={esMedico}
        onVolver={() => { setAbierto(null); cargar() }}
      />
    )
  }

  if (eligiendo) {
    return (
      <div className="max-w-3xl space-y-4">
        <button onClick={() => setEligiendo(false)} className="text-sm text-slate-500 hover:text-slate-700 flex items-center gap-1">
          <ArrowLeft className="w-4 h-4" /> Volver a la lista
        </button>
        <h2 className="text-base font-bold text-slate-800">Nuevo informe</h2>
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
            </button>
          ))}
        </div>
        {creando && <p className="text-sm text-slate-400">Creando el informe…</p>}
      </div>
    )
  }

  return (
    <div className="max-w-3xl space-y-4">
      <div className="flex items-start justify-between gap-4">
        <h2 className="text-base font-bold text-slate-800">Otros informes</h2>
        {esMedico && (
          <button onClick={() => { setErrorCrear(''); setEligiendo(true) }} className="btn-primary shrink-0">
            <Plus className="w-4 h-4" /> Nuevo informe
          </button>
        )}
      </div>

      {!esMedico && (
        <div className="flex items-center gap-2 text-sm text-amber-700 bg-amber-50 border border-amber-100 rounded-lg px-3 py-2">
          <Lock className="w-4 h-4 shrink-0" />
          Solo lectura: solo un médico puede redactar informes.
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
          No hay informes.
        </div>
      )}

      <div className="space-y-2">
        {lista.map((inf) => (
          <button
            key={inf.id}
            onClick={() => setAbierto(inf)}
            className="card w-full p-4 text-left hover:border-primary-300 transition-colors"
          >
            <p className="font-semibold text-slate-800">{PLANTILLA_LABEL[inf.plantilla] ?? inf.plantilla}</p>
            <p className="text-xs text-slate-500 mt-1">
              {fechaHora(inf.created_at)}
              {inf.registrado_por ? ` · ${inf.registrado_por.nombre} ${inf.registrado_por.apellidos}` : ''}
            </p>
          </button>
        ))}
      </div>
    </div>
  )
}

// ═════════════════════════════════════════════════════════════
// Editor de un informe: campos fijos, guardado automático, Word
// ═════════════════════════════════════════════════════════════

type EstadoGuardado = 'inactivo' | 'pendiente' | 'guardando' | 'guardado' | 'error' | 'conflicto'

// Un recuadro por grupo; un campo sin grupo es su propio recuadro.
function bloquesDe(campos: CampoInforme[]): { titulo: string; campos: CampoInforme[]; conEtiqueta: boolean }[] {
  const bloques: { titulo: string; campos: CampoInforme[]; conEtiqueta: boolean }[] = []
  for (const c of campos) {
    const ultimo = bloques[bloques.length - 1]
    if (c.grupo && ultimo && ultimo.conEtiqueta && ultimo.titulo === c.grupo) ultimo.campos.push(c)
    else bloques.push({ titulo: c.grupo ?? c.label, campos: [c], conEtiqueta: !!c.grupo })
  }
  return bloques
}

function EditorInforme({
  informe, ingreso, esMedico, onVolver,
}: {
  informe: InformePuntual
  ingreso: Ingreso
  esMedico: boolean
  onVolver: () => void
}) {
  const plantilla = plantillaPorId(informe.plantilla)
  const [campos, setCampos] = useState<Record<string, string>>(informe.campos ?? {})
  const [estado, setEstado] = useState<EstadoGuardado>('inactivo')
  const [errorGuardado, setErrorGuardado] = useState('')
  const [errorAccion, setErrorAccion] = useState('')
  const [abiertos, setAbiertos] = useState<Set<string>>(new Set())
  const alternar = (titulo: string) =>
    setAbiertos((a) => { const n = new Set(a); if (n.has(titulo)) n.delete(titulo); else n.add(titulo); return n })

  // Estado vivo para el guardado (los temporizadores no ven el estado de React de su render).
  const vivo = useRef(campos)
  useEffect(() => { vivo.current = campos })
  const versionRef = useRef(informe.version)
  const sucioRef = useRef(false)
  const conflictoRef = useRef(false)
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const cadenaRef = useRef<Promise<boolean>>(Promise.resolve(true))

  function cambiar(key: string, valor: string) {
    if (!esMedico || conflictoRef.current) return
    setCampos((c) => ({ ...c, [key]: valor.slice(0, MAX_TEXTO) }))
    sucioRef.current = true
    setEstado('pendiente')
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
    setEstado('guardando')
    const { data, error } = await supabase
      .from('informes_puntuales')
      .update({ campos: vivo.current })
      .eq('id', informe.id)
      .eq('version', versionRef.current)
      .select('version')
      .maybeSingle()
    if (error) { sucioRef.current = true; setErrorGuardado(error.message); setEstado('error'); return false }
    if (!data) { conflictoRef.current = true; setEstado('conflicto'); return false }
    versionRef.current = data.version
    if (!sucioRef.current) {
      setEstado('guardado')
      setTimeout(() => setEstado((e) => (e === 'guardado' ? 'inactivo' : e)), 2500)
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
    setCampos(d.campos ?? {})
    setEstado('inactivo')
  }

  async function guardarAhora() {
    const ok = await guardar()
    if (ok) {
      setEstado('guardado')
      setTimeout(() => setEstado((e) => (e === 'guardado' ? 'inactivo' : e)), 2500)
    }
  }

  async function volver() {
    if (esMedico) {
      const ok = await guardar()
      if (!ok) { setErrorAccion('No se ha podido guardar; revisa el aviso.'); return }
    }
    onVolver()
  }

  async function exportar() {
    if (esMedico) {
      const ok = await guardar()
      if (!ok) return
    }
    await exportarInformePuntual(ingreso, { ...informe, campos: vivo.current })
  }

  async function eliminar() {
    if (!window.confirm('¿Eliminar este informe? No se puede deshacer.')) return
    setErrorAccion('')
    if (debounceRef.current) clearTimeout(debounceRef.current)
    sucioRef.current = false
    const { data, error } = await supabase.from('informes_puntuales').delete().eq('id', informe.id).select('id')
    if (error || !data || data.length === 0) {
      setErrorAccion('No se pudo eliminar el informe' + (error ? ': ' + error.message : '.'))
      return
    }
    onVolver()
  }

  return (
    <div className="max-w-3xl space-y-6">
      <div className="flex items-center justify-between gap-3">
        <button onClick={volver} className="text-sm text-slate-500 hover:text-slate-700 flex items-center gap-1">
          <ArrowLeft className="w-4 h-4" /> Volver a la lista
        </button>
        <div className="text-xs text-slate-400 flex items-center gap-1">
          {estado === 'pendiente' && <><span className="w-1.5 h-1.5 rounded-full bg-slate-400 inline-block" /> Cambios pendientes</>}
          {estado === 'guardando' && <><span className="w-1.5 h-1.5 rounded-full bg-amber-400 animate-pulse inline-block" /> Guardando…</>}
          {estado === 'guardado' && <><span className="w-1.5 h-1.5 rounded-full bg-emerald-500 inline-block" /> Guardado</>}
          {estado === 'error' && <span className="text-red-600 font-semibold">Error al guardar — {errorGuardado || 'comprueba la conexión'}</span>}
        </div>
      </div>

      <h2 className="text-base font-bold text-slate-800">{plantilla.titulo}</h2>

      {estado === 'conflicto' && (
        <div className="bg-amber-50 border border-amber-200 text-amber-800 text-sm rounded-lg px-4 py-3 flex items-center justify-between gap-3">
          <span>Alguien más ha guardado este informe. Lo que has escrito sigue aquí, sin guardar.</span>
          <button onClick={recargarTrasConflicto} className="btn-secondary text-xs shrink-0">Ver la versión más reciente</button>
        </div>
      )}
      {!esMedico && (
        <div className="flex items-center gap-2 text-sm text-amber-700 bg-amber-50 border border-amber-100 rounded-lg px-3 py-2">
          <Lock className="w-4 h-4 shrink-0" />
          Solo lectura: solo un médico puede editar.
        </div>
      )}

      {bloquesDe(plantilla.campos).map((b) => {
        // Los grupos del informe de ingreso van plegados; los campos nuevos, abiertos.
        const plegable = b.conEtiqueta
        const abierto = !plegable || abiertos.has(b.titulo)
        return (
          <div key={b.titulo} className="card p-6 space-y-4">
            {plegable ? (
              <button
                type="button"
                onClick={() => alternar(b.titulo)}
                className="section-title mb-0 w-full flex items-center gap-1.5 text-left"
                aria-expanded={abierto}
              >
                {abierto ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronRight className="w-3.5 h-3.5" />}
                {b.titulo}
              </button>
            ) : (
              <p className="section-title">{b.titulo}</p>
            )}
            {abierto && b.campos.map((c) => (
              <div key={c.key}>
                {b.conEtiqueta && <span className="label">{c.label}</span>}
                <AutoTextarea disabled={!esMedico} value={campos[c.key] ?? ''} onChange={(v) => cambiar(c.key, v)} />
                {c.ayuda && <p className="text-xs text-amber-700 mt-1">{c.ayuda}</p>}
              </div>
            ))}
          </div>
        )
      })}

      {errorAccion && <p className="text-sm text-red-600 bg-red-50 border border-red-100 rounded-lg px-3 py-2">{errorAccion}</p>}

      <div className="flex flex-wrap justify-end gap-3">
        {esMedico && (
          <button type="button" onClick={eliminar} className="btn-secondary text-red-600">
            <Trash2 className="w-4 h-4" /> Eliminar informe
          </button>
        )}
        <button type="button" onClick={exportar} className="btn-secondary">
          <Download className="w-4 h-4" /> Exportar Word
        </button>
        {esMedico && (
          <button type="button" onClick={guardarAhora} className="btn-primary">Guardar ahora</button>
        )}
      </div>
    </div>
  )
}
