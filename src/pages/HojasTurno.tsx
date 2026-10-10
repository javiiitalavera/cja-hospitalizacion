// Hojas de turno: las hojas de trabajo de mañana, tarde y noche de las auxiliares, generadas con los
// pacientes de hoy y la pauta de cuidados. Se imprimen cada turno; las columnas en blanco se rellenan a mano.

import { useEffect, useMemo, useRef, useState } from 'react'
import { Printer, RefreshCw } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { fetchContencionesPorIngreso } from '../lib/contenciones'
import { TURNOS, type Turno, type ViaPaciente } from '../types/pautaCuidados'
import { construirHojaHTML, turnoActual, type PacienteHoja } from './hojasTurno/hoja'

export default function HojasTurno() {
  const [turno, setTurno] = useState<Turno>(() => turnoActual())
  const [pacientes, setPacientes] = useState<PacienteHoja[]>([])
  const [cargando, setCargando] = useState(true)
  const [error, setError] = useState('')
  const [aviso, setAviso] = useState('')
  const [cargadoEn, setCargadoEn] = useState<Date>(new Date())
  const marcoRef = useRef<HTMLIFrameElement>(null)

  async function cargar() {
    setCargando(true)
    setError('')
    setAviso('')
    const { data, error: eIng } = await supabase
      .from('ingresos')
      .select('id, habitacion, paciente:pacientes(nombre, primer_apellido), items:items_paciente(sonda_vesical, colector, alerta_conducta, objetos_calma)')
      .eq('estado', 'activo')
      .order('habitacion', { ascending: true })
    if (eIng) { setError('No se pudieron cargar los pacientes: ' + eIng.message); setCargando(false); return }
    const ingresos = (data ?? []) as any[]
    const ids = ingresos.map((i) => i.id)

    const [rInd, rVia, rCont] = await Promise.all([
      ids.length ? supabase.from('pauta_cuidados').select('ingreso_id, texto, turnos, created_at').in('ingreso_id', ids).order('created_at', { ascending: true }) : Promise.resolve({ data: [], error: null }),
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

    const indPorIngreso = new Map<string, { texto: string; turnos: Turno[] }[]>()
    for (const r of (rInd.data ?? []) as any[]) {
      const l = indPorIngreso.get(r.ingreso_id) ?? []
      l.push({ texto: r.texto, turnos: r.turnos })
      indPorIngreso.set(r.ingreso_id, l)
    }
    const viaPorIngreso = new Map<string, ViaPaciente>((((rVia.data ?? []) as any[]).map((r) => [r.ingreso_id, r.via])))

    setPacientes(ingresos.filter((i) => i.habitacion != null && i.paciente).map((i): PacienteHoja => {
      const it = Array.isArray(i.items) ? i.items[0] : i.items
      const c = rCont.mapa[i.id]
      return {
        habitacion: i.habitacion,
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
    setCargadoEn(new Date())
    setCargando(false)
  }

  useEffect(() => { cargar() }, [])

  const html = useMemo(() => construirHojaHTML(turno, pacientes, new Date(), cargadoEn), [turno, pacientes, cargadoEn])

  function imprimir() {
    const w = marcoRef.current?.contentWindow
    if (!w) return
    w.focus()
    w.print()
  }

  return (
    <div className="p-6 md:p-8 space-y-5">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold text-slate-800">Hojas de turno</h1>
          <p className="text-sm text-slate-500 mt-0.5">Hojas de trabajo de las auxiliares, con los pacientes y las indicaciones de hoy</p>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={cargar} disabled={cargando} title="Actualizar"
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-slate-200 text-slate-500 hover:bg-slate-50 text-sm font-medium disabled:opacity-60">
            <RefreshCw className={`w-4 h-4 ${cargando ? 'animate-spin' : ''}`} />
          </button>
          <button onClick={imprimir} disabled={cargando || !!error} className="btn-primary">
            <Printer className="w-4 h-4" /> Imprimir {TURNOS.find((t) => t.clave === turno)?.etiqueta.toLowerCase()}
          </button>
        </div>
      </div>

      <div className="flex gap-1 border-b">
        {TURNOS.map((t) => (
          <button key={t.clave} onClick={() => setTurno(t.clave)}
            className={`px-4 py-2 text-sm font-medium border-b-2 -mb-px transition-colors ${
              turno === t.clave ? 'border-primary-600 text-primary-700' : 'border-transparent text-slate-500 hover:text-slate-700'
            }`}>
            {t.etiqueta}
          </button>
        ))}
      </div>

      {aviso && <div className="text-sm text-amber-800 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">{aviso}</div>}
      {error ? (
        <p className="text-sm text-red-600 py-8 text-center">{error}</p>
      ) : cargando ? (
        <p className="text-sm text-slate-500 py-8 text-center">Cargando…</p>
      ) : (
        <>
          <p className="text-xs text-slate-500">
            Vista previa. Las columnas en blanco se rellenan a mano. Las indicaciones se editan en la ficha de cada paciente
            (Plan de cuidados → Pauta de cuidados).
          </p>
          <iframe ref={marcoRef} title={`Hoja de trabajo ${turno}`} srcDoc={html}
            className="w-full bg-white border rounded-xl shadow-sm" style={{ height: '1100px', maxWidth: '900px' }} />
        </>
      )}
    </div>
  )
}
