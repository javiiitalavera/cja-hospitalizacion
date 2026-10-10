import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { Plus, Trash2 } from 'lucide-react'
import type { FilaMedicacion } from '../../types'
import {
  GRUPOS_PSICO, atcDeFila, buscarFarmacos, clasificarTexto, estadoPsico, farmacoPorAtc, grupoDeFila, grupoPsico, resumirMedicacion,
  textoGrupos, useCatalogoFarmacos, type ResultadoFarmaco,
} from '../../lib/farmacos'

export const TOMAS: { key: keyof FilaMedicacion; label: string }[] = [
  { key: 'desayuno', label: 'Desayuno' },
  { key: 'comida',   label: 'Comida' },
  { key: 'merienda', label: 'Merienda' },
  { key: 'cena',     label: 'Cena' },
  { key: 'acostar',  label: 'Acostar' },
]

export function filaVacia(): FilaMedicacion {
  return { farmaco: '', dosis: '', desayuno: '', comida: '', merienda: '', cena: '', acostar: '', observaciones: '' }
}

// Celda del nombre del fármaco: escribe y elige del catálogo (por principio activo o por marca).
// Al elegir se guarda también su código ATC; si se escribe a mano, al salir se intenta reconocer.
function CeldaFarmaco({ fila, disabled, onCambio }: {
  fila: FilaMedicacion
  disabled?: boolean
  onCambio: (cambio: Partial<FilaMedicacion>) => void
}) {
  useCatalogoFarmacos(true)
  const [abierto, setAbierto] = useState(false)
  const [activo, setActivo] = useState(0)
  const [pos, setPos] = useState<{ top: number; left: number; width: number } | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  // Al pulsar una sugerencia, el input pierde el foco antes de que termine el clic: sin esta marca,
  // el reconocimiento retrasado del blur pisaba la elección.
  const eligiendoRef = useRef(false)

  const resultados: ResultadoFarmaco[] = abierto ? buscarFarmacos(fila.farmaco, 8) : []

  // El desplegable es fijo (la tabla tiene scroll horizontal y lo recortaría).
  useLayoutEffect(() => {
    if (!abierto || !inputRef.current) return
    const r = inputRef.current.getBoundingClientRect()
    setPos({ top: r.bottom + 2, left: r.left, width: Math.max(r.width, 300) })
  }, [abierto, fila.farmaco])
  useEffect(() => {
    if (!abierto) return
    const cerrar = () => setAbierto(false)
    window.addEventListener('scroll', cerrar, true)
    window.addEventListener('resize', cerrar)
    return () => { window.removeEventListener('scroll', cerrar, true); window.removeEventListener('resize', cerrar) }
  }, [abierto])

  function elegir(r: ResultadoFarmaco) {
    onCambio({ farmaco: r.farmaco.nombre, atc: r.farmaco.atc, psico: undefined })
    setAbierto(false)
  }

  const atc = atcDeFila(fila)
  const conocido = atc ? farmacoPorAtc(atc) : null
  // Ficha del fármaco al pasar el ratón: nombre del principio activo y código ATC.
  const ficha = conocido ? `${conocido.nombre} · ATC ${conocido.atc}` : undefined

  return (
    <div title={ficha}>
      <input ref={inputRef} disabled={disabled} autoComplete="off"
        className="w-full bg-transparent px-1 py-0.5 focus:outline-none focus:bg-white focus:ring-1 focus:ring-primary-300 rounded text-slate-800 disabled:text-slate-500"
        value={fila.farmaco} placeholder="Nombre del fármaco o marca…"
        onChange={e => { onCambio({ farmaco: e.target.value, atc: undefined, psico: undefined }); setAbierto(true); setActivo(0) }}
        onFocus={() => setAbierto(true)}
        onKeyDown={e => {
          if (!abierto || resultados.length === 0) return
          if (e.key === 'ArrowDown') { e.preventDefault(); setActivo(a => Math.min(a + 1, resultados.length - 1)) }
          else if (e.key === 'ArrowUp') { e.preventDefault(); setActivo(a => Math.max(a - 1, 0)) }
          else if (e.key === 'Enter') { e.preventDefault(); eligiendoRef.current = true; elegir(resultados[activo] ?? resultados[0]) }
          else if (e.key === 'Escape') setAbierto(false)
        }}
        onBlur={() => {
          setTimeout(() => {
            setAbierto(false)
            if (eligiendoRef.current) { eligiendoRef.current = false; return }
            if (!fila.atc && fila.farmaco.trim()) {
              const reconocido = clasificarTexto(fila.farmaco)
              if (reconocido) onCambio({ atc: reconocido.atc })
            }
          }, 150)
        }} />
      {abierto && pos && resultados.length > 0 && (
        <div className="fixed z-50 bg-white border rounded-xl shadow-lg overflow-hidden max-h-72 overflow-y-auto"
          style={{ top: pos.top, left: pos.left, width: pos.width }}>
          {resultados.map((r, i) => {
            const g = grupoPsico(r.farmaco.atc)
            return (
              <button type="button" key={r.farmaco.atc + r.farmaco.nombre}
                className={`w-full text-left px-3 py-1.5 text-xs border-b last:border-0 flex items-center gap-2 ${i === activo ? 'bg-primary-50' : 'hover:bg-slate-50'}`}
                onMouseDown={() => { eligiendoRef.current = true }}
                onMouseEnter={() => setActivo(i)}
                onClick={() => elegir(r)}>
                <span className="font-medium text-slate-800">{r.farmaco.nombre}</span>
                {r.via && <span className="text-slate-400">({r.via})</span>}
                <span className="ml-auto flex items-center gap-1.5 shrink-0">
                  {g && <span className="px-1.5 py-px rounded-full bg-violet-100 text-violet-800 text-[10px] font-semibold">
                    {GRUPOS_PSICO.find(x => x.clave === g)?.etiqueta}
                  </span>}
                  <span className="font-mono text-[10px] text-slate-400">{r.farmaco.atc}</span>
                </span>
              </button>
            )
          })}
        </div>
      )}
    </div>
  )
}

// Columna «Psicofármaco»: una sola línea por fármaco. Lo normal (omeprazol, adiro…) no muestra nada.
// Solo pregunta en lo de uso mixto (valproato, pregabalina…); lo que no se reconoce no pregunta, pero
// permite marcarlo con un botón.
function CeldaClase({ fila, disabled, onCambio }: {
  fila: FilaMedicacion
  disabled?: boolean
  onCambio: (cambio: Partial<FilaMedicacion>) => void
}) {
  if (!fila.farmaco.trim()) return null
  const estado = estadoPsico(fila)
  const grupo = grupoDeFila(fila)
  const etiqueta = grupo === 'otro' ? 'Psicofármaco' : GRUPOS_PSICO.find(g => g.clave === grupo)?.etiqueta
  const sinAtc = !atcDeFila(fila)
  const quitar = !disabled && fila.psico && (
    <button type="button" title="Quitar la marca" onClick={() => onCambio({ psico: undefined })}
      className="text-slate-400 hover:text-slate-700 leading-none px-0.5">×</button>
  )
  const pill = 'inline-flex items-center gap-1 px-1.5 py-px rounded-full text-[10px] font-semibold whitespace-nowrap'

  if (estado === 'psico') {
    return (
      <span className="inline-flex items-center gap-0.5">
        <span className={`${pill} bg-violet-100 text-violet-800`}
          title={fila.psico === 'si' ? 'Marcado a mano como psicofármaco' : 'Psicofármaco según el catálogo'}>
          {etiqueta}{fila.psico === 'si' ? ' · manual' : ''}
        </span>
        {quitar}
      </span>
    )
  }
  if (fila.psico === 'no') {
    return (
      <span className="inline-flex items-center gap-0.5">
        <span className={`${pill} bg-slate-100 text-slate-500`} title="Marcado a mano: no es psicofármaco">no psicofármaco</span>
        {quitar}
      </span>
    )
  }
  if (estado === 'dudoso') {
    return (
      <span className="inline-flex items-center gap-1 whitespace-nowrap text-[10px]">
        <span className="text-amber-700 font-semibold" title="Se usa tanto como estabilizador del ánimo como para la epilepsia, el dolor…">¿Psicofármaco?</span>
        {!disabled && (
          <>
            <button type="button" onClick={() => onCambio({ psico: 'si' })}
              className="px-1.5 py-px rounded border border-violet-300 text-violet-700 hover:bg-violet-50 font-semibold">Sí</button>
            <button type="button" onClick={() => onCambio({ psico: 'no' })}
              className="px-1.5 py-px rounded border border-slate-300 text-slate-600 hover:bg-slate-100 font-semibold">No</button>
          </>
        )}
      </span>
    )
  }
  if (sinAtc) {
    return (
      <span className="inline-flex items-center gap-1 whitespace-nowrap text-[10px]">
        <span className={`${pill} bg-amber-100 text-amber-800`} title="No está en el catálogo: se guarda tal cual y no cuenta como psicofármaco salvo que lo marques">sin clasificar</span>
        {!disabled && (
          <button type="button" onClick={() => onCambio({ psico: 'si' })}
            className="text-violet-700 hover:underline font-semibold">es psicofármaco</button>
        )}
      </span>
    )
  }
  return null
}

export function TablaMedicacion({ filas, onChange, disabled }: {
  filas: FilaMedicacion[]
  onChange: (filas: FilaMedicacion[]) => void
  disabled?: boolean
}) {
  const cargado = useCatalogoFarmacos(true)
  function update(i: number, key: keyof FilaMedicacion, v: string) {
    onChange(filas.map((f, idx) => idx === i ? { ...f, [key]: v } : f))
  }
  function cambiar(i: number, cambio: Partial<FilaMedicacion>) {
    onChange(filas.map((f, idx) => idx === i ? { ...f, ...cambio } : f))
  }
  const resumen = resumirMedicacion(filas)

  return (
    <div className="space-y-2">
      <div className="overflow-x-auto">
        <table className="w-full text-xs border-collapse">
          <thead>
            <tr className="bg-slate-100">
              <th className="border border-slate-200 px-2 py-2 text-left font-semibold text-slate-600 min-w-[210px]">Fármaco</th>
              <th className="border border-slate-200 px-2 py-2 text-left font-semibold text-slate-600 min-w-[150px]">Psicofármaco</th>
              <th className="border border-slate-200 px-2 py-2 text-left font-semibold text-slate-600 min-w-[80px]">Dosis</th>
              {TOMAS.map(t => (
                <th key={t.key} className="border border-slate-200 px-2 py-2 text-center font-semibold text-slate-600 min-w-[70px]">
                  {t.label}
                </th>
              ))}
              <th className="border border-slate-200 px-2 py-2 text-left font-semibold text-slate-600 min-w-[120px]">Observaciones</th>
              {!disabled && <th className="border border-slate-200 w-8"></th>}
            </tr>
          </thead>
          <tbody>
            {filas.length === 0 ? (
              <tr>
                <td colSpan={10} className="border border-slate-200 px-4 py-4 text-center text-slate-500 italic">
                  Sin medicación añadida
                </td>
              </tr>
            ) : filas.map((f, i) => (
              <tr key={i} className="hover:bg-slate-50">
                <td className="border border-slate-200 p-1">
                  <CeldaFarmaco fila={f} disabled={disabled} onCambio={c => cambiar(i, c)} />
                </td>
                <td className="border border-slate-200 px-1.5 py-1">
                  {cargado && <CeldaClase fila={f} disabled={disabled} onCambio={c => cambiar(i, c)} />}
                </td>
                <td className="border border-slate-200 p-1">
                  <input disabled={disabled} className="w-full bg-transparent px-1 py-0.5 focus:outline-none focus:bg-white focus:ring-1 focus:ring-primary-300 rounded text-slate-600 disabled:text-slate-500"
                    value={f.dosis} placeholder="ej. 10 mg"
                    onChange={e => update(i, 'dosis', e.target.value)} />
                </td>
                {TOMAS.map(t => (
                  <td key={t.key} className="border border-slate-200 p-1 text-center">
                    <input disabled={disabled} className="w-full bg-transparent px-1 py-0.5 focus:outline-none focus:bg-white focus:ring-1 focus:ring-primary-300 rounded text-center text-slate-700 disabled:text-slate-500"
                      value={f[t.key]} placeholder="—"
                      onChange={e => update(i, t.key, e.target.value)} />
                  </td>
                ))}
                <td className="border border-slate-200 p-1">
                  <input disabled={disabled} className="w-full bg-transparent px-1 py-0.5 focus:outline-none focus:bg-white focus:ring-1 focus:ring-primary-300 rounded text-slate-500"
                    value={f.observaciones} placeholder="Si precisa…"
                    onChange={e => update(i, 'observaciones', e.target.value)} />
                </td>
                {!disabled && (
                  <td className="border border-slate-200 p-1 text-center">
                    <button type="button"
                      onClick={() => onChange(filas.filter((_, idx) => idx !== i))}
                      className="text-slate-400 hover:text-red-500 transition-colors">
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {resumen.total > 0 && (
        <p className="text-xs text-slate-600 flex flex-wrap items-center gap-x-2 gap-y-1">
          <span className="font-semibold text-slate-700">{resumen.total} {resumen.total === 1 ? 'fármaco' : 'fármacos'}</span>
          {cargado && (
            <>
              <span className="text-slate-300">·</span>
              <span className={resumen.psicofarmacos > 0 ? 'font-semibold text-violet-800' : ''}>
                {resumen.psicofarmacos} {resumen.psicofarmacos === 1 ? 'psicofármaco' : 'psicofármacos'}
              </span>
              {resumen.psicofarmacos > 0 && <span className="text-slate-500">({textoGrupos(resumen)})</span>}
              {resumen.dudosos.length > 0 && (
                <span className="text-amber-700 font-medium">
                  · Por marcar: {resumen.dudosos.join(', ')} (no cuentan como psicofármaco hasta que elijas Sí o No)
                </span>
              )}
              {resumen.sinClasificar.length > 0 && (
                <span className="text-amber-700" title={resumen.sinClasificar.join(', ')}>
                  · {resumen.sinClasificar.length} sin clasificar (no cuentan como psicofármaco)
                </span>
              )}
            </>
          )}
        </p>
      )}
      {!disabled && (
        <button type="button"
          onClick={() => onChange([...filas, filaVacia()])}
          className="flex items-center gap-1.5 text-xs text-primary-600 hover:text-primary-800 font-medium transition-colors py-1">
          <Plus className="w-3.5 h-3.5" /> Añadir fármaco
        </button>
      )}
    </div>
  )
}
