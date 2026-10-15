// Una cura de la "Tabla de cuidados" abierta directamente en la ventana de edición (la misma que
// «Editar» en la ficha), sin pasar antes por una tarjeta intermedia: Registrar evolución, Editar cura,
// Editar lesión e Historial, todo en una sola ventana. Se abre en «Editar cura», que es lo que se ve
// escrito en la tabla.

import { useState } from 'react'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../lib/AuthContext'
import { useConfirmar } from '../../components/useConfirmar'
import { hoyLocal } from '../../lib/fechas'
import { ModalEditarLesion, FormularioValoracion } from '../ingreso/TabCuras'
import type { Lesion, Valoracion } from './tipos'

export function ModalCura({
  titulo, lesion, onCerrar, onCambio,
}: {
  // Paciente al que pertenece la lesión («Apellidos, Nombre · Hab. 1»).
  titulo: string
  lesion: Lesion
  onCerrar: () => void
  // Recarga la pantalla Curas tras guardar o cambiar algo.
  onCambio: () => Promise<void>
}) {
  const { profesional, esAdmin } = useAuth()
  const { confirmar, dialogo } = useConfirmar()
  const [formValoracion, setFormValoracion] = useState<{ editando: Valoracion } | null>(null)
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
    if (!(await confirmar({ titulo: `¿Eliminar «${lesion.localizacion}»?`, mensaje: 'Se eliminará con todo su historial. No se puede deshacer.', textoConfirmar: 'Eliminar', peligro: true }))) return
    setErrorAccion('')
    const { error, count } = await supabase.from('curas_lesiones').delete({ count: 'exact' }).eq('id', lesion.id)
    if (error) { setErrorAccion('No se pudo eliminar: ' + error.message); return }
    if (!count) { setErrorAccion('No se eliminó: solo puede hacerlo quien la registró o un administrador.'); return }
    await onCambio()
    onCerrar()
  }

  async function eliminarValoracion(v: Valoracion) {
    if (!(await confirmar({ titulo: '¿Eliminar este registro?', mensaje: 'No se puede deshacer.', textoConfirmar: 'Eliminar', peligro: true }))) return
    setErrorAccion('')
    const { error, count } = await supabase.from('curas_valoraciones').delete({ count: 'exact' }).eq('id', v.id)
    if (error) { setErrorAccion('No se pudo eliminar: ' + error.message); return }
    if (!count) { setErrorAccion('No se eliminó: solo puede hacerlo quien la registró o un administrador.'); return }
    await onCambio()
  }

  return (
    <>
      {dialogo}
      <ModalEditarLesion
        lesion={lesion}
        paciente={titulo}
        pestañaInicial="pauta"
        onClose={onCerrar}
        onGuardado={async () => { await onCambio(); onCerrar() }}
        extras={{
          error: errorAccion,
          puedeEditar,
          puedeBorrar: puedeEditar && (esAdmin || esMio(lesion.registrado_por_id)),
          puedeBorrarValoracion: (v) => puedeEditar && (esAdmin || esMio(v.registrado_por_id)),
          onEditarValoracion: (v) => setFormValoracion({ editando: v }),
          onEliminarValoracion: eliminarValoracion,
          onCambioEstado: cambiarEstado,
          onEliminarLesion: eliminarLesion,
        }}
      />
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
