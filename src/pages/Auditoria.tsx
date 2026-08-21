import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../lib/AuthContext'
import { History } from 'lucide-react'

// Etiquetas legibles
const TABLA_LABEL: Record<string, string> = {
  pacientes: 'Paciente',
  ingresos: 'Ingreso',
  informe_ingreso: 'Informe de ingreso',
  informe_alta: 'Informe de alta',
  cmbd: 'CMBD',
  profesionales: 'Personal',
}

const ACCION_LABEL: Record<string, string> = {
  INSERT: 'Creación',
  UPDATE: 'Edición',
  DELETE: 'Borrado',
}

const ACCION_COLOR: Record<string, string> = {
  INSERT: 'bg-emerald-50 text-emerald-700',
  UPDATE: 'bg-amber-50 text-amber-700',
  DELETE: 'bg-red-50 text-red-700',
}

interface Registro {
  id: number
  tabla: string
  registro_id: string | null
  accion: string
  usuario_id: string | null
  fecha: string
}

export function Auditoria() {
  const { esAdmin } = useAuth()
  const [registros, setRegistros] = useState<Registro[]>([])
  const [nombres, setNombres] = useState<Record<string, string>>({})
  const [cargando, setCargando] = useState(true)
  const [filtroTabla, setFiltroTabla] = useState('')

  async function cargar() {
    setCargando(true)
    // Últimos 300 cambios (suficiente para consulta; se puede paginar más adelante)
    let query = supabase
      .from('auditoria')
      .select('*')
      .order('fecha', { ascending: false })
      .limit(300)
    if (filtroTabla) query = query.eq('tabla', filtroTabla)
    const { data } = await query
    setRegistros((data as Registro[]) ?? [])

    // Mapa user_id → nombre del profesional
    const { data: profs } = await supabase
      .from('profesionales')
      .select('user_id, nombre, apellidos')
    const mapa: Record<string, string> = {}
    ;(profs ?? []).forEach((p: any) => {
      if (p.user_id) mapa[p.user_id] = `${p.nombre} ${p.apellidos}`
    })
    setNombres(mapa)
    setCargando(false)
  }

  useEffect(() => { cargar() }, [filtroTabla])

  if (!esAdmin) {
    return (
      <div className="p-8">
        <div className="card p-6 max-w-md">
          <p className="font-semibold text-slate-800">Acceso restringido</p>
          <p className="text-sm text-slate-500 mt-1">
            Solo los administradores pueden consultar la auditoría.
          </p>
        </div>
      </div>
    )
  }

  return (
    <div className="p-6 md:p-8 max-w-4xl">
      <div className="flex items-center gap-2 mb-1">
        <History className="w-5 h-5 text-slate-400" />
        <h1 className="text-xl font-bold text-slate-800">Auditoría de cambios</h1>
      </div>
      <p className="text-sm text-slate-500 mb-6">Quién ha creado, editado o borrado, y cuándo.</p>

      <div className="mb-4 max-w-xs">
        <label className="label">Filtrar por tipo</label>
        <select className="input" value={filtroTabla} onChange={(e) => setFiltroTabla(e.target.value)}>
          <option value="">Todos</option>
          {Object.entries(TABLA_LABEL).map(([v, l]) => (
            <option key={v} value={v}>{l}</option>
          ))}
        </select>
      </div>

      {cargando ? (
        <p className="text-slate-400">Cargando…</p>
      ) : registros.length === 0 ? (
        <div className="card p-10 text-center text-slate-400 text-sm">No hay cambios registrados.</div>
      ) : (
        <div className="card overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 text-slate-500 text-left">
              <tr>
                <th className="px-4 py-2 font-medium">Fecha y hora</th>
                <th className="px-4 py-2 font-medium">Quién</th>
                <th className="px-4 py-2 font-medium">Tipo</th>
                <th className="px-4 py-2 font-medium">Acción</th>
              </tr>
            </thead>
            <tbody>
              {registros.map((r) => (
                <tr key={r.id} className="border-t border-slate-100">
                  <td className="px-4 py-2 text-slate-600 whitespace-nowrap">
                    {new Date(r.fecha).toLocaleString('es-ES', {
                      day: '2-digit', month: '2-digit', year: 'numeric',
                      hour: '2-digit', minute: '2-digit',
                    })}
                  </td>
                  <td className="px-4 py-2 text-slate-800">
                    {r.usuario_id ? (nombres[r.usuario_id] ?? 'Usuario desconocido') : (
                      <span className="text-slate-400">Sistema</span>
                    )}
                  </td>
                  <td className="px-4 py-2 text-slate-600">{TABLA_LABEL[r.tabla] ?? r.tabla}</td>
                  <td className="px-4 py-2">
                    <span className={`px-2 py-0.5 rounded-full text-xs font-semibold ${ACCION_COLOR[r.accion] ?? 'bg-slate-100 text-slate-600'}`}>
                      {ACCION_LABEL[r.accion] ?? r.accion}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <p className="text-xs text-slate-400 mt-3">
        Se muestran los últimos 300 cambios. "Sistema" son cambios hechos por procesos automáticos.
      </p>
    </div>
  )
}
