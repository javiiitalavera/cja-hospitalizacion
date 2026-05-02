import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import type { Ingreso, ItemsPaciente } from '../types'
import { Printer } from 'lucide-react'

type IngresoConItems = Ingreso & { items: ItemsPaciente | null }

// Colores de fondo exactos del Excel por habitación
const HAB_COLORS: Record<number, string> = {
  1:  '#92D050', 2:  '#FF0000', 3:  '#FF9900', 4:  '#FFFF00',
  5:  '#92D050', 6:  '#92D050', 7:  '#92D050', 8:  '#FFFFFF',
  9:  '#FF9900', 10: '#FF9900', 11: '#92D050', 12: '#92D050',
  13: '#92D050', 14: '#FFFF00', 15: '#92D050', 16: '#FFFF00',
  17: '#92D050', 18: '#92D050', 19: '#FF9900', 20: '#FFFF00',
  21: '#FF9900', 22: '#FFFF00', 23: '#FFFF00', 24: '#FFFF00',
  25: '#FF9900', 26: '#92D050', 27: '#FFFF00', 28: '#92D050',
  29: '#FF9900', 30: '#92D050', 31: '#92D050', 32: '#FF9900',
}

function textColor(bg: string) {
  // Red bg → white text, others → black
  return bg === '#FF0000' ? '#FFFFFF' : '#000000'
}

const SUJECION_SHORT: Record<string, string> = {
  normal: '—', una_barra: '1B', dos_barras: '2B',
  sujecion_fisica: 'SF', sensor_presion: 'SP', cota_cero: 'C0',
}

function sujecionStr(arr: string[] | null | undefined) {
  if (!arr || arr.length === 0) return ''
  return arr.map(x => SUJECION_SHORT[x] ?? x).join('+')
}

const FILAS = [
  { key: 'nombre',       label: 'NOMBRE',             get: (_: any, i: IngresoConItems) => `${i.paciente?.primer_apellido ?? ''} ${i.paciente?.nombre ?? ''}`.trim() },
  { key: 'medico',       label: 'MÉDICO',              get: (_: any, i: IngresoConItems) => i.medico_responsable?.nombre?.toUpperCase() ?? '' },
  { key: 'dep',          label: 'dependiente',         get: (it: ItemsPaciente) => it?.dependencia_avd?.toString() ?? '' },
  { key: 'panial_dia',   label: 'pañal día',           get: (it: ItemsPaciente) => it?.panial_dia ?? '' },
  { key: 'panial_noche', label: 'pañal noche',         get: (it: ItemsPaciente) => it?.panial_noche ?? '' },
  { key: 'dentadura',    label: 'dentadura',           get: (it: ItemsPaciente) => it?.dentadura ?? '' },
  { key: 'audifonos',    label: 'audífonos',           get: (it: ItemsPaciente) => it?.audifonos ?? '' },
  { key: 'gafas',        label: 'gafas',               get: (it: ItemsPaciente) => it?.gafas === 'si' ? 'Sí' : it?.gafas === 'solo_tv' ? 'TV' : '' },
  { key: 'higiene',      label: 'higiene',             get: (it: ItemsPaciente) => it?.higiene === 'lavabo' ? 'L' : it?.higiene === 'cama' ? 'C' : '' },
  { key: 'vestido',      label: 'vestido',             get: (it: ItemsPaciente) => it?.vestido ?? '' },
  { key: 'ducha',        label: 'ducha',               get: (it: ItemsPaciente) => it?.ducha === 'pie' ? 'P' : it?.ducha === 'sentado' ? 'S' : '' },
  { key: 'bipedestador', label: 'bipedestador',        get: (it: ItemsPaciente) => it?.bipedestador ? 'X' : '' },
  { key: 'grua',         label: 'grúa',                get: (it: ItemsPaciente) => it?.grua ? 'X' : '' },
  { key: 'antiescaras',  label: 'c. antiescaras',      get: (it: ItemsPaciente) => it?.colchon_antiescaras ? 'X' : '' },
  { key: 'patucos',      label: 'patucos coderas',     get: (it: ItemsPaciente) => it?.patucos_coderas ? 'X' : '' },
  { key: 'suj_cama',     label: 'sujeción cama',       get: (it: ItemsPaciente) => sujecionStr(it?.sujecion_cama) },
  { key: 'suj_silla',    label: 'sujeción silla r.',   get: (it: ItemsPaciente) => sujecionStr(it?.sujecion_silla_ruedas) },
  { key: 'suj_sillon',   label: 'sujeción sillón',     get: (it: ItemsPaciente) => sujecionStr(it?.sujecion_sillon) },
  { key: 'sensor',       label: 'sensor cama',         get: (it: ItemsPaciente) => it?.sensor_cama ? 'X' : '' },
  { key: 'deambulacion', label: 'deambulación',        get: (it: ItemsPaciente) => it?.deambulacion ?? '' },
  { key: 'ayudas',       label: 'ayudas deambulación', get: (it: ItemsPaciente) => it?.ayudas_deambulacion?.replace('andador_2r','And.2r').replace('andador_4r','And.4r').replace('silla_ruedas','SR').replace('baston','Bast.') ?? '' },
  { key: 'oxigeno',      label: 'oxigenoterapia',      get: (it: ItemsPaciente) => it?.oxigenoterapia ? 'X' : '' },
  { key: 'ingestas',     label: 'ingestas',            get: (it: ItemsPaciente) => it?.ingestas === 'autonomo' ? 'A' : it?.ingestas === 'dependiente' ? 'D' : '' },
  { key: 'banio',        label: 'baño',                get: (it: ItemsPaciente) => it?.banio ? 'X' : '' },
  { key: 'siestas',      label: 'siestas',             get: (it: ItemsPaciente) => it?.siestas ? 'X' : '' },
  { key: 'colector',     label: 'colector',            get: (it: ItemsPaciente) => it?.colector ? 'X' : '' },
  { key: 'cama45',       label: 'Cama 45º',            get: (it: ItemsPaciente) => it?.cama_45 ? 'X' : '' },
  { key: 'sonda',        label: 'Sonda vesical',       get: (it: ItemsPaciente) => it?.sonda_vesical ? 'X' : '' },
  { key: 'cambios',      label: 'Cambios posturales',  get: (it: ItemsPaciente) => it?.cambios_posturales ? 'X' : '' },
  { key: 'botella',      label: 'Botella noche',       get: (it: ItemsPaciente) => it?.botella_noche ? 'X' : '' },
]

// Filas que van en negrita en el Excel
const BOLD_ROWS = new Set(['nombre', 'medico'])
const LABEL_BOLD_ROWS = new Set(['nombre', 'medico', 'dep'])

interface BloqueProps {
  habs: IngresoConItems[]
  offset: number   // 0 para habs 1-16, 16 para habs 17-32
  vaciasFilled: number[]
}

function Bloque({ habs, offset, vaciasFilled }: BloqueProps) {
  // Crear array de 16 slots
  const slots: (IngresoConItems | null)[] = Array(16).fill(null)
  habs.forEach(i => {
    if (i.habitacion && i.habitacion > offset && i.habitacion <= offset + 16) {
      slots[i.habitacion - offset - 1] = i
    }
  })

  const habNums = Array.from({ length: 16 }, (_, i) => i + 1 + offset)

  // Cell style
  const cellCls = 'border border-slate-400 text-center text-[7.5pt] leading-tight px-0.5 py-0'
  const labelCls = 'border border-slate-400 text-left text-[7.5pt] leading-tight px-1 py-0 font-medium bg-slate-100 whitespace-nowrap'

  return (
    <table className="w-full border-collapse table-fixed" style={{ fontSize: '7.5pt' }}>
      <colgroup>
        <col style={{ width: '80px' }} />
        {habNums.map(n => <col key={n} style={{ width: `${100 / 16}%` }} />)}
      </colgroup>
      <thead>
        <tr>
          <th className="border border-slate-400 bg-slate-200 text-[7.5pt] text-left px-1 py-0.5 font-bold">
            HABITACIÓN
          </th>
          {habNums.map(n => {
            const bg = HAB_COLORS[n] ?? '#FFFFFF'
            const color = textColor(bg)
            return (
              <th key={n}
                className="border border-slate-400 text-[8pt] font-bold text-center py-0.5"
                style={{ backgroundColor: bg, color }}>
                {n}
              </th>
            )
          })}
        </tr>
      </thead>
      <tbody>
        {FILAS.map(fila => (
          <tr key={fila.key}>
            <td className={labelCls} style={{ fontWeight: LABEL_BOLD_ROWS.has(fila.key) ? 700 : 500 }}>
              {fila.label}
            </td>
            {habNums.map(n => {
              const idx = n - offset - 1
              const ingreso = slots[idx]
              const it = ingreso?.items ?? null
              const val = ingreso
                ? fila.get(it as any, ingreso as any)
                : (vaciasFilled.includes(n) ? '' : '')
              const bg = ingreso ? (HAB_COLORS[n] ?? '#FFFFFF') : '#FFFFFF'
              const color = ingreso ? textColor(bg) : '#000000'
              const isBold = BOLD_ROWS.has(fila.key)
              return (
                <td key={n} className={cellCls}
                  style={{
                    backgroundColor: ingreso ? `${bg}44` : '#FFFFFF',
                    color,
                    fontWeight: isBold ? 600 : 400,
                  }}>
                  {val || '\u00a0'}
                </td>
              )
            })}
          </tr>
        ))}
      </tbody>
    </table>
  )
}

export default function HojaItems() {
  const [data, setData] = useState<IngresoConItems[]>([])
  const [loading, setLoading] = useState(true)

  const today = new Date().toLocaleDateString('es-ES', {
    weekday: 'long', day: 'numeric', month: 'long', year: 'numeric',
  })

  useEffect(() => {
    async function fetch() {
      const { data: ingresos } = await supabase
        .from('ingresos')
        .select(`
          *,
          paciente:pacientes(nombre, primer_apellido),
          medico_responsable:profesionales(nombre),
          items:items_paciente(*)
        `)
        .eq('estado', 'activo')
        .order('habitacion', { ascending: true })

      setData((ingresos ?? []).map(i => ({
        ...i,
        items: Array.isArray(i.items) ? (i.items[0] ?? null) : (i.items ?? null),
      })) as IngresoConItems[])
      setLoading(false)
    }
    fetch()
  }, [])

  const habs1_16 = data.filter(i => i.habitacion && i.habitacion <= 16)
  const habs17_32 = data.filter(i => i.habitacion && i.habitacion > 16)

  // Sujeciones con observaciones para el bloque inferior
  const conSujeciones = data.filter(i => {
    const it = i.items
    if (!it) return false
    return (
      (it.sujecion_cama?.length ?? 0) > 0 ||
      (it.sujecion_silla_ruedas?.length ?? 0) > 0 ||
      (it.sujecion_sillon?.length ?? 0) > 0 ||
      it.observaciones_sujeciones
    )
  })

  if (loading) return <div className="p-8 text-slate-400">Cargando…</div>

  return (
    <div className="p-4">
      {/* Header — oculto al imprimir, visible en pantalla */}
      <div className="flex items-center justify-between mb-4 print:hidden">
        <div>
          <h1 className="text-xl font-bold text-slate-800">Hoja de ítems</h1>
          <p className="text-sm text-slate-400 capitalize">{today}</p>
        </div>
        <button onClick={() => window.print()} className="btn-secondary">
          <Printer className="w-4 h-4" />
          Imprimir
        </button>
      </div>

      {/* Contenido imprimible */}
      <div id="hoja-print">
        {/* Cabecera de impresión */}
        <div className="hidden print:flex justify-between items-center mb-2">
          <span className="font-bold text-sm">CJA · HOJA DE ÍTEMS</span>
          <span className="text-sm capitalize">{today}</span>
        </div>

        {/* Bloque 1: habitaciones 1-16 */}
        <div className="mb-4">
          <Bloque habs={habs1_16} offset={0} vaciasFilled={[]} />
        </div>

        {/* Separador */}
        <div className="my-3 border-t-2 border-slate-400 print:my-2" />

        {/* Bloque 2: habitaciones 17-32 */}
        <div className="mb-4">
          <Bloque habs={habs17_32} offset={16} vaciasFilled={[]} />
        </div>

        {/* Pauta de sujeciones */}
        {conSujeciones.length > 0 && (
          <div className="mt-3">
            <div className="border border-slate-400 bg-slate-100 px-2 py-1 text-[7.5pt] font-bold">
              PAUTA SUJECIONES / MEDIDAS ALTERNATIVAS (observaciones)
            </div>
            <div className="border border-slate-400 px-2 py-0.5 text-[6.5pt] text-slate-600">
              (1) Soporte terapéutico &nbsp;(2) Agresividad o autoagresión &nbsp;(3) Garantizar rehabilitación &nbsp;(4) Riesgo alto de caída + otras conductas &nbsp;(5) Voluntario &nbsp;(6) Control postural/seguridad
            </div>
            <table className="w-full border-collapse mt-1">
              <tbody>
                {conSujeciones.map(i => {
                  const it = i.items!
                  const partes = [
                    sujecionStr(it.sujecion_cama) && `Cama: ${sujecionStr(it.sujecion_cama)}`,
                    sujecionStr(it.sujecion_silla_ruedas) && `Silla: ${sujecionStr(it.sujecion_silla_ruedas)}`,
                    sujecionStr(it.sujecion_sillon) && `Sillón: ${sujecionStr(it.sujecion_sillon)}`,
                  ].filter(Boolean).join(' · ')
                  return (
                    <tr key={i.id} className="border border-slate-300">
                      <td className="px-2 py-0.5 text-[7.5pt] font-medium w-8 text-center border-r border-slate-300">
                        {i.habitacion}
                      </td>
                      <td className="px-2 py-0.5 text-[7.5pt] w-36 border-r border-slate-300">
                        {i.paciente?.primer_apellido}, {i.paciente?.nombre}
                      </td>
                      <td className="px-2 py-0.5 text-[7.5pt] text-slate-600 border-r border-slate-300">
                        {partes}
                      </td>
                      <td className="px-2 py-0.5 text-[7.5pt] text-slate-600">
                        {it.observaciones_sujeciones ?? ''}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Estilos de impresión */}
      <style>{`
        @media print {
          body { margin: 0; }
          .print\\:hidden { display: none !important; }
          .print\\:flex { display: flex !important; }
          .print\\:my-2 { margin-top: 0.5rem !important; margin-bottom: 0.5rem !important; }
          @page {
            size: A4 portrait;
            margin: 0.5cm 0.4cm;
          }
        }
      `}</style>
    </div>
  )
}
