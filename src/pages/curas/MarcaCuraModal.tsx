// Ventana para registrar (o quitar) la cura de un paciente un día: hecha, o
// no realizada con su motivo. La usan la tabla semanal y la ficha.

import { useState } from 'react'
import { CheckCircle2, XCircle } from 'lucide-react'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../lib/AuthContext'
import { Modal } from './Modal'
import { MOTIVOS_NO_REALIZADA, fechaLarga, type RegistroCura } from './tipos'

export function MarcaCuraModal({
  titulo, ingresoId, fecha, marca, onClose, onCambio,
}: {
  titulo: string
  ingresoId: string
  fecha: string
  marca: RegistroCura | null
  onClose: () => void
  onCambio: () => void | Promise<void>
}) {
  const { profesional } = useAuth()
  const [motivo, setMotivo] = useState('')
  const [pidiendoMotivo, setPidiendoMotivo] = useState(false)
  const [guardando, setGuardando] = useState(false)
  const [error, setError] = useState('')

  async function ejecutar(accion: () => PromiseLike<{ error: { message: string } | null }>, fallo: string) {
    setGuardando(true)
    setError('')
    const { error: err } = await accion()
    if (err) {
      setError(fallo + ': ' + err.message)
      setGuardando(false)
      return
    }
    await onCambio()
    setGuardando(false)
    onClose()
  }

  function registrar(estado: 'hecha' | 'no_realizada') {
    if (!profesional) { setError('Tu cuenta no tiene ficha de profesional.'); return }
    const texto = motivo.trim()
    if (estado === 'no_realizada' && !texto) { setError('Indica el motivo.'); return }
    return ejecutar(
      () => supabase.from('curas_registro').insert({
        ingreso_id: ingresoId, fecha, realizada_por_id: profesional.id, estado, motivo: estado === 'no_realizada' ? texto : null,
      }),
      'No se pudo guardar'
    )
  }

  // El borrado no da error si la base de datos no lo permite (solo lo puede quitar
  // quien la puso o un administrador): se comprueba que la marca ha desaparecido.
  async function quitar() {
    if (!marca) return
    setGuardando(true)
    setError('')
    const { error: err } = await supabase.from('curas_registro').delete().eq('id', marca.id)
    if (err) { setError('No se pudo quitar la marca: ' + err.message); setGuardando(false); return }
    const { data } = await supabase.from('curas_registro').select('id').eq('id', marca.id).maybeSingle()
    if (data) {
      setError('Solo puede quitar esta marca quien la puso o un administrador.')
      setGuardando(false)
      return
    }
    await onCambio()
    setGuardando(false)
    onClose()
  }

  const quien = marca?.realizada_por ? `${marca.realizada_por.nombre} ${marca.realizada_por.apellidos}` : null

  return (
    <Modal titulo={titulo} onClose={onClose} ancho="max-w-md">
      <p className="text-sm text-slate-500 mb-4">Cura del {fechaLarga(fecha)}</p>

      {marca ? (
        <div className="space-y-4">
          {marca.estado === 'hecha' ? (
            <div className="flex items-start gap-2 text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-lg px-3 py-2 text-sm">
              <CheckCircle2 className="w-4 h-4 mt-0.5 shrink-0" />
              <span>Cura hecha{quien ? ` por ${quien}` : ''}.</span>
            </div>
          ) : (
            <div className="flex items-start gap-2 text-rose-700 bg-rose-50 border border-rose-200 rounded-lg px-3 py-2 text-sm">
              <XCircle className="w-4 h-4 mt-0.5 shrink-0" />
              <span>
                Cura no realizada{quien ? ` (registrado por ${quien})` : ''}.<br />
                <span className="text-slate-700">Motivo: {marca.motivo}</span>
              </span>
            </div>
          )}
          {error && <p className="text-sm text-red-600">{error}</p>}
          <div className="flex justify-end gap-2">
            <button onClick={onClose} className="btn-secondary">Cerrar</button>
            <button onClick={quitar} disabled={guardando} className="btn-danger">Quitar marca</button>
          </div>
        </div>
      ) : pidiendoMotivo ? (
        <div className="space-y-3">
          <label className="block text-sm font-medium text-slate-700">Motivo de que no se haya hecho</label>
          <div className="flex flex-wrap gap-1.5">
            {MOTIVOS_NO_REALIZADA.map((m) => (
              <button key={m} type="button" onClick={() => setMotivo(m)}
                className={`text-xs px-2 py-1 rounded-full border ${motivo === m ? 'bg-slate-700 text-white border-slate-700' : 'bg-white text-slate-600 border-slate-300 hover:bg-slate-50'}`}>
                {m}
              </button>
            ))}
          </div>
          <textarea
            value={motivo}
            onChange={(e) => setMotivo(e.target.value)}
            maxLength={500}
            rows={3}
            autoFocus
            className="input w-full"
            placeholder="Escribe el motivo…"
          />
          {error && <p className="text-sm text-red-600">{error}</p>}
          <div className="flex justify-end gap-2">
            <button onClick={() => { setPidiendoMotivo(false); setError('') }} className="btn-secondary">Atrás</button>
            <button onClick={() => registrar('no_realizada')} disabled={guardando || !motivo.trim()} className="btn-primary">Guardar como no realizada</button>
          </div>
        </div>
      ) : (
        <div className="space-y-3">
          {error && <p className="text-sm text-red-600">{error}</p>}
          <button onClick={() => registrar('hecha')} disabled={guardando} autoFocus className="btn-primary w-full justify-center">
            <CheckCircle2 className="w-4 h-4" />Cura hecha
          </button>
          <button onClick={() => setPidiendoMotivo(true)} disabled={guardando} className="btn-secondary w-full justify-center">
            <XCircle className="w-4 h-4" />No se ha realizado…
          </button>
        </div>
      )}
    </Modal>
  )
}
