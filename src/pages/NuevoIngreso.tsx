import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import type { Profesional } from '../types'
import { ChevronLeft, Save } from 'lucide-react'

export default function NuevoIngreso() {
  const navigate = useNavigate()
  const [medicos, setMedicos] = useState<Profesional[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const [paciente, setPaciente] = useState({
    nombre: '', primer_apellido: '', segundo_apellido: '',
    cipna: '', nhc: '', fecha_nacimiento: '', sexo: '',
    dni: '', municipio: '', medico_cabecera: '',
    contacto_familiar_nombre: '', contacto_familiar_telefono: '',
  })
  const [ingreso, setIngreso] = useState({
    fecha_ingreso: new Date().toISOString().split('T')[0],
    habitacion: '',
    medico_responsable_id: '',
    motivo_ingreso: '',
  })

  useEffect(() => {
    supabase.from('profesionales')
      .select('*')
      .eq('rol', 'medico')
      .eq('activo', true)
      .then(({ data }) => setMedicos(data ?? []))
  }, [])

  async function handleSubmit() {
    setError('')
    if (!paciente.nombre || !paciente.primer_apellido || !ingreso.fecha_ingreso) {
      setError('Nombre, primer apellido y fecha de ingreso son obligatorios.')
      return
    }
    setLoading(true)

    // 1. Crear paciente
    const { data: pacienteData, error: errPaciente } = await supabase
      .from('pacientes')
      .insert([paciente])
      .select()
      .single()

    if (errPaciente || !pacienteData) {
      setError('Error al crear el paciente: ' + errPaciente?.message)
      setLoading(false)
      return
    }

    // 2. Crear ingreso
    const { data: ingresoData, error: errIngreso } = await supabase
      .from('ingresos')
      .insert([{
        paciente_id: pacienteData.id,
        fecha_ingreso: ingreso.fecha_ingreso,
        habitacion: ingreso.habitacion ? parseInt(ingreso.habitacion) : null,
        medico_responsable_id: ingreso.medico_responsable_id || null,
        motivo_ingreso: ingreso.motivo_ingreso,
        estado: 'activo',
      }])
      .select()
      .single()

    if (errIngreso || !ingresoData) {
      setError('Error al crear el ingreso: ' + errIngreso?.message)
      setLoading(false)
      return
    }

    // 3. Crear registros vacíos asociados
    await Promise.all([
      supabase.from('informe_ingreso').insert([{ ingreso_id: ingresoData.id }]),
      supabase.from('informe_alta').insert([{ ingreso_id: ingresoData.id }]),
      supabase.from('items_paciente').insert([{ ingreso_id: ingresoData.id }]),
    ])

    navigate(`/pacientes/${ingresoData.id}`)
  }

  return (
    <div className="p-8 max-w-3xl">
      {/* Header */}
      <div className="flex items-center gap-3 mb-7">
        <button onClick={() => navigate(-1)} className="text-slate-400 hover:text-slate-600">
          <ChevronLeft className="w-5 h-5" />
        </button>
        <div>
          <h1 className="text-2xl font-bold text-slate-800">Nuevo ingreso</h1>
          <p className="text-sm text-slate-400">Registro de paciente y episodio de hospitalización</p>
        </div>
      </div>

      {error && (
        <div className="mb-4 p-3 bg-red-50 border border-red-200 text-red-700 text-sm rounded-lg">{error}</div>
      )}

      {/* Datos del paciente */}
      <div className="card p-6 mb-5">
        <p className="section-title">Datos del paciente</p>
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="label">Nombre *</label>
            <input className="input" value={paciente.nombre}
              onChange={e => setPaciente(p => ({ ...p, nombre: e.target.value }))} />
          </div>
          <div>
            <label className="label">Primer apellido *</label>
            <input className="input" value={paciente.primer_apellido}
              onChange={e => setPaciente(p => ({ ...p, primer_apellido: e.target.value }))} />
          </div>
          <div>
            <label className="label">Segundo apellido</label>
            <input className="input" value={paciente.segundo_apellido}
              onChange={e => setPaciente(p => ({ ...p, segundo_apellido: e.target.value }))} />
          </div>
          <div>
            <label className="label">Fecha de nacimiento</label>
            <input type="date" className="input" value={paciente.fecha_nacimiento}
              onChange={e => setPaciente(p => ({ ...p, fecha_nacimiento: e.target.value }))} />
          </div>
          <div>
            <label className="label">Sexo</label>
            <select className="input" value={paciente.sexo}
              onChange={e => setPaciente(p => ({ ...p, sexo: e.target.value }))}>
              <option value="">—</option>
              <option value="hombre">Hombre</option>
              <option value="mujer">Mujer</option>
              <option value="otro">Otro</option>
            </select>
          </div>
          <div>
            <label className="label">CIPNA</label>
            <input className="input" value={paciente.cipna}
              onChange={e => setPaciente(p => ({ ...p, cipna: e.target.value }))} />
          </div>
          <div>
            <label className="label">NHC</label>
            <input className="input" value={paciente.nhc}
              onChange={e => setPaciente(p => ({ ...p, nhc: e.target.value }))} />
          </div>
          <div>
            <label className="label">DNI / NIE</label>
            <input className="input" value={paciente.dni}
              onChange={e => setPaciente(p => ({ ...p, dni: e.target.value }))} />
          </div>
          <div>
            <label className="label">Municipio</label>
            <input className="input" value={paciente.municipio}
              onChange={e => setPaciente(p => ({ ...p, municipio: e.target.value }))} />
          </div>
          <div>
            <label className="label">Médico de cabecera</label>
            <input className="input" value={paciente.medico_cabecera}
              onChange={e => setPaciente(p => ({ ...p, medico_cabecera: e.target.value }))} />
          </div>
          <div>
            <label className="label">Contacto familiar (nombre)</label>
            <input className="input" value={paciente.contacto_familiar_nombre}
              onChange={e => setPaciente(p => ({ ...p, contacto_familiar_nombre: e.target.value }))} />
          </div>
          <div>
            <label className="label">Contacto familiar (teléfono)</label>
            <input className="input" value={paciente.contacto_familiar_telefono}
              onChange={e => setPaciente(p => ({ ...p, contacto_familiar_telefono: e.target.value }))} />
          </div>
        </div>
      </div>

      {/* Datos del ingreso */}
      <div className="card p-6 mb-6">
        <p className="section-title">Datos del ingreso</p>
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="label">Fecha de ingreso *</label>
            <input type="date" className="input" value={ingreso.fecha_ingreso}
              onChange={e => setIngreso(i => ({ ...i, fecha_ingreso: e.target.value }))} />
          </div>
          <div>
            <label className="label">Habitación (1-32)</label>
            <input type="number" min={1} max={32} className="input" value={ingreso.habitacion}
              onChange={e => setIngreso(i => ({ ...i, habitacion: e.target.value }))} />
          </div>
          <div>
            <label className="label">Médico responsable</label>
            <select className="input" value={ingreso.medico_responsable_id}
              onChange={e => setIngreso(i => ({ ...i, medico_responsable_id: e.target.value }))}>
              <option value="">— Sin asignar —</option>
              {medicos.map(m => (
                <option key={m.id} value={m.id}>{m.nombre} {m.apellidos}</option>
              ))}
            </select>
          </div>
          <div className="col-span-2">
            <label className="label">Motivo de ingreso</label>
            <textarea className="textarea" rows={2} value={ingreso.motivo_ingreso}
              onChange={e => setIngreso(i => ({ ...i, motivo_ingreso: e.target.value }))} />
          </div>
        </div>
      </div>

      <div className="flex justify-end gap-3">
        <button onClick={() => navigate(-1)} className="btn-secondary">Cancelar</button>
        <button onClick={handleSubmit} disabled={loading} className="btn-primary">
          <Save className="w-4 h-4" />
          {loading ? 'Guardando…' : 'Crear ingreso'}
        </button>
      </div>
    </div>
  )
}
