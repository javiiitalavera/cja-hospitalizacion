import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { ChevronLeft, ChevronRight, Check, Printer, Pencil } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../lib/AuthContext'
import { hoyLocal } from '../lib/fechas'
import { nombreCompleto } from '../types'
import { escapeHtml } from '../lib/imprimir'
import {
  CARACTERISTICA_LABEL, DIAS_CORTO, DIAS_LARGO,
  lunesDe, sumarDias, fechaCorta, fechaLarga, pautaVigente, textoPauta,
  type Lesion, type RegistroCura,
} from './curas/tipos'
import { ModalCura } from './curas/ModalCura'

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
    const celdas = semana.map((d) => `<td class="c">${registros.has(`${p.id}|${d}`) ? '✓' : ''}</td>`).join('')
    return `<tr><td class="n">${escapeHtml(nombreCompleto(p.paciente))} (hab. ${p.habitacion ?? '—'})</td>${celdas}</tr>`
  }).join('')
  const filasCuidados = pacientes.map((p) => {
    const l = p.lesiones.map((x) =>
      `<div><b>${escapeHtml(x.localizacion)}</b> <span class="t">(${escapeHtml(CARACTERISTICA_LABEL[x.caracteristicas])})</span>: ${escapeHtml(textoPauta(pautaVigente(x.valoraciones)))}</div>`
    ).join('')
    return `<tr><td class="n">${escapeHtml(nombreCompleto(p.paciente))} (hab. ${p.habitacion ?? '—'})</td><td>${l}</td></tr>`
  }).join('')
  const html = `<html><head><title>Curas</title><style>
    @page { size: A4 portrait; margin: 12mm; }
    body { font-family: Arial, sans-serif; font-size: 10pt; }
    h1 { font-size: 13pt; margin: 0 0 3mm; } h2 { font-size: 11pt; margin: 6mm 0 2mm; }
    table { border-collapse: collapse; width: 100%; }
    th, td { border: 1px solid #777; padding: 3px 5px; vertical-align: top; }
    th { background: #eee; font-size: 8.5pt; } .f { font-weight: normal; color: #555; }
    td.c { text-align: center; width: 11%; height: 7mm; font-size: 12pt; } td.n { font-weight: 600; width: 30%; }
    .t { color: #555; font-size: 8.5pt; }
  </style></head><body>
    <h1>Curas — semana del ${fechaLarga(semana[0])} al ${fechaLarga(semana[6])}</h1>
    <table><thead><tr><th>Paciente</th>${cab}</tr></thead><tbody>${filasSemana}</tbody></table>
    <h2>Tabla de cuidados</h2>
    <table><thead><tr><th>Paciente</th><th>Localización y cura / cuidado / necesidad</th></tr></thead><tbody>${filasCuidados}</tbody></table>
  </body></html>`
  const win = window.open('', '_blank', 'width=900,height=1000')
  if (!win) return
  win.document.write(html)
  win.document.close()
  win.focus()
  setTimeout(() => { win.print(); win.close() }, 400)
}

export default function Curas() {
  const navigate = useNavigate()
  const { profesional } = useAuth()
  const hoy = hoyLocal()
  const [lunes, setLunes] = useState(lunesDe(hoy))
  const [pacientes, setPacientes] = useState<PacienteConCuras[]>([])
  const [registros, setRegistros] = useState<Map<string, RegistroCura>>(new Map())
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [errorAccion, setErrorAccion] = useState('')
  const [ocupado, setOcupado] = useState<string | null>(null)
  // Cura abierta desde la tabla de cuidados (se guarda el id y se busca en la
  // lista cargada, para que la ventana siempre muestre lo último guardado).
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
        .select('id, ingreso_id, fecha, realizada_por_id, realizada_por:profesionales!realizada_por_id(nombre, apellidos)')
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
    setLoading(false)
  }
  useEffect(() => { setLoading(true); cargar() }, [lunes]) // eslint-disable-line react-hooks/exhaustive-deps

  async function alternar(p: PacienteConCuras, fecha: string) {
    if (!profesional || fecha > hoy) return
    const clave = `${p.id}|${fecha}`
    setOcupado(clave)
    setErrorAccion('')
    const marca = registros.get(clave)
    const { error: err } = marca
      ? await supabase.from('curas_registro').delete().eq('id', marca.id)
      : await supabase.from('curas_registro').insert({ ingreso_id: p.id, fecha, realizada_por_id: profesional.id })
    if (err) setErrorAccion('No se pudo guardar el cambio: ' + err.message)
    await cargar()
    setOcupado(null)
  }

  // ¿Toca cura ese día según alguna pauta activa del paciente?
  function tocaEse(p: PacienteConCuras, fecha: string): boolean {
    const dow = (() => { const d = new Date(fecha + 'T00:00:00').getDay(); return d === 0 ? 7 : d })()
    return p.lesiones.some((l) => pautaVigente(l.valoraciones)?.dias_semana?.includes(dow))
  }

  const esSemanaActual = lunes === lunesDe(hoy)

  return (
    <div className="p-8 max-w-6xl">
      <div className="flex items-start justify-between gap-4 flex-wrap mb-6">
        <div>
          <h1 className="text-xl font-bold text-slate-800">Curas</h1>
          <p className="text-sm text-slate-500">
            {loading ? 'Cargando…' : `${pacientes.length} paciente${pacientes.length === 1 ? '' : 's'} con curas activas`}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={() => setLunes(sumarDias(lunes, -7))} className="btn-secondary !px-2.5" aria-label="Semana anterior"><ChevronLeft className="w-4 h-4" /></button>
          <span className="text-sm font-medium text-slate-700 min-w-[11rem] text-center">{fechaCorta(semana[0])} – {fechaCorta(semana[6])}</span>
          <button onClick={() => setLunes(sumarDias(lunes, 7))} className="btn-secondary !px-2.5" aria-label="Semana siguiente"><ChevronRight className="w-4 h-4" /></button>
          {!esSemanaActual && <button onClick={() => setLunes(lunesDe(hoy))} className="btn-secondary text-sm">Esta semana</button>}
          <button onClick={() => imprimirHoja(pacientes, semana, registros)} disabled={pacientes.length === 0} className="btn-secondary text-sm">
            <Printer className="w-4 h-4" />Imprimir
          </button>
        </div>
      </div>

      {error && (
        <div className="card p-6 max-w-md mb-6">
          <p className="font-semibold text-red-600">No se pudo cargar</p>
          <p className="text-sm text-slate-500 mt-1 mb-3">{error}</p>
          <button onClick={cargar} className="btn-secondary text-sm">Reintentar</button>
        </div>
      )}
      {errorAccion && <p className="mb-4 text-sm text-red-600 bg-red-50 border border-red-100 rounded-lg px-3 py-2">{errorAccion}</p>}

      {!loading && !error && pacientes.length === 0 && (
        <div className="card p-8 text-center text-sm text-slate-500">
          No hay pacientes con curas activas. Las lesiones y cuidados se añaden en la ficha de cada paciente, pestaña Plan de cuidados → Curas.
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
                      const pendiente = toca && !marca && d <= hoy
                      return (
                        <td key={d} className={`px-1 py-1 text-center ${d === hoy ? 'bg-primary-50/40' : ''}`}>
                          <button
                            onClick={() => alternar(p, d)}
                            disabled={futuro || !profesional || ocupado === clave}
                            title={
                              marca
                                ? `Hecha${marca.realizada_por ? ' por ' + marca.realizada_por.nombre + ' ' + marca.realizada_por.apellidos : ''}`
                                : toca ? 'Toca cura según la pauta' : futuro ? '' : 'Marcar cura hecha'
                            }
                            className={`w-10 h-9 rounded-md border text-sm flex items-center justify-center mx-auto transition-colors ${
                              marca
                                ? 'bg-emerald-100 border-emerald-300 text-emerald-700'
                                : pendiente
                                  ? 'bg-amber-50 border-amber-300 hover:bg-amber-100'
                                  : toca
                                    ? 'border-dashed border-slate-300 hover:bg-slate-50'
                                    : futuro
                                      ? 'border-slate-100 bg-slate-50'
                                      : 'border-slate-200 hover:bg-slate-50'
                            }`}
                          >
                            {marca && <Check className="w-4 h-4" />}
                          </button>
                        </td>
                      )
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
            <p className="px-4 py-2 text-xs text-slate-500 border-t">
              Verde: cura hecha · ámbar: tocaba según la pauta y no está marcada · borde discontinuo: toca ese día.
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
