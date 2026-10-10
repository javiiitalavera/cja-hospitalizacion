// Hojas de turno: las hojas de trabajo de mañana, tarde y noche de las auxiliares, con los pacientes de hoy y
// la pauta de cuidados. Enfermería (y administración) edita aquí mismo las indicaciones y la vía; el resto lo ve.
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
import { fetchContencionesPorIngreso } from '../lib/contenciones'
import { imprimirHTMLEnMarco } from '../lib/imprimir'
import { TURNOS, type Turno, type ViaPaciente } from '../types/pautaCuidados'
import { construirHojaHTML, turnoActual, type PacienteHoja } from './hojasTurno/hoja'
import { TablaHoja } from './hojasTurno/TablaHoja'
import { HistoricoHojas } from './hojasTurno/HistoricoHojas'
import { TabsTurno } from './hojasTurno/TabsTurno'
import type { AccionesFila } from './hojasTurno/FilaPaciente'
import {
  anadirIndicacion, borrarIndicacion, cambiarIndicacion, guardarVia,
} from './hojasTurno/operaciones'

export default function HojasTurno() {
  const { esEnfermeria } = useAuth()
  const [verHistorico, setVerHistorico] = useState(false)
  const [turno, setTurno] = useState<Turno>(() => turnoActual())
  const [pacientes, setPacientes] = useState<PacienteHoja[]>([])
  const [cargando, setCargando] = useState(true)
  const [error, setError] = useState('')
  const [aviso, setAviso] = useState('')
  const { avisos, guardado, fallo } = useAvisoGuardado('Hoja de turno')

  async function cargar() {
    setCargando(true)
    setError('')
    setAviso('')
    const { data, error: eIng } = await supabase
      .from('ingresos')
      .select('id, habitacion, paciente:pacientes(nombre, primer_apellido), items:items_paciente(sonda_vesical, colector, alerta_conducta, objetos_calma, semaforo_caidas)')
      .eq('estado', 'activo')
      .order('habitacion', { ascending: true })
    if (eIng) { setError('No se pudieron cargar los pacientes: ' + eIng.message); setCargando(false); return }
    const ingresos = (data ?? []) as any[]
    const ids = ingresos.map((i) => i.id)

    const [rInd, rVia, rCont] = await Promise.all([
      ids.length ? supabase.from('pauta_cuidados').select('id, ingreso_id, texto, turnos, created_at').in('ingreso_id', ids).order('created_at', { ascending: true }) : Promise.resolve({ data: [], error: null }),
      ids.length ? supabase.from('pauta_via').select('ingreso_id, via').in('ingreso_id', ids) : Promise.resolve({ data: [], error: null }),
      fetchContencionesPorIngreso(ids),
    ])
    // Si falla algo auxiliar se sigue enseñando la hoja, pero avisando: una hoja sin indicaciones
    // no es lo mismo que «no hay indicaciones».
    const fallos: string[] = []
    if (rInd.error) fallos.push('la pauta de cuidados')
    if (rVia.error) fallos.push('la vía')
    if (rCont.error) fallos.push('la contención')
    if (fallos.length) setAviso(`No se pudo cargar ${fallos.join(', ')}: la hoja podría estar incompleta.`)

    const indPorIngreso = new Map<string, { id: string; texto: string; turnos: Turno[] }[]>()
    for (const r of (rInd.data ?? []) as any[]) {
      const l = indPorIngreso.get(r.ingreso_id) ?? []
      l.push({ id: r.id, texto: r.texto, turnos: r.turnos })
      indPorIngreso.set(r.ingreso_id, l)
    }
    const viaPorIngreso = new Map<string, ViaPaciente>((((rVia.data ?? []) as any[]).map((r) => [r.ingreso_id, r.via])))

    setPacientes(ingresos.filter((i) => i.habitacion != null && i.paciente).map((i): PacienteHoja => {
      const it = Array.isArray(i.items) ? i.items[0] : i.items
      const c = rCont.mapa[i.id]
      return {
        ingresoId: i.id,
        habitacion: i.habitacion,
        semaforo: it?.semaforo_caidas ?? null,
        nombre: `${i.paciente.nombre} ${i.paciente.primer_apellido}`.trim(),
        sondaVesical: !!it?.sonda_vesical,
        colector: !!it?.colector,
        via: viaPorIngreso.get(i.id) ?? null,
        alertas: it?.alerta_conducta ?? [],
        objetosCalma: it?.objetos_calma ?? null,
        contencionDia: c?.dia ?? null,
        contencionNoche: c?.noche ?? null,
        indicaciones: indPorIngreso.get(i.id) ?? [],
      }
    }))
    setCargando(false)
  }

  useEffect(() => { cargar() }, [])

  // ── Edición (solo enfermería y administración) ──────────────
  function actualizar(ingresoId: string, f: (p: PacienteHoja) => PacienteHoja) {
    setPacientes((l) => l.map((p) => (p.ingresoId === ingresoId ? f(p) : p)))
  }

  // Resultado de una escritura (mensaje de error, o null si fue bien): avisa en pantalla.
  async function ejecutar(error: string | null): Promise<boolean> {
    if (error) fallo(error)
    else guardado()
    return !error
  }

  const acciones: AccionesFila | undefined = esEnfermeria ? {
    cambiarVia: async (ingresoId, via) => {
      const ok = await ejecutar(await guardarVia(ingresoId, via))
      if (ok) actualizar(ingresoId, (p) => ({ ...p, via }))
      return ok
    },
    anadir: async (ingresoId, texto, turnos) => {
      const r = await anadirIndicacion(ingresoId, texto, turnos)
      const ok = await ejecutar(r.error)
      if (ok && r.indicacion) {
        const nueva = { id: r.indicacion.id, texto: r.indicacion.texto, turnos: r.indicacion.turnos }
        actualizar(ingresoId, (p) => ({ ...p, indicaciones: [...p.indicaciones, nueva] }))
      }
      return ok
    },
    cambiar: async (ingresoId, id, cambios) => {
      const ok = await ejecutar(await cambiarIndicacion(id, cambios))
      if (ok) actualizar(ingresoId, (p) => ({ ...p, indicaciones: p.indicaciones.map((i) => (i.id === id ? { ...i, ...cambios } : i)) }))
      return ok
    },
    borrar: async (ingresoId, id) => {
      const ok = await ejecutar(await borrarIndicacion(id))
      if (ok) actualizar(ingresoId, (p) => ({ ...p, indicaciones: p.indicaciones.filter((i) => i.id !== id) }))
      return ok
    },
  } : undefined

  const etiquetaTurno = TURNOS.find((t) => t.clave === turno)?.etiqueta.toLowerCase()
  const html = useMemo(() => construirHojaHTML(turno, pacientes, new Date()), [turno, pacientes])

  return (
    <div className="p-6 md:p-8 space-y-5">
      <CabeceraPagina
        className="!mb-0"
        titulo="Hojas de turno"
        subtitulo="Hojas de trabajo de las auxiliares"
      >
        {!verHistorico && <BotonActualizar onClick={cargar} cargando={cargando} />}
        <button onClick={() => setVerHistorico((v) => !v)} className={`btn-secondary ${verHistorico ? 'bg-slate-100' : ''}`}>
          <History className="w-4 h-4" /> {verHistorico ? 'Ver hoy' : 'Histórico'}
        </button>
        {!verHistorico && (
          <button onClick={() => imprimirHTMLEnMarco(html)} disabled={cargando || !!error} className="btn-primary">
            <Printer className="w-4 h-4" /> Imprimir {etiquetaTurno}
          </button>
        )}
      </CabeceraPagina>

      <AvisoGuardado avisos={avisos} />

      {verHistorico ? (
        <HistoricoHojas />
      ) : (
        <>
          <TabsTurno turno={turno} onChange={setTurno} />
          {aviso && <div className="text-sm text-amber-800 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">{aviso}</div>}
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
