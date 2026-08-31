import { useEffect, useRef, useState } from 'react'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../lib/AuthContext'
import type { ItemsPaciente } from '../../types'
import { nombreCompleto, SEMAFORO_CAIDAS_COLOR as SEMAFORO_COLOR } from '../../types'
import { Save, X } from 'lucide-react'
import ModalContencion from '../../components/ModalContencion'
import {
  severidadDia, severidadNoche, SEVERIDAD_ESTILO,
  type ContencionDia, type ContencionNoche,
} from '../../types/contenciones'
import type { IngresoConItems } from './tipos'

// ─── PANEL LATERAL DE EDICIÓN ─────────────────────────────────

export default function PanelEdicion({
  ingreso,
  onClose,
  onSaved,
  onHabitacionChange,
  onContencionChanged,
}: {
  ingreso: IngresoConItems
  onClose: () => void
  onSaved: (updated: ItemsPaciente) => void
  onHabitacionChange: (ingresoId: string, nuevaHab: number) => void
  onContencionChanged: (ingresoId: string, nueva: { dia: ContencionDia | null; noche: ContencionNoche[] | null }) => void
}) {
  const { rol } = useAuth()
  const esMedico = rol === 'medico'
  const [data, setData] = useState<Partial<ItemsPaciente>>(ingreso.items ?? {})
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [saveError, setSaveError] = useState(false)
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const dataRef = useRef(data)
  const saveSeqRef = useRef(0)
  dataRef.current = data

  const [confirmLimpiar, setConfirmLimpiar] = useState(false)
  const [modalContencion, setModalContencion] = useState(false)
  const [estadoContencion, setEstadoContencion] = useState<{ dia: string | null; noche: string[] | null } | 'cargando'>('cargando')
  const [errorContencion, setErrorContencion] = useState('')

  useEffect(() => {
    supabase.from('contenciones').select('dia, noche').eq('ingreso_id', ingreso.id).maybeSingle()
      .then(({ data, error }) => {
        if (error) {
          // Distinto de "sin revisar": un error real no debería
          // dejar creer que no hay contención pautada.
          setErrorContencion('No se pudo comprobar la contención: ' + error.message)
          return
        }
        setEstadoContencion(data ?? { dia: null, noche: null })
      })
  }, [ingreso.id])
  const [habEdit, setHabEdit] = useState(ingreso.habitacion?.toString() ?? '')
  const [habError, setHabError] = useState('')
  const [savingHab, setSavingHab] = useState(false)

  async function cambiarHabitacion() {
    const n = parseInt(habEdit)
    if (!n || n < 1 || n > 33) {
      setHabError('Hab. inválida (1-33)')
      return
    }
    if (n === ingreso.habitacion) {
      setHabError('')
      return
    }
    setSavingHab(true)
    setHabError('')
    // Verificar que no está ocupada
    const { data: ocupada } = await supabase
      .from('ingresos')
      .select('id, paciente:pacientes(nombre, primer_apellido)')
      .eq('habitacion', n)
      .eq('estado', 'activo')
      .maybeSingle()
    if (ocupada) {
      const p = (ocupada as any).paciente
      setHabError(`Ocupada por ${p?.primer_apellido ?? '?'}, ${p?.nombre ?? '?'}`)
      setSavingHab(false)
      return
    }
    const { error: errHab } = await supabase.from('ingresos').update({ habitacion: n }).eq('id', ingreso.id)
    setSavingHab(false)
    if (errHab) {
      setHabError('No se pudo cambiar la habitación (¿tienes permiso?).')
      return
    }
    onHabitacionChange(ingreso.id, n)
  }

  async function save(d = dataRef.current) {
    const miSecuencia = ++saveSeqRef.current
    setSaving(true)
    const { data: updated, error } = await supabase
      .from('items_paciente')
      .upsert({ ...d, ingreso_id: ingreso.id }, { onConflict: 'ingreso_id' })
      .select()
      .single()
    setSaving(false)
    if (error) {
      setSaved(false)
      setSaveError(true)
      setTimeout(() => setSaveError(false), 4000)
      return
    }
    setSaved(true)
    // Si mientras esta petición estaba en el aire ya se lanzó un
    // guardado más reciente, esta respuesta llega obsoleta — no debe
    // propagarse hacia la rejilla principal y pisar un cambio nuevo.
    if (miSecuencia === saveSeqRef.current && updated) onSaved(updated as ItemsPaciente)
    setTimeout(() => setSaved(false), 2000)
  }

  async function limpiarItems() {
    if (debounceRef.current) clearTimeout(debounceRef.current)
    setSaving(true)
    // Vacío explícito de cada campo: un upsert que solo mande ingreso_id
    // NO borra el resto de columnas, solo las deja tal como estaban.
    const vacio = {
      ingreso_id: ingreso.id,
      dependencia_avd: null, panial_dia: null, panial_noche: null,
      colector: false, sonda_vesical: false,
      dentadura: null, audifonos: null, gafas: null,
      higiene: null, vestido: null, ducha: null, banio: false, siestas: false,
      deambulacion: null, ayudas_deambulacion: null,
      bipedestador: false, grua: false, cambios_posturales: false, cabecero_grados: null,
      ingestas: null, oxigenoterapia: false, botella_noche: false,
      colchon_antiescaras: false, patucos_coderas: false,
      timbre_habitacion: false, objetos_calma: null, alerta_conducta: [],
      // La contención (día/noche) no se toca aquí: vive en su propia
      // pauta, "limpiar ítems" no debe desajustarla de lo que de
      // verdad está pautado.
      observaciones: null,
      semaforo_caidas: null,
    }
    const { data: updated, error } = await supabase
      .from('items_paciente')
      .upsert(vacio, { onConflict: 'ingreso_id' })
      .select()
      .single()
    setSaving(false)
    setConfirmLimpiar(false)
    if (error) {
      setSaveError(true)
      setTimeout(() => setSaveError(false), 4000)
      return
    }
    setData({})
    if (updated) onSaved(updated as ItemsPaciente)
  }

  function update(key: keyof ItemsPaciente, val: any) {
    const next = { ...dataRef.current, [key]: val }
    setData(next)
    if (debounceRef.current) clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(() => save(next), 1200)
  }

  const sel = (key: keyof ItemsPaciente, label: string, opts: { v: string; l: string }[]) => (
    <div key={key} className="flex items-center justify-between py-1.5 border-b border-slate-100 last:border-0">
      <span className="text-xs text-slate-600 w-32 shrink-0">{label}</span>
      <select
        className="text-xs border border-slate-200 rounded px-1.5 py-1 bg-white flex-1 max-w-[160px]"
        value={(data[key] as string) ?? ''}
        onChange={(e) => update(key, e.target.value || null)}
      >
        <option value="">—</option>
        {opts.map((o) => (
          <option key={o.v} value={o.v}>
            {o.l}
          </option>
        ))}
      </select>
    </div>
  )

  const bool = (key: keyof ItemsPaciente, label: string) => (
    <label
      key={key}
      className="flex items-center justify-between py-1.5 border-b border-slate-100 last:border-0 cursor-pointer"
    >
      <span className="text-xs text-slate-600">{label}</span>
      <input
        type="checkbox"
        className="w-4 h-4 rounded text-primary-600"
        checked={!!data[key]}
        onChange={(e) => update(key, e.target.checked)}
      />
    </label>
  )

  const semaforo = (data as any).semaforo_caidas as string | undefined
  const nombre = ingreso.paciente ? nombreCompleto(ingreso.paciente) : ''

  return (
    <div className="fixed inset-y-0 right-0 w-80 bg-white shadow-2xl border-l flex flex-col z-40">
      {/* Header */}
      <div className="px-4 py-3 border-b bg-slate-50 flex items-start justify-between">
        <div className="flex-1 min-w-0 mr-2">
          <p className="font-bold text-sm text-slate-800 truncate">{nombre}</p>
          <div className="flex items-center gap-1.5 mt-1">
            <span className="text-xs text-slate-400">Hab.</span>
            <input
              type="number"
              min={1}
              max={33}
              disabled={!esMedico}
              title={esMedico ? '' : 'Solo un médico puede cambiar la habitación'}
              className="w-14 text-xs border border-slate-200 rounded px-1.5 py-0.5 text-slate-700 font-medium disabled:bg-slate-50 disabled:text-slate-400"
              value={habEdit}
              onChange={(e) => {
                setHabEdit(e.target.value)
                setHabError('')
              }}
              onBlur={cambiarHabitacion}
              onKeyDown={(e) => e.key === 'Enter' && cambiarHabitacion()}
            />
            {savingHab && <span className="text-xs text-slate-400">…</span>}
            {habError && <span className="text-xs text-red-500">{habError}</span>}
          </div>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-xs text-slate-400">
            {saving && '● Guardando…'}
            {!saving && saved && <span className="text-emerald-600">✓ Guardado</span>}
            {!saving && saveError && <span className="text-red-600">✗ Error al guardar, inténtalo de nuevo</span>}
          </span>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600 ml-1">
            <X className="w-4 h-4" />
          </button>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto px-4 py-3">
        {/* Semáforo caídas */}
        <p className="section-title mt-1">Semáforo de caídas</p>
        <div className="flex gap-2 py-2 border-b border-slate-100 mb-1">
          {['verde', 'amarillo', 'naranja', 'rojo'].map((color) => {
            const active = semaforo === color
            const bg = SEMAFORO_COLOR[color]
            const txtColor = color === 'rojo' ? '#fff' : '#000'
            return (
              <button
                key={color}
                type="button"
                onClick={() => update('semaforo_caidas' as keyof ItemsPaciente, active ? null : color)}
                className={`flex-1 py-1.5 rounded-lg text-xs font-semibold border-2 transition-all ${active ? 'border-slate-700 scale-105' : 'border-transparent opacity-70 hover:opacity-100'}`}
                style={{ backgroundColor: bg, color: txtColor }}
              >
                {color.charAt(0).toUpperCase() + color.slice(1)}
              </button>
            )
          })}
        </div>

        <p className="section-title mt-3">Seguridad y conducta</p>
        {errorContencion && (
          <p className="text-[10px] text-red-600 bg-red-50 border border-red-100 rounded px-2 py-1 mb-1.5">{errorContencion}</p>
        )}
        {estadoContencion === 'cargando' ? (
          <p className="text-xs text-slate-400">Cargando…</p>
        ) : (
          <div className="flex items-center gap-2 mb-2">
            {(['dia', 'noche'] as const).map((eje) => {
              const sev = eje === 'dia' ? severidadDia(estadoContencion.dia as any) : severidadNoche(estadoContencion.noche as any)
              const estilo = SEVERIDAD_ESTILO[sev]
              return (
                <span key={eje} className={`px-2 py-1 rounded text-[10px] font-medium border ${estilo.bg} ${estilo.text} ${estilo.border}`}>
                  {eje === 'dia' ? 'Día' : 'Noche'}: {estilo.label}
                </span>
              )
            })}
          </div>
        )}
        <button onClick={() => setModalContencion(true)} className="text-xs text-primary-600 hover:underline font-medium mb-2">
          Ver / editar contención
        </button>
        {modalContencion && (
          <ModalContencion
            ingresoId={ingreso.id}
            onClose={() => setModalContencion(false)}
            onGuardado={() => {
              supabase.from('contenciones').select('dia, noche').eq('ingreso_id', ingreso.id).maybeSingle()
                .then(({ data, error }) => {
                  if (error) {
                    setErrorContencion('No se pudo confirmar el guardado: ' + error.message)
                    return
                  }
                  const nueva = data ?? { dia: null, noche: null }
                  setEstadoContencion(nueva)
                  onContencionChanged(ingreso.id, nueva)
                })
            }}
          />
        )}
        <div className="py-1.5 border-b border-slate-100">
          <span className="text-xs text-slate-600 block mb-1">Alerta de conducta</span>
          <div className="flex flex-wrap gap-1.5">
            {([
              { v: 'riesgo_autolitico', l: 'Riesgo autolítico' },
              { v: 'agresion_imprevisible', l: 'Agresión imprevisible' },
              { v: 'riesgo_fuga', l: 'Riesgo de fuga' },
            ] as const).map((opt) => {
              const actual: string[] = ((data as any).alerta_conducta as string[]) ?? []
              const activo = actual.includes(opt.v)
              return (
                <button
                  key={opt.v}
                  type="button"
                  onClick={() => update('alerta_conducta' as any, activo ? actual.filter((x) => x !== opt.v) : [...actual, opt.v])}
                  className={`px-2 py-1 rounded text-[10px] font-medium border transition-colors ${
                    activo ? 'bg-red-50 text-red-700 border-red-200' : 'bg-white text-slate-500 border-slate-300'
                  }`}
                >
                  {opt.l}
                </button>
              )
            })}
          </div>
        </div>
        <div className="flex items-center justify-between py-1.5 border-b border-slate-100">
          <span className="text-xs text-slate-600 w-32 shrink-0">Objetos de calma</span>
          <input
            className="text-xs border border-slate-200 rounded px-1.5 py-1 flex-1 max-w-[160px]"
            value={((data as any).objetos_calma as string) ?? ''}
            onChange={(e) => update('objetos_calma' as any, e.target.value)}
          />
        </div>

        <p className="section-title mt-3">Movilidad</p>
        {sel('deambulacion', 'Deambulación', [
          { v: 'autonomo', l: 'Autónomo' },
          { v: '1_persona', l: '1 persona' },
          { v: '2_personas', l: '2 personas' },
        ])}
        {sel('ayudas_deambulacion', 'Ayudas', [
          { v: 'ninguna', l: 'Ninguna' },
          { v: 'baston', l: 'Bastón' },
          { v: 'andador_2r', l: 'Andador 2r' },
          { v: 'andador_4r', l: 'Andador 4r' },
          { v: 'silla_ruedas', l: 'Silla ruedas' },
        ])}
        {bool('bipedestador', 'Bipedestador')}
        {bool('grua', 'Grúa')}
        <div className="flex items-center justify-between py-1.5 border-b border-slate-100">
          <span className="text-xs text-slate-600 w-32 shrink-0">Cabecero elevado (º)</span>
          <input
            className="text-xs border border-slate-200 rounded px-1.5 py-1 w-20"
            placeholder="p. ej. 30"
            value={((data as any).cabecero_grados as string) ?? ''}
            onChange={(e) => update('cabecero_grados' as any, e.target.value)}
          />
        </div>

        <p className="section-title mt-3">Alimentación</p>
        {sel('ingestas', 'Ingestas', [
          { v: 'autonomo', l: 'Autónomo' },
          { v: 'dependiente', l: 'Dependiente' },
        ])}

        <p className="section-title mt-3">Higiene y continencia</p>
        {sel('dependencia_avd', 'Dependencia', [
          { v: '1', l: '1 persona' },
          { v: '2', l: '2 personas' },
        ])}
        {sel('panial_dia', 'Pañal día', [
          { v: 'ninguno', l: 'Ninguno' },
          { v: 'BP', l: 'BP' },
          { v: 'CA', l: 'CA' },
        ])}
        {sel('panial_noche', 'Pañal noche', [
          { v: 'ninguno', l: 'Ninguno' },
          { v: 'BP', l: 'BP' },
          { v: 'CA', l: 'CA' },
          { v: 'CA+malla', l: 'CA+malla' },
        ])}
        {bool('colector', 'Colector')}
        {bool('sonda_vesical', 'Sonda vesical')}
        {sel('higiene', 'Higiene', [
          { v: 'lavabo', l: 'Lavabo' },
          { v: 'cama', l: 'Cama' },
        ])}
        {sel('ducha', 'Ducha', [
          { v: 'pie', l: 'De pie' },
          { v: 'sentado', l: 'Sentado' },
        ])}
        {sel('vestido', 'Vestido', [
          { v: 'autonomo', l: 'Autónomo' },
          { v: 'dependiente', l: 'Dependiente' },
        ])}
        {bool('banio', 'Baño acompañado (no va solo)')}

        <p className="section-title mt-3">Piel y postura</p>
        {bool('colchon_antiescaras', 'Colchón antiescaras')}
        {bool('patucos_coderas', 'Patucos / coderas')}
        {bool('cambios_posturales', 'Cambios posturales')}

        <p className="section-title mt-3">Prótesis y sensorial</p>
        {sel('dentadura', 'Dentadura', [
          { v: 'ninguna', l: 'Ninguna' },
          { v: 'superior', l: 'Superior' },
          { v: 'inferior', l: 'Inferior' },
          { v: 'completa', l: 'Completa' },
          { v: 'fija', l: 'Fija' },
          { v: 'puente', l: 'Puente' },
        ])}
        {sel('audifonos', 'Audífonos', [
          { v: 'ninguno', l: 'Ninguno' },
          { v: 'derecho', l: 'Derecho' },
          { v: 'izquierdo', l: 'Izquierdo' },
          { v: 'ambos', l: 'Ambos' },
        ])}
        {sel('gafas', 'Gafas', [
          { v: 'no', l: 'No' },
          { v: 'si', l: 'Sí' },
          { v: 'solo_tv', l: 'Solo TV' },
        ])}

        <p className="section-title mt-3">Otros</p>
        {bool('oxigenoterapia', 'Oxigenoterapia')}
        {bool('botella_noche', 'Botella noche')}
        {bool('timbre_habitacion' as any, 'Timbre en habitación')}
        {bool('siestas', 'Siesta por la tarde')}

        <p className="section-title mt-3">Observaciones</p>
        <textarea
          className="textarea text-xs w-full"
          rows={3}
          placeholder="Notas libres…"
          value={((data as any).observaciones as string) ?? ''}
          onChange={(e) => update('observaciones' as any, e.target.value)}
        />
      </div>

      <div className="px-4 py-3 border-t space-y-2">
        <button onClick={() => save()} className="btn-primary w-full justify-center">
          <Save className="w-3.5 h-3.5" />
          Guardar ahora
        </button>
        {!confirmLimpiar ? (
          <button
            onClick={() => setConfirmLimpiar(true)}
            className="w-full text-xs text-slate-400 hover:text-red-500 transition-colors py-1 text-center"
          >
            Borrar todos los ítems
          </button>
        ) : (
          <div className="flex gap-2">
            <button onClick={() => setConfirmLimpiar(false)} className="btn-secondary flex-1 text-xs py-1.5">
              Cancelar
            </button>
            <button onClick={limpiarItems} className="btn-danger flex-1 text-xs py-1.5">
              Confirmar borrado
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
