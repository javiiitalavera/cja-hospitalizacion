// Impresión: todas las hojas y listados de la app salen por aquí, con el mismo aspecto
// (título a la izquierda, fecha a la derecha, mismos márgenes y tamaños, y el pie
// «Impreso el … · CJA Hospital») y la misma forma de imprimir (un marco oculto de esta misma
// página: no abre pestañas ni ventanas, que el navegador puede bloquear).

export function escapeHtml(val: string): string {
  return val
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

// Imprime un documento HTML completo en un marco oculto. El marco se quita solo.
export function imprimirHTMLEnMarco(html: string): void {
  const marco = document.createElement('iframe')
  marco.setAttribute('aria-hidden', 'true')
  marco.style.cssText = 'position:fixed;right:0;bottom:0;width:0;height:0;border:0'
  const quitar = () => { if (marco.parentNode) marco.parentNode.removeChild(marco) }
  marco.onload = () => {
    const w = marco.contentWindow
    if (!w) { quitar(); return }
    w.onafterprint = quitar
    w.focus()
    w.print()
    // Por si el navegador no avisa de que terminó la impresión.
    setTimeout(quitar, 5 * 60 * 1000)
  }
  marco.srcdoc = html
  document.body.appendChild(marco)
}

const fechaLargaHoy = () =>
  new Date().toLocaleDateString('es-ES', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })

const horaImpresion = () =>
  new Date().toLocaleString('es-ES', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })

// Cabecera común: título a la izquierda y fecha (o lo que se indique) a la derecha.
export function cabeceraImpresion(titulo: string, derecha: string = fechaLargaHoy()): string {
  return `<div class="cab"><h1>${escapeHtml(titulo)}</h1><span class="fecha">${escapeHtml(derecha)}</span></div>`
}

export function pieImpresion(): string {
  return `<p class="pie">Impreso el ${escapeHtml(horaImpresion())} · CJA Hospital</p>`
}

function estiloBase(orientacion: 'portrait' | 'landscape'): string {
  return `
  @page { size: A4 ${orientacion}; margin: 8mm; }
  * { box-sizing: border-box; }
  body { font-family: Arial, sans-serif; margin: 0; padding: 0; color: #111; }
  .cab { display: flex; justify-content: space-between; align-items: baseline; gap: 8mm; margin-bottom: 3mm; }
  .cab h1 { font-size: 13pt; margin: 0; }
  .cab .fecha { font-size: 9pt; color: #444; text-align: right; }
  .sub { font-size: 9pt; color: #444; margin: 0 0 3mm; }
  .pie { margin: 3mm 0 0; font-size: 7.5pt; color: #666; }
  table { border-collapse: collapse; width: 100%; }
  thead { display: table-header-group; }
  tr { break-inside: avoid; }
  th, td { border: 1px solid #777; padding: 2px 4px; font-size: 8.5pt; text-align: left; vertical-align: top; }
  th { background: #e8edf3; }
`
}

export interface OpcionesDocumento {
  titulo: string                       // título de la pestaña y de la cabecera (si no hay cabecera propia)
  derecha?: string                     // texto a la derecha de la cabecera (por defecto, la fecha de hoy)
  subtitulo?: string                   // línea bajo la cabecera
  cuerpo: string                       // HTML del contenido (si lleva su propia cabecera, `sinCabecera`)
  css?: string                         // estilos propios del documento, se añaden a los comunes
  orientacion?: 'portrait' | 'landscape'
  claseBody?: string
  sinCabecera?: boolean                // el cuerpo ya trae sus cabeceras (documentos de varias páginas)
}

// Documento HTML completo, listo para imprimirHTMLEnMarco.
export function documentoImpresion(o: OpcionesDocumento): string {
  const cab = o.sinCabecera ? '' : cabeceraImpresion(o.titulo, o.derecha)
  const sub = o.subtitulo ? `<p class="sub">${escapeHtml(o.subtitulo)}</p>` : ''
  return `<!doctype html><html lang="es"><head><meta charset="utf-8"><title>${escapeHtml(o.titulo)}</title><style>${estiloBase(o.orientacion ?? 'portrait')}${o.css ?? ''}</style></head><body${o.claseBody ? ` class="${o.claseBody}"` : ''}>
    ${cab}${sub}
    ${o.cuerpo}
    ${pieImpresion()}
  </body></html>`
}

// Listado en tabla (incidencias, episodios, contenciones…).
export function imprimirTablaHTML(titulo: string, subtitulo: string, theadHTML: string, tbodyHTML: string) {
  imprimirHTMLEnMarco(documentoImpresion({
    titulo,
    subtitulo,
    cuerpo: `<table><thead>${theadHTML}</thead><tbody>${tbodyHTML}</tbody></table>`,
  }))
}

// Lista de habitaciones 1 a 33 con el nombre del paciente (si la tiene ocupada), pensada para
// llevarla en papel y anotar cosas a mano — cada habitación con su propia fila de igual tamaño,
// y al lado una columna en blanco que ocupa el resto del ancho para escribir.
export function imprimirListaHabitaciones(nombresPorHabitacion: (string | null)[]) {
  const filas = nombresPorHabitacion.map((nombre, i) => `
    <tr>
      <td class="col-hab">${i + 1}</td>
      <td class="col-nombre">${nombre ? escapeHtml(nombre) : ''}</td>
      <td class="col-libre"></td>
    </tr>
  `).join('')
  imprimirHTMLEnMarco(documentoImpresion({
    titulo: 'Lista de pacientes',
    subtitulo: `Habitaciones 1 a ${nombresPorHabitacion.length}`,
    css: `
      table { table-layout: fixed; }
      td { height: 7.2mm; font-size: 10pt; padding: 1px 6px; }
      th { font-size: 9pt; padding: 3px 6px; }
      .col-hab { width: 10%; text-align: center; font-weight: 700; }
      .col-nombre { width: 30%; font-weight: 600; }
      .col-libre { width: 60%; }
    `,
    cuerpo: `<table><thead><tr><th class="col-hab">Hab.</th><th class="col-nombre">Paciente</th><th class="col-libre"></th></tr></thead><tbody>${filas}</tbody></table>`,
  }))
}
