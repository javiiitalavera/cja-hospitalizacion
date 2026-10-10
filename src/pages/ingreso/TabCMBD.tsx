import { useEffect, useRef, useState } from 'react'
import { Cargando } from '../../components/Cargando'
import { supabase } from '../../lib/supabase'
import { AvisoGuardado } from '../../components/AvisoGuardado'
import type { Ingreso } from '../../types'
import { nombreCompleto } from '../../types'
import { edad } from '../../lib/fechas'
import { estadoSegunCircunstancia } from '../../lib/alta'
import { infoCIE10, useCatalogoCIE10 } from '../../lib/cie10'
import { FilaDx } from '../../components/DiagnosticosCIE'
import { CheckCircle, Circle, Download, Save } from 'lucide-react'

const N_SECUNDARIOS = 8
const N_PROCEDIMIENTOS = 8

// Códigos verificados contra documentación oficial del Ministerio de Sanidad
// (Tipo de Alta / TIPOALTA): 1.Domicilio 2.Traslado a otro hospital
// 3.Alta voluntaria 4.Éxitus 5.Traslado a centro sociosanitario 9.Otros/desconocido.
// "Fuga" no tiene código propio en la norma estatal consultada; se deja bajo
// "Otros" (9) — conviene confirmarlo con administración antes de usarlo en serio.
const TIPALT: Record<string, string> = {
  '1': '1 — Domicilio',
  '2': '2 — Traslado a otro hospital',
  '3': '3 — Alta voluntaria',
  '4': '4 — Éxitus',
  '5': '5 — Traslado a centro sociosanitario',
  '9': '9 — Otras circunstancias / fuga / desconocido',
}

const PROCEDENCIA: Record<string, string> = {
  '10': '10 — Atención Primaria',
  '30': '30 — Traslado desde otro hospital/centro',
}

// ─── HELPERS ─────────────────────────────────────────────────

function fmtFecha(iso?: string) {
  if (!iso) return ''
  // ddmmaaaa. Se parsea el texto directamente (AAAA-MM-DD), sin pasar
  // por un objeto Date: así no hay ninguna conversión de zona horaria
  // de por medio que pueda desplazar el día.
  const [aaaa, mm, dd] = iso.split('-')
  if (!aaaa || !mm || !dd) return ''
  return `${dd}${mm}${aaaa}`
}

function fmtSexo(sexo?: string) {
  return sexo === 'hombre' ? '1' : sexo === 'mujer' ? '2' : ''
}

// ─── FILA PROCEDIMIENTO ───────────────────────────────────────

function FilaProc({ label, codigo, desc, onCodigo, onDesc }: {
  label: string; codigo: string; desc: string
  onCodigo: (v: string) => void; onDesc: (v: string) => void
}) {
  return (
    <div className="grid grid-cols-[9rem_1fr] gap-3 items-start">
      <span className="text-xs text-slate-500 pt-2.5 shrink-0">{label}</span>
      <div className="space-y-1.5">
        <input className="input text-sm font-mono" placeholder="Código procedimiento…"
          value={codigo} onChange={e => onCodigo(e.target.value.toUpperCase())} />
        {codigo && (
          <input className="input text-xs text-slate-500" placeholder="Descripción"
            value={desc} onChange={e => onDesc(e.target.value)} />
        )}
      </div>
    </div>
  )
}

// ─── TIPOS ───────────────────────────────────────────────────

interface CMBDData {
  id?: string
  version?: number
  diagnostico_principal?: string; diagnostico_principal_desc?: string; diagnostico_principal_poad?: boolean
  diagnostico_secundario_1?: string; diagnostico_secundario_1_desc?: string; diagnostico_secundario_1_poad?: boolean
  diagnostico_secundario_2?: string; diagnostico_secundario_2_desc?: string; diagnostico_secundario_2_poad?: boolean
  diagnostico_secundario_3?: string; diagnostico_secundario_3_desc?: string; diagnostico_secundario_3_poad?: boolean
  diagnostico_secundario_4?: string; diagnostico_secundario_4_desc?: string; diagnostico_secundario_4_poad?: boolean
  diagnostico_secundario_5?: string; diagnostico_secundario_5_desc?: string; diagnostico_secundario_5_poad?: boolean
  diagnostico_secundario_6?: string; diagnostico_secundario_6_desc?: string; diagnostico_secundario_6_poad?: boolean
  diagnostico_secundario_7?: string; diagnostico_secundario_7_desc?: string; diagnostico_secundario_7_poad?: boolean
  diagnostico_secundario_8?: string; diagnostico_secundario_8_desc?: string; diagnostico_secundario_8_poad?: boolean
  procedimiento_1?: string; procedimiento_1_desc?: string
  procedimiento_2?: string; procedimiento_2_desc?: string
  procedimiento_3?: string; procedimiento_3_desc?: string
  procedimiento_4?: string; procedimiento_4_desc?: string
  procedimiento_5?: string; procedimiento_5_desc?: string
  procedimiento_6?: string; procedimiento_6_desc?: string
  procedimiento_7?: string; procedimiento_7_desc?: string
  procedimiento_8?: string; procedimiento_8_desc?: string
  circunstancia_alta?: string
  procedencia?: string
  servicio?: string
  notas?: string
  completado?: boolean
}

// ─── EXPORTACIÓN EXCEL ───────────────────────────────────────

async function exportarExcel(data: CMBDData, ingreso: Ingreso | null) {
  // Import dinámico del paquete LOCAL (ya no de un CDN externo): Vite lo
  // empaqueta como un archivo aparte, así que solo se descarga cuando
  // alguien realmente exporta un CMBD, sin depender de que un servidor
  // externo esté disponible en ese momento.
  const XLSX = await import('xlsx')

  const p = ingreso?.paciente as any

  // Construir fila CMBD exactamente con las columnas del formato oficial
  const fila: Record<string, any> = {
    id: '',
    TIP_CIP: '2',
    CIP: p?.cipna ?? '',
    HISTORIA: p?.nhc ?? '',
    FECNAC: fmtFecha(p?.fecha_nacimiento),
    SEXO: fmtSexo(p?.sexo),
    PAIS_NAC: '3166-2',
    RESIDE_CP: '',
    RESIDE_MUNI: '',
    REGFIN: '1',
    FECINICONT: fmtFecha(ingreso?.fecha_ingreso),
    FECINGHOSP: '',
    TIPCONT: '1',
    TIPVISITA: '',
    PROCEDENCIA: data.procedencia ?? '',
    CIRCONT: '2',
    SERVICIO: data.servicio ?? 'GRT',
    FECFINCONT: fmtFecha(ingreso?.fecha_alta),
    TIPALT: data.circunstancia_alta ?? '',
    DISPOSITIVO_CONTINUIDAD: '1',
    FECINT: '',
    UCI: '2',
    DIAS_UCI: '0',
    // Diagnóstico principal
    D1: data.diagnostico_principal ?? '',
    POAD1: data.diagnostico_principal_poad === true ? 'Si' : data.diagnostico_principal ? 'No' : '',
  }

  // Diagnósticos secundarios D2-D9
  for (let i = 1; i <= 8; i++) {
    const cod = (data as any)[`diagnostico_secundario_${i}`] ?? ''
    const poad = (data as any)[`diagnostico_secundario_${i}_poad`]
    fila[`D${i + 1}`] = cod
    fila[`POAD${i + 1}`] = cod ? (poad === true ? 'Si' : 'No') : ''
  }

  // Diagnósticos vacíos D10-D21
  for (let i = 10; i <= 21; i++) {
    fila[`D${i}`] = ''
    fila[`POAD${i}`] = ''
  }

  // Procedimientos PROC1-PROC20
  for (let i = 1; i <= 20; i++) {
    fila[`PROC${i}`] = i <= 8 ? ((data as any)[`procedimiento_${i}`] ?? '') : ''
  }

  // Procedimientos externos y morfología — siempre vacíos
  for (let i = 1; i <= 6; i++) fila[`PROEXT${i}`] = ''
  for (let i = 1; i <= 6; i++) fila[`M${i}`] = '0'

  fila['CEN_SAN'] = '310142'
  fila['CCAA'] = '15'

  const ws = XLSX.utils.json_to_sheet([fila])
  const wb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(wb, ws, 'Datos CMBD')

  const apellidos = p ? `${p.primer_apellido}_${p.segundo_apellido ?? ''}`.replace(/_$/, '') : 'paciente'
  XLSX.writeFile(wb, `CMBD_${apellidos}_${ingreso?.fecha_alta ?? 'alta'}.xlsx`)
}

// ─── TAB PRINCIPAL ────────────────────────────────────────────

export function TabCMBD({ ingresoId, ingreso }: { ingresoId: string; ingreso: Ingreso | null }) {
  const [data, setData] = useState<CMBDData>({ servicio: 'GRT' })
  const [loading, setLoading] = useState(true)
  const [estado, setEstado] = useState<'inactivo' | 'pendiente' | 'guardando' | 'guardado' | 'error' | 'conflicto'>('inactivo')
  const [exportando, setExportando] = useState(false)
  const [errorFaltantes, setErrorFaltantes] = useState<string[]>([])
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const dataRef = useRef(data)
  // Si hay un código fuera de los frecuentes, hay que cargar el catálogo completo para saber si está
  // exento de POAD; al terminar de cargar, este componente se repinta y el resumen de «falta» se corrige.
  useCatalogoCIE10(
    ['diagnostico_principal', ...Array.from({ length: N_SECUNDARIOS }, (_, i) => `diagnostico_secundario_${i + 1}`)]
      .some((k) => { const c = (data as any)[k] as string | undefined; return !!c && !infoCIE10(c) }),
  )
  dataRef.current = data
  const saveSeqRef = useRef(0)

  useEffect(() => {
    async function cargar() {
      try {
        const { data: d } = await supabase.from('cmbd').select('*').eq('ingreso_id', ingresoId).maybeSingle()
        if (d) setData(d as CMBDData)
      } finally {
        setLoading(false)
      }
    }
    cargar()
  }, [ingresoId])

  async function save(d = dataRef.current): Promise<boolean> {
    const miSecuencia = ++saveSeqRef.current
    setEstado('guardando')

    // Un ingreso recién creado todavía no tiene fila en cmbd — antes
    // esto se trataba siempre como un UPDATE, que sobre una fila
    // inexistente no actualiza nada y se veía como un falso conflicto
    // de concurrencia en el primer guardado de cada ingreso nuevo.
    if (!d.id) {
      const { id, version, ...campos } = d as any
      const { data: creado, error } = await supabase
        .from('cmbd')
        .insert({ ingreso_id: ingresoId, ...campos })
        .select()
        .maybeSingle()
      if (miSecuencia !== saveSeqRef.current) return true
      if (error) {
        // Si otra sesión se adelantó de verdad (misma restricción
        // única ingreso_id), se recarga la fila real en vez de
        // insistir en crear una segunda.
        if (error.code === '23505') {
          await recargarTrasConflicto()
          setEstado('conflicto')
          return false
        }
        setEstado('error')
        return false
      }
      setData(creado as CMBDData)
      setEstado('guardado')
      setTimeout(() => setEstado((e) => (e === 'guardado' ? 'inactivo' : e)), 2500)
      return true
    }

    // Antes usaba upsert(); ahora es un update() con la versión que
    // se leyó — si alguien más ha guardado mientras tanto, esta
    // actualización no encuentra ninguna fila y avisa, en vez de
    // pisar el cambio de la otra persona en silencio.
    const { data: guardado, error } = await supabase
      .from('cmbd')
      .update(d)
      .eq('ingreso_id', ingresoId)
      .eq('version', (d as any).version ?? 1)
      .select()
      .maybeSingle()
    if (miSecuencia !== saveSeqRef.current) return true
    if (error) { setEstado('error'); return false }
    if (!guardado) { setEstado('conflicto'); return false }
    setData(guardado as CMBDData)
    setEstado('guardado')
    setTimeout(() => setEstado((e) => (e === 'guardado' ? 'inactivo' : e)), 2500)
    return true
  }

  async function recargarTrasConflicto() {
    const { data: d } = await supabase.from('cmbd').select('*').eq('ingreso_id', ingresoId).maybeSingle()
    if (d) setData(d as CMBDData)
    setEstado('inactivo')
  }

  function update<K extends keyof CMBDData>(key: K, value: CMBDData[K]) {
    if (estado === 'conflicto') return
    setErrorFaltantes([])
    const next = { ...dataRef.current, [key]: value }
    setData(next)
    setEstado('pendiente')
    if (debounceRef.current) clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(() => save(next), 1500)
  }

  // Para cuando dos campos cambian a la vez (código y descripción de
  // un CIE-10, por ejemplo) — llamar a update() dos veces seguidas
  // hacía que la segunda pisara a la primera, porque las dos partían
  // del mismo dataRef.current "antes de guardar" (el mismo fallo que
  // ya apareció una vez con GDS y FAST). Con una sola actualización
  // que aplica los dos campos juntos, no hay ninguna ventana en la
  // que uno se pierda.
  function updateFields(cambios: Partial<CMBDData>) {
    if (estado === 'conflicto') return
    setErrorFaltantes([])
    const next = { ...dataRef.current, ...cambios }
    setData(next)
    setEstado('pendiente')
    if (debounceRef.current) clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(() => save(next), 1500)
  }

  function updateDx(n: number, field: 'code' | 'desc' | 'poad', value: any) {
    if (n === 0) {
      if (field === 'code') update('diagnostico_principal', value)
      else if (field === 'desc') update('diagnostico_principal_desc', value)
      else update('diagnostico_principal_poad', value)
    } else {
      if (field === 'code') update(`diagnostico_secundario_${n}` as keyof CMBDData, value)
      else if (field === 'desc') update(`diagnostico_secundario_${n}_desc` as keyof CMBDData, value)
      else update(`diagnostico_secundario_${n}_poad` as keyof CMBDData, value)
    }
  }

  // Específica para cuando el buscador de CIE-10 devuelve código y
  // descripción a la vez — una sola actualización, no dos update()
  // seguidos que puedan pisarse entre sí.
  function updateDxCodigoYDesc(n: number, codigo: string, desc: string) {
    if (n === 0) {
      updateFields({ diagnostico_principal: codigo, diagnostico_principal_desc: desc })
    } else {
      updateFields({
        [`diagnostico_secundario_${n}`]: codigo,
        [`diagnostico_secundario_${n}_desc`]: desc,
      } as Partial<CMBDData>)
    }
  }

  function updateProc(n: number, field: 'code' | 'desc', value: string) {
    if (field === 'code') update(`procedimiento_${n}` as keyof CMBDData, value)
    else update(`procedimiento_${n}_desc` as keyof CMBDData, value)
  }

  function camposFaltantes(fuente: Partial<CMBDData> = data): string[] {
    const faltan: string[] = []
    const pac = ingreso?.paciente as any
    // Datos del paciente que el fichero necesita y que salían en blanco sin avisar: antes el CMBD
    // podía darse por «completo» con el sexo vacío (o «otro», que no tiene código) y sin fecha de nacimiento.
    if (!pac?.fecha_nacimiento) faltan.push('Fecha de nacimiento del paciente')
    if (pac?.sexo !== 'hombre' && pac?.sexo !== 'mujer') faltan.push('Sexo del paciente (el CMBD solo admite varón o mujer)')
    if (!ingreso?.fecha_alta) faltan.push('Fecha de alta')
    if (!fuente.procedencia) faltan.push('Procedencia')
    if (!fuente.circunstancia_alta) faltan.push('Motivo del alta')
    else if (ingreso && ingreso.estado !== 'activo' && estadoSegunCircunstancia(fuente.circunstancia_alta) !== ingreso.estado) {
      faltan.push('Motivo del alta (el guardado no corresponde al estado del episodio)')
    }
    if (!fuente.diagnostico_principal) faltan.push('Diagnóstico principal')
    // POAD: cada diagnóstico codificado tiene que tener respuesta explícita (SÍ/NO), salvo los
    // códigos exentos. Sin esto, un diagnóstico sin contestar se exportaba como «No» (adquirido
    // en el hospital) aunque nadie lo hubiera dicho.
    const sinPoad: string[] = []
    for (let n = 0; n <= N_SECUNDARIOS; n++) {
      const k = n === 0 ? 'diagnostico_principal' : `diagnostico_secundario_${n}`
      const codigo = (fuente as any)[k] as string | undefined
      if (!codigo) continue
      if ((fuente as any)[`${k}_poad`] == null && !infoCIE10(codigo)?.marcas?.includes('E')) sinPoad.push(codigo)
    }
    if (sinPoad.length > 0) faltan.push(`«Al ingreso» (SÍ/NO) sin contestar en: ${sinPoad.join(', ')}`)
    return faltan
  }

  // Igual que handleExportar: cancela el guardado automático pendiente
  // antes de guardar a mano — si no, el debounce de 1,5s podía
  // dispararse justo después con una versión ya desactualizada y
  // mostrar un conflicto contra la propia sesión de quien guarda.
  async function handleGuardar() {
    if (debounceRef.current) { clearTimeout(debounceRef.current); debounceRef.current = null }
    await save(dataRef.current)
  }

  async function handleExportar() {
    const faltan = camposFaltantes(dataRef.current)
    if (faltan.length > 0) {
      // Antes se podía generar un Excel incompleto sin avisar — con
      // esto, ni siquiera se intenta si faltan los campos mínimos.
      setErrorFaltantes(faltan)
      return
    }
    setErrorFaltantes([])
    // Si había un guardado automático pendiente (el debounce de 1,5s
    // tras el último cambio), se cancela aquí — de lo contrario podía
    // dispararse justo después de este guardado manual y toparse con
    // una versión ya desactualizada, mostrando un conflicto contra la
    // propia sesión de quien exporta.
    if (debounceRef.current) { clearTimeout(debounceRef.current); debounceRef.current = null }
    setExportando(true)
    const ok = await save()
    if (ok) await exportarExcel(dataRef.current, ingreso)
    setExportando(false)
  }

  const p = ingreso?.paciente as any
  const nombreDelPaciente = p ? nombreCompleto(p) : '—'
  const edadPaciente = edad(p?.fecha_nacimiento)

  if (loading) return <Cargando />

  return (
    <div className="max-w-2xl space-y-6">
      <AvisoGuardado avisos={[{ estado, etiqueta: 'CMBD' }]} />

      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-sm font-bold text-slate-700 uppercase tracking-wide">CMBD · Conjunto Mínimo Básico de Datos</h2>
          <p className="text-xs text-slate-500 mt-0.5">Registro al alta · {nombreDelPaciente}</p>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-xs text-slate-500">
            {estado === 'pendiente' && '● Cambios pendientes'}
            {estado === 'guardando' && '● Guardando…'}
            {estado === 'guardado' && <span className="text-emerald-600">✓ Guardado</span>}
            {estado === 'error' && <span className="text-red-600 font-semibold">✗ Error al guardar</span>}
          </span>
          <button type="button" onClick={handleGuardar} className="btn-secondary text-xs py-1.5">
            <Save className="w-3.5 h-3.5" /> Guardar
          </button>
          <button type="button" onClick={handleExportar} disabled={exportando}
            className="btn-primary text-xs py-1.5 disabled:opacity-60">
            <Download className="w-3.5 h-3.5" />
            {exportando ? 'Generando…' : 'Exportar Excel'}
          </button>
        </div>
      </div>

      {estado === 'conflicto' && (
        <div className="bg-amber-50 border border-amber-200 text-amber-800 text-sm rounded-lg px-4 py-3 flex items-center justify-between gap-3">
          <span>Alguien más ha guardado cambios en el CMBD mientras lo editabas. Lo que has escrito sigue aquí, sin guardar todavía.</span>
          <button onClick={recargarTrasConflicto} className="btn-secondary text-xs shrink-0">Ver la versión más reciente</button>
        </div>
      )}

      {/* Datos del episodio — pre-rellenados */}
      <div className="card p-5 space-y-2">
        <p className="section-title">Datos del episodio</p>
        <div className="grid grid-cols-2 gap-x-8 gap-y-1 text-sm">
          <div><span className="text-slate-500 text-xs">Paciente: </span>{nombreDelPaciente}</div>
          <div><span className="text-slate-500 text-xs">Edad: </span>{edadPaciente != null ? `${edadPaciente} años` : '—'}</div>
          <div><span className="text-slate-500 text-xs">CIPNA: </span>{p?.cipna ?? '—'}</div>
          <div><span className="text-slate-500 text-xs">NHC: </span>{p?.nhc ?? '—'}</div>
          <div><span className="text-slate-500 text-xs">Sexo: </span>
            {p?.sexo === 'hombre' ? 'Varón (1)' : p?.sexo === 'mujer' ? 'Mujer (2)' : '—'}
          </div>
          <div><span className="text-slate-500 text-xs">F. nacimiento: </span>
            {p?.fecha_nacimiento ? new Date(p.fecha_nacimiento).toLocaleDateString('es-ES') : '—'}
            {p?.fecha_nacimiento && <span className="text-slate-400 text-xs ml-1">({fmtFecha(p.fecha_nacimiento)})</span>}
          </div>
          <div><span className="text-slate-500 text-xs">F. ingreso: </span>
            {ingreso?.fecha_ingreso ? new Date(ingreso.fecha_ingreso).toLocaleDateString('es-ES') : '—'}
          </div>
          <div><span className="text-slate-500 text-xs">F. alta: </span>
            {ingreso?.fecha_alta ? new Date(ingreso.fecha_alta).toLocaleDateString('es-ES') : <span className="text-amber-500 text-xs">Pendiente de alta</span>}
          </div>
          <div><span className="text-slate-500 text-xs">Servicio: </span>
            <span className="font-mono text-xs">{data.servicio ?? 'GRT'}</span>
          </div>
        </div>
      </div>

      {/* Procedencia y alta */}
      <div className="card p-5 space-y-3">
        <p className="section-title">Episodio</p>
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="label">Procedencia *</label>
            <select className="input" value={data.procedencia ?? ''}
              onChange={e => update('procedencia', e.target.value)}>
              <option value="">— Seleccionar —</option>
              {Object.entries(PROCEDENCIA).map(([v, l]) => (
                <option key={v} value={v}>{l}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="label">Motivo del alta *</label>
            {/* El motivo tiene que cuadrar con el estado del episodio (lo comprueba también la base de
                datos): se fija al dar de alta, y después solo se puede cambiar entre los motivos de ese
                mismo estado (p. ej. de «Domicilio» a «Alta voluntaria», nunca a «Éxitus»). */}
            {(() => {
              const activo = !ingreso || ingreso.estado === 'activo'
              const actual = data.circunstancia_alta ?? ''
              const opciones = Object.entries(TIPALT).filter(([v]) => estadoSegunCircunstancia(v) === ingreso?.estado)
              const incoherente = !activo && actual !== '' && !opciones.some(([v]) => v === actual)
              return (
                <>
                  <select className="input" disabled={activo} value={actual}
                    onChange={e => update('circunstancia_alta', e.target.value)}>
                    <option value="">{activo ? '— Se fija al dar de alta —' : '— Seleccionar —'}</option>
                    {incoherente && (
                      <option value={actual}>{TIPALT[actual] ?? actual} · no corresponde al estado del episodio</option>
                    )}
                    {opciones.map(([v, l]) => (
                      <option key={v} value={v}>{l}</option>
                    ))}
                  </select>
                  {activo && <p className="text-xs text-slate-500 mt-1">Se registra al pulsar «Dar de alta» en el episodio.</p>}
                  {incoherente && <p className="text-xs text-amber-700 mt-1">Este motivo no corresponde al estado del episodio. Elige uno de la lista.</p>}
                </>
              )
            })()}
          </div>
        </div>
      </div>

      {/* Diagnósticos */}
      <div className="card p-5 space-y-4">
        <div className="flex items-center justify-between">
          <p className="section-title mb-0">Diagnósticos CIE-10</p>
          <span className="text-xs text-slate-500">Botón "Al ingreso" = POAD</span>
        </div>

        <FilaDx label="Principal" required principal
          codigo={data.diagnostico_principal ?? ''}
          desc={data.diagnostico_principal_desc ?? ''}
          poad={data.diagnostico_principal_poad ?? null}
          onCodigoYDesc={(c, d) => updateDxCodigoYDesc(0, c, d)}
          onDesc={v => updateDx(0, 'desc', v)}
          onPoad={v => updateDx(0, 'poad', v)}
        />

        <div className="border-t pt-4 space-y-4">
          {Array.from({ length: N_SECUNDARIOS }, (_, i) => i + 1).map(n => (
            <FilaDx key={n} label={`Secundario ${n}`}
              codigo={(data as any)[`diagnostico_secundario_${n}`] ?? ''}
              desc={(data as any)[`diagnostico_secundario_${n}_desc`] ?? ''}
              poad={(data as any)[`diagnostico_secundario_${n}_poad`] ?? null}
              onCodigoYDesc={(c, d) => updateDxCodigoYDesc(n, c, d)}
              onDesc={v => updateDx(n, 'desc', v)}
              onPoad={v => updateDx(n, 'poad', v)}
            />
          ))}
        </div>
      </div>

      {/* Procedimientos */}
      <div className="card p-5 space-y-4">
        <p className="section-title">Procedimientos</p>
        {Array.from({ length: N_PROCEDIMIENTOS }, (_, i) => i + 1).map(n => (
          <FilaProc key={n} label={`Procedimiento ${n}`}
            codigo={(data as any)[`procedimiento_${n}`] ?? ''}
            desc={(data as any)[`procedimiento_${n}_desc`] ?? ''}
            onCodigo={v => updateProc(n, 'code', v)}
            onDesc={v => updateProc(n, 'desc', v)}
          />
        ))}
      </div>

      {/* Notas */}
      <div className="card p-5 space-y-2">
        <p className="section-title">Notas internas</p>
        <textarea className="input min-h-[70px] resize-y text-sm"
          placeholder="Observaciones que no van al CMBD…"
          value={data.notas ?? ''}
          onChange={e => update('notas', e.target.value)}
        />
      </div>

      {/* Completitud — ya no es una casilla que se marca a mano: se
          calcula sola a partir de los campos mínimos que de verdad
          hacen falta, así que nunca puede decir "completado" con
          algo obligatorio todavía vacío. */}
      {(() => {
        const faltan = camposFaltantes()
        return (
          <div className="card p-4">
            <div className="flex items-center gap-3">
              {faltan.length === 0
                ? <CheckCircle className="w-5 h-5 text-emerald-600 shrink-0" />
                : <Circle className="w-5 h-5 text-slate-400 shrink-0" />
              }
              <div>
                <p className={`text-sm font-medium ${faltan.length === 0 ? 'text-emerald-700' : 'text-slate-600'}`}>
                  {faltan.length === 0 ? 'CMBD completo' : 'CMBD incompleto'}
                </p>
                <p className="text-xs text-slate-500">
                  {faltan.length === 0
                    ? 'Tiene los campos mínimos para exportar.'
                    : `Falta: ${faltan.join(', ')}.`
                  }
                </p>
                {!p?.cipna && (
                  <p className="text-xs text-amber-700 mt-1">El paciente no tiene CIPNA: el campo CIP saldrá vacío en el fichero.</p>
                )}
              </div>
            </div>
          </div>
        )
      })()}

      {errorFaltantes.length > 0 && (
        <div className="text-sm text-red-600 bg-red-50 border border-red-100 rounded-lg px-3 py-2">
          No se puede exportar todavía. Falta: {errorFaltantes.join(', ')}.
        </div>
      )}

    </div>
  )
}
