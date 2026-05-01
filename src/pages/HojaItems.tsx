import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import type { Ingreso, ItemsPaciente } from '../types'
import { Printer } from 'lucide-react'

type IngresoConItems = Ingreso & { items: ItemsPaciente | null }

const SUJECION_SHORT: Record<string, string> = {
  normal: '—', una_barra: '1B', dos_barras: '2B',
  sujecion_fisica: 'SF', sensor_presion: 'SP', cota_cero: 'C0',
}

function sujecionStr(arr: string[] | null) {
  if (!arr || arr.length === 0) return '—'
  return arr.map(x => SUJECION_SHORT[x] ?? x).join('+')
}

export default function HojaItems() {
  const [data, setData] = useState<IngresoConItems[]>([])
  const [loading, setLoading] = useState(true)
  const today = new Date().toLocaleDateString('es-ES', {
    weekday: 'long', day: 'numeric', month: 'long', year: 'numeric'
  })

  useEffect(() => {
    async function fetch() {
      const { data: ingresos } = await supabase
        .from('ingresos')
        .select(`*, paciente:pacientes(nombre, primer_apellido), medico_responsable:profesionales(nombre), items:items_paciente(*)`)
        .eq('estado', 'activo')
        .order('habitacion', { ascending: true })

      setData((ingresos ?? []).map(i => ({ ...i, items: i.items?.[0] ?? null })) as IngresoConItems[])
      setLoading(false)
    }
    fetch()
  }, [])

  if (loading) return <div className="p-8 text-slate-400">Cargando…</div>

  return (
    <div className="p-6">
      {/* Header */}
      <div className="flex items-center justify-between mb-5 print:hidden">
        <div>
          <h1 className="text-2xl font-bold text-slate-800">Hoja de ítems</h1>
          <p className="text-sm text-slate-400 capitalize">{today}</p>
        </div>
        <button onClick={() => window.print()} className="btn-secondary">
          <Printer className="w-4 h-4" />
          Imprimir
        </button>
      </div>

      {/* Print header */}
      <div className="hidden print:flex justify-between items-center mb-4 text-xs">
        <span className="font-bold text-lg">HOJA DE ÍTEMS — CJA Hospitalización</span>
        <span className="capitalize">{today}</span>
      </div>

      {/* Table */}
      <div className="overflow-x-auto">
        <table className="w-full text-xs border-collapse">
          <thead>
            <tr className="bg-slate-800 text-white">
              <th className="border border-slate-600 px-2 py-1.5 text-left w-8">Hab.</th>
              <th className="border border-slate-600 px-2 py-1.5 text-left w-28">Paciente</th>
              <th className="border border-slate-600 px-2 py-1.5 w-12">Médico</th>
              <th className="border border-slate-600 px-2 py-1.5 w-8">Dep.</th>
              <th className="border border-slate-600 px-2 py-1.5 w-10">Pañal D</th>
              <th className="border border-slate-600 px-2 py-1.5 w-10">Pañal N</th>
              <th className="border border-slate-600 px-2 py-1.5 w-12">Dentadura</th>
              <th className="border border-slate-600 px-2 py-1.5 w-10">Audíf.</th>
              <th className="border border-slate-600 px-2 py-1.5 w-10">Gafas</th>
              <th className="border border-slate-600 px-2 py-1.5 w-10">Higiene</th>
              <th className="border border-slate-600 px-2 py-1.5 w-10">Ducha</th>
              <th className="border border-slate-600 px-2 py-1.5 w-16">Deambulación</th>
              <th className="border border-slate-600 px-2 py-1.5 w-16">Ayudas</th>
              <th className="border border-slate-600 px-2 py-1.5 w-10">Ingestas</th>
              <th className="border border-slate-600 px-2 py-1.5 w-16">Suj. cama</th>
              <th className="border border-slate-600 px-2 py-1.5 w-12">Sensor</th>
              <th className="border border-slate-600 px-2 py-1.5">Observaciones</th>
            </tr>
          </thead>
          <tbody>
            {data.map((i, idx) => {
              const it = i.items
              const apellido = i.paciente?.primer_apellido ?? '—'
              const nombre = i.paciente?.nombre ?? ''
              const medico = i.medico_responsable?.nombre?.toUpperCase() ?? '—'
              return (
                <tr key={i.id} className={idx % 2 === 0 ? 'bg-white' : 'bg-slate-50'}>
                  <td className="border border-slate-200 px-2 py-1 font-bold text-center text-primary-700">
                    {i.habitacion ?? '—'}
                  </td>
                  <td className="border border-slate-200 px-2 py-1 font-medium">
                    {apellido}, {nombre}
                  </td>
                  <td className="border border-slate-200 px-2 py-1 text-center">{medico}</td>
                  <td className="border border-slate-200 px-2 py-1 text-center">{it?.dependencia_avd ?? '—'}</td>
                  <td className="border border-slate-200 px-2 py-1 text-center">{it?.panial_dia ?? '—'}</td>
                  <td className="border border-slate-200 px-2 py-1 text-center">{it?.panial_noche ?? '—'}</td>
                  <td className="border border-slate-200 px-2 py-1 text-center">{it?.dentadura ?? '—'}</td>
                  <td className="border border-slate-200 px-2 py-1 text-center">{it?.audifonos ?? '—'}</td>
                  <td className="border border-slate-200 px-2 py-1 text-center">
                    {it?.gafas === 'si' ? 'Sí' : it?.gafas === 'solo_tv' ? 'TV' : '—'}
                  </td>
                  <td className="border border-slate-200 px-2 py-1 text-center">
                    {it?.higiene === 'lavabo' ? 'L' : it?.higiene === 'cama' ? 'C' : '—'}
                  </td>
                  <td className="border border-slate-200 px-2 py-1 text-center">
                    {it?.ducha === 'pie' ? 'P' : it?.ducha === 'sentado' ? 'S' : '—'}
                  </td>
                  <td className="border border-slate-200 px-2 py-1 text-center">{it?.deambulacion ?? '—'}</td>
                  <td className="border border-slate-200 px-2 py-1 text-center">
                    {it?.ayudas_deambulacion?.replace('andador_', 'And.').replace('silla_ruedas', 'SR').replace('baston', 'Bast.') ?? '—'}
                  </td>
                  <td className="border border-slate-200 px-2 py-1 text-center">
                    {it?.ingestas === 'autonomo' ? 'A' : it?.ingestas === 'dependiente' ? 'D' : '—'}
                  </td>
                  <td className="border border-slate-200 px-2 py-1 text-center">
                    {sujecionStr(it?.sujecion_cama ?? [])}
                  </td>
                  <td className="border border-slate-200 px-2 py-1 text-center">
                    {it?.sensor_cama ? 'X' : '—'}
                  </td>
                  <td className="border border-slate-200 px-2 py-1 text-slate-500">
                    {it?.observaciones_sujeciones ?? ''}
                  </td>
                </tr>
              )
            })}
            {data.length === 0 && (
              <tr>
                <td colSpan={17} className="border border-slate-200 px-4 py-8 text-center text-slate-400">
                  No hay pacientes ingresados
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {/* Print styles */}
      <style>{`
        @media print {
          body { font-size: 9px; }
          table { font-size: 8px; }
          .print\\:hidden { display: none !important; }
          .print\\:flex { display: flex !important; }
          @page { size: A4 landscape; margin: 1cm; }
        }
      `}</style>
    </div>
  )
}
