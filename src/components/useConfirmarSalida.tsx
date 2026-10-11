// Antes de cambiar de pestaña, de paciente o de pantalla: si hay un formulario con cambios sin guardar, pregunta.
// Uso: const { permitirSalida, dialogoSalida } = useConfirmarSalida(); … if (!(await permitirSalida())) return; … y se
// pinta {dialogoSalida} una vez en el componente.

import { hayCambiosSinGuardar } from '../lib/avisoSalida'
import { useConfirmar } from './useConfirmar'

export function useConfirmarSalida() {
  const { confirmar, dialogo } = useConfirmar()
  async function permitirSalida(): Promise<boolean> {
    if (!hayCambiosSinGuardar()) return true
    return confirmar({
      titulo: 'Hay cambios sin guardar',
      mensaje: 'Si sales ahora se perderán. ¿Quieres salir sin guardar?',
      textoConfirmar: 'Salir sin guardar',
      textoCancelar: 'Seguir editando',
      peligro: true,
    })
  }
  return { permitirSalida, dialogoSalida: dialogo }
}
