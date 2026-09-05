import { escapeHtml } from '../../lib/imprimir'
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
          const valor = ing ? fila.get(ing.items, ing) : ''
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

  return `<html><head><title>Hoja de ítems</title>
    <style>
      @page { size: A4 landscape; margin: 8mm; }
      body { font-family: Arial, sans-serif; }
      h1 { font-size: 13pt; margin: 0 0 2mm; }
      p.fecha { font-size: 9pt; color: #666; margin: 0 0 4mm; }
      table { border-collapse: collapse; width: 100%; table-layout: fixed; }
      th, td { border: 1px solid #999; padding: 1.5px 2px; font-size: 6.5pt; text-align: center; overflow: hidden; white-space: nowrap; }
      td.col-label, th.col-label { text-align: left; width: 70px; font-weight: 600; white-space: normal; }
      tr.grupo td { background: #5b7a9d; color: #fff; font-weight: 700; text-align: left; }
      td.bold, th.bold { font-weight: 700; }
      .salto { page-break-before: always; }
    </style>
  </head><body>
    <h1>Hoja de ítems — Habitaciones 1 a 16</h1>
    <p class="fecha">${escapeHtml(today)}</p>
    ${tablaPagina(habs1_16, 1, 16)}
    <div class="salto">
      <h1>Hoja de ítems — Habitaciones 17 a ${maxHab}</h1>
      <p class="fecha">${escapeHtml(today)}</p>
      ${tablaPagina(habs17_max, 17, maxHab)}
    </div>
  </body></html>`
}

export function printHoja(data: IngresoConItems[], today: string) {
  const win = window.open('', '_blank', 'width=1200,height=800')
  if (!win) return
  const html = buildPrintHTML(data, today)
  win.document.write(html)
  win.document.close()
  win.focus()
  setTimeout(() => {
    win.print()
    win.close()
  }, 400)
}
