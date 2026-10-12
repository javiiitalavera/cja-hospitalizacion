// Título de una sección de la ficha (la parte izquierda de la cabecera, con las acciones a la derecha). Antes cada
// pantalla lo escribía a su manera (tamaño y peso distintos, a veces solo un contador). Ahora es el mismo en todas:
// título en negrita y, debajo si hace falta, una línea de contexto.

export function TituloSeccion({ titulo, subtitulo }: { titulo: string; subtitulo?: React.ReactNode }) {
  return (
    <div className="min-w-0">
      <h2 className="text-base font-bold text-slate-800">{titulo}</h2>
      {subtitulo && <p className="text-sm text-slate-500">{subtitulo}</p>}
    </div>
  )
}
