// Cola de guardados: cada guardado espera a que termine el anterior.
//
// Sin esto, un autoguardado que arranca mientras el anterior sigue en vuelo (red lenta, o escribir justo
// cuando empieza un guardado) llevaría la versión que tenía el formulario al teclear, ya vieja, y el
// servidor lo rechazaría como «conflicto» aunque nadie más haya tocado el registro: la propia persona se
// conflictuaba consigo misma. En cola, cada guardado puede leer la versión que dejó el anterior.
import type { MutableRefObject } from 'react'

export function encadenar(
  cadenaRef: MutableRefObject<Promise<boolean>>,
  tarea: () => Promise<boolean>,
): Promise<boolean> {
  const p = cadenaRef.current.then(tarea)
  cadenaRef.current = p.catch(() => false)
  return p
}
