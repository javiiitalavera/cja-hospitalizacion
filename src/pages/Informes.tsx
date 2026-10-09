import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { Search, FileText, LogOut, HeartPulse, Ambulance, ClipboardList, FilePen, ArrowUp, ArrowDown, ArrowUpDown } from 'lucide-react'
import { ESTADO_INGRESO_LABEL as ESTADO_LABEL, ESTADO_INGRESO_COLOR as ESTADO_COLOR, nombreCompleto } from '../types'
import { quitarTildes } from '../lib/busqueda'
import { estaVacio } from '../lib/informesEstado'
import { formatFechaLocal } from '../lib/fechas'

// Los seis tipos de informe que se pueden listar: los dos clásicos del
// médico, el de enfermería y los tres de "Otros informes".
type TipoInforme = 'ingreso' | 'alta' | 'enfermeria' | 'derivacion_urgencias' | 'estado_actual' | 'libre'
type EstadoInforme = 'sin_iniciar' | 'en_elaboracion' | 'cerrado' | 'incompleto'

const TIPOS_OTROS: TipoInforme[] = ['derivacion_urgencias', 'estado_actual', 'libre']

const TIPO_LABEL: Record<TipoInforme, string> = {
  ingreso: 'Ingreso',
  alta: 'Alta',
  enfermeria: 'Enfermería',
  derivacion_urgencias: 'Derivación a urgencias',
  estado_actual: 'Informe clínico',
  libre: 'Informe libre',
}

const TIPO_ESTILO: Record<TipoInforme, { clase: string; Icono: typeof FileText }> = {
  ingreso: { clase: 'bg-primary-50 text-primary-700', Icono: FileText },
  alta: { clase: 'bg-slate-100 text-slate-600', Icono: LogOut },
  enfermeria: { clase: 'bg-emerald-50 text-emerald-700', Icono: HeartPulse },
  derivacion_urgencias: { clase: 'bg-red-50 text-red-700', Icono: Ambulance },
  estado_actual: { clase: 'bg-amber-50 text-amber-700', Icono: ClipboardList },
  libre: { clase: 'bg-violet-50 text-violet-700', Icono: FilePen },
}

const ESTADO_INFORME_LABEL: Record<EstadoInforme, string> = {
  sin_iniciar: 'Sin iniciar',
  en_elaboracion: 'En elaboración',
  cerrado: 'Cerrado',
  incompleto: 'Incompleto',
}

interface InformeRow {
  id: string
  ingresoId: string
  tipo: TipoInforme
  fecha: string | null
  paciente: string
  nhc: string | null
  medico: string
  estadoIngreso: string
  estadoInforme: EstadoInforme
}

// Cuatro estados, según si hay contenido y si el episodio sigue
// abierto — antes solo existían "sin iniciar" y "borrador", así que
// un informe con un solo campo escrito y uno completado del todo se
// veían exactamente igual, y un episodio ya cerrado con el informe
// todavía vacío no se distinguía de uno normal a medio rellenar.
function calcularEstado(fila: Record<string, any>, estadoIngreso: string): EstadoInforme {
  const vacio = estaVacio(fila)
  const cerrado = estadoIngreso !== 'activo'
  if (cerrado) return vacio ? 'incompleto' : 'cerrado'
  return vacio ? 'sin_iniciar' : 'en_elaboracion'
}

// Adónde lleva cada fila: la pestaña de la ficha donde está ese informe.
function rutaInforme(r: InformeRow): string {
  const base = `/ingresos/${r.ingresoId}`
  if (r.tipo === 'ingreso' || r.tipo === 'alta') return `${base}?tab=${r.tipo}`
  if (r.tipo === 'enfermeria') return `${base}?tab=informes&sub=enfermeria`
  return `${base}?tab=informes&sub=otros&informe=${r.id}`
}

type ColumnaOrden = 'tipo' | 'estadoInforme' | 'paciente' | 'nhc' | 'fecha' | 'medico' | 'estadoIngreso'

const COLUMNAS: { clave: ColumnaOrden; titulo: string }[] = [
  { clave: 'tipo', titulo: 'Tipo' },
  { clave: 'estadoInforme', titulo: 'Informe' },
  { clave: 'paciente', titulo: 'Paciente' },
  { clave: 'nhc', titulo: 'NHC' },
  { clave: 'fecha', titulo: 'Fecha' },
  { clave: 'medico', titulo: 'Médico' },
  { clave: 'estadoIngreso', titulo: 'Estado' },
]

// Valor por el que se ordena cada columna.
function valorOrden(r: InformeRow, c: ColumnaOrden): string {
  switch (c) {
    case 'tipo': return TIPO_LABEL[r.tipo]
    case 'estadoInforme': return ESTADO_INFORME_LABEL[r.estadoInforme]
    case 'paciente': return r.paciente
    case 'nhc': return r.nhc ?? ''
    case 'fecha': return r.fecha ?? ''
    case 'medico': return r.medico === '—' ? '' : r.medico
    case 'estadoIngreso': return ESTADO_LABEL[r.estadoIngreso] ?? r.estadoIngreso
  }
}

export function Informes() {
  const navigate = useNavigate()
  const [loading, setLoading] = useState(true)
  const [informes, setInformes] = useState<InformeRow[]>([])
  const [posibleTruncado, setPosibleTruncado] = useState(false)
  const [fallos, setFallos] = useState<string[]>([])
  const [anios, setAnios] = useState<number[]>([])
  const [filtroAnio, setFiltroAnio] = useState<string>('todos')
  // 'todos', un tipo concreto, o 'otros' (los tres de "Otros informes").
  const [filtroTipo, setFiltroTipo] = useState<'todos' | 'otros' | TipoInforme>('todos')
  const [busqueda, setBusqueda] = useState('')
  const [orden, setOrden] = useState<{ columna: ColumnaOrden; asc: boolean }>({ columna: 'fecha', asc: false })

  useEffect(() => { fetchInformes() }, [])

  async function fetchInformes() {
    setLoading(true)
    try {
      const ingresoSelect = (extra: string) => `ingreso:ingresos(id, ${extra}estado,
              medico_responsable:profesionales(nombre, apellidos),
              paciente:pacientes(nombre, primer_apellido, segundo_apellido, nhc))`
      const [rIng, rAlta, rEnf, rPunt] = await Promise.all([
        supabase.from('informe_ingreso').select(`*, ${ingresoSelect('fecha_ingreso, ')}`).limit(2000), // tope de seguridad: esta pantalla no pagina todavía
        supabase.from('informe_alta').select(`*, ${ingresoSelect('fecha_alta, fecha_ingreso, ')}`).limit(2000),
        supabase.from('informe_enfermeria').select(`id, campos, created_at, ${ingresoSelect('')}`).limit(2000),
        supabase.from('informes_puntuales').select(`id, plantilla, campos, created_at, ${ingresoSelect('')}`).limit(2000),
      ])

      // Si una de las consultas falla (por ejemplo, una migración aún sin
      // ejecutar), el resto del listado se sigue viendo y se avisa de cuál falta.
      const fallosNuevos: string[] = []
      if (rIng.error) fallosNuevos.push('informes de ingreso')
      if (rAlta.error) fallosNuevos.push('informes de alta')
      if (rEnf.error) fallosNuevos.push('informes de enfermería')
      if (rPunt.error) fallosNuevos.push('otros informes')
      setFallos(fallosNuevos)

      const rows: InformeRow[] = []
      const comunes = (i: any) => ({
        ingresoId: i.id as string,
        paciente: nombreCompleto(i.paciente),
        nhc: (i.paciente.nhc ?? null) as string | null,
        medico: i.medico_responsable ? `${i.medico_responsable.nombre} ${i.medico_responsable.apellidos}` : '—',
        estadoIngreso: i.estado as string,
      })

      ;(rIng.data ?? []).forEach((r: any) => {
        const i = r.ingreso
        if (!i?.paciente) return
        rows.push({ ...comunes(i), id: r.id, tipo: 'ingreso', fecha: i.fecha_ingreso, estadoInforme: calcularEstado(r, i.estado) })
      })

      ;(rAlta.data ?? []).forEach((r: any) => {
        const i = r.ingreso
        if (!i?.paciente) return
        rows.push({
          ...comunes(i),
          id: r.id,
          tipo: 'alta',
          // Sin ".. ?? i.fecha_ingreso": un informe de alta que todavía
          // no se ha cerrado no tiene fecha de alta de verdad — antes
          // se sustituía por la fecha de ingreso, que no es la fecha
          // de este informe, es la del otro.
          fecha: i.fecha_alta ?? null,
          estadoInforme: calcularEstado(r, i.estado),
        })
      })

      // Enfermería y "Otros informes": la fecha es la de creación del
      // informe, y el contenido vive dentro de "campos".
      ;(rEnf.data ?? []).forEach((r: any) => {
        const i = r.ingreso
        if (!i?.paciente) return
        rows.push({ ...comunes(i), id: r.id, tipo: 'enfermeria', fecha: formatFechaLocal(new Date(r.created_at)), estadoInforme: calcularEstado(r.campos ?? {}, i.estado) })
      })

      ;(rPunt.data ?? []).forEach((r: any) => {
        const i = r.ingreso
        if (!i?.paciente || !TIPOS_OTROS.includes(r.plantilla)) return
        rows.push({ ...comunes(i), id: r.id, tipo: r.plantilla, fecha: formatFechaLocal(new Date(r.created_at)), estadoInforme: calcularEstado(r.campos ?? {}, i.estado) })
      })

      setInformes(rows)
      setPosibleTruncado([rIng, rAlta, rEnf, rPunt].some((r) => (r.data?.length ?? 0) >= 2000))
      const aniosDisponibles = [...new Set(rows.filter(r => r.fecha).map(r => new Date(r.fecha!).getFullYear()))]
        .sort((a, b) => b - a)
      setAnios(aniosDisponibles)
    } finally {
      setLoading(false)
    }
  }

  function ordenarPor(columna: ColumnaOrden) {
    // Mismo criterio que en Pacientes: al pulsar otra columna, empieza
    // ascendente (la fecha, descendente: lo más reciente primero);
    // al pulsar la misma, se invierte.
    setOrden((o) => o.columna === columna ? { columna, asc: !o.asc } : { columna, asc: columna !== 'fecha' })
  }

  let lista = informes
  if (filtroAnio !== 'todos') {
    lista = lista.filter(r => r.fecha && new Date(r.fecha).getFullYear() === Number(filtroAnio))
  }
  if (filtroTipo === 'otros') {
    lista = lista.filter(r => TIPOS_OTROS.includes(r.tipo))
  } else if (filtroTipo !== 'todos') {
    lista = lista.filter(r => r.tipo === filtroTipo)
  }
  if (busqueda.trim()) {
    const q = quitarTildes(busqueda.trim().toLowerCase())
    lista = lista.filter(r =>
      quitarTildes(r.paciente.toLowerCase()).includes(q) ||
      (r.nhc ?? '').toLowerCase().includes(q)
    )
  }
  lista = [...lista].sort((a, b) => {
    const va = valorOrden(a, orden.columna)
    const vb = valorOrden(b, orden.columna)
    // Lo que no tiene valor (p. ej. un alta sin fecha) va siempre al final,
    // sea cual sea el sentido.
    if (!va && !vb) return 0
    if (!va) return 1
    if (!vb) return -1
    const c = va.localeCompare(vb, 'es', { numeric: true, sensitivity: 'base' })
    return orden.asc ? c : -c
  })

  return (
    <div className="p-6 md:p-8">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-slate-800">Informes</h1>
        <p className="text-sm text-slate-500 mt-0.5">
          {loading ? '…' : `${lista.length} informe${lista.length !== 1 ? 's' : ''}`} · historial de informes de ingreso, alta, enfermería y otros
        </p>
        {posibleTruncado && (
          <p className="text-xs text-amber-600 bg-amber-50 border border-amber-100 rounded-lg px-3 py-1.5 mt-2 inline-block">
            El historial es muy grande: puede que falten los informes más antiguos. Filtra por año para acotar la búsqueda.
          </p>
        )}
        {fallos.length > 0 && (
          <p className="text-xs text-red-600 bg-red-50 border border-red-100 rounded-lg px-3 py-1.5 mt-2 block w-fit">
            No se han podido cargar: {fallos.join(', ')}. El resto del listado sí es correcto.
          </p>
        )}
      </div>

      <div className="flex gap-3 mb-5 flex-wrap items-center">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
          <input
            className="input pl-9"
            placeholder="Buscar por paciente o NHC…"
            value={busqueda}
            onChange={e => setBusqueda(e.target.value)}
          />
        </div>

        <select className="input py-2 text-sm w-auto" value={filtroAnio} onChange={e => setFiltroAnio(e.target.value)}>
          <option value="todos">Todos los años</option>
          {anios.map(a => <option key={a} value={a}>{a}</option>)}
        </select>

        <select
          className="input py-2 text-sm w-auto"
          aria-label="Tipo de informe"
          value={filtroTipo}
          onChange={e => setFiltroTipo(e.target.value as typeof filtroTipo)}
        >
          <option value="todos">Todos los tipos</option>
          <option value="ingreso">Informes de ingreso</option>
          <option value="alta">Informes de alta</option>
          <option value="enfermeria">Informes de enfermería</option>
          <option value="otros">Otros informes (todos)</option>
          {TIPOS_OTROS.map(t => <option key={t} value={t}>— {TIPO_LABEL[t]}</option>)}
        </select>
      </div>

      <div className="card overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b bg-slate-50">
              {COLUMNAS.map(({ clave, titulo }) => {
                const activa = orden.columna === clave
                const Flecha = !activa ? ArrowUpDown : orden.asc ? ArrowUp : ArrowDown
                return (
                  <th
                    key={clave}
                    aria-sort={activa ? (orden.asc ? 'ascending' : 'descending') : 'none'}
                    className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide"
                  >
                    <button
                      type="button"
                      data-orden={clave}
                      onClick={() => ordenarPor(clave)}
                      className={`inline-flex items-center gap-1 uppercase tracking-wide hover:text-slate-800 ${activa ? 'text-slate-800' : 'text-slate-500'}`}
                    >
                      {titulo}
                      <Flecha className={`w-3 h-3 ${activa ? '' : 'opacity-40'}`} />
                    </button>
                  </th>
                )
              })}
            </tr>
          </thead>
          <tbody className="divide-y">
            {loading ? (
              <tr><td colSpan={7} className="px-4 py-12 text-center text-slate-500">Cargando…</td></tr>
            ) : lista.length === 0 ? (
              <tr><td colSpan={7} className="px-4 py-12 text-center text-slate-500">No hay informes con estos filtros.</td></tr>
            ) : lista.map(r => {
              const { clase, Icono } = TIPO_ESTILO[r.tipo]
              return (
                <tr key={`${r.tipo}-${r.id}`}
                  className="hover:bg-slate-50 transition-colors cursor-pointer"
                  onClick={() => navigate(rutaInforme(r))}>
                  <td className="px-4 py-3">
                    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium whitespace-nowrap ${clase}`}>
                      <Icono className="w-3 h-3" />
                      {TIPO_LABEL[r.tipo]}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    {/* Cuatro estados: vacío o con contenido, cruzado
                        con si el episodio sigue activo o ya se cerró —
                        antes un informe recién creado y uno terminado
                        se veían igual, y un episodio cerrado con el
                        informe vacío no se distinguía de uno normal a
                        medio rellenar. */}
                    <span className={`text-xs font-medium ${
                      r.estadoInforme === 'sin_iniciar' ? 'text-slate-500 italic'
                      : r.estadoInforme === 'en_elaboracion' ? 'text-amber-600'
                      : r.estadoInforme === 'cerrado' ? 'text-emerald-600'
                      : 'text-red-600 font-semibold'
                    }`}>
                      {ESTADO_INFORME_LABEL[r.estadoInforme]}
                    </span>
                  </td>
                  <td className="px-4 py-3 font-medium text-slate-800">{r.paciente}</td>
                  <td className="px-4 py-3 text-slate-500 text-xs font-mono">{r.nhc || <span className="text-slate-400">—</span>}</td>
                  <td className="px-4 py-3 text-slate-500 text-xs">
                    {r.fecha ? new Date(r.fecha).toLocaleDateString('es-ES') : '—'}
                  </td>
                  <td className="px-4 py-3 text-slate-500 text-xs">{r.medico}</td>
                  <td className="px-4 py-3">
                    <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${ESTADO_COLOR[r.estadoIngreso] ?? 'bg-slate-100 text-slate-500'}`}>
                      {ESTADO_LABEL[r.estadoIngreso] ?? r.estadoIngreso}
                    </span>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </div>
  )
}
