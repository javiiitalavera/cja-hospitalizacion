import { TURNOS, type Turno } from '../../types/pautaCuidados'

export function TabsTurno({ turno, onChange }: { turno: Turno; onChange: (t: Turno) => void }) {
  return (
    <div className="flex gap-1 border-b">
      {TURNOS.map((t) => (
        <button key={t.clave} onClick={() => onChange(t.clave)}
          className={`px-4 py-2 text-sm font-medium border-b-2 -mb-px transition-colors ${
            turno === t.clave ? 'border-primary-600 text-primary-700' : 'border-transparent text-slate-500 hover:text-slate-700'
          }`}>
          {t.etiqueta}
        </button>
      ))}
    </div>
  )
}
