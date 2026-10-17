// Una fila de la hoja de turno en pantalla: habitación, paciente, columnas de papel, vía y las
// indicaciones de enfermería del turno (editables por todos menos las auxiliares). La vía y la diuresis salen
// de Otros cuidados y de la Hoja de ítems: aquí no se editan.

import { DistintivoAislamiento } from '../../components/DistintivoAislamiento'
import { useState } from 'react'
import { Check, Pencil, Plus, Trash2, X } from 'lucide-react'
import { ChipsTurno } from '../../components/ChipsTurno'
import { IndicadorGuardado } from '../../components/IndicadorGuardado'
import { Link, useNavigate } from 'react-router-dom'
import { hayCambiosSinGuardar, useAvisoSalida } from '../../lib/avisoSalida'
import { useConfirmar } from '../../components/useConfirmar'
import { MAX_TEXTO_PAUTA, textoVias, type Turno } from '../../types/pautaCuidados'
import { colorSemaforo, textoDiuresis, type IndicacionHoja, type PacienteHoja } from './hoja'

export interface AccionesFila {
  anadir: (ingresoId: string, texto: string, turnos: Turno[]) => Promise<boolean>
  cambiar: (ingresoId: string, id: string, cambios: { texto: string; turnos: Turno[] }) => Promise<boolean>
  borrar: (ingresoId: string, id: string) => Promise<boolean>
}

export function FilaPaciente({ n, p, turno, columnas, acciones }: {
  n: number
  p: PacienteHoja | undefined
  turno: Turno
  columnas: string[]          // columnas de papel (Aseo, Diuresis…): se enseñan vacías
  acciones?: AccionesFila        // sin acciones, la fila es de solo lectura
}) {
  const [editando, setEditando] = useState<string | null>(null)
  const [textoEdicion, setTextoEdicion] = useState('')
  const [turnosEdicion, setTurnosEdicion] = useState<Turno[]>([])
  const [anadiendo, setAnadiendo] = useState(false)
  const [nuevoTexto, setNuevoTexto] = useState('')
  const [nuevosTurnos, setNuevosTurnos] = useState<Turno[]>([turno])
  const [ocupado, setOcupado] = useState(false)
  const { confirmar, dialogo } = useConfirmar()
  const navigate = useNavigate()

  // Aviso al recargar o cerrar la pestaña con una indicación a medio escribir o editar.
  const original = editando ? p?.indicaciones.find((i) => i.id === editando) : undefined
  const turnosIguales = (a: Turno[], b: Turno[]) => a.length === b.length && a.every((t) => b.includes(t))
  useAvisoSalida(
    (!!original && (textoEdicion.trim() !== original.texto.trim() || !turnosIguales(turnosEdicion, original.turnos)))
    || (anadiendo && nuevoTexto.trim() !== ''),
  )

  if (!p) {
    return (
      <tr className="border-t">
        <td className="px-3 py-2 text-center font-bold text-slate-500 align-top col-fija bg-white">{n}</td>
        <td colSpan={columnas.length + 3} className="px-3 py-2 text-slate-500 italic align-top">Libre</td>
      </tr>
    )
  }

  const ingresoId = p.ingresoId
  const editable = !!acciones && !!ingresoId
  const delTurno = p.indicaciones.filter((i) => i.turnos.includes(turno))
  const diuresis = textoDiuresis(p)
  const sem = colorSemaforo(p)

  // El nombre lleva a los Otros cuidados del paciente (solo en la hoja de hoy). Si hay una indicación a medio editar
  // se pregunta antes de salir; con Ctrl/Cmd o botón central se abre en otra pestaña, sin preguntar.
  const rutaPauta = ingresoId ? `/ingresos/${ingresoId}?tab=plan&sub=cuidados` : null
  async function irAPauta(e: React.MouseEvent) {
    if (!rutaPauta || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return
    if (!hayCambiosSinGuardar()) return
    e.preventDefault()
    if (await confirmar({ titulo: 'Hay cambios sin guardar', mensaje: 'Si sales ahora se perderán. ¿Quieres salir sin guardar?', textoConfirmar: 'Salir sin guardar', textoCancelar: 'Seguir editando', peligro: true })) {
      navigate(rutaPauta)
    }
  }

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
    if (!(await confirmar({ titulo: '¿Quitar esta indicación?', mensaje: `Se quitará de la pauta de ${p!.nombre}.`, textoConfirmar: 'Quitar', peligro: true }))) return
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
    <tr className="border-t align-top hover:bg-slate-50/60 group">
      {/* Fija a la izquierda al desplazar de lado; con fondo sólido para que no se transparente lo que pasa por debajo. */}
      <td className="px-3 py-2 text-center col-fija bg-white group-hover:bg-slate-50">
        <span
          className="inline-flex items-center justify-center w-8 h-8 rounded-lg font-bold text-slate-700"
          style={sem ? { background: sem.fondo, color: sem.texto } : undefined}
          title={p.semaforo ? `Semáforo de caídas: ${p.semaforo}` : undefined}
        >{n}</span>
      </td>
      <td className="px-3 py-2 font-semibold text-slate-800 md:whitespace-nowrap max-md:min-w-[9rem]">
        {rutaPauta ? (
          <Link to={rutaPauta} onClick={irAPauta} data-pauta-paciente={ingresoId} title="Abrir sus otros cuidados (indicaciones para las auxiliares)"
            className="hover:text-primary-700 hover:underline focus:outline-none focus-visible:ring-2 focus-visible:ring-primary-400 rounded">
            {p.nombre}
          </Link>
        ) : p.nombre}
        <DistintivoAislamiento aislamiento={p.aislamiento} className="ml-2 align-middle" />
      </td>
      {columnas.map((c) => (
        <td key={c} className="px-0.5 py-2 text-center text-[0.65rem] text-slate-500 bg-slate-50/70 border-l border-dashed border-slate-200">
          {c === 'Diuresis' ? diuresis : ''}
        </td>
      ))}
      {/* La vía sale de la Hoja de ítems del paciente: aquí solo se muestra, como Diuresis. */}
      <td
        className="px-0.5 py-2 text-center text-[0.65rem] text-slate-500 bg-slate-50/70 border-l border-dashed border-slate-200"
        title={textoVias(p.vias, false) || undefined}
      >
        {textoVias(p.vias)}
      </td>
      <td className="px-3 py-2 min-w-[16rem]">
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
                    <button type="button" className="btn-primary btn-sm" disabled={ocupado || !textoEdicion.trim()} onClick={() => guardarEdicion(i)}>
                      <Check className="w-3.5 h-3.5" /> Guardar
                    </button>
                    <button type="button" className="btn-secondary btn-sm" onClick={() => setEditando(null)}>
                      <X className="w-3.5 h-3.5" /> Cancelar
                    </button>
                    <IndicadorGuardado estado={ocupado ? 'guardando' : (textoEdicion.trim() !== i.texto.trim() || !turnosIguales(turnosEdicion, i.turnos)) ? 'pendiente' : 'inactivo'} />
                  </div>
                </div>
              )
            }
            return (
              // Cada indicación va resaltada (fondo ámbar y borde fino, sin barra lateral) para que no se confunda con el botón
              // «Añadir indicación», que es un botón discreto de borde punteado.
              <div key={key} data-testid="indicacion" className="flex items-start justify-between gap-2 rounded-md bg-amber-50 border border-amber-200 pl-2.5 pr-1.5 py-1.5">
                <div className="min-w-0">
                  <p className="text-sm font-medium text-slate-900 whitespace-pre-wrap break-words">{i.texto}</p>
                </div>
                {editable && i.id && (
                  <div className="flex items-center gap-0.5 shrink-0">
                    <button type="button" title="Editar" aria-label="Editar indicación" disabled={ocupado}
                      className="p-1 text-slate-500 hover:text-slate-700"
                      onClick={() => { setEditando(i.id!); setTextoEdicion(i.texto); setTurnosEdicion(i.turnos) }}>
                      <Pencil className="w-3.5 h-3.5" />
                    </button>
                    <button type="button" title="Quitar" aria-label="Quitar indicación" disabled={ocupado}
                      className="p-1 text-slate-500 hover:text-red-500" onClick={() => quitar(i)}>
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
                <button type="button" className="btn-primary btn-sm" disabled={ocupado || !nuevoTexto.trim()} onClick={guardarNueva}>
                  <Plus className="w-3.5 h-3.5" /> Añadir
                </button>
                <button type="button" className="btn-secondary btn-sm" onClick={() => setAnadiendo(false)}>
                  <X className="w-3.5 h-3.5" /> Cancelar
                </button>
                <IndicadorGuardado estado={ocupado ? 'guardando' : nuevoTexto.trim() !== '' ? 'pendiente' : 'inactivo'} />
              </div>
            </div>
          ) : (
            <button type="button" disabled={ocupado} onClick={() => { setNuevosTurnos([turno]); setAnadiendo(true) }}
              className="text-xs text-slate-500 hover:text-primary-700 hover:border-primary-300 border border-dashed border-slate-300 rounded-md px-2 py-0.5 inline-flex items-center gap-1 disabled:opacity-60">
              <Plus className="w-3.5 h-3.5" /> Añadir indicación
            </button>
          ))}

          {dialogo}
          {!editable && delTurno.length === 0 && <span className="text-slate-500 text-xs">—</span>}
        </div>
      </td>
    </tr>
  )
}
