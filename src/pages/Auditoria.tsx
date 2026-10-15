// Auditoría (solo administradores): qué se ha cambiado en la aplicación y quién ha accedido a qué.
//  · Cambios: quién creó, editó o borró algo, cuándo, de qué paciente, y qué cambió exactamente (campo por campo).
//  · Accesos: quién abrió un expediente o una ficha, imprimió, exportó (Word o CSV) o entró en la aplicación.

import { Segmentado } from '../components/Segmentado'
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
    <div className="p-4 sm:p-6 md:p-8 ancho-tabla">
      <CabeceraPagina
        titulo="Auditoría"
        subtitulo={pestana === 'cambios' ? 'Quién ha creado, editado o borrado, qué cambió y cuándo' : 'Quién ha entrado, abierto, impreso o exportado'}
      />

      <Segmentado
        className="mb-5"
        etiqueta="Qué consultar"
        valor={pestana}
        onChange={setPestana}
        opciones={[{ clave: 'cambios', etiqueta: 'Cambios' }, { clave: 'accesos', etiqueta: 'Accesos' }]}
      />

      {pestana === 'cambios' ? <TabCambios personal={personal} /> : <TabAccesos personal={personal} />}
    </div>
  )
}
