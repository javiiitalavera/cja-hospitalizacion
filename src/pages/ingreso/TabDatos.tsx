import { useEffect, useState } from 'react'
import { supabase } from '../../lib/supabase'
import type { Ingreso, Profesional } from '../../types'

function TabDatos({ ingreso }: { ingreso: Ingreso; onUpdate: (i: Ingreso) => void }) {
  const p = ingreso.paciente!
  const [editando, setEditando] = useState(false)
  const [paciente, setPaciente] = useState({ ...p })
  const [ingresoEdit, setIngresoEdit] = useState({
    habitacion: ingreso.habitacion?.toString() ?? '',
    motivo_ingreso: ingreso.motivo_ingreso ?? '',
    fecha_ingreso: ingreso.fecha_ingreso ?? '',
    fecha_alta: ingreso.fecha_alta ?? '',
    estado: ingreso.estado ?? 'activo',
    medico_responsable_id: ingreso.medico_responsable_id ?? '',
  })
  const [medicos, setMedicos] = useState<Profesional[]>([])
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)

  useEffect(() => {
    supabase.from('profesionales').select('*').eq('rol', 'medico').eq('activo', true)
      .then(({ data }) => setMedicos(data ?? []))
  }, [])

  async function guardar() {
    setSaving(true)
    await Promise.all([
      supabase.from('pacientes').update({
        nombre: paciente.nombre,
        primer_apellido: paciente.primer_apellido,
        segundo_apellido: paciente.segundo_apellido,
        cipna: paciente.cipna,
        nhc: paciente.nhc,
        dni: paciente.dni,
        fecha_nacimiento: paciente.fecha_nacimiento || null,
        sexo: paciente.sexo,
        municipio: paciente.municipio,
        medico_cabecera: paciente.medico_cabecera,
        contacto_familiar_nombre: paciente.contacto_familiar_nombre,
        contacto_familiar_telefono: paciente.contacto_familiar_telefono,
      }).eq('id', p.id),
      supabase.from('ingresos').update({
        habitacion: ingresoEdit.habitacion ? parseInt(ingresoEdit.habitacion) : null,
        motivo_ingreso: ingresoEdit.motivo_ingreso,
        fecha_ingreso: ingresoEdit.fecha_ingreso,
        fecha_alta: ingresoEdit.fecha_alta || null,
        estado: ingresoEdit.estado,
        medico_responsable_id: ingresoEdit.medico_responsable_id || null,
      }).eq('id', ingreso.id),
    ])
    setSaving(false)
    setSaved(true)
    setEditando(false)
    setTimeout(() => setSaved(false), 2000)
  }

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
        <div className="card p-6 space-y-4">
          <p className="section-title">Datos del paciente</p>
          <div className="grid grid-cols-2 gap-4">
            {inp('Nombre', paciente.nombre ?? '', v => setPaciente(p => ({ ...p, nombre: v })))}
            {inp('Primer apellido', paciente.primer_apellido ?? '', v => setPaciente(p => ({ ...p, primer_apellido: v })))}
            {inp('Segundo apellido', paciente.segundo_apellido ?? '', v => setPaciente(p => ({ ...p, segundo_apellido: v })))}
            {inp('Fecha nacimiento', paciente.fecha_nacimiento ?? '', v => setPaciente(p => ({ ...p, fecha_nacimiento: v })), 'date')}
            <div>
              <label className="label">Sexo</label>
              <select className="input" value={paciente.sexo ?? ''}
                onChange={e => setPaciente(p => ({ ...p, sexo: e.target.value as any }))}>
                <option value="">—</option>
                <option value="hombre">Hombre</option>
                <option value="mujer">Mujer</option>
                <option value="otro">Otro</option>
              </select>
            </div>
            {inp('CIPNA', paciente.cipna ?? '', v => setPaciente(p => ({ ...p, cipna: v })))}
            {inp('NHC', paciente.nhc ?? '', v => setPaciente(p => ({ ...p, nhc: v })))}
            {inp('DNI / NIE', paciente.dni ?? '', v => setPaciente(p => ({ ...p, dni: v })))}
            {inp('Municipio', paciente.municipio ?? '', v => setPaciente(p => ({ ...p, municipio: v })))}
            {inp('Médico de cabecera', paciente.medico_cabecera ?? '', v => setPaciente(p => ({ ...p, medico_cabecera: v })))}
            {inp('Contacto familiar', paciente.contacto_familiar_nombre ?? '', v => setPaciente(p => ({ ...p, contacto_familiar_nombre: v })))}
            {inp('Teléfono familiar', paciente.contacto_familiar_telefono ?? '', v => setPaciente(p => ({ ...p, contacto_familiar_telefono: v })))}
          </div>
        </div>
        <div className="card p-6 space-y-4">
          <p className="section-title">Datos del ingreso</p>
          <div className="grid grid-cols-2 gap-4">
            {inp('Fecha de ingreso', ingresoEdit.fecha_ingreso, v => setIngresoEdit(i => ({ ...i, fecha_ingreso: v })), 'date')}
            {inp('Fecha de alta', ingresoEdit.fecha_alta, v => setIngresoEdit(i => ({ ...i, fecha_alta: v })), 'date')}
            {inp('Habitación', ingresoEdit.habitacion, v => setIngresoEdit(i => ({ ...i, habitacion: v })), 'number')}
            <div>
              <label className="label">Estado</label>
              <select className="input" value={ingresoEdit.estado}
                onChange={e => setIngresoEdit(i => ({ ...i, estado: e.target.value as any }))}>
                <option value="activo">Ingresado</option>
                <option value="alta">Alta</option>
                <option value="exitus">Éxitus</option>
              </select>
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
  const rows: [string, string | null | undefined][] = [
    ['CIPNA', p.cipna], ['NHC', p.nhc], ['DNI', p.dni],
    ['Fecha nacimiento', p.fecha_nacimiento ? new Date(p.fecha_nacimiento).toLocaleDateString('es-ES') : null],
    ['Sexo', p.sexo], ['Municipio', p.municipio],
    ['Médico de cabecera', p.medico_cabecera],
    ['Contacto familiar', p.contacto_familiar_nombre],
    ['Teléfono familiar', p.contacto_familiar_telefono],
    ['Motivo de ingreso', ingreso.motivo_ingreso],
    ['Estado', ingreso.estado],
    ['Habitación', ingreso.habitacion?.toString()],
  ]
  return (
    <div className="max-w-2xl space-y-4">
      <div className="flex justify-end">
        <button onClick={() => setEditando(true)} className="btn-secondary">
          Editar datos
        </button>
      </div>
      <div className="card overflow-hidden">
        <div className="divide-y">
          {rows.map(([k, v]) => (
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
