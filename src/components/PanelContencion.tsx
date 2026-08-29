import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../lib/AuthContext'
import type { ItemsPaciente } from '../types'
import {
  TIPO_CONTENCION_LABEL, MOTIVO_CONTENCION_LABEL,
  type TipoContencion, type MotivoContencion, type PautaContencion,
} from '../types/eventos'

// ─── Contención física: pauta médica, mostrada en solo lectura ─
//
// El médico pauta o retira aquí; el resto del equipo solo lo ve. La
// tabla items_paciente se actualiza sola mediante un disparador de la
// base de datos en cuanto se pauta o se retira algo — este componente
// nunca la toca directamente.
//
// Componente compartido: lo usan tanto la Hoja de Ítems como Inicio
// (acceso rápido desde la ficha de cada habitación), para no tener
// dos copias del mismo formulario.
export function PanelContencion({ ingresoId, esMedico, onCambio }: {
  ingresoId: string
  esMedico: boolean
  onCambio: (items: ItemsPaciente) => void
}) {
  const { profesional } = useAuth()
  const [pautas, setPautas] = useState<PautaContencion[]>([])
  const [loading, setLoading] = useState(true)
  const [mostrarForm, setMostrarForm] = useState(false)
  const [tipoNuevo, setTipoNuevo] = useState<TipoContencion>('cama_dos_barras')
  const [motivoNuevo, setMotivoNuevo] = useState<MotivoContencion>('riesgo_caida')
  const [notasNuevo, setNotasNuevo] = useState('')
  const [guardando, setGuardando] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => { fetchPautas() }, [ingresoId])

  async function fetchPautas() {
    setLoading(true)
    try {
      const { data } = await supabase
        .from('pautas_contencion')
        .select('*, pautada_por:profesionales!pautada_por_id(nombre, apellidos)')
        .eq('ingreso_id', ingresoId)
        .is('fecha_fin', null)
        .order('fecha_inicio', { ascending: true })
      const lista = (data ?? []) as unknown as PautaContencion[]
      setPautas(lista)
      // Si no hay ninguna pauta activa, se adelanta directamente el
      // formulario de "pautar nueva" — el caso más común al abrir esto
      // desde un acceso rápido es que no haya nada todavía.
      if (lista.length === 0) setMostrarForm(true)
    } finally {
      setLoading(false)
    }
  }

  async function refrescarItemsTrasCambio() {
    const { data } = await supabase.from('items_paciente').select('*').eq('ingreso_id', ingresoId).single()
    if (data) onCambio(data as ItemsPaciente)
  }

  async function pautar() {
    if (!profesional) return
    setGuardando(true)
    setError('')
    const { error: err } = await supabase.from('pautas_contencion').insert({
      ingreso_id: ingresoId,
      tipo: tipoNuevo,
      motivo: motivoNuevo,
      notas: notasNuevo.trim() || null,
      pautada_por_id: profesional.id,
    })
    setGuardando(false)
    if (err) {
      // El error típico aquí: ya hay una pauta activa de ese mismo tipo.
      setError(
        err.code === '23505'
          ? 'Ya hay una pauta activa de ese tipo. Retírala primero si quieres cambiarla.'
          : 'No se pudo pautar: ' + err.message
      )
      return
    }
    setMostrarForm(false)
    setNotasNuevo('')
    await fetchPautas()
    await refrescarItemsTrasCambio()
  }

  async function retirar(pauta: PautaContencion) {
    if (!profesional) return
    if (!confirm(`¿Retirar "${TIPO_CONTENCION_LABEL[pauta.tipo]}"?`)) return
    const { error: err } = await supabase
      .from('pautas_contencion')
      .update({ fecha_fin: new Date().toISOString(), retirada_por_id: profesional.id })
      .eq('id', pauta.id)
    if (err) {
      setError('No se pudo retirar: ' + err.message)
      return
    }
    await fetchPautas()
    await refrescarItemsTrasCambio()
  }

  return (
    <div className="py-1.5">
      {loading ? (
        <p className="text-xs text-slate-400">Cargando…</p>
      ) : pautas.length === 0 ? (
        !esMedico && <p className="text-xs text-slate-400 italic">Sin contenciones pautadas.</p>
      ) : (
        <div className="space-y-1.5 mb-2">
          {pautas.map((p) => (
            <div key={p.id} className="flex items-center justify-between text-xs bg-amber-50 border border-amber-100 rounded px-2 py-1.5">
              <div className="min-w-0">
                <p className="font-medium text-amber-900">{TIPO_CONTENCION_LABEL[p.tipo]}</p>
                <p className="text-amber-700 text-[10px]">
                  {MOTIVO_CONTENCION_LABEL[p.motivo]} · desde {new Date(p.fecha_inicio).toLocaleDateString('es-ES')}
                  {p.pautada_por && ` · ${p.pautada_por.nombre} ${p.pautada_por.apellidos}`}
                </p>
              </div>
              {esMedico && (
                <button onClick={() => retirar(p)} className="text-red-600 hover:text-red-700 text-[10px] font-medium shrink-0 ml-2">
                  Retirar
                </button>
              )}
            </div>
          ))}
        </div>
      )}

      {!esMedico && (
        <p className="text-[10px] text-slate-400 italic">Solo un médico puede pautar o retirar una contención.</p>
      )}

      {esMedico && !mostrarForm && (
        <button onClick={() => setMostrarForm(true)} className="text-xs text-primary-600 hover:underline font-medium">
          + Pautar contención
        </button>
      )}

      {esMedico && mostrarForm && (
        <div className="border border-slate-200 rounded-lg p-2.5 space-y-2 bg-slate-50">
          <div>
            <label className="text-[10px] text-slate-500 block mb-0.5">Tipo</label>
            <select className="input py-1 text-xs" value={tipoNuevo} onChange={(e) => setTipoNuevo(e.target.value as TipoContencion)}>
              {(Object.keys(TIPO_CONTENCION_LABEL) as TipoContencion[]).map((t) => (
                <option key={t} value={t}>{TIPO_CONTENCION_LABEL[t]}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="text-[10px] text-slate-500 block mb-0.5">Motivo</label>
            <select className="input py-1 text-xs" value={motivoNuevo} onChange={(e) => setMotivoNuevo(e.target.value as MotivoContencion)}>
              {(Object.keys(MOTIVO_CONTENCION_LABEL) as MotivoContencion[]).map((m) => (
                <option key={m} value={m}>{MOTIVO_CONTENCION_LABEL[m]}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="text-[10px] text-slate-500 block mb-0.5">Notas (opcional)</label>
            <textarea className="textarea text-xs" rows={2} value={notasNuevo} onChange={(e) => setNotasNuevo(e.target.value)} />
          </div>
          {error && <p className="text-[10px] text-red-600">{error}</p>}
          <div className="flex gap-2">
            {pautas.length > 0 && (
              <button onClick={() => { setMostrarForm(false); setError('') }} className="btn-secondary text-xs py-1 flex-1 justify-center">
                Cancelar
              </button>
            )}
            <button onClick={pautar} disabled={guardando} className="btn-primary text-xs py-1 flex-1 justify-center">
              {guardando ? 'Pautando…' : 'Pautar'}
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
