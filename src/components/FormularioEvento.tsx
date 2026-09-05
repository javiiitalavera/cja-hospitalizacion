import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { hoyLocal } from '../lib/fechas'
import { useAuth } from '../lib/AuthContext'
import type { Profesional } from '../types'
import { TIPO_EVENTO_LABEL, CAMPOS_POR_TIPO, TURNO_LABEL, turnoSegunHora, type TipoEvento, type Evento } from '../types/eventos'
import { X, Save } from 'lucide-react'

interface Props {
  ingresoId: string
  eventoExistente?: Evento | null
  onClose: () => void
  onGuardado: () => void
  pacienteInfo?: { nombre: string; habitacion?: number | null }
}

export default function FormularioEvento({ ingresoId, eventoExistente, onClose, onGuardado, pacienteInfo }: Props) {
  const navigate = useNavigate()
  const { profesional: yo } = useAuth()
  const [tipo, setTipo] = useState<TipoEvento | ''>(eventoExistente?.tipo ?? '')
  const [fecha, setFecha] = useState(eventoExistente?.fecha ?? hoyLocal())
  const [hora, setHora] = useState(eventoExistente?.hora?.slice(0, 5) ?? '')
  const [turno, setTurno] = useState(eventoExistente?.turno ?? '')
  const [estado, setEstado] = useState<'pendiente' | 'completa'>(eventoExistente?.estado ?? 'completa')
  const [datos, setDatos] = useState<Record<string, string>>(eventoExistente?.datos ?? {})
  const [notas, setNotas] = useState(eventoExistente?.notas ?? '')
  // "Registrado por" ya no es un desplegable libre: es quien registra, es
  // decir, quien ha iniciado sesión. Al editar una incidencia existente,
  // se conserva el autor original en vez de poder cambiarlo.
  const profesionalId = eventoExistente?.registrado_por_id ?? yo?.id ?? ''
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

  // Se cargan las incidencias recientes de este mismo ingreso (unos
  // días hacia atrás, de sobra para la ventana de 24h que importa) —
  // solo al registrar una nueva, nunca al editar una ya existente,
  // donde no pintaría nada compararla consigo misma.
  const [recientes, setRecientes] = useState<Evento[]>([])
  useEffect(() => {
    if (eventoExistente) return
    const hace3dias = new Date()
    hace3dias.setDate(hace3dias.getDate() - 3)
    supabase
      .from('eventos')
      .select('id, tipo, fecha, hora, notas, registrado_por:profesionales!registrado_por_id(nombre, apellidos, rol)')
      .eq('ingreso_id', ingresoId)
      .gte('fecha', hace3dias.toISOString().slice(0, 10))
      .order('fecha', { ascending: false })
      .then(({ data }) => setRecientes((data ?? []) as unknown as Evento[]))
  }, [ingresoId, eventoExistente])

  // Combina fecha+hora en un instante comparable — si falta la hora,
  // se usa el mediodía como aproximación central del día, ni "recién
  // pasó" ni "hace casi 24h" por defecto.
  function instante(fecha: string, hora?: string | null): number {
    return new Date(`${fecha}T${hora || '12:00'}`).getTime()
  }

  // La misma incidencia (mismo tipo, dentro de 24h) que ya exista —
  // es habitual que algo pase de madrugada y se registre al día
  // siguiente, así que la ventana no es "mismo día natural", son 24h
  // reales desde el instante que se está guardando.
  function posibleDuplicado(): Evento | null {
    if (!tipo) return null
    const miInstante = instante(fecha, hora)
    return (
      recientes.find(
        (ev) => ev.tipo === tipo && Math.abs(instante(ev.fecha, ev.hora) - miInstante) <= 24 * 60 * 60 * 1000
      ) ?? null
    )
  }

  const [confirmarDuplicado, setConfirmarDuplicado] = useState<Evento | null>(null)

  // Sin esto, cambiar el tipo mientras se edita una incidencia
  // existente (por ejemplo, de "caída" a "fuga") dejaba los campos
  // del tipo anterior sueltos en "datos" — invisibles en el
  // formulario, pero guardados igualmente al pulsar "Guardar", mezclados
  // con los del tipo nuevo. tipoAnteriorRef distingue "el tipo acaba
  // de cargarse al abrir el formulario" (no limpiar) de "el usuario
  // ha elegido otro tipo de verdad" (sí limpiar) — antes solo se
  // limpiaba al crear una incidencia nueva, nunca al editar una ya
  // existente.
  const tipoAnteriorRef = useRef(tipo)
  useEffect(() => {
    if (tipoAnteriorRef.current !== tipo) {
      setDatos({})
      tipoAnteriorRef.current = tipo
    }
  }, [tipo])

  function setDato(key: string, val: string) {
    setDatos((d) => ({ ...d, [key]: val }))
  }

  function cambiarHora(v: string) {
    setHora(v)
    // Se propone el turno solo si todavía no se ha elegido ninguno —
    // si la persona ya lo puso a mano, no se le pisa la elección.
    if (v && !turno) {
      const sugerido = turnoSegunHora(v)
      if (sugerido) setTurno(sugerido)
    }
  }

  async function guardar(forzar = false) {
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
      setError('No se ha podido identificar tu sesión. Recarga la página e inténtalo de nuevo.')
      return
    }

    // Si la incidencia se marca como pendiente de completar, no tiene
    // sentido exigir una respuesta a los campos que todavía no se
    // conocen — obligaría a inventar un valor solo para poder
    // guardar, que es justo lo que se quiere evitar.
    if (estado === 'completa') {
      const campos = CAMPOS_POR_TIPO[tipo]
      for (const campo of campos) {
        if (campo.requerido && !datos[campo.key]) {
          setError(`El campo "${campo.label}" es obligatorio.`)
          return
        }
      }
    }

    // No es un bloqueo — puede haber dos caídas reales el mismo día —
    // es un aviso, para que cuatro personas distintas no acaben
    // registrando la misma caída cuatro veces sin saberlo unas de
    // otras. Se puede pasar por alto a propósito ("Registrar otra").
    if (!forzar) {
      const duplicado = posibleDuplicado()
      if (duplicado) {
        setConfirmarDuplicado(duplicado)
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
      estado,
    }

    const { error: dbError } = eventoExistente
      ? await supabase.from('eventos').update(payload).eq('id', eventoExistente.id)
      : await supabase.from('eventos').insert([payload])

    setSaving(false)
    if (dbError) {
      setError('No se pudo guardar la incidencia. Inténtalo de nuevo.')
      return
    }
    onGuardado()
  }

  const camposActuales = tipo ? CAMPOS_POR_TIPO[tipo] : []

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg max-h-[90vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b">
          <div>
            <h2 className="text-base font-bold text-slate-800">
              {eventoExistente ? 'Editar incidencia' : 'Registrar incidencia'}
            </h2>
            {pacienteInfo && (
              <p className="text-xs text-slate-400 mt-0.5">
                {pacienteInfo.nombre}
                {pacienteInfo.habitacion != null && ` · Hab. ${pacienteInfo.habitacion}`}
              </p>
            )}
          </div>
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

          {/* Si ya hay una del mismo tipo en las últimas 24h, se
              enseña aquí mismo, antes de rellenar nada más — para que
              quien está registrando lo vea con calma, no solo en el
              aviso al pulsar Guardar. */}
          {(() => {
            const reciente = posibleDuplicado()
            if (!reciente) return null
            return (
              <div className="text-xs bg-amber-50 border border-amber-200 text-amber-800 rounded-lg px-3 py-2">
                <span className="font-medium">Incidencia reciente:</span> {TIPO_EVENTO_LABEL[reciente.tipo]}{' '}
                {new Date(`${reciente.fecha}T${reciente.hora || '00:00'}`).toLocaleDateString('es-ES')}
                {reciente.hora && ` a las ${reciente.hora.slice(0, 5)}`}
                {reciente.registrado_por && `, registrada por ${reciente.registrado_por.nombre} ${reciente.registrado_por.apellidos}`}.
                {' '}
                <button
                  type="button"
                  onClick={() => { navigate(`/ingresos/${ingresoId}?tab=eventos`); onClose() }}
                  className="underline font-medium hover:text-amber-900"
                >
                  Ver incidencia
                </button>
              </div>
            )
          })()}

          {/* Fecha, hora, turno */}
          <div className="grid grid-cols-3 gap-3">
            <div>
              <label className="label">Fecha *</label>
              <input type="date" className="input" value={fecha} max={hoyLocal()} onChange={(e) => setFecha(e.target.value)} />
            </div>
            <div>
              <label className="label">Hora</label>
              <input type="time" className="input" value={hora} onChange={(e) => cambiarHora(e.target.value)} />
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
          {/* Aviso, no bloqueo: puede haber motivos legítimos para que
              no coincidan (se registra más tarde de cuando pasó). Las
              franjas son las reales de la clínica: 22-8 noche, 8-15
              mañana, 15-22 tarde. */}
          {hora && turno && turnoSegunHora(hora) && turnoSegunHora(hora) !== turno && (
            <p className="text-xs text-amber-600 bg-amber-50 border border-amber-200 rounded-lg px-3 py-1.5 -mt-2">
              A las {hora} correspondería el turno de {TURNO_LABEL[turnoSegunHora(hora)!]}, no el de {TURNO_LABEL[turno]}. Compruébalo antes de guardar.
            </p>
          )}

          {/* Estado: para cuando el desenlace se sabrá más adelante
              (una caída cuyas consecuencias se confirman días
              después) — sin obligar a rellenar con algo inventado
              solo para poder guardar. */}
          <div className="flex items-center gap-3 bg-slate-50 border border-slate-200 rounded-lg px-3 py-2">
            <span className="text-xs font-medium text-slate-500">Estado de la incidencia</span>
            <div className="flex gap-1 ml-auto">
              <button type="button" onClick={() => setEstado('completa')}
                className={`px-2.5 py-1 rounded-md text-xs font-medium transition-colors ${estado === 'completa' ? 'bg-emerald-100 text-emerald-700' : 'text-slate-400 hover:bg-slate-100'}`}>
                Completa
              </button>
              <button type="button" onClick={() => setEstado('pendiente')}
                className={`px-2.5 py-1 rounded-md text-xs font-medium transition-colors ${estado === 'pendiente' ? 'bg-amber-100 text-amber-700' : 'text-slate-400 hover:bg-slate-100'}`}>
                Pendiente de completar
              </button>
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
              {/* Aviso, no bloqueo — puede haber matices clínicos que
                  esto no capture, pero conviene que quien registra lo
                  revise antes de dar por buena la combinación. */}
              {tipo === 'caida' && datos.consecuencias === 'Sin lesión' && ['Leve', 'Moderada', 'Grave'].includes(datos.gravedad) && (
                <p className="text-xs text-amber-600 bg-amber-50 border border-amber-200 rounded-lg px-3 py-1.5">
                  "Sin lesión" en consecuencias no encaja con una gravedad de "{datos.gravedad}". Revisa que sea correcto.
                </p>
              )}
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

          {/* El autor es siempre quien tiene la sesión abierta: no es
              un campo que se pueda elegir, para que quede fiable quién
              registró cada incidencia. */}
          <div>
            <label className="label">Registrado por</label>
            <p className="input bg-slate-50 text-slate-600 cursor-not-allowed">
              {eventoExistente
                ? (() => {
                    const autor = profesionales.find((p) => p.id === profesionalId)
                    return autor ? `${autor.nombre} ${autor.apellidos}` : 'Autor original'
                  })()
                : yo
                ? `${yo.nombre} ${yo.apellidos} (tú)`
                : '—'}
            </p>
          </div>

          {error && <div className="p-3 bg-red-50 border border-red-200 text-red-700 text-sm rounded-lg">{error}</div>}
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t flex justify-end gap-3">
          <button onClick={onClose} className="btn-secondary">
            Cancelar
          </button>
          <button onClick={() => guardar()} disabled={saving} className="btn-primary">
            <Save className="w-4 h-4" />
            {saving ? 'Guardando…' : 'Guardar incidencia'}
          </button>
        </div>
      </div>

      {/* Aviso al guardar, no bloqueo: puede haber dos incidencias
          reales del mismo tipo en 24h — se pregunta, no se impide. */}
      {confirmarDuplicado && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-[60] p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm p-5 space-y-4">
            <h3 className="font-bold text-slate-800">Posible incidencia duplicada</h3>
            <p className="text-sm text-slate-600">
              Ya existe una {TIPO_EVENTO_LABEL[confirmarDuplicado.tipo].toLowerCase()} registrada el{' '}
              {new Date(`${confirmarDuplicado.fecha}T${confirmarDuplicado.hora || '00:00'}`).toLocaleDateString('es-ES')}
              {confirmarDuplicado.hora && ` a las ${confirmarDuplicado.hora.slice(0, 5)}`}
              {confirmarDuplicado.registrado_por && `, por ${confirmarDuplicado.registrado_por.nombre} ${confirmarDuplicado.registrado_por.apellidos}`}.
              ¿Quieres abrirla, o registrar esta como una incidencia distinta?
            </p>
            <div className="flex justify-end gap-3">
              <button
                onClick={() => { navigate(`/ingresos/${ingresoId}?tab=eventos`); onClose() }}
                className="btn-secondary text-sm"
              >
                Ver la existente
              </button>
              <button
                onClick={() => { setConfirmarDuplicado(null); guardar(true) }}
                className="btn-primary text-sm"
              >
                Registrar otra
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
