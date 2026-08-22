import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../../lib/supabase'
import { FileText, LogOut } from 'lucide-react'

const ESTADO_LABEL: Record<string, string> = {
  activo: 'Ingresado',
  alta: 'Alta',
  alta_traslado: 'Traslado',
  exitus: 'Éxitus',
}
const ESTADO_COLOR: Record<string, string> = {
  activo: 'bg-emerald-100 text-emerald-700',
  alta: 'bg-slate-100 text-slate-500',
  alta_traslado: 'bg-blue-100 text-blue-600',
  exitus: 'bg-red-100 text-red-600',
}

function TabHistorial({ pacienteId, ingresoActualId }: { pacienteId: string; ingresoActualId: string }) {
  const navigate = useNavigate()
  // biome-ignore lint/suspicious/noExplicitAny: Supabase untyped data
  const [ingresos, setIngresos] = useState<any[]>([])
  // Qué ingresos tienen informe de ingreso / de alta ya empezado
  const [conInformeIngreso, setConInformeIngreso] = useState<Set<string>>(new Set())
  const [conInformeAlta, setConInformeAlta] = useState<Set<string>>(new Set())
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    async function fetch() {
      const { data: ingresosData } = await supabase
        .from('ingresos')
        .select('*, medico_responsable:profesionales(nombre,apellidos), motivo_ingreso')
        .eq('paciente_id', pacienteId)
        .order('fecha_ingreso', { ascending: false })

      const list = ingresosData ?? []
      setIngresos(list)

      // biome-ignore lint/suspicious/noExplicitAny: Supabase untyped data
      const ids = list.map((i: any) => i.id)
      if (ids.length > 0) {
        const [{ data: informesIngreso }, { data: informesAlta }] = await Promise.all([
          supabase.from('informe_ingreso').select('ingreso_id').in('ingreso_id', ids),
          supabase.from('informe_alta').select('ingreso_id').in('ingreso_id', ids),
        ])
        setConInformeIngreso(new Set((informesIngreso ?? []).map((r: any) => r.ingreso_id)))
        setConInformeAlta(new Set((informesAlta ?? []).map((r: any) => r.ingreso_id)))
      }
      setLoading(false)
    }
    fetch()
  }, [pacienteId])

  if (loading) return <div className="text-slate-400 text-sm py-8 text-center">Cargando…</div>

  const ingresosAnteriores = ingresos.filter((i) => i.id !== ingresoActualId)

  return (
    <div className="max-w-3xl space-y-6">
      {/* Ingresos anteriores, con acceso directo a sus informes */}
      <div className="card overflow-hidden">
        <div className="px-5 py-4 border-b bg-slate-50">
          <p className="section-title mb-0">Ingresos anteriores</p>
        </div>
        {ingresosAnteriores.length === 0 ? (
          <div className="px-5 py-8 text-sm text-slate-400 text-center">No hay ingresos anteriores registrados.</div>
        ) : (
          <div className="divide-y">
            {ingresosAnteriores.map((ing) => {
              const dias =
                ing.fecha_alta && ing.fecha_ingreso
                  ? Math.round((new Date(ing.fecha_alta).getTime() - new Date(ing.fecha_ingreso).getTime()) / 86400000)
                  : null
              const tieneInfIngreso = conInformeIngreso.has(ing.id)
              const tieneInfAlta = conInformeAlta.has(ing.id)
              return (
                <div key={ing.id} className="px-5 py-4 hover:bg-slate-50 transition-colors">
                  <div
                    className="flex items-center justify-between cursor-pointer"
                    onClick={() => navigate(`/ingresos/${ing.id}`)}
                    onKeyDown={(e) => e.key === 'Enter' && navigate(`/ingresos/${ing.id}`)}
                  >
                    <div>
                      <div className="flex items-center gap-2 mb-1">
                        <span
                          className={`px-2 py-0.5 rounded-full text-xs font-medium ${ESTADO_COLOR[ing.estado] ?? 'bg-slate-100 text-slate-500'}`}
                        >
                          {ESTADO_LABEL[ing.estado] ?? ing.estado}
                        </span>
                        {ing.habitacion && <span className="text-xs text-slate-400">Hab. {ing.habitacion}</span>}
                        {dias != null && <span className="text-xs text-slate-400">{dias} días</span>}
                      </div>
                      <p className="text-sm text-slate-600">
                        {new Date(ing.fecha_ingreso).toLocaleDateString('es-ES')}
                        {ing.fecha_alta && ` → ${new Date(ing.fecha_alta).toLocaleDateString('es-ES')}`}
                      </p>
                      {ing.motivo_ingreso && (
                        <p className="text-xs text-slate-500 mt-0.5 italic">{ing.motivo_ingreso}</p>
                      )}
                      {ing.medico_responsable && (
                        <p className="text-xs text-slate-400 mt-0.5">{ing.medico_responsable.nombre} {ing.medico_responsable.apellidos}</p>
                      )}
                    </div>
                    <span className="text-primary-600 text-xs font-medium">Ver →</span>
                  </div>

                  {/* Acceso directo a los informes de este ingreso, si existen */}
                  {(tieneInfIngreso || tieneInfAlta) && (
                    <div className="flex gap-2 mt-2.5 pt-2.5 border-t border-slate-100">
                      {tieneInfIngreso && (
                        <button
                          onClick={(e) => { e.stopPropagation(); navigate(`/ingresos/${ing.id}?tab=ingreso`) }}
                          className="flex items-center gap-1 px-2 py-1 rounded-md bg-primary-50 text-primary-700 text-xs font-medium hover:bg-primary-100 transition-colors"
                        >
                          <FileText className="w-3 h-3" /> Informe de ingreso
                        </button>
                      )}
                      {tieneInfAlta && (
                        <button
                          onClick={(e) => { e.stopPropagation(); navigate(`/ingresos/${ing.id}?tab=alta`) }}
                          className="flex items-center gap-1 px-2 py-1 rounded-md bg-slate-100 text-slate-600 text-xs font-medium hover:bg-slate-200 transition-colors"
                        >
                          <LogOut className="w-3 h-3" /> Informe de alta
                        </button>
                      )}
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}

export { TabHistorial }
