// Hojas de trabajo de las auxiliares (mañana, tarde, noche): lo que se imprime cada turno, con los
// pacientes de hoy y sus indicaciones. Las columnas en blanco son para que las auxiliares anoten a mano.
// Todo en funciones puras: la página solo carga los datos y enseña el HTML que sale de aquí.

import { escapeHtml } from '../../lib/imprimir'
import {
  CONTENCION_DIA_LABEL, CONTENCION_NOCHE_LABEL, NOCHE_ES_CONTENCION,
  type ContencionDia, type ContencionNoche,
} from '../../types/contenciones'
import { type Turno, type ViaPaciente } from '../../types/pautaCuidados'

export interface PacienteHoja {
  habitacion: number
  nombre: string                                   // «Merche Cambra»: nombre y primer apellido
  sondaVesical: boolean
  colector: boolean
  via: ViaPaciente | null
  alertas: string[]                                // 'riesgo_fuga', 'agresion_imprevisible', 'riesgo_autolitico'
  objetosCalma: string | null
  contencionDia: string | null
  contencionNoche: string[] | null
  indicaciones: { texto: string; turnos: Turno[] }[]
}

const VIA_CORTA: Record<ViaPaciente, string> = { venosa: 'Venosa', subcutanea: 'Subcut.' }

const ALERTA_LABEL: Record<string, string> = {
  riesgo_fuga: 'Riesgo de fuga',
  agresion_imprevisible: 'Agresión imprevisible',
  riesgo_autolitico: 'Riesgo autolítico',
}

// Lo que ya está en la app (ítems y contención) y no hace falta que enfermería vuelva a escribir.
export function avisosAutomaticos(p: PacienteHoja, turno: Turno): string[] {
  const l: string[] = []
  for (const a of p.alertas) if (ALERTA_LABEL[a]) l.push(ALERTA_LABEL[a])
  if (p.objetosCalma?.trim()) l.push(`Le tranquiliza: ${p.objetosCalma.trim()}`)
  if (turno === 'noche') {
    const reales = (p.contencionNoche ?? []).filter((n) => NOCHE_ES_CONTENCION.includes(n as ContencionNoche))
    // Las etiquetas de noche ya dicen «Contención fija / si precisa»: no se repite la palabra.
    if (reales.length > 0) l.push(reales.map((n) => CONTENCION_NOCHE_LABEL[n as ContencionNoche]).join(', '))
  } else if (p.contencionDia && p.contencionDia !== 'ninguna') {
    l.push(`Contención: ${CONTENCION_DIA_LABEL[p.contencionDia as ContencionDia] ?? p.contencionDia}`)
  }
  return l
}

// Diuresis: sonda vesical o colector, si los lleva.
export function textoDiuresis(p: PacienteHoja): string {
  return p.sondaVesical ? 'SV' : p.colector ? 'Colector' : ''
}

export interface ColumnaHoja { titulo: string; clase: string }

const COLUMNAS: Record<Turno, ColumnaHoja[]> = {
  manana: [
    { titulo: 'Aseo', clase: 'c-aseo' }, { titulo: 'Diuresis', clase: 'c-diur' }, { titulo: 'Depo', clase: 'c-depo' },
    { titulo: 'Desayuno', clase: 'c-com' }, { titulo: 'Comida', clase: 'c-com' },
  ],
  tarde: [
    { titulo: 'Diuresis', clase: 'c-diur' }, { titulo: 'Depo', clase: 'c-depo' },
    { titulo: 'Merienda', clase: 'c-com' }, { titulo: 'Cena', clase: 'c-com' },
  ],
  noche: [
    { titulo: 'Orina', clase: 'c-diur' }, { titulo: 'Depo', clase: 'c-depo' },
  ],
}

export const TITULO_TURNO: Record<Turno, string> = { manana: 'Mañana', tarde: 'Tarde', noche: 'Noche' }

// Lista de reposición que cierra la hoja de la noche (la misma del Excel).
export const CONTROL_NOCHE = [
  'Bolsas basura', 'Azúcar, sacarina', 'Zumos', 'Toallitas húmedas', 'Mermeladas', 'Espesante', 'Servilletas',
  'Sacos basura', 'Antiséptico manos', 'Agua destilada', 'Lejía', 'Depresores', 'Jabón manos', 'Rollos de papel',
]
export const COMEDOR_NOCHE = ['Baberos', 'Toallitas húmedas', 'Espesante', 'Proteicos', 'Sabanitas']

const ESTILO = `
  @page { size: A4 portrait; margin: 8mm; }
  * { box-sizing: border-box; }
  body { font-family: Arial, sans-serif; margin: 0; padding: 10px; color: #111; }
  .cab { display: flex; justify-content: space-between; align-items: baseline; margin-bottom: 3mm; }
  h1 { font-size: 13pt; margin: 0; }
  .cab span { font-size: 9pt; color: #444; }
  table { border-collapse: collapse; width: 100%; table-layout: fixed; }
  thead { display: table-header-group; }
  tr { break-inside: avoid; }
  th, td { border: 1px solid #777; padding: 1.5px 3px; font-size: 8pt; text-align: left; vertical-align: top; overflow-wrap: anywhere; }
  th { background: #e8edf3; font-size: 6.5pt; text-transform: uppercase; letter-spacing: -0.1px; padding: 1.5px 2px; }
  td { height: 7.6mm; }
  .noche td { height: 6.1mm; }   /* la noche lleva además la lista de reposición: tiene que caber en la misma hoja */
  .c-hab { width: 6mm; text-align: center; font-weight: 700; }
  .c-nom { width: 30mm; font-weight: 600; }
  .c-aseo { width: 11mm; } .c-diur { width: 15mm; } .c-depo { width: 11mm; } .c-com { width: 15mm; } .c-via { width: 13mm; font-size: 7pt; }
  .c-cui { font-size: 7.5pt; }
  .c-cui .auto { font-weight: 700; }
  tr.libre td { color: #999; }
  .pie { margin-top: 3mm; font-size: 7.5pt; color: #666; }
  .ctrl { display: flex; gap: 8mm; margin-top: 3mm; break-inside: avoid; }
  .ctrl > div { flex: 1; }
  .ctrl h2 { font-size: 9pt; margin: 0 0 1.5mm; text-transform: uppercase; }
  .ctrl ul { list-style: none; margin: 0; padding: 0; columns: 2; font-size: 8pt; }
  .ctrl li { margin-bottom: 0.8mm; break-inside: avoid; }
  .ctrl li::before { content: '☐ '; }
`

function filaHTML(n: number, p: PacienteHoja | undefined, turno: Turno): string {
  const cols = COLUMNAS[turno]
  if (!p) {
    return `<tr class="libre"><td class="c-hab">${n}</td><td class="c-nom"></td>${cols.map((c) => `<td class="${c.clase}"></td>`).join('')}${turno !== 'noche' ? '<td class="c-via"></td>' : ''}<td class="c-cui"></td></tr>`
  }
  const auto = avisosAutomaticos(p, turno)
  const propias = p.indicaciones.filter((i) => i.turnos.includes(turno)).map((i) => i.texto.trim())
  const cuidados = [
    ...auto.map((t) => `<span class="auto">${escapeHtml(t)}</span>`),
    ...propias.map((t) => escapeHtml(t)),
  ].join(' · ')
  const celdas = cols.map((c) => {
    const contenido = c.titulo === 'Diuresis' || c.titulo === 'Orina' ? escapeHtml(textoDiuresis(p)) : ''
    return `<td class="${c.clase}">${contenido}</td>`
  }).join('')
  const via = turno !== 'noche' ? `<td class="c-via">${p.via ? escapeHtml(VIA_CORTA[p.via]) : ''}</td>` : ''
  return `<tr><td class="c-hab">${n}</td><td class="c-nom">${escapeHtml(p.nombre)}</td>${celdas}${via}<td class="c-cui">${cuidados}</td></tr>`
}

// Documento HTML completo de la hoja de un turno (sirve para vista previa y para imprimir).
export function construirHojaHTML(turno: Turno, pacientes: PacienteHoja[], fecha: Date, ahora: Date = new Date()): string {
  const porHab = new Map(pacientes.map((p) => [p.habitacion, p]))
  const maxHab = Math.max(33, ...pacientes.map((p) => p.habitacion))
  const filas = Array.from({ length: maxHab }, (_, k) => filaHTML(k + 1, porHab.get(k + 1), turno)).join('')
  const cols = COLUMNAS[turno]
  const tituloCuidados = turno === 'noche' ? 'Cuidados / incidencias' : 'Cuidados'
  const thead = `<tr><th class="c-hab">Hb</th><th class="c-nom">Nombre</th>${cols.map((c) => `<th class="${c.clase}">${c.titulo}</th>`).join('')}${turno !== 'noche' ? '<th class="c-via">Vía</th>' : ''}<th>${tituloCuidados}</th></tr>`
  const fechaTxt = fecha.toLocaleDateString('es-ES', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })
  const horaTxt = ahora.toLocaleString('es-ES', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })
  const control = turno === 'noche' ? `
    <div class="ctrl">
      <div><h2>Control</h2><ul>${CONTROL_NOCHE.map((x) => `<li>${escapeHtml(x)}</li>`).join('')}</ul></div>
      <div style="max-width:45mm"><h2>Comedor</h2><ul style="columns:1">${COMEDOR_NOCHE.map((x) => `<li>${escapeHtml(x)}</li>`).join('')}</ul></div>
    </div>` : ''
  return `<!doctype html><html lang="es"><head><meta charset="utf-8"><title>Hoja de trabajo — ${TITULO_TURNO[turno]}</title><style>${ESTILO}</style></head><body class="${turno}">
    <div class="cab"><h1>Hoja de trabajo · ${TITULO_TURNO[turno]}</h1><span>${escapeHtml(fechaTxt)}</span></div>
    <table><thead>${thead}</thead><tbody>${filas}</tbody></table>
    ${control}
    <p class="pie">Impreso el ${escapeHtml(horaTxt)} · CJA Hospital</p>
  </body></html>`
}

// Turno que toca ahora (mañana hasta las 15 h, tarde hasta las 22 h, luego noche).
export function turnoActual(ahora: Date = new Date()): Turno {
  const h = ahora.getHours()
  return h >= 7 && h < 15 ? 'manana' : h >= 15 && h < 22 ? 'tarde' : 'noche'
}
