import { useEffect, useRef, useState, useMemo, useCallback, memo, Fragment } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { escaparBusquedaIlike, quitarTildes } from '../lib/busqueda'
import { useAuth } from '../lib/AuthContext'
import type { Ingreso, ItemsPaciente } from '../types'
import { SEMAFORO_CAIDAS_COLOR as SEMAFORO_COLOR, nombreCompleto } from '../types'
import { Printer, X, Save, History } from 'lucide-react'
import ModalContencion from '../components/ModalContencion'
import {
  severidadDia, severidadNoche, SEVERIDAD_ESTILO,
  type ContencionDia, type ContencionNoche,
} from '../types/contenciones'

type IngresoConItems = Ingreso & { items: ItemsPaciente | null; contencion?: { dia: ContencionDia | null; noche: ContencionNoche[] | null } }

function habBg(ingreso: IngresoConItems | null): string {
  if (!ingreso) return '#FFFFFF'
  const sem = ingreso.items?.semaforo_caidas as string | undefined
  if (sem && SEMAFORO_COLOR[sem]) return SEMAFORO_COLOR[sem]
  return '#FFFFFF'
}
function textColor(bg: string) {
  return bg === '#FF0000' ? '#FFFFFF' : '#000000'
}

const SUJECION_SHORT: Record<string, string> = {
  normal: '—',
  una_barra: '1B',
  dos_barras: '2B',
  sujecion_fisica: 'SF',
  sensor_presion: 'SP',
  cota_cero: 'C0',
}

// Etiquetas cortas de la contención día/noche actual, pensadas para
// caber en una columna estrecha de la Hoja de Ítems (a diferencia de
// SUJECION_SHORT arriba, que es del sistema antiguo y solo se usa ya
// para mostrar fotos históricas de antes de este cambio).
const DIA_SHORT: Record<string, string> = {
  ninguna: '—',
  continua_seguridad: 'X',
  si_precisa_asistencial: 'A',
  si_precisa_paciente: 'S/P',
}
const NOCHE_SHORT: Record<string, string> = {
  '1_barra': '1B',
  '2_barras': '2B',
  cota_cero: 'C0',
  sensor_presion: 'SP',
  contencion_fija: 'CF',
  contencion_si_precisa: 'CSP',
}
function diaStr(v: string | null | undefined): string {
  if (!v || v === 'ninguna') return ''
  return DIA_SHORT[v] ?? v
}
function nocheStr(arr: string[] | null | undefined): string {
  if (!arr || arr.length === 0) return ''
  // El sensor de presión no se repite aquí como texto — ya tiene su
  // propia fila justo debajo, con una simple marca X.
  const sinSensor = arr.filter((x) => x !== 'sensor_presion')
  return sinSensor.map((x) => NOCHE_SHORT[x] ?? x).join('+')
}

// Agrupado en bloques con sentido clínico, en vez de una lista plana
// sin criterio. Cada grupo imprime su propia fila de cabecera antes
// de sus ítems (ver buildBloque / Bloque más abajo).
const GRUPOS: { titulo: string; mostrarTitulo?: boolean; filas: { key: string; label: string; get: (it: any, i: IngresoConItems) => string }[] }[] = [
  {
    titulo: 'Identidad',
    mostrarTitulo: false, // se sobreentiende, no hace falta el rótulo
    filas: [
      { key: 'nombre', label: 'NOMBRE', get: (_: any, i: IngresoConItems) => `${i.paciente?.primer_apellido ?? ''} ${i.paciente?.nombre ?? ''}`.trim() },
      { key: 'medico', label: 'MÉDICO', get: (_: any, i: IngresoConItems) => i.medico_responsable?.nombre?.toUpperCase() ?? '' },
    ],
  },
  {
    titulo: 'Seguridad y conducta',
    filas: [
      { key: 'cont_dia', label: 'Contención día', get: (_: any, i: IngresoConItems) => diaStr(i.contencion?.dia) },
      { key: 'cont_noche', label: 'Contención noche', get: (_: any, i: IngresoConItems) => nocheStr(i.contencion?.noche) },
      { key: 'sensor', label: 'Sensor', get: (_: any, i: IngresoConItems) => (i.contencion?.noche?.includes('sensor_presion') ? 'X' : '') },
      {
        key: 'alerta',
        label: 'Alerta conducta',
        get: (it: ItemsPaciente) => {
          const arr = (it?.alerta_conducta as string[]) ?? []
          const short: Record<string, string> = { riesgo_autolitico: 'Autol.', agresion_imprevisible: 'Agres.', riesgo_fuga: 'Fuga' }
          return arr.map((x) => short[x] ?? x).join('+')
        },
      },
      { key: 'objetos_calma', label: 'Objetos de calma', get: (it: ItemsPaciente) => (it as any)?.objetos_calma ?? '' },
    ],
  },
  {
    titulo: 'Movilidad',
    filas: [
      {
        key: 'deambulacion',
        label: 'Deambulación',
        get: (it: ItemsPaciente) => {
          const v = (it as any)?.deambulacion
          return v === 'autonomo' ? 'Autón.' : v === '1_persona' ? '1P' : v === '2_personas' ? '2P' : ''
        },
      },
      {
        key: 'ayudas',
        label: 'Ayudas deambulación',
        get: (it: ItemsPaciente) =>
          it?.ayudas_deambulacion
            ?.replace('andador_2r', 'And.2r')
            .replace('andador_4r', 'And.4r')
            .replace('silla_ruedas', 'SR')
            .replace('baston', 'Bast.') ?? '',
      },
      { key: 'bipedestador', label: 'Bipedestador', get: (it: ItemsPaciente) => (it?.bipedestador ? 'X' : '') },
      { key: 'grua', label: 'Grúa', get: (it: ItemsPaciente) => (it?.grua ? 'X' : '') },
      { key: 'cabecero', label: 'Cabecero elevado', get: (it: ItemsPaciente) => (it as any)?.cabecero_grados ?? '' },
    ],
  },
  {
    titulo: 'Alimentación',
    filas: [
      { key: 'ingestas', label: 'Ingestas', get: (it: ItemsPaciente) => (it?.ingestas === 'autonomo' ? 'A' : it?.ingestas === 'dependiente' ? 'D' : '') },
    ],
  },
  {
    titulo: 'Higiene y continencia',
    filas: [
      { key: 'dep', label: 'Dependencia', get: (it: ItemsPaciente) => it?.dependencia_avd != null ? `${it.dependencia_avd}P` : '' },
      { key: 'panial_dia', label: 'Pañal día', get: (it: ItemsPaciente) => it?.panial_dia ?? '' },
      { key: 'panial_noche', label: 'Pañal noche', get: (it: ItemsPaciente) => it?.panial_noche ?? '' },
      { key: 'colector', label: 'Colector', get: (it: ItemsPaciente) => (it?.colector ? 'X' : '') },
      { key: 'sonda', label: 'Sonda vesical', get: (it: ItemsPaciente) => (it?.sonda_vesical ? 'X' : '') },
      { key: 'higiene', label: 'Higiene', get: (it: ItemsPaciente) => (it?.higiene === 'lavabo' ? 'L' : it?.higiene === 'cama' ? 'C' : '') },
      { key: 'ducha', label: 'Ducha', get: (it: ItemsPaciente) => (it?.ducha === 'pie' ? 'P' : it?.ducha === 'sentado' ? 'S' : '') },
      { key: 'vestido', label: 'Vestido', get: (it: ItemsPaciente) => ((it as any)?.vestido === 'autonomo' ? 'A' : (it as any)?.vestido === 'dependiente' ? 'D' : '') },
      { key: 'banio', label: 'Baño acompañado', get: (it: ItemsPaciente) => (it?.banio ? 'X' : '') },
    ],
  },
  {
    titulo: 'Piel y postura',
    filas: [
      { key: 'antiescaras', label: 'C. antiescaras', get: (it: ItemsPaciente) => (it?.colchon_antiescaras ? 'X' : '') },
      { key: 'patucos', label: 'Patucos coderas', get: (it: ItemsPaciente) => (it?.patucos_coderas ? 'X' : '') },
      { key: 'cambios', label: 'Cambios posturales', get: (it: ItemsPaciente) => (it?.cambios_posturales ? 'X' : '') },
    ],
  },
  {
    titulo: 'Prótesis y sensorial',
    filas: [
      { key: 'dentadura', label: 'Dentadura', get: (it: ItemsPaciente) => it?.dentadura ?? '' },
      { key: 'audifonos', label: 'Audífonos', get: (it: ItemsPaciente) => it?.audifonos ?? '' },
      { key: 'gafas', label: 'Gafas', get: (it: ItemsPaciente) => (it?.gafas === 'si' ? 'Sí' : it?.gafas === 'solo_tv' ? 'TV' : '') },
    ],
  },
  {
    titulo: 'Otros',
    filas: [
      { key: 'oxigeno', label: 'Oxigenoterapia', get: (it: ItemsPaciente) => (it?.oxigenoterapia ? 'X' : '') },
      { key: 'botella', label: 'Botella noche', get: (it: ItemsPaciente) => (it?.botella_noche ? 'X' : '') },
      { key: 'timbre', label: 'Timbre habitación', get: (it: ItemsPaciente) => ((it as any)?.timbre_habitacion ? 'X' : '') },
      { key: 'siestas', label: 'Siesta tarde', get: (it: ItemsPaciente) => (it?.siestas ? 'X' : '') },
    ],
  },
  {
    titulo: 'Observaciones',
    mostrarTitulo: false, // innecesario, la propia fila ya lo dice
    filas: [
      { key: 'observaciones', label: 'Observaciones', get: (it: ItemsPaciente) => (it as any)?.observaciones ?? '' },
    ],
  },
]

// Lista plana derivada, para lo que solo necesita recorrer todas las
// filas sin que le importen los grupos.

const BOLD_ROWS = new Set(['nombre', 'medico'])
const LABEL_BOLD_ROWS = new Set(['nombre', 'medico', 'dep'])

// ─── TABLA HTML PURA PARA IMPRESIÓN ──────────────────────────

// Escapa texto libre antes de meterlo en el HTML de impresión. Sin esto,
// un campo de texto con "<" o similar podía romper la tabla impresa o,
// en el peor caso, colarse como HTML/JS en esa ventana.
function escapeHtml(val: string): string {
  return val
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

function buildPrintHTML(data: IngresoConItems[], today: string): string {
  const habs1_16 = data.filter((i) => i.habitacion && i.habitacion <= 16)
  const habs17_max = data.filter((i) => i.habitacion && i.habitacion > 16)
  const maxHab = Math.max(33, ...data.map((i) => i.habitacion ?? 0))

  function buildBloque(habs: IngresoConItems[], offset: number, count: number): string {
    const slots: (IngresoConItems | null)[] = Array(count).fill(null)
    habs.forEach((i) => {
      if (i.habitacion && i.habitacion > offset && i.habitacion <= offset + count) slots[i.habitacion - offset - 1] = i
    })
    const habNums = Array.from({ length: count }, (_, i) => i + 1 + offset)

    const labelPct = 9
    const colPct = ((100 - labelPct) / count).toFixed(3)

    let html = `<table style="width:100%;border-collapse:collapse;table-layout:fixed;font-size:8pt;font-family:Arial,sans-serif;margin:0;">`
    html += `<colgroup><col style="width:${labelPct}%"/>${habNums.map(() => `<col style="width:${colPct}%"/>`).join('')}</colgroup>`

    // Header row - habitación números
    html += `<tr>`
    html += `<th style="border:1px solid #555;background:#ccc;text-align:left;padding:2px 3px;font-size:7pt;">HABITACIÓN</th>`
    for (const n of habNums) {
      const ing = slots[n - offset - 1]
      const bg = habBg(ing)
      const color = textColor(bg)
      html += `<th style="border:1px solid #555;background:${bg};color:${color};text-align:center;padding:3px 1px;font-size:9pt;font-weight:bold;">${n}</th>`
    }
    html += `</tr>`

    // Filas, agrupadas en bloques con su propia cabecera de sección
    for (const grupo of GRUPOS) {
      if (grupo.mostrarTitulo !== false) {
        html += `<tr><td colspan="${count + 1}" style="border:1px solid #555;background:#5b7a9d;color:#fff;padding:2px 4px;font-weight:700;font-size:7pt;letter-spacing:0.03em;">${grupo.titulo.toUpperCase()}</td></tr>`
      }
      for (const fila of grupo.filas) {
        const isBoldLabel = LABEL_BOLD_ROWS.has(fila.key)
        const isBoldVal = BOLD_ROWS.has(fila.key)
        // El semáforo de caídas solo tiñe la fila del nombre (además
        // de la propia habitación en la cabecera) — no toda la
        // columna del paciente, para no "pintar" el resto de datos.
        const tenirPorSemaforo = fila.key === 'nombre'
        // La alerta de conducta tiene que saltar a la vista: fondo
        // rojo fuerte en la propia celda si hay algo marcado, no solo
        // texto — es justo el tipo de aviso que no se puede pasar por
        // alto.
        const esAlerta = fila.key === 'alerta'
        html += `<tr>`
        html += `<td style="border:1px solid #555;background:#e8e8e8;padding:2px 4px;font-weight:${isBoldLabel ? 700 : 500};white-space:nowrap;overflow:hidden;font-size:7.5pt;">${fila.label}</td>`
        for (const n of habNums) {
          const ing = slots[n - offset - 1]
          const it = ing?.items ?? null
          const val = ing ? fila.get(it as any, ing as any) : ''
          const bg = habBg(ing)
          const alertaActiva = esAlerta && !!val
          const cellBg = alertaActiva
            ? '#dc2626'
            : ing && tenirPorSemaforo
              ? bg === '#FF0000'
                ? '#ffaaaa'
                : bg === '#FF9900'
                  ? '#ffddaa'
                  : bg === '#FFFF00'
                    ? '#ffffaa'
                    : bg === '#92D050'
                      ? '#d4edaa'
                      : '#ffffff'
              : '#ffffff'
          const cellColor = alertaActiva ? '#fff' : '#000'
          const cellWeight = alertaActiva ? 700 : (isBoldVal ? 600 : 400)
          html += `<td style="border:1px solid #aaa;background:${cellBg};color:${cellColor};text-align:center;padding:2px 1px;font-weight:${cellWeight};overflow:hidden;font-size:7.5pt;">${val ? escapeHtml(String(val)) : '&nbsp;'}</td>`
        }
        html += `</tr>`
      }
    }
    html += `</table>`
    return html
  }

  const bloque1 = buildBloque(habs1_16, 0, 16)
  const bloque2 = buildBloque(habs17_max, 16, maxHab - 16)

  return `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8"/>
<style>
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body { font-family: Arial, sans-serif; background: white; }
  .page { width: 100%; padding: 4px 6px; }
  .page-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 3px; font-size: 8pt; }
  .page-header b { font-weight: bold; }
  @page { size: A4 landscape; margin: 0.3cm 0.4cm; }
  @media print {
    html, body { width: 100%; height: 100%; }
    .page { page-break-after: always; width: 100%; }
    .page:last-child { page-break-after: avoid; }
  }
</style>
</head>
<body>
  <div class="page">
    <div class="page-header">
      <b>CJA · HOJA DE ÍTEMS — Camas 1–16</b>
      <span style="text-transform:capitalize;">${today}</span>
    </div>
    ${bloque1}
  </div>
  <div class="page">
    <div class="page-header">
      <b>CJA · HOJA DE ÍTEMS — Camas 17–${maxHab}</b>
      <span style="text-transform:capitalize;">${today}</span>
    </div>
    ${bloque2}
  </div>
</body>
</html>`
}

function printHoja(data: IngresoConItems[], today: string) {
  const html = buildPrintHTML(data, today)
  const win = window.open('', '_blank', 'width=900,height=700')
  if (!win) return
  win.document.write(html)
  win.document.close()
  win.focus()
  setTimeout(() => {
    win.print()
    win.close()
  }, 400)
}

// ─── PANEL LATERAL DE EDICIÓN ─────────────────────────────────

function PanelEdicion({
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
    setSaving(true)
    const { data: updated, error } = await supabase
      .from('items_paciente')
      .upsert({ ...d, ingreso_id: ingreso.id })
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
    if (updated) onSaved(updated as ItemsPaciente)
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
      .upsert(vacio)
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

// Convierte items_historico al mismo formato que IngresoConItems
function snapshotToIngresos(snaps: any[]): IngresoConItems[] {
  return snaps.map((s) => ({
    id: s.ingreso_id,
    // Prioriza la habitación tal como estaba capturada EN ESE DÍA.
    // Las fotos anteriores a este arreglo no la tienen guardada (ese
    // dato nunca se llegó a capturar entonces), así que para esas se
    // recurre a la habitación actual como aproximación, no exacta.
    habitacion: s.datos?._habitacion_snapshot ?? s.ingreso?.habitacion ?? null,
    estado: 'activo' as const,
    fecha_ingreso: '',
    paciente_id: '',
    paciente: s.ingreso?.paciente ?? null,
    medico_responsable: s.ingreso?.medico_responsable ?? null,
    items: s.datos as ItemsPaciente,
    created_at: '',
  }))
}

// ─── TABLA EN PANTALLA ────────────────────────────────────────

const Bloque = memo(function Bloque({
  habs,
  offset,
  count = 16,
  onSelect,
  onSelectVacia,
  selectedId,
  readOnly = false,
}: {
  habs: IngresoConItems[]
  offset: number
  count?: number
  onSelect: (i: IngresoConItems) => void
  onSelectVacia?: (n: number) => void
  selectedId: string | null
  readOnly?: boolean
}) {
  const slots: (IngresoConItems | null)[] = Array(count).fill(null)
  habs.forEach((i) => {
    if (i.habitacion && i.habitacion > offset && i.habitacion <= offset + count) slots[i.habitacion - offset - 1] = i
  })
  const habNums = Array.from({ length: count }, (_, i) => i + 1 + offset)
  const cellCls = 'border border-slate-400 text-center text-[7.5pt] leading-tight px-0.5 py-0'
  const labelCls =
    'border border-slate-400 text-left text-[7.5pt] leading-tight px-1 py-0 font-medium bg-slate-100 whitespace-nowrap'

  return (
    <table className="w-full border-collapse table-fixed" style={{ fontSize: '7.5pt' }}>
      <colgroup>
        <col style={{ width: '80px' }} />
        {habNums.map((n) => (
          <col key={n} style={{ width: `${100 / count}%` }} />
        ))}
      </colgroup>
      <thead>
        <tr>
          <th className="border border-slate-400 bg-slate-200 text-[7.5pt] text-left px-1 py-0.5 font-bold">
            HABITACIÓN
          </th>
          {habNums.map((n) => {
            const ing = slots[n - offset - 1]
            const bg = habBg(ing)
            const color = textColor(bg)
            return (
              <th
                key={n}
                className={`border border-slate-400 text-[8pt] font-bold text-center py-0.5 ${!ing && !readOnly ? 'cursor-pointer hover:bg-primary-50' : ''}`}
                style={{ backgroundColor: bg, color }}
                onClick={() => {
                  if (!ing && !readOnly && onSelectVacia) onSelectVacia(n)
                }}
                title={!ing && !readOnly ? `Ingresar en habitación ${n}` : undefined}
              >
                {n}
              </th>
            )
          })}
        </tr>
      </thead>
      <tbody>
        {GRUPOS.map((grupo) => (
          <Fragment key={grupo.titulo}>
            {grupo.mostrarTitulo !== false && (
              <tr key={`g-${grupo.titulo}`}>
                <td colSpan={count + 1} className="border border-slate-400 bg-[#5b7a9d] text-white text-[7pt] font-bold px-1 py-0.5 tracking-wide">
                  {grupo.titulo.toUpperCase()}
                </td>
              </tr>
            )}
            {grupo.filas.map((fila) => {
              // El semáforo de caídas solo tiñe la fila del nombre, no
              // todas las filas del paciente.
              const tenirPorSemaforo = fila.key === 'nombre'
              // La alerta de conducta debe saltar a la vista: fondo
              // rojo fuerte en la celda si hay algo marcado.
              const esAlerta = fila.key === 'alerta'
              return (
                <tr key={fila.key}>
                  <td className={labelCls} style={{ fontWeight: LABEL_BOLD_ROWS.has(fila.key) ? 700 : 500 }}>
                    {fila.label}
                  </td>
                  {habNums.map((n) => {
                    const idx = n - offset - 1
                    const ingreso = slots[idx]
                    const it = ingreso?.items ?? null
                    const val = ingreso ? fila.get(it as any, ingreso as any) : ''
                    const bg = habBg(ingreso)
                    const alertaActiva = esAlerta && !!val
                    const cellBg = alertaActiva
                      ? '#dc2626'
                      : ingreso && tenirPorSemaforo
                        ? bg === '#FF0000'
                          ? '#ffcccc'
                          : bg === '#FF9900'
                            ? '#ffe5cc'
                            : bg === '#FFFF00'
                              ? '#ffffcc'
                              : bg === '#92D050'
                                ? '#e2f5cc'
                                : '#fff'
                        : '#fff'
                    const color = alertaActiva ? '#fff' : ingreso && tenirPorSemaforo ? textColor(bg) : '#000'
                    const isSelected = ingreso?.id === selectedId
                    return (
                      <td
                        key={n}
                        className={`${cellCls} ${ingreso && !readOnly ? 'cursor-pointer hover:brightness-95' : !ingreso && !readOnly ? 'cursor-pointer hover:bg-primary-50/40' : ''} ${isSelected ? 'ring-2 ring-inset ring-primary-500' : ''}`}
                        style={{ backgroundColor: cellBg, color, fontWeight: alertaActiva ? 700 : (BOLD_ROWS.has(fila.key) ? 600 : 400) }}
                        onClick={() => {
                          if (ingreso && !readOnly) onSelect(ingreso)
                          else if (!ingreso && !readOnly && onSelectVacia && fila.key === 'nombre') onSelectVacia(n)
                        }}
                      >
                        {val || '\u00a0'}
                      </td>
                    )
                  })}
                </tr>
              )
            })}
          </Fragment>
        ))}
      </tbody>
    </table>
  )
})

// ─── PÁGINA PRINCIPAL ─────────────────────────────────────────

export default function HojaItems() {
  const navigate = useNavigate()
  const { rol } = useAuth()
  const esMedico = rol === 'medico'
  const [data, setData] = useState<IngresoConItems[]>([])
  const [loading, setLoading] = useState(true)
  const [selected, setSelected] = useState<IngresoConItems | null>(null)

  const today = new Date().toLocaleDateString('es-ES', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  })

  const [verHistorico, setVerHistorico] = useState(false)
  const [fechasSnapshot, setFechasSnapshot] = useState<string[]>([])
  const [fechaSeleccionada, setFechaSeleccionada] = useState<string>('')
  const [snapshotData, setSnapshotData] = useState<any[]>([])
  const [loadingSnapshot, setLoadingSnapshot] = useState(false)
  const [modoHistorico, setModoHistorico] = useState<'fecha' | 'paciente'>('fecha')
  const [busquedaPaciente, setBusquedaPaciente] = useState('')
  const [pacienteResultados, setPacienteResultados] = useState<any[]>([])
  const [pacienteSeleccionadoHist, setPacienteSeleccionadoHist] = useState<any>(null)
  const [historialPaciente, setHistorialPaciente] = useState<any[]>([])
  const [loadingHistorial, setLoadingHistorial] = useState(false)

  async function fetchFechas() {
    // Solo necesitamos saber si hay datos y la fecha más reciente
    const { data } = await supabase
      .from('items_historico')
      .select('fecha')
      .order('fecha', { ascending: false })
      .limit(1)
    if (data && data.length > 0) {
      setFechasSnapshot([data[0].fecha])
      if (!fechaSeleccionada) setFechaSeleccionada(data[0].fecha)
    }
  }

  async function buscarPaciente(q: string) {
    if (q.trim().length < 2) {
      setPacienteResultados([])
      return
    }
    // Mismo criterio que en Pacientes y Nuevo Ingreso: se escapa el
    // texto (una coma o un paréntesis, si no, rompía la consulta) y
    // se busca sin tildes en los dos lados.
    const qEscapado = escaparBusquedaIlike(quitarTildes(q.trim()))
    const { data } = await supabase
      .from('pacientes')
      .select('id, nombre, primer_apellido, segundo_apellido')
      .or(`primer_apellido_normalizado.ilike.${qEscapado},segundo_apellido_normalizado.ilike.${qEscapado},nombre_normalizado.ilike.${qEscapado}`)
      .order('primer_apellido')
      .limit(8)
    setPacienteResultados(data ?? [])
  }

  async function cargarHistorialPaciente(paciente: any) {
    setLoadingHistorial(true)
    setPacienteSeleccionadoHist(paciente)
    setPacienteResultados([])
    setBusquedaPaciente(nombreCompleto(paciente))
    try {
      // Buscar todos los ingresos del paciente que tengan histórico
      const { data: ings } = await supabase
        .from('ingresos')
        .select('id, habitacion, fecha_ingreso, fecha_alta, estado')
        .eq('paciente_id', paciente.id)
        .order('fecha_ingreso', { ascending: false })
      const ingresoIds = (ings ?? []).map((i: any) => i.id)
      if (ingresoIds.length === 0) {
        setHistorialPaciente([])
        return
      }
      const { data: hist } = await supabase
        .from('items_historico')
        .select('fecha, datos, ingreso_id')
        .in('ingreso_id', ingresoIds)
        .order('fecha', { ascending: false })
      // Enriquecer con datos del ingreso
      const ingresoMap = Object.fromEntries((ings ?? []).map((i: any) => [i.id, i]))
      setHistorialPaciente(
        (hist ?? []).map((h: any) => ({
          ...h,
          ingreso: ingresoMap[h.ingreso_id],
        }))
      )
    } finally {
      setLoadingHistorial(false)
    }
  }

  async function cargarSnapshot(fecha: string) {
    setLoadingSnapshot(true)
    setFechaSeleccionada(fecha)
    try {
      const { data: snaps } = await supabase
        .from('items_historico')
        .select(
          '*, ingreso:ingresos(habitacion, paciente:pacientes(nombre, primer_apellido), medico_responsable:profesionales(nombre))'
        )
        .eq('fecha', fecha)
        .order('ingreso(habitacion)', { ascending: true })
      setSnapshotData(snaps ?? [])
    } finally {
      setLoadingSnapshot(false)
    }
  }

  async function fetchData() {
    try {
      const { data: ingresos } = await supabase
        .from('ingresos')
        .select(
          '*, paciente:pacientes(nombre,primer_apellido), medico_responsable:profesionales(nombre), items:items_paciente(*)'
        )
        .eq('estado', 'activo')
        .order('habitacion', { ascending: true })

      const ids = (ingresos ?? []).map((i: any) => i.id)
      const { data: contencionesData } = ids.length
        ? await supabase.from('contenciones').select('ingreso_id, dia, noche').in('ingreso_id', ids)
        : { data: [] as any[] }
      const contencionesMap: Record<string, { dia: any; noche: any }> = {}
      ;(contencionesData ?? []).forEach((c: any) => { contencionesMap[c.ingreso_id] = { dia: c.dia, noche: c.noche } })

      setData(
        (ingresos ?? []).map((i: any) => ({
          ...i,
          items: Array.isArray(i.items) ? (i.items[0] ?? null) : (i.items ?? null),
          contencion: contencionesMap[i.id],
        })) as IngresoConItems[]
      )
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchData()
    fetchFechas()
  }, [])

  function handleSaved(ingresoId: string, updated: ItemsPaciente) {
    setData((prev) => prev.map((i) => (i.id === ingresoId ? { ...i, items: updated } : i)))
    setSelected((prev) => (prev?.id === ingresoId ? { ...prev, items: updated } : prev))
  }

  // Sin esto, pautar o retirar una contención desde el panel lateral
  // solo actualizaba el propio panel — la rejilla principal (que
  // muestra "Contención día/noche" como filas) se quedaba con el
  // valor viejo hasta recargar la página entera.
  function handleContencionChanged(ingresoId: string, nueva: { dia: ContencionDia | null; noche: ContencionNoche[] | null }) {
    setData((prev) => prev.map((i) => (i.id === ingresoId ? { ...i, contencion: nueva } : i)))
    setSelected((prev) => (prev?.id === ingresoId ? { ...prev, contencion: nueva } : prev))
  }

  function handleHabitacionChange(ingresoId: string, nuevaHab: number) {
    setData((prev) => prev.map((i) => (i.id === ingresoId ? { ...i, habitacion: nuevaHab } : i)))
    setSelected((prev) => (prev?.id === ingresoId ? { ...prev, habitacion: nuevaHab } : prev))
  }

  // Memoizados: sin esto, Bloque se volvería a dibujar entero en cada
  // tecla del buscador o cualquier otra interacción, porque recibiría
  // un array "nuevo" (aunque con el mismo contenido) en cada renderizado.
  const habs1_16 = useMemo(() => data.filter((i) => i.habitacion && i.habitacion <= 16), [data])
  const habs17_max = useMemo(() => data.filter((i) => i.habitacion && i.habitacion > 16), [data])
  const maxHab = useMemo(() => Math.max(33, ...data.map((i) => i.habitacion ?? 0)), [data])

  // Estable entre renderizados por el mismo motivo: si no, Bloque
  // recibiría una función "nueva" cada vez y su memoización no serviría
  // de nada, aunque el resto de props no hubieran cambiado.
  const handleSelectVacia = useCallback(
    (n: number) => { if (esMedico) navigate(`/pacientes/nuevo?habitacion=${n}`) },
    [esMedico, navigate]
  )

  if (loading) return <div className="p-8 text-slate-400">Cargando…</div>

  return (
    <div className={`p-4 transition-all duration-200 ${selected ? 'mr-80' : ''}`}>
      <div className="flex items-center justify-between mb-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-800">Hoja de ítems</h1>
          <p className="text-sm text-slate-400 capitalize">{today}</p>
          {!selected && <p className="text-xs text-slate-400 mt-0.5">Click en un paciente para editar sus ítems</p>}
        </div>
        <div className="flex items-center gap-3">
          {/* Leyenda semáforo */}
          <div className="flex items-center gap-2 text-xs text-slate-500">
            {['verde', 'amarillo', 'naranja', 'rojo'].map((c) => (
              <span key={c} className="flex items-center gap-1">
                <span
                  className="w-3 h-3 rounded-full inline-block border border-slate-300"
                  style={{ backgroundColor: SEMAFORO_COLOR[c] }}
                />
                {c}
              </span>
            ))}
          </div>
          <button
            onClick={() => {
              setVerHistorico((v) => !v)
              if (!verHistorico && fechasSnapshot.length > 0) cargarSnapshot(fechasSnapshot[0])
            }}
            className={`btn-secondary ${verHistorico ? 'bg-slate-100' : ''}`}
          >
            <History className="w-4 h-4" />
            {verHistorico ? 'Ver hoy' : 'Histórico'}
          </button>
          <button onClick={() => printHoja(data, today)} className="btn-secondary">
            <Printer className="w-4 h-4" />
            Imprimir
          </button>
        </div>
      </div>

      {/* Vista histórico */}
      {verHistorico ? (
        <div className="space-y-4">
          {/* Selector de modo */}
          <div className="flex gap-2">
            <button
              onClick={() => setModoHistorico('fecha')}
              className={`px-4 py-2 rounded-lg text-sm font-medium border transition-colors ${modoHistorico === 'fecha' ? 'bg-primary-600 text-white border-primary-600' : 'bg-white text-slate-600 border-slate-300 hover:bg-slate-50'}`}
            >
              Por fecha
            </button>
            <button
              onClick={() => setModoHistorico('paciente')}
              className={`px-4 py-2 rounded-lg text-sm font-medium border transition-colors ${modoHistorico === 'paciente' ? 'bg-primary-600 text-white border-primary-600' : 'bg-white text-slate-600 border-slate-300 hover:bg-slate-50'}`}
            >
              Por paciente
            </button>
          </div>

          {/* MODO FECHA */}
          {modoHistorico === 'fecha' &&
            (fechasSnapshot.length === 0 ? (
              <div className="card p-10 text-center text-slate-400 text-sm">No hay snapshots guardados aún.</div>
            ) : (
              <>
                <div className="flex items-center gap-3">
                  <input
                    type="date"
                    className="input max-w-[200px]"
                    value={fechaSeleccionada}
                    max={fechasSnapshot[0]}
                    onChange={(e) => {
                      if (e.target.value) cargarSnapshot(e.target.value)
                    }}
                  />
                  <span className="text-sm text-slate-400">
                    {fechaSeleccionada &&
                      new Date(fechaSeleccionada).toLocaleDateString('es-ES', {
                        weekday: 'long',
                        day: 'numeric',
                        month: 'long',
                        year: 'numeric',
                      })}
                  </span>
                  {snapshotData.length > 0 && (
                    <button
                      onClick={() => {
                        const fechaLabel = new Date(fechaSeleccionada).toLocaleDateString('es-ES', {
                          weekday: 'long',
                          day: 'numeric',
                          month: 'long',
                          year: 'numeric',
                        })
                        printHoja(snapshotToIngresos(snapshotData), fechaLabel)
                      }}
                      className="btn-secondary ml-auto"
                    >
                      <Printer className="w-4 h-4" />
                      Imprimir
                    </button>
                  )}
                </div>
                {loadingSnapshot ? (
                  <div className="text-slate-400 text-sm py-8 text-center">Cargando…</div>
                ) : snapshotData.length === 0 ? (
                  <div className="card p-8 text-center text-slate-400 text-sm">Sin datos para esta fecha.</div>
                ) : (
                  <>
                    {(() => {
                      const converted = snapshotToIngresos(snapshotData)
                      const habs1 = converted.filter((i) => i.habitacion && i.habitacion <= 16)
                      const habs2 = converted.filter((i) => i.habitacion && i.habitacion > 16)
                      // Igual que en la vista actual: el segundo bloque se
                      // adapta a cuántas habitaciones haya de verdad, para
                      // no perder la 33 (u otras futuras) en el histórico.
                      const maxHabSnapshot = Math.max(33, ...converted.map((i) => i.habitacion ?? 0))
                      return (
                        <>
                          <Bloque habs={habs1} offset={0} count={16} onSelect={() => {}} selectedId={null} readOnly />
                          <Bloque habs={habs2} offset={16} count={maxHabSnapshot - 16} onSelect={() => {}} selectedId={null} readOnly />
                        </>
                      )
                    })()}
                  </>
                )}
              </>
            ))}

          {/* MODO PACIENTE */}
          {modoHistorico === 'paciente' && (
            <div className="space-y-4">
              {/* Buscador */}
              <div className="relative max-w-sm">
                <input
                  className="input pr-8"
                  placeholder="Buscar por apellido…"
                  value={busquedaPaciente}
                  onChange={(e) => {
                    setBusquedaPaciente(e.target.value)
                    buscarPaciente(e.target.value)
                  }}
                />
                {pacienteResultados.length > 0 && (
                  <div className="absolute top-full left-0 right-0 mt-1 bg-white border rounded-xl shadow-lg z-20 overflow-hidden">
                    {pacienteResultados.map((p: any) => (
                      <button
                        key={p.id}
                        onClick={() => cargarHistorialPaciente(p)}
                        className="w-full text-left px-4 py-2.5 text-sm hover:bg-slate-50 border-b last:border-0"
                      >
                        {p.primer_apellido}, {p.nombre}
                      </button>
                    ))}
                  </div>
                )}
              </div>

              {/* Historial del paciente */}
              {pacienteSeleccionadoHist &&
                (loadingHistorial ? (
                  <div className="text-slate-400 text-sm py-8 text-center">Cargando historial…</div>
                ) : historialPaciente.length === 0 ? (
                  <div className="card p-8 text-center text-slate-400 text-sm">
                    Sin histórico de ítems para {pacienteSeleccionadoHist.primer_apellido},{' '}
                    {pacienteSeleccionadoHist.nombre}.
                  </div>
                ) : (
                  <div className="space-y-3">
                    <p className="text-sm font-semibold text-slate-700">
                      {pacienteSeleccionadoHist.primer_apellido}, {pacienteSeleccionadoHist.nombre}
                      <span className="font-normal text-slate-400 ml-2">· {historialPaciente.length} registros</span>
                    </p>
                    <div className="card overflow-hidden">
                      <table className="w-full text-xs">
                        <thead>
                          <tr className="border-b bg-slate-50">
                            <th className="px-3 py-2 text-left font-semibold text-slate-500">Fecha</th>
                            <th className="px-3 py-2 text-left font-semibold text-slate-500">Hab.</th>
                            <th className="px-3 py-2 text-left font-semibold text-slate-500">Riesgo caída</th>
                            <th className="px-3 py-2 text-left font-semibold text-slate-500">Dependencia</th>
                            <th className="px-3 py-2 text-left font-semibold text-slate-500">Ingestas</th>
                            <th className="px-3 py-2 text-left font-semibold text-slate-500">Higiene</th>
                            <th className="px-3 py-2 text-left font-semibold text-slate-500">Sujeción cama</th>
                            <th className="px-3 py-2 text-left font-semibold text-slate-500">Deambulación</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y">
                          {historialPaciente.map((h: any, idx: number) => {
                            const it = h.datos ?? {}
                            const sem = it.semaforo_caidas
                            const semBg = sem ? SEMAFORO_COLOR[sem] : null
                            const semTxt = sem === 'rojo' ? '#fff' : '#000'
                            const sujCama =
                              Array.isArray(it.sujecion_cama) && it.sujecion_cama.length > 0
                                ? it.sujecion_cama.map((x: string) => SUJECION_SHORT[x] ?? x).join('+')
                                : '—'
                            // Detectar cambios respecto al día anterior
                            const prev = historialPaciente[idx + 1]?.datos ?? {}
                            const changed = (key: string) => JSON.stringify(it[key]) !== JSON.stringify(prev[key])
                            const cellCls = (key: string) =>
                              changed(key) && idx < historialPaciente.length - 1
                                ? 'px-3 py-2 font-semibold text-primary-700'
                                : 'px-3 py-2 text-slate-600'
                            return (
                              <tr key={`${h.ingreso_id}-${h.fecha}`} className="hover:bg-slate-50">
                                <td className="px-3 py-2 font-medium text-slate-800 whitespace-nowrap">
                                  {new Date(h.fecha).toLocaleDateString('es-ES', {
                                    day: 'numeric',
                                    month: 'short',
                                    year: 'numeric',
                                  })}
                                </td>
                                <td className="px-3 py-2 text-slate-500">{h.ingreso?.habitacion ?? '—'}</td>
                                <td className="px-3 py-2">
                                  {sem ? (
                                    <span
                                      className="px-2 py-0.5 rounded-full text-xs font-medium capitalize"
                                      style={{ backgroundColor: semBg!, color: semTxt }}
                                    >
                                      {sem}
                                    </span>
                                  ) : (
                                    '—'
                                  )}
                                </td>
                                <td className={cellCls('dependencia_avd')}>{it.dependencia_avd ?? '—'}</td>
                                <td className={cellCls('ingestas')}>
                                  {it.ingestas === 'autonomo'
                                    ? 'Autónomo'
                                    : it.ingestas === 'dependiente'
                                      ? 'Dependiente'
                                      : '—'}
                                </td>
                                <td className={cellCls('higiene')}>
                                  {it.higiene === 'lavabo' ? 'Lavabo' : it.higiene === 'cama' ? 'Cama' : '—'}
                                </td>
                                <td className={cellCls('sujecion_cama')}>{sujCama}</td>
                                <td className={cellCls('deambulacion')}>{it.deambulacion ?? '—'}</td>
                              </tr>
                            )
                          })}
                        </tbody>
                      </table>
                    </div>
                  </div>
                ))}
            </div>
          )}
        </div>
      ) : (
        <>
          <div className="mb-4">
            <Bloque
              habs={habs1_16}
              offset={0}
              count={16}
              onSelect={setSelected}
              onSelectVacia={handleSelectVacia}
              selectedId={selected?.id ?? null}
            />
          </div>
          <div className="my-3 border-t-2 border-slate-400" />
          <div className="mb-4">
            <Bloque
              habs={habs17_max}
              offset={16}
              count={maxHab - 16}
              onSelect={setSelected}
              onSelectVacia={handleSelectVacia}
              selectedId={selected?.id ?? null}
            />
          </div>
        </>
      )}

      {selected && (
        <PanelEdicion
          key={selected.id}
          ingreso={selected}
          onClose={() => setSelected(null)}
          onSaved={(updated) => handleSaved(selected.id, updated)}
          onHabitacionChange={handleHabitacionChange}
          onContencionChanged={handleContencionChanged}
        />
      )}
    </div>
  )
}
