import { TURNOS, type Turno } from '../../types/pautaCuidados'
import { Segmentado } from '../../components/Segmentado'

export function TabsTurno({ turno, onChange }: { turno: Turno; onChange: (t: Turno) => void }) {
  return (
    <Segmentado
      etiqueta="Turno"
      valor={turno}
      onChange={onChange}
      opciones={TURNOS.map((t) => ({ clave: t.clave, etiqueta: t.etiqueta }))}
    />
  )
}
