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
