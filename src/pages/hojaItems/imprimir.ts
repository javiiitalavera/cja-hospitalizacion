// Escapar texto antes de insertarlo en HTML generado para imprimir —
// sin esto, un campo de texto con "<" o similar podía romper la tabla
// impresa o, en el peor caso, colarse como HTML/JS en esa ventana.
//
// Antes existían tres copias idénticas de esta misma función,
// repartidas entre HojaItems.tsx y Eventos.tsx (dos de ellas dentro
// del mismo archivo). Se unifican aquí para que solo haya un sitio
// que mantener.
export function escapeHtml(val: string): string {
  return val
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

// Abre una ventana nueva, escribe una tabla con este mismo estilo, y
// lanza la impresión — antes existían dos copias idénticas de este
// envoltorio entero (cabecera, hoja de estilos, apertura y cierre de
// la ventana) dentro de Eventos.tsx, una para cada tabla que se podía
// imprimir. Cada llamador solo aporta ya su propio <thead>/<tbody>.
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
