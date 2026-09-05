// Tooltip flotante compartido — antes existían dos copias casi
// idénticas de esta misma caja (una para el estado de contención,
// otra para el desglose de incidencias) en Home.tsx. El elemento que
// envuelve al disparador necesita la clase "group/tt relative" — un
// grupo con nombre específico, no "group" a secas, porque la fila
// entera ya usa "group" para el efecto de la flecha, y con el nombre
// genérico el tooltip se activaba con solo pasar el ratón por
// cualquier parte de la fila, no por el icono en concreto.
export default function Tooltip({ titulo, children }: { titulo?: string; children: React.ReactNode }) {
  return (
    <div className="hidden group-hover/tt:block absolute z-20 left-1/2 -translate-x-1/2 bottom-full mb-1.5 w-max max-w-[220px]">
      <div className="bg-slate-800 text-white rounded-lg shadow-lg py-2 px-3 space-y-1">
        {titulo && (
          <p className="text-[10px] font-semibold text-slate-300 uppercase tracking-wide mb-0.5">{titulo}</p>
        )}
        {children}
      </div>
      <div className="w-2 h-2 bg-slate-800 rotate-45 absolute left-1/2 -translate-x-1/2 -bottom-1" />
    </div>
  )
}
