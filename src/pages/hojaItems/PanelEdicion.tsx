import { useRef, useState } from 'react'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../lib/AuthContext'
import { encadenar } from '../../lib/colaGuardado'
import type { ItemsPaciente } from '../../types'
import { nombreCompleto } from '../../types'
import { Save, X } from 'lucide-react'
import { CamposItems } from '../../components/CamposItems'
import type { ContencionDia, ContencionNoche } from '../../types/contenciones'
import type { IngresoConItems } from './tipos'
import { IndicadorGuardado } from '../../components/IndicadorGuardado'

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
  const { esMedico } = useAuth()
  const [data, setData] = useState<Partial<ItemsPaciente & { version: number }>>(ingreso.items ?? {})
  const [estado, setEstado] = useState<'inactivo' | 'pendiente' | 'guardando' | 'guardado' | 'error' | 'conflicto'>('inactivo')
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const dataRef = useRef(data)
  const saveSeqRef = useRef(0)
  // Cuenta las ediciones: un guardado solo da «Guardado» si no se ha cambiado nada desde que empezó.
  const editRevRef = useRef(0)
  // Guardados en cola + versión que dejó el último guardado propio (null = la que trae la hoja).
  const cadenaRef = useRef<Promise<boolean>>(Promise.resolve(true))
  const versionGuardadaRef = useRef<number | null>(null)
  dataRef.current = data

  const [confirmLimpiar, setConfirmLimpiar] = useState(false)
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

  function save(d = dataRef.current): Promise<boolean> {
    const miSecuencia = ++saveSeqRef.current
    const rev = editRevRef.current
    setEstado('guardando')
    return encadenar(cadenaRef, () => ejecutarGuardado(d, miSecuencia, rev))
  }

  async function ejecutarGuardado(d: Partial<ItemsPaciente & { version: number }>, miSecuencia: number, rev: number): Promise<boolean> {
    // La versión que dejó el guardado anterior, no la que llevaba el panel al hacer el cambio.
    const version = versionGuardadaRef.current ?? dataRef.current.version ?? d.version ?? 1
    const { data: updated, error } = await supabase
      .from('items_paciente')
      .update(d)
      .eq('ingreso_id', ingreso.id)
      .eq('version', version)
      .select()
      .maybeSingle()
    if (updated) versionGuardadaRef.current = updated.version
    if (miSecuencia !== saveSeqRef.current) return true
    if (error) {
      setEstado('error')   // se queda a la vista hasta el siguiente guardado correcto: lo escrito sigue sin guardar
      return false
    }
    if (!updated) {
      // Alguien más ha guardado esta misma hoja mientras se editaba
      // aquí — se avisa en vez de propagar un valor obsoleto hacia
      // la rejilla principal.
      setEstado('conflicto')
      return false
    }
    // Solo la versión nueva: lo que se haya cambiado mientras se guardaba se queda como está.
    setData((prev) => ({ ...prev, version: updated.version, updated_at: updated.updated_at }))
    onSaved(updated as ItemsPaciente)
    if (editRevRef.current !== rev) return true // hay cambios nuevos pendientes: sigue «pendiente»
    setEstado('guardado')
    setTimeout(() => setEstado((e) => (e === 'guardado' ? 'inactivo' : e)), 2800)
    return true
  }

  async function recargarTrasConflicto() {
    if (debounceRef.current) { clearTimeout(debounceRef.current); debounceRef.current = null }
    const { data: d } = await supabase.from('items_paciente').select('*').eq('ingreso_id', ingreso.id).maybeSingle()
    versionGuardadaRef.current = null
    if (d) { setData(d as ItemsPaciente); onSaved(d as ItemsPaciente) }
    setEstado('inactivo')
  }

  async function limpiarItems() {
    if (debounceRef.current) { clearTimeout(debounceRef.current); debounceRef.current = null }
    const miSecuencia = ++saveSeqRef.current
    const rev = editRevRef.current
    setEstado('guardando')
    await encadenar(cadenaRef, () => ejecutarLimpieza(miSecuencia, rev))
  }

  async function ejecutarLimpieza(miSecuencia: number, rev: number): Promise<boolean> {
    // Vacío explícito de cada campo: un update que solo mande estos
    // campos no toca el resto de columnas si no se listan aquí.
    const vacio = {
      dependencia_avd: null, panial_dia: null, panial_noche: null,
      colector: false, sonda_vesical: false, sonda_fecha: null, sonda_calibre: null,
      vias: [], aislamiento: [], oxigeno_dispositivo: null, oxigeno_flujo: null,
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
      .update(vacio)
      .eq('ingreso_id', ingreso.id)
      .eq('version', versionGuardadaRef.current ?? dataRef.current.version ?? 1)
      .select()
      .maybeSingle()
    setConfirmLimpiar(false)
    if (updated) versionGuardadaRef.current = updated.version
    if (miSecuencia !== saveSeqRef.current) return true
    if (error) {
      setEstado('error')   // se queda a la vista hasta el siguiente guardado correcto: lo escrito sigue sin guardar
      return false
    }
    if (!updated) { setEstado('conflicto'); return false }
    setData(updated as ItemsPaciente)
    if (editRevRef.current === rev) setEstado('inactivo')
    onSaved(updated as ItemsPaciente)
    return true
  }

  function update(key: keyof ItemsPaciente, val: any) {
    updateVarios({ [key]: val })
  }

  // Varias columnas a la vez (p. ej. quitar la sonda borra también su fecha y calibre).
  function updateVarios(cambios: Record<string, any>) {
    if (estado === 'conflicto') return
    const next = { ...dataRef.current, ...cambios }
    setData(next)
    editRevRef.current++
    setEstado('pendiente')
    if (debounceRef.current) clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(() => save(next), 1200)
  }

  const nombre = ingreso.paciente ? nombreCompleto(ingreso.paciente) : ''

  return (
    <div className="fixed inset-y-0 right-0 w-80 bg-white shadow-2xl border-l flex flex-col z-40">
      {/* Header */}
      <div className="px-4 py-3 border-b bg-slate-50 flex items-start justify-between">
        <div className="flex-1 min-w-0 mr-2">
          <p className="font-bold text-sm text-slate-800 truncate">{nombre}</p>
          <div className="flex items-center gap-1.5 mt-1">
            <span className="text-xs text-slate-500">Hab.</span>
            <input
              type="number"
              min={1}
              max={33}
              disabled={!esMedico}
              title={esMedico ? '' : 'Solo un médico puede cambiar la habitación'}
              className="w-14 text-xs border border-slate-200 rounded px-1.5 py-0.5 text-slate-700 font-medium disabled:bg-slate-50 disabled:text-slate-500"
              value={habEdit}
              onChange={(e) => {
                setHabEdit(e.target.value)
                setHabError('')
              }}
              onBlur={cambiarHabitacion}
              onKeyDown={(e) => e.key === 'Enter' && cambiarHabitacion()}
            />
            {savingHab && <span className="text-xs text-slate-500">…</span>}
            {habError && <span className="text-xs text-red-600">{habError}</span>}
          </div>
        </div>
        <div className="flex items-center gap-2">
          <IndicadorGuardado estado={estado} detalle="inténtalo de nuevo" />
          {estado === 'error' && (
            <button type="button" onClick={() => { void save() }} className="text-xs font-semibold text-primary-700 hover:underline">Reintentar</button>
          )}
          <button onClick={onClose} className="text-slate-500 hover:text-slate-600 ml-1">
            <X className="w-4 h-4" />
          </button>
        </div>
      </div>

      {estado === 'conflicto' && (
        <div className="aviso aviso-atencion mx-4 mt-3 flex items-center justify-between gap-2">
          <span>Alguien más ha guardado cambios en esta hoja mientras la editabas.</span>
          <button onClick={recargarTrasConflicto} className="btn-secondary btn-sm shrink-0">Ver lo más reciente</button>
        </div>
      )}

      <div className="flex-1 overflow-y-auto px-4 py-3">
        <CamposItems
          variante="panel"
          data={data as Record<string, any>}
          update={(k, v) => update(k as keyof ItemsPaciente, v)}
          updateVarios={updateVarios}
          ingresoId={ingreso.id}
          pacienteInfo={nombre ? { nombre, habitacion: ingreso.habitacion } : undefined}
          onContencionCambio={(nueva) => onContencionChanged(ingreso.id, nueva)}
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
            className="w-full text-xs text-slate-500 hover:text-red-500 transition-colors py-1 text-center"
          >
            Borrar todos los ítems
          </button>
        ) : (
          <div className="flex gap-2">
            <button onClick={() => setConfirmLimpiar(false)} className="btn-secondary btn-sm flex-1">
              Cancelar
            </button>
            <button onClick={limpiarItems} className="btn-danger btn-sm flex-1">
              Confirmar borrado
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
