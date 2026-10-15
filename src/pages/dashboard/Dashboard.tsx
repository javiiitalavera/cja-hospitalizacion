import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { Download, LayoutDashboard } from 'lucide-react'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../lib/AuthContext'
import type { Filtros, Periodo } from './tipos'
import { calcularRango } from './metricas'
import { DashboardFiltros } from './DashboardFiltros'
import { ResumenDashboard } from './ResumenDashboard'
import { ActividadDashboard } from './ActividadDashboard'
import { ExploradorEpisodios } from './ExploradorEpisodios'
import { SeguridadDashboard } from './SeguridadDashboard'
import { DiagnosticosDashboard } from './DiagnosticosDashboard'
import { MedicacionDashboard } from './MedicacionDashboard'
import { EvolucionDashboard } from './EvolucionDashboard'
import { ContextoExportar, descargarExcel, etiquetaIntervalo, type AporteExport } from './exportar'

type Vista = 'resumen' | 'actividad' | 'diagnosticos' | 'evolucion' | 'medicacion' | 'seguridad' | 'explorador'

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
  const { esAdmin } = useAuth()
  const navigate = useNavigate()
  const [searchParams, setSearchParams] = useSearchParams()
  const vista = (searchParams.get('vista') as Vista) || 'resumen'
  const filtros = filtrosDesdeURL(searchParams)

  // "Todo el historial" tiene que empezar en el primer ingreso real,
  // no en una fecha inventada — 2000-01-01 generaba miles de días
  // vacíos y una ocupación media que no significaba nada (0,2%).
  const [primeraFecha, setPrimeraFecha] = useState<string | null>(null)
  useEffect(() => {
    supabase.from('ingresos').select('fecha_ingreso').order('fecha_ingreso', { ascending: true }).limit(1)
      .then(({ data }) => setPrimeraFecha(data?.[0]?.fecha_ingreso ?? null))
  }, [])

  // Médicos (para el filtro y para escribir su nombre en el intervalo y en los Excel exportados).
  const [medicos, setMedicos] = useState<{ id: string; nombre: string; apellidos: string }[]>([])
  useEffect(() => {
    supabase.from('profesionales').select('id, nombre, apellidos').eq('rol', 'medico').order('apellidos')
      .then(({ data }) => setMedicos(data ?? []))
  }, [])

  // Lo que aportan los apartados que están en pantalla al botón «Exportar datos de esta vista».
  const aportes = useRef(new Map<string, AporteExport>())
  const [nAportes, setNAportes] = useState(0)
  const registrar = useCallback((id: string, aporte: AporteExport | null) => {
    if (aporte) aportes.current.set(id, aporte); else aportes.current.delete(id)
    setNAportes(aportes.current.size)
  }, [])

  const { desde, hasta } = calcularRango(filtros.periodo, filtros.desde, filtros.hasta, primeraFecha)

  // Todo cambio de filtro o de vista se fusiona con lo que ya hay en
  // la URL — nunca se reconstruye desde cero. Antes, cambiar de
  // pestaña reescribía toda la URL solo con las claves que este
  // propio componente conocía, borrando por el camino los filtros
  // del Explorador (que vive en sus propias claves de la misma URL).
  function actualizarFiltros(nuevos: Filtros) {
    const params = new URLSearchParams(searchParams)
    params.set('periodo', nuevos.periodo)
    if (nuevos.periodo === 'personalizado') {
      if (nuevos.desde) params.set('desde', nuevos.desde); else params.delete('desde')
      if (nuevos.hasta) params.set('hasta', nuevos.hasta); else params.delete('hasta')
    } else {
      params.delete('desde')
      params.delete('hasta')
    }
    if (nuevos.medicoId) params.set('medico', nuevos.medicoId); else params.delete('medico')
    if (nuevos.comparar) params.set('comparar', '1'); else params.delete('comparar')
    setSearchParams(params, { replace: true })
  }

  function cambiarVista(v: Vista) {
    const params = new URLSearchParams(searchParams)
    params.set('vista', v)
    setSearchParams(params, { replace: true })
  }

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
  // ya puestos directamente en la URL — sin estado de React aparte,
  // que es precisamente lo que antes se perdía o reaparecía viejo al
  // cambiar de pestaña o recargar. La URL es la única fuente de
  // verdad, también para llegar aquí desde otra vista.
  function irAExplorador(filtroExtra?: Record<string, string>) {
    const params = new URLSearchParams(searchParams)
    params.set('vista', 'explorador')
    const claves = ['desde_ingreso', 'hasta_ingreso', 'desde_alta', 'hasta_alta', 'solapa_desde', 'solapa_hasta', 'estado', 'estancia_min', 'estancia_max', 'con_incidencias', 'tipo_incidencia'] as const
    for (const clave of claves) {
      const valor = filtroExtra?.[clave]
      if (valor) params.set(clave, valor)
      else params.delete(clave)
    }
    if (filtros.medicoId) params.set('medico', filtros.medicoId)
    params.delete('pagina')
    setSearchParams(params, { replace: true })
  }

  const vistas: { valor: Vista; etiqueta: string; disponible: boolean }[] = [
    { valor: 'resumen', etiqueta: 'Resumen', disponible: true },
    { valor: 'actividad', etiqueta: 'Actividad y ocupación', disponible: true },
    { valor: 'diagnosticos', etiqueta: 'Diagnósticos', disponible: true },
    { valor: 'evolucion', etiqueta: 'Evolución clínica', disponible: true },
    { valor: 'medicacion', etiqueta: 'Medicación', disponible: true },
    { valor: 'seguridad', etiqueta: 'Seguridad', disponible: true },
    { valor: 'explorador', etiqueta: 'Explorador de episodios', disponible: true },
  ]

  // Antes lo veía cualquier profesional — ahora, igual que Personal
  // y Auditoría, queda restringido a administradores. Va después de
  // todos los hooks a propósito: un "return" antes de un useState o
  // useEffect rompería las reglas de hooks de React en cuanto
  // esAdmin cambiara de valor entre renderizados.
  const nombreVista = vistas.find((v) => v.valor === vista)?.etiqueta ?? 'Dashboard'
  const medicoElegido = medicos.find((m) => m.id === filtros.medicoId)
  const medicoTexto = !filtros.medicoId ? 'Todos los médicos' : medicoElegido ? `${medicoElegido.nombre} ${medicoElegido.apellidos}` : 'Médico elegido'
  const contextoExportar = useMemo(
    () => ({ vista: nombreVista, desde, hasta, medico: medicoTexto, registrar }),
    [nombreVista, desde, hasta, medicoTexto, registrar],
  )

  if (!esAdmin) {
    return (
      <div className="p-8">
        <div className="card p-6 max-w-md">
          <p className="font-semibold text-slate-800">Acceso restringido</p>
          <p className="text-sm text-slate-500 mt-1">
            Solo los administradores pueden ver el Dashboard.
          </p>
        </div>
      </div>
    )
  }

  return (
    <div className="p-4 sm:p-6 md:p-8 space-y-6 ancho-tabla">
      <div className="flex items-center gap-2">
        <LayoutDashboard className="w-5 h-5 text-slate-500" />
        <h1 className="text-2xl font-bold text-slate-800">Dashboard</h1>
      </div>

      <div className="flex gap-1 border-b">
        {vistas.map((v) => (
          <button
            key={v.valor}
            onClick={() => v.disponible && cambiarVista(v.valor)}
            disabled={!v.disponible}
            title={!v.disponible ? 'Todavía no construida — próxima ronda' : undefined}
            className={`px-3 py-2 text-sm font-medium border-b-2 -mb-px transition-colors ${
              vista === v.valor ? 'border-primary-600 text-primary-700'
              : v.disponible ? 'border-transparent text-slate-500 hover:text-slate-700'
              : 'border-transparent text-slate-500 cursor-not-allowed'
            }`}
          >
            {v.etiqueta}
          </button>
        ))}
      </div>

      {/* El Explorador tiene sus propios filtros (fechas, estado,
          médico, estancia, incidencias) — la barra global no le
          afecta en absoluto, así que mostrarla ahí solo genera la
          falsa impresión de que "Este mes" o "Restablecer filtros"
          deberían hacer algo en esta pantalla. */}
      {vista !== 'explorador' && (
        <DashboardFiltros filtros={filtros} medicos={medicos} onCambiar={actualizarFiltros} mostrarComparar={vista === 'resumen'} />
      )}

      {/* El intervalo exacto que se está viendo (útil al copiar cifras) y la exportación de lo que hay en pantalla. */}
      {vista !== 'explorador' && (
        <div className="flex flex-wrap items-center justify-between gap-2 -mt-3">
          <p className="text-xs text-slate-600" data-intervalo>{etiquetaIntervalo(desde, hasta, medicoTexto)}</p>
          <button type="button" className="btn-secondary text-xs gap-1" disabled={nAportes === 0} data-exportar
            title={nAportes === 0 ? 'Espera a que se carguen los datos' : 'Descarga un Excel con las tablas de esta pestaña'}
            onClick={() => descargarExcel(contextoExportar, [...aportes.current.values()])}>
            <Download className="w-3.5 h-3.5" /> Exportar datos de esta vista
          </button>
        </div>
      )}

      <ContextoExportar.Provider value={contextoExportar}>

      {vista === 'resumen' && (
        <ResumenDashboard filtros={filtros} desde={desde} hasta={hasta} onExplorar={irAIncidencias} onExplorarEpisodios={irAExplorador} />
      )}
      {vista === 'actividad' && (
        <ActividadDashboard filtros={filtros} desde={desde} hasta={hasta} onExplorar={irAExplorador} />
      )}
      {vista === 'diagnosticos' && (
        <DiagnosticosDashboard filtros={filtros} desde={desde} hasta={hasta} />
      )}
      {vista === 'evolucion' && (
        <EvolucionDashboard filtros={filtros} desde={desde} hasta={hasta} />
      )}
      {vista === 'medicacion' && (
        <MedicacionDashboard filtros={filtros} desde={desde} hasta={hasta} />
      )}
      {vista === 'seguridad' && (
        <SeguridadDashboard filtros={filtros} desde={desde} hasta={hasta} onExplorar={irAIncidencias} onExplorarEpisodios={irAExplorador} />
      )}
      </ContextoExportar.Provider>
      {vista === 'explorador' && <ExploradorEpisodios />}
      {vista !== 'resumen' && vista !== 'actividad' && vista !== 'diagnosticos' && vista !== 'evolucion' && vista !== 'medicacion' && vista !== 'explorador' && vista !== 'seguridad' && (
        <div className="card p-10 text-center text-slate-500 text-sm">
          Esta vista se construye en una ronda posterior.
        </div>
      )}
    </div>
  )
}
