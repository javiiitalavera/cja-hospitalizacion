// Una fila de la hoja de turno en pantalla: habitación, paciente, vía, avisos que ya salen de la app y las
// indicaciones de enfermería del turno (editables por enfermería y administración).

import { useState } from 'react'
import { Check, Pencil, Plus, Trash2, X } from 'lucide-react'
import { ChipsTurno } from '../../components/ChipsTurno'
import {
  MAX_TEXTO_PAUTA, TURNOS, VIA_LABEL,
  type Turno, type ViaPaciente,
} from '../../types/pautaCuidados'
import { avisosAutomaticos, textoDiuresis, type IndicacionHoja, type PacienteHoja } from './hoja'

export interface AccionesFila {
  cambiarVia: (ingresoId: string, via: ViaPaciente | null) => Promise<boolean>
  anadir: (ingresoId: string, texto: string, turnos: Turno[]) => Promise<boolean>
  cambiar: (ingresoId: string, id: string, cambios: { texto: string; turnos: Turno[] }) => Promise<boolean>
  borrar: (ingresoId: string, id: string) => Promise<boolean>
}

const etiquetaTurno = (t: Turno) => TURNOS.find((x) => x.clave === t)?.etiqueta ?? t

export function FilaPaciente({ n, p, turno, acciones }: {
  n: number
  p: PacienteHoja | undefined
  turno: Turno
  acciones?: AccionesFila        // sin acciones, la fila es de solo lectura
}) {
  const [editando, setEditando] = useState<string | null>(null)
  const [textoEdicion, setTextoEdicion] = useState('')
  const [turnosEdicion, setTurnosEdicion] = useState<Turno[]>([])
  const [anadiendo, setAnadiendo] = useState(false)
  const [nuevoTexto, setNuevoTexto] = useState('')
  const [nuevosTurnos, setNuevosTurnos] = useState<Turno[]>([turno])
  const [ocupado, setOcupado] = useState(false)

  if (!p) {
    return (
      <tr className="border-t">
        <td className="px-3 py-2 text-center font-bold text-slate-400 align-top">{n}</td>
        <td colSpan={4} className="px-3 py-2 text-slate-400 italic align-top">Libre</td>
      </tr>
    )
  }

  const ingresoId = p.ingresoId
  const editable = !!acciones && !!ingresoId
  const delTurno = p.indicaciones.filter((i) => i.turnos.includes(turno))
  const diuresis = textoDiuresis(p)
  const avisos = avisosAutomaticos(p, turno)

  async function envolver(f: () => Promise<boolean>): Promise<boolean> {
    setOcupado(true)
    const ok = await f()
    setOcupado(false)
    return ok
  }

  async function guardarEdicion(i: IndicacionHoja) {
    const texto = textoEdicion.trim()
    if (!acciones || !ingresoId || !i.id || !texto) return
    const ok = await envolver(() => acciones.cambiar(ingresoId, i.id!, { texto, turnos: turnosEdicion }))
    if (ok) setEditando(null)
  }

  async function guardarNueva() {
    const texto = nuevoTexto.trim()
    if (!acciones || !ingresoId || !texto) return
    const ok = await envolver(() => acciones.anadir(ingresoId, texto, nuevosTurnos))
    if (ok) { setAnadiendo(false); setNuevoTexto(''); setNuevosTurnos([turno]) }
  }

  async function quitar(i: IndicacionHoja) {
    if (!acciones || !ingresoId || !i.id) return
    if (!window.confirm(`¿Quitar esta indicación de la pauta de ${p!.nombre}?`)) return
    await envolver(() => acciones.borrar(ingresoId, i.id!))
  }

  // Enter guarda; Mayús+Enter hace salto de línea; Escape cancela.
  function teclas(guardar: () => void, cancelar: () => void) {
    return (e: React.KeyboardEvent) => {
      if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); guardar() }
      else if (e.key === 'Escape') cancelar()
    }
  }

  return (
    <tr className="border-t align-top hover:bg-slate-50/60">
      <td className="px-3 py-2 text-center font-bold text-slate-700">{n}</td>
      <td className="px-3 py-2 font-semibold text-slate-800 whitespace-nowrap">{p.nombre}</td>
      <td className="px-3 py-2">
        {editable ? (
          <select
            aria-label={`Vía de ${p.nombre}`}
            className={`input py-1 text-xs w-32 ${p.via ? '' : 'text-slate-400'}`}
            value={p.via ?? ''}
            disabled={ocupado}
            onChange={(e) => {
              const v = (e.target.value || null) as ViaPaciente | null
              void envolver(() => acciones!.cambiarVia(ingresoId!, v))
            }}
          >
            <option value="">Sin vía</option>
            <option value="venosa">{VIA_LABEL.venosa}</option>
            <option value="subcutanea">{VIA_LABEL.subcutanea}</option>
          </select>
        ) : (
          <span className="text-xs text-slate-600">{p.via ? VIA_LABEL[p.via] : <span className="text-slate-300">—</span>}</span>
        )}
      </td>
      <td className="px-3 py-2">
        <div className="flex flex-wrap gap-1 max-w-[15rem]">
          {diuresis && <span className="text-[11px] px-2 py-0.5 rounded-md bg-sky-50 text-sky-800 border border-sky-100 font-semibold">{diuresis}</span>}
          {avisos.map((a) => (
            <span key={a} className="text-[11px] px-2 py-0.5 rounded-md bg-amber-50 text-amber-800 border border-amber-100">{a}</span>
          ))}
          {!diuresis && avisos.length === 0 && <span className="text-slate-300 text-xs">—</span>}
        </div>
      </td>
      <td className="px-3 py-2 min-w-[20rem]">
        <div className="space-y-2">
          {delTurno.map((i, k) => {
            const key = i.id ?? `${k}-${i.texto}`
            if (editable && i.id && editando === i.id) {
              return (
                <div key={key} className="space-y-1.5">
                  <textarea
                    className="textarea text-sm"
                    rows={2}
                    maxLength={MAX_TEXTO_PAUTA}
                    autoFocus
                    value={textoEdicion}
                    onChange={(e) => setTextoEdicion(e.target.value)}
                    onKeyDown={teclas(() => guardarEdicion(i), () => setEditando(null))}
                  />
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-xs text-slate-500">Sale en:</span>
                    <ChipsTurno compacto valor={turnosEdicion} onChange={setTurnosEdicion} />
                  </div>
                  <div className="flex gap-2">
                    <button type="button" className="btn-primary text-xs py-1 gap-1" disabled={ocupado || !textoEdicion.trim()} onClick={() => guardarEdicion(i)}>
                      <Check className="w-3.5 h-3.5" /> Guardar
                    </button>
                    <button type="button" className="btn-secondary text-xs py-1 gap-1" onClick={() => setEditando(null)}>
                      <X className="w-3.5 h-3.5" /> Cancelar
                    </button>
                  </div>
                </div>
              )
            }
            const otros = i.turnos.filter((t) => t !== turno)
            return (
              <div key={key} className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="text-sm text-slate-800 whitespace-pre-wrap break-words">{i.texto}</p>
                  {otros.length > 0 && (
                    <p className="text-[11px] text-slate-400">También: {otros.map(etiquetaTurno).join(', ')}</p>
                  )}
                </div>
                {editable && i.id && (
                  <div className="flex items-center gap-0.5 shrink-0">
                    <button type="button" title="Editar" aria-label="Editar indicación" disabled={ocupado}
                      className="p-1 text-slate-400 hover:text-slate-700"
                      onClick={() => { setEditando(i.id!); setTextoEdicion(i.texto); setTurnosEdicion(i.turnos) }}>
                      <Pencil className="w-3.5 h-3.5" />
                    </button>
                    <button type="button" title="Quitar" aria-label="Quitar indicación" disabled={ocupado}
                      className="p-1 text-slate-400 hover:text-red-500" onClick={() => quitar(i)}>
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                )}
              </div>
            )
          })}

          {editable && (anadiendo ? (
            <div className="space-y-1.5">
              <textarea
                className="textarea text-sm"
                rows={2}
                maxLength={MAX_TEXTO_PAUTA}
                autoFocus
                placeholder="Indicación para las auxiliares…"
                value={nuevoTexto}
                onChange={(e) => setNuevoTexto(e.target.value)}
                onKeyDown={teclas(guardarNueva, () => setAnadiendo(false))}
              />
              <div className="flex items-center gap-2 flex-wrap">
                <span className="text-xs text-slate-500">Sale en:</span>
                <ChipsTurno compacto valor={nuevosTurnos} onChange={setNuevosTurnos} />
              </div>
              <div className="flex gap-2">
                <button type="button" className="btn-primary text-xs py-1 gap-1" disabled={ocupado || !nuevoTexto.trim()} onClick={guardarNueva}>
                  <Plus className="w-3.5 h-3.5" /> Añadir
                </button>
                <button type="button" className="btn-secondary text-xs py-1 gap-1" onClick={() => setAnadiendo(false)}>
                  <X className="w-3.5 h-3.5" /> Cancelar
                </button>
              </div>
            </div>
          ) : (
            <button type="button" disabled={ocupado} onClick={() => { setNuevosTurnos([turno]); setAnadiendo(true) }}
              className="text-xs text-primary-700 hover:text-primary-900 inline-flex items-center gap-1">
              <Plus className="w-3.5 h-3.5" /> Añadir indicación
            </button>
          ))}

          {!editable && delTurno.length === 0 && <span className="text-slate-300 text-xs">—</span>}
        </div>
      </td>
    </tr>
  )
}
