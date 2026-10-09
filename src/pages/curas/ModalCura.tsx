// Una cura de la "Tabla de cuidados" abierta en una ventana: se ve la pauta,
// la última valoración y la evolución, y se puede editar sin salir de la
// pantalla Curas. Usa las mismas piezas que la pestaña Curas de la ficha.

import { useState } from 'react'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../lib/AuthContext'
import { hoyLocal } from '../../lib/fechas'
import { Modal, TarjetaLesion, FormularioLesion, FormularioValoracion } from '../ingreso/TabCuras'
import type { Lesion, Valoracion } from './tipos'

export function ModalCura({
  titulo, lesion, onCerrar, onCambio,
}: {
  titulo: string
  lesion: Lesion
  onCerrar: () => void
  // Recarga la pantalla Curas tras guardar o cambiar algo.
  onCambio: () => Promise<void>
}) {
  const { profesional, esAdmin } = useAuth()
  const [formLesion, setFormLesion] = useState(false)
  const [formValoracion, setFormValoracion] = useState<{ editando: Valoracion | null } | null>(null)
  const [errorAccion, setErrorAccion] = useState('')

  // En la pantalla Curas solo salen ingresos activos, así que se puede editar
  // mientras haya una cuenta con ficha de profesional (la base de datos decide el resto).
  const puedeEditar = !!profesional
  const esMio = (autor: string | null) => !!profesional && autor === profesional.id

  async function cambiarEstado() {
    setErrorAccion('')
    const { error } = await supabase.from('curas_lesiones').update({ fecha_fin: lesion.fecha_fin ? null : hoyLocal() }).eq('id', lesion.id)
    if (error) { setErrorAccion('No se pudo cambiar el estado: ' + error.message); return }
    await onCambio()
    // Una cura dada por curada deja de estar en la tabla de cuidados.
    onCerrar()
  }

  async function eliminarLesion() {
    if (!confirm(`¿Eliminar «${lesion.localizacion}» y todas sus valoraciones? No se puede deshacer.`)) return
    setErrorAccion('')
    const { error, count } = await supabase.from('curas_lesiones').delete({ count: 'exact' }).eq('id', lesion.id)
    if (error) { setErrorAccion('No se pudo eliminar: ' + error.message); return }
    if (!count) { setErrorAccion('No se eliminó: solo puede hacerlo quien la registró o un administrador.'); return }
    await onCambio()
    onCerrar()
  }

  async function eliminarValoracion(v: Valoracion) {
    if (!confirm('¿Eliminar esta valoración?')) return
    setErrorAccion('')
    const { error, count } = await supabase.from('curas_valoraciones').delete({ count: 'exact' }).eq('id', v.id)
    if (error) { setErrorAccion('No se pudo eliminar: ' + error.message); return }
    if (!count) { setErrorAccion('No se eliminó: solo puede hacerlo quien la registró o un administrador.'); return }
    await onCambio()
  }

  return (
    <>
      <Modal titulo={titulo} onClose={onCerrar} ancho="max-w-3xl">
        {errorAccion && (
          <p className="mb-3 text-sm text-red-600 bg-red-50 border border-red-100 rounded-lg px-3 py-2">{errorAccion}</p>
        )}
        <TarjetaLesion
          lesion={lesion}
          puedeEditar={puedeEditar}
          puedeBorrar={puedeEditar && (esAdmin || esMio(lesion.registrado_por_id))}
          puedeBorrarValoracion={(v) => puedeEditar && (esAdmin || esMio(v.registrado_por_id))}
          evolucionAbierta
          onNuevaValoracion={() => setFormValoracion({ editando: null })}
          onEditarLesion={() => setFormLesion(true)}
          onEditarValoracion={(v) => setFormValoracion({ editando: v })}
          onCambioEstado={cambiarEstado}
          onEliminarLesion={eliminarLesion}
          onEliminarValoracion={eliminarValoracion}
        />
      </Modal>

      {formLesion && (
        <FormularioLesion
          ingresoId={lesion.ingreso_id}
          editando={lesion}
          onClose={() => setFormLesion(false)}
          onGuardado={async () => { setFormLesion(false); await onCambio() }}
        />
      )}
      {formValoracion && (
        <FormularioValoracion
          lesion={lesion}
          editando={formValoracion.editando}
          onClose={() => setFormValoracion(null)}
          onGuardado={async () => { setFormValoracion(null); await onCambio() }}
        />
      )}
    </>
  )
}
