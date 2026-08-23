import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '../../lib/supabase'
import type { Ingreso, Profesional } from '../../types'
import { ESTADO_INGRESO_LABEL as ESTADO_LABEL } from '../../types'
import { ExternalLink } from 'lucide-react'

function TabDatos({ ingreso, onUpdate }: { ingreso: Ingreso; onUpdate: (i: Ingreso) => void }) {
  const p = ingreso.paciente!
  const [editando, setEditando] = useState(false)
  const [ingresoEdit, setIngresoEdit] = useState({
    habitacion: ingreso.habitacion?.toString() ?? '',
    motivo_ingreso: ingreso.motivo_ingreso ?? '',
    fecha_ingreso: ingreso.fecha_ingreso ?? '',
    medico_responsable_id: ingreso.medico_responsable_id ?? '',
  })
  const [medicos, setMedicos] = useState<Profesional[]>([])
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    supabase.from('profesionales').select('*').eq('rol', 'medico').eq('activo', true)
      .then(({ data }) => setMedicos(data ?? []))
  }, [])

  async function guardar() {
    setSaving(true)
    setError('')
    // Nota: "estado" NO se toca aquí a propósito. Cambiar de activo a
    // alta/exitus/traslado pasa siempre por el flujo de "Dar de alta",
    // que genera el informe y dispara la auditoría correspondiente.
    const { data, error: dbError } = await supabase
      .from('ingresos')
      .update({
        habitacion: ingresoEdit.habitacion ? parseInt(ingresoEdit.habitacion) : null,
        motivo_ingreso: ingresoEdit.motivo_ingreso,
        fecha_ingreso: ingresoEdit.fecha_ingreso,
        medico_responsable_id: ingresoEdit.medico_responsable_id || null,
      })
      .eq('id', ingreso.id)
      .select('*, paciente:pacientes(*)')
      .single()
    setSaving(false)
    if (dbError) {
      setError('No se pudieron guardar los cambios. Inténtalo de nuevo.')
      return
    }
    // Sincronizamos el estado del padre para que el encabezado y el resto
    // de pestañas reflejen los cambios sin necesidad de recargar la página.
    if (data) onUpdate(data as unknown as Ingreso)
    setSaved(true)
    setEditando(false)
    setTimeout(() => setSaved(false), 2000)
  }

  // Datos del paciente: siempre en modo lectura aquí. Se editan desde su
  // propia ficha (/pacientes/:id), para que solo haya un sitio donde tocarlos.
  const filaPaciente = (
    <div className="card p-6 space-y-4">
      <div className="flex items-center justify-between">
        <p className="section-title mb-0">Datos del paciente</p>
        <Link
          to={`/pacientes/${ingreso.paciente_id}`}
          className="flex items-center gap-1 text-xs text-primary-600 hover:underline"
        >
          Editar en la ficha del paciente <ExternalLink className="w-3 h-3" />
        </Link>
      </div>
      <div className="grid grid-cols-2 gap-x-8 gap-y-1 text-sm">
        {([
          ['CIPNA', p.cipna], ['NHC', p.nhc], ['DNI', p.dni],
          ['Fecha nacimiento', p.fecha_nacimiento ? new Date(p.fecha_nacimiento).toLocaleDateString('es-ES') : null],
          ['Sexo', p.sexo], ['Municipio', p.municipio],
          ['Médico de cabecera', p.medico_cabecera],
          ['Contacto familiar', p.contacto_familiar_nombre],
          ['Teléfono familiar', p.contacto_familiar_telefono],
        ] as [string, string | null | undefined][]).map(([k, v]) => (
          <div key={k} className="flex py-1">
            <span className="w-40 text-slate-400 shrink-0">{k}</span>
            <span className="text-slate-700">{v || <span className="text-slate-300">—</span>}</span>
          </div>
        ))}
      </div>
    </div>
  )

  if (editando) {
    const inp = (label: string, val: string, onChange: (v: string) => void, type = 'text') => (
      <div key={label}>
        <label className="label">{label}</label>
        <input type={type} className="input" value={val}
          onChange={e => onChange(e.target.value)} />
      </div>
    )
    return (
      <div className="max-w-2xl space-y-5">
        {filaPaciente}
        <div className="card p-6 space-y-4">
          <p className="section-title">Datos del ingreso</p>
          <div className="grid grid-cols-2 gap-4">
            {inp('Fecha de ingreso', ingresoEdit.fecha_ingreso, v => setIngresoEdit(i => ({ ...i, fecha_ingreso: v })), 'date')}
            <div>
              <label className="label">Fecha de alta</label>
              <p className="input bg-slate-50 text-slate-500 cursor-not-allowed">
                {ingreso.fecha_alta ? new Date(ingreso.fecha_alta).toLocaleDateString('es-ES') : '—'}
              </p>
              <p className="text-[11px] text-slate-400 mt-1">
                Se pone desde "Dar de alta", no aquí (para que vaya siempre junto con el estado).
              </p>
            </div>
            {inp('Habitación', ingresoEdit.habitacion, v => setIngresoEdit(i => ({ ...i, habitacion: v })), 'number')}
            <div>
              <label className="label">Estado</label>
              <p className="input bg-slate-50 text-slate-500 cursor-not-allowed">
                {ESTADO_LABEL[ingreso.estado] ?? ingreso.estado}
              </p>
              <p className="text-[11px] text-slate-400 mt-1">
                Se cambia desde "Dar de alta", no aquí.
              </p>
            </div>
            <div>
              <label className="label">Médico responsable</label>
              <select className="input" value={ingresoEdit.medico_responsable_id}
                onChange={e => setIngresoEdit(i => ({ ...i, medico_responsable_id: e.target.value }))}>
                <option value="">— Sin asignar —</option>
                {medicos.map(m => (
                  <option key={m.id} value={m.id}>{m.nombre} {m.apellidos}</option>
                ))}
              </select>
            </div>
            <div className="col-span-2">
              <label className="label">Motivo de ingreso</label>
              <textarea className="textarea" rows={2} value={ingresoEdit.motivo_ingreso}
                onChange={e => setIngresoEdit(i => ({ ...i, motivo_ingreso: e.target.value }))} />
            </div>
          </div>
        </div>
        {error && (
          <p className="text-sm text-red-600 bg-red-50 border border-red-100 rounded-lg px-3 py-2">{error}</p>
        )}
        <div className="flex justify-end gap-3">
          <button onClick={() => setEditando(false)} className="btn-secondary">Cancelar</button>
          <button onClick={guardar} disabled={saving} className="btn-primary">
            {saving ? 'Guardando…' : 'Guardar cambios'}
          </button>
        </div>
      </div>
    )
  }

  // Modo lectura
  const rowsIngreso: [string, string | null | undefined][] = [
    ['Motivo de ingreso', ingreso.motivo_ingreso],
    ['Estado', ESTADO_LABEL[ingreso.estado] ?? ingreso.estado],
    ['Habitación', ingreso.habitacion?.toString()],
  ]
  return (
    <div className="max-w-2xl space-y-5">
      {filaPaciente}
      <div className="flex justify-end">
        <button onClick={() => setEditando(true)} className="btn-secondary">
          Editar datos del ingreso
        </button>
      </div>
      <div className="card overflow-hidden">
        <div className="divide-y">
          {rowsIngreso.map(([k, v]) => (
            <div key={k} className="flex px-5 py-3 text-sm">
              <span className="w-44 text-slate-500 shrink-0">{k}</span>
              <span className="text-slate-800">{v || <span className="text-slate-300">—</span>}</span>
            </div>
          ))}
        </div>
      </div>
      {saved && <p className="text-emerald-600 text-sm text-right">✓ Guardado correctamente</p>}
    </div>
  )
}


export { TabDatos }
