// Otros cuidados de un paciente: las indicaciones de enfermería para las hojas de trabajo de las auxiliares (por turno)
// y, al final, lo que se sigue gestionando en Aegerus. Todo lo demás del paciente (contención, aislamiento, vías y
// dispositivos, movilidad, higiene…) está en la Hoja de ítems, que es el único sitio donde se edita. Las indicaciones
// las escriben médicos, enfermería y técnicos (no las auxiliares, que son quienes las leen). Con el episodio cerrado todo queda en solo lectura.

import { useEffect, useState } from 'react'
import { useAvisoSalida } from '../../lib/avisoSalida'
import { Cargando } from '../../components/Cargando'
import { Lock, Pencil, Plus, Trash2, Check, X, Info } from 'lucide-react'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../lib/AuthContext'
import { ChipsTurno } from '../../components/ChipsTurno'
import { AvisoGuardado, useAvisoGuardado } from '../../components/AvisoGuardado'
import { IndicadorGuardado } from '../../components/IndicadorGuardado'
import { useConfirmar } from '../../components/useConfirmar'
import { AvisoFicha } from '../../components/AvisoFicha'
import { TituloSeccion } from '../../components/TituloSeccion'
import {
  anadirIndicacion, borrarIndicacion, cambiarIndicacion, type ResultadoPauta,
} from '../hojasTurno/operaciones'
import {
  MAX_TEXTO_PAUTA, TODOS_TURNOS,
  type IndicacionCuidado, type Turno,
} from '../../types/pautaCuidados'

// Lo que sigue en Aegerus: es parte de la pauta de enfermería, pero esta aplicación todavía no se usa para ello.
const EN_AEGERUS = [
  { titulo: 'Dieta y textura', detalle: 'Tipo de dieta, textura (triturada, pastosa…), espesante y ayuda para comer.' },
  { titulo: 'Controles pautados', detalle: 'Constantes, glucemias, peso, balance hídrico y otros controles periódicos.' },
]

export function TabPautaCuidados({ ingresoId, episodioActivo }: { ingresoId: string; episodioActivo: boolean }) {
  const { puedeIndicarCuidados } = useAuth()
  const puedeEditar = puedeIndicarCuidados && episodioActivo

  const [cargando, setCargando] = useState(true)
  const [error, setError] = useState('')
  const { avisos, estado: estadoAviso, error: errorAviso, empezar, guardado, fallo } = useAvisoGuardado('Otros cuidados')
  const { confirmar, dialogo } = useConfirmar()
  const [indicaciones, setIndicaciones] = useState<IndicacionCuidado[]>([])

  const [nuevoTexto, setNuevoTexto] = useState('')
  const [nuevosTurnos, setNuevosTurnos] = useState<Turno[]>(TODOS_TURNOS)
  const [editando, setEditando] = useState<string | null>(null)
  const [textoEdicion, setTextoEdicion] = useState('')
  const [turnosEdicion, setTurnosEdicion] = useState<Turno[]>([])
  const [ocupado, setOcupado] = useState(false)

  async function cargar(silencioso = false) {
    if (!silencioso) setCargando(true)
    setError('')
    const rInd = await supabase.from('pauta_cuidados').select('id, ingreso_id, texto, turnos, created_at, updated_at')
      .eq('ingreso_id', ingresoId).order('created_at', { ascending: true })
    if (rInd.error) {
      setError('No se pudieron cargar las indicaciones: ' + rInd.error.message)
      setCargando(false)
      return
    }
    setIndicaciones((rInd.data ?? []) as IndicacionCuidado[])
    setCargando(false)
  }

  useEffect(() => {
    setEditando(null)
    setNuevoTexto('')
    setNuevosTurnos(TODOS_TURNOS)
    cargar()
  }, [ingresoId]) // eslint-disable-line react-hooks/exhaustive-deps

  // Ejecuta una escritura. Si otra persona cambió la pauta mientras tanto (conflicto), no se pisa: se avisa y se
  // recarga en silencio la versión actual (lo que se estaba escribiendo se queda en pantalla).
  async function ejecutar(accion: () => Promise<ResultadoPauta>): Promise<ResultadoPauta | null> {
    setOcupado(true)
    empezar()
    const r = await accion()
    setOcupado(false)
    if (r.error) {
      fallo(r.error)
      if (r.conflicto) await cargar(true)
      return null
    }
    guardado()
    return r
  }

  async function anadir() {
    const texto = nuevoTexto.trim()
    if (!puedeEditar || ocupado || !texto) return
    const r = await ejecutar(() => anadirIndicacion(ingresoId, texto, nuevosTurnos).then((x) => ({ error: x.error })))
    if (r) {
      setNuevoTexto('')
      setNuevosTurnos(TODOS_TURNOS)
      await cargar(true)
    }
  }

  async function guardarEdicion(i: IndicacionCuidado) {
    const texto = textoEdicion.trim()
    if (!texto || ocupado) return
    const r = await ejecutar(() => cambiarIndicacion(i.id, { texto, turnos: turnosEdicion }, i.updated_at))
    if (r) {
      setIndicaciones((l) => l.map((x) => (x.id === i.id ? { ...x, texto, turnos: turnosEdicion, updated_at: r.actualizada ?? x.updated_at } : x)))
      setEditando(null)
    }
  }

  async function borrar(i: IndicacionCuidado) {
    if (!puedeEditar || ocupado) return
    if (!(await confirmar({ titulo: '¿Quitar esta indicación?', mensaje: 'Se quitará de los otros cuidados del paciente.', textoConfirmar: 'Quitar', peligro: true }))) return
    const r = await ejecutar(() => borrarIndicacion(i.id, i.updated_at))
    if (r) setIndicaciones((l) => l.filter((x) => x.id !== i.id))
  }

  // Aviso al recargar o cerrar la pestaña con texto escrito y sin guardar.
  const original = editando ? indicaciones.find((x) => x.id === editando) : undefined
  const turnosIguales = (a: Turno[], b: Turno[]) => a.length === b.length && a.every((t) => b.includes(t))
  const sucio = (!!original && (textoEdicion.trim() !== original.texto.trim() || !turnosIguales(turnosEdicion, original.turnos))) || nuevoTexto.trim() !== ''
  useAvisoSalida(sucio)
  // Mismo indicador y mismas palabras que en el resto de la aplicación.
  const estadoIndicador = ocupado ? 'guardando' : sucio ? 'pendiente' : estadoAviso

  if (cargando) return <Cargando />
  if (error) return <p className="text-sm text-red-600 py-8 text-center">{error}</p>

  return (
    <div className="space-y-6 ancho-formulario">
      <TituloSeccion titulo="Otros cuidados"
        subtitulo="Indicaciones para las auxiliares según el turno. Contención, aislamiento y dispositivos están en Hoja de ítems." />
      {!puedeEditar && (
        <AvisoFicha icono={Lock}>
          {!episodioActivo
            ? 'Episodio cerrado: las indicaciones quedan en solo lectura.'
            : 'Solo lectura: las indicaciones las escriben médicos, enfermería y técnicos.'}
        </AvisoFicha>
      )}
      <div className="sticky top-0 z-10 flex justify-end h-0 !mt-0 pointer-events-none">
        <span className={`pointer-events-auto bg-white/90 backdrop-blur rounded-full px-3 py-1 shadow-sm border border-slate-100 ${estadoIndicador === 'inactivo' || estadoIndicador === 'conflicto' ? 'hidden' : ''}`}>
          <IndicadorGuardado estado={estadoIndicador} detalle={errorAviso} />
        </span>
      </div>
      <AvisoGuardado avisos={avisos} />
      {dialogo}

      {/* 1 · Indicaciones para las hojas de trabajo */}
      <section className="card">
        <p className="section-title px-6 pt-6">Indicaciones para las auxiliares</p>
        <div className="px-6 pb-6 space-y-3">
          {indicaciones.length === 0 && (
            <p className="py-4 text-sm text-slate-500 text-center">Todavía no hay indicaciones para este paciente.</p>
          )}
          {indicaciones.map((i) => (
            <div key={i.id} data-testid="indicacion-pauta" className="rounded-md bg-amber-50 border border-amber-200 px-3 py-2.5 space-y-2">
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
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-xs text-slate-500">Sale en:</span>
                    <ChipsTurno valor={turnosEdicion} onChange={setTurnosEdicion} />
                  </div>
                  <div className="flex gap-2">
                    <button type="button" className="btn-primary btn-sm" disabled={ocupado || !textoEdicion.trim()} onClick={() => guardarEdicion(i)}>
                      <Check className="w-3.5 h-3.5" /> Guardar
                    </button>
                    <button type="button" className="btn-secondary btn-sm" onClick={() => setEditando(null)}>
                      <X className="w-3.5 h-3.5" /> Cancelar
                    </button>
                  </div>
                </div>
              ) : (
                <div className="flex items-start justify-between gap-3">
                  <p className="text-sm font-medium text-slate-900 whitespace-pre-wrap break-words min-w-0">{i.texto}</p>
                  {puedeEditar && (
                    <div className="flex items-center gap-1 shrink-0">
                      <button type="button" title="Editar" className="p-1 text-slate-500 hover:text-slate-700"
                        onClick={() => { setEditando(i.id); setTextoEdicion(i.texto); setTurnosEdicion(i.turnos) }}>
                        <Pencil className="w-3.5 h-3.5" />
                      </button>
                      <button type="button" title="Quitar" className="p-1 text-slate-500 hover:text-red-500" onClick={() => borrar(i)}>
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  )}
                </div>
              )}
              {/* Los turnos se cambian al editar la indicación (con su botón Guardar), igual que en las Hojas de turno. */}
              {editando !== i.id && <ChipsTurno valor={i.turnos} />}
            </div>
          ))}
        </div>
      </section>

      {/* Nueva indicación */}
      {puedeEditar && (
        <section className="card p-6">
          <p className="section-title">Añadir indicación</p>
          <div className="space-y-3">
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
              <button type="button" className="btn-primary" disabled={ocupado || !nuevoTexto.trim()} onClick={anadir}>
                <Plus className="w-4 h-4" /> Añadir
              </button>
            </div>
          </div>
        </section>
      )}

      {/* 2 · Lo que sigue en Aegerus */}
      <section>
        <div className="rounded-xl border border-slate-200 bg-slate-50 p-6 space-y-3">
          <p className="section-title !mb-0">Se gestiona en Aegerus</p>
          <ul className="space-y-2">
            {EN_AEGERUS.map((x) => (
              <li key={x.titulo} className="text-sm">
                <span className="font-medium text-slate-800">{x.titulo}</span>
                <span className="text-slate-500"> · {x.detalle}</span>
              </li>
            ))}
          </ul>
          <p className="flex items-start gap-2 text-xs text-slate-500">
            <Info className="w-3.5 h-3.5 mt-0.5 shrink-0" />
            Forman parte de la pauta de enfermería, pero esta aplicación todavía no se usa para pautarlos ni registrarlos: se hacen en Aegerus.
          </p>
        </div>
      </section>
    </div>
  )
}
