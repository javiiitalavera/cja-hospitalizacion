import { useEffect, useRef, useState, type RefObject } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '../../lib/supabase'
import type { Ingreso, Profesional } from '../../types'
import { ESTADO_INGRESO_LABEL as ESTADO_LABEL } from '../../types'
import { ExternalLink } from 'lucide-react'
import SelectorHabitacion from '../../components/SelectorHabitacion'

function TabDatos({ ingreso, onUpdate, iniciarEditando = false }: { ingreso: Ingreso; onUpdate: (i: Ingreso) => void; iniciarEditando?: boolean }) {
  const p = ingreso.paciente!
  // Antes, "Asignar habitación" desde Inicio llevaba al episodio y
  // había que buscar por separado el botón "Editar datos del
  // ingreso" — con esto entra directo en modo edición.
  const [editando, setEditando] = useState(iniciarEditando)
  const habitacionInputRef = useRef<HTMLSelectElement>(null)
  useEffect(() => {
    if (iniciarEditando) habitacionInputRef.current?.focus()
  }, [iniciarEditando])
  const valoresDe = (i: Ingreso) => ({
    habitacion: i.habitacion?.toString() ?? '',
    motivo_ingreso: i.motivo_ingreso ?? '',
    fecha_ingreso: i.fecha_ingreso ?? '',
    medico_responsable_id: i.medico_responsable_id ?? '',
  })
  const [ingresoEdit, setIngresoEdit] = useState(valoresDe(ingreso))
  // Valores con los que se abrió el formulario: lo que la persona toca es lo que difiere de ellos (no de la copia más reciente).
  const partidaRef = useRef(valoresDe(ingreso))
  const [medicos, setMedicos] = useState<Profesional[]>([])
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    supabase.from('profesionales').select('*').eq('rol', 'medico').eq('activo', true)
      .then(({ data }) => setMedicos(data ?? []))
  }, [])

  // Si el ingreso se refresca desde fuera (p. ej. otra pestaña llama a
  // onUpdate), el formulario de edición se queda con los valores viejos
  // porque el useState de arriba solo se inicializa una vez. Este efecto
  // lo resincroniza — pero solo cuando NO se está editando ahora mismo,
  // para no borrar en silencio un cambio a medio escribir.
  useEffect(() => {
    if (editando) return
    partidaRef.current = valoresDe(ingreso)
    setIngresoEdit(partidaRef.current)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ingreso.habitacion, ingreso.motivo_ingreso, ingreso.fecha_ingreso, ingreso.medico_responsable_id, editando])

  async function guardar() {
    setSaving(true)
    setError('')
    // Nota: "estado" NO se toca aquí a propósito. Cambiar de activo a
    // alta/exitus/traslado pasa siempre por el flujo de "Dar de alta",
    // que genera el informe y dispara la auditoría correspondiente.
    //
    // Solo se envían los campos que esta persona ha cambiado, y cada uno
    // solo se escribe si sigue valiendo lo que esta pantalla cargó. Antes
    // se enviaban los cuatro campos siempre: guardar el médico desde una
    // copia antigua devolvía el motivo (u otro campo) a su valor viejo,
    // pisando en silencio un cambio ya guardado por otra persona o pestaña.
    const original: Record<string, string | number | null> = {
      habitacion: ingreso.habitacion ?? null,
      motivo_ingreso: ingreso.motivo_ingreso ?? '',
      fecha_ingreso: ingreso.fecha_ingreso ?? '',
      medico_responsable_id: ingreso.medico_responsable_id ?? null,
    }
    const nuevo: Record<string, string | number | null> = {
      habitacion: ingresoEdit.habitacion ? parseInt(ingresoEdit.habitacion) : null,
      motivo_ingreso: ingresoEdit.motivo_ingreso,
      fecha_ingreso: ingresoEdit.fecha_ingreso,
      medico_responsable_id: ingresoEdit.medico_responsable_id || null,
    }
    const partida = partidaRef.current as Record<string, string>
    const cambios = Object.keys(nuevo).filter((k) => (ingresoEdit as Record<string, string>)[k] !== partida[k])
    if (cambios.length === 0) {
      setSaving(false)
      setEditando(false)
      return
    }
    const datos: Record<string, string | number | null> = {}
    let consulta = supabase.from('ingresos').update(datos)
    for (const k of cambios) {
      datos[k] = nuevo[k]
      // Un motivo vacío puede estar guardado como null o como ''.
      if (original[k] === null) consulta = consulta.is(k, null)
      else if (k === 'motivo_ingreso' && original[k] === '') consulta = consulta.or('motivo_ingreso.is.null,motivo_ingreso.eq.')
      else consulta = consulta.eq(k, original[k] as string | number)
    }
    const SELECT = '*, paciente:pacientes(*), medico_responsable:profesionales(*), cmbd(circunstancia_alta)'
    const { data, error: dbError } = await consulta
      .eq('id', ingreso.id)
      .select(SELECT)
      .maybeSingle()
    if (dbError) {
      setSaving(false)
      setError('No se pudieron guardar los cambios. Inténtalo de nuevo.')
      return
    }
    if (!data) {
      // Ningún episodio cumple «sigue como lo cargué»: alguien lo ha cambiado mientras se editaba.
      const { data: actual } = await supabase.from('ingresos').select(SELECT).eq('id', ingreso.id).maybeSingle()
      setSaving(false)
      if (!actual) { setError('No se pudieron guardar los cambios. Inténtalo de nuevo.'); return }
      const ETIQUETA: Record<string, string> = { habitacion: 'la habitación', motivo_ingreso: 'el motivo', fecha_ingreso: 'la fecha de ingreso', medico_responsable_id: 'el médico responsable' }
      const act = actual as unknown as Record<string, unknown>
      const norma = (v: unknown) => (v === null || v === undefined || v === '' ? null : v)
      const distintos = cambios.filter((k) => norma(act[k]) !== norma(original[k])).map((k) => ETIQUETA[k])
      // Se refresca la copia de esta pantalla: si se pulsa «Guardar» otra vez, ya se está sabiendo lo que se pisa.
      onUpdate(actual as unknown as Ingreso)
      setError(`Alguien ha cambiado ${distintos.length ? distintos.join(', ') : 'estos datos'} mientras lo editabas, y no se ha guardado. Lo que has escrito sigue aquí; revisa el dato actual y pulsa Guardar de nuevo si sigue siendo lo que quieres.`)
      return
    }
    setSaving(false)
    // Sincronizamos el estado del padre para que el encabezado y el resto
    // de pestañas reflejen los cambios sin necesidad de recargar la página.
    onUpdate(data as unknown as Ingreso)
    setSaved(true)
    setEditando(false)
    setTimeout(() => setSaved(false), 2000)
  }

  // Datos del paciente: siempre en modo lectura aquí. Se editan desde su
  // propia ficha (/pacientes/:id), para que solo haya un sitio donde tocarlos.
  const filaPaciente = (
    <div className="card p-6 max-md:p-4">
      <div className="flex items-center justify-between gap-3 mb-3">
        <p className="section-title mb-0">Datos del paciente</p>
        <Link
          to={`/pacientes/${ingreso.paciente_id}`}
          className="flex items-center gap-1 text-xs text-primary-600 hover:underline"
        >
          Editar en la ficha del paciente <ExternalLink className="w-3 h-3 shrink-0" />
        </Link>
      </div>
      {/* Una columna en móvil: con dos, la etiqueta de 10 rem no cabía y se pisaba con el valor de al lado. */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-x-8 gap-y-1 text-sm">
        {([
          ['CIPNA', p.cipna], ['NHC', p.nhc], ['DNI', p.dni],
          ['Fecha nacimiento', p.fecha_nacimiento ? new Date(p.fecha_nacimiento).toLocaleDateString('es-ES') : null],
          ['Sexo', p.sexo], ['Municipio', p.municipio],
          ['Médico de cabecera', p.medico_cabecera],
          ['Contacto familiar', p.contacto_familiar_nombre],
          ['Teléfono familiar', p.contacto_familiar_telefono],
        ] as [string, string | null | undefined][]).map(([k, v]) => (
          <div key={k} className="flex py-1">
            <span className="w-40 max-md:w-2/5 max-md:max-w-40 text-slate-500 shrink-0">{k}</span>
            <span className="text-slate-700 min-w-0 break-words">{v || <span className="text-slate-500">—</span>}</span>
          </div>
        ))}
      </div>
    </div>
  )

  if (editando) {
    const inp = (label: string, val: string, onChange: (v: string) => void, type = 'text', ref?: RefObject<HTMLInputElement | null>) => (
      <div key={label}>
        <label className="label">{label}</label>
        <input ref={ref} type={type} className="input" value={val}
          onChange={e => onChange(e.target.value)} />
      </div>
    )
    return (
      <div className="ancho-formulario space-y-5">
        {filaPaciente}
        <div className="card p-6 max-md:p-4">
          <p className="section-title">Datos del ingreso</p>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {inp('Fecha de ingreso', ingresoEdit.fecha_ingreso, v => setIngresoEdit(i => ({ ...i, fecha_ingreso: v })), 'date')}
            <div>
              <label className="label">Fecha de alta</label>
              <p className="input bg-slate-50 text-slate-500 cursor-not-allowed">
                {ingreso.fecha_alta ? new Date(ingreso.fecha_alta).toLocaleDateString('es-ES') : '—'}
              </p>
              <p className="text-xs text-slate-500 mt-1">
                Se pone desde "Dar de alta", no aquí (para que vaya siempre junto con el estado).
              </p>
            </div>
            <div>
              <label className="label">Habitación</label>
              <SelectorHabitacion
                ref={habitacionInputRef}
                value={ingresoEdit.habitacion}
                onChange={(v) => setIngresoEdit(i => ({ ...i, habitacion: v }))}
                habitacionActual={ingreso.habitacion}
              />
            </div>
            <div>
              <label className="label">Estado</label>
              <p className="input bg-slate-50 text-slate-500 cursor-not-allowed">
                {ESTADO_LABEL[ingreso.estado] ?? ingreso.estado}
              </p>
              <p className="text-xs text-slate-500 mt-1">
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
            <div className="md:col-span-2">
              <label className="label">Motivo de ingreso</label>
              <textarea className="textarea" rows={2} value={ingresoEdit.motivo_ingreso}
                onChange={e => setIngresoEdit(i => ({ ...i, motivo_ingreso: e.target.value }))} />
            </div>
          </div>
        </div>
        {error && (
          <p className="aviso aviso-error">{error}</p>
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
    <div className="ancho-formulario space-y-5">
      {filaPaciente}
      <div className="card p-6 max-md:p-4">
        <div className="flex items-center justify-between gap-3 mb-3">
          <p className="section-title mb-0">Datos del ingreso</p>
          <button type="button" onClick={() => setEditando(true)} className="btn-secondary btn-sm">
            Editar datos del ingreso
          </button>
        </div>
        <div className="grid grid-cols-1 gap-y-1 text-sm">
          {rowsIngreso.map(([k, v]) => (
            <div key={k} className="flex py-1">
              <span className="w-40 max-md:w-2/5 max-md:max-w-40 text-slate-500 shrink-0">{k}</span>
              <span className="text-slate-700 min-w-0 break-words">{v || <span className="text-slate-500">—</span>}</span>
            </div>
          ))}
        </div>
      </div>
      {saved && <p className="text-emerald-700 text-sm text-right">✓ Guardado correctamente</p>}
    </div>
  )
}


export { TabDatos }
