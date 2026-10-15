// Diagnósticos codificados (CIE-10-ES): el buscador de códigos, la fila de un diagnóstico
// y el bloque que se usa en el informe de alta. Los códigos se guardan SIEMPRE en el
// CMBD (un único sitio): lo que se escribe aquí es lo que ve la pestaña CMBD y lo que
// se exporta, sin teclearlo dos veces.

import { useEffect, useRef, useState } from 'react'
import { AlertTriangle, Plus } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../lib/AuthContext'
import { encadenar } from '../lib/colaGuardado'
import { avisoCodigoCIE10, buscarCIE10, cargarCatalogoCIE10, infoCIE10, normalizarCodigo, useCatalogoCIE10 } from '../lib/cie10'
import { IndicadorGuardado } from './IndicadorGuardado'
import { AvisoFicha } from './AvisoFicha'

// ─── Buscador de códigos ─────────────────────────────────────

export function BuscadorCIE({ value, onChange, disabled, principal }: {
  value: string
  onChange: (code: string, desc: string) => void
  disabled?: boolean
  principal?: boolean   // es el diagnóstico principal: se señalan los códigos que no pueden serlo
}) {
  const [q, setQ] = useState(value)
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)
  // Al hacer clic en una sugerencia, el input pierde el foco antes de que el clic termine de
  // procesarse; sin esta bandera, el aviso retrasado de blur sobrescribía la selección buena
  // con el texto antiguo que se había tecleado.
  const seleccionadaRef = useRef(false)

  useEffect(() => { setQ(value) }, [value])

  const cargado = useCatalogoCIE10(false)   // solo para repintar cuando termine de cargar el catálogo
  const resultados = q.trim().length >= 1 ? buscarCIE10(q, 10) : []

  useEffect(() => {
    function click(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', click)
    return () => document.removeEventListener('mousedown', click)
  }, [])

  return (
    <div ref={ref} className="relative">
      <input className="input text-sm" placeholder="Código o nombre (p. ej. G30.1, alzheimer, depresión…)"
        value={q}
        disabled={disabled}
        onChange={e => { setQ(e.target.value); setOpen(true) }}
        onFocus={() => {
          // Al usar el buscador se descarga (una vez) el catálogo completo de la CIE-10-ES.
          cargarCatalogoCIE10().catch(() => { /* se sigue con los códigos frecuentes */ })
          if (resultados.length > 0) setOpen(true)
        }}
        onBlur={() => {
          // Confirma el texto al perder el foco, aunque no se haya hecho clic en una sugerencia:
          // si coincide con un código conocido, completa su descripción.
          setTimeout(async () => {
            setOpen(false)
            if (seleccionadaRef.current) { seleccionadaRef.current = false; return }
            const texto = q.trim()
            if (!texto) { onChange('', ''); return }
            let info = infoCIE10(texto)
            if (!info) {
              // un código que no es de los frecuentes: espera al catálogo para poder completar su descripción
              await cargarCatalogoCIE10().catch(() => {})
              info = infoCIE10(texto)
            }
            const codigo = info ? info.code : normalizarCodigo(texto)
            if (codigo === value) { setQ(value); return }
            onChange(codigo, info?.desc ?? '')
          }, 150) // margen para que un clic en una sugerencia se procese primero
        }}
      />
      {open && resultados.length > 0 && (
        <div className="absolute top-full left-0 right-0 mt-1 bg-white border rounded-xl shadow-lg z-30 overflow-hidden max-h-72 overflow-y-auto">
          {resultados.map(r => {
            const noPrincipal = principal && (r.marcas?.includes('M') || r.marcas?.includes('N'))
            return (
              <button type="button" key={r.code}
                className={`w-full text-left px-3 py-2 text-xs hover:bg-slate-50 border-b last:border-0 flex gap-3 ${noPrincipal ? 'opacity-60' : ''}`}
                onMouseDown={() => { seleccionadaRef.current = true }}
                onClick={() => { onChange(r.code, r.desc); setQ(r.code); setOpen(false) }}>
                <span className="font-mono font-bold text-primary-700 shrink-0 w-20">{r.code}</span>
                <span className="text-slate-600">
                  {r.desc}
                  {noPrincipal && <span className="ml-2 text-amber-700 font-medium">· no puede ser principal</span>}
                </span>
              </button>
            )
          })}
          {!cargado && (
            <p className="px-3 py-1.5 text-[0.7rem] text-slate-500 bg-slate-50">Cargando el catálogo completo de la CIE-10-ES…</p>
          )}
        </div>
      )}
    </div>
  )
}

// ─── Fila de un diagnóstico ──────────────────────────────────

export function FilaDx({ label, codigo, desc, poad, onCodigoYDesc, onDesc, onPoad, required, disabled, principal }: {
  label: string; codigo: string; desc: string; poad: boolean | null
  onCodigoYDesc: (codigo: string, desc: string) => void; onDesc: (v: string) => void
  onPoad: (v: boolean) => void; required?: boolean; disabled?: boolean; principal?: boolean
}) {
  // Un código que no es de los frecuentes necesita el catálogo completo para poder validarse.
  useCatalogoCIE10(!!codigo && !infoCIE10(codigo))
  const aviso = avisoCodigoCIE10(codigo, { principal })
  const exento = !!codigo && !!infoCIE10(codigo)?.marcas?.includes('E')
  return (
    <div className="grid grid-cols-[9rem_1fr_auto] gap-3 items-start">
      <span className="text-xs text-slate-500 pt-2.5 shrink-0">
        {label}{required && <span className="text-red-400 ml-0.5">*</span>}
      </span>
      <div className="space-y-1.5">
        <BuscadorCIE value={codigo} onChange={(c, d) => onCodigoYDesc(c, d)} disabled={disabled} principal={principal} />
        {(codigo || desc) && (
          <input className="input text-xs text-slate-500" placeholder="Descripción" disabled={disabled}
            value={desc} onChange={e => onDesc(e.target.value)} />
        )}
        {aviso && (
          <p className="flex items-start gap-1.5 text-xs text-amber-700">
            <AlertTriangle className="w-3.5 h-3.5 shrink-0 mt-0.5" />{aviso}
          </p>
        )}
      </div>
      {/* POAD (presente al ingreso) — solo si hay código.
          Tres estados: sin contestar («¿?», en ámbar), SÍ y NO. Antes, sin contestar se veía y se
          exportaba como «NO», es decir, «no estaba al ingreso, se adquirió en el hospital». Los
          códigos exentos de POAD no necesitan respuesta y conservan el botón de dos estados. */}
      <div className="pt-2 shrink-0">
        {codigo && (
          <div className="flex flex-col items-center gap-0.5">
            <span className="text-xs text-slate-500 leading-none">Al ingreso</span>
            {(() => {
              const sinContestar = poad == null && !exento
              return (
                <button type="button" disabled={disabled}
                  onClick={() => onPoad(!(poad === true))}
                  title={sinContestar ? 'Sin contestar: indica si este diagnóstico ya estaba presente al ingreso' : undefined}
                  className={`w-12 h-6 rounded-full text-xs font-bold transition-colors ${
                    poad === true ? 'bg-emerald-500 text-white'
                    : sinContestar ? 'bg-amber-100 text-amber-700 ring-1 ring-amber-300'
                    : 'bg-slate-200 text-slate-500'
                  }`}>
                  {poad === true ? 'SÍ' : sinContestar ? '¿?' : 'NO'}
                </button>
              )
            })()}
            {exento && <span className="text-[0.65rem] text-slate-500 leading-none" title="Este código está exento de indicar POAD según la tabla oficial">Exento</span>}
          </div>
        )}
      </div>
    </div>
  )
}

// ─── Bloque para el informe de alta ──────────────────────────

const N_SECUNDARIOS = 8
type Estado = 'inactivo' | 'pendiente' | 'guardando' | 'guardado' | 'error' | 'conflicto'

// Solo los campos de diagnóstico del CMBD; el resto de la fila se queda como esté.
const CAMPOS_DX: string[] = [
  'diagnostico_principal', 'diagnostico_principal_desc', 'diagnostico_principal_poad',
  ...Array.from({ length: N_SECUNDARIOS }, (_, i) => i + 1).flatMap((n) => [
    `diagnostico_secundario_${n}`, `diagnostico_secundario_${n}_desc`, `diagnostico_secundario_${n}_poad`,
  ]),
]
type FilaCmbd = Record<string, any> & { id?: string; version?: number }

function soloDx(d: FilaCmbd): Record<string, any> {
  const out: Record<string, any> = {}
  for (const k of CAMPOS_DX) if (k in d) out[k] = d[k] === '' ? null : d[k]
  return out
}

export function BloqueDiagnosticosCMBD({ ingresoId }: { ingresoId: string }) {
  const { esMedico } = useAuth()
  const soloLectura = !esMedico
  const [data, setData] = useState<FilaCmbd>({})
  const [cargado, setCargado] = useState(false)
  const [estado, setEstado] = useState<Estado>('inactivo')
  const [extra, setExtra] = useState(1)   // cuántos secundarios se muestran
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const dataRef = useRef(data)
  dataRef.current = data
  const seqRef = useRef(0)
  // Guardados en cola + id y versión que dejó el último guardado propio (null = los que trae la carga).
  const cadenaRef = useRef<Promise<boolean>>(Promise.resolve(true))
  const guardadaRef = useRef<{ id: string; version: number } | null>(null)

  function secundariosConDatos(d: FilaCmbd): number {
    let max = 0
    for (let n = 1; n <= N_SECUNDARIOS; n++) if (d[`diagnostico_secundario_${n}`]) max = n
    return max
  }

  useEffect(() => {
    supabase.from('cmbd').select('*').eq('ingreso_id', ingresoId).maybeSingle().then(({ data: d }) => {
      guardadaRef.current = null
      if (d) { setData(d as FilaCmbd); setExtra(Math.max(1, secundariosConDatos(d as FilaCmbd))) }
      setCargado(true)
    })
  }, [ingresoId])

  // Cuenta las ediciones: un guardado solo da «Guardado» si no se ha tecleado nada desde que empezó.
  const editRevRef = useRef(0)
  function marcarGuardado(rev: number) {
    if (editRevRef.current !== rev) return // hay cambios nuevos pendientes
    setEstado('guardado')
    setTimeout(() => setEstado((e) => (e === 'guardado' ? 'inactivo' : e)), 2500)
  }

  function save(d: FilaCmbd = dataRef.current): Promise<boolean> {
    const mi = ++seqRef.current
    const rev = editRevRef.current
    setEstado('guardando')
    return encadenar(cadenaRef, () => ejecutarGuardado(d, mi, rev))
  }

  async function ejecutarGuardado(d: FilaCmbd, mi: number, rev: number): Promise<boolean> {
    // Id y versión que dejó el guardado anterior (si lo hubo), no los que llevaba el formulario al teclear.
    const conocida = guardadaRef.current
    const id = conocida?.id ?? d.id
    const version = conocida?.version ?? d.version ?? 1
    if (!id) {
      // Todavía no hay fila de CMBD: se crea (con el servicio habitual de la unidad).
      const { data: creado, error } = await supabase
        .from('cmbd').insert({ ingreso_id: ingresoId, servicio: 'GRT', ...soloDx(d) }).select().maybeSingle()
      if (creado) guardadaRef.current = { id: creado.id, version: creado.version }
      if (mi !== seqRef.current) return true
      if (error) {
        if (error.code === '23505') { await recargar(); setEstado('conflicto'); return false }
        setEstado('error'); return false
      }
      // Solo id y versión: lo que se haya tecleado mientras se guardaba no se pisa.
      if (creado) setData((prev) => ({ ...prev, id: creado.id, version: creado.version }) as FilaCmbd)
    } else {
      const { data: guardado, error } = await supabase
        .from('cmbd').update(soloDx(d)).eq('ingreso_id', ingresoId).eq('version', version).select().maybeSingle()
      if (guardado) guardadaRef.current = { id: guardado.id, version: guardado.version }
      if (mi !== seqRef.current) return true
      if (error) { setEstado('error'); return false }
      if (!guardado) { setEstado('conflicto'); return false }
      setData((prev) => ({ ...prev, id: guardado.id, version: guardado.version }) as FilaCmbd)
    }
    marcarGuardado(rev)
    return true
  }

  async function recargar() {
    if (debounceRef.current) { clearTimeout(debounceRef.current); debounceRef.current = null }
    const { data: d } = await supabase.from('cmbd').select('*').eq('ingreso_id', ingresoId).maybeSingle()
    guardadaRef.current = null
    if (d) { setData(d as FilaCmbd); setExtra((x) => Math.max(x, secundariosConDatos(d as FilaCmbd))) }
    setEstado('inactivo')
  }

  // Cambios de varios campos a la vez (código y descripción), en una sola actualización.
  function cambiar(cambios: Record<string, any>) {
    if (soloLectura || estado === 'conflicto') return
    const next = { ...dataRef.current, ...cambios }
    setData(next)
    editRevRef.current++
    setEstado('pendiente')
    if (debounceRef.current) clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(() => save(next), 1500)
  }

  const clave = (n: number) => (n === 0 ? 'diagnostico_principal' : `diagnostico_secundario_${n}`)

  function fila(n: number, label: string, required = false) {
    const k = clave(n)
    return (
      <FilaDx key={k} label={label} required={required} disabled={soloLectura} principal={n === 0}
        codigo={data[k] ?? ''} desc={data[`${k}_desc`] ?? ''} poad={data[`${k}_poad`] ?? null}
        onCodigoYDesc={(c, d) => cambiar({ [k]: c, [`${k}_desc`]: d })}
        onDesc={(v) => cambiar({ [`${k}_desc`]: v })}
        onPoad={(v) => cambiar({ [`${k}_poad`]: v })}
      />
    )
  }

  if (!cargado) return null
  return (
    <div className="pt-4 mt-2 border-t space-y-3">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-sm font-semibold text-slate-700">Códigos CIE-10-ES</p>
          <p className="text-xs text-slate-500">
            Se guardan en el CMBD: se escriben una vez y valen para el CMBD y el dashboard. El texto de arriba sigue siendo libre.
          </p>
        </div>
        <IndicadorGuardado estado={estado} className="shrink-0" />
      </div>

      {estado === 'conflicto' && (
        <AvisoFicha tono="atencion" accion={
          <button onClick={recargar} className="btn-secondary btn-sm shrink-0">Ver la versión más reciente</button>
        }>
          Alguien más ha guardado cambios en el CMBD mientras lo editabas. Lo que has escrito sigue aquí, sin guardar.
        </AvisoFicha>
      )}

      {fila(0, 'Principal', true)}
      {Array.from({ length: extra }, (_, i) => fila(i + 1, `Secundario ${i + 1}`))}
      {!soloLectura && extra < N_SECUNDARIOS && (
        <button type="button" onClick={() => setExtra(extra + 1)}
          className="flex items-center gap-1.5 text-xs font-medium text-primary-700 hover:underline">
          <Plus className="w-3.5 h-3.5" />Añadir diagnóstico secundario
        </button>
      )}
    </div>
  )
}
