import { useEffect, useMemo, useRef, useState } from 'react'
import { Segmentado } from '../../components/Segmentado'
import { useAvisoSalida } from '../../lib/avisoSalida'
import { Cargando } from '../../components/Cargando'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../lib/AuthContext'
import { useConfirmar } from '../../components/useConfirmar'
import { hoyLocal } from '../../lib/fechas'
import { Plus, Pencil, Trash2, CheckCircle2, Circle, ChevronDown, ChevronRight, XCircle, Lock } from 'lucide-react'
import { Modal } from '../curas/Modal'
import { MarcaCuraModal } from '../curas/MarcaCuraModal'
import { AvisoFicha } from '../../components/AvisoFicha'
import { TituloSeccion } from '../../components/TituloSeccion'
import {
  CARACTERISTICA_LABEL, GRADO_LABEL, LOCALIZACIONES_SUGERIDAS, CURAS_SUGERIDAS, DIAS_CORTO,
  ordenarValoraciones, pautaVigente, textoPauta, fechaLarga, esValoracionClinica, partesValoracion, textoCalendario, sumarDias, fechasQueTocaLesion, DIAS_HISTORIAL_CURAS,
  type Lesion, type Valoracion, type Caracteristica, type RegistroCura,
} from '../curas/tipos'

const SELECT_LESIONES =
  '*, valoraciones:curas_valoraciones(*), registrado_por:profesionales!registrado_por_id(nombre, apellidos)'

// ── Marco de ventana ─────────────────────────────────────────
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
      {/* El calendario de la tabla semanal sale solo de la frecuencia o de los días: se avisa si no hay ninguno o si chocan. */}
      {valor.dias_semana.length > 0 && valor.frecuencia_horas.trim() !== '' && (
        <AvisoFicha tono="atencion" data-testid="aviso-pauta">
          Has indicado frecuencia y días de la semana: la tabla semanal solo usa los días. Quita uno de los dos.
        </AvisoFicha>
      )}
      {valor.tipo_cura.trim() !== '' && valor.dias_semana.length === 0 && valor.frecuencia_horas.trim() === '' && (
        <AvisoFicha tono="atencion" data-testid="aviso-pauta">
          Sin frecuencia ni días: esta cura no aparecerá como pendiente en la tabla semanal ni en los pendientes de Inicio.
        </AvisoFicha>
      )}
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
function CuerpoLesion({
  ingresoId, editando, onClose, onGuardado, pacienteInfo,
}: { ingresoId: string; editando: Lesion | null; onClose: () => void; onGuardado: () => void; pacienteInfo?: string }) {
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
  // Al editar: se guarda solo si nadie ha tocado la lesión desde que se abrió (marca `updated_at` del servidor).
  const [baseActualizada, setBaseActualizada] = useState<string | null>(editando?.updated_at ?? null)
  const [conflicto, setConflicto] = useState(false)
  // Aviso al recargar o cerrar la pestaña con cambios sin guardar en el formulario.
  const firmaInicialRef = useRef(JSON.stringify([f, pauta]))
  useAvisoSalida(JSON.stringify([f, pauta]) !== firmaInicialRef.current)

  async function recargarTrasConflicto() {
    if (!editando) return
    const { data: l } = await supabase.from('curas_lesiones').select('*').eq('id', editando.id).maybeSingle()
    if (!l) { setError('No se pudo cargar la versión actual de la lesión.'); return }
    setF({ caracteristicas: l.caracteristicas, localizacion: l.localizacion, fecha_inicio: l.fecha_inicio, origen: l.origen ?? '', notas: l.notas ?? '' })
    setBaseActualizada(l.updated_at ?? null)
    firmaInicialRef.current = JSON.stringify([{ caracteristicas: l.caracteristicas, localizacion: l.localizacion, fecha_inicio: l.fecha_inicio, origen: l.origen ?? '', notas: l.notas ?? '' }, pauta])
    setConflicto(false)
    setError('')
  }

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
      const q = supabase.from('curas_lesiones').update(datos).eq('id', editando.id)
      const { data: filas, error: err } = await (baseActualizada ? q.eq('updated_at', baseActualizada) : q).select('id')
      setGuardando(false)
      if (err) { setError('No se pudo guardar: ' + err.message); return }
      if ((filas ?? []).length === 0) { setConflicto(true); return }   // la han modificado mientras tanto (o no hay permiso)
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
    <>
      <div className="space-y-3">
        {pacienteInfo && <p className="text-sm font-medium text-slate-700">{pacienteInfo}</p>}
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
        {conflicto && (
          <div className="aviso aviso-atencion flex items-center justify-between gap-3">
            <span>No se ha guardado: alguien más ha modificado esta lesión mientras la editabas (o no tienes permiso para cambiarla). Lo que has escrito sigue aquí.</span>
            <button type="button" onClick={recargarTrasConflicto} className="btn-secondary btn-sm shrink-0">Ver la versión actual</button>
          </div>
        )}
        {error && <p className="aviso aviso-error">{error}</p>}
        <div className="flex gap-3 pt-1">
          <button onClick={onClose} className="btn-secondary flex-1">Cancelar</button>
          <button onClick={guardar} disabled={guardando || conflicto} className="btn-primary flex-1 justify-center">
            {guardando ? 'Guardando…' : 'Guardar'}
          </button>
        </div>
      </div>
    </>
  )
}

// Añadir una lesión nueva (para corregir una existente se usa «Editar», con sus pestañas).
export function FormularioLesion(props: { ingresoId: string; editando: Lesion | null; onClose: () => void; onGuardado: () => void; pacienteInfo?: string }) {
  return (
    <Modal titulo={props.editando ? 'Corregir datos de la lesión' : 'Añadir lesión o cuidado'} onClose={props.onClose}>
      <CuerpoLesion {...props} />
    </Modal>
  )
}

// ── Valoración y pauta de cura ───────────────────────────────
// Dos usos, cada uno en su pestaña de «Editar»:
//  · 'valoracion': anotar cómo está la lesión (medidas, grado, frotis, escalas). No toca la pauta de cura.
//  · 'pauta': cambiar la cura (tipo, frecuencia, días). No toca los datos de la valoración.
// Al corregir un registro del historial (editando) salen las dos partes, porque el registro puede tener ambas.
function CuerpoValoracion({
  lesion, editando, modo, onClose, onGuardado,
}: { lesion: Lesion; editando: Valoracion | null; modo: 'valoracion' | 'pauta'; onClose: () => void; onGuardado: () => void }) {
  const { profesional } = useAuth()
  const vigente = pautaVigente(lesion.valoraciones)
  const mostrarValoracion = !!editando || modo === 'valoracion'
  const mostrarPauta = !!editando || modo === 'pauta'
  // Al cambiar la pauta se parte de la vigente: lo normal es tocar solo la frecuencia o el apósito.
  const base = editando ?? (modo === 'pauta' ? vigente : null)
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
  const firmaInicialRef = useRef(JSON.stringify([f, pauta]))
  useAvisoSalida(JSON.stringify([f, pauta]) !== firmaInicialRef.current)

  async function guardar() {
    setError('')
    if (!profesional) { setError('Tu cuenta no tiene ficha de profesional.'); return }
    const frec = mostrarPauta ? aEntero(pauta.frecuencia_horas) : null
    const norton = aEntero(f.norton), braden = aEntero(f.braden), emina = aEntero(f.emina)
    if (modo === 'pauta' && !editando && !pauta.tipo_cura.trim()) { setError('Indica el tipo de cura.'); return }
    if (frec !== null && (Number.isNaN(frec) || frec < 1 || frec > 720)) { setError('La frecuencia debe ser un número entero de horas entre 1 y 720.'); return }
    if (modo === 'pauta' && !editando && vigente
      && (vigente.tipo_cura ?? '').trim() === pauta.tipo_cura.trim()
      && (vigente.frecuencia_horas ?? null) === frec
      && JSON.stringify([...(vigente.dias_semana ?? [])].sort()) === JSON.stringify([...pauta.dias_semana].sort())) {
      setError('La pauta es la misma que la actual: cambia algo o cierra la ventana.'); return
    }
    if (mostrarValoracion) {
      if (norton !== null && (Number.isNaN(norton) || norton < 5 || norton > 20)) { setError('Norton: valor entre 5 y 20.'); return }
      if (braden !== null && (Number.isNaN(braden) || braden < 6 || braden > 23)) { setError('Braden: valor entre 6 y 23.'); return }
      if (emina !== null && (Number.isNaN(emina) || emina < 0 || emina > 15)) { setError('EMINA: valor entre 0 y 15.'); return }
      const algo = f.medidas.trim() || f.grado || f.frotis || norton !== null || braden !== null || emina !== null || f.notas.trim()
      if (!editando && !algo) { setError('Anota al menos un dato de la valoración (medidas, grado, escalas, notas…).'); return }
    }
    if (f.fecha < lesion.fecha_inicio) { setError('La fecha no puede ser anterior al inicio de la lesión (' + fechaLarga(lesion.fecha_inicio) + ').'); return }
    setGuardando(true)
    const datos = {
      fecha: f.fecha,
      medidas: mostrarValoracion ? f.medidas.trim() || null : null,
      grado: mostrarValoracion ? f.grado || null : null,
      frotis: mostrarValoracion ? f.frotis : false,
      tipo_cura: mostrarPauta ? pauta.tipo_cura.trim() || null : null,
      frecuencia_horas: frec,
      dias_semana: mostrarPauta ? pauta.dias_semana : [],
      norton: mostrarValoracion ? norton : null,
      braden: mostrarValoracion ? braden : null,
      emina: mostrarValoracion ? emina : null,
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
    <div className="space-y-3">
      {modo === 'pauta' && !editando && vigente && (
        <p className="text-xs text-slate-600 bg-slate-50 border border-slate-200 rounded-lg px-3 py-2">
          Pauta actual: <b>{textoPauta(vigente)}</b>
        </p>
      )}
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="label">{modo === 'pauta' && !editando ? 'Vigente desde' : 'Fecha'}</label>
          <input className="input" type="date" max={hoyLocal()} value={f.fecha} onChange={(e) => setF({ ...f, fecha: e.target.value })} />
        </div>
        {mostrarValoracion && (
          <div>
            <label className="label">Medidas (cm × cm)</label>
            <input className="input" maxLength={40} placeholder="Ej.: 2 x 3" value={f.medidas} onChange={(e) => setF({ ...f, medidas: e.target.value })} />
          </div>
        )}
        {mostrarValoracion && mostrarGrado && (
          <div>
            <label className="label">Grado</label>
            <select className="input" value={f.grado} onChange={(e) => setF({ ...f, grado: e.target.value })}>
              <option value="">—</option>
              {Object.entries(GRADO_LABEL).map(([k, l]) => <option key={k} value={k}>{l}</option>)}
            </select>
          </div>
        )}
        {mostrarValoracion && (
          <label className="flex items-center gap-2 text-sm text-slate-700 mt-6">
            <input type="checkbox" checked={f.frotis} onChange={(e) => setF({ ...f, frotis: e.target.checked })} />
            Frotis
          </label>
        )}
      </div>
      {mostrarPauta && (
        <div className={mostrarValoracion ? 'border-t pt-3' : ''}>
          {mostrarValoracion && <p className="section-title">Cura</p>}
          <CamposPauta valor={pauta} onChange={setPauta} />
        </div>
      )}
      {mostrarValoracion && (
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
      )}
      <div>
        <label className="label">{modo === 'pauta' && !editando ? 'Motivo del cambio (opcional)' : 'Notas'}</label>
        <textarea className="textarea" rows={2} maxLength={2000} value={f.notas} onChange={(e) => setF({ ...f, notas: e.target.value })} />
      </div>
      {error && <p className="aviso aviso-error">{error}</p>}
      <div className="flex gap-3 pt-1">
        <button onClick={onClose} className="btn-secondary flex-1">Cancelar</button>
        <button onClick={guardar} disabled={guardando} className="btn-primary flex-1 justify-center">
          {guardando ? 'Guardando…' : modo === 'pauta' && !editando ? 'Guardar cura' : modo === 'valoracion' && !editando ? 'Guardar valoración' : 'Guardar'}
        </button>
      </div>
    </div>
  )
}

// Corregir un registro concreto del historial (salen valoración y pauta juntas).
export function FormularioValoracion({
  lesion, editando, onClose, onGuardado,
}: { lesion: Lesion; editando: Valoracion; onClose: () => void; onGuardado: () => void }) {
  return (
    <Modal titulo={`Corregir un registro del historial · ${lesion.localizacion}`} onClose={onClose}>
      <CuerpoValoracion lesion={lesion} editando={editando} modo="valoracion" onClose={onClose} onGuardado={onGuardado} />
    </Modal>
  )
}

// ── «Editar» una lesión: una sola ventana con pestañas ───────────
// Cada pestaña guarda lo suyo y es independiente de las demás: así no se mezcla corregir un dato
// mal escrito con anotar cómo está la lesión o cambiar la cura.
type Pestaña = 'valoracion' | 'pauta' | 'datos' | 'historial'
const PESTAÑAS: { id: Pestaña; titulo: string; ayuda: string }[] = [
  { id: 'valoracion', titulo: 'Nueva valoración', ayuda: 'Cómo está la lesión hoy: medidas, grado, frotis, escalas.' },
  { id: 'pauta', titulo: 'Editar cura', ayuda: 'Cambiar la cura que lleva: apósito, frecuencia, días.' },
  { id: 'datos', titulo: 'Editar lesión', ayuda: 'Para corregir algo mal escrito: localización, fecha de inicio, origen, notas.' },
  { id: 'historial', titulo: 'Historial', ayuda: 'Valoraciones y cambios de cura registrados.' },
]

// Lo que hace falta para llevar la lesión entera desde esta ventana (historial, dar por curada, eliminar),
// cuando se abre directamente desde la tabla de cuidados y no pasa antes por la tarjeta de la ficha.
export interface ExtrasEdicionLesion {
  error?: string
  puedeEditar: boolean
  puedeBorrar: boolean
  puedeBorrarValoracion: (v: Valoracion) => boolean
  onEditarValoracion: (v: Valoracion) => void
  onEliminarValoracion: (v: Valoracion) => void
  // Sin onCambioEstado no se enseña «Marcar como curada» aquí (en la ficha ya está en la tarjeta de la lesión).
  onCambioEstado?: () => void
  onEliminarLesion: () => void
}

// «Curada» no encaja con el cuidado preventivo de la piel: ahí se «finaliza».
const textoCerrar = (l: Lesion) => (l.caracteristicas === 'cuidado_piel' ? 'Finalizar cuidado' : 'Marcar como curada')
const textoCerrada = (l: Lesion) => (l.caracteristicas === 'cuidado_piel' ? 'Finalizado' : 'Curada')

export function ModalEditarLesion({
  lesion, paciente, pestañaInicial, extras, onClose, onGuardado,
}: { lesion: Lesion; paciente?: string; pestañaInicial?: Pestaña; extras?: ExtrasEdicionLesion; onClose: () => void; onGuardado: () => void }) {
  const curada = !!lesion.fecha_fin
  // Una lesión curada ya no se valora ni lleva cura: solo se pueden corregir sus datos (y ver el historial).
  const disponibles = PESTAÑAS.filter((p) => (p.id === 'historial' ? !!extras : curada ? p.id === 'datos' : true))
  const [pestaña, setPestaña] = useState<Pestaña>(pestañaInicial && disponibles.some((p) => p.id === pestañaInicial) ? pestañaInicial : disponibles[0].id)
  const actual = disponibles.find((p) => p.id === pestaña)!
  const vals = ordenarValoraciones(lesion.valoraciones)
  return (
    <Modal titulo={`${CARACTERISTICA_LABEL[lesion.caracteristicas]} · ${lesion.localizacion}`} onClose={onClose}>
      {paciente && <p className="text-sm font-medium text-slate-700 -mt-2 mb-3">{paciente}</p>}
      {extras?.error && <p className="aviso aviso-error mb-3">{extras.error}</p>}
      {disponibles.length > 1 && (
        <Segmentado
          className="mb-3"
          comoPestanas
          etiqueta="Secciones de la lesión"
          valor={pestaña}
          onChange={setPestaña}
          opciones={disponibles.map((p) => ({ clave: p.id, etiqueta: p.titulo }))}
        />
      )}
      <p className="text-xs text-slate-500 mb-3">{actual.ayuda}</p>
      {/* Las pestañas no visibles siguen montadas: así lo escrito en una no se pierde al mirar otra. */}
      {!curada && (
        <div className={pestaña === 'valoracion' ? '' : 'hidden'}>
          <CuerpoValoracion lesion={lesion} editando={null} modo="valoracion" onClose={onClose} onGuardado={onGuardado} />
        </div>
      )}
      {!curada && (
        <div className={pestaña === 'pauta' ? '' : 'hidden'}>
          <CuerpoValoracion lesion={lesion} editando={null} modo="pauta" onClose={onClose} onGuardado={onGuardado} />
        </div>
      )}
      <div className={pestaña === 'datos' ? '' : 'hidden'}>
        <CuerpoLesion ingresoId={lesion.ingreso_id} editando={lesion} onClose={onClose} onGuardado={onGuardado} />
        {extras?.puedeEditar && (
          <div className="mt-5 pt-4 border-t border-slate-200 flex items-center justify-between gap-3">
            {extras.onCambioEstado ? (
              <button type="button" onClick={extras.onCambioEstado} className="text-sm font-medium text-slate-600 hover:text-slate-800 underline">
                {curada ? 'Reabrir la lesión' : textoCerrar(lesion)}
              </button>
            ) : <span />}
            {extras.puedeBorrar && (
              <button type="button" onClick={extras.onEliminarLesion} className="text-sm font-medium text-red-600 hover:text-red-700 flex items-center gap-1">
                <Trash2 className="w-4 h-4" />Eliminar la lesión
              </button>
            )}
          </div>
        )}
      </div>
      {extras && pestaña === 'historial' && (
        <TablaHistorial
          vals={vals}
          puedeEditar={extras.puedeEditar}
          puedeBorrarValoracion={extras.puedeBorrarValoracion}
          onEditarValoracion={extras.onEditarValoracion}
          onEliminarValoracion={extras.onEliminarValoracion}
        />
      )}
    </Modal>
  )
}

// ── Historial de una lesión (valoraciones y cambios de cura) ────
export function TablaHistorial({
  vals, puedeEditar, puedeBorrarValoracion, onEditarValoracion, onEliminarValoracion,
}: {
  vals: Valoracion[]
  puedeEditar: boolean
  puedeBorrarValoracion: (v: Valoracion) => boolean
  onEditarValoracion: (v: Valoracion) => void
  onEliminarValoracion: (v: Valoracion) => void
}) {
  if (vals.length === 0) return <p className="text-xs text-slate-500 mt-2">Todavía no hay registros.</p>
  return (
    <div className="mt-2 overflow-x-auto">
      <table className="w-full text-xs">
        <thead>
          <tr className="text-left text-slate-500 border-b">
            {['Fecha', 'Valoración', 'Cura', 'Notas', ''].map((h) => (
              <th key={h} className="py-1 pr-3 font-semibold">{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {vals.map((v) => {
            const partes = partesValoracion(v)
            const cal = textoCalendario(v)
            return (
              <tr key={v.id} className="border-b last:border-0 align-top">
                <td className="py-1.5 pr-3 whitespace-nowrap">{fechaLarga(v.fecha)}</td>
                <td className="py-1.5 pr-3">{partes.length > 0 ? partes.join(' · ') : '—'}</td>
                <td className="py-1.5 pr-3">{v.tipo_cura ? <>{v.tipo_cura}{cal && <span className="text-slate-500"> · {cal}</span>}</> : '—'}</td>
                <td className="py-1.5 pr-3 max-w-[12rem]">{v.notas ?? ''}</td>
                <td className="py-1.5 whitespace-nowrap">
                  {puedeEditar && <button onClick={() => onEditarValoracion(v)} title="Corregir este registro" className="p-1 text-slate-500 hover:text-slate-600"><Pencil className="w-3.5 h-3.5" /></button>}
                  {puedeBorrarValoracion(v) && <button onClick={() => onEliminarValoracion(v)} title="Eliminar este registro" className="p-1 text-slate-500 hover:text-red-600"><Trash2 className="w-3.5 h-3.5" /></button>}
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}

// ── Tarjeta de una lesión ────────────────────────────────────
// Sencilla: lo que hay (pauta y última valoración) y las dos cosas que se hacen cada día, con su nombre:
// «Valorar» y «Cambiar cura». Corregir los datos de la lesión y eliminarla vive dentro de «Editar datos».
export function TarjetaLesion({
  lesion, puedeEditar, puedeBorrarValoracion, evolucionAbierta = false,
  onEditar, onEditarValoracion, onCambioEstado, onEliminarValoracion,
}: {
  lesion: Lesion
  puedeEditar: boolean
  puedeBorrarValoracion: (v: Valoracion) => boolean
  // Abre el historial desde el principio (en la ventana de la tabla de cuidados).
  evolucionAbierta?: boolean
  onEditar: (pestaña: Pestaña) => void
  onEditarValoracion: (v: Valoracion) => void
  onCambioEstado: () => void
  onEliminarValoracion: (v: Valoracion) => void
}) {
  const [abierta, setAbierta] = useState(evolucionAbierta)
  const vals = ordenarValoraciones(lesion.valoraciones)
  const vigente = pautaVigente(lesion.valoraciones)
  const ultima = vals.find(esValoracionClinica)
  const partesUltima = ultima ? partesValoracion(ultima) : []
  const curada = !!lesion.fecha_fin
  const mostrarHistorial = vals.length > 1 || !!ultima
  return (
    <div className={`card p-4 ${curada ? 'opacity-80' : ''}`}>
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-2 flex-wrap">
            <p className="font-semibold text-slate-800 text-base">{CARACTERISTICA_LABEL[lesion.caracteristicas]} · {lesion.localizacion}</p>
            {curada && <span className="text-xs px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-700">{textoCerrada(lesion)} el {fechaLarga(lesion.fecha_fin!)}</span>}
          </div>
          <p className="text-xs text-slate-500 mt-0.5">
            Desde {fechaLarga(lesion.fecha_inicio)}
            {lesion.origen && ` · ${lesion.origen === 'centro' ? 'Producida en el centro' : 'Producida fuera del centro'}`}
            {lesion.registrado_por && ` · ${lesion.registrado_por.nombre} ${lesion.registrado_por.apellidos}`}
          </p>
        </div>
        {puedeEditar && !curada && (
          <div className="flex items-center gap-2 shrink-0">
            <button onClick={() => onEditar('valoracion')} title="Anotar cómo está la lesión hoy: medidas, grado, frotis, escalas" className="btn-secondary btn-sm"><Plus className="w-3.5 h-3.5" />Valorar</button>
            <button onClick={() => onEditar('pauta')} title="Cambiar la cura que lleva: apósito, frecuencia, días" className="btn-secondary btn-sm"><Pencil className="w-3.5 h-3.5" />Cambiar cura</button>
          </div>
        )}
      </div>

      {!curada && (
        <div className="mt-3 rounded-lg bg-primary-50/60 border border-primary-100 px-3 py-2" data-testid="bloque-pauta">
          <p className="text-xs font-semibold text-primary-700">Pauta de cura</p>
          {vigente ? (
            <p className="text-sm text-slate-800">
              <span className="font-medium">{vigente.tipo_cura}</span>
              {textoCalendario(vigente) && <span className="text-slate-600"> · {textoCalendario(vigente)}</span>}
            </p>
          ) : (
            <p className="text-sm text-slate-500">Sin pauta de cura</p>
          )}
        </div>
      )}
      <p className="text-xs text-slate-500 mt-2" data-testid="bloque-valoracion">
        {ultima
          ? <>Última valoración {fechaLarga(ultima.fecha)}{partesUltima.length > 0 && ` · ${partesUltima.join(' · ')}`}</>
          : 'Todavía no hay valoraciones.'}
      </p>
      {lesion.notas && <p className="text-xs text-slate-600 mt-1 whitespace-pre-wrap">{lesion.notas}</p>}

      <div className="mt-3 flex items-center gap-4">
        {/* Con un solo registro (la pauta inicial) y ninguna valoración, el historial no tiene nada que enseñar. */}
        {mostrarHistorial && (
          <button onClick={() => setAbierta(!abierta)} className="flex items-center gap-1 text-xs font-medium text-slate-500 hover:text-slate-700">
            {abierta ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronRight className="w-3.5 h-3.5" />}
            Historial ({vals.length})
          </button>
        )}
        {puedeEditar && (
          <button onClick={() => onEditar('datos')} title="Corregir localización, fecha de inicio, origen o notas; también eliminar la lesión" className="text-xs font-medium text-slate-500 hover:text-slate-700 underline">
            Editar datos
          </button>
        )}
        {puedeEditar && (
          <button onClick={onCambioEstado} className="ml-auto text-xs font-medium text-emerald-700 hover:text-emerald-800 underline">
            {curada ? 'Reabrir' : textoCerrar(lesion)}
          </button>
        )}
      </div>

      {mostrarHistorial && abierta && (
        <TablaHistorial
          vals={vals}
          puedeEditar={puedeEditar}
          puedeBorrarValoracion={puedeBorrarValoracion}
          onEditarValoracion={onEditarValoracion}
          onEliminarValoracion={onEliminarValoracion}
        />
      )}
    </div>
  )
}

// ── Pestaña Curas de la ficha ────────────────────────────────
export function TabCuras({ ingresoId, episodioActivo }: { ingresoId: string; episodioActivo: boolean }) {
  const { profesional, esAdmin } = useAuth()
  const { confirmar, dialogo } = useConfirmar()
  const [lesiones, setLesiones] = useState<Lesion[]>([])
  const [marcaHoy, setMarcaHoy] = useState<RegistroCura | null>(null)
  // fechas con la cura hecha (últimos días): hacen falta para saber si hoy toca
  const [hechas, setHechas] = useState<Set<string>>(new Set())
  const [modalMarca, setModalMarca] = useState(false)
  const [loading, setLoading] = useState(true)
  const [errorCarga, setErrorCarga] = useState('')
  const [errorAccion, setErrorAccion] = useState('')
  const [formLesion, setFormLesion] = useState<{ editando: Lesion | null; pestaña?: Pestaña } | null>(null)
  // «Curadas» empieza plegado: son historia, no trabajo del día.
  const [verCuradas, setVerCuradas] = useState(false)
  const [formValoracion, setFormValoracion] = useState<{ lesion: Lesion; editando: Valoracion } | null>(null)
  const hoy = hoyLocal()

  async function cargar() {
    setErrorCarga('')
    const [resL, resR] = await Promise.all([
      supabase.from('curas_lesiones').select(SELECT_LESIONES).eq('ingreso_id', ingresoId)
        .order('fecha_inicio', { ascending: false }).order('created_at', { ascending: false }),
      supabase.from('curas_registro')
        .select('id, ingreso_id, fecha, estado, motivo, realizada_por_id, realizada_por:profesionales!realizada_por_id(nombre, apellidos)')
        .eq('ingreso_id', ingresoId)
        .gte('fecha', sumarDias(hoy, -DIAS_HISTORIAL_CURAS))
        .lte('fecha', hoy),
    ])
    if (resL.error) { setErrorCarga('No se pudieron cargar las curas: ' + resL.error.message); setLoading(false); return }
    setLesiones((resL.data ?? []) as unknown as Lesion[])
    const regs = resR.error ? [] : ((resR.data ?? []) as unknown as RegistroCura[])
    setMarcaHoy(regs.find((r) => r.fecha === hoy) ?? null)
    setHechas(new Set(regs.filter((r) => r.estado === 'hecha').map((r) => r.fecha)))
    setLoading(false)
  }
  useEffect(() => { cargar() }, [ingresoId]) // eslint-disable-line react-hooks/exhaustive-deps

  const activas = useMemo(() => lesiones.filter((l) => !l.fecha_fin), [lesiones])
  const curadas = useMemo(() => lesiones.filter((l) => !!l.fecha_fin), [lesiones])
  const puedeEditar = episodioActivo && !!profesional
  const esMio = (autor: string | null) => !!profesional && autor === profesional.id

  // ¿Toca cura hoy según la pauta de alguna lesión activa?
  const tocaHoy = useMemo(
    () => activas.some((l) => fechasQueTocaLesion(l.valoraciones, hoy, hoy, hechas, hoy).has(hoy)),
    [activas, hechas, hoy]
  )


  async function cambiarEstado(l: Lesion) {
    setErrorAccion('')
    const { error } = await supabase.from('curas_lesiones').update({ fecha_fin: l.fecha_fin ? null : hoy }).eq('id', l.id)
    if (error) setErrorAccion('No se pudo cambiar el estado: ' + error.message)
    await cargar()
  }

  // Devuelve false si se canceló la confirmación (para no cerrar la ventana desde la que se pidió).
  async function eliminarLesion(l: Lesion): Promise<boolean> {
    if (!(await confirmar({ titulo: `¿Eliminar «${l.localizacion}»?`, mensaje: 'Se eliminará con todas sus valoraciones. No se puede deshacer.', textoConfirmar: 'Eliminar', peligro: true }))) return false
    setErrorAccion('')
    const { error, count } = await supabase.from('curas_lesiones').delete({ count: 'exact' }).eq('id', l.id)
    if (error) setErrorAccion('No se pudo eliminar: ' + error.message)
    else if (!count) setErrorAccion('No se eliminó: solo puede hacerlo quien la registró o un administrador.')
    await cargar()
    return true
  }

  async function eliminarValoracion(v: Valoracion) {
    if (!(await confirmar({ titulo: '¿Eliminar esta valoración?', mensaje: 'No se puede deshacer.', textoConfirmar: 'Eliminar', peligro: true }))) return
    setErrorAccion('')
    const { error, count } = await supabase.from('curas_valoraciones').delete({ count: 'exact' }).eq('id', v.id)
    if (error) setErrorAccion('No se pudo eliminar: ' + error.message)
    else if (!count) setErrorAccion('No se eliminó: solo puede hacerlo quien la registró o un administrador.')
    await cargar()
  }

  if (loading) return <Cargando texto="Cargando curas…" />
  if (errorCarga) {
    return (
      <div className="card p-6 max-w-md">
        <p className="font-semibold text-red-600">No se pudo cargar</p>
        <p className="text-sm text-slate-500 mt-1 mb-3">{errorCarga}</p>
        <button onClick={cargar} className="btn-secondary">Reintentar</button>
      </div>
    )
  }

  return (
    <div className="ancho-formulario space-y-5">
      {dialogo}
      {!episodioActivo && (
        <AvisoFicha icono={Lock}>
          Episodio cerrado: las curas quedan solo en lectura.
        </AvisoFicha>
      )}

      <div className="flex items-center justify-between gap-3 flex-wrap">
        <TituloSeccion titulo="Curas y piel" subtitulo={<>Lesiones y cuidados de la piel. ·{activas.length} activa{activas.length === 1 ? '' : 's'}{curadas.length > 0 && ` · ${curadas.length} curada${curadas.length === 1 ? '' : 's'}`}</>} />
        {puedeEditar && (
          <div className="flex items-center gap-2">
            {activas.length > 0 && (
              <button
                onClick={() => setModalMarca(true)}
                disabled={!marcaHoy && !tocaHoy}
                title={!marcaHoy && !tocaHoy ? 'Hoy no toca cura según la pauta' : undefined}
                className={`flex items-center gap-1.5 px-3 py-2 rounded-lg border text-sm font-medium ${
                  marcaHoy
                    ? marcaHoy.estado === 'hecha'
                      ? 'bg-emerald-50 border-emerald-200 text-emerald-700'
                      : 'bg-rose-50 border-rose-200 text-rose-700'
                    : tocaHoy
                      ? 'bg-amber-100 border-amber-300 text-amber-800 hover:bg-amber-200'
                      : 'bg-slate-100 border-slate-200 text-slate-500'
                }`}
              >
                {marcaHoy
                  ? marcaHoy.estado === 'hecha' ? <CheckCircle2 className="w-4 h-4" /> : <XCircle className="w-4 h-4" />
                  : <Circle className="w-4 h-4" />}
                {marcaHoy
                  ? marcaHoy.estado === 'hecha' ? 'Curas de hoy: realizadas' : 'Curas de hoy: no realizadas'
                  : tocaHoy ? 'Registrar curas de hoy' : 'Hoy no toca cura'}
              </button>
            )}
            <button onClick={() => setFormLesion({ editando: null })} className="btn-primary"><Plus className="w-4 h-4" />Añadir lesión o cuidado</button>
          </div>
        )}
      </div>

      {errorAccion && <p className="aviso aviso-error">{errorAccion}</p>}

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
                puedeBorrarValoracion={(v) => puedeEditar && (esAdmin || esMio(v.registrado_por_id))}
                onEditar={(pestaña) => setFormLesion({ editando: l, pestaña })}
                onEditarValoracion={(v) => setFormValoracion({ lesion: l, editando: v })}
                onCambioEstado={() => cambiarEstado(l)}
                onEliminarValoracion={eliminarValoracion}
              />
            ))}
          </div>
          {curadas.length > 0 && (
            <div>
              <p className="section-title">
                <button type="button" onClick={() => setVerCuradas((v) => !v)} aria-expanded={verCuradas} className="flex items-center gap-1 hover:text-slate-800">
                  {verCuradas ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
                  Curadas y finalizadas ({curadas.length})
                </button>
              </p>
              {verCuradas && (
                <div className="space-y-3">
                  {curadas.map((l) => (
                    <TarjetaLesion
                      key={l.id}
                      lesion={l}
                      puedeEditar={puedeEditar}
                      puedeBorrarValoracion={(v) => puedeEditar && (esAdmin || esMio(v.registrado_por_id))}
                      onEditar={(pestaña) => setFormLesion({ editando: l, pestaña })}
                      onEditarValoracion={(v) => setFormValoracion({ lesion: l, editando: v })}
                      onCambioEstado={() => cambiarEstado(l)}
                      onEliminarValoracion={eliminarValoracion}
                    />
                  ))}
                </div>
              )}
            </div>
          )}
        </>
      )}

      {modalMarca && (
        <MarcaCuraModal
          titulo="Cura de hoy"
          ingresoId={ingresoId}
          fecha={hoy}
          marca={marcaHoy}
          onClose={() => setModalMarca(false)}
          onCambio={cargar}
        />
      )}

      {formLesion && !formLesion.editando && (
        <FormularioLesion
          ingresoId={ingresoId}
          editando={null}
          onClose={() => setFormLesion(null)}
          onGuardado={async () => { setFormLesion(null); await cargar() }}
        />
      )}
      {formLesion?.editando && (
        <ModalEditarLesion
          lesion={formLesion.editando}
          pestañaInicial={formLesion.pestaña}
          onClose={() => setFormLesion(null)}
          onGuardado={async () => { setFormLesion(null); await cargar() }}
          extras={{
            error: errorAccion,
            puedeEditar,
            puedeBorrar: puedeEditar && (esAdmin || esMio(formLesion.editando.registrado_por_id)),
            puedeBorrarValoracion: (v) => puedeEditar && (esAdmin || esMio(v.registrado_por_id)),
            onEditarValoracion: (v) => { const l = formLesion.editando!; setFormLesion(null); setFormValoracion({ lesion: l, editando: v }) },
            onEliminarValoracion: eliminarValoracion,
            // «Marcar como curada» ya está en la tarjeta: aquí solo «Eliminar».
            onEliminarLesion: async () => { if (await eliminarLesion(formLesion.editando!)) setFormLesion(null) },
          }}
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
