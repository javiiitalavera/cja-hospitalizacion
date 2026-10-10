// «Cargando…» de las pantallas y secciones: siempre centrado y con el mismo tamaño.
export function Cargando({ texto = 'Cargando…', pagina }: { texto?: string; pagina?: boolean }) {
  const p = <p className="text-sm text-slate-500 py-8 text-center">{texto}</p>
  return pagina ? <div className="p-6 md:p-8">{p}</div> : p
}
