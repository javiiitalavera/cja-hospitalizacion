import { useEffect, useMemo, useState } from 'react'
import { CabeceraPagina } from '../components/CabeceraPagina'
import { useNavigate } from 'react-router-dom'
import { ChevronLeft, ChevronRight, Check, X, Printer, Pencil } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../lib/AuthContext'
import { hoyLocal } from '../lib/fechas'
import { nombreCompleto, nombreYApellido } from '../types'
import { documentoImpresion, escapeHtml, imprimirHTMLEnMarco } from '../lib/imprimir'
import {
  CARACTERISTICA_LABEL, DIAS_CORTO, DIAS_LARGO,
  lunesDe, sumarDias, fechaCorta, fechaLarga, pautaVigente, textoPauta, fechasQueTocaLesion, DIAS_HISTORIAL_CURAS,
  type Lesion, type RegistroCura,
} from './curas/tipos'
import { ModalCura } from './curas/ModalCura'
import { MarcaCuraModal } from './curas/MarcaCuraModal'

interface PacienteConCuras {
  id: string            // id del ingreso
  habitacion: number | null
  paciente: { nombre: string; primer_apellido: string; segundo_apellido?: string | null }
  lesiones: Lesion[]    // solo las activas
}

// ── Impresión: tabla semanal + tabla de cuidados, en una hoja ────
function imprimirHoja(pacientes: PacienteConCuras[], semana: string[], registros: Map<string, RegistroCura>) {
  const cab = semana.map((d, i) => `<th>${DIAS_LARGO[i]}<br><span class="f">${fechaCorta(d)}</span></th>`).join('')
  const filasSemana = pacientes.map((p) => {
    const celdas = semana.map((d) => `<td class="c">${(() => { const r = registros.get(`${p.id}|${d}`); return r ? (r.estado === 'no_realizada' ? '✗' : '✓') : '' })()}</td>`).join('')
    return `<tr><td class="n">${escapeHtml(nombreYApellido(p.paciente))} (hab. ${p.habitacion ?? '—'})</td>${celdas}</tr>`
  }).join('')
  const filasCuidados = pacientes.map((p) => {
    const l = p.lesiones.map((x) =>
      `<div><b>${escapeHtml(x.localizacion)}</b> <span class="t">(${escapeHtml(CARACTERISTICA_LABEL[x.caracteristicas])})</span>: ${escapeHtml(textoPauta(pautaVigente(x.valoraciones)))}</div>`
    ).join('')
    return `<tr><td class="n">${escapeHtml(nombreYApellido(p.paciente))} (hab. ${p.habitacion ?? '—'})</td><td>${l}</td></tr>`
  }).join('')
  imprimirHTMLEnMarco(documentoImpresion({
    titulo: `Pauta de curas — semana del ${fechaLarga(semana[0])} al ${fechaLarga(semana[6])}`,
    css: `
      h2 { font-size: 11pt; margin: 6mm 0 2mm; }
      th { font-size: 8.5pt; } .f { font-weight: normal; color: #555; }
      td, th { padding: 3px 5px; font-size: 10pt; }
      td.c { text-align: center; width: 11%; height: 7mm; font-size: 12pt; } td.n { font-weight: 600; width: 30%; }
      .t { color: #555; font-size: 8.5pt; }
    `,
    cuerpo: `
    <table><thead><tr><th>Paciente</th>${cab}</tr></thead><tbody>${filasSemana}</tbody></table>
    <h2>Tabla de cuidados</h2>
    <table><thead><tr><th>Paciente</th><th>Localización y cura / cuidado / necesidad</th></tr></thead><tbody>${filasCuidados}</tbody></table>`,
  }))
}

export default function Curas() {
  const navigate = useNavigate()
  const { profesional } = useAuth()
  const hoy = hoyLocal()
  const [lunes, setLunes] = useState(lunesDe(hoy))
  const [pacientes, setPacientes] = useState<PacienteConCuras[]>([])
  const [registros, setRegistros] = useState<Map<string, RegistroCura>>(new Map())
  // Días anteriores a la semana con la cura marcada ("ingreso|fecha"): hacen falta
  // para saber cuándo toca la siguiente de una pauta por frecuencia.
  const [historial, setHistorial] = useState<Set<string>>(new Set())
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  // Cura abierta desde la tabla de cuidados (se guarda el id y se busca en la
  // lista cargada, para que la ventana siempre muestre lo último guardado).
  // Celda de la tabla semanal que se está registrando (paciente + día).
  const [celda, setCelda] = useState<{ p: PacienteConCuras; fecha: string } | null>(null)
  const [abierta, setAbierta] = useState<{ ingresoId: string; lesionId: string } | null>(null)

  const semana = useMemo(() => Array.from({ length: 7 }, (_, i) => sumarDias(lunes, i)), [lunes])

  async function cargar() {
    setError('')
    const [resP, resR] = await Promise.all([
      supabase
        .from('ingresos')
        .select('id, habitacion, paciente:pacientes(nombre, primer_apellido, segundo_apellido), lesiones:curas_lesiones(*, valoraciones:curas_valoraciones(*), registrado_por:profesionales!registrado_por_id(nombre, apellidos))')
        .eq('estado', 'activo')
        .order('habitacion', { ascending: true }),
      supabase
        .from('curas_registro')
        .select('id, ingreso_id, fecha, estado, motivo, realizada_por_id, realizada_por:profesionales!realizada_por_id(nombre, apellidos)')
        .gte('fecha', semana[0])
        .lte('fecha', semana[6]),
    ])
    if (resP.error || resR.error) {
      setError('No se pudieron cargar las curas: ' + (resP.error?.message ?? resR.error?.message))
      setLoading(false)
      return
    }
    const conCuras = ((resP.data ?? []) as unknown as (Omit<PacienteConCuras, 'lesiones'> & { lesiones: Lesion[] })[])
      .map((p) => ({ ...p, lesiones: (p.lesiones ?? []).filter((l) => !l.fecha_fin) }))
      .filter((p) => p.lesiones.length > 0)
    setPacientes(conCuras)
    const mapa = new Map<string, RegistroCura>()
    ;((resR.data ?? []) as unknown as RegistroCura[]).forEach((r) => mapa.set(`${r.ingreso_id}|${r.fecha}`, r))
    setRegistros(mapa)
    // Historial previo a la semana (solo para pautas por frecuencia). Si falla,
    // se sigue sin él: solo afecta a qué días se resaltan como "toca".
    const ids = conCuras.map((p) => p.id)
    const previos = new Set<string>()
    if (ids.length > 0) {
      const { data: hist } = await supabase
        .from('curas_registro')
        .select('ingreso_id, fecha')
        .in('ingreso_id', ids)
        .eq('estado', 'hecha')
        .gte('fecha', sumarDias(semana[0], -DIAS_HISTORIAL_CURAS))
        .lt('fecha', semana[0])
        .order('fecha', { ascending: false })
      ;((hist ?? []) as { ingreso_id: string; fecha: string }[]).forEach((r) => previos.add(`${r.ingreso_id}|${r.fecha}`))
    }
    setHistorial(previos)
    setLoading(false)
  }
  useEffect(() => { setLoading(true); cargar() }, [lunes]) // eslint-disable-line react-hooks/exhaustive-deps

  // Días de la semana en que toca cura a cada paciente (según la pauta vigente
  // de cualquiera de sus lesiones: días de la semana o frecuencia en horas).
  const tocaPorPaciente = useMemo(() => {
    const mapa = new Map<string, Set<string>>()
    for (const p of pacientes) {
      const hechas = new Set<string>()
      for (const k of historial) if (k.startsWith(p.id + '|')) hechas.add(k.slice(p.id.length + 1))
      for (const d of semana) if (registros.get(`${p.id}|${d}`)?.estado === 'hecha') hechas.add(d)
      const dias = new Set<string>()
      for (const l of p.lesiones) {
        fechasQueTocaLesion(l.valoraciones, semana[0], semana[6], hechas, hoy).forEach((d) => dias.add(d))
      }
      mapa.set(p.id, dias)
    }
    return mapa
  }, [pacientes, historial, registros, semana, hoy])
  function tocaEse(p: PacienteConCuras, fecha: string): boolean {
    return tocaPorPaciente.get(p.id)?.has(fecha) ?? false
  }

  const esSemanaActual = lunes === lunesDe(hoy)

  return (
    <div className="p-6 md:p-8 max-w-6xl">
      <CabeceraPagina
        titulo="Pauta de curas"
        subtitulo={`${loading ? '…' : `${pacientes.length} paciente${pacientes.length === 1 ? '' : 's'} con curas activas`} · registro semanal de curas`}
      >
          <button onClick={() => setLunes(sumarDias(lunes, -7))} className="btn-secondary !px-2.5" aria-label="Semana anterior"><ChevronLeft className="w-4 h-4" /></button>
          <span className="text-sm font-medium text-slate-700 min-w-[11rem] text-center">{fechaCorta(semana[0])} – {fechaCorta(semana[6])}</span>
          <button onClick={() => setLunes(sumarDias(lunes, 7))} className="btn-secondary !px-2.5" aria-label="Semana siguiente"><ChevronRight className="w-4 h-4" /></button>
          {!esSemanaActual && <button onClick={() => setLunes(lunesDe(hoy))} className="btn-secondary text-sm">Esta semana</button>}
          <button onClick={() => imprimirHoja(pacientes, semana, registros)} disabled={pacientes.length === 0} className="btn-secondary text-sm">
            <Printer className="w-4 h-4" />Imprimir
          </button>
      </CabeceraPagina>

      {error && (
        <div className="card p-6 max-w-md mb-6">
          <p className="font-semibold text-red-600">No se pudo cargar</p>
          <p className="text-sm text-slate-500 mt-1 mb-3">{error}</p>
          <button onClick={cargar} className="btn-secondary text-sm">Reintentar</button>
        </div>
      )}

      {!loading && !error && pacientes.length === 0 && (
        <div className="card p-8 text-center text-sm text-slate-500">
          No hay pacientes con curas activas. Las lesiones y cuidados se añaden en la ficha de cada paciente, pestaña Plan de cuidados → Pauta de curas.
        </div>
      )}

      {pacientes.length > 0 && (
        <>
          <p className="section-title">Tabla semanal</p>
          <div className="card overflow-x-auto mb-8">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b bg-slate-50 text-xs text-slate-500">
                  <th className="text-left px-4 py-2 font-semibold">Paciente</th>
                  {semana.map((d, i) => (
                    <th key={d} className={`px-2 py-2 font-semibold text-center ${d === hoy ? 'text-primary-700' : ''}`}>
                      {DIAS_CORTO[i]}<br /><span className="font-normal">{fechaCorta(d)}</span>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {pacientes.map((p) => (
                  <tr key={p.id} className="border-b last:border-0">
                    <td className="px-4 py-2">
                      <button onClick={() => navigate(`/ingresos/${p.id}?tab=plan&sub=curas`)} className="text-left hover:text-primary-700">
                        <span className="font-medium text-slate-800">{nombreCompleto(p.paciente)}</span>
                        <span className="text-xs text-slate-500"> · Hab. {p.habitacion ?? '—'}</span>
                      </button>
                    </td>
                    {semana.map((d) => {
                      const clave = `${p.id}|${d}`
                      const marca = registros.get(clave)
                      const futuro = d > hoy
                      const toca = tocaEse(p, d)
                      const noRealizada = marca?.estado === 'no_realizada'
                      const quien = marca?.realizada_por ? ` por ${marca.realizada_por.nombre} ${marca.realizada_por.apellidos}` : ''
                      return (
                        <td key={d} className={`px-1 py-1 text-center ${d === hoy ? 'bg-primary-50/40' : ''}`}>
                          <button
                            onClick={() => setCelda({ p, fecha: d })}
                            disabled={futuro || !profesional || (!marca && !toca)}
                            title={
                              marca
                                ? noRealizada ? `No realizada${quien}: ${marca.motivo ?? ''}` : `Hecha${quien}`
                                : toca && !futuro ? 'Toca cura: registrar' : toca ? 'Toca cura' : ''
                            }
                            className={`w-10 h-9 rounded-md border text-sm flex items-center justify-center mx-auto transition-colors ${
                              marca
                                ? noRealizada
                                  ? 'bg-rose-100 border-rose-300 text-rose-700'
                                  : 'bg-emerald-100 border-emerald-300 text-emerald-700'
                                : toca
                                  ? `bg-amber-100 border-amber-300 ${futuro ? '' : 'hover:bg-amber-200'}`
                                  : 'bg-slate-200 border-slate-300'
                            }`}
                          >
                            {marca && (noRealizada ? <X className="w-4 h-4" /> : <Check className="w-4 h-4" />)}
                          </button>
                        </td>
                      )
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
            <p className="px-4 py-2 text-xs text-slate-500 border-t">
              Ámbar: toca cura ese día según la pauta (si es anterior a hoy y sigue en ámbar, está sin registrar) · verde: hecha · rojo: no realizada (con su motivo) · gris: no toca. En las pautas «cada X h» se cuenta desde la última cura hecha.
            </p>
          </div>

          <p className="section-title">Tabla de cuidados</p>
          <div className="card overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b bg-slate-50 text-xs text-slate-500">
                  <th className="text-left px-4 py-2 font-semibold w-1/3">Paciente</th>
                  <th className="text-left px-4 py-2 font-semibold">Localización y cura / cuidado / necesidad</th>
                </tr>
              </thead>
              <tbody>
                {pacientes.map((p) => (
                  <tr key={p.id} className="border-b last:border-0 align-top">
                    <td className="px-4 py-2 font-medium text-slate-800">
                      {nombreCompleto(p.paciente)}<span className="text-xs text-slate-500 font-normal"> · Hab. {p.habitacion ?? '—'}</span>
                    </td>
                    <td className="px-2 py-1.5">
                      {p.lesiones.map((l) => (
                        <button
                          key={l.id}
                          type="button"
                          onClick={() => setAbierta({ ingresoId: p.id, lesionId: l.id })}
                          title="Abrir y editar esta cura"
                          className="group flex w-full items-start justify-between gap-3 rounded-md px-2 py-1 text-left hover:bg-primary-50 focus-visible:bg-primary-50"
                        >
                          <span>
                            <span className="font-semibold">{l.localizacion}</span>
                            <span className="text-xs text-slate-500"> ({CARACTERISTICA_LABEL[l.caracteristicas]})</span>
                            <span>: {textoPauta(pautaVigente(l.valoraciones))}</span>
                          </span>
                          <Pencil className="w-3.5 h-3.5 mt-0.5 shrink-0 text-slate-400 group-hover:text-primary-600" />
                        </button>
                      ))}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}

      {celda && (
        <MarcaCuraModal
          titulo={`${nombreCompleto(celda.p.paciente)} · Hab. ${celda.p.habitacion ?? '—'}`}
          ingresoId={celda.p.id}
          fecha={celda.fecha}
          marca={registros.get(`${celda.p.id}|${celda.fecha}`) ?? null}
          onClose={() => setCelda(null)}
          onCambio={cargar}
        />
      )}

      {abierta && (() => {
        const pac = pacientes.find((x) => x.id === abierta.ingresoId)
        const lesion = pac?.lesiones.find((x) => x.id === abierta.lesionId)
        if (!pac || !lesion) return null
        return (
          <ModalCura
            titulo={`${nombreCompleto(pac.paciente)} · Hab. ${pac.habitacion ?? '—'}`}
            lesion={lesion}
            onCerrar={() => setAbierta(null)}
            onCambio={cargar}
          />
        )
      })()}
    </div>
  )
}
