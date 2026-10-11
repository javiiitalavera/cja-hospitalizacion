import { useEffect } from 'react'

// Mientras `activo` sea true (hay cambios sin guardar), cerrar o recargar la pestaña pide confirmación.
// Sin esto, lo escrito y no guardado se perdía sin aviso al recargar.
export function useAvisoSalida(activo: boolean) {
  useEffect(() => {
    if (!activo) return
    const avisar = (e: BeforeUnloadEvent) => { e.preventDefault(); e.returnValue = '' }
    window.addEventListener('beforeunload', avisar)
    return () => window.removeEventListener('beforeunload', avisar)
  }, [activo])
}
