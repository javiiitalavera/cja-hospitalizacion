import { useEffect } from 'react'

// Cuántos formularios tienen ahora mismo cambios sin guardar. Lo consulta `useConfirmarSalida` antes de cambiar de
// pestaña, de paciente o de pantalla dentro de la app (cerrar o recargar el navegador lo cubre `beforeunload`).
let formulariosConCambios = 0
export function hayCambiosSinGuardar(): boolean {
  return formulariosConCambios > 0
}

// Mientras `activo` sea true (hay cambios sin guardar), cerrar o recargar la pestaña pide confirmación, y moverse por
// la app (pestañas de la ficha, otro paciente, menú) también.
// Sin esto, lo escrito y no guardado se perdía sin aviso al recargar.
export function useAvisoSalida(activo: boolean) {
  useEffect(() => {
    if (!activo) return
    formulariosConCambios++
    const avisar = (e: BeforeUnloadEvent) => { e.preventDefault(); e.returnValue = '' }
    window.addEventListener('beforeunload', avisar)
    return () => {
      formulariosConCambios--
      window.removeEventListener('beforeunload', avisar)
    }
  }, [activo])
}
