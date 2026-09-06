import { useEffect, useRef, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { supabase } from '../../lib/supabase'
import { imprimirTablaHTML, escapeHtml } from '../../lib/imprimir'
import { Download, Printer, ChevronLeft, ChevronRight, ArrowUpDown } from 'lucide-react'
import type { EstadoCarga } from './tipos'
import { EstadoCargando, EstadoError, EstadoSinDatos } from './ComponentesDashboard'

const ESTADO_LABEL: Record<string, string> = { activo: 'Ingresado', alta: 'Alta', alta_traslado: 'Traslado', exitus: 'Éxitus' }
const TIPOS_INCIDENCIA = [
  { valor: 'caida', etiqueta: 'Caída' }, { valor: 'ulcera', etiqueta: 'Úlcera por presión' },
  { valor: 'error_medicacion', etiqueta: 'Error de medicación' }, { valor: 'efecto_adverso_medicacion', etiqueta: 'Efecto adverso' },
  { valor: 'infeccion_nosocomial', etiqueta: 'Infección nosocomial' }, { valor: 'agresividad_fisica', etiqueta: 'Agresividad física' },
  { valor: 'fuga', etiqueta: 'Fuga' },
]

interface Fila {
  id: string; fecha_ingreso: string; fecha_alta: string | null; estado: string
  habitacion: number | null; nhc: string | null; paciente: string; medico: string | null
  dias_estancia: number; num_incidencias: number
}

interface FiltrosExplorador {
  busqueda: string
  desdeIngreso: string; hastaIngreso: string
  desdeAlta: string; hastaAlta: string
  solapaDesde: string; solapaHasta: string
  estado: string
  medicoId: string
  estanciaMin: string; estanciaMax: string
  conIncidencias: string // '' | 'si' | 'no'
  tipoIncidencia: string
}

const FILTROS_VACIOS: FiltrosExplorador = {
  busqueda: '', desdeIngreso: '', hastaIngreso: '', desdeAlta: '', hastaAlta: '',
  solapaDesde: '', solapaHasta: '', estado: '', medicoId: '', estanciaMin: '', estanciaMax: '',
  conIncidencias: '', tipoIncidencia: '',
}

export function ExploradorEpisodios({ filtrosIniciales }: { filtrosIniciales?: Record<string, string> }) {
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()

  const [filtros, setFiltros] = useState<FiltrosExplorador>(() => {
    const f = filtrosIniciales ?? Object.fromEntries(searchParams.entries())
    return {
      ...FILTROS_VACIOS,
      desdeIngreso: f.desde_ingreso || '',
      hastaIngreso: f.hasta_ingreso || '',
      desdeAlta: f.desde_alta || '',
      hastaAlta: f.hasta_alta || '',
      estado: f.estado || '',
      estanciaMin: f.estancia_min || '',
    }
  })
  const [medicos, setMedicos] = useState<{ id: string; nombre: string; apellidos: string }[]>([])
  const [orden, setOrden] = useState<'paciente' | 'ingreso' | 'alta' | 'estancia' | 'medico'>('ingreso')
  const [ordenDir, setOrdenDir] = useState<'asc' | 'desc'>('desc')
  const [pagina, setPagina] = useState(1)
  const POR_PAGINA = 50

  const [filas, setFilas] = useState<Fila[]>([])
  const [total, setTotal] = useState(0)
  const [estado, setEstado] = useState<EstadoCarga>('cargando')
  const [error, setError] = useState('')
  const secuenciaRef = useRef(0)

  useEffect(() => {
    supabase.from('profesionales').select('id, nombre, apellidos').eq('rol', 'medico').order('apellidos')
      .then(({ data }) => setMedicos(data ?? []))
  }, [])

  function parametrosRPC(paginar: boolean) {
    return {
      p_busqueda: filtros.busqueda || null,
      p_desde_ingreso: filtros.desdeIngreso || null,
      p_hasta_ingreso: filtros.hastaIngreso || null,
      p_desde_alta: filtros.desdeAlta || null,
      p_hasta_alta: filtros.hastaAlta || null,
      p_solapa_desde: filtros.solapaDesde || null,
      p_solapa_hasta: filtros.solapaHasta || null,
      p_estado: filtros.estado || null,
      p_medico_id: filtros.medicoId || null,
      p_estancia_min: filtros.estanciaMin ? Number(filtros.estanciaMin) : null,
      p_estancia_max: filtros.estanciaMax ? Number(filtros.estanciaMax) : null,
      p_con_incidencias: filtros.conIncidencias ? filtros.conIncidencias === 'si' : null,
      p_tipo_incidencia: filtros.tipoIncidencia || null,
      p_orden: orden,
      p_orden_dir: ordenDir,
      p_pagina: pagina,
      p_por_pagina: POR_PAGINA,
      p_paginar: paginar,
    }
  }

  async function buscar() {
    const miSecuencia = ++secuenciaRef.current
    setEstado('cargando')
    setError('')
    const { data, error: err } = await supabase.rpc('buscar_episodios_dashboard', parametrosRPC(true))
    if (miSecuencia !== secuenciaRef.current) return
    if (err) {
      setError(err.message)
      setEstado('error')
      return
    }
    setFilas(data?.filas ?? [])
    setTotal(data?.total ?? 0)
    setEstado((data?.filas ?? []).length === 0 ? 'sin_datos' : 'listo')
  }

  useEffect(() => { buscar() }, [filtros, orden, ordenDir, pagina])

  function cambiarOrden(col: typeof orden) {
    if (orden === col) setOrdenDir((d) => (d === 'asc' ? 'desc' : 'asc'))
    else { setOrden(col); setOrdenDir('asc') }
    setPagina(1)
  }

  function set(cambios: Partial<FiltrosExplorador>) {
    setFiltros((f) => ({ ...f, ...cambios }))
    setPagina(1)
  }

  // Un resumen legible de los filtros aplicados, para que la
  // exportación y la impresión nunca se confundan con "todos los
  // episodios sin más".
  function resumenFiltros(): string {
    const partes: string[] = []
    if (filtros.busqueda) partes.push(`Paciente/NHC: "${filtros.busqueda}"`)
    if (filtros.desdeIngreso || filtros.hastaIngreso) partes.push(`Ingreso: ${filtros.desdeIngreso || '…'} a ${filtros.hastaIngreso || '…'}`)
    if (filtros.desdeAlta || filtros.hastaAlta) partes.push(`Alta: ${filtros.desdeAlta || '…'} a ${filtros.hastaAlta || '…'}`)
    if (filtros.solapaDesde || filtros.solapaHasta) partes.push(`Solapa: ${filtros.solapaDesde || '…'} a ${filtros.solapaHasta || '…'}`)
    if (filtros.estado) partes.push(ESTADO_LABEL[filtros.estado] ?? filtros.estado)
    if (filtros.medicoId) { const m = medicos.find((x) => x.id === filtros.medicoId); if (m) partes.push(`Médico: ${m.nombre} ${m.apellidos}`) }
    if (filtros.estanciaMin) partes.push(`Estancia ≥ ${filtros.estanciaMin} d`)
    if (filtros.estanciaMax) partes.push(`Estancia ≤ ${filtros.estanciaMax} d`)
    if (filtros.conIncidencias) partes.push(filtros.conIncidencias === 'si' ? 'Con incidencias' : 'Sin incidencias')
    if (filtros.tipoIncidencia) partes.push(TIPOS_INCIDENCIA.find((t) => t.valor === filtros.tipoIncidencia)?.etiqueta ?? filtros.tipoIncidencia)
    return partes.length > 0 ? partes.join(' · ') : 'Sin filtros aplicados'
  }

  async function exportarCSV() {
    const { data, error: err } = await supabase.rpc('buscar_episodios_dashboard', parametrosRPC(false))
    if (err) { alert('No se pudo exportar: ' + err.message); return }
    const todas: Fila[] = data?.filas ?? []
    const cabecera = ['Paciente', 'NHC', 'Fecha ingreso', 'Fecha alta', 'Estado', 'Días estancia', 'Médico', 'Incidencias'].map(csv).join(',')
    const cuerpo = todas.map((f) => [
      f.paciente, f.nhc ?? '', f.fecha_ingreso, f.fecha_alta ?? '', ESTADO_LABEL[f.estado] ?? f.estado,
      String(f.dias_estancia), f.medico ?? '', String(f.num_incidencias),
    ].map(csv).join(','))
    const contenido = '\uFEFF' + [`"Filtros: ${resumenFiltros().replace(/"/g, "'")}"`, cabecera, ...cuerpo].join('\r\n')
    const blob = new Blob([contenido], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `episodios_${new Date().toISOString().slice(0, 10)}.csv`
    a.click()
    URL.revokeObjectURL(url)
  }
  function csv(v: string): string { return `"${v.replace(/"/g, '""')}"` }

  async function imprimir() {
    const { data, error: err } = await supabase.rpc('buscar_episodios_dashboard', parametrosRPC(false))
    if (err) { alert('No se pudo preparar la impresión: ' + err.message); return }
    const todas: Fila[] = data?.filas ?? []
    const thead = '<tr><th>Paciente</th><th>NHC</th><th>Ingreso</th><th>Alta</th><th>Estado</th><th>Días</th><th>Médico</th><th>Incidencias</th></tr>'
    const tbody = todas.map((f) => `<tr>
        <td>${escapeHtml(f.paciente)}</td><td>${escapeHtml(f.nhc ?? '')}</td>
        <td>${new Date(f.fecha_ingreso).toLocaleDateString('es-ES')}</td>
        <td>${f.fecha_alta ? new Date(f.fecha_alta).toLocaleDateString('es-ES') : ''}</td>
        <td>${escapeHtml(ESTADO_LABEL[f.estado] ?? f.estado)}</td>
        <td>${f.dias_estancia}</td><td>${escapeHtml(f.medico ?? '')}</td><td>${f.num_incidencias}</td>
      </tr>`).join('')
    imprimirTablaHTML('Explorador de episodios', `Filtros: ${resumenFiltros()}`, thead, tbody)
  }

  const totalPaginas = Math.max(1, Math.ceil(total / POR_PAGINA))

  function CabeceraOrden({ col, children }: { col: typeof orden; children: React.ReactNode }) {
    return (
      <th className="px-4 py-2 cursor-pointer select-none hover:text-slate-700" onClick={() => cambiarOrden(col)}>
        <span className="flex items-center gap-1">{children}<ArrowUpDown className="w-3 h-3 opacity-50" /></span>
      </th>
    )
  }

  return (
    <div className="space-y-4">
      <div className="card p-4 space-y-3">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <div className="col-span-2">
            <label className="label">Paciente o NHC</label>
            <input className="input" value={filtros.busqueda} onChange={(e) => set({ busqueda: e.target.value })} />
          </div>
          <div>
            <label className="label">Estado</label>
            <select className="input" value={filtros.estado} onChange={(e) => set({ estado: e.target.value })}>
              <option value="">Todos</option>
              {Object.entries(ESTADO_LABEL).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
            </select>
          </div>
          <div>
            <label className="label">Médico</label>
            <select className="input" value={filtros.medicoId} onChange={(e) => set({ medicoId: e.target.value })}>
              <option value="">Todos</option>
              {medicos.map((m) => <option key={m.id} value={m.id}>{m.nombre} {m.apellidos}</option>)}
            </select>
          </div>

          <div><label className="label">Ingreso desde</label><input type="date" className="input" value={filtros.desdeIngreso} onChange={(e) => set({ desdeIngreso: e.target.value })} /></div>
          <div><label className="label">Ingreso hasta</label><input type="date" className="input" value={filtros.hastaIngreso} onChange={(e) => set({ hastaIngreso: e.target.value })} /></div>
          <div><label className="label">Alta desde</label><input type="date" className="input" value={filtros.desdeAlta} onChange={(e) => set({ desdeAlta: e.target.value })} /></div>
          <div><label className="label">Alta hasta</label><input type="date" className="input" value={filtros.hastaAlta} onChange={(e) => set({ hastaAlta: e.target.value })} /></div>

          <div><label className="label">Solapa periodo desde</label><input type="date" className="input" value={filtros.solapaDesde} onChange={(e) => set({ solapaDesde: e.target.value })} /></div>
          <div><label className="label">Solapa periodo hasta</label><input type="date" className="input" value={filtros.solapaHasta} onChange={(e) => set({ solapaHasta: e.target.value })} /></div>
          <div><label className="label">Estancia mínima (días)</label><input type="number" min={0} className="input" value={filtros.estanciaMin} onChange={(e) => set({ estanciaMin: e.target.value })} /></div>
          <div><label className="label">Estancia máxima (días)</label><input type="number" min={0} className="input" value={filtros.estanciaMax} onChange={(e) => set({ estanciaMax: e.target.value })} /></div>

          <div>
            <label className="label">Incidencias</label>
            <select className="input" value={filtros.conIncidencias} onChange={(e) => set({ conIncidencias: e.target.value, tipoIncidencia: e.target.value !== 'si' ? '' : filtros.tipoIncidencia })}>
              <option value="">Todos</option>
              <option value="si">Con incidencias</option>
              <option value="no">Sin incidencias</option>
            </select>
          </div>
          {filtros.conIncidencias === 'si' && (
            <div>
              <label className="label">Tipo de incidencia</label>
              <select className="input" value={filtros.tipoIncidencia} onChange={(e) => set({ tipoIncidencia: e.target.value })}>
                <option value="">Cualquiera</option>
                {TIPOS_INCIDENCIA.map((t) => <option key={t.valor} value={t.valor}>{t.etiqueta}</option>)}
              </select>
            </div>
          )}
        </div>
        <div className="flex items-center justify-between">
          <button onClick={() => setFiltros(FILTROS_VACIOS)} className="btn-secondary text-xs">Limpiar filtros</button>
          <div className="flex gap-2">
            <button onClick={exportarCSV} className="btn-secondary text-xs gap-1"><Download className="w-3.5 h-3.5" /> Exportar CSV</button>
            <button onClick={imprimir} className="btn-secondary text-xs gap-1"><Printer className="w-3.5 h-3.5" /> Imprimir</button>
          </div>
        </div>
      </div>

      <p className="text-xs text-slate-500">{total} episodio{total === 1 ? '' : 's'} · {resumenFiltros()}</p>

      <div className="card overflow-hidden">
        {estado === 'cargando' && <EstadoCargando />}
        {estado === 'error' && <EstadoError mensaje={error} onReintentar={buscar} />}
        {estado === 'sin_datos' && <EstadoSinDatos mensaje="Ningún episodio coincide con estos filtros." />}
        {estado === 'listo' && (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b bg-slate-50 text-left text-xs font-semibold text-slate-500 uppercase tracking-wide">
                <CabeceraOrden col="paciente">Paciente</CabeceraOrden>
                <th className="px-4 py-2">NHC</th>
                <CabeceraOrden col="ingreso">Ingreso</CabeceraOrden>
                <CabeceraOrden col="alta">Alta</CabeceraOrden>
                <th className="px-4 py-2">Estado</th>
                <CabeceraOrden col="estancia">Días</CabeceraOrden>
                <CabeceraOrden col="medico">Médico</CabeceraOrden>
                <th className="px-4 py-2 text-right">Incidencias</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {filas.map((f) => (
                <tr key={f.id} className="hover:bg-slate-50 cursor-pointer" onClick={() => navigate(`/ingresos/${f.id}`)}>
                  <td className="px-4 py-2 font-medium text-slate-700">{f.paciente}</td>
                  <td className="px-4 py-2 text-slate-500">{f.nhc ?? '—'}</td>
                  <td className="px-4 py-2">{new Date(f.fecha_ingreso).toLocaleDateString('es-ES')}</td>
                  <td className="px-4 py-2">{f.fecha_alta ? new Date(f.fecha_alta).toLocaleDateString('es-ES') : '—'}</td>
                  <td className="px-4 py-2">{ESTADO_LABEL[f.estado] ?? f.estado}</td>
                  <td className="px-4 py-2 tabular-nums">{f.dias_estancia}</td>
                  <td className="px-4 py-2">{f.medico ?? '—'}</td>
                  <td className="px-4 py-2 text-right tabular-nums">{f.num_incidencias || <span className="text-slate-300">—</span>}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {estado === 'listo' && totalPaginas > 1 && (
        <div className="flex items-center justify-center gap-3">
          <button disabled={pagina <= 1} onClick={() => setPagina((p) => p - 1)} className="btn-secondary text-xs disabled:opacity-40">
            <ChevronLeft className="w-4 h-4" />
          </button>
          <span className="text-xs text-slate-500">Página {pagina} de {totalPaginas}</span>
          <button disabled={pagina >= totalPaginas} onClick={() => setPagina((p) => p + 1)} className="btn-secondary text-xs disabled:opacity-40">
            <ChevronRight className="w-4 h-4" />
          </button>
        </div>
      )}
    </div>
  )
}
