import { useEffect, useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { atajoDeRaton, FOCO_CELDA } from '../../lib/accesibilidad'
import { escapeHtml, imprimirTablaHTML } from '../../lib/imprimir'
import { formatFechaLocal } from '../../lib/fechas'
import { registrarAcceso } from '../../lib/accesos'
import { supabase } from '../../lib/supabase'
import { nombreCompleto, nombreYApellido } from '../../types'
import { Download, Printer, Search, ChevronDown, ChevronRight } from 'lucide-react'
import { TIPO_EVENTO_LABEL, TIPO_EVENTO_COLOR, TURNO_LABEL, FILTRO_TIPOS_RETIRADOS, type TipoEvento } from '../../types/eventos'
import { InputFecha } from '../../components/InputFecha'
import { TIPOS_ORDEN, rutaIncidencia, DIAS_VENTANA_ACTUALES } from './util'

const MAX_RESULTADOS = 1000

function escaparCsv(v: string): string {
  return `"${v.replace(/"/g, '""')}"`
}

// Consulta del histórico de incidencias, con filtros. Al entrar busca sola (por defecto, los últimos 30 días) y desde
// el Dashboard puede llegar con filtros ya decididos en la dirección. Es el único sitio con imprimir y exportar, y actúa
// exactamente sobre lo que el filtro esté mostrando, con los filtros indicados arriba.
export function Historico() {
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()

  const [profesionales, setProfesionales] = useState<{ id: string; nombre: string; apellidos: string; rol: string }[]>([])
  useEffect(() => {
    supabase.from('profesionales').select('id, nombre, apellidos, rol').order('apellidos')
      .then(({ data }) => setProfesionales(data ?? []))
  }, [])

  // Filtros iniciales: los de la dirección (si se llega desde el Dashboard) o los últimos 30 días.
  const [inicial] = useState(() => {
    const desde = searchParams.get('desde') ?? undefined
    const hasta = searchParams.get('hasta') ?? undefined
    const tipo = (searchParams.get('tipo_incidencia') as TipoEvento | null) ?? undefined
    const medico = searchParams.get('medico_responsable') ?? undefined
    const estado = searchParams.get('incidencias') === 'pendiente' ? 'pendiente' : undefined
    const hayFiltrosUrl = !!(desde || hasta || tipo || medico || searchParams.get('incidencias'))
    const desdeDefecto = formatFechaLocal(new Date(Date.now() - DIAS_VENTANA_ACTUALES * 86400000))
    return { desde: hayFiltrosUrl ? (desde ?? '') : desdeDefecto, hasta: hasta ?? '', tipo: tipo ?? '' as const, medico: medico ?? '', estado: estado ?? '' }
  })

  const [fDesde, setFDesde] = useState(inicial.desde)
  const [fHasta, setFHasta] = useState(inicial.hasta)
  const [fTipo, setFTipo] = useState<TipoEvento | ''>(inicial.tipo)
  const [fPaciente, setFPaciente] = useState('')
  const [fTurno, setFTurno] = useState('')
  const [fEstado, setFEstado] = useState(inicial.estado)
  const [fProfesional, setFProfesional] = useState('')
  const [fAlcance, setFAlcance] = useState<'activos' | 'cerrados' | 'todos'>('todos')
  // Médico responsable del ingreso (el mismo concepto que usa el Dashboard), distinto de quien registró la incidencia.
  const [fMedicoResponsable, setFMedicoResponsable] = useState(inicial.medico)
  // Los filtros menos usados van recogidos; si se llega con alguno ya puesto, se enseñan.
  const [masFiltros, setMasFiltros] = useState(!!(inicial.estado || inicial.medico))

  const [buscando, setBuscando] = useState(false)
  const [errorBusqueda, setErrorBusqueda] = useState('')
  const [resultados, setResultados] = useState<any[]>([])
  const [totalCoincidencias, setTotalCoincidencias] = useState(0)
  const [buscado, setBuscado] = useState(false)

  useEffect(() => {
    buscarIncidencias({ desde: inicial.desde, hasta: inicial.hasta, estado: inicial.estado, tipo: inicial.tipo, medicoResponsable: inicial.medico })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Con valores explícitos se evita depender de que React ya haya aplicado los set… de arriba (primera búsqueda y «Quitar filtros»).
  async function buscarIncidencias(o?: { desde?: string; hasta?: string; estado?: string; tipo?: TipoEvento | ''; medicoResponsable?: string; todoVacio?: boolean }) {
    setBuscando(true)
    setErrorBusqueda('')
    try {
      const vacio = !!o?.todoVacio
      const desde = o?.desde ?? (vacio ? '' : fDesde)
      const hasta = o?.hasta ?? (vacio ? '' : fHasta)
      const estado = o?.estado ?? (vacio ? '' : fEstado)
      const tipo = o?.tipo ?? (vacio ? '' : fTipo)
      const medicoResponsable = o?.medicoResponsable ?? (vacio ? '' : fMedicoResponsable)
      const turno = vacio ? '' : fTurno
      const profesional = vacio ? '' : fProfesional
      const alcance = vacio ? 'todos' : fAlcance

      let q = supabase
        .from('eventos')
        .select(`
          id, tipo, fecha, hora, turno, datos, notas, estado, habitacion_evento,
          registrado_por:profesionales!registrado_por_id(nombre, apellidos),
          ingreso:ingresos!inner(id, habitacion, estado, medico_responsable_id, paciente:pacientes(nombre, primer_apellido, segundo_apellido))
        `, { count: 'exact' })
        .not('tipo', 'in', FILTRO_TIPOS_RETIRADOS)   // úlceras (en Curas) e infección nosocomial (en el CMBD) ya no son incidencias
        .order('fecha', { ascending: false })
        .limit(MAX_RESULTADOS)

      if (desde) q = q.gte('fecha', desde)
      if (hasta) q = q.lte('fecha', hasta)
      if (tipo) q = q.eq('tipo', tipo)
      if (turno) q = q.eq('turno', turno)
      if (estado) q = q.eq('estado', estado)
      if (profesional) q = q.eq('registrado_por_id', profesional)
      if (medicoResponsable) q = q.eq('ingreso.medico_responsable_id', medicoResponsable)
      if (alcance === 'activos') q = q.eq('ingreso.estado', 'activo')
      if (alcance === 'cerrados') q = q.neq('ingreso.estado', 'activo')

      const { data, count, error } = await q
      if (error) {
        setErrorBusqueda('No se pudo completar la búsqueda: ' + error.message)
        return
      }
      // El nombre del paciente se filtra aquí: no hay forma limpia de filtrar por el nombre completo en la consulta.
      const paciente = vacio ? '' : fPaciente.trim()
      const filtrados = paciente
        ? (data ?? []).filter((ev: any) =>
            ev.ingreso?.paciente && nombreCompleto(ev.ingreso.paciente).toLowerCase().includes(paciente.toLowerCase()))
        : (data ?? [])
      setResultados(filtrados)
      setTotalCoincidencias(count ?? filtrados.length)
      setBuscado(true)
    } finally {
      setBuscando(false)
    }
  }

  function quitarFiltros() {
    setFDesde(''); setFHasta(''); setFTipo(''); setFPaciente('')
    setFTurno(''); setFEstado(''); setFProfesional(''); setFAlcance('todos'); setFMedicoResponsable('')
    buscarIncidencias({ todoVacio: true })
  }

  // Resumen legible de los filtros aplicados: se repite en pantalla, en el CSV y en la impresión.
  function resumenFiltros(): string {
    const partes: string[] = []
    if (fDesde || fHasta) partes.push(`Del ${fDesde || '...'} al ${fHasta || 'hoy'}`)
    if (fTipo) partes.push(TIPO_EVENTO_LABEL[fTipo])
    if (fPaciente) partes.push(`Paciente: "${fPaciente}"`)
    if (fTurno) partes.push(`Turno: ${TURNO_LABEL[fTurno as keyof typeof TURNO_LABEL]}`)
    if (fEstado) partes.push(fEstado === 'pendiente' ? 'Pendientes de completar' : 'Completas')
    if (fProfesional) {
      const p = profesionales.find((x) => x.id === fProfesional)
      if (p) partes.push(`Registrado por ${p.nombre} ${p.apellidos}`)
    }
    if (fMedicoResponsable) {
      const m = profesionales.find((x) => x.id === fMedicoResponsable)
      if (m) partes.push(`Médico responsable: ${m.nombre} ${m.apellidos}`)
    }
    partes.push(fAlcance === 'activos' ? 'Solo ingresos activos' : fAlcance === 'cerrados' ? 'Solo episodios cerrados' : 'Activos y cerrados')
    return partes.join(' · ')
  }

  function exportarCSVBusqueda() {
    registrarAcceso('exportacion_csv', { detalle: 'Incidencias' })
    const cabecera = ['Fecha', 'Turno', 'Tipo', 'Estado', 'Paciente', 'Habitación en el momento', 'Episodio', 'Notas', 'Registrado por']
      .map(escaparCsv).join(',')
    const filas = resultados.map((ev) => [
      ev.fecha,
      ev.turno ? TURNO_LABEL[ev.turno as keyof typeof TURNO_LABEL] : 'Sin turno especificado',
      TIPO_EVENTO_LABEL[ev.tipo as TipoEvento],
      ev.estado === 'pendiente' ? 'Pendiente de completar' : 'Completa',
      ev.ingreso?.paciente ? nombreCompleto(ev.ingreso.paciente) : '',
      // La habitación del momento del suceso, no la actual: un traslado posterior no cambia un dato ya exportado.
      ev.habitacion_evento ?? ev.ingreso?.habitacion ?? '',
      ev.ingreso?.estado === 'activo' ? 'Ingreso activo' : 'Episodio cerrado',
      ev.notas ?? '',
      ev.registrado_por ? `${ev.registrado_por.nombre} ${ev.registrado_por.apellidos}` : '',
    ].map((v) => escaparCsv(String(v))).join(','))
    const csv = '﻿' + [`"Filtros: ${resumenFiltros().replace(/"/g, "'")}"`, cabecera, ...filas].join('\r\n')
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `incidencias_busqueda_${new Date().toISOString().slice(0, 10)}.csv`
    a.click()
    URL.revokeObjectURL(url)
  }

  function imprimirBusqueda() {
    const thead = `<tr><th>Fecha</th><th>Turno</th><th>Tipo</th><th>Estado</th><th>Paciente</th><th>Hab.</th><th>Episodio</th><th>Notas</th><th>Registrado por</th></tr>`
    const tbody = resultados.map((ev) => `<tr>
        <td>${new Date(ev.fecha).toLocaleDateString('es-ES')}</td>
        <td>${ev.turno ? escapeHtml(TURNO_LABEL[ev.turno as keyof typeof TURNO_LABEL]) : 'Sin turno especificado'}</td>
        <td>${escapeHtml(TIPO_EVENTO_LABEL[ev.tipo as TipoEvento])}</td>
        <td>${ev.estado === 'pendiente' ? 'Pendiente' : 'Completa'}</td>
        <td>${ev.ingreso?.paciente ? escapeHtml(nombreYApellido(ev.ingreso.paciente)) : ''}</td>
        <td>${ev.habitacion_evento ?? ev.ingreso?.habitacion ?? ''}</td>
        <td>${ev.ingreso?.estado === 'activo' ? 'Activo' : 'Cerrado'}</td>
        <td>${escapeHtml(ev.notas ?? '')}</td>
        <td>${ev.registrado_por ? escapeHtml(`${ev.registrado_por.nombre} ${ev.registrado_por.apellidos}`) : ''}</td>
      </tr>`).join('')
    imprimirTablaHTML('Búsqueda de incidencias', `Filtros: ${resumenFiltros()}`, thead, tbody)
  }

  const truncado = buscado && totalCoincidencias > MAX_RESULTADOS

  return (
    <div className="space-y-3">
      <div className="card p-4 space-y-3">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <div>
            <label className="label">Desde</label>
            <InputFecha value={fDesde} onChange={setFDesde} />
          </div>
          <div>
            <label className="label">Hasta</label>
            <InputFecha value={fHasta} onChange={setFHasta} />
          </div>
          <div>
            <label className="label">Tipo</label>
            <select className="input" value={fTipo} onChange={(e) => setFTipo(e.target.value as TipoEvento | '')}>
              <option value="">Todos</option>
              {TIPOS_ORDEN.map((t) => <option key={t} value={t}>{TIPO_EVENTO_LABEL[t]}</option>)}
            </select>
          </div>
          <div>
            <label className="label">Paciente</label>
            <input className="input" placeholder="Nombre…" value={fPaciente}
              onChange={(e) => setFPaciente(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') buscarIncidencias() }} />
          </div>
        </div>

        <button type="button" onClick={() => setMasFiltros((v) => !v)} aria-expanded={masFiltros}
          className="inline-flex items-center gap-1 text-xs font-medium text-slate-500 hover:text-slate-700">
          {masFiltros ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronRight className="w-3.5 h-3.5" />}
          Más filtros
        </button>
        {masFiltros && (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <div>
              <label className="label">Turno</label>
              <select className="input" value={fTurno} onChange={(e) => setFTurno(e.target.value)}>
                <option value="">Todos</option>
                {Object.entries(TURNO_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
              </select>
            </div>
            <div>
              <label className="label">Estado</label>
              <select className="input" value={fEstado} onChange={(e) => setFEstado(e.target.value)}>
                <option value="">Todos</option>
                <option value="completa">Completa</option>
                <option value="pendiente">Pendiente de completar</option>
              </select>
            </div>
            <div>
              <label className="label">Registrado por</label>
              <select className="input" value={fProfesional} onChange={(e) => setFProfesional(e.target.value)}>
                <option value="">Todos</option>
                {profesionales.map((p) => <option key={p.id} value={p.id}>{p.nombre} {p.apellidos}</option>)}
              </select>
            </div>
            <div>
              <label className="label">Médico responsable del ingreso</label>
              <select className="input" value={fMedicoResponsable} onChange={(e) => setFMedicoResponsable(e.target.value)}>
                <option value="">Todos</option>
                {profesionales.filter((p) => p.rol === 'medico').map((p) => <option key={p.id} value={p.id}>{p.nombre} {p.apellidos}</option>)}
              </select>
            </div>
            <div>
              <label className="label">Episodios</label>
              <select className="input" value={fAlcance} onChange={(e) => setFAlcance(e.target.value as typeof fAlcance)}>
                <option value="todos">Activos y cerrados</option>
                <option value="activos">Solo ingresos activos</option>
                <option value="cerrados">Solo episodios cerrados</option>
              </select>
            </div>
          </div>
        )}

        <div className="flex items-center gap-2 pt-1">
          <button onClick={() => buscarIncidencias()} disabled={buscando} className="btn-primary text-sm">
            <Search className="w-4 h-4" />
            {buscando ? 'Buscando…' : 'Buscar'}
          </button>
          <button onClick={quitarFiltros} disabled={buscando} className="btn-secondary text-sm">Quitar filtros</button>
        </div>
      </div>

      {errorBusqueda && (
        <div className="bg-red-50 border border-red-200 text-red-700 text-sm rounded-lg px-4 py-3">{errorBusqueda}</div>
      )}

      {truncado && !errorBusqueda && (
        <div className="bg-amber-50 border border-amber-200 text-amber-800 text-xs rounded-lg px-4 py-2.5">
          Hay {totalCoincidencias.toLocaleString('es-ES')} incidencias con estos filtros y se muestran las {MAX_RESULTADOS.toLocaleString('es-ES')} más recientes. Acota las fechas para ver el resto.
        </div>
      )}

      {buscado && !errorBusqueda && (
        <div className="card overflow-x-auto">
          <div className="flex items-center justify-between gap-3 px-4 py-2.5 bg-slate-50 border-b flex-wrap">
            <p className="text-xs text-slate-500">
              <span className="font-semibold text-slate-700">{resultados.length}</span> resultado{resultados.length === 1 ? '' : 's'} · {resumenFiltros()}
            </p>
            {resultados.length > 0 && (
              <div className="flex gap-2">
                <button onClick={exportarCSVBusqueda} className="btn-secondary text-xs py-1 gap-1">
                  <Download className="w-3.5 h-3.5" /> Exportar CSV
                </button>
                <button onClick={imprimirBusqueda} className="btn-secondary text-xs py-1 gap-1">
                  <Printer className="w-3.5 h-3.5" /> Imprimir
                </button>
              </div>
            )}
          </div>
          {resultados.length === 0 ? (
            <p className="px-4 py-8 text-center text-slate-500 text-sm">Sin incidencias con estos filtros.</p>
          ) : (
            <table className="w-full text-sm min-w-[720px]">
              <thead>
                <tr className="border-b bg-slate-50 text-left text-xs font-semibold text-slate-500">
                  <th className="px-4 py-2">Fecha</th>
                  <th className="px-4 py-2">Tipo</th>
                  <th className="px-4 py-2">Estado</th>
                  <th className="px-4 py-2">Paciente</th>
                  <th className="px-4 py-2">Episodio</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {resultados.map((ev) => {
                  const ruta = ev.ingreso?.id ? rutaIncidencia(ev.ingreso.id, ev.id) : null
                  return (
                    <tr key={ev.id} className="hover:bg-slate-50 cursor-pointer"
                      onClick={atajoDeRaton(() => { if (ruta) navigate(ruta) })}>
                      <td className="px-4 py-2 text-slate-500 text-xs">
                        {new Date(ev.fecha).toLocaleDateString('es-ES')}
                        {ev.turno ? ` · ${TURNO_LABEL[ev.turno as keyof typeof TURNO_LABEL]}` : ' · Sin turno'}
                      </td>
                      <td className="px-4 py-2">
                        <span className={`px-2 py-0.5 rounded-full text-xs font-medium border ${TIPO_EVENTO_COLOR[ev.tipo as TipoEvento]}`}>
                          {TIPO_EVENTO_LABEL[ev.tipo as TipoEvento]}
                        </span>
                      </td>
                      <td className="px-4 py-2">
                        {ev.estado === 'pendiente'
                          ? <span className="text-amber-600 text-xs font-medium">Pendiente</span>
                          : <span className="text-slate-500 text-xs">Completa</span>}
                      </td>
                      <td className="px-4 py-2 font-medium text-slate-700">
                        {ev.ingreso?.paciente && ruta ? (
                          <Link to={ruta} className={`hover:text-primary-700 hover:underline ${FOCO_CELDA}`}>{nombreCompleto(ev.ingreso.paciente)}</Link>
                        ) : ev.ingreso?.paciente ? nombreCompleto(ev.ingreso.paciente) : '—'}
                      </td>
                      <td className="px-4 py-2 text-xs">
                        {ev.ingreso?.estado === 'activo'
                          ? <span className="text-emerald-700">Activo</span>
                          : <span className="text-slate-500">Cerrado</span>}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          )}
        </div>
      )}
    </div>
  )
}
