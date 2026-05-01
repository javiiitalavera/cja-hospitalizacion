import JSZip from 'jszip'
import type { Ingreso, InformeIngreso, InformeAlta } from '../types'

// ─── UTILIDADES ───────────────────────────────────────────────────────────────

function esc(val: string | null | undefined): string {
  if (!val) return ''
  return val
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;')
}

function parrafoXml(texto: string, font = 'Calibri'): string {
  return `<w:p><w:pPr><w:spacing w:line="276" w:lineRule="auto"/><w:jc w:val="both"/></w:pPr><w:r><w:rPr><w:rFonts w:ascii="${font}" w:hAnsi="${font}"/></w:rPr><w:t xml:space="preserve">${esc(texto)}</w:t></w:r></w:p>`
}

function parrafoBoldXml(label: string, valor: string, font = 'Calibri'): string {
  return `<w:p><w:pPr><w:spacing w:line="276" w:lineRule="auto"/><w:jc w:val="both"/></w:pPr><w:r><w:rPr><w:rFonts w:ascii="${font}" w:hAnsi="${font}"/><w:b/></w:rPr><w:t xml:space="preserve">${esc(label)}</w:t></w:r><w:r><w:rPr><w:rFonts w:ascii="${font}" w:hAnsi="${font}"/></w:rPr><w:t xml:space="preserve">${esc(valor)}</w:t></w:r></w:p>`
}

function seccionXml(titulo: string, font = 'Calibri'): string {
  return `<w:p><w:pPr><w:spacing w:line="276" w:lineRule="auto"/><w:jc w:val="both"/></w:pPr><w:r><w:rPr><w:rFonts w:ascii="${font}" w:hAnsi="${font}"/><w:b/><w:u w:val="single"/></w:rPr><w:t>${esc(titulo)}</w:t></w:r></w:p>`
}

function lineasXml(texto: string | null | undefined, font = 'Calibri'): string {
  if (!texto?.trim()) return parrafoXml('', font)
  return texto.split('\n').map(l => parrafoXml(l, font)).join('')
}

function tablaTomasXml(filas = 7, font = 'Calibri'): string {
  const cols = ['DESAYUNO', 'COMIDA', 'MERIENDA', 'CENA', 'ACOSTAR']
  const colW = 1400
  const primerW = 1726
  const b = `<w:top w:val="single" w:sz="4" w:space="0" w:color="auto"/><w:left w:val="single" w:sz="4" w:space="0" w:color="auto"/><w:bottom w:val="single" w:sz="4" w:space="0" w:color="auto"/><w:right w:val="single" w:sz="4" w:space="0" w:color="auto"/>`
  const totalW = primerW + cols.length * colW

  const cabecera = `<w:tr><w:tc><w:tcPr><w:tcW w:w="${primerW}" w:type="dxa"/><w:tcBorders>${b}</w:tcBorders></w:tcPr><w:p><w:pPr><w:jc w:val="center"/></w:pPr></w:p></w:tc>${cols.map(c => `<w:tc><w:tcPr><w:tcW w:w="${colW}" w:type="dxa"/><w:tcBorders>${b}</w:tcBorders></w:tcPr><w:p><w:pPr><w:jc w:val="center"/></w:pPr><w:r><w:rPr><w:rFonts w:ascii="${font}" w:hAnsi="${font}"/><w:b/><w:sz w:val="18"/></w:rPr><w:t>${c}</w:t></w:r></w:p></w:tc>`).join('')}</w:tr>`
  const filaV = `<w:tr><w:tc><w:tcPr><w:tcW w:w="${primerW}" w:type="dxa"/><w:tcBorders>${b}</w:tcBorders></w:tcPr><w:p><w:pPr><w:spacing w:line="276" w:lineRule="auto"/></w:pPr></w:p></w:tc>${cols.map(() => `<w:tc><w:tcPr><w:tcW w:w="${colW}" w:type="dxa"/><w:tcBorders>${b}</w:tcBorders></w:tcPr><w:p><w:pPr><w:spacing w:line="276" w:lineRule="auto"/></w:pPr></w:p></w:tc>`).join('')}</w:tr>`

  return `<w:tbl><w:tblPr><w:tblW w:w="${totalW}" w:type="dxa"/></w:tblPr><w:tblGrid><w:gridCol w:w="${primerW}"/>${cols.map(() => `<w:gridCol w:w="${colW}"/>`).join('')}</w:tblGrid>${cabecera}${Array(filas).fill(filaV).join('')}</w:tbl>`
}

async function cargarPlantilla(nombre: string): Promise<JSZip> {
  const resp = await fetch(`/${nombre}`)
  if (!resp.ok) throw new Error(`No se pudo cargar la plantilla: ${nombre}`)
  return JSZip.loadAsync(await resp.arrayBuffer())
}

function descargar(zip: JSZip, nombre: string) {
  zip.generateAsync({ type: 'blob', mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' })
    .then(blob => {
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = nombre
      a.click()
      URL.revokeObjectURL(url)
    })
}

function inyectarHeader(headerXml: string, p: NonNullable<Ingreso['paciente']>, fingreso: string, falta: string): string {
  return headerXml
    .replace(/(<w:t[^>]*>)Nombre: (<\/w:t>)/, `$1Nombre: ${esc(p.nombre)}$2`)
    .replace(/(<w:t[^>]*>)Primer Apellido: (<\/w:t>)/, `$1Primer Apellido: ${esc(p.primer_apellido)}$2`)
    .replace(/(<w:t[^>]*>)Segundo Apellido:(<\/w:t>)/, `$1Segundo Apellido: ${esc(p.segundo_apellido ?? '')}$2`)
    .replace(/(<w:t[^>]*>)Fecha de nacimiento: (<\/w:t>)/, `$1Fecha de nacimiento: ${p.fecha_nacimiento ? new Date(p.fecha_nacimiento).toLocaleDateString('es-ES') : ''}$2`)
    .replace(/(<w:t[^>]*>)Fecha de ingreso: (<\/w:t>)/, `$1Fecha de ingreso: ${esc(fingreso)}$2`)
    .replace(/(<w:t[^>]*>)Fecha de alta: (<\/w:t>)/, `$1Fecha de alta: ${esc(falta)}$2`)
    .replace(/CIPNA:(?: )?(<\/w:t>)/, `CIPNA: ${esc(p.cipna ?? '')}$1`)
    .replace(/(<w:t[^>]*>)NHC:(<\/w:t>)/, `$1NHC: ${esc(p.nhc ?? '')}$2`)
}

// ─── INFORME DE INGRESO ───────────────────────────────────────────────────────

export async function exportarInformeIngreso(ingreso: Ingreso, inf: InformeIngreso): Promise<void> {
  const zip = await cargarPlantilla('plantilla_ingreso.docx')
  const p = ingreso.paciente!
  const font = 'Calibri'
  const edad = p.fecha_nacimiento ? Math.floor((Date.now() - new Date(p.fecha_nacimiento).getTime()) / 31557600000) : '?'
  const fingreso = ingreso.fecha_ingreso ? new Date(ingreso.fecha_ingreso).toLocaleDateString('es-ES') : ''
  const nombreCompleto = `${p.primer_apellido ?? ''} ${p.segundo_apellido ?? ''}, ${p.nombre ?? ''}`.trim()

  const cuerpo = [
    parrafoXml(`D. ${nombreCompleto} de ${edad} años, ingresa en nuestra Unidad de Hospitalización, a petición de su médico de cabecera, por trastorno de conducta.`, font),
    parrafoXml('', font),
    seccionXml('ANTECEDENTES PATOLÓGICOS', font),
    parrafoBoldXml('Alergias: ', esc(inf.alergias), font),
    parrafoXml('', font),
    parrafoBoldXml('Antecedentes médicos: ', '', font),
    lineasXml(inf.antecedentes_medicos, font),
    parrafoXml('', font),
    parrafoBoldXml('Intervenciones quirúrgicas: ', '', font),
    lineasXml(inf.antecedentes_quirurgicos, font),
    parrafoXml('', font),
    parrafoBoldXml('Antecedentes familiares: ', '', font),
    lineasXml(inf.antecedentes_familiares, font),
    parrafoXml('', font),
    parrafoBoldXml('Tratamiento al ingreso: ', '', font),
    lineasXml(inf.tratamiento_ingreso, font),
    parrafoXml('', font),
    seccionXml('VALORACIÓN GERIÁTRICA INTEGRAL:', font),
    parrafoBoldXml('Social: ', esc(inf.vgi_social), font),
    parrafoBoldXml('Funcional: ', '', font),
    parrafoBoldXml('- I. Barthel: ', inf.barthel != null ? `${inf.barthel}/100` : '', font),
    parrafoBoldXml('- I. Lawton: ', inf.lawton != null ? `${inf.lawton}/8` : '', font),
    lineasXml(inf.vgi_funcional, font),
    parrafoBoldXml('Cognitivo: ', '', font),
    lineasXml(inf.vgi_cognitivo, font),
    parrafoBoldXml('Sensorial: ', esc(inf.vgi_sensorial), font),
    parrafoBoldXml('Nutricional: ', esc(inf.vgi_nutricional), font),
    parrafoBoldXml('Dolor: ', esc(inf.vgi_dolor), font),
    parrafoBoldXml('Otros síndromes geriátricos: ', esc(inf.vgi_otros), font),
    parrafoXml('', font),
    seccionXml('ENFERMEDAD ACTUAL:', font),
    parrafoBoldXml('Personalidad previa: ', esc(inf.personalidad_previa), font),
    parrafoBoldXml('Evolución del deterioro cognitivo, conductual y funcional:', '', font),
    lineasXml(inf.evolucion, font),
    parrafoBoldXml('Situación actual:', '', font),
    parrafoBoldXml('Cognitivo: ', esc(inf.situacion_cognitivo), font),
    parrafoBoldXml('Conductual: ', esc(inf.situacion_conductual), font),
    parrafoBoldXml('Anímico: ', esc(inf.situacion_animico), font),
    parrafoBoldXml('Funcional: ', esc(inf.situacion_funcional), font),
    parrafoBoldXml('Social: ', esc(inf.situacion_social), font),
    parrafoXml('', font),
    seccionXml('EXPLORACIÓN FÍSICA al ingreso:', font),
    lineasXml(inf.exploracion_fisica, font),
    parrafoXml('', font),
    seccionXml('EXPLORACIÓN NEUROLÓGICA al ingreso:', font),
    lineasXml(inf.exploracion_neurologica, font),
    parrafoXml('', font),
    seccionXml('EXPLORACIÓN PSICOPATOLÓGICA al ingreso:', font),
    lineasXml(inf.exploracion_psicopatologica, font),
    parrafoXml('', font),
    seccionXml('EXPLORACIONES COMPLEMENTARIAS:', font),
    lineasXml(inf.exploraciones_complementarias, font),
    parrafoXml('', font),
    seccionXml('IMPRESIÓN DIAGNÓSTICA:', font),
    lineasXml(inf.impresion_diagnostica, font),
    parrafoXml('', font),
    seccionXml('PLAN TERAPÉUTICO Y OBJETIVOS:', font),
    parrafoBoldXml('Objetivos: ', '', font),
    lineasXml(inf.plan_objetivos, font),
    parrafoBoldXml('Medicación: ', '', font),
    lineasXml(inf.plan_medicacion, font),
    parrafoBoldXml('Otros cuidados/intervenciones: ', '', font),
    lineasXml(inf.plan_otros_cuidados, font),
    parrafoXml('', font),
    parrafoXml('', font),
    parrafoXml('Fdo. Dr. Javier González Gómez.', font),
    parrafoXml('Médico Especialista en Neurología. Col. 312865870.', font),
    `<w:p><w:pPr><w:spacing w:line="276" w:lineRule="auto"/></w:pPr><w:r><w:rPr><w:rFonts w:ascii="${font}" w:hAnsi="${font}"/></w:rPr><w:tab/><w:t xml:space="preserve">Alsasua, a ${new Date().toLocaleDateString('es-ES', { day: 'numeric', month: 'long', year: 'numeric' })}</w:t></w:r></w:p>`,
  ].join('')

  const xmlRaw = await zip.file('word/document.xml')!.async('string')
  const sectPr = xmlRaw.match(/<w:sectPr[\s\S]*<\/w:sectPr>/)?.[0] ?? ''
  zip.file('word/document.xml', xmlRaw.replace(/<w:body>[\s\S]*<\/w:body>/, `<w:body>${cuerpo}${sectPr}</w:body>`))

  const headerRaw = await zip.file('word/header1.xml')!.async('string')
  zip.file('word/header1.xml', inyectarHeader(headerRaw, p, fingreso, ''))

  descargar(zip, `Informe_Ingreso_${p.primer_apellido ?? 'paciente'}_${new Date().toISOString().split('T')[0]}.docx`)
}

// ─── INFORME DE ALTA ──────────────────────────────────────────────────────────

export async function exportarInformeAlta(ingreso: Ingreso, ii: InformeIngreso, ia: InformeAlta): Promise<void> {
  const zip = await cargarPlantilla('plantilla_alta.docx')
  const p = ingreso.paciente!
  const font = 'Calibri'
  const edad = p.fecha_nacimiento ? Math.floor((Date.now() - new Date(p.fecha_nacimiento).getTime()) / 31557600000) : '?'
  const fingreso = ingreso.fecha_ingreso ? new Date(ingreso.fecha_ingreso).toLocaleDateString('es-ES') : ''
  const falta = ingreso.fecha_alta ? new Date(ingreso.fecha_alta).toLocaleDateString('es-ES') : ''
  const nombreCompleto = `${p.primer_apellido ?? ''} ${p.segundo_apellido ?? ''}, ${p.nombre ?? ''}`.trim()

  const cuerpo = [
    parrafoXml(`D. ${nombreCompleto} de ${edad} años, ingresa en nuestra Unidad de Hospitalización, a petición de su médico de cabecera, por trastorno de conducta.`, font),
    parrafoXml('', font),
    seccionXml('ANTECEDENTES PATOLÓGICOS', font),
    parrafoBoldXml('Alergias: ', esc(ii.alergias), font),
    parrafoXml('', font),
    parrafoBoldXml('Antecedentes médicos: ', '', font),
    lineasXml(ii.antecedentes_medicos, font),
    parrafoXml('', font),
    parrafoBoldXml('Intervenciones quirúrgicas: ', '', font),
    lineasXml(ii.antecedentes_quirurgicos, font),
    parrafoXml('', font),
    parrafoBoldXml('Antecedentes familiares: ', '', font),
    lineasXml(ii.antecedentes_familiares, font),
    parrafoXml('', font),
    parrafoBoldXml('Tratamiento al ingreso: ', '', font),
    tablaTomasXml(7, font),
    parrafoXml('', font),
    seccionXml('VALORACIÓN GERIÁTRICA INTEGRAL:', font),
    parrafoBoldXml('Social: ', esc(ii.vgi_social), font),
    parrafoBoldXml('Funcional: ', '', font),
    parrafoBoldXml('- I. Barthel: ', ii.barthel != null ? `${ii.barthel}/100` : '', font),
    parrafoBoldXml('- I. Lawton: ', ii.lawton != null ? `${ii.lawton}/8` : '', font),
    parrafoBoldXml('Cognitivo: ', esc(ii.vgi_cognitivo), font),
    parrafoBoldXml('Sensorial: ', esc(ii.vgi_sensorial), font),
    parrafoBoldXml('Nutricional: ', esc(ii.vgi_nutricional), font),
    parrafoBoldXml('Dolor: ', esc(ii.vgi_dolor), font),
    parrafoBoldXml('Otros síndromes geriátricos: ', esc(ii.vgi_otros), font),
    parrafoXml('', font),
    seccionXml('ENFERMEDAD ACTUAL:', font),
    parrafoBoldXml('Personalidad previa: ', esc(ii.personalidad_previa), font),
    parrafoBoldXml('Evolución del deterioro cognitivo, conductual y funcional:', '', font),
    lineasXml(ii.evolucion, font),
    parrafoBoldXml('Situación actual:', '', font),
    parrafoBoldXml('Cognitivo: ', esc(ii.situacion_cognitivo), font),
    parrafoBoldXml('Conductual: ', esc(ii.situacion_conductual), font),
    parrafoBoldXml('Anímico: ', esc(ii.situacion_animico), font),
    parrafoBoldXml('Funcional: ', esc(ii.situacion_funcional), font),
    parrafoBoldXml('Social: ', esc(ii.situacion_social), font),
    parrafoXml('', font),
    seccionXml('EXPLORACIÓN FÍSICA al ingreso:', font),
    lineasXml(ii.exploracion_fisica, font),
    parrafoXml('', font),
    seccionXml('EXPLORACIÓN NEUROLÓGICA al ingreso:', font),
    lineasXml(ii.exploracion_neurologica, font),
    parrafoXml('', font),
    seccionXml('EXPLORACIÓN PSICOPATOLÓGICA al ingreso:', font),
    lineasXml(ii.exploracion_psicopatologica, font),
    parrafoXml('', font),
    seccionXml('EXPLORACIONES COMPLEMENTARIAS:', font),
    parrafoBoldXml('Al ingreso: ', esc(ii.exploraciones_complementarias), font),
    parrafoBoldXml('Durante el ingreso: ', '', font),
    lineasXml(ia.exploraciones_durante_ingreso, font),
    parrafoXml('', font),
    seccionXml('ESTUDIO NEUROPSICOLÓGICO:', font),
    lineasXml(ia.estudio_neuropsicologico, font),
    parrafoXml('', font),
    seccionXml('INFORME DE FISIOTERAPIA:', font),
    lineasXml(ia.informe_fisioterapia, font),
    parrafoXml('', font),
    seccionXml('INFORME DE TERAPIA OCUPACIONAL:', font),
    lineasXml(ia.informe_terapia_ocupacional, font),
    parrafoXml('', font),
    seccionXml('EVOLUCIÓN CLÍNICA Y COMENTARIOS:', font),
    lineasXml(ia.evolucion_clinica, font),
    parrafoXml('', font),
    seccionXml('JUICIOS CLÍNICOS:', font),
    lineasXml(ia.juicios_clinicos, font),
    parrafoXml('', font),
    seccionXml('TRATAMIENTO Y RECOMENDACIONES:', font),
    parrafoBoldXml('1. Recomendaciones de manejo conductual: ', '', font),
    lineasXml(ia.recomendaciones_conductuales, font),
    parrafoXml('', font),
    parrafoBoldXml('2. Cuidados de enfermería: ', '', font),
    lineasXml(ia.cuidados_enfermeria, font),
    parrafoXml('', font),
    parrafoBoldXml('3. Medicación:', '', font),
    tablaTomasXml(7, font),
    parrafoXml('', font),
    parrafoBoldXml('4. Otras recomendaciones: ', '', font),
    lineasXml(ia.otras_recomendaciones, font),
    parrafoXml('- Se recomienda seguimiento por médico de cabecera y especialista de zona.', font),
    parrafoXml('- Se ofrece posibilidad de seguimiento a nivel privado en nuestro centro de Cordovilla (Pamplona) o Alsasua, recomendando valoración en 1-2 meses postalta.', font),
    parrafoXml('', font),
    parrafoXml('Estando a vuestra entera disposición para cualquier información o consulta, atentamente.', font),
    parrafoXml('', font),
    parrafoXml('Fdo. Dr. Javier González Gómez.', font),
    parrafoXml('Médico Especialista en Neurología. Col. 312865870.', font),
    `<w:p><w:pPr><w:spacing w:line="276" w:lineRule="auto"/></w:pPr><w:r><w:rPr><w:rFonts w:ascii="${font}" w:hAnsi="${font}"/></w:rPr><w:tab/><w:t xml:space="preserve">Alsasua, a ${new Date().toLocaleDateString('es-ES', { day: 'numeric', month: 'long', year: 'numeric' })}</w:t></w:r></w:p>`,
  ].join('')

  const xmlRaw = await zip.file('word/document.xml')!.async('string')
  const sectPr = xmlRaw.match(/<w:sectPr[\s\S]*<\/w:sectPr>/)?.[0] ?? ''
  zip.file('word/document.xml', xmlRaw.replace(/<w:body>[\s\S]*<\/w:body>/, `<w:body>${cuerpo}${sectPr}</w:body>`))

  const headerRaw = await zip.file('word/header1.xml')!.async('string')
  zip.file('word/header1.xml', inyectarHeader(headerRaw, p, fingreso, falta))

  descargar(zip, `Informe_Alta_${p.primer_apellido ?? 'paciente'}_${new Date().toISOString().split('T')[0]}.docx`)
}
