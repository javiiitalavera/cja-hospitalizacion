import { useEffect, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useAuth } from '../lib/AuthContext'
import type { Profesional, Paciente } from '../types'
import { ChevronLeft, Save, Search, UserPlus, RefreshCw, Lock } from 'lucide-react'

export default function NuevoIngreso() {
  const navigate = useNavigate()
  const { rol } = useAuth()
  const [searchParams] = useSearchParams()
  const habitacionParam = searchParams.get('habitacion') ?? ''
  const pacienteIdParam = searchParams.get('paciente_id') ?? ''

  const [medicos, setMedicos] = useState<Profesional[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  // Flujo: 'buscar' → 'nuevo_paciente' | 'reingreso'
  const [paso, setPaso] = useState<'buscar' | 'nuevo_paciente' | 'reingreso'>(pacienteIdParam ? 'reingreso' : 'buscar')
  const [busqueda, setBusqueda] = useState('')
  const [resultados, setResultados] = useState<Paciente[]>([])
  const [buscando, setBuscando] = useState(false)
  const [pacienteSeleccionado, setPacienteSeleccionado] = useState<Paciente | null>(null)
  const [cargandoPacienteParam, setCargandoPacienteParam] = useState(!!pacienteIdParam)

  const [paciente, setPaciente] = useState({
    nombre: '',
    primer_apellido: '',
    segundo_apellido: '',
    cipna: '',
    nhc: '',
    fecha_nacimiento: '',
    sexo: '',
    dni: '',
    municipio: '',
    medico_cabecera: '',
    contacto_familiar_nombre: '',
    contacto_familiar_telefono: '',
  })
  const [ingreso, setIngreso] = useState({
    fecha_ingreso: new Date().toISOString().split('T')[0],
    habitacion: habitacionParam,
    medico_responsable_id: '',
    motivo_ingreso: '',
  })

  useEffect(() => {
    supabase
      .from('profesionales')
      .select('*')
      .eq('rol', 'medico')
      .eq('activo', true)
      .then(({ data }) => setMedicos(data ?? []))
  }, [])

  useEffect(() => {
    if (!pacienteIdParam) return
    supabase
      .from('pacientes')
      .select('*')
      .eq('id', pacienteIdParam)
      .single()
      .then(({ data }) => {
        if (data) setPacienteSeleccionado(data as Paciente)
        setCargandoPacienteParam(false)
      })
  }, [pacienteIdParam])

  async function buscarPaciente() {
    if (!busqueda.trim()) return
    setBuscando(true)
    const { data } = await supabase
      .from('pacientes')
      .select('*')
      .or(
        `primer_apellido.ilike.%${busqueda}%,nombre.ilike.%${busqueda}%,nhc.ilike.%${busqueda}%,cipna.ilike.%${busqueda}%`
      )
      .order('primer_apellido')
      .limit(10)
    setResultados(data ?? [])
    setBuscando(false)
  }

  function seleccionarPaciente(p: Paciente) {
    setPacienteSeleccionado(p)
    setPaso('reingreso')
  }

  async function crearIngreso(pacienteId: string, esReingreso = false) {
    // Verificar que la habitación no está ocupada
    if (ingreso.habitacion) {
      const { data: ocupada } = await supabase
        .from('ingresos')
        .select('id, paciente:pacientes(nombre, primer_apellido)')
        .eq('habitacion', parseInt(ingreso.habitacion))
        .eq('estado', 'activo')
        .maybeSingle()
      if (ocupada) {
        const p = (ocupada as any).paciente
        const nombre = p ? `${p.primer_apellido}, ${p.nombre}` : 'otro paciente'
        setError(`La habitación ${ingreso.habitacion} ya está ocupada por ${nombre}.`)
        return null
      }
    }

    const { data: ingresoData, error: errIngreso } = await supabase
      .from('ingresos')
      .insert([
        {
          paciente_id: pacienteId,
          fecha_ingreso: ingreso.fecha_ingreso,
          habitacion: ingreso.habitacion ? parseInt(ingreso.habitacion) : null,
          medico_responsable_id: ingreso.medico_responsable_id || null,
          motivo_ingreso: ingreso.motivo_ingreso,
          estado: 'activo',
        },
      ])
      .select()
      .single()

    if (errIngreso || !ingresoData) {
      setError('Error al crear el ingreso: ' + errIngreso?.message)
      return null
    }

    // Si es reingreso, buscar datos del ingreso anterior para copiar
    let informeBase: Record<string, any> = {}
    let itemsBase: Record<string, any> = {}

    if (esReingreso) {
      // Último ingreso anterior del mismo paciente
      const { data: ingresosPrev } = await supabase
        .from('ingresos')
        .select('id')
        .eq('paciente_id', pacienteId)
        .neq('id', ingresoData.id)
        .order('fecha_ingreso', { ascending: false })
        .limit(1)

      const prevId = ingresosPrev?.[0]?.id
      if (prevId) {
        const [{ data: infPrev }, { data: itemsPrev }] = await Promise.all([
          supabase.from('informe_ingreso').select('*').eq('ingreso_id', prevId).single(),
          supabase.from('items_paciente').select('*').eq('ingreso_id', prevId).single(),
        ])

        if (infPrev) {
          // Copiar campos estables, limpiar campos específicos del episodio
          const {
            id,
            ingreso_id,
            created_at,
            updated_at,
            evolucion,
            situacion_cognitivo,
            situacion_conductual,
            situacion_animico,
            situacion_funcional,
            situacion_social,
            exploracion_fisica,
            exploracion_neurologica,
            exploracion_psicopatologica,
            exploraciones_complementarias,
            impresion_diagnostica,
            plan_objetivos,
            plan_medicacion,
            plan_medicacion_estructurado,
            plan_otros_cuidados,
            barthel,
            lawton,
            ...camposEstables
          } = infPrev
          informeBase = camposEstables
        }

        if (itemsPrev) {
          const { id, ingreso_id, created_at, updated_at, semaforo_caidas, ...itemsEstables } = itemsPrev
          itemsBase = itemsEstables
        }
      }
    }

    await Promise.all([
      supabase.from('informe_ingreso').insert([{ ingreso_id: ingresoData.id, ...informeBase }]),
      supabase.from('informe_alta').insert([{ ingreso_id: ingresoData.id }]),
      supabase.from('items_paciente').insert([{ ingreso_id: ingresoData.id, ...itemsBase }]),
    ])
    return ingresoData.id
  }

  async function handleNuevoPaciente() {
    setError('')
    if (!paciente.nombre || !paciente.primer_apellido || !ingreso.fecha_ingreso) {
      setError('Nombre, primer apellido y fecha de ingreso son obligatorios.')
      return
    }
    setLoading(true)
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
    const ingresoId = await crearIngreso(pacienteData.id)
    if (ingresoId) navigate(`/ingresos/${ingresoId}`)
    setLoading(false)
  }

  async function handleReingreso() {
    setError('')
    if (!pacienteSeleccionado || !ingreso.fecha_ingreso) {
      setError('Fecha de ingreso obligatoria.')
      return
    }
    setLoading(true)
    const ingresoId = await crearIngreso(pacienteSeleccionado.id, true)
    if (ingresoId) navigate(`/ingresos/${ingresoId}`)
    setLoading(false)
  }

  const campoIngreso = (
    <div className="card p-6 mb-6">
      <p className="section-title">Datos del ingreso</p>
      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="label">Fecha de ingreso *</label>
          <input
            type="date"
            className="input"
            value={ingreso.fecha_ingreso}
            onChange={(e) => setIngreso((i) => ({ ...i, fecha_ingreso: e.target.value }))}
          />
        </div>
        <div>
          <label className="label">Habitación (1-33)</label>
          <input
            type="number"
            min={1}
            max={33}
            className="input"
            value={ingreso.habitacion}
            onChange={(e) => setIngreso((i) => ({ ...i, habitacion: e.target.value }))}
          />
        </div>
        <div>
          <label className="label">Médico responsable</label>
          <select
            className="input"
            value={ingreso.medico_responsable_id}
            onChange={(e) => setIngreso((i) => ({ ...i, medico_responsable_id: e.target.value }))}
          >
            <option value="">— Sin asignar —</option>
            {medicos.map((m) => (
              <option key={m.id} value={m.id}>
                {m.nombre} {m.apellidos}
              </option>
            ))}
          </select>
        </div>
        <div className="col-span-2">
          <label className="label">Motivo de ingreso</label>
          <textarea
            className="textarea"
            rows={2}
            value={ingreso.motivo_ingreso}
            onChange={(e) => setIngreso((i) => ({ ...i, motivo_ingreso: e.target.value }))}
          />
        </div>
      </div>
    </div>
  )

  // Solo un médico puede crear ingresos (además, el candado de la BD lo exige).
  if (rol !== 'medico') {
    return (
      <div className="p-8">
        <div className="card p-6 max-w-md flex items-start gap-3">
          <Lock className="w-5 h-5 text-slate-400 mt-0.5 shrink-0" />
          <div>
            <p className="font-semibold text-slate-800">Acceso restringido</p>
            <p className="text-sm text-slate-500 mt-1">
              Solo un médico puede crear ingresos y pacientes. Si necesitas registrar uno, avisa al médico responsable.
            </p>
            <button onClick={() => navigate(-1)} className="btn-secondary mt-3 text-sm">Volver</button>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="p-8 max-w-3xl">
      <div className="flex items-center gap-3 mb-7">
        <button
          onClick={() => (paso === 'buscar' ? navigate(-1) : setPaso('buscar'))}
          className="text-slate-400 hover:text-slate-600"
        >
          <ChevronLeft className="w-5 h-5" />
        </button>
        <div>
          <h1 className="text-2xl font-bold text-slate-800">Nuevo ingreso</h1>
          <p className="text-sm text-slate-400">
            {paso === 'buscar' && 'Busca si el paciente ya existe o crea uno nuevo'}
            {paso === 'reingreso' &&
              `Reingreso de ${pacienteSeleccionado?.primer_apellido}, ${pacienteSeleccionado?.nombre}`}
            {paso === 'nuevo_paciente' && 'Nuevo paciente'}
          </p>
        </div>
      </div>

      {error && <div className="mb-4 p-3 bg-red-50 border border-red-200 text-red-700 text-sm rounded-lg">{error}</div>}

      {/* PASO 1: Buscar */}
      {paso === 'buscar' && (
        <div className="space-y-4">
          <div className="card p-6">
            <p className="section-title">¿El paciente ya estuvo ingresado?</p>
            <p className="text-sm text-slate-500 mb-4">
              Busca por apellido, nombre, NHC o CIPNA para evitar duplicados.
            </p>
            <div className="flex gap-2">
              <input
                className="input flex-1"
                placeholder="Apellido, nombre, NHC o CIPNA…"
                value={busqueda}
                onChange={(e) => setBusqueda(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && buscarPaciente()}
              />
              <button onClick={buscarPaciente} disabled={buscando} className="btn-primary shrink-0">
                <Search className="w-4 h-4" />
                {buscando ? 'Buscando…' : 'Buscar'}
              </button>
            </div>

            {resultados.length > 0 && (
              <div className="mt-4 divide-y border rounded-lg overflow-hidden">
                {resultados.map((p) => {
                  const fnac = p.fecha_nacimiento ? new Date(p.fecha_nacimiento).toLocaleDateString('es-ES') : null
                  return (
                    <button
                      key={p.id}
                      onClick={() => seleccionarPaciente(p)}
                      className="w-full flex items-center justify-between px-4 py-3 hover:bg-primary-50 text-left transition-colors"
                    >
                      <div>
                        <p className="font-medium text-slate-800 text-sm">
                          {p.primer_apellido} {p.segundo_apellido ?? ''}, {p.nombre}
                        </p>
                        <p className="text-xs text-slate-400">
                          {fnac && `Nac. ${fnac}`}
                          {p.nhc && ` · NHC: ${p.nhc}`}
                          {p.cipna && ` · CIPNA: ${p.cipna}`}
                        </p>
                      </div>
                      <span className="text-xs text-primary-600 font-medium shrink-0 ml-4">Seleccionar →</span>
                    </button>
                  )
                })}
              </div>
            )}

            {resultados.length === 0 && busqueda && !buscando && (
              <p className="text-sm text-slate-400 mt-3">No se encontraron resultados para "{busqueda}".</p>
            )}
          </div>

          <div className="flex items-center gap-3">
            <div className="flex-1 border-t border-slate-200" />
            <span className="text-xs text-slate-400 shrink-0">o si es un paciente nuevo</span>
            <div className="flex-1 border-t border-slate-200" />
          </div>

          <button onClick={() => setPaso('nuevo_paciente')} className="btn-secondary w-full justify-center py-3">
            <UserPlus className="w-4 h-4" />
            Crear paciente nuevo
          </button>
        </div>
      )}

      {/* PASO 2a: Reingreso */}
      {paso === 'reingreso' && cargandoPacienteParam && (
        <div className="text-slate-400 text-center py-10">Cargando paciente…</div>
      )}
      {paso === 'reingreso' && !cargandoPacienteParam && pacienteSeleccionado && (
        <div>
          <div className="card p-5 mb-5 bg-primary-50 border-primary-200">
            <div className="flex items-center justify-between">
              <div>
                <p className="font-semibold text-primary-800">
                  {pacienteSeleccionado.primer_apellido} {pacienteSeleccionado.segundo_apellido ?? ''},{' '}
                  {pacienteSeleccionado.nombre}
                </p>
                <p className="text-xs text-primary-600 mt-0.5">
                  {pacienteSeleccionado.nhc && `NHC: ${pacienteSeleccionado.nhc}`}
                  {pacienteSeleccionado.cipna && ` · CIPNA: ${pacienteSeleccionado.cipna}`}
                  {pacienteSeleccionado.fecha_nacimiento &&
                    ` · Nac. ${new Date(pacienteSeleccionado.fecha_nacimiento).toLocaleDateString('es-ES')}`}
                </p>
              </div>
              <button
                onClick={() => {
                  setPacienteSeleccionado(null)
                  setPaso('buscar')
                }}
                className="text-primary-400 hover:text-primary-600 text-xs flex items-center gap-1"
              >
                <RefreshCw className="w-3.5 h-3.5" /> Cambiar
              </button>
            </div>
          </div>

          {campoIngreso}

          <div className="flex justify-end gap-3">
            <button onClick={() => setPaso('buscar')} className="btn-secondary">
              Cancelar
            </button>
            <button onClick={handleReingreso} disabled={loading} className="btn-primary">
              <Save className="w-4 h-4" />
              {loading ? 'Creando…' : 'Crear reingreso'}
            </button>
          </div>
        </div>
      )}

      {/* PASO 2b: Nuevo paciente */}
      {paso === 'nuevo_paciente' && (
        <div>
          <div className="card p-6 mb-5">
            <p className="section-title">Datos del paciente</p>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="label">Nombre *</label>
                <input
                  className="input"
                  value={paciente.nombre}
                  onChange={(e) => setPaciente((p) => ({ ...p, nombre: e.target.value }))}
                />
              </div>
              <div>
                <label className="label">Primer apellido *</label>
                <input
                  className="input"
                  value={paciente.primer_apellido}
                  onChange={(e) => setPaciente((p) => ({ ...p, primer_apellido: e.target.value }))}
                />
              </div>
              <div>
                <label className="label">Segundo apellido</label>
                <input
                  className="input"
                  value={paciente.segundo_apellido}
                  onChange={(e) => setPaciente((p) => ({ ...p, segundo_apellido: e.target.value }))}
                />
              </div>
              <div>
                <label className="label">Fecha de nacimiento</label>
                <input
                  type="date"
                  className="input"
                  value={paciente.fecha_nacimiento}
                  onChange={(e) => setPaciente((p) => ({ ...p, fecha_nacimiento: e.target.value }))}
                />
              </div>
              <div>
                <label className="label">Sexo</label>
                <select
                  className="input"
                  value={paciente.sexo}
                  onChange={(e) => setPaciente((p) => ({ ...p, sexo: e.target.value }))}
                >
                  <option value="">—</option>
                  <option value="hombre">Hombre</option>
                  <option value="mujer">Mujer</option>
                  <option value="otro">Otro</option>
                </select>
              </div>
              <div>
                <label className="label">CIPNA</label>
                <input
                  className="input"
                  value={paciente.cipna}
                  onChange={(e) => setPaciente((p) => ({ ...p, cipna: e.target.value }))}
                />
              </div>
              <div>
                <label className="label">NHC</label>
                <input
                  className="input"
                  value={paciente.nhc}
                  onChange={(e) => setPaciente((p) => ({ ...p, nhc: e.target.value }))}
                />
              </div>
              <div>
                <label className="label">DNI / NIE</label>
                <input
                  className="input"
                  value={paciente.dni}
                  onChange={(e) => setPaciente((p) => ({ ...p, dni: e.target.value }))}
                />
              </div>
              <div>
                <label className="label">Municipio</label>
                <input
                  className="input"
                  value={paciente.municipio}
                  onChange={(e) => setPaciente((p) => ({ ...p, municipio: e.target.value }))}
                />
              </div>
              <div>
                <label className="label">Médico de cabecera</label>
                <input
                  className="input"
                  value={paciente.medico_cabecera}
                  onChange={(e) => setPaciente((p) => ({ ...p, medico_cabecera: e.target.value }))}
                />
              </div>
              <div>
                <label className="label">Contacto familiar (nombre)</label>
                <input
                  className="input"
                  value={paciente.contacto_familiar_nombre}
                  onChange={(e) => setPaciente((p) => ({ ...p, contacto_familiar_nombre: e.target.value }))}
                />
              </div>
              <div>
                <label className="label">Contacto familiar (teléfono)</label>
                <input
                  className="input"
                  value={paciente.contacto_familiar_telefono}
                  onChange={(e) => setPaciente((p) => ({ ...p, contacto_familiar_telefono: e.target.value }))}
                />
              </div>
            </div>
          </div>

          {campoIngreso}

          <div className="flex justify-end gap-3">
            <button onClick={() => setPaso('buscar')} className="btn-secondary">
              Cancelar
            </button>
            <button onClick={handleNuevoPaciente} disabled={loading} className="btn-primary">
              <Save className="w-4 h-4" />
              {loading ? 'Creando…' : 'Crear ingreso'}
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
