import { escapeHtml } from '../../lib/imprimir'
import { GRUPOS, BOLD_ROWS, LABEL_BOLD_ROWS, habBg, textColor } from './constantes'
import type { IngresoConItems } from './tipos'

// ─── TABLA HTML PURA PARA IMPRESIÓN ──────────────────────────

function buildPrintHTML(data: IngresoConItems[], today: string): string {
  const habs1_16 = data.filter((i) => i.habitacion && i.habitacion <= 16)
  const habs17_max = data.filter((i) => i.habitacion && i.habitacion > 16)
  const maxHab = Math.max(33, ...data.map((i) => i.habitacion ?? 0))

  function buildBloque(habs: IngresoConItems[], offset: number, count: number): string {
    const slots: (IngresoConItems | null)[] = Array(count).fill(null)
    habs.forEach((i) => {
      if (i.habitacion && i.habitacion > offset && i.habitacion <= offset + count) slots[i.habitacion - offset - 1] = i
    })
    const habNums = Array.from({ length: count }, (_, i) => i + 1 + offset)

    const labelPct = 9
    const colPct = ((100 - labelPct) / count).toFixed(3)

    let html = `<table style="width:100%;border-collapse:collapse;table-layout:fixed;font-size:8pt;font-family:Arial,sans-serif;margin:0;">`
    html += `<colgroup><col style="width:${labelPct}%"/>${habNums.map(() => `<col style="width:${colPct}%"/>`).join('')}</colgroup>`

    // Header row - habitación números
    html += `<tr>`
    html += `<th style="border:1px solid #555;background:#ccc;text-align:left;padding:2px 3px;font-size:7pt;">HABITACIÓN</th>`
    for (const n of habNums) {
      const ing = slots[n - offset - 1]
      const bg = habBg(ing)
      const color = textColor(bg)
      html += `<th style="border:1px solid #555;background:${bg};color:${color};text-align:center;padding:3px 1px;font-size:9pt;font-weight:bold;">${n}</th>`
    }
    html += `</tr>`

    // Filas, agrupadas en bloques con su propia cabecera de sección
    for (const grupo of GRUPOS) {
      if (grupo.mostrarTitulo !== false) {
        html += `<tr><td colspan="${count + 1}" style="border:1px solid #555;background:#5b7a9d;color:#fff;padding:2px 4px;font-weight:700;font-size:7pt;letter-spacing:0.03em;">${grupo.titulo.toUpperCase()}</td></tr>`
      }
      for (const fila of grupo.filas) {
        const isBoldLabel = LABEL_BOLD_ROWS.has(fila.key)
        const isBoldVal = BOLD_ROWS.has(fila.key)
        // El semáforo de caídas solo tiñe la fila del nombre (además
        // de la propia habitación en la cabecera) — no toda la
        // columna del paciente, para no "pintar" el resto de datos.
        const tenirPorSemaforo = fila.key === 'nombre'
        // La alerta de conducta tiene que saltar a la vista: fondo
        // rojo fuerte en la propia celda si hay algo marcado, no solo
        // texto — es justo el tipo de aviso que no se puede pasar por
        // alto.
        const esAlerta = fila.key === 'alerta'
        html += `<tr>`
        html += `<td style="border:1px solid #555;background:#e8e8e8;padding:2px 4px;font-weight:${isBoldLabel ? 700 : 500};white-space:nowrap;overflow:hidden;font-size:7.5pt;">${fila.label}</td>`
        for (const n of habNums) {
          const ing = slots[n - offset - 1]
          const it = ing?.items ?? null
          const val = ing ? fila.get(it as any, ing as any) : ''
          const bg = habBg(ing)
          const alertaActiva = esAlerta && !!val
          const cellBg = alertaActiva
            ? '#dc2626'
            : ing && tenirPorSemaforo
              ? bg === '#FF0000'
                ? '#ffaaaa'
                : bg === '#FF9900'
                  ? '#ffddaa'
                  : bg === '#FFFF00'
                    ? '#ffffaa'
                    : bg === '#92D050'
                      ? '#d4edaa'
                      : '#ffffff'
              : '#ffffff'
          const cellColor = alertaActiva ? '#fff' : '#000'
          const cellWeight = alertaActiva ? 700 : (isBoldVal ? 600 : 400)
          html += `<td style="border:1px solid #aaa;background:${cellBg};color:${cellColor};text-align:center;padding:2px 1px;font-weight:${cellWeight};overflow:hidden;font-size:7.5pt;">${val ? escapeHtml(String(val)) : '&nbsp;'}</td>`
        }
        html += `</tr>`
      }
    }
    html += `</table>`
    return html
  }

  const bloque1 = buildBloque(habs1_16, 0, 16)
  const bloque2 = buildBloque(habs17_max, 16, maxHab - 16)

  return `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8"/>
<style>
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body { font-family: Arial, sans-serif; background: white; }
  .page { width: 100%; padding: 4px 6px; }
  .page-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 3px; font-size: 8pt; }
  .page-header b { font-weight: bold; }
  @page { size: A4 landscape; margin: 0.3cm 0.4cm; }
  @media print {
    html, body { width: 100%; height: 100%; }
    .page { page-break-after: always; width: 100%; }
    .page:last-child { page-break-after: avoid; }
  }
</style>
</head>
<body>
  <div class="page">
    <div class="page-header">
      <b>CJA · HOJA DE ÍTEMS — Camas 1–16</b>
      <span style="text-transform:capitalize;">${today}</span>
    </div>
    ${bloque1}
  </div>
  <div class="page">
    <div class="page-header">
      <b>CJA · HOJA DE ÍTEMS — Camas 17–${maxHab}</b>
      <span style="text-transform:capitalize;">${today}</span>
    </div>
    ${bloque2}
  </div>
</body>
</html>`
}

export function printHoja(data: IngresoConItems[], today: string) {
  const html = buildPrintHTML(data, today)
  const win = window.open('', '_blank', 'width=900,height=700')
  if (!win) return
  win.document.write(html)
  win.document.close()
  win.focus()
  setTimeout(() => {
    win.print()
    win.close()
  }, 400)
}

// ─── PANEL LATERAL DE EDICIÓN ─────────────────────────────────

