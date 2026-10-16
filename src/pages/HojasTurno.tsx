// Hojas de turno: las hojas de trabajo de mañana, tarde y noche de las auxiliares, con los pacientes de hoy y
// la pauta de cuidados. Enfermería (y administración) edita aquí mismo las indicaciones; la vía sale de la Hoja de ítems del paciente.
// Cada noche se guarda una copia de la pauta (histórico), igual que la hoja de ítems. Se imprime cada turno y
// las columnas en blanco se rellenan a mano.

import { useEffect, useMemo, useState } from 'react'
import { Cargando } from '../components/Cargando'
import { History, Printer } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../lib/AuthContext'
import { CabeceraPagina } from '../components/CabeceraPagina'
import { BotonActualizar } from '../components/BotonActualizar'
import { AvisoGuardado, useAvisoGuardado } from '../components/AvisoGuardado'
import { IndicadorGuardado } from '../components/IndicadorGuardado'
import { imprimirHTMLEnMarco } from '../lib/imprimir'
import { TURNOS, type Turno } from '../types/pautaCuidados'
import { construirHojaHTML, turnoActual, type PacienteHoja } from './hojasTurno/hoja'
import { TablaHoja } from './hojasTurno/TablaHoja'
import { HistoricoHojas } from './hojasTurno/HistoricoHojas'
import { TabsTurno } from './hojasTurno/TabsTurno'
import type { AccionesFila } from './hojasTurno/FilaPaciente'
import {
  anadirIndicacion, borrarIndicacion, cambiarIndicacion, type ResultadoPauta,
} from './hojasTurno/operaciones'

export default function HojasTurno() {
  const { puedeIndicarCuidados } = useAuth()
  const [verHistorico, setVerHistorico] = useState(false)
  const [turno, setTurno] = useState<Turno>(() => turnoActual())
  const [pacientes, setPacientes] = useState<PacienteHoja[]>([])
  const [cargando, setCargando] = useState(true)
  const [error, setError] = useState('')
  const [aviso, setAviso] = useState('')
  const { avisos, estado: estadoAviso, error: errorAviso, empezar, guardado, fallo } = useAvisoGuardado('Hoja de turno')

  async function cargar(silencioso = false) {
    if (!silencioso) setCargando(true)
    setError('')
    setAviso('')
    const { data, error: eIng } = await supabase
      .from('ingresos')
      .select('id, habitacion, paciente:pacientes(nombre, primer_apellido), items:items_paciente(sonda_vesical, colector, semaforo_caidas, vias, aislamiento)')
      .eq('estado', 'activo')
      .order('habitacion', { ascending: true })
    if (eIng) { setError('No se pudieron cargar los pacientes: ' + eIng.message); setCargando(false); return }
    const ingresos = (data ?? []) as any[]
    const ids = ingresos.map((i) => i.id)

    const rInd = ids.length
      ? await supabase.from('pauta_cuidados').select('id, ingreso_id, texto, turnos, created_at, updated_at').in('ingreso_id', ids).order('created_at', { ascending: true })
      : { data: [], error: null }
    // Si falla algo auxiliar se sigue enseñando la hoja, pero avisando: una hoja sin indicaciones
    // no es lo mismo que «no hay indicaciones».
    if (rInd.error) setAviso('No se pudieron cargar las indicaciones: la hoja podría estar incompleta.')

    const indPorIngreso = new Map<string, { id: string; texto: string; turnos: Turno[]; updated_at?: string }[]>()
    for (const r of (rInd.data ?? []) as any[]) {
      const l = indPorIngreso.get(r.ingreso_id) ?? []
      l.push({ id: r.id, texto: r.texto, turnos: r.turnos, updated_at: r.updated_at })
      indPorIngreso.set(r.ingreso_id, l)
    }

    setPacientes(ingresos.filter((i) => i.habitacion != null && i.paciente).map((i): PacienteHoja => {
      const it = Array.isArray(i.items) ? i.items[0] : i.items
      return {
        ingresoId: i.id,
        habitacion: i.habitacion,
        semaforo: it?.semaforo_caidas ?? null,
        nombre: `${i.paciente.nombre} ${i.paciente.primer_apellido}`.trim(),
        sondaVesical: !!it?.sonda_vesical,
        colector: !!it?.colector,
        vias: Array.isArray(it?.vias) ? it.vias : [],
        aislamiento: Array.isArray(it?.aislamiento) ? it.aislamiento : [],
        indicaciones: indPorIngreso.get(i.id) ?? [],
      }
    }))
    setCargando(false)
  }

  useEffect(() => { cargar() }, [])

  // ── Edición (todos menos las auxiliares) ──────────────
  function actualizar(ingresoId: string, f: (p: PacienteHoja) => PacienteHoja) {
    setPacientes((l) => l.map((p) => (p.ingresoId === ingresoId ? f(p) : p)))
  }

  // Resultado de una escritura: avisa en pantalla. Si otra persona cambió la pauta mientras tanto (conflicto),
  // no se pisa su cambio: se avisa y se recarga en silencio la versión actual (lo que se estaba escribiendo
  // se queda en pantalla para poder repetirlo).
  async function ejecutar(r: ResultadoPauta): Promise<boolean> {
    if (r.error) {
      fallo(r.error)
      if (r.conflicto) await cargar(true)
    } else guardado()
    return !r.error
  }

  const acciones: AccionesFila | undefined = puedeIndicarCuidados ? {
    anadir: async (ingresoId, texto, turnos) => {
      empezar()
      const r = await anadirIndicacion(ingresoId, texto, turnos)
      const ok = await ejecutar({ error: r.error })
      if (ok && r.indicacion) {
        const nueva = { id: r.indicacion.id, texto: r.indicacion.texto, turnos: r.indicacion.turnos, updated_at: r.indicacion.updated_at }
        actualizar(ingresoId, (p) => ({ ...p, indicaciones: [...p.indicaciones, nueva] }))
      }
      return ok
    },
    cambiar: async (ingresoId, id, cambios) => {
      empezar()
      const base = pacientes.find((p) => p.ingresoId === ingresoId)?.indicaciones.find((i) => i.id === id)?.updated_at
      const r = await cambiarIndicacion(id, cambios, base)
      const ok = await ejecutar(r)
      if (ok) actualizar(ingresoId, (p) => ({ ...p, indicaciones: p.indicaciones.map((i) => (i.id === id ? { ...i, ...cambios, updated_at: r.actualizada ?? i.updated_at } : i)) }))
      return ok
    },
    borrar: async (ingresoId, id) => {
      empezar()
      const base = pacientes.find((p) => p.ingresoId === ingresoId)?.indicaciones.find((i) => i.id === id)?.updated_at
      const ok = await ejecutar(await borrarIndicacion(id, base))
      if (ok) actualizar(ingresoId, (p) => ({ ...p, indicaciones: p.indicaciones.filter((i) => i.id !== id) }))
      return ok
    },
  } : undefined

  const etiquetaTurno = TURNOS.find((t) => t.clave === turno)?.etiqueta.toLowerCase()
  const html = useMemo(() => construirHojaHTML(turno, pacientes, new Date()), [turno, pacientes])

  return (
    <div className="p-4 sm:p-6 md:p-8 space-y-6 ancho-amplio">
      <CabeceraPagina
        className="!mb-0"
        titulo="Hojas de turno"
        subtitulo="Hojas de trabajo de las auxiliares"
      >
        {!verHistorico && <BotonActualizar onClick={() => cargar()} cargando={cargando} />}
        <button onClick={() => setVerHistorico((v) => !v)} className={`btn-secondary ${verHistorico ? 'bg-slate-100' : ''}`}>
          <History className="w-4 h-4" /> {verHistorico ? 'Ver hoy' : 'Histórico'}
        </button>
        {!verHistorico && (
          <button onClick={() => imprimirHTMLEnMarco(html)} disabled={cargando || !!error || !!aviso} className="btn-primary"
            title={aviso ? 'No se puede imprimir: faltan datos por cargar. Pulsa Actualizar.' : undefined}>
            <Printer className="w-4 h-4" /> Imprimir {etiquetaTurno}
          </button>
        )}
      </CabeceraPagina>

      <AvisoGuardado avisos={avisos} />

      {verHistorico ? (
        <HistoricoHojas />
      ) : (
        <>
          <div className="flex items-center justify-between gap-3 flex-wrap">
            <TabsTurno turno={turno} onChange={setTurno} />
            <IndicadorGuardado estado={estadoAviso} detalle={errorAviso} />
          </div>
          {aviso && <div className="aviso aviso-atencion">{aviso}</div>}
          {error ? (
            <p className="text-sm text-red-600 py-8 text-center">{error}</p>
          ) : cargando ? (
            <Cargando />
          ) : (
            <>
              <TablaHoja turno={turno} pacientes={pacientes} acciones={acciones} />
            </>
          )}
        </>
      )}
    </div>
  )
}
