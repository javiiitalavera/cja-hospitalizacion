import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import type { Profesional } from '../types'
import { TIPO_EVENTO_LABEL, CAMPOS_POR_TIPO, TURNO_LABEL, type TipoEvento, type Evento } from '../types/eventos'
import { X, Save } from 'lucide-react'

interface Props {
  ingresoId: string
  eventoExistente?: Evento | null
  onClose: () => void
  onGuardado: () => void
}

export default function FormularioEvento({ ingresoId, eventoExistente, onClose, onGuardado }: Props) {
  const [tipo, setTipo] = useState<TipoEvento | ''>(eventoExistente?.tipo ?? '')
  const [fecha, setFecha] = useState(eventoExistente?.fecha ?? new Date().toISOString().split('T')[0])
  const [hora, setHora] = useState(eventoExistente?.hora?.slice(0, 5) ?? '')
  const [turno, setTurno] = useState(eventoExistente?.turno ?? '')
  const [datos, setDatos] = useState<Record<string, string>>(eventoExistente?.datos ?? {})
  const [notas, setNotas] = useState(eventoExistente?.notas ?? '')
  const [profesionalId, setProfesionalId] = useState(eventoExistente?.registrado_por_id ?? '')
  const [profesionales, setProfesionales] = useState<Profesional[]>([])
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    supabase
      .from('profesionales')
      .select('*')
      .eq('activo', true)
      .order('apellidos')
      .then(({ data }) => setProfesionales(data ?? []))
  }, [])

  // Reset datos específicos al cambiar tipo
  useEffect(() => {
    if (!eventoExistente) setDatos({})
  }, [tipo])

  function setDato(key: string, val: string) {
    setDatos((d) => ({ ...d, [key]: val }))
  }

  async function guardar() {
    setError('')
    if (!tipo) {
      setError('Selecciona el tipo de incidencia.')
      return
    }
    if (!fecha) {
      setError('La fecha es obligatoria.')
      return
    }
    if (!profesionalId) {
      setError('Indica quién registra la incidencia.')
      return
    }

    // Validar campos requeridos del tipo
    const campos = CAMPOS_POR_TIPO[tipo]
    for (const campo of campos) {
      if (campo.requerido && !datos[campo.key]) {
        setError(`El campo "${campo.label}" es obligatorio.`)
        return
      }
    }

    setSaving(true)
    const payload = {
      ingreso_id: ingresoId,
      tipo,
      fecha,
      hora: hora || null,
      turno: turno || null,
      datos,
      notas: notas || null,
      registrado_por_id: profesionalId,
    }

    if (eventoExistente) {
      await supabase.from('eventos').update(payload).eq('id', eventoExistente.id)
    } else {
      await supabase.from('eventos').insert([payload])
    }
    setSaving(false)
    onGuardado()
  }

  const camposActuales = tipo ? CAMPOS_POR_TIPO[tipo] : []

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg max-h-[90vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b">
          <h2 className="text-base font-bold text-slate-800">
            {eventoExistente ? 'Editar evento' : 'Registrar evento'}
          </h2>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Body */}
        <div className="overflow-y-auto flex-1 px-6 py-5 space-y-4">
          {/* Tipo */}
          <div>
            <label className="label">Tipo de evento *</label>
            <select className="input" value={tipo} onChange={(e) => setTipo(e.target.value as TipoEvento)}>
              <option value="">— Selecciona —</option>
              {(Object.keys(TIPO_EVENTO_LABEL) as TipoEvento[]).map((t) => (
                <option key={t} value={t}>
                  {TIPO_EVENTO_LABEL[t]}
                </option>
              ))}
            </select>
          </div>

          {/* Fecha, hora, turno */}
          <div className="grid grid-cols-3 gap-3">
            <div>
              <label className="label">Fecha *</label>
              <input type="date" className="input" value={fecha} onChange={(e) => setFecha(e.target.value)} />
            </div>
            <div>
              <label className="label">Hora</label>
              <input type="time" className="input" value={hora} onChange={(e) => setHora(e.target.value)} />
            </div>
            <div>
              <label className="label">Turno</label>
              <select className="input" value={turno} onChange={(e) => setTurno(e.target.value)}>
                <option value="">—</option>
                {Object.entries(TURNO_LABEL).map(([k, v]) => (
                  <option key={k} value={k}>
                    {v}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* Campos específicos del tipo */}
          {tipo && (
            <div className="space-y-3 pt-1">
              <p className="text-xs font-bold text-primary-600 uppercase tracking-widest">{TIPO_EVENTO_LABEL[tipo]}</p>
              {camposActuales.map((campo) => (
                <div key={campo.key}>
                  <label className="label">
                    {campo.label}
                    {campo.requerido && ' *'}
                  </label>
                  {campo.tipo === 'select' ? (
                    <select
                      className="input"
                      value={datos[campo.key] ?? ''}
                      onChange={(e) => setDato(campo.key, e.target.value)}
                    >
                      <option value="">—</option>
                      {campo.opciones?.map((op) => (
                        <option key={op} value={op}>
                          {op}
                        </option>
                      ))}
                    </select>
                  ) : (
                    <input
                      type="text"
                      className="input"
                      value={datos[campo.key] ?? ''}
                      onChange={(e) => setDato(campo.key, e.target.value)}
                    />
                  )}
                </div>
              ))}
            </div>
          )}

          {/* Notas */}
          <div>
            <label className="label">Notas adicionales</label>
            <textarea
              className="textarea"
              rows={3}
              value={notas}
              onChange={(e) => setNotas(e.target.value)}
              placeholder="Descripción libre, contexto adicional…"
            />
          </div>

          {/* Profesional */}
          <div>
            <label className="label">Registrado por *</label>
            <select className="input" value={profesionalId} onChange={(e) => setProfesionalId(e.target.value)}>
              <option value="">— Selecciona —</option>
              {profesionales.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.nombre} {p.apellidos} · {p.rol}
                </option>
              ))}
            </select>
          </div>

          {error && <div className="p-3 bg-red-50 border border-red-200 text-red-700 text-sm rounded-lg">{error}</div>}
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t flex justify-end gap-3">
          <button onClick={onClose} className="btn-secondary">
            Cancelar
          </button>
          <button onClick={guardar} disabled={saving} className="btn-primary">
            <Save className="w-4 h-4" />
            {saving ? 'Guardando…' : 'Guardar incidencia'}
          </button>
        </div>
      </div>
    </div>
  )
}
