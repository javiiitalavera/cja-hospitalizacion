import { cabeceraImpresion, documentoImpresion, escapeHtml, imprimirHTMLEnMarco } from '../../lib/imprimir'
import { nombreYApellido } from '../../types'
import { GRUPOS, BOLD_ROWS, LABEL_BOLD_ROWS, habBg, textColor } from './constantes'
import type { IngresoConItems } from './tipos'

// ─── TABLA HTML PURA PARA IMPRESIÓN ──────────────────────────

function buildPrintHTML(data: IngresoConItems[], today: string): string {
  const habs1_16 = data.filter((i) => i.habitacion && i.habitacion <= 16)
  const habs17_max = data.filter((i) => i.habitacion && i.habitacion > 16)
  const maxHab = Math.max(33, ...data.map((i) => i.habitacion ?? 0))

  function tablaPagina(habs: IngresoConItems[], desde: number, hasta: number): string {
    const porHabitacion: Record<number, IngresoConItems> = {}
    habs.forEach((i) => { if (i.habitacion) porHabitacion[i.habitacion] = i })
    const numeros = Array.from({ length: hasta - desde + 1 }, (_, k) => desde + k)

    let html = '<table><thead><tr><th class="col-label"></th>'
    numeros.forEach((n) => {
      const ing = porHabitacion[n]
      const bg = habBg(ing ?? null)
      const color = textColor(bg)
      html += `<th style="background:${bg};color:${color}">${n}</th>`
    })
    html += '</tr></thead><tbody>'

    GRUPOS.forEach((grupo) => {
      if (grupo.mostrarTitulo !== false) {
        html += `<tr class="grupo"><td colspan="${numeros.length + 1}">${escapeHtml(grupo.titulo)}</td></tr>`
      }
      grupo.filas.forEach((fila) => {
        const esNegritaFila = LABEL_BOLD_ROWS.has(fila.key)
        html += `<tr><td class="col-label${esNegritaFila ? ' bold' : ''}">${escapeHtml(fila.label)}</td>`
        numeros.forEach((n) => {
          const ing = porHabitacion[n]
          const valor = ing
            ? (fila.key === 'nombre' && ing.paciente ? nombreYApellido(ing.paciente) : fila.get(ing.items, ing))
            : ''
          const esNegritaCelda = BOLD_ROWS.has(fila.key)
          const bg = fila.key === 'nombre' ? habBg(ing ?? null) : ''
          const color = bg ? textColor(bg) : ''
          const estilo = bg ? ` style="background:${bg};color:${color}"` : ''
          html += `<td${estilo}${esNegritaCelda ? ' class="bold"' : ''}>${escapeHtml(String(valor ?? ''))}</td>`
        })
        html += '</tr>'
      })
    })

    html += '</tbody></table>'
    return html
  }

  return documentoImpresion({
    titulo: 'Hoja de ítems',
    orientacion: 'landscape',
    sinCabecera: true,
    css: `
      table { table-layout: fixed; }
      th, td { padding: 1.5px 2px; font-size: 6.5pt; text-align: center; overflow: hidden; white-space: nowrap; border-color: #999; }
      td.col-label, th.col-label { text-align: left; width: 70px; font-weight: 600; white-space: normal; }
      tr.grupo td { background: #5b7a9d; color: #fff; font-weight: 700; text-align: left; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
      th, td[style] { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
      td.bold, th.bold { font-weight: 700; }
      .salto { break-before: page; }
    `,
    cuerpo: `
    ${cabeceraImpresion('Hoja de ítems — Habitaciones 1 a 16', today)}
    ${tablaPagina(habs1_16, 1, 16)}
    <div class="salto">
      ${cabeceraImpresion(`Hoja de ítems — Habitaciones 17 a ${maxHab}`, today)}
      ${tablaPagina(habs17_max, 17, maxHab)}
    </div>`,
  })
}

export function printHoja(data: IngresoConItems[], today: string) {
  imprimirHTMLEnMarco(buildPrintHTML(data, today))
}
