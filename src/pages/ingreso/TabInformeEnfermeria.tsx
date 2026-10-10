// Informe de enfermería (continuidad de cuidados): un único informe por
// ingreso. Lo escribe solo enfermería; el resto lo lee y lo exporta a Word.
// Guardado automático con control de versiones, como los demás informes.
// El informe se crea al guardar por primera vez (no existe antes).

import { useEffect, useRef, useState } from 'react'
import { Cargando } from '../../components/Cargando'
import { Download, Lock } from 'lucide-react'
import { supabase } from '../../lib/supabase'
import { AvisoGuardado } from '../../components/AvisoGuardado'
import { useAuth } from '../../lib/AuthContext'
import { exportarInformeEnfermeria } from '../../lib/exportWord'
import type { Ingreso } from '../../types'
import { GRUPOS_ENFERMERIA, MAX_TEXTO_ENFERMERIA } from '../informes/enfermeria'
import type { InformeEnfermeria } from '../informes/enfermeria'
import { AutoTextarea } from './AutoTextarea'

const SELECT_INFORME = '*, elaborado_por:profesionales!elaborado_por_id(nombre, apellidos)'

type EstadoGuardado = 'inactivo' | 'pendiente' | 'guardando' | 'guardado' | 'error' | 'conflicto'

const fechaHora = (iso: string) =>
  new Date(iso).toLocaleString('es-ES', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })

export function TabInformeEnfermeria({ ingresoId, ingreso }: { ingresoId: string; ingreso: Ingreso }) {
  const { esEnfermeria, profesional } = useAuth()
  const puedeEditar = esEnfermeria

  const [cargando, setCargando] = useState(true)
  const [errorCarga, setErrorCarga] = useState('')
  const [informe, setInforme] = useState<InformeEnfermeria | null>(null)
  const [campos, setCampos] = useState<Record<string, string>>({})
  const [estado, setEstado] = useState<EstadoGuardado>('inactivo')
  const [errorGuardado, setErrorGuardado] = useState('')
  const [errorAccion, setErrorAccion] = useState('')

  // Estado vivo para el guardado (los temporizadores no ven el estado de React de su render).
  const vivo = useRef(campos)
  useEffect(() => { vivo.current = campos })
  const idRef = useRef<string | null>(null)
  const versionRef = useRef(0)
  const sucioRef = useRef(false)
  const conflictoRef = useRef(false)
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const cadenaRef = useRef<Promise<boolean>>(Promise.resolve(true))

  function aplicar(d: InformeEnfermeria | null) {
    idRef.current = d?.id ?? null
    versionRef.current = d?.version ?? 0
    setInforme(d)
    setCampos(d?.campos ?? {})
  }

  async function cargar() {
    setCargando(true)
    setErrorCarga('')
    const { data, error } = await supabase
      .from('informe_enfermeria')
      .select(SELECT_INFORME)
      .eq('ingreso_id', ingresoId)
      .maybeSingle()
    if (error) { setErrorCarga('No se pudo cargar el informe: ' + error.message); setCargando(false); return }
    aplicar((data as unknown as InformeEnfermeria) ?? null)
    setCargando(false)
  }

  useEffect(() => {
    conflictoRef.current = false
    sucioRef.current = false
    cargar()
    // Al salir de la pestaña o cambiar de paciente, lo pendiente se guarda
    // en vez de perderse.
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current)
      if (sucioRef.current) void guardar()
    }
  }, [ingresoId]) // eslint-disable-line react-hooks/exhaustive-deps

  function cambiar(key: string, valor: string) {
    if (!puedeEditar || conflictoRef.current) return
    setCampos((c) => ({ ...c, [key]: valor.slice(0, MAX_TEXTO_ENFERMERIA) }))
    sucioRef.current = true
    setEstado('pendiente')
    if (debounceRef.current) clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(() => { guardar() }, 1500)
  }

  // Los guardados se encadenan: cada uno usa la versión que dejó el anterior,
  // así dos guardados seguidos de la misma persona nunca se confunden con un
  // conflicto con otra.
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

    if (!idRef.current) {
      // Primer guardado: se crea el informe. Si otra persona lo ha creado
      // justo antes (ingreso_id es único), se avisa como un conflicto.
      const { data, error } = await supabase
        .from('informe_enfermeria')
        .insert({ ingreso_id: ingresoId, campos: vivo.current })
        .select(SELECT_INFORME)
        .single()
      if (error) {
        if (error.code === '23505') { conflictoRef.current = true; setEstado('conflicto'); return false }
        sucioRef.current = true
        setErrorGuardado(error.message)
        setEstado('error')
        return false
      }
      const d = data as unknown as InformeEnfermeria
      idRef.current = d.id
      versionRef.current = d.version
      setInforme(d)
    } else {
      const { data, error } = await supabase
        .from('informe_enfermeria')
        .update({ campos: vivo.current })
        .eq('id', idRef.current)
        .eq('version', versionRef.current)
        .select(SELECT_INFORME)
        .maybeSingle()
      if (error) { sucioRef.current = true; setErrorGuardado(error.message); setEstado('error'); return false }
      if (!data) { conflictoRef.current = true; setEstado('conflicto'); return false }
      const d = data as unknown as InformeEnfermeria
      versionRef.current = d.version
      setInforme(d)
    }
    if (!sucioRef.current) {
      setEstado('guardado')
      setTimeout(() => setEstado((e) => (e === 'guardado' ? 'inactivo' : e)), 2500)
    }
    return true
  }

  async function recargarTrasConflicto() {
    conflictoRef.current = false
    sucioRef.current = false
    setEstado('inactivo')
    await cargar()
  }

  async function guardarAhora() {
    const ok = await guardar()
    if (ok) {
      setEstado('guardado')
      setTimeout(() => setEstado((e) => (e === 'guardado' ? 'inactivo' : e)), 2500)
    }
  }

  async function exportar() {
    setErrorAccion('')
    if (puedeEditar) {
      const ok = await guardar()
      if (!ok) { setErrorAccion('No se ha podido guardar; revisa el aviso.'); return }
    }
    try {
      // Firma quien guardó por última vez; si aún no hay informe guardado,
      // quien lo exporta (si es de enfermería).
      const firmante = informe?.elaborado_por ?? (puedeEditar && profesional ? { nombre: profesional.nombre, apellidos: profesional.apellidos } : null)
      await exportarInformeEnfermeria(ingreso, vivo.current, firmante)
    } catch (e) {
      setErrorAccion('No se pudo exportar: ' + (e instanceof Error ? e.message : String(e)))
    }
  }

  if (cargando) return <Cargando />
  if (errorCarga) {
    return (
      <div className="card p-4 text-sm max-w-3xl">
        <p className="text-red-600">{errorCarga}</p>
        <button onClick={cargar} className="btn-secondary text-xs mt-2">Reintentar</button>
      </div>
    )
  }

  return (
    <div className="max-w-3xl space-y-6">
      <AvisoGuardado avisos={[{ estado, etiqueta: 'Informe', error: errorGuardado }]} />
      <div className="flex items-start justify-between gap-4">
        <div>
          <h2 className="text-base font-bold text-slate-800">Informe de enfermería</h2>
          <p className="text-sm text-slate-500">Continuidad de cuidados: lo que necesita el paciente al alta o al traslado.</p>
        </div>
        <div className="text-xs text-slate-500 flex items-center gap-1 shrink-0 pt-1">
          {estado === 'pendiente' && <><span className="w-1.5 h-1.5 rounded-full bg-slate-400 inline-block" /> Cambios pendientes</>}
          {estado === 'guardando' && <><span className="w-1.5 h-1.5 rounded-full bg-amber-400 animate-pulse inline-block" /> Guardando…</>}
          {estado === 'guardado' && <><span className="w-1.5 h-1.5 rounded-full bg-emerald-500 inline-block" /> Guardado</>}
          {estado === 'error' && <span className="text-red-600 font-semibold">Error al guardar — {errorGuardado || 'comprueba la conexión'}</span>}
        </div>
      </div>

      {estado === 'conflicto' && (
        <div className="bg-amber-50 border border-amber-200 text-amber-800 text-sm rounded-lg px-4 py-3 flex items-center justify-between gap-3">
          <span>Alguien más ha guardado este informe. Lo que has escrito sigue aquí, sin guardar.</span>
          <button onClick={recargarTrasConflicto} className="btn-secondary text-xs shrink-0">Ver la versión más reciente</button>
        </div>
      )}
      {!puedeEditar && (
        <div className="flex items-center gap-2 text-sm text-amber-700 bg-amber-50 border border-amber-100 rounded-lg px-3 py-2">
          <Lock className="w-4 h-4 shrink-0" />
          Solo lectura: solo enfermería (o un administrador) puede editar este informe.
        </div>
      )}

      {GRUPOS_ENFERMERIA.map((g) => (
        <div key={g.titulo} className="card p-6 space-y-4">
          <p className="section-title">{g.titulo}</p>
          {g.campos.map((c) => {
            const valor = campos[c.key] ?? ''
            return (
              <label key={c.key} className="block">
                <span className="label">{c.label}</span>
                {puedeEditar && c.atajos && !valor.trim() && (
                  <span className="flex flex-wrap gap-1.5 mb-1.5">
                    {c.atajos.map((a) => (
                      <button
                        key={a}
                        type="button"
                        onClick={() => cambiar(c.key, a)}
                        className="text-xs px-2 py-0.5 rounded-full border border-slate-200 text-slate-600 hover:bg-primary-50 hover:border-primary-200 hover:text-primary-700"
                      >
                        {a.replace(/\.$/, '')}
                      </button>
                    ))}
                  </span>
                )}
                <AutoTextarea disabled={!puedeEditar} filas={c.filas} value={valor} onChange={(v) => cambiar(c.key, v)} />
              </label>
            )
          })}
        </div>
      ))}

      {informe && (
        <p className="text-xs text-slate-500">
          Última edición: {fechaHora(informe.updated_at)}
          {informe.elaborado_por ? ` · ${informe.elaborado_por.nombre} ${informe.elaborado_por.apellidos} (firma el informe)` : ''}
        </p>
      )}

      {errorAccion && <p className="text-sm text-red-600 bg-red-50 border border-red-100 rounded-lg px-3 py-2">{errorAccion}</p>}

      <div className="flex flex-wrap justify-end gap-3">
        <button type="button" onClick={exportar} className="btn-secondary">
          <Download className="w-4 h-4" /> Exportar Word
        </button>
        {puedeEditar && (
          <button type="button" onClick={guardarAhora} className="btn-primary">Guardar ahora</button>
        )}
      </div>
    </div>
  )
}
