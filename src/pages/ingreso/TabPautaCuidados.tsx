// Pauta de cuidados de un paciente: las indicaciones de enfermería que leen las auxiliares en las
// hojas de trabajo de cada turno (mañana, tarde, noche) y si lleva vía. Solo enfermería escribe;
// el resto lee. Con el episodio cerrado todo queda en solo lectura.

import { useEffect, useState } from 'react'
import { Cargando } from '../../components/Cargando'
import { Lock, Pencil, Plus, Trash2, Check, X } from 'lucide-react'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../lib/AuthContext'
import { ChipsTurno } from '../../components/ChipsTurno'
import { AvisoGuardado, useAvisoGuardado } from '../../components/AvisoGuardado'
import { useConfirmar } from '../../components/useConfirmar'
import {
  anadirIndicacion, borrarIndicacion, cambiarTextoIndicacion, cambiarTurnosIndicacion, guardarVia,
} from '../hojasTurno/operaciones'
import {
  MAX_TEXTO_PAUTA, TODOS_TURNOS, VIA_LABEL,
  type IndicacionCuidado, type Turno, type ViaPaciente,
} from '../../types/pautaCuidados'

export function TabPautaCuidados({ ingresoId, episodioActivo }: { ingresoId: string; episodioActivo: boolean }) {
  const { esEnfermeria } = useAuth()
  const puedeEditar = esEnfermeria && episodioActivo

  const [cargando, setCargando] = useState(true)
  const [error, setError] = useState('')
  const { avisos, guardado, fallo } = useAvisoGuardado('Pauta de cuidados')
  const { confirmar, dialogo } = useConfirmar()
  const [indicaciones, setIndicaciones] = useState<IndicacionCuidado[]>([])
  const [via, setVia] = useState<ViaPaciente | null>(null)

  const [nuevoTexto, setNuevoTexto] = useState('')
  const [nuevosTurnos, setNuevosTurnos] = useState<Turno[]>(TODOS_TURNOS)
  const [editando, setEditando] = useState<string | null>(null)
  const [textoEdicion, setTextoEdicion] = useState('')
  const [ocupado, setOcupado] = useState(false)

  async function cargar() {
    setCargando(true)
    setError('')
    const [rInd, rVia] = await Promise.all([
      supabase.from('pauta_cuidados').select('id, ingreso_id, texto, turnos, created_at')
        .eq('ingreso_id', ingresoId).order('created_at', { ascending: true }),
      supabase.from('pauta_via').select('via').eq('ingreso_id', ingresoId).maybeSingle(),
    ])
    if (rInd.error || rVia.error) {
      setError('No se pudo cargar la pauta de cuidados: ' + (rInd.error?.message ?? rVia.error?.message))
      setCargando(false)
      return
    }
    setIndicaciones((rInd.data ?? []) as IndicacionCuidado[])
    setVia(((rVia.data as { via: ViaPaciente } | null)?.via) ?? null)
    setCargando(false)
  }

  useEffect(() => {
    setEditando(null)
    setNuevoTexto('')
    setNuevosTurnos(TODOS_TURNOS)
    cargar()
  }, [ingresoId]) // eslint-disable-line react-hooks/exhaustive-deps

  // Ejecuta una escritura (devuelve el mensaje de error, o null si fue bien).
  async function ejecutar(accion: () => Promise<string | null>): Promise<boolean> {
    setOcupado(true)
    const e = await accion()
    setOcupado(false)
    if (e) { fallo(e); return false }
    guardado()
    return true
  }

  async function cambiarVia(nueva: ViaPaciente | null) {
    if (!puedeEditar || ocupado || nueva === via) return
    const ok = await ejecutar(() => guardarVia(ingresoId, nueva))
    if (ok) setVia(nueva)
  }

  async function anadir() {
    const texto = nuevoTexto.trim()
    if (!puedeEditar || ocupado || !texto) return
    const ok = await ejecutar(() => anadirIndicacion(ingresoId, texto, nuevosTurnos).then((r) => r.error))
    if (ok) {
      setNuevoTexto('')
      setNuevosTurnos(TODOS_TURNOS)
      await cargar()
    }
  }

  async function guardarEdicion(i: IndicacionCuidado) {
    const texto = textoEdicion.trim()
    if (!texto || ocupado) return
    const ok = await ejecutar(() => cambiarTextoIndicacion(i.id, texto))
    if (ok) {
      setIndicaciones((l) => l.map((x) => (x.id === i.id ? { ...x, texto } : x)))
      setEditando(null)
    }
  }

  async function cambiarTurnos(i: IndicacionCuidado, turnos: Turno[]) {
    if (!puedeEditar || ocupado) return
    const ok = await ejecutar(() => cambiarTurnosIndicacion(i.id, turnos))
    if (ok) setIndicaciones((l) => l.map((x) => (x.id === i.id ? { ...x, turnos } : x)))
  }

  async function borrar(i: IndicacionCuidado) {
    if (!puedeEditar || ocupado) return
    if (!(await confirmar({ titulo: '¿Quitar esta indicación?', mensaje: 'Se quitará de la pauta de cuidados del paciente.', textoConfirmar: 'Quitar', peligro: true }))) return
    const ok = await ejecutar(() => borrarIndicacion(i.id))
    if (ok) setIndicaciones((l) => l.filter((x) => x.id !== i.id))
  }

  if (cargando) return <Cargando />
  if (error) return <p className="text-sm text-red-600 py-8 text-center">{error}</p>

  return (
    <div className="space-y-6 max-w-3xl">
      <p className="text-sm text-slate-500">
        Indicaciones de enfermería para las auxiliares: salen en la hoja de trabajo de cada turno marcado
        (Hojas de turno, en el menú). Se escriben una sola vez.
      </p>

      {!puedeEditar && (
        <div className="flex items-center gap-2 text-sm text-amber-700 bg-amber-50 border border-amber-100 rounded-lg px-3 py-2">
          <Lock className="w-4 h-4 shrink-0" />
          {!esEnfermeria
            ? 'Solo lectura: esta pauta la escribe enfermería (o un administrador).'
            : 'Episodio cerrado: la pauta queda en solo lectura.'}
        </div>
      )}
      <AvisoGuardado avisos={avisos} />
      {dialogo}

      {/* Vía */}
      <section>
        <p className="section-title">Vía</p>
        <div className="flex flex-wrap gap-2">
          {([null, 'venosa', 'subcutanea'] as (ViaPaciente | null)[]).map((v) => (
            <button
              key={v ?? 'ninguna'}
              type="button"
              disabled={!puedeEditar || ocupado}
              onClick={() => cambiarVia(v)}
              aria-pressed={via === v}
              className={`text-sm px-3 py-1.5 rounded-lg border transition-colors ${
                via === v ? 'bg-primary-50 border-primary-300 text-primary-800 font-semibold' : 'bg-white border-slate-200 text-slate-500'
              } ${puedeEditar ? 'hover:border-primary-300' : 'cursor-default'}`}
            >
              {v ? VIA_LABEL[v] : 'No lleva vía'}
            </button>
          ))}
        </div>
      </section>

      {/* Indicaciones */}
      <section>
        <p className="section-title">Indicaciones</p>
        <div className="card divide-y">
          {indicaciones.length === 0 && (
            <p className="px-4 py-6 text-sm text-slate-500 text-center">Todavía no hay indicaciones para este paciente.</p>
          )}
          {indicaciones.map((i) => (
            <div key={i.id} className="px-4 py-3 space-y-2">
              {editando === i.id ? (
                <div className="space-y-2">
                  <textarea
                    className="textarea"
                    rows={2}
                    maxLength={MAX_TEXTO_PAUTA}
                    autoFocus
                    value={textoEdicion}
                    onChange={(e) => setTextoEdicion(e.target.value)}
                  />
                  <div className="flex gap-2">
                    <button type="button" className="btn-primary text-xs py-1 gap-1" disabled={ocupado || !textoEdicion.trim()} onClick={() => guardarEdicion(i)}>
                      <Check className="w-3.5 h-3.5" /> Guardar
                    </button>
                    <button type="button" className="btn-secondary text-xs py-1 gap-1" onClick={() => setEditando(null)}>
                      <X className="w-3.5 h-3.5" /> Cancelar
                    </button>
                  </div>
                </div>
              ) : (
                <div className="flex items-start justify-between gap-3">
                  <p className="text-sm text-slate-800 whitespace-pre-wrap break-words min-w-0">{i.texto}</p>
                  {puedeEditar && (
                    <div className="flex items-center gap-1 shrink-0">
                      <button type="button" title="Editar" className="p-1 text-slate-400 hover:text-slate-700"
                        onClick={() => { setEditando(i.id); setTextoEdicion(i.texto) }}>
                        <Pencil className="w-3.5 h-3.5" />
                      </button>
                      <button type="button" title="Quitar" className="p-1 text-slate-400 hover:text-red-500" onClick={() => borrar(i)}>
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  )}
                </div>
              )}
              <ChipsTurno valor={i.turnos} deshabilitado={!puedeEditar || ocupado} onChange={puedeEditar ? (t) => cambiarTurnos(i, t) : undefined} />
            </div>
          ))}
        </div>
      </section>

      {/* Nueva indicación */}
      {puedeEditar && (
        <section>
          <p className="section-title">Añadir indicación</p>
          <div className="card p-4 space-y-3">
            <textarea
              className="textarea"
              rows={2}
              maxLength={MAX_TEXTO_PAUTA}
              placeholder="Ej.: Llevar en el primer turno de comidas. Paseo por la tarde con andador y 1 persona."
              value={nuevoTexto}
              onChange={(e) => setNuevoTexto(e.target.value)}
            />
            <div className="flex items-center justify-between gap-3 flex-wrap">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="text-xs text-slate-500">Sale en:</span>
                <ChipsTurno valor={nuevosTurnos} onChange={setNuevosTurnos} />
              </div>
              <button type="button" className="btn-primary text-sm gap-1" disabled={ocupado || !nuevoTexto.trim()} onClick={anadir}>
                <Plus className="w-4 h-4" /> Añadir
              </button>
            </div>
          </div>
        </section>
      )}
    </div>
  )
}
