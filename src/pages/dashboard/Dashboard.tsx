import { useEffect, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { LayoutDashboard } from 'lucide-react'
import { supabase } from '../../lib/supabase'
import type { Filtros, Periodo } from './tipos'
import { calcularRango } from './metricas'
import { DashboardFiltros } from './DashboardFiltros'
import { ResumenDashboard } from './ResumenDashboard'
import { ActividadDashboard } from './ActividadDashboard'
import { ExploradorEpisodios } from './ExploradorEpisodios'
import { SeguridadDashboard } from './SeguridadDashboard'

type Vista = 'resumen' | 'actividad' | 'seguridad' | 'explorador'

// Los filtros se reflejan en la URL, para poder compartir o volver a
// un mismo filtro sin tener que reconstruirlo a mano.
function filtrosDesdeURL(params: URLSearchParams): Filtros {
  return {
    periodo: (params.get('periodo') as Periodo) || 'mes',
    desde: params.get('desde') || '',
    hasta: params.get('hasta') || '',
    medicoId: params.get('medico'),
    comparar: params.get('comparar') === '1',
  }
}

export function Dashboard() {
  const navigate = useNavigate()
  const [searchParams, setSearchParams] = useSearchParams()
  const [vista, setVista] = useState<Vista>((searchParams.get('vista') as Vista) || 'resumen')
  const [filtros, setFiltros] = useState<Filtros>(() => filtrosDesdeURL(searchParams))

  // "Todo el historial" tiene que empezar en el primer ingreso real,
  // no en una fecha inventada — 2000-01-01 generaba miles de días
  // vacíos y una ocupación media que no significaba nada (0,2%).
  const [primeraFecha, setPrimeraFecha] = useState<string | null>(null)
  useEffect(() => {
    supabase.from('ingresos').select('fecha_ingreso').order('fecha_ingreso', { ascending: true }).limit(1)
      .then(({ data }) => setPrimeraFecha(data?.[0]?.fecha_ingreso ?? null))
  }, [])

  useEffect(() => {
    const params = new URLSearchParams()
    params.set('vista', vista)
    params.set('periodo', filtros.periodo)
    if (filtros.periodo === 'personalizado') {
      if (filtros.desde) params.set('desde', filtros.desde)
      if (filtros.hasta) params.set('hasta', filtros.hasta)
    }
    if (filtros.medicoId) params.set('medico', filtros.medicoId)
    if (filtros.comparar) params.set('comparar', '1')
    setSearchParams(params, { replace: true })
  }, [vista, filtros])

  const { desde, hasta } = calcularRango(filtros.periodo, filtros.desde, filtros.hasta, primeraFecha)

  // Los indicadores que llevan a "ver los episodios/incidencias que
  // componen la cifra" navegan fuera del Dashboard — no se duplica
  // aquí un buscador que ya existe en Incidencias. El médico
  // responsable viaja siempre con el resto de filtros: si la cifra
  // se calculó filtrada por un médico, el listado que la explica
  // tiene que aplicarlo también, o deja de ser exactamente esa cifra.
  function irAIncidencias(filtroExtra?: Record<string, string>) {
    const params = new URLSearchParams({ desde, hasta, ...filtroExtra })
    if (filtros.medicoId) params.set('medico_responsable', filtros.medicoId)
    navigate(`/eventos?${params.toString()}`)
  }

  // Distinto de irAIncidencias: esto se queda dentro del propio
  // Dashboard, cambiando a la pestaña del Explorador con los filtros
  // ya puestos — para las cifras de episodios (ingresos, altas,
  // estancias largas...), no de incidencias.
  const [presetExplorador, setPresetExplorador] = useState<Record<string, string> | null>(null)
  function irAExplorador(filtroExtra?: Record<string, string>) {
    const preset: Record<string, string> = { desde, hasta, ...filtroExtra }
    if (filtros.medicoId) preset.medico = filtros.medicoId
    setPresetExplorador(preset)
    setVista('explorador')
  }

  const vistas: { valor: Vista; etiqueta: string; disponible: boolean }[] = [
    { valor: 'resumen', etiqueta: 'Resumen', disponible: true },
    { valor: 'actividad', etiqueta: 'Actividad y ocupación', disponible: true },
    { valor: 'seguridad', etiqueta: 'Seguridad', disponible: true },
    { valor: 'explorador', etiqueta: 'Explorador de episodios', disponible: true },
  ]

  return (
    <div className="p-6 md:p-8 space-y-6 max-w-6xl">
      <div className="flex items-center gap-2">
        <LayoutDashboard className="w-5 h-5 text-slate-400" />
        <h1 className="text-2xl font-bold text-slate-800">Dashboard</h1>
      </div>

      <div className="flex gap-1 border-b">
        {vistas.map((v) => (
          <button
            key={v.valor}
            onClick={() => v.disponible && setVista(v.valor)}
            disabled={!v.disponible}
            title={!v.disponible ? 'Todavía no construida — próxima ronda' : undefined}
            className={`px-3 py-2 text-sm font-medium border-b-2 -mb-px transition-colors ${
              vista === v.valor ? 'border-primary-600 text-primary-700'
              : v.disponible ? 'border-transparent text-slate-500 hover:text-slate-700'
              : 'border-transparent text-slate-300 cursor-not-allowed'
            }`}
          >
            {v.etiqueta}
          </button>
        ))}
      </div>

      <DashboardFiltros filtros={filtros} onCambiar={setFiltros} mostrarComparar={vista === 'resumen'} />

      {vista === 'resumen' && (
        <ResumenDashboard filtros={filtros} desde={desde} hasta={hasta} onExplorar={irAIncidencias} onExplorarEpisodios={irAExplorador} />
      )}
      {vista === 'actividad' && (
        <ActividadDashboard filtros={filtros} desde={desde} hasta={hasta} onExplorar={irAExplorador} />
      )}
      {vista === 'seguridad' && (
        <SeguridadDashboard filtros={filtros} desde={desde} hasta={hasta} onExplorar={irAIncidencias} />
      )}
      {vista === 'explorador' && <ExploradorEpisodios filtrosIniciales={presetExplorador ?? undefined} />}
      {vista !== 'resumen' && vista !== 'actividad' && vista !== 'explorador' && vista !== 'seguridad' && (
        <div className="card p-10 text-center text-slate-400 text-sm">
          Esta vista se construye en una ronda posterior.
        </div>
      )}
    </div>
  )
}
