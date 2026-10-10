import { useCallback, useEffect, useRef, useState } from 'react'
import type { ReactNode } from 'react'

// Confirmación propia (en vez de la ventana del navegador): se usa así,
//   const { confirmar, dialogo } = useConfirmar()
//   if (!(await confirmar({ titulo: '¿Quitar esta indicación?', peligro: true }))) return
// y se pinta `{dialogo}` en el componente.
interface Opciones {
  titulo: string
  mensaje?: ReactNode
  textoConfirmar?: string
  textoCancelar?: string
  peligro?: boolean          // acción destructiva: botón rojo y el foco empieza en «Cancelar»
}

function Dialogo({ o, resolver }: { o: Opciones; resolver: (ok: boolean) => void }) {
  const cancelar = useRef<HTMLButtonElement>(null)
  const aceptar = useRef<HTMLButtonElement>(null)
  useEffect(() => { (o.peligro ? cancelar : aceptar).current?.focus() }, [o.peligro])
  useEffect(() => {
    const f = (e: KeyboardEvent) => { if (e.key === 'Escape') resolver(false) }
    window.addEventListener('keydown', f)
    return () => window.removeEventListener('keydown', f)
  }, [resolver])
  return (
    <div className="fixed inset-0 z-[80] bg-black/40 flex items-center justify-center p-4" onClick={() => resolver(false)}>
      <div role="alertdialog" aria-modal="true" aria-label={o.titulo}
        className="bg-white rounded-2xl shadow-2xl w-full max-w-md p-5 space-y-3" onClick={(e) => e.stopPropagation()}>
        <p className="font-semibold text-slate-800">{o.titulo}</p>
        {o.mensaje && <div className="text-sm text-slate-600 whitespace-pre-wrap">{o.mensaje}</div>}
        <div className="flex justify-end gap-2 pt-1">
          <button ref={cancelar} type="button" className="btn-secondary" onClick={() => resolver(false)}>{o.textoCancelar ?? 'Cancelar'}</button>
          <button ref={aceptar} type="button" className={o.peligro ? 'btn-danger' : 'btn-primary'} onClick={() => resolver(true)}>{o.textoConfirmar ?? 'Aceptar'}</button>
        </div>
      </div>
    </div>
  )
}

export function useConfirmar() {
  const [abierta, setAbierta] = useState<{ o: Opciones; resolver: (ok: boolean) => void } | null>(null)
  const confirmar = useCallback((o: Opciones) => new Promise<boolean>((resolve) => {
    setAbierta({ o, resolver: (ok) => { setAbierta(null); resolve(ok) } })
  }), [])
  const dialogo = abierta ? <Dialogo o={abierta.o} resolver={abierta.resolver} /> : null
  return { confirmar, dialogo }
}
