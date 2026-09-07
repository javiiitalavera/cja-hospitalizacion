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

// Lista de habitaciones 1 a 33 con el nombre del paciente (si la
// tiene ocupada), pensada para llevarla en papel y anotar cosas a
// mano — cada habitación con su propia fila de igual tamaño, y
// debajo una fila en blanco que ocupa todo el ancho para escribir.
export function imprimirListaHabitaciones(nombresPorHabitacion: (string | null)[]) {
  const win = window.open('', '_blank')
  if (!win) return
  const filas = nombresPorHabitacion.map((nombre, i) => `
    <tr class="fila-datos">
      <td class="col-hab">${i + 1}</td>
      <td class="col-nombre">${nombre ? escapeHtml(nombre) : ''}</td>
    </tr>
    <tr class="fila-escribir"><td colspan="2"></td></tr>
  `).join('')
  const html = `<html><head><title>Lista de pacientes</title>
    <style>
      @page { margin: 12mm; }
      body { font-family: Arial, sans-serif; padding: 0; }
      h1 { font-size: 15pt; margin-bottom: 2px; }
      p { color: #666; font-size: 9pt; margin-top: 0; margin-bottom: 12px; }
      table { border-collapse: collapse; width: 100%; font-size: 10pt; table-layout: fixed; }
      .col-hab { width: 14%; }
      .col-nombre { width: 86%; }
      .fila-datos td { border: 1px solid #999; padding: 4px 8px; text-align: left; height: 22px; }
      .fila-escribir td { border: 1px solid #999; border-top: none; height: 22px; }
    </style></head><body>
    <h1>Lista de pacientes</h1>
    <p>Habitaciones 1 a 33 · ${new Date().toLocaleDateString('es-ES')}</p>
    <table>${filas}</table>
    </body></html>`
  win.document.write(html)
  win.document.close()
  win.focus()
  win.print()
}
