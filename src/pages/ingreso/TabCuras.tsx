import { useEffect, useMemo, useState } from 'react'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../lib/AuthContext'
import { hoyLocal } from '../../lib/fechas'
import { Plus, Pencil, Trash2, CheckCircle2, Circle, ChevronDown, ChevronRight, X, Lock } from 'lucide-react'
import {
  CARACTERISTICA_LABEL, GRADO_LABEL, LOCALIZACIONES_SUGERIDAS, CURAS_SUGERIDAS, DIAS_CORTO,
  ordenarValoraciones, pautaVigente, textoPauta, fechaLarga,
  type Lesion, type Valoracion, type Caracteristica,
} from '../curas/tipos'

const SELECT_LESIONES =
  '*, valoraciones:curas_valoraciones(*), registrado_por:profesionales!registrado_por_id(nombre, apellidos)'

// ── Marco de ventana ─────────────────────────────────────────
function Modal({ titulo, onClose, children }: { titulo: string; onClose: () => void; children: React.ReactNode }) {
  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4" onClick={onClose}>
      <div
        className="bg-white rounded-2xl shadow-2xl w-full max-w-xl max-h-[90vh] overflow-y-auto p-6"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-base font-bold text-slate-800">{titulo}</h2>
          <button onClick={onClose} className="text-slate-500 hover:text-slate-600" aria-label="Cerrar">
            <X className="w-5 h-5" />
          </button>
        </div>
        {children}
      </div>
    </div>
  )
}

// ── Campos de la pauta de cura (compartidos por los dos formularios) ──
interface PautaForm {
  tipo_cura: string
  frecuencia_horas: string
  dias_semana: number[]
}

function CamposPauta({ valor, onChange }: { valor: PautaForm; onChange: (v: PautaForm) => void }) {
  function alternarDia(d: number) {
    const dias = valor.dias_semana.includes(d) ? valor.dias_semana.filter((x) => x !== d) : [...valor.dias_semana, d]
    onChange({ ...valor, dias_semana: dias.sort() })
  }
  return (
    <div className="space-y-3">
      <div>
        <label className="label">Tipo de cura</label>
        <input
          className="input"
          list="curas-sugeridas"
          maxLength={300}
          placeholder="Ej.: Hidrogel + anticongestiva, parche"
          value={valor.tipo_cura}
          onChange={(e) => onChange({ ...valor, tipo_cura: e.target.value })}
        />
        <datalist id="curas-sugeridas">
          {CURAS_SUGERIDAS.map((c) => <option key={c} value={c} />)}
        </datalist>
        <div className="flex flex-wrap gap-1.5 mt-2">
          {CURAS_SUGERIDAS.slice(0, 10).map((c) => (
            <button
              key={c}
              type="button"
              className="text-xs px-2 py-0.5 rounded-full border border-slate-200 text-slate-600 hover:bg-slate-50"
              onClick={() => onChange({ ...valor, tipo_cura: valor.tipo_cura ? `${valor.tipo_cura} + ${c}` : c })}
            >
              + {c}
            </button>
          ))}
        </div>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="label">Frecuencia (cada X horas)</label>
          <input
            className="input"
            type="number"
            min={1}
            max={720}
            placeholder="Ej.: 48"
            value={valor.frecuencia_horas}
            onChange={(e) => onChange({ ...valor, frecuencia_horas: e.target.value })}
          />
        </div>
        <div>
          <label className="label">Días en que toca</label>
          <div className="flex gap-1">
            {DIAS_CORTO.map((d, i) => (
              <button
                key={d}
                type="button"
                onClick={() => alternarDia(i + 1)}
                className={`w-8 h-8 rounded-md text-xs font-semibold border ${
                  valor.dias_semana.includes(i + 1)
                    ? 'bg-primary-600 text-white border-primary-600'
                    : 'bg-white text-slate-500 border-slate-200 hover:bg-slate-50'
                }`}
              >
                {d}
              </button>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}

function aEntero(s: string): number | null {
  const t = s.trim()
  if (t === '') return null
  const n = Number(t)
  return Number.isInteger(n) ? n : NaN
}

// ── Formulario de lesión (crear / editar) ────────────────────
function FormularioLesion({
  ingresoId, editando, onClose, onGuardado,
}: { ingresoId: string; editando: Lesion | null; onClose: () => void; onGuardado: () => void }) {
  const { profesional } = useAuth()
  const [f, setF] = useState({
    caracteristicas: (editando?.caracteristicas ?? 'upp') as Caracteristica,
    localizacion: editando?.localizacion ?? '',
    fecha_inicio: editando?.fecha_inicio ?? hoyLocal(),
    origen: editando?.origen ?? '',
    notas: editando?.notas ?? '',
  })
  const [pauta, setPauta] = useState<PautaForm>({ tipo_cura: '', frecuencia_horas: '', dias_semana: [] })
  const [guardando, setGuardando] = useState(false)
  const [error, setError] = useState('')

  async function guardar() {
    setError('')
    if (!f.localizacion.trim()) { setError('Indica la localización.'); return }
    if (!profesional) { setError('Tu cuenta no tiene ficha de profesional.'); return }
    // El origen de una úlcera por presión alimenta el Dashboard (úlceras
    // producidas en el centro frente a las que ya traía), así que es obligatorio.
    if (f.caracteristicas === 'upp' && !f.origen) {
      setError('Indica si la úlcera por presión se produjo dentro o fuera del centro: cuenta para los indicadores del Dashboard.')
      return
    }
    const frec = aEntero(pauta.frecuencia_horas)
    if (!editando && frec !== null && (Number.isNaN(frec) || frec < 1 || frec > 720)) {
      setError('La frecuencia debe ser un número entero de horas entre 1 y 720.'); return
    }
    setGuardando(true)
    const datos = {
      caracteristicas: f.caracteristicas,
      localizacion: f.localizacion.trim(),
      fecha_inicio: f.fecha_inicio,
      origen: f.origen || null,
      notas: f.notas.trim() || null,
    }
    if (editando) {
      const { error: err } = await supabase.from('curas_lesiones').update(datos).eq('id', editando.id)
      setGuardando(false)
      if (err) { setError('No se pudo guardar: ' + err.message); return }
      onGuardado()
      return
    }
    const { data, error: err } = await supabase
      .from('curas_lesiones')
      .insert({ ...datos, ingreso_id: ingresoId, registrado_por_id: profesional.id })
      .select('id')
      .single()
    if (err || !data) { setGuardando(false); setError('No se pudo guardar: ' + (err?.message ?? 'sin respuesta')); return }
    // Pauta inicial (opcional): una primera valoración con la cura indicada.
    if (pauta.tipo_cura.trim()) {
      const { error: errV } = await supabase.from('curas_valoraciones').insert({
        lesion_id: data.id,
        fecha: f.fecha_inicio,
        tipo_cura: pauta.tipo_cura.trim(),
        frecuencia_horas: frec,
        dias_semana: pauta.dias_semana,
        registrado_por_id: profesional.id,
      })
      if (errV) {
        setGuardando(false)
        setError('La lesión se ha creado, pero no se pudo guardar la pauta: ' + errV.message + ' Añádela después con «Nueva valoración».')
        return
      }
    }
    setGuardando(false)
    onGuardado()
  }

  return (
    <Modal titulo={editando ? 'Editar lesión o cuidado' : 'Añadir lesión o cuidado'} onClose={onClose}>
      <div className="space-y-3">
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="label">Tipo *</label>
            <select className="input" value={f.caracteristicas}
              onChange={(e) => setF({ ...f, caracteristicas: e.target.value as Caracteristica })}>
              {Object.entries(CARACTERISTICA_LABEL).map(([k, l]) => <option key={k} value={k}>{l}</option>)}
            </select>
          </div>
          <div>
            <label className="label">Localización *</label>
            <input className="input" list="localizaciones" maxLength={120} value={f.localizacion}
              onChange={(e) => setF({ ...f, localizacion: e.target.value })} placeholder="Ej.: Sacro" />
            <datalist id="localizaciones">
              {LOCALIZACIONES_SUGERIDAS.map((l) => <option key={l} value={l} />)}
            </datalist>
          </div>
          <div>
            <label className="label">Fecha de inicio / detección</label>
            <input className="input" type="date" max={hoyLocal()} value={f.fecha_inicio}
              onChange={(e) => setF({ ...f, fecha_inicio: e.target.value })} />
          </div>
          <div>
            <label className="label">Se produjo…{f.caracteristicas === 'upp' && ' *'}</label>
            <select className="input" value={f.origen} onChange={(e) => setF({ ...f, origen: e.target.value })}>
              <option value="">{f.caracteristicas === 'upp' ? '— Selecciona —' : 'Sin indicar'}</option>
              <option value="centro">Dentro del centro</option>
              <option value="fuera">Fuera del centro</option>
            </select>
          </div>
        </div>
        <div>
          <label className="label">Notas</label>
          <textarea className="textarea" rows={2} maxLength={2000} value={f.notas}
            onChange={(e) => setF({ ...f, notas: e.target.value })} />
        </div>
        {!editando && (
          <div className="border-t pt-3">
            <p className="section-title">Pauta de cura inicial (opcional)</p>
            <CamposPauta valor={pauta} onChange={setPauta} />
          </div>
        )}
        {error && <p className="text-sm text-red-600 bg-red-50 border border-red-100 rounded-lg px-3 py-2">{error}</p>}
        <div className="flex gap-3 pt-1">
          <button onClick={onClose} className="btn-secondary flex-1">Cancelar</button>
          <button onClick={guardar} disabled={guardando} className="btn-primary flex-1 justify-center">
            {guardando ? 'Guardando…' : 'Guardar'}
          </button>
        </div>
      </div>
    </Modal>
  )
}

// ── Formulario de valoración (evolución) ─────────────────────
function FormularioValoracion({
  lesion, editando, onClose, onGuardado,
}: { lesion: Lesion; editando: Valoracion | null; onClose: () => void; onGuardado: () => void }) {
  const { profesional } = useAuth()
  const vigente = pautaVigente(lesion.valoraciones)
  // Al crear, se parte de la pauta vigente: lo normal es no cambiarla.
  const base = editando ?? vigente
  const [f, setF] = useState({
    fecha: editando?.fecha ?? hoyLocal(),
    medidas: editando?.medidas ?? '',
    grado: editando?.grado ?? '',
    frotis: editando?.frotis ?? false,
    norton: editando?.norton?.toString() ?? '',
    braden: editando?.braden?.toString() ?? '',
    emina: editando?.emina?.toString() ?? '',
    notas: editando?.notas ?? '',
  })
  const [pauta, setPauta] = useState<PautaForm>({
    tipo_cura: base?.tipo_cura ?? '',
    frecuencia_horas: base?.frecuencia_horas?.toString() ?? '',
    dias_semana: base?.dias_semana ?? [],
  })
  const [guardando, setGuardando] = useState(false)
  const [error, setError] = useState('')

  async function guardar() {
    setError('')
    if (!profesional) { setError('Tu cuenta no tiene ficha de profesional.'); return }
    const frec = aEntero(pauta.frecuencia_horas)
    const norton = aEntero(f.norton), braden = aEntero(f.braden), emina = aEntero(f.emina)
    if (frec !== null && (Number.isNaN(frec) || frec < 1 || frec > 720)) { setError('La frecuencia debe ser un número entero de horas entre 1 y 720.'); return }
    if (norton !== null && (Number.isNaN(norton) || norton < 5 || norton > 20)) { setError('Norton: valor entre 5 y 20.'); return }
    if (braden !== null && (Number.isNaN(braden) || braden < 6 || braden > 23)) { setError('Braden: valor entre 6 y 23.'); return }
    if (emina !== null && (Number.isNaN(emina) || emina < 0 || emina > 15)) { setError('EMINA: valor entre 0 y 15.'); return }
    if (f.fecha < lesion.fecha_inicio) { setError('La valoración no puede ser anterior al inicio de la lesión (' + fechaLarga(lesion.fecha_inicio) + ').'); return }
    setGuardando(true)
    const datos = {
      fecha: f.fecha,
      medidas: f.medidas.trim() || null,
      grado: f.grado || null,
      frotis: f.frotis,
      tipo_cura: pauta.tipo_cura.trim() || null,
      frecuencia_horas: frec,
      dias_semana: pauta.dias_semana,
      norton, braden, emina,
      notas: f.notas.trim() || null,
    }
    const { error: err } = editando
      ? await supabase.from('curas_valoraciones').update(datos).eq('id', editando.id)
      : await supabase.from('curas_valoraciones').insert({ ...datos, lesion_id: lesion.id, registrado_por_id: profesional.id })
    setGuardando(false)
    if (err) { setError('No se pudo guardar: ' + err.message); return }
    onGuardado()
  }

  const mostrarGrado = lesion.caracteristicas !== 'cuidado_piel'
  return (
    <Modal titulo={`${editando ? 'Editar valoración' : 'Nueva valoración'} · ${lesion.localizacion}`} onClose={onClose}>
      <div className="space-y-3">
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="label">Fecha de valoración</label>
            <input className="input" type="date" max={hoyLocal()} value={f.fecha} onChange={(e) => setF({ ...f, fecha: e.target.value })} />
          </div>
          <div>
            <label className="label">Medidas (cm × cm)</label>
            <input className="input" maxLength={40} placeholder="Ej.: 2 x 3" value={f.medidas} onChange={(e) => setF({ ...f, medidas: e.target.value })} />
          </div>
          {mostrarGrado && (
            <div>
              <label className="label">Grado</label>
              <select className="input" value={f.grado} onChange={(e) => setF({ ...f, grado: e.target.value })}>
                <option value="">—</option>
                {Object.entries(GRADO_LABEL).map(([k, l]) => <option key={k} value={k}>{l}</option>)}
              </select>
            </div>
          )}
          <label className="flex items-center gap-2 text-sm text-slate-700 mt-6">
            <input type="checkbox" checked={f.frotis} onChange={(e) => setF({ ...f, frotis: e.target.checked })} />
            Frotis
          </label>
        </div>
        <div className="border-t pt-3">
          <p className="section-title">Cura</p>
          <CamposPauta valor={pauta} onChange={setPauta} />
        </div>
        <div className="border-t pt-3">
          <p className="section-title">Escalas de riesgo (opcional)</p>
          <div className="grid grid-cols-3 gap-3">
            {([['norton', 'Norton (5-20)'], ['braden', 'Braden (6-23)'], ['emina', 'EMINA (0-15)']] as const).map(([k, l]) => (
              <div key={k}>
                <label className="label">{l}</label>
                <input className="input" type="number" value={f[k]} onChange={(e) => setF({ ...f, [k]: e.target.value })} />
              </div>
            ))}
          </div>
        </div>
        <div>
          <label className="label">Notas</label>
          <textarea className="textarea" rows={2} maxLength={2000} value={f.notas} onChange={(e) => setF({ ...f, notas: e.target.value })} />
        </div>
        {error && <p className="text-sm text-red-600 bg-red-50 border border-red-100 rounded-lg px-3 py-2">{error}</p>}
        <div className="flex gap-3 pt-1">
          <button onClick={onClose} className="btn-secondary flex-1">Cancelar</button>
          <button onClick={guardar} disabled={guardando} className="btn-primary flex-1 justify-center">
            {guardando ? 'Guardando…' : 'Guardar'}
          </button>
        </div>
      </div>
    </Modal>
  )
}

// ── Tarjeta de una lesión ────────────────────────────────────
function TarjetaLesion({
  lesion, puedeEditar, puedeBorrar, puedeBorrarValoracion,
  onNuevaValoracion, onEditarLesion, onEditarValoracion, onCambioEstado, onEliminarLesion, onEliminarValoracion,
}: {
  lesion: Lesion
  puedeEditar: boolean
  puedeBorrar: boolean
  puedeBorrarValoracion: (v: Valoracion) => boolean
  onNuevaValoracion: () => void
  onEditarLesion: () => void
  onEditarValoracion: (v: Valoracion) => void
  onCambioEstado: () => void
  onEliminarLesion: () => void
  onEliminarValoracion: (v: Valoracion) => void
}) {
  const [abierta, setAbierta] = useState(false)
  const vals = ordenarValoraciones(lesion.valoraciones)
  const vigente = pautaVigente(lesion.valoraciones)
  const ultima = vals[0]
  const curada = !!lesion.fecha_fin
  return (
    <div className={`card p-4 ${curada ? 'opacity-80' : ''}`}>
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-2 flex-wrap">
            <p className="font-semibold text-slate-800">{lesion.localizacion}</p>
            <span className="text-xs px-2 py-0.5 rounded-full bg-slate-100 text-slate-600">{CARACTERISTICA_LABEL[lesion.caracteristicas]}</span>
            {curada && <span className="text-xs px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-700">Curada el {fechaLarga(lesion.fecha_fin!)}</span>}
          </div>
          <p className="text-xs text-slate-500 mt-0.5">
            Desde {fechaLarga(lesion.fecha_inicio)}
            {lesion.origen && ` · ${lesion.origen === 'centro' ? 'producida en el centro' : 'producida fuera del centro'}`}
            {lesion.registrado_por && ` · ${lesion.registrado_por.nombre} ${lesion.registrado_por.apellidos}`}
          </p>
        </div>
        {puedeEditar && (
          <div className="flex items-center gap-1 shrink-0">
            {!curada && <button onClick={onNuevaValoracion} className="btn-secondary !px-3 !py-1.5 text-xs"><Plus className="w-3.5 h-3.5" />Valoración</button>}
            <button onClick={onEditarLesion} title="Editar" className="p-1.5 text-slate-500 hover:text-slate-600"><Pencil className="w-4 h-4" /></button>
            {puedeBorrar && <button onClick={onEliminarLesion} title="Eliminar" className="p-1.5 text-slate-500 hover:text-red-600"><Trash2 className="w-4 h-4" /></button>}
          </div>
        )}
      </div>

      {!curada && (
        <div className="mt-3 rounded-lg bg-primary-50/60 border border-primary-100 px-3 py-2">
          <p className="text-xs font-semibold uppercase tracking-wide text-primary-700">Pauta actual</p>
          <p className="text-sm text-slate-800">{textoPauta(vigente)}</p>
        </div>
      )}
      {ultima && (
        <p className="text-xs text-slate-500 mt-2">
          Última valoración {fechaLarga(ultima.fecha)}
          {ultima.medidas && ` · ${ultima.medidas} cm`}
          {ultima.grado && ` · ${GRADO_LABEL[ultima.grado]}`}
          {ultima.frotis && ' · frotis'}
          {ultima.norton != null && ` · Norton ${ultima.norton}`}
          {ultima.braden != null && ` · Braden ${ultima.braden}`}
          {ultima.emina != null && ` · EMINA ${ultima.emina}`}
        </p>
      )}
      {lesion.notas && <p className="text-xs text-slate-600 mt-1 whitespace-pre-wrap">{lesion.notas}</p>}

      <div className="mt-3 flex items-center gap-3">
        <button onClick={() => setAbierta(!abierta)} className="flex items-center gap-1 text-xs font-medium text-slate-500 hover:text-slate-700">
          {abierta ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronRight className="w-3.5 h-3.5" />}
          Evolución ({vals.length})
        </button>
        {puedeEditar && (
          <button onClick={onCambioEstado} className="text-xs font-medium text-slate-500 hover:text-slate-700 underline">
            {curada ? 'Reabrir' : 'Dar por curada'}
          </button>
        )}
      </div>

      {abierta && (
        vals.length === 0 ? (
          <p className="text-xs text-slate-500 mt-2">Todavía no hay valoraciones.</p>
        ) : (
          <div className="mt-2 overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="text-left text-slate-500 border-b">
                  {['Fecha', 'Medidas', 'Grado', 'Cura', 'Frec.', 'Norton', 'Braden', 'EMINA', 'Notas', ''].map((h) => (
                    <th key={h} className="py-1 pr-3 font-semibold">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {vals.map((v) => (
                  <tr key={v.id} className="border-b last:border-0 align-top">
                    <td className="py-1.5 pr-3 whitespace-nowrap">{fechaLarga(v.fecha)}</td>
                    <td className="py-1.5 pr-3">{v.medidas ?? '—'}{v.frotis && ' · frotis'}</td>
                    <td className="py-1.5 pr-3">{v.grado ? GRADO_LABEL[v.grado] : '—'}</td>
                    <td className="py-1.5 pr-3">{v.tipo_cura ?? '—'}</td>
                    <td className="py-1.5 pr-3 whitespace-nowrap">
                      {v.frecuencia_horas ? `${v.frecuencia_horas} h` : ''}
                      {v.dias_semana?.length ? ` ${[...v.dias_semana].sort().map((d) => DIAS_CORTO[d - 1]).join('')}` : ''}
                      {!v.frecuencia_horas && !v.dias_semana?.length && '—'}
                    </td>
                    <td className="py-1.5 pr-3">{v.norton ?? '—'}</td>
                    <td className="py-1.5 pr-3">{v.braden ?? '—'}</td>
                    <td className="py-1.5 pr-3">{v.emina ?? '—'}</td>
                    <td className="py-1.5 pr-3 max-w-[14rem]">{v.notas ?? ''}</td>
                    <td className="py-1.5 whitespace-nowrap">
                      {puedeEditar && <button onClick={() => onEditarValoracion(v)} title="Editar" className="p-1 text-slate-500 hover:text-slate-600"><Pencil className="w-3.5 h-3.5" /></button>}
                      {puedeBorrarValoracion(v) && <button onClick={() => onEliminarValoracion(v)} title="Eliminar" className="p-1 text-slate-500 hover:text-red-600"><Trash2 className="w-3.5 h-3.5" /></button>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )
      )}
    </div>
  )
}

// ── Pestaña Curas de la ficha ────────────────────────────────
export function TabCuras({ ingresoId, episodioActivo }: { ingresoId: string; episodioActivo: boolean }) {
  const { profesional, esAdmin } = useAuth()
  const [lesiones, setLesiones] = useState<Lesion[]>([])
  const [marcaHoy, setMarcaHoy] = useState<{ id: string; realizada_por_id: string | null } | null>(null)
  const [loading, setLoading] = useState(true)
  const [errorCarga, setErrorCarga] = useState('')
  const [errorAccion, setErrorAccion] = useState('')
  const [formLesion, setFormLesion] = useState<{ editando: Lesion | null } | null>(null)
  const [formValoracion, setFormValoracion] = useState<{ lesion: Lesion; editando: Valoracion | null } | null>(null)
  const hoy = hoyLocal()

  async function cargar() {
    setErrorCarga('')
    const [resL, resR] = await Promise.all([
      supabase.from('curas_lesiones').select(SELECT_LESIONES).eq('ingreso_id', ingresoId)
        .order('fecha_inicio', { ascending: false }).order('created_at', { ascending: false }),
      supabase.from('curas_registro').select('id, realizada_por_id').eq('ingreso_id', ingresoId).eq('fecha', hoy).maybeSingle(),
    ])
    if (resL.error) { setErrorCarga('No se pudieron cargar las curas: ' + resL.error.message); setLoading(false); return }
    setLesiones((resL.data ?? []) as unknown as Lesion[])
    setMarcaHoy(resR.error ? null : (resR.data ?? null))
    setLoading(false)
  }
  useEffect(() => { cargar() }, [ingresoId]) // eslint-disable-line react-hooks/exhaustive-deps

  const activas = useMemo(() => lesiones.filter((l) => !l.fecha_fin), [lesiones])
  const curadas = useMemo(() => lesiones.filter((l) => !!l.fecha_fin), [lesiones])
  const puedeEditar = episodioActivo && !!profesional
  const esMio = (autor: string | null) => !!profesional && autor === profesional.id

  async function alternarMarcaHoy() {
    if (!profesional) return
    setErrorAccion('')
    const { error } = marcaHoy
      ? await supabase.from('curas_registro').delete().eq('id', marcaHoy.id)
      : await supabase.from('curas_registro').insert({ ingreso_id: ingresoId, fecha: hoy, realizada_por_id: profesional.id })
    if (error) setErrorAccion('No se pudo actualizar la marca de hoy: ' + error.message)
    await cargar()
  }

  async function cambiarEstado(l: Lesion) {
    setErrorAccion('')
    const { error } = await supabase.from('curas_lesiones').update({ fecha_fin: l.fecha_fin ? null : hoy }).eq('id', l.id)
    if (error) setErrorAccion('No se pudo cambiar el estado: ' + error.message)
    await cargar()
  }

  async function eliminarLesion(l: Lesion) {
    if (!confirm(`¿Eliminar «${l.localizacion}» y todas sus valoraciones? No se puede deshacer.`)) return
    setErrorAccion('')
    const { error, count } = await supabase.from('curas_lesiones').delete({ count: 'exact' }).eq('id', l.id)
    if (error) setErrorAccion('No se pudo eliminar: ' + error.message)
    else if (!count) setErrorAccion('No se eliminó: solo puede hacerlo quien la registró o un administrador.')
    await cargar()
  }

  async function eliminarValoracion(v: Valoracion) {
    if (!confirm('¿Eliminar esta valoración?')) return
    setErrorAccion('')
    const { error, count } = await supabase.from('curas_valoraciones').delete({ count: 'exact' }).eq('id', v.id)
    if (error) setErrorAccion('No se pudo eliminar: ' + error.message)
    else if (!count) setErrorAccion('No se eliminó: solo puede hacerlo quien la registró o un administrador.')
    await cargar()
  }

  if (loading) return <p className="text-slate-500 text-sm">Cargando curas…</p>
  if (errorCarga) {
    return (
      <div className="card p-6 max-w-md">
        <p className="font-semibold text-red-600">No se pudo cargar</p>
        <p className="text-sm text-slate-500 mt-1 mb-3">{errorCarga}</p>
        <button onClick={cargar} className="btn-secondary text-sm">Reintentar</button>
      </div>
    )
  }

  return (
    <div className="max-w-4xl space-y-5">
      {!episodioActivo && (
        <div className="flex items-center gap-2 text-sm text-slate-600 bg-slate-100 border border-slate-200 rounded-lg px-3 py-2">
          <Lock className="w-4 h-4 shrink-0" />
          Episodio cerrado: las curas quedan solo en lectura.
        </div>
      )}

      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div>
          <h2 className="text-sm font-semibold text-slate-700">Curas y cuidados de la piel</h2>
          <p className="text-xs text-slate-500">{activas.length} activa{activas.length === 1 ? '' : 's'}{curadas.length > 0 && ` · ${curadas.length} curada${curadas.length === 1 ? '' : 's'}`}</p>
        </div>
        {puedeEditar && (
          <div className="flex items-center gap-2">
            {activas.length > 0 && (
              <button
                onClick={alternarMarcaHoy}
                className={`flex items-center gap-1.5 px-3 py-2 rounded-lg border text-sm font-medium ${
                  marcaHoy ? 'bg-emerald-50 border-emerald-200 text-emerald-700' : 'bg-white border-slate-300 text-slate-600 hover:bg-slate-50'
                }`}
              >
                {marcaHoy ? <CheckCircle2 className="w-4 h-4" /> : <Circle className="w-4 h-4" />}
                {marcaHoy ? 'Cura de hoy hecha' : 'Marcar cura de hoy'}
              </button>
            )}
            <button onClick={() => setFormLesion({ editando: null })} className="btn-primary"><Plus className="w-4 h-4" />Añadir lesión o cuidado</button>
          </div>
        )}
      </div>

      {errorAccion && <p className="text-sm text-red-600 bg-red-50 border border-red-100 rounded-lg px-3 py-2">{errorAccion}</p>}

      {lesiones.length === 0 ? (
        <div className="card p-8 text-center text-sm text-slate-500">Este ingreso no tiene lesiones ni cuidados de piel registrados.</div>
      ) : (
        <>
          <div className="space-y-3">
            {activas.map((l) => (
              <TarjetaLesion
                key={l.id}
                lesion={l}
                puedeEditar={puedeEditar}
                puedeBorrar={puedeEditar && (esAdmin || esMio(l.registrado_por_id))}
                puedeBorrarValoracion={(v) => puedeEditar && (esAdmin || esMio(v.registrado_por_id))}
                onNuevaValoracion={() => setFormValoracion({ lesion: l, editando: null })}
                onEditarLesion={() => setFormLesion({ editando: l })}
                onEditarValoracion={(v) => setFormValoracion({ lesion: l, editando: v })}
                onCambioEstado={() => cambiarEstado(l)}
                onEliminarLesion={() => eliminarLesion(l)}
                onEliminarValoracion={eliminarValoracion}
              />
            ))}
          </div>
          {curadas.length > 0 && (
            <div>
              <p className="section-title">Curadas</p>
              <div className="space-y-3">
                {curadas.map((l) => (
                  <TarjetaLesion
                    key={l.id}
                    lesion={l}
                    puedeEditar={puedeEditar}
                    puedeBorrar={puedeEditar && (esAdmin || esMio(l.registrado_por_id))}
                    puedeBorrarValoracion={(v) => puedeEditar && (esAdmin || esMio(v.registrado_por_id))}
                    onNuevaValoracion={() => setFormValoracion({ lesion: l, editando: null })}
                    onEditarLesion={() => setFormLesion({ editando: l })}
                    onEditarValoracion={(v) => setFormValoracion({ lesion: l, editando: v })}
                    onCambioEstado={() => cambiarEstado(l)}
                    onEliminarLesion={() => eliminarLesion(l)}
                    onEliminarValoracion={eliminarValoracion}
                  />
                ))}
              </div>
            </div>
          )}
        </>
      )}

      {formLesion && (
        <FormularioLesion
          ingresoId={ingresoId}
          editando={formLesion.editando}
          onClose={() => setFormLesion(null)}
          onGuardado={async () => { setFormLesion(null); await cargar() }}
        />
      )}
      {formValoracion && (
        <FormularioValoracion
          lesion={formValoracion.lesion}
          editando={formValoracion.editando}
          onClose={() => setFormValoracion(null)}
          onGuardado={async () => { setFormValoracion(null); await cargar() }}
        />
      )}
    </div>
  )
}
