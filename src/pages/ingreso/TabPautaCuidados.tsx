// Pauta de cuidados de un paciente, en el orden en que se piensa un paciente: precauciones (aislamiento), vías y
// dispositivos (vías, sonda vesical, oxigenoterapia), indicaciones de enfermería para las hojas de trabajo de
// cada turno y, al final, lo que se sigue gestionando en Aegerus.
//
// Aislamiento, vías y dispositivos son columnas de la Hoja de ítems (la misma información, sin duplicar): los
// puede cambiar enfermería y médicos. Las indicaciones solo las escribe enfermería. Con el episodio cerrado todo
// queda en solo lectura.

import { useEffect, useState } from 'react'
import { useAvisoSalida } from '../../lib/avisoSalida'
import { Cargando } from '../../components/Cargando'
import { Lock, Pencil, Plus, Trash2, Check, X, Info } from 'lucide-react'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../lib/AuthContext'
import { ChipsTurno } from '../../components/ChipsTurno'
import { AvisoGuardado, useAvisoGuardado } from '../../components/AvisoGuardado'
import { useConfirmar } from '../../components/useConfirmar'
import { BloqueOxigeno, BloqueSonda, SelectorAislamiento, SelectorVias } from '../../components/ViasDispositivos'
import { AvisoFicha } from '../../components/AvisoFicha'
import { TituloSeccion } from '../../components/TituloSeccion'
import {
  anadirIndicacion, borrarIndicacion, cambiarIndicacion, guardarDispositivos, type ResultadoPauta,
} from '../hojasTurno/operaciones'
import {
  CAMPOS_DISPOSITIVOS, MAX_TEXTO_PAUTA, TODOS_TURNOS,
  type DatosDispositivos, type IndicacionCuidado, type Turno,
} from '../../types/pautaCuidados'

// Lo que sigue en Aegerus: es parte de la pauta de enfermería, pero esta aplicación todavía no se usa para ello.
const EN_AEGERUS = [
  { titulo: 'Dieta y textura', detalle: 'Tipo de dieta, textura (triturada, pastosa…), espesante y ayuda para comer.' },
  { titulo: 'Controles pautados', detalle: 'Constantes, glucemias, peso, balance hídrico y otros controles periódicos.' },
]

export function TabPautaCuidados({ ingresoId, episodioActivo }: { ingresoId: string; episodioActivo: boolean }) {
  const { esEnfermeria, esMedico } = useAuth()
  const puedeEditar = esEnfermeria && episodioActivo
  // Igual que en la hoja de ítems (de donde salen estos datos): lo puede cambiar el equipo asistencial.
  const puedeEditarDispositivos = (esEnfermeria || esMedico) && episodioActivo

  const [cargando, setCargando] = useState(true)
  const [error, setError] = useState('')
  const { avisos, guardado, fallo } = useAvisoGuardado('Pauta de cuidados')
  const { confirmar, dialogo } = useConfirmar()
  const [indicaciones, setIndicaciones] = useState<IndicacionCuidado[]>([])
  const [dispositivos, setDispositivos] = useState<DatosDispositivos>({})

  const [nuevoTexto, setNuevoTexto] = useState('')
  const [nuevosTurnos, setNuevosTurnos] = useState<Turno[]>(TODOS_TURNOS)
  const [editando, setEditando] = useState<string | null>(null)
  const [textoEdicion, setTextoEdicion] = useState('')
  const [ocupado, setOcupado] = useState(false)

  async function cargar(silencioso = false) {
    if (!silencioso) setCargando(true)
    setError('')
    const [rInd, rDisp] = await Promise.all([
      supabase.from('pauta_cuidados').select('id, ingreso_id, texto, turnos, created_at, updated_at')
        .eq('ingreso_id', ingresoId).order('created_at', { ascending: true }),
      supabase.from('items_paciente').select(CAMPOS_DISPOSITIVOS.join(', ')).eq('ingreso_id', ingresoId).maybeSingle(),
    ])
    if (rInd.error || rDisp.error) {
      setError('No se pudo cargar la pauta de cuidados: ' + (rInd.error?.message ?? rDisp.error?.message))
      setCargando(false)
      return
    }
    setIndicaciones((rInd.data ?? []) as IndicacionCuidado[])
    setDispositivos((rDisp.data ?? {}) as DatosDispositivos)
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

  async function cambiarDispositivos(cambios: DatosDispositivos) {
    if (!puedeEditarDispositivos || ocupado) return
    const r = await ejecutar(() => guardarDispositivos(ingresoId, cambios))
    if (r) setDispositivos((d) => ({ ...d, ...cambios }))
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
    const r = await ejecutar(() => cambiarIndicacion(i.id, { texto }, i.updated_at))
    if (r) {
      setIndicaciones((l) => l.map((x) => (x.id === i.id ? { ...x, texto, updated_at: r.actualizada ?? x.updated_at } : x)))
      setEditando(null)
    }
  }

  async function cambiarTurnos(i: IndicacionCuidado, turnos: Turno[]) {
    if (!puedeEditar || ocupado) return
    const r = await ejecutar(() => cambiarIndicacion(i.id, { turnos }, i.updated_at))
    if (r) setIndicaciones((l) => l.map((x) => (x.id === i.id ? { ...x, turnos, updated_at: r.actualizada ?? x.updated_at } : x)))
  }

  async function borrar(i: IndicacionCuidado) {
    if (!puedeEditar || ocupado) return
    if (!(await confirmar({ titulo: '¿Quitar esta indicación?', mensaje: 'Se quitará de la pauta de cuidados del paciente.', textoConfirmar: 'Quitar', peligro: true }))) return
    const r = await ejecutar(() => borrarIndicacion(i.id, i.updated_at))
    if (r) setIndicaciones((l) => l.filter((x) => x.id !== i.id))
  }

  // Aviso al recargar o cerrar la pestaña con texto escrito y sin guardar.
  const original = editando ? indicaciones.find((x) => x.id === editando) : undefined
  useAvisoSalida((!!original && textoEdicion.trim() !== original.texto.trim()) || nuevoTexto.trim() !== '')

  if (cargando) return <Cargando />
  if (error) return <p className="text-sm text-red-600 py-8 text-center">{error}</p>

  return (
    <div className="space-y-6 max-w-3xl">
      <TituloSeccion titulo="Pauta de cuidados"
        subtitulo="Lo que necesita el paciente en el día a día: aislamiento, vías y dispositivos, e indicaciones para las auxiliares. Las lesiones van en Curas; los registros diarios, en Hoja de ítems." />
      {!puedeEditar && (
        <AvisoFicha icono={Lock}>
          {!episodioActivo
            ? 'Episodio cerrado: la pauta queda en solo lectura.'
            : puedeEditarDispositivos
              ? 'Las indicaciones de turno las escribe enfermería (o un administrador); tú puedes editar el aislamiento, las vías y los dispositivos.'
              : 'Solo lectura: las indicaciones las escribe enfermería, y el aislamiento, las vías y los dispositivos, enfermería y médicos (o un administrador).'}
        </AvisoFicha>
      )}
      <AvisoGuardado avisos={avisos} />
      {dialogo}

      {/* 1 · Precauciones */}
      <section className={`card p-6 ${(dispositivos.aislamiento ?? []).length > 0 ? 'border-violet-300 bg-violet-50/50' : ''}`}>
        <p className="section-title">Aislamiento</p>
        <SelectorAislamiento datos={dispositivos} onCambio={cambiarDispositivos} deshabilitado={!puedeEditarDispositivos || ocupado} />
      </section>

      {/* 2 · Vías y dispositivos (las mismas casillas de la hoja de ítems) */}
      <section className="card">
        <p className="section-title px-6 pt-6">Vías y dispositivos</p>
        <div className="divide-y">
          <div className="px-6 pb-4 space-y-2.5">
            <p className="text-sm font-medium text-slate-800">Vías</p>
            <SelectorVias datos={dispositivos} onCambio={cambiarDispositivos} deshabilitado={!puedeEditarDispositivos || ocupado} />
          </div>
          <div className="px-6 py-4">
            <BloqueSonda datos={dispositivos} onCambio={cambiarDispositivos} deshabilitado={!puedeEditarDispositivos || ocupado} />
          </div>
          <div className="px-6 py-4">
            <BloqueOxigeno datos={dispositivos} onCambio={cambiarDispositivos} deshabilitado={!puedeEditarDispositivos || ocupado} />
          </div>
        </div>
      </section>

      {/* 3 · Indicaciones para las hojas de trabajo */}
      <section className="card">
        <p className="section-title px-6 pt-6">Indicaciones para las auxiliares</p>
        <div className="divide-y border-t">
          {indicaciones.length === 0 && (
            <p className="px-6 py-6 text-sm text-slate-500 text-center">Todavía no hay indicaciones para este paciente.</p>
          )}
          {indicaciones.map((i) => (
            <div key={i.id} className="px-6 py-3 space-y-2">
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
                      <button type="button" title="Editar" className="p-1 text-slate-500 hover:text-slate-700"
                        onClick={() => { setEditando(i.id); setTextoEdicion(i.texto) }}>
                        <Pencil className="w-3.5 h-3.5" />
                      </button>
                      <button type="button" title="Quitar" className="p-1 text-slate-500 hover:text-red-500" onClick={() => borrar(i)}>
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
              <button type="button" className="btn-primary text-sm gap-1" disabled={ocupado || !nuevoTexto.trim()} onClick={anadir}>
                <Plus className="w-4 h-4" /> Añadir
              </button>
            </div>
          </div>
        </section>
      )}

      {/* 4 · Lo que sigue en Aegerus */}
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
