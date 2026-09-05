export function escapeHtml(val: string): string {
  return val
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

export function imprimirTablaHTML(titulo: string, subtitulo: string, theadHTML: string, tbodyHTML: string) {
  const win = window.open('', '_blank')
  if (!win) return
  const html = `<html><head><title>${titulo}</title>
    <style>
      body { font-family: Arial, sans-serif; padding: 24px; }
      h1 { font-size: 16pt; margin-bottom: 4px; }
      p { color: #666; font-size: 9pt; margin-top: 0; margin-bottom: 16px; }
      table { border-collapse: collapse; width: 100%; font-size: 8.5pt; }
      th, td { border: 1px solid #ccc; padding: 4px 6px; text-align: left; }
      th { background: #f1f5f9; }
    </style></head><body>
    <h1>${titulo}</h1>
    <p>${subtitulo}</p>
    <table><thead>${theadHTML}</thead><tbody>${tbodyHTML}</tbody></table>
    </body></html>`
  win.document.write(html)
  win.document.close()
  win.focus()
  win.print()
}
