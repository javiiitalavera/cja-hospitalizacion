import { Plus, Trash2 } from 'lucide-react'
import type { FilaMedicacion } from '../../types'

export const TOMAS: { key: keyof FilaMedicacion; label: string }[] = [
  { key: 'desayuno', label: 'Desayuno' },
  { key: 'comida',   label: 'Comida' },
  { key: 'merienda', label: 'Merienda' },
  { key: 'cena',     label: 'Cena' },
  { key: 'acostar',  label: 'Acostar' },
]

export function filaVacia(): FilaMedicacion {
  return { farmaco: '', dosis: '', desayuno: '', comida: '', merienda: '', cena: '', acostar: '', observaciones: '' }
}

export function TablaMedicacion({ filas, onChange }: {
  filas: FilaMedicacion[]
  onChange: (filas: FilaMedicacion[]) => void
}) {
  function update(i: number, key: keyof FilaMedicacion, v: string) {
    onChange(filas.map((f, idx) => idx === i ? { ...f, [key]: v } : f))
  }

  return (
    <div className="space-y-2">
      <div className="overflow-x-auto">
        <table className="w-full text-xs border-collapse">
          <thead>
            <tr className="bg-slate-100">
              <th className="border border-slate-200 px-2 py-2 text-left font-semibold text-slate-600 min-w-[160px]">Fármaco</th>
              <th className="border border-slate-200 px-2 py-2 text-left font-semibold text-slate-600 min-w-[80px]">Dosis</th>
              {TOMAS.map(t => (
                <th key={t.key} className="border border-slate-200 px-2 py-2 text-center font-semibold text-slate-600 min-w-[70px]">
                  {t.label}
                </th>
              ))}
              <th className="border border-slate-200 px-2 py-2 text-left font-semibold text-slate-600 min-w-[120px]">Observaciones</th>
              <th className="border border-slate-200 w-8"></th>
            </tr>
          </thead>
          <tbody>
            {filas.length === 0 ? (
              <tr>
                <td colSpan={9} className="border border-slate-200 px-4 py-4 text-center text-slate-400 italic">
                  Sin medicación añadida
                </td>
              </tr>
            ) : filas.map((f, i) => (
              <tr key={i} className="hover:bg-slate-50">
                <td className="border border-slate-200 p-1">
                  <input className="w-full bg-transparent px-1 py-0.5 focus:outline-none focus:bg-white focus:ring-1 focus:ring-primary-300 rounded text-slate-800"
                    value={f.farmaco} placeholder="Nombre del fármaco…"
                    onChange={e => update(i, 'farmaco', e.target.value)} />
                </td>
                <td className="border border-slate-200 p-1">
                  <input className="w-full bg-transparent px-1 py-0.5 focus:outline-none focus:bg-white focus:ring-1 focus:ring-primary-300 rounded text-slate-600"
                    value={f.dosis} placeholder="ej. 10 mg"
                    onChange={e => update(i, 'dosis', e.target.value)} />
                </td>
                {TOMAS.map(t => (
                  <td key={t.key} className="border border-slate-200 p-1 text-center">
                    <input className="w-full bg-transparent px-1 py-0.5 focus:outline-none focus:bg-white focus:ring-1 focus:ring-primary-300 rounded text-center text-slate-700"
                      value={f[t.key]} placeholder="—"
                      onChange={e => update(i, t.key, e.target.value)} />
                  </td>
                ))}
                <td className="border border-slate-200 p-1">
                  <input className="w-full bg-transparent px-1 py-0.5 focus:outline-none focus:bg-white focus:ring-1 focus:ring-primary-300 rounded text-slate-500"
                    value={f.observaciones} placeholder="Si precisa…"
                    onChange={e => update(i, 'observaciones', e.target.value)} />
                </td>
                <td className="border border-slate-200 p-1 text-center">
                  <button type="button"
                    onClick={() => onChange(filas.filter((_, idx) => idx !== i))}
                    className="text-slate-300 hover:text-red-500 transition-colors">
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <button type="button"
        onClick={() => onChange([...filas, filaVacia()])}
        className="flex items-center gap-1.5 text-xs text-primary-600 hover:text-primary-800 font-medium transition-colors py-1">
        <Plus className="w-3.5 h-3.5" /> Añadir fármaco
      </button>
    </div>
  )
}
