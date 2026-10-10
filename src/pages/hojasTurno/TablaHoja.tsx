// La hoja de un turno en pantalla: una fila por habitación (la 1 a la 33). La usan «Hoy» (editable)
// y el histórico (solo lectura).

import { columnasManuales, TITULO_TURNO, type PacienteHoja } from './hoja'
import { FilaPaciente, type AccionesFila } from './FilaPaciente'
import type { Turno } from '../../types/pautaCuidados'

export function TablaHoja({ turno, pacientes, acciones }: {
  turno: Turno
  pacientes: PacienteHoja[]
  acciones?: AccionesFila
}) {
  const porHab = new Map(pacientes.map((p) => [p.habitacion, p]))
  const maxHab = Math.max(33, ...pacientes.map((p) => p.habitacion))
  const columnas = columnasManuales(turno)
  return (
    <div className="card overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="bg-slate-50 text-left text-xs font-semibold text-slate-500">
            <th className="px-3 py-2 text-center w-12">Hab.</th>
            <th className="px-3 py-2 whitespace-nowrap">Paciente</th>
            {/* Las que se rellenan a mano en el papel: aquí solo se muestran, para que se vea que es la hoja de turno. */}
            {columnas.map((c) => (
              <th key={c} className="px-1 py-2 text-center text-[10px] font-semibold text-slate-400 border-l border-dashed border-slate-200 w-14 min-w-14">{c}</th>
            ))}
            <th className="px-3 py-2">Vía</th>
            <th className="px-3 py-2">Indicaciones · {TITULO_TURNO[turno].toLowerCase()}</th>
          </tr>
        </thead>
        <tbody>
          {Array.from({ length: maxHab }, (_, k) => {
            const n = k + 1
            const p = porHab.get(n)
            return <FilaPaciente key={`${p?.ingresoId ?? n}-${turno}`} n={n} p={p} turno={turno} columnas={columnas} acciones={acciones} />
          })}
        </tbody>
      </table>
    </div>
  )
}
