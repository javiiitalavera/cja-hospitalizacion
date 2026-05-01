import {
  Document, Packer, Paragraph, TextRun, Table, TableRow, TableCell,
  AlignmentType, BorderStyle, WidthType, ShadingType,
  PageNumber, Header, Footer,
  VerticalAlign,
} from 'docx'
import type { Ingreso, InformeIngreso, InformeAlta } from '../types'

// ─── HELPERS ─────────────────────────────────────────────────────────────────

const GRAY_BG = 'E8ECEF'
const BLUE_BG = 'D6E4F0'
const DARK_BLUE = '1A3A5C'
const MID_BLUE = '2E6DA4'
const LIGHT_BORDER = 'C5D3DF'

const border = (color = LIGHT_BORDER) => ({
  top: { style: BorderStyle.SINGLE, size: 1, color },
  bottom: { style: BorderStyle.SINGLE, size: 1, color },
  left: { style: BorderStyle.SINGLE, size: 1, color },
  right: { style: BorderStyle.SINGLE, size: 1, color },
})

const noBorder = () => ({
  top: { style: BorderStyle.NONE, size: 0, color: 'FFFFFF' },
  bottom: { style: BorderStyle.NONE, size: 0, color: 'FFFFFF' },
  left: { style: BorderStyle.NONE, size: 0, color: 'FFFFFF' },
  right: { style: BorderStyle.NONE, size: 0, color: 'FFFFFF' },
})

function emptyPara(spacing = 80) {
  return new Paragraph({ children: [new TextRun('')], spacing: { before: spacing, after: spacing } })
}

function sectionHeading(text: string) {
  return new Paragraph({
    children: [new TextRun({ text, bold: true, color: 'FFFFFF', size: 22, font: 'Arial' })],
    shading: { fill: DARK_BLUE, type: ShadingType.CLEAR },
    spacing: { before: 200, after: 60 },
    indent: { left: 120, right: 120 },
  })
}

function subHeading(text: string) {
  return new Paragraph({
    children: [new TextRun({ text, bold: true, color: MID_BLUE, size: 20, font: 'Arial' })],
    shading: { fill: BLUE_BG, type: ShadingType.CLEAR },
    spacing: { before: 140, after: 60 },
    indent: { left: 120, right: 120 },
    border: { bottom: { style: BorderStyle.SINGLE, size: 2, color: MID_BLUE } },
  })
}

function labelValue(label: string, value: string | null | undefined, opts?: { bold?: boolean }) {
  const val = value?.trim() || '—'
  return new Paragraph({
    children: [
      new TextRun({ text: `${label}: `, bold: true, size: 20, font: 'Arial' }),
      new TextRun({ text: val, size: 20, font: 'Arial', bold: opts?.bold }),
    ],
    spacing: { before: 40, after: 40 },
    indent: { left: 120, right: 120 },
  })
}

function textBlock(value: string | null | undefined) {
  const lines = (value?.trim() || '—').split('\n')
  return lines.map((line, i) =>
    new Paragraph({
      children: [new TextRun({ text: line || ' ', size: 20, font: 'Arial' })],
      spacing: { before: i === 0 ? 40 : 0, after: i === lines.length - 1 ? 80 : 0 },
      indent: { left: 120, right: 120 },
    })
  )
}

function infoTable(rows: [string, string | null | undefined][][]) {
  // Each element is an array of [label, value] pairs per row (2 cols per row)
  const tableRows = rows.map(cols =>
    new TableRow({
      children: cols.map(([label, val], colIdx) =>
        new TableCell({
          borders: border(),
          width: { size: cols.length === 2 ? 4513 : 9026, type: WidthType.DXA },
          shading: colIdx % 2 === 0 ? { fill: GRAY_BG, type: ShadingType.CLEAR } : undefined,
          margins: { top: 80, bottom: 80, left: 120, right: 120 },
          children: [
            new Paragraph({
              children: [
                new TextRun({ text: `${label}: `, bold: true, size: 19, font: 'Arial' }),
                new TextRun({ text: val?.trim() || '—', size: 19, font: 'Arial' }),
              ],
            }),
          ],
        })
      ),
    })
  )

  return new Table({
    width: { size: 9026, type: WidthType.DXA },
    columnWidths: rows[0].length === 2 ? [4513, 4513] : [9026],
    rows: tableRows,
  })
}

// ─── CABECERA INSTITUCIONAL ───────────────────────────────────────────────────

function buildHeader(tipo: 'INFORME DE INGRESO' | 'INFORME DE ALTA') {
  return new Header({
    children: [
      new Table({
        width: { size: 9026, type: WidthType.DXA },
        columnWidths: [6000, 3026],
        borders: { top: { style: BorderStyle.NONE, size: 0, color: 'FFFFFF' }, bottom: { style: BorderStyle.SINGLE, size: 4, color: MID_BLUE }, left: { style: BorderStyle.NONE, size: 0, color: 'FFFFFF' }, right: { style: BorderStyle.NONE, size: 0, color: 'FFFFFF' } },
        rows: [
          new TableRow({
            children: [
              new TableCell({
                borders: noBorder(),
                width: { size: 6000, type: WidthType.DXA },
                verticalAlign: VerticalAlign.CENTER,
                margins: { top: 60, bottom: 60, left: 0, right: 120 },
                children: [
                  new Paragraph({
                    children: [new TextRun({ text: 'CLÍNICA JOSEFINA ARREGUI', bold: true, size: 26, color: DARK_BLUE, font: 'Arial' })],
                  }),
                  new Paragraph({
                    children: [new TextRun({ text: 'Unidad de Hospitalización Psicogeriátrica · Alsasua', size: 18, color: '666666', font: 'Arial' })],
                  }),
                ],
              }),
              new TableCell({
                borders: noBorder(),
                width: { size: 3026, type: WidthType.DXA },
                verticalAlign: VerticalAlign.CENTER,
                margins: { top: 60, bottom: 60, left: 120, right: 0 },
                children: [
                  new Paragraph({
                    alignment: AlignmentType.RIGHT,
                    children: [new TextRun({ text: tipo, bold: true, size: 22, color: MID_BLUE, font: 'Arial' })],
                  }),
                ],
              }),
            ],
          }),
        ],
      }),
    ],
  })
}

function buildFooter() {
  return new Footer({
    children: [
      new Paragraph({
        alignment: AlignmentType.CENTER,
        border: { top: { style: BorderStyle.SINGLE, size: 2, color: LIGHT_BORDER } },
        spacing: { before: 80 },
        children: [
          new TextRun({ text: 'Clínica Josefina Arregui · Documento confidencial · Página ', size: 16, color: '999999', font: 'Arial' }),
          new TextRun({ children: [PageNumber.CURRENT], size: 16, color: '999999', font: 'Arial' }),
        ],
      }),
    ],
  })
}

// ─── DATOS IDENTIFICACIÓN ────────────────────────────────────────────────────

function buildIdentificacion(ingreso: Ingreso): (Paragraph | Table)[] {
  const p = ingreso.paciente!
  const nombre = `${p.primer_apellido ?? ''} ${p.segundo_apellido ?? ''}, ${p.nombre ?? ''}`.trim()
  const fnac = p.fecha_nacimiento
    ? new Date(p.fecha_nacimiento).toLocaleDateString('es-ES')
    : '—'
  const edad = p.fecha_nacimiento
    ? `${Math.floor((Date.now() - new Date(p.fecha_nacimiento).getTime()) / 31557600000)} años`
    : '—'
  const fingreso = ingreso.fecha_ingreso
    ? new Date(ingreso.fecha_ingreso).toLocaleDateString('es-ES')
    : '—'
  const falta = ingreso.fecha_alta
    ? new Date(ingreso.fecha_alta).toLocaleDateString('es-ES')
    : '—'
  const medico = ingreso.medico_responsable
    ? `${ingreso.medico_responsable.nombre} ${ingreso.medico_responsable.apellidos}`
    : '—'

  return [
    sectionHeading('DATOS DEL PACIENTE'),
    emptyPara(60),
    infoTable([
      [['Apellidos y nombre', nombre], ['Fecha de nacimiento', `${fnac} (${edad})`]],
      [['CIPNA', p.cipna], ['NHC', p.nhc]],
      [['DNI / NIE', p.dni], ['Sexo', p.sexo ?? '—']],
      [['Municipio', p.municipio], ['Médico de cabecera', p.medico_cabecera]],
      [['Contacto familiar', p.contacto_familiar_nombre], ['Teléfono', p.contacto_familiar_telefono]],
      [['Fecha de ingreso', fingreso], ['Fecha de alta', falta]],
      [['Habitación', ingreso.habitacion?.toString()], ['Médico responsable CJA', medico]],
    ]),
    emptyPara(80),
  ]
}

// ─── INFORME DE INGRESO ───────────────────────────────────────────────────────

export async function exportarInformeIngreso(
  ingreso: Ingreso,
  informe: InformeIngreso
): Promise<void> {
  const children: (Paragraph | Table)[] = [
    ...buildIdentificacion(ingreso),

    sectionHeading('ANTECEDENTES PATOLÓGICOS'),
    emptyPara(60),
    labelValue('Alergias', informe.alergias),
    subHeading('Antecedentes médicos'),
    ...textBlock(informe.antecedentes_medicos),
    subHeading('Intervenciones quirúrgicas'),
    ...textBlock(informe.antecedentes_quirurgicos),
    subHeading('Antecedentes familiares'),
    ...textBlock(informe.antecedentes_familiares),
    subHeading('Tratamiento al ingreso'),
    ...textBlock(informe.tratamiento_ingreso),
    emptyPara(80),

    sectionHeading('VALORACIÓN GERIÁTRICA INTEGRAL'),
    emptyPara(60),
    infoTable([
      [['Índice de Barthel', informe.barthel != null ? `${informe.barthel}/100` : '—'], ['Índice de Lawton', informe.lawton != null ? `${informe.lawton}/8` : '—']],
    ]),
    emptyPara(60),
    subHeading('Situación social'),
    ...textBlock(informe.vgi_social),
    subHeading('Situación funcional'),
    ...textBlock(informe.vgi_funcional),
    subHeading('Situación cognitiva'),
    ...textBlock(informe.vgi_cognitivo),
    subHeading('Situación sensorial'),
    ...textBlock(informe.vgi_sensorial),
    subHeading('Situación nutricional'),
    ...textBlock(informe.vgi_nutricional),
    subHeading('Dolor'),
    ...textBlock(informe.vgi_dolor),
    subHeading('Otros síndromes geriátricos'),
    ...textBlock(informe.vgi_otros),
    emptyPara(80),

    sectionHeading('ENFERMEDAD ACTUAL'),
    emptyPara(60),
    subHeading('Personalidad previa'),
    ...textBlock(informe.personalidad_previa),
    subHeading('Evolución'),
    ...textBlock(informe.evolucion),
    subHeading('Situación actual'),
    labelValue('Cognitivo', informe.situacion_cognitivo),
    labelValue('Conductual', informe.situacion_conductual),
    labelValue('Anímico', informe.situacion_animico),
    labelValue('Funcional', informe.situacion_funcional),
    labelValue('Social', informe.situacion_social),
    emptyPara(80),

    sectionHeading('EXPLORACIONES'),
    emptyPara(60),
    subHeading('Exploración física al ingreso'),
    ...textBlock(informe.exploracion_fisica),
    subHeading('Exploración neurológica al ingreso'),
    ...textBlock(informe.exploracion_neurologica),
    subHeading('Exploración psicopatológica al ingreso'),
    ...textBlock(informe.exploracion_psicopatologica),
    subHeading('Exploraciones complementarias'),
    ...textBlock(informe.exploraciones_complementarias),
    emptyPara(80),

    sectionHeading('DIAGNÓSTICO Y PLAN TERAPÉUTICO'),
    emptyPara(60),
    subHeading('Impresión diagnóstica'),
    ...textBlock(informe.impresion_diagnostica),
    subHeading('Objetivos terapéuticos'),
    ...textBlock(informe.plan_objetivos),
    subHeading('Tratamiento farmacológico'),
    ...textBlock(informe.plan_medicacion),
    subHeading('Otros cuidados e intervenciones'),
    ...textBlock(informe.plan_otros_cuidados),
    emptyPara(120),

    // Firma
    new Paragraph({
      alignment: AlignmentType.RIGHT,
      indent: { right: 120 },
      spacing: { before: 200 },
      children: [
        new TextRun({
          text: `Alsasua, ${new Date().toLocaleDateString('es-ES', { day: 'numeric', month: 'long', year: 'numeric' })}`,
          size: 20, font: 'Arial',
        }),
      ],
    }),
    new Paragraph({
      alignment: AlignmentType.RIGHT,
      indent: { right: 120 },
      spacing: { before: 400 },
      children: [new TextRun({ text: '___________________________', size: 20, font: 'Arial' })],
    }),
    new Paragraph({
      alignment: AlignmentType.RIGHT,
      indent: { right: 120 },
      spacing: { before: 60 },
      children: [new TextRun({
        text: ingreso.medico_responsable
          ? `Dr/a. ${ingreso.medico_responsable.nombre} ${ingreso.medico_responsable.apellidos}`
          : 'Médico responsable',
        size: 20, font: 'Arial', bold: true,
      })],
    }),
  ]

  const p = ingreso.paciente!
  const apellido = p.primer_apellido ?? 'paciente'

  const doc = new Document({
    sections: [{
      properties: {
        page: {
          size: { width: 11906, height: 16838 },
          margin: { top: 1400, right: 1000, bottom: 1000, left: 1000 },
        },
      },
      headers: { default: buildHeader('INFORME DE INGRESO') },
      footers: { default: buildFooter() },
      children,
    }],
  })

  const blob = await Packer.toBlob(doc)
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `Informe_Ingreso_${apellido}_${new Date().toISOString().split('T')[0]}.docx`
  a.click()
  URL.revokeObjectURL(url)
}

// ─── INFORME DE ALTA ──────────────────────────────────────────────────────────

export async function exportarInformeAlta(
  ingreso: Ingreso,
  informeIngreso: InformeIngreso,
  informeAlta: InformeAlta
): Promise<void> {
  const children: (Paragraph | Table)[] = [
    ...buildIdentificacion(ingreso),

    sectionHeading('ANTECEDENTES PATOLÓGICOS'),
    emptyPara(60),
    labelValue('Alergias', informeIngreso.alergias),
    subHeading('Antecedentes médicos'),
    ...textBlock(informeIngreso.antecedentes_medicos),
    subHeading('Intervenciones quirúrgicas'),
    ...textBlock(informeIngreso.antecedentes_quirurgicos),
    subHeading('Tratamiento al ingreso'),
    ...textBlock(informeIngreso.tratamiento_ingreso),
    emptyPara(80),

    sectionHeading('DURANTE EL INGRESO'),
    emptyPara(60),
    infoTable([
      [['Índice de Barthel al ingreso', informeIngreso.barthel != null ? `${informeIngreso.barthel}/100` : '—'], ['Índice de Lawton al ingreso', informeIngreso.lawton != null ? `${informeIngreso.lawton}/8` : '—']],
    ]),
    emptyPara(60),
    subHeading('Exploraciones complementarias durante el ingreso'),
    ...textBlock(informeAlta.exploraciones_durante_ingreso),
    subHeading('Estudio neuropsicológico'),
    ...textBlock(informeAlta.estudio_neuropsicologico),
    subHeading('Informe de fisioterapia'),
    ...textBlock(informeAlta.informe_fisioterapia),
    subHeading('Informe de terapia ocupacional'),
    ...textBlock(informeAlta.informe_terapia_ocupacional),
    emptyPara(80),

    sectionHeading('EVOLUCIÓN Y DIAGNÓSTICOS'),
    emptyPara(60),
    subHeading('Evolución clínica'),
    ...textBlock(informeAlta.evolucion_clinica),
    subHeading('Juicios clínicos'),
    ...textBlock(informeAlta.juicios_clinicos),
    emptyPara(80),

    sectionHeading('TRATAMIENTO Y RECOMENDACIONES AL ALTA'),
    emptyPara(60),
    subHeading('Medicación al alta'),
    ...textBlock(informeAlta.medicacion_alta),
    subHeading('Recomendaciones de manejo conductual'),
    ...textBlock(informeAlta.recomendaciones_conductuales),
    subHeading('Cuidados de enfermería'),
    ...textBlock(informeAlta.cuidados_enfermeria),
    subHeading('Otras recomendaciones'),
    ...textBlock(informeAlta.otras_recomendaciones),
    emptyPara(120),

    // Firma
    new Paragraph({
      alignment: AlignmentType.RIGHT,
      indent: { right: 120 },
      spacing: { before: 200 },
      children: [new TextRun({
        text: `Alsasua, ${new Date().toLocaleDateString('es-ES', { day: 'numeric', month: 'long', year: 'numeric' })}`,
        size: 20, font: 'Arial',
      })],
    }),
    new Paragraph({
      alignment: AlignmentType.RIGHT,
      indent: { right: 120 },
      spacing: { before: 400 },
      children: [new TextRun({ text: '___________________________', size: 20, font: 'Arial' })],
    }),
    new Paragraph({
      alignment: AlignmentType.RIGHT,
      indent: { right: 120 },
      spacing: { before: 60 },
      children: [new TextRun({
        text: ingreso.medico_responsable
          ? `Dr/a. ${ingreso.medico_responsable.nombre} ${ingreso.medico_responsable.apellidos}`
          : 'Médico responsable',
        size: 20, font: 'Arial', bold: true,
      })],
    }),
  ]

  const p = ingreso.paciente!
  const apellido = p.primer_apellido ?? 'paciente'

  const doc = new Document({
    sections: [{
      properties: {
        page: {
          size: { width: 11906, height: 16838 },
          margin: { top: 1400, right: 1000, bottom: 1000, left: 1000 },
        },
      },
      headers: { default: buildHeader('INFORME DE ALTA') },
      footers: { default: buildFooter() },
      children,
    }],
  })

  const blob = await Packer.toBlob(doc)
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `Informe_Alta_${apellido}_${new Date().toISOString().split('T')[0]}.docx`
  a.click()
  URL.revokeObjectURL(url)
}
