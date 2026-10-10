// Auditoría (solo administradores): qué se ha cambiado en la aplicación y quién ha accedido a qué.
//  · Cambios: quién creó, editó o borró algo, cuándo, de qué paciente, y qué cambió exactamente (campo por campo).
//  · Accesos: quién abrió un expediente o una ficha, imprimió, exportó a Word o entró en la aplicación.

import { useState } from 'react'
import { CabeceraPagina } from '../components/CabeceraPagina'
import { useAuth } from '../lib/AuthContext'
import { usePersonal } from './auditoria/personal'
import { TabCambios } from './auditoria/TabCambios'
import { TabAccesos } from './auditoria/TabAccesos'

type Pestana = 'cambios' | 'accesos'

export function Auditoria() {
  const { esAdmin } = useAuth()
  const [pestana, setPestana] = useState<Pestana>('cambios')
  const personal = usePersonal()

  if (!esAdmin) {
    return (
      <div className="p-8">
        <div className="card p-6 max-w-md">
          <p className="font-semibold text-slate-800">Acceso restringido</p>
          <p className="text-sm text-slate-500 mt-1">Solo los administradores pueden consultar la auditoría.</p>
        </div>
      </div>
    )
  }

  return (
    <div className="p-6 md:p-8 max-w-6xl">
      <CabeceraPagina
        titulo="Auditoría"
        subtitulo={pestana === 'cambios' ? 'Quién ha creado, editado o borrado, qué cambió y cuándo' : 'Quién ha entrado, abierto, impreso o exportado'}
      />

      <div className="flex gap-1 border-b border-slate-200 mb-5">
        {([['cambios', 'Cambios'], ['accesos', 'Accesos']] as const).map(([clave, etiqueta]) => (
          <button key={clave} type="button" onClick={() => setPestana(clave)}
            className={`px-4 py-2 text-sm font-medium border-b-2 -mb-px transition-colors ${pestana === clave ? 'border-primary-600 text-primary-700' : 'border-transparent text-slate-500 hover:text-slate-800'}`}>
            {etiqueta}
          </button>
        ))}
      </div>

      {pestana === 'cambios' ? <TabCambios personal={personal} /> : <TabAccesos personal={personal} />}
    </div>
  )
}
