import JSZip from 'jszip'
import type { FilaMedicacion, Ingreso, InformeIngreso, InformeAlta } from '../types'
import type { EscalaClinica } from '../types/escalas'
import { plantillaPorId } from '../pages/informes/plantillas'
import { GRUPOS_ENFERMERIA } from '../pages/informes/enfermeria'
import type { InformePuntual } from '../pages/informes/plantillas'
import { nombreCompleto } from '../types'
import { TOMAS } from '../pages/ingreso/TablaMedicacion'
import { edad, hoyLocal } from './fechas'

// ─── UTILIDADES ───────────────────────────────────────────────────────────────
//
// Formato común a TODOS los informes Word (ingreso, alta, enfermería y
// "Otros informes"): se cambia aquí y cambia en todos.

function esc(val: string | null | undefined): string {
  if (!val) return ''
  return val
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;')
}

// El ancho útil de la página es de 8504 twips (A4 menos los márgenes laterales
// de la plantilla); las tablas suman eso para quedar alineadas con el texto.
const COLOR_BORDE = '8C8C8C'
const COLOR_CABECERA = 'E3E9EE'
// Por encima de esta longitud un párrafo ocupa varias líneas y se justifica;
// los cortos (etiqueta + dato) quedan alineados a la izquierda, sin huecos.
const LARGO_JUSTIFICADO = 140

interface OpcionesParrafo {
  // Que el párrafo no quede solo al final de una página, separado de lo que sigue.
  junto?: boolean
  antes?: number
  despues?: number
}

function propsParrafo(texto: string, o: OpcionesParrafo = {}): string {
  const jc = texto.length > LARGO_JUSTIFICADO ? 'both' : 'left'
  return `<w:pPr>${o.junto ? '<w:keepNext/>' : ''}<w:spacing w:before="${o.antes ?? 0}" w:after="${o.despues ?? 60}" w:line="269" w:lineRule="auto"/><w:jc w:val="${jc}"/></w:pPr>`
}

function parrafoXml(texto: string, font = 'Calibri', o: OpcionesParrafo = {}): string {
  return `<w:p>${propsParrafo(texto, o)}<w:r><w:rPr><w:rFonts w:ascii="${font}" w:hAnsi="${font}"/></w:rPr><w:t xml:space="preserve">${esc(texto)}</w:t></w:r></w:p>`
}

// Etiqueta en negrita + valor. Si no hay valor en la misma línea, la etiqueta
// se queda pegada al texto que viene debajo.
function parrafoBoldXml(label: string, valor: string | null | undefined, font = 'Calibri', o: OpcionesParrafo = {}): string {
  const sola = !valor?.trim()
  // Etiqueta sin dato a su lado: queda más cerca del texto que viene debajo.
  const opts = { ...o, junto: o.junto || sola, despues: o.despues ?? (sola ? 20 : undefined) }
  return `<w:p>${propsParrafo(label + (valor ?? ''), opts)}<w:r><w:rPr><w:rFonts w:ascii="${font}" w:hAnsi="${font}"/><w:b/></w:rPr><w:t xml:space="preserve">${esc(label)}</w:t></w:r><w:r><w:rPr><w:rFonts w:ascii="${font}" w:hAnsi="${font}"/></w:rPr><w:t xml:space="preserve">${esc(valor)}</w:t></w:r></w:p>`
}

// Encabezado de sección: negrita subrayada (como siempre), pegado a lo que
// sigue para que nunca quede huérfano al final de una página.
function seccionXml(titulo: string, font = 'Calibri'): string {
  return `<w:p><w:pPr><w:keepNext/><w:keepLines/><w:spacing w:before="200" w:after="80" w:line="269" w:lineRule="auto"/><w:jc w:val="left"/><w:outlineLvl w:val="1"/></w:pPr><w:r><w:rPr><w:rFonts w:ascii="${font}" w:hAnsi="${font}"/><w:b/><w:u w:val="single"/></w:rPr><w:t>${esc(titulo)}</w:t></w:r></w:p>`
}

// Hueco pequeño entre bloques (en vez de párrafos vacíos del tamaño de una línea).
const ESPACIO = '<w:p><w:pPr><w:spacing w:before="0" w:after="0" w:line="100" w:lineRule="exact"/></w:pPr></w:p>'
function espacioXml(): string {
  return ESPACIO
}

// Une las partes del cuerpo quitando huecos sobrantes: dobles, al principio,
// al final o justo antes de un encabezado (que ya lleva su propio espacio).
function unir(partes: string[]): string {
  const salida: string[] = []
  for (let i = 0; i < partes.length; i++) {
    const p = partes[i]
    if (p === ESPACIO) {
      if (salida.length === 0 || salida[salida.length - 1] === ESPACIO) continue
      if (i + 1 < partes.length && partes[i + 1].includes('<w:outlineLvl')) continue
    }
    salida.push(p)
  }
  while (salida.length && salida[salida.length - 1] === ESPACIO) salida.pop()
  return salida.join('')
}

// ─── TABLAS ───────────────────────────────────────────────────────────────────

interface FilaTabla {
  celdas: string[]
  cabecera?: boolean
  // Altura mínima de la fila (para filas en blanco que se rellenan a mano).
  altura?: number
}

// Tabla con bordes finos grises, cabecera sombreada que se repite en cada
// página, filas que no se parten y las mismas medidas que el texto.
function tablaXml(
  anchos: number[],
  filas: FilaTabla[],
  font: string,
  o: { alinear?: ('left' | 'center')[]; szCabecera?: number; juntar?: boolean } = {}
): string {
  const borde = (lado: string) => `<w:${lado} w:val="single" w:sz="4" w:space="0" w:color="${COLOR_BORDE}"/>`
  const bordes = ['top', 'left', 'bottom', 'right', 'insideH', 'insideV'].map(borde).join('')
  const total = anchos.reduce((a, b) => a + b, 0)

  function celda(i: number, texto: string, cab: boolean, mantener: boolean): string {
    const alinear = o.alinear?.[i] ?? 'center'
    const sz = cab ? (o.szCabecera ?? 18) : 18
    return `<w:tc><w:tcPr><w:tcW w:w="${anchos[i]}" w:type="dxa"/>${cab ? `<w:shd w:val="clear" w:color="auto" w:fill="${COLOR_CABECERA}"/>` : ''}<w:vAlign w:val="center"/></w:tcPr><w:p><w:pPr>${mantener ? '<w:keepNext/>' : ''}<w:spacing w:before="30" w:after="30" w:line="240" w:lineRule="auto"/><w:jc w:val="${alinear}"/></w:pPr><w:r><w:rPr><w:rFonts w:ascii="${font}" w:hAnsi="${font}"/>${cab ? '<w:b/>' : ''}<w:sz w:val="${sz}"/></w:rPr><w:t xml:space="preserve">${esc(texto)}</w:t></w:r></w:p></w:tc>`
  }

  const filasXml = filas
    .map((f, r) => {
      // La cabecera siempre va con la primera fila de datos; con "juntar",
      // toda la tabla se mantiene en la misma página.
      const mantener = o.juntar ? r < filas.length - 1 : r === 0 && !!f.cabecera
      return `<w:tr><w:trPr><w:cantSplit/>${f.altura ? `<w:trHeight w:val="${f.altura}"/>` : ''}${f.cabecera ? '<w:tblHeader/>' : ''}</w:trPr>${f.celdas.map((t, i) => celda(i, t, !!f.cabecera, mantener)).join('')}</w:tr>`
    })
    .join('')

  return `<w:tbl><w:tblPr><w:tblW w:w="${total}" w:type="dxa"/><w:tblInd w:w="0" w:type="dxa"/><w:tblBorders>${bordes}</w:tblBorders><w:tblLayout w:type="fixed"/><w:tblCellMar><w:left w:w="70" w:type="dxa"/><w:right w:w="70" w:type="dxa"/></w:tblCellMar></w:tblPr><w:tblGrid>${anchos.map((w) => `<w:gridCol w:w="${w}"/>`).join('')}</w:tblGrid>${filasXml}</w:tbl>`
}

// Una sola columna de resultado (informe de ingreso) o dos, ingreso
// y alta, para comparar (informe de alta) — la misma tabla sirve
// para ambos casos.
function tablaEscalasXml(escalaIngreso: EscalaClinica | null | undefined, escalaAlta: EscalaClinica | null | undefined | 'sin_comparar', font = 'Calibri'): string {
  const comparar = escalaAlta !== 'sin_comparar'
  const ea = comparar ? (escalaAlta as EscalaClinica | null | undefined) : null

  const barthelI = escalaIngreso?.barthel_total != null ? `${escalaIngreso.barthel_total}/100` : 'Incompleta'
  const lawtonI = escalaIngreso?.lawton_total != null ? `${escalaIngreso.lawton_total}/8` : 'Incompleta'
  const npiI = escalaIngreso?.npi_gravedad_total != null ? `${escalaIngreso.npi_gravedad_total}/36` : 'Incompleta'
  const gdsFastI = escalaIngreso?.gds_estadio || escalaIngreso?.fast_estadio
    ? `GDS ${escalaIngreso?.gds_estadio ?? '—'} · FAST ${escalaIngreso?.fast_estadio ?? '—'}` : 'Incompleta'

  const barthelA = comparar ? (ea?.barthel_total != null ? `${ea.barthel_total}/100` : 'Incompleta') : null
  const lawtonA = comparar ? (ea?.lawton_total != null ? `${ea.lawton_total}/8` : 'Incompleta') : null
  const npiA = comparar ? (ea?.npi_gravedad_total != null ? `${ea.npi_gravedad_total}/36` : 'Incompleta') : null
  const gdsFastA = comparar
    ? (ea?.gds_estadio || ea?.fast_estadio ? `GDS ${ea?.gds_estadio ?? '—'} · FAST ${ea?.fast_estadio ?? '—'}` : 'Incompleta')
    : null

  const fila = (escala: string, i: string, a: string | null, cabecera = false): FilaTabla => ({
    celdas: a != null ? [escala, i, a] : [escala, i],
    cabecera,
  })
  const anchos = comparar ? [3000, 2750, 2750] : [3600, 4900]
  return tablaXml(
    anchos,
    [
      comparar ? fila('ESCALA', 'INGRESO', 'ALTA', true) : fila('ESCALA', 'RESULTADO', null, true),
      fila('Índice de Barthel', barthelI, barthelA),
      fila('Índice de Lawton', lawtonI, lawtonA),
      fila('NPI-Q (gravedad)', npiI, npiA),
      fila('GDS / FAST', gdsFastI, gdsFastA),
    ],
    font,
    { alinear: ['left', 'center', 'center'], juntar: true }
  )
}

// Etiqueta en negrita con la primera línea del texto a su lado y el resto
// debajo (un salto de línea dentro de un párrafo de Word no se vería).
function campoXml(label: string, texto: string | null | undefined, font = 'Calibri', o: OpcionesParrafo = {}): string {
  const lineas = (texto ?? '').trim().split('\n')
  return parrafoBoldXml(label, lineas[0], font, o) + lineas.slice(1).map((l) => parrafoXml(l, font, o)).join('')
}

function lineasXml(texto: string | null | undefined, font = 'Calibri'): string {
  if (!texto?.trim()) return parrafoXml('', font)
  return texto
    .split('\n')
    .map((l) => parrafoXml(l, font))
    .join('')
}

function tablaMedicacionXml(filas: FilaMedicacion[], font = 'Calibri'): string {
  // "Observaciones" es una columna extra del documento, no una toma en sí,
  // así que se añade aparte de las 5 que ya define TOMAS.
  const cols = ['FÁRMACO', 'DOSIS', ...TOMAS.map((t) => t.label.toUpperCase()), 'OBSERVACIONES']
  const keys: (keyof FilaMedicacion)[] = ['farmaco', 'dosis', ...TOMAS.map((t) => t.key), 'observaciones']
  // Suman el ancho del texto: fármaco, dosis, 5 tomas y observaciones.
  const anchos = [1700, 750, 960, 960, 960, 960, 960, 1254]
  const alinear: ('left' | 'center')[] = ['left', 'center', 'center', 'center', 'center', 'center', 'center', 'left']

  const datos: FilaTabla[] = filas.length > 0
    ? filas.map((f) => ({ celdas: keys.map((k) => f[k] ?? '') }))
    : Array.from({ length: 5 }, () => ({ celdas: cols.map(() => ''), altura: 340 }))

  return tablaXml(anchos, [{ celdas: cols, cabecera: true }, ...datos], font, { alinear, szCabecera: 15 })
}

// ─── CIERRE Y PIE ─────────────────────────────────────────────────────────────

function fechaLarga(d: Date = new Date()): string {
  return d.toLocaleDateString('es-ES', { day: 'numeric', month: 'long', year: 'numeric' })
}

// Fórmula de despedida opcional, firma (una línea por renglón) y lugar y fecha.
// Todo queda junto en la misma página.
function cierreXml(firma: string[], fecha: Date, font = 'Calibri', despedida?: string): string {
  return [
    despedida ? parrafoXml(despedida, font, { junto: true, antes: 200 }) : '',
    ...firma.map((l, i) => parrafoXml(l, font, { junto: true, antes: i === 0 ? (despedida ? 360 : 480) : 0, despues: 0 })),
    parrafoXml(`Alsasua, a ${fechaLarga(fecha)}`, font, { antes: 160 }),
  ].join('')
}

// Pie de página común: dirección de la clínica y "Página x de y". Sustituye al
// pie de la plantilla, que solo llevaba el número.
const PIE_DIRECCION = 'C/ Erburua s/n · 31800 Alsasua (Navarra) · Tel. 948 563 850 · Fax 948 563 961 · administracion@josefinaarregui.com'

function campoWordXml(instruccion: string, rpr: string): string {
  return `<w:r><w:rPr>${rpr}</w:rPr><w:fldChar w:fldCharType="begin"/></w:r><w:r><w:rPr>${rpr}</w:rPr><w:instrText xml:space="preserve"> ${instruccion} </w:instrText></w:r><w:r><w:rPr>${rpr}</w:rPr><w:fldChar w:fldCharType="separate"/></w:r><w:r><w:rPr>${rpr}</w:rPr><w:t>1</w:t></w:r><w:r><w:rPr>${rpr}</w:rPr><w:fldChar w:fldCharType="end"/></w:r>`
}

function pieXml(font = 'Calibri'): string {
  const rpr = `<w:rFonts w:ascii="${font}" w:hAnsi="${font}"/><w:color w:val="595959"/><w:sz w:val="16"/><w:szCs w:val="16"/>`
  const texto = (t: string) => `<w:r><w:rPr>${rpr}</w:rPr><w:t xml:space="preserve">${esc(t)}</w:t></w:r>`
  return (
    `<w:p><w:pPr><w:pStyle w:val="Piedepgina"/><w:pBdr><w:top w:val="single" w:sz="4" w:space="6" w:color="BFBFBF"/></w:pBdr><w:spacing w:before="0" w:after="20"/><w:jc w:val="center"/></w:pPr>${texto(PIE_DIRECCION)}</w:p>` +
    `<w:p><w:pPr><w:pStyle w:val="Piedepgina"/><w:spacing w:before="0" w:after="0"/><w:jc w:val="center"/></w:pPr>${texto('Página ')}${campoWordXml('PAGE', rpr)}${texto(' de ')}${campoWordXml('NUMPAGES', rpr)}</w:p>`
  )
}

function inyectarPie(footerXml: string): string {
  return footerXml.replace(/(<w:ftr\b[^>]*>)[\s\S]*(<\/w:ftr>)/, `$1${pieXml()}$2`)
}

// Escribe en la plantilla el cuerpo, la cabecera (ya con los datos del
// paciente) y el pie común.
async function componerDocumento(zip: JSZip, cuerpo: string, cabecera: string): Promise<void> {
  const xmlRaw = await zip.file('word/document.xml')!.async('string')
  const sectPr = xmlRaw.match(/<w:sectPr[\s\S]*<\/w:sectPr>/)?.[0] ?? ''
  zip.file('word/document.xml', xmlRaw.replace(/<w:body>[\s\S]*<\/w:body>/, `<w:body>${cuerpo}${sectPr}</w:body>`))
  zip.file('word/header1.xml', cabecera)
  const pie = zip.file('word/footer1.xml')
  if (pie) zip.file('word/footer1.xml', inyectarPie(await pie.async('string')))
}

async function cargarPlantilla(nombre: string): Promise<JSZip> {
  const resp = await fetch(`/${nombre}`)
  if (!resp.ok) throw new Error(`No se pudo cargar la plantilla: ${nombre}`)
  return JSZip.loadAsync(await resp.arrayBuffer())
}

function descargar(zip: JSZip, nombre: string) {
  zip
    .generateAsync({
      type: 'blob',
      mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    })
    .then((blob) => {
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = nombre
      a.click()
      URL.revokeObjectURL(url)
    })
}

function inyectarHeader(
  headerXml: string,
  p: NonNullable<Ingreso['paciente']>,
  fingreso: string,
  falta: string
): string {
  return headerXml
    .replace(/(<w:t[^>]*>)Nombre: (<\/w:t>)/, `$1Nombre: ${esc(p.nombre)}$2`)
    .replace(/(<w:t[^>]*>)Primer Apellido: (<\/w:t>)/, `$1Primer Apellido: ${esc(p.primer_apellido)}$2`)
    .replace(/(<w:t[^>]*>)Segundo Apellido:(?: )?(<\/w:t>)/, `$1Segundo Apellido: ${esc(p.segundo_apellido ?? '')}$2`)
    .replace(
      /(<w:t[^>]*>)Fecha de nacimiento: (<\/w:t>)/,
      `$1Fecha de nacimiento: ${p.fecha_nacimiento ? new Date(p.fecha_nacimiento).toLocaleDateString('es-ES') : ''}$2`
    )
    .replace(/(<w:t[^>]*>)Fecha de ingreso: (<\/w:t>)/, `$1Fecha de ingreso: ${esc(fingreso)}$2`)
    .replace(/(<w:t[^>]*>)Fecha de alta: (<\/w:t>)/, `$1Fecha de alta: ${esc(falta)}$2`)
    .replace(/CIPNA:(?: )?(<\/w:t>)/, `CIPNA: ${esc(p.cipna ?? '')}$1`)
    .replace(/(<w:t[^>]*>)NHC:(<\/w:t>)/, `$1NHC: ${esc(p.nhc ?? '')}$2`)
}

// ─── DATOS COMUNES ────────────────────────────────────────────────────────────

const fechaCorta = (iso: string | null | undefined) => (iso ? new Date(iso).toLocaleDateString('es-ES') : '')

function firmaMedico(ingreso: Ingreso): string[] {
  const m = ingreso.medico_responsable
  return [
    `Fdo. ${m ? `Dr/a. ${m.nombre} ${m.apellidos}` : ''}.`,
    `${m?.especialidad ?? 'Médico Especialista'}${m?.colegiado ? `. Col. ${m.colegiado}` : ''}.`,
  ]
}

// Antecedentes, valoración, enfermedad actual, exploraciones y escalas: igual
// en el informe de ingreso y en el de alta (que lo hereda del de ingreso).
// Apartado opcional: solo se imprime si tiene texto.
const hayTexto = (...textos: (string | null | undefined)[]) => textos.some((t) => !!t?.trim())
const opcional = (texto: string | null | undefined, xml: () => string): string[] => (texto?.trim() ? [xml()] : [])

function parteIngresoXml(ii: InformeIngreso, escalaIngreso: EscalaClinica | null | undefined, font: string, enAlta: boolean): string[] {
  return [
    espacioXml(),
    seccionXml('ANTECEDENTES PATOLÓGICOS', font),
    campoXml('Alergias: ', ii.alergias, font),
    parrafoBoldXml('Antecedentes médicos: ', '', font),
    lineasXml(ii.antecedentes_medicos, font),
    parrafoBoldXml('Intervenciones quirúrgicas: ', '', font, { antes: 100 }),
    lineasXml(ii.antecedentes_quirurgicos, font),
    ...opcional(ii.antecedentes_familiares, () => parrafoBoldXml('Antecedentes familiares: ', '', font, { antes: 100 }) + lineasXml(ii.antecedentes_familiares, font)),
    parrafoBoldXml('Tratamiento al ingreso: ', '', font, { antes: 100 }),
    tablaMedicacionXml(ii.tratamiento_ingreso_estructurado ?? [], font),
    espacioXml(),
    seccionXml('VALORACIÓN GERIÁTRICA INTEGRAL:', font),
    // Solo se imprimen los apartados con texto (las etiquetas vacías no aportan nada).
    ...opcional(ii.vgi_social, () => campoXml('Social: ', ii.vgi_social, font)),
    ...opcional(ii.vgi_funcional, () => parrafoBoldXml('Funcional: ', '', font) + lineasXml(ii.vgi_funcional, font)),
    ...opcional(ii.vgi_cognitivo, () => parrafoBoldXml('Cognitivo: ', '', font) + lineasXml(ii.vgi_cognitivo, font)),
    ...opcional(ii.vgi_sensorial, () => campoXml('Sensorial: ', ii.vgi_sensorial, font)),
    ...opcional(ii.vgi_nutricional, () => campoXml('Nutricional: ', ii.vgi_nutricional, font)),
    ...opcional(ii.vgi_dolor, () => campoXml('Dolor: ', ii.vgi_dolor, font)),
    ...opcional(ii.vgi_otros, () => campoXml('Otros síndromes geriátricos: ', ii.vgi_otros, font)),
    seccionXml('ENFERMEDAD ACTUAL:', font),
    ...opcional(ii.personalidad_previa, () => campoXml('Personalidad previa: ', ii.personalidad_previa, font)),
    parrafoBoldXml('Evolución del deterioro cognitivo, conductual y funcional:', '', font),
    lineasXml(ii.evolucion, font),
    ...(hayTexto(ii.situacion_cognitivo, ii.situacion_conductual, ii.situacion_animico, ii.situacion_funcional, ii.situacion_social)
      ? [parrafoBoldXml('Situación actual:', '', font, { antes: 100 })]
      : []),
    ...opcional(ii.situacion_cognitivo, () => campoXml('Cognitivo: ', ii.situacion_cognitivo, font)),
    ...opcional(ii.situacion_conductual, () => campoXml('Conductual: ', ii.situacion_conductual, font)),
    ...opcional(ii.situacion_animico, () => campoXml('Anímico: ', ii.situacion_animico, font)),
    ...opcional(ii.situacion_funcional, () => campoXml('Funcional: ', ii.situacion_funcional, font)),
    ...opcional(ii.situacion_social, () => campoXml('Social: ', ii.situacion_social, font)),
    seccionXml('EXPLORACIÓN FÍSICA al ingreso:', font),
    lineasXml(ii.exploracion_fisica, font),
    ...opcional(ii.exploracion_neurologica, () => seccionXml('EXPLORACIÓN NEUROLÓGICA al ingreso:', font) + lineasXml(ii.exploracion_neurologica, font)),
    ...opcional(ii.exploracion_psicopatologica, () => seccionXml('EXPLORACIÓN PSICOPATOLÓGICA al ingreso:', font) + lineasXml(ii.exploracion_psicopatologica, font)),
    seccionXml('EXPLORACIONES COMPLEMENTARIAS:', font),
    // En el informe de alta se distingue lo del ingreso de lo del ingreso en curso.
    ...(enAlta ? [campoXml('Al ingreso: ', ii.exploraciones_complementarias, font)] : [lineasXml(ii.exploraciones_complementarias, font)]),
    ...(enAlta ? [] : [
      seccionXml('ESCALAS CLÍNICAS AL INGRESO:', font),
      tablaEscalasXml(escalaIngreso, 'sin_comparar', font),
      seccionXml('IMPRESIÓN DIAGNÓSTICA:', font),
      lineasXml(ii.impresion_diagnostica, font),
      seccionXml('PLAN TERAPÉUTICO Y OBJETIVOS:', font),
      parrafoBoldXml('Objetivos: ', '', font),
      lineasXml(ii.plan_objetivos, font),
      parrafoBoldXml('Cambios de medicación propuestos: ', '', font, { antes: 100 }),
      lineasXml(ii.plan_medicacion, font),
      parrafoBoldXml('Otros cuidados/intervenciones: ', '', font, { antes: 100 }),
      lineasXml(ii.plan_otros_cuidados, font),
    ]),
  ]
}

function introPacienteXml(ingreso: Ingreso, fechaRef: string | null | undefined, font: string): string {
  const p = ingreso.paciente!
  // Edad EN LA FECHA DEL INFORME (ingreso o alta), no en la fecha en que se
  // exporte: un informe antiguo debe decir la edad que tenía entonces.
  const edadPaciente = edad(p.fecha_nacimiento, fechaRef) ?? '?'
  return parrafoXml(
    `D. ${nombreCompleto(p)} de ${edadPaciente} años, ingresa en nuestra Unidad de Hospitalización${ingreso.motivo_ingreso ? `, a petición de su médico de cabecera, por ${ingreso.motivo_ingreso.toLowerCase()}` : ''}.`,
    font
  )
}

// ─── INFORME DE INGRESO ───────────────────────────────────────────────────────

export async function exportarInformeIngreso(ingreso: Ingreso, inf: InformeIngreso, escala?: EscalaClinica | null): Promise<void> {
  const zip = await cargarPlantilla('plantilla_ingreso.docx')
  const p = ingreso.paciente!
  const font = 'Calibri'
  const fingreso = fechaCorta(ingreso.fecha_ingreso)

  const cuerpo = unir([
    introPacienteXml(ingreso, ingreso.fecha_ingreso, font),
    ...parteIngresoXml(inf, escala, font, false),
    cierreXml(firmaMedico(ingreso), new Date(), font),
  ])

  const headerRaw = await zip.file('word/header1.xml')!.async('string')
  await componerDocumento(zip, cuerpo, inyectarHeader(headerRaw, p, fingreso, ''))
  descargar(zip, `Informe_Ingreso_${p.primer_apellido ?? 'paciente'}_${hoyLocal()}.docx`)
}

// ─── INFORME DE ALTA ──────────────────────────────────────────────────────────

export async function exportarInformeAlta(ingreso: Ingreso, ii: InformeIngreso, ia: InformeAlta, escalaIngreso?: EscalaClinica | null, escalaAlta?: EscalaClinica | null): Promise<void> {
  const zip = await cargarPlantilla('plantilla_alta.docx')
  const p = ingreso.paciente!
  const font = 'Calibri'
  const fingreso = fechaCorta(ingreso.fecha_ingreso)
  const falta = fechaCorta(ingreso.fecha_alta)
  let apartado = 0
  const num = () => ++apartado   // numeración de «Tratamiento y recomendaciones»

  const cuerpo = unir([
    // La edad que sale es la de la fecha de alta (o de ingreso si aún no hay alta).
    introPacienteXml(ingreso, ingreso.fecha_alta ?? ingreso.fecha_ingreso, font),
    ...parteIngresoXml(ii, escalaIngreso, font, true),
    campoXml('Durante el ingreso: ', ia.exploraciones_durante_ingreso, font),
    // Apartados opcionales: solo si tienen texto, siempre en este orden.
    ...opcional(ia.estudio_neuropsicologico, () => seccionXml('ESTUDIO NEUROPSICOLÓGICO:', font) + lineasXml(ia.estudio_neuropsicologico, font)),
    ...opcional(ia.informe_fisioterapia, () => seccionXml('INFORME DE FISIOTERAPIA:', font) + lineasXml(ia.informe_fisioterapia, font)),
    ...opcional(ia.informe_terapia_ocupacional, () => seccionXml('INFORME DE TERAPIA OCUPACIONAL:', font) + lineasXml(ia.informe_terapia_ocupacional, font)),
    seccionXml('EVOLUCIÓN CLÍNICA Y COMENTARIOS:', font),
    lineasXml(ia.evolucion_clinica, font),
    seccionXml('ESCALAS CLÍNICAS: COMPARACIÓN INGRESO-ALTA:', font),
    tablaEscalasXml(escalaIngreso, escalaAlta, font),
    seccionXml('JUICIOS CLÍNICOS:', font),
    lineasXml(ia.juicios_clinicos, font),
    seccionXml('TRATAMIENTO Y RECOMENDACIONES:', font),
    // Manejo conductual y cuidados de enfermería son opcionales: la numeración sigue sin huecos.
    ...opcional(ia.recomendaciones_conductuales, () => parrafoBoldXml(`${num()}. Recomendaciones de manejo conductual: `, '', font) + lineasXml(ia.recomendaciones_conductuales, font)),
    ...opcional(ia.cuidados_enfermeria, () => parrafoBoldXml(`${num()}. Cuidados de enfermería: `, '', font, { antes: 100 }) + lineasXml(ia.cuidados_enfermeria, font)),
    parrafoBoldXml(`${num()}. Medicación:`, '', font, { antes: 100 }),
    tablaMedicacionXml(ia.medicacion_estructurada ?? [], font),
    parrafoBoldXml(`${num()}. Otras recomendaciones: `, '', font, { antes: 160 }),
    lineasXml(ia.otras_recomendaciones, font),
    parrafoXml('- Se recomienda seguimiento por médico de cabecera y especialista de zona.', font),
    parrafoXml(
      '- Se ofrece posibilidad de seguimiento a nivel privado en nuestro centro de Pamplona, Vitoria o Alsasua, recomendando valoración en 1-2 meses postalta.',
      font
    ),
    cierreXml(firmaMedico(ingreso), new Date(), font, 'Estando a vuestra entera disposición para cualquier información o consulta, atentamente.'),
  ])

  const headerRaw = await zip.file('word/header1.xml')!.async('string')
  await componerDocumento(zip, cuerpo, inyectarHeader(headerRaw, p, fingreso, falta))
  descargar(zip, `Informe_Alta_${p.primer_apellido ?? 'paciente'}_${hoyLocal()}.docx`)
}

// ─── INFORMES PUNTUALES ("Otros informes") ────────────────────────────────────
//
// Mismo documento base (membrete y cabecera de paciente) que el informe de
// alta; solo cambian el título de la cabecera y la fecha. Los campos sin
// texto no se imprimen.

function tituloCentradoXml(texto: string, font = 'Calibri'): string {
  return `<w:p><w:pPr><w:keepNext/><w:spacing w:before="120" w:after="200" w:line="276" w:lineRule="auto"/><w:jc w:val="center"/></w:pPr><w:r><w:rPr><w:rFonts w:ascii="${font}" w:hAnsi="${font}"/><w:b/><w:sz w:val="26"/></w:rPr><w:t xml:space="preserve">${esc(texto)}</w:t></w:r></w:p>`
}

export function cuerpoInformePuntualXml(ingreso: Ingreso, inf: InformePuntual, heredados: Record<string, string> = {}, font = 'Calibri'): string {
  const p = ingreso.paciente!
  const plantilla = plantillaPorId(inf.plantilla)
  const hoy = new Date()
  const edadPaciente = edad(p.fecha_nacimiento, hoyLocal()) ?? '?'
  const tratamiento = p.sexo === 'mujer' ? 'Dña.' : 'D.'
  const ingresado = p.sexo === 'mujer' ? 'ingresada' : 'ingresado'
  const finicio = fechaCorta(ingreso.fecha_ingreso)
  const ffin = fechaCorta(ingreso.fecha_alta)
  const estancia = ffin
    ? `${ingresado} en nuestra Unidad de Hospitalización del ${finicio} al ${ffin}`
    : `${ingresado} en nuestra Unidad de Hospitalización desde el ${finicio}`

  // Primero los campos heredados (se leen de los informes de ingreso y alta,
  // nunca de lo guardado en este informe) y después los propios.
  const campos = [
    ...(plantilla.heredados ?? []).map((c) => ({ c, texto: heredados[c.key] })),
    ...plantilla.campos.map((c) => ({ c, texto: inf.campos?.[c.key] })),
  ]
  const partes: string[] = []
  let grupoActual = ''
  for (const { c, texto } of campos) {
    if (!texto?.trim()) continue
    if (c.grupo) {
      if (c.grupo !== grupoActual) {
        partes.push(seccionXml(`${c.grupo}:`, font))
        grupoActual = c.grupo
      }
      partes.push(parrafoBoldXml(`${c.label}: `, '', font, { antes: 60 }), lineasXml(texto, font))
    } else {
      grupoActual = ''
      partes.push(seccionXml(`${c.label.toUpperCase()}:`, font), lineasXml(texto, font))
    }
  }

  return unir([
    tituloCentradoXml(plantilla.titulo, font),
    parrafoXml(`${tratamiento} ${nombreCompleto(p)}, de ${edadPaciente} años, ${estancia}.`, font),
    ...partes,
    cierreXml(firmaMedico(ingreso), hoy, font),
  ])
}

export async function exportarInformePuntual(ingreso: Ingreso, inf: InformePuntual, heredados: Record<string, string> = {}): Promise<void> {
  const zip = await cargarPlantilla('plantilla_alta.docx')
  const p = ingreso.paciente!
  const fingreso = fechaCorta(ingreso.fecha_ingreso)

  const cuerpo = cuerpoInformePuntualXml(ingreso, inf, heredados)
  const headerRaw = await zip.file('word/header1.xml')!.async('string')
  await componerDocumento(
    zip,
    cuerpo,
    inyectarHeader(headerRaw, p, fingreso, '')
      .replace(/(<w:t[^>]*>)INFORME DE ALTA(<\/w:t>)/g, `$1${esc(plantillaPorId(inf.plantilla).tituloCabecera)}$2`)
      .replace(/(<w:t[^>]*>)Fecha de alta: (<\/w:t>)/g, `$1Fecha del informe: ${new Date().toLocaleDateString('es-ES')}$2`)
  )
  descargar(zip, `Informe_${inf.plantilla === 'estado_actual' ? 'clinico' : inf.plantilla}_${p.primer_apellido ?? 'paciente'}_${hoyLocal()}.docx`)
}

// ─── INFORME DE ENFERMERÍA ────────────────────────────────────────────────────
//
// Mismo documento base (membrete y cabecera de paciente) y mismo estilo que
// el informe del médico: título centrado, cada grupo como encabezado en
// negrita subrayado, cada campo con su etiqueta en negrita. Los campos y los
// grupos sin texto no se imprimen. Firma quien guardó el informe por última
// vez (enfermería).

export function cuerpoInformeEnfermeriaXml(
  campos: Record<string, string>,
  firmante: { nombre: string; apellidos: string } | null,
  hoy: Date = new Date(),
  font = 'Calibri'
): string {
  const partes: string[] = []
  for (const grupo of GRUPOS_ENFERMERIA) {
    const rellenos = grupo.campos.filter((c) => campos[c.key]?.trim())
    if (rellenos.length === 0) continue
    partes.push(seccionXml(`${grupo.titulo.toUpperCase()}:`, font))
    // Un grupo es corto: se mantiene entero en la misma página.
    rellenos.forEach((c, i) => {
      const ultimo = i === rellenos.length - 1
      const lineas = campos[c.key].trim().split('\n')
      partes.push(
        parrafoBoldXml(`${c.label}: `, lineas[0], font, { junto: !ultimo || lineas.length > 1 }),
        ...lineas.slice(1).map((l, j) => parrafoXml(l, font, { junto: !ultimo || j < lineas.length - 2 }))
      )
    })
  }
  if (partes.length === 0) partes.push(parrafoXml('(Informe sin contenido)', font))

  return unir([
    tituloCentradoXml('Continuidad de cuidados de enfermería', font),
    ...partes,
    cierreXml(firmante ? [`Fdo. ${firmante.nombre} ${firmante.apellidos}.`, 'Enfermería.'] : ['Enfermería.'], hoy, font),
  ])
}

export async function exportarInformeEnfermeria(
  ingreso: Ingreso,
  campos: Record<string, string>,
  firmante: { nombre: string; apellidos: string } | null
): Promise<void> {
  const zip = await cargarPlantilla('plantilla_alta.docx')
  const p = ingreso.paciente!
  const fingreso = fechaCorta(ingreso.fecha_ingreso)

  const cuerpo = cuerpoInformeEnfermeriaXml(campos, firmante)
  const headerRaw = await zip.file('word/header1.xml')!.async('string')
  await componerDocumento(
    zip,
    cuerpo,
    inyectarHeader(headerRaw, p, fingreso, '')
      .replace(/(<w:t[^>]*>)INFORME DE ALTA(<\/w:t>)/g, `$1INFORME DE ENFERMERÍA$2`)
      .replace(/(<w:t[^>]*>)Fecha de alta: (<\/w:t>)/g, `$1Fecha del informe: ${new Date().toLocaleDateString('es-ES')}$2`)
  )
  descargar(zip, `Informe_Enfermeria_${p.primer_apellido ?? 'paciente'}_${hoyLocal()}.docx`)
}
