// Diagnósticos codificados (CIE-10-ES): el buscador de códigos, la fila de un diagnóstico
// y el bloque que se usa en el informe de alta. Los códigos se guardan SIEMPRE en el
// CMBD (un único sitio): lo que se escribe aquí es lo que ve la pestaña CMBD y lo que
// se exporta, sin teclearlo dos veces.

import { useEffect, useRef, useState } from 'react'
import { AlertTriangle, Plus } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../lib/AuthContext'
import { avisoCodigoCIE10, buscarCIE10, descripcionCIE10 } from '../lib/cie10'

// ─── Buscador de códigos ─────────────────────────────────────

export function BuscadorCIE({ value, onChange, disabled }: {
  value: string
  onChange: (code: string, desc: string) => void
  disabled?: boolean
}) {
  const [q, setQ] = useState(value)
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)
  // Al hacer clic en una sugerencia, el input pierde el foco antes de que el clic termine de
  // procesarse; sin esta bandera, el aviso retrasado de blur sobrescribía la selección buena
  // con el texto antiguo que se había tecleado.
  const seleccionadaRef = useRef(false)

  useEffect(() => { setQ(value) }, [value])

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
        onFocus={() => resultados.length > 0 && setOpen(true)}
        onBlur={() => {
          // Confirma el texto al perder el foco, aunque no se haya hecho clic en una sugerencia:
          // si coincide con un código conocido, completa su descripción.
          setTimeout(() => {
            setOpen(false)
            if (seleccionadaRef.current) { seleccionadaRef.current = false; return }
            const texto = q.trim()
            if (!texto) { onChange('', ''); return }
            const desc = descripcionCIE10(texto)
            const codigo = desc ? buscarCIE10(texto, 1)[0]?.code ?? texto : texto
            if (codigo === value) { setQ(value); return }
            onChange(codigo, desc ?? '')
          }, 150) // margen para que un clic en una sugerencia se procese primero
        }}
      />
      {open && resultados.length > 0 && (
        <div className="absolute top-full left-0 right-0 mt-1 bg-white border rounded-xl shadow-lg z-30 overflow-hidden max-h-72 overflow-y-auto">
          {resultados.map(r => (
            <button type="button" key={r.code}
              className="w-full text-left px-3 py-2 text-xs hover:bg-slate-50 border-b last:border-0 flex gap-3"
              onMouseDown={() => { seleccionadaRef.current = true }}
              onClick={() => { onChange(r.code, r.desc); setQ(r.code); setOpen(false) }}>
              <span className="font-mono font-bold text-primary-700 shrink-0 w-20">{r.code}</span>
              <span className="text-slate-600">{r.desc}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

// ─── Fila de un diagnóstico ──────────────────────────────────

export function FilaDx({ label, codigo, desc, poad, onCodigoYDesc, onDesc, onPoad, required, disabled }: {
  label: string; codigo: string; desc: string; poad: boolean | null
  onCodigoYDesc: (codigo: string, desc: string) => void; onDesc: (v: string) => void
  onPoad: (v: boolean) => void; required?: boolean; disabled?: boolean
}) {
  const aviso = avisoCodigoCIE10(codigo)
  return (
    <div className="grid grid-cols-[9rem_1fr_auto] gap-3 items-start">
      <span className="text-xs text-slate-500 pt-2.5 shrink-0">
        {label}{required && <span className="text-red-400 ml-0.5">*</span>}
      </span>
      <div className="space-y-1.5">
        <BuscadorCIE value={codigo} onChange={(c, d) => onCodigoYDesc(c, d)} disabled={disabled} />
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
      {/* POAD (presente al ingreso) — solo si hay código */}
      <div className="pt-2 shrink-0">
        {codigo && (
          <div className="flex flex-col items-center gap-0.5">
            <span className="text-xs text-slate-500 leading-none">Al ingreso</span>
            <button type="button" disabled={disabled}
              onClick={() => onPoad(!(poad === true))}
              className={`w-12 h-6 rounded-full text-xs font-bold transition-colors ${
                poad === true ? 'bg-emerald-500 text-white' : 'bg-slate-200 text-slate-500'
              }`}>
              {poad === true ? 'SÍ' : 'NO'}
            </button>
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
  const { rol } = useAuth()
  const soloLectura = rol !== 'medico'
  const [data, setData] = useState<FilaCmbd>({})
  const [cargado, setCargado] = useState(false)
  const [estado, setEstado] = useState<Estado>('inactivo')
  const [extra, setExtra] = useState(1)   // cuántos secundarios se muestran
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const dataRef = useRef(data)
  dataRef.current = data
  const seqRef = useRef(0)

  function secundariosConDatos(d: FilaCmbd): number {
    let max = 0
    for (let n = 1; n <= N_SECUNDARIOS; n++) if (d[`diagnostico_secundario_${n}`]) max = n
    return max
  }

  useEffect(() => {
    supabase.from('cmbd').select('*').eq('ingreso_id', ingresoId).maybeSingle().then(({ data: d }) => {
      if (d) { setData(d as FilaCmbd); setExtra(Math.max(1, secundariosConDatos(d as FilaCmbd))) }
      setCargado(true)
    })
  }, [ingresoId])

  async function save(d: FilaCmbd = dataRef.current): Promise<void> {
    const mi = ++seqRef.current
    setEstado('guardando')
    if (!d.id) {
      // Todavía no hay fila de CMBD: se crea (con el servicio habitual de la unidad).
      const { data: creado, error } = await supabase
        .from('cmbd').insert({ ingreso_id: ingresoId, servicio: 'GRT', ...soloDx(d) }).select().maybeSingle()
      if (mi !== seqRef.current) return
      if (error) {
        if (error.code === '23505') { await recargar(); setEstado('conflicto'); return }
        setEstado('error'); return
      }
      if (creado) setData(creado as FilaCmbd)
    } else {
      const { data: guardado, error } = await supabase
        .from('cmbd').update(soloDx(d)).eq('ingreso_id', ingresoId).eq('version', d.version ?? 1).select().maybeSingle()
      if (mi !== seqRef.current) return
      if (error) { setEstado('error'); return }
      if (!guardado) { setEstado('conflicto'); return }
      setData(guardado as FilaCmbd)
    }
    setEstado('guardado')
    setTimeout(() => setEstado((e) => (e === 'guardado' ? 'inactivo' : e)), 2500)
  }

  async function recargar() {
    const { data: d } = await supabase.from('cmbd').select('*').eq('ingreso_id', ingresoId).maybeSingle()
    if (d) { setData(d as FilaCmbd); setExtra((x) => Math.max(x, secundariosConDatos(d as FilaCmbd))) }
    setEstado('inactivo')
  }

  // Cambios de varios campos a la vez (código y descripción), en una sola actualización.
  function cambiar(cambios: Record<string, any>) {
    if (soloLectura || estado === 'conflicto') return
    const next = { ...dataRef.current, ...cambios }
    setData(next)
    setEstado('pendiente')
    if (debounceRef.current) clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(() => save(next), 1500)
  }

  const clave = (n: number) => (n === 0 ? 'diagnostico_principal' : `diagnostico_secundario_${n}`)

  function fila(n: number, label: string, required = false) {
    const k = clave(n)
    return (
      <FilaDx key={k} label={label} required={required} disabled={soloLectura}
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
        <span className="text-xs text-slate-500 shrink-0">
          {estado === 'pendiente' && '● Cambios pendientes'}
          {estado === 'guardando' && '● Guardando…'}
          {estado === 'guardado' && <span className="text-emerald-600">✓ Guardado</span>}
          {estado === 'error' && <span className="text-red-600 font-semibold">✗ Error al guardar</span>}
        </span>
      </div>

      {estado === 'conflicto' && (
        <div className="bg-amber-50 border border-amber-200 text-amber-800 text-sm rounded-lg px-4 py-3 flex items-center justify-between gap-3">
          <span>Alguien más ha guardado cambios en el CMBD mientras lo editabas. Lo que has escrito sigue aquí, sin guardar.</span>
          <button onClick={recargar} className="btn-secondary text-xs shrink-0">Ver la versión más reciente</button>
        </div>
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
