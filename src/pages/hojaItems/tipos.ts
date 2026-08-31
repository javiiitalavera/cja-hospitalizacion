import type { Ingreso, ItemsPaciente } from '../../types'
import type { ContencionDia, ContencionNoche } from '../../types/contenciones'

export type IngresoConItems = Ingreso & {
  items: ItemsPaciente | null
  contencion?: { dia: ContencionDia | null; noche: ContencionNoche[] | null }
}
