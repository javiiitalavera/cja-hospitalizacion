import { X } from 'lucide-react'
import {
  BARTHEL_ITEMS, LAWTON_ITEMS, NPI_DOMINIOS, NPI_GRAVEDAD_OPCIONES,
  GDS_ESTADIOS, FAST_ESTADIOS, GDS_A_FAST_DIRECTO,
  totalBarthel, totalLawton, totalNPI,
  type NPIRespuestaDominio,
} from '../types/escalas'

// Tarjeta compacta: nombre de la escala, resultado, y un botón para
// abrir el modal donde de verdad se rellena — antes las cuatro
// escalas completas iban siempre desplegadas en la página, un
// scroll interminable que hacía el informe incómodo de rellenar.
export function TarjetaEscala({ titulo, resultado, incompleta, onAbrir, soloLectura }: {
  titulo: string
  resultado: string
  incompleta: boolean
  onAbrir: () => void
  soloLectura?: boolean
}) {
  return (
    <button
      type="button"
      onClick={onAbrir}
      className="flex items-center justify-between w-full px-4 py-3 bg-white rounded-lg border border-slate-200 hover:border-primary-300 hover:bg-primary-50/20 transition-colors text-left"
    >
      <span className="text-sm font-medium text-slate-700">{titulo}</span>
      <span className="flex items-center gap-3">
        <span className={`text-xs font-semibold px-2.5 py-1 rounded-full ${
          incompleta ? 'bg-slate-100 text-slate-400' : 'bg-primary-50 text-primary-700'
        }`}>
          {resultado}
        </span>
        <span className="text-xs text-primary-600 font-medium whitespace-nowrap">
          {soloLectura ? 'Ver →' : 'Completar →'}
        </span>
      </span>
    </button>
  )
}

export function ModalEscala({ titulo, onCerrar, children }: {
  titulo: string
  onCerrar: () => void
  children: React.ReactNode
}) {
  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4" onClick={onCerrar}>
      <div
        className="bg-white rounded-2xl shadow-2xl w-full max-w-lg max-h-[85vh] flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-6 py-4 border-b shrink-0">
          <h3 className="font-bold text-slate-800">{titulo}</h3>
          <button onClick={onCerrar} className="text-slate-400 hover:text-slate-600">
            <X className="w-5 h-5" />
          </button>
        </div>
        <div className="p-6 overflow-y-auto">
          {children}
        </div>
      </div>
    </div>
  )
}

// Resultado en cabecera, compartido por las cuatro — "Incompleta" en
// vez de un número cuando falta algo, nunca un total calculado con
// huecos tratados como cero.
function Resultado({ valor, max, etiqueta }: { valor: number | null; max: string; etiqueta?: string }) {
  return (
    <span className={`text-sm font-semibold px-2.5 py-1 rounded-full ${
      valor == null ? 'bg-slate-100 text-slate-400' : 'bg-primary-50 text-primary-700'
    }`}>
      {valor == null ? 'Incompleta' : `${etiqueta ?? ''}${valor}/${max}`}
    </span>
  )
}

function ItemRadio({ item, valor, onChange, disabled }: {
  item: { key: string; label: string; opciones: { valor: string; etiqueta: string; puntos: number }[] }
  valor?: string
  onChange: (v: string) => void
  disabled?: boolean
}) {
  return (
    <div className="py-2.5 border-b last:border-0">
      <p className="text-sm font-medium text-slate-700 mb-1.5">{item.label}</p>
      <div className="space-y-1">
        {item.opciones.map((o) => (
          <label key={o.valor} className={`flex items-center gap-2 text-sm ${disabled ? 'text-slate-400' : 'text-slate-600 cursor-pointer'}`}>
            <input
              type="radio"
              name={item.key}
              checked={valor === o.valor}
              onChange={() => onChange(o.valor)}
              disabled={disabled}
              className="shrink-0"
            />
            {o.etiqueta}
          </label>
        ))}
      </div>
    </div>
  )
}

export function EscalaBarthel({ value, onChange, disabled }: {
  value: Record<string, string> | null | undefined
  onChange: (v: Record<string, string>) => void
  disabled?: boolean
}) {
  const respuestas = value ?? {}
  const total = totalBarthel(respuestas)
  return (
    <div>
      <div className="flex items-center justify-between mb-2">
        <p className="text-sm font-semibold text-slate-700">Índice de Barthel</p>
        <Resultado valor={total} max="100" />
      </div>
      <div className="bg-white rounded-lg border px-4">
        {BARTHEL_ITEMS.map((item) => (
          <ItemRadio key={item.key} item={item} valor={respuestas[item.key]} disabled={disabled}
            onChange={(v) => onChange({ ...respuestas, [item.key]: v })} />
        ))}
      </div>
    </div>
  )
}

export function EscalaLawton({ value, onChange, disabled }: {
  value: Record<string, string> | null | undefined
  onChange: (v: Record<string, string>) => void
  disabled?: boolean
}) {
  const respuestas = value ?? {}
  const total = totalLawton(respuestas)
  return (
    <div>
      <div className="flex items-center justify-between mb-2">
        <p className="text-sm font-semibold text-slate-700">Índice de Lawton</p>
        <Resultado valor={total} max="8" />
      </div>
      <div className="bg-white rounded-lg border px-4">
        {LAWTON_ITEMS.map((item) => (
          <ItemRadio key={item.key} item={item} valor={respuestas[item.key]} disabled={disabled}
            onChange={(v) => onChange({ ...respuestas, [item.key]: v })} />
        ))}
      </div>
    </div>
  )
}

export function EscalaNPIQ({ value, onChange, disabled }: {
  value: Record<string, NPIRespuestaDominio> | null | undefined
  onChange: (v: Record<string, NPIRespuestaDominio>) => void
  disabled?: boolean
}) {
  const respuestas = value ?? {}
  const total = totalNPI(respuestas)

  // Un único paso: Ausente, Leve, Moderada o Grave, en la misma fila
  // — antes había que marcar "presente" primero y solo entonces
  // aparecía la gravedad, dos clics para decir lo mismo que uno.
  function marcar(key: string, valor: 'ausente' | string) {
    if (valor === 'ausente') {
      onChange({ ...respuestas, [key]: { presente: false } })
    } else {
      onChange({ ...respuestas, [key]: { presente: true, gravedad: valor } })
    }
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-2">
        <p className="text-sm font-semibold text-slate-700">NPI-Q (gravedad)</p>
        <Resultado valor={total} max="36" />
      </div>
      <div className="bg-white rounded-lg border px-4">
        {NPI_DOMINIOS.map((dominio) => {
          const r = respuestas[dominio.key]
          const valorActual = r == null ? undefined : r.presente ? r.gravedad : 'ausente'
          return (
            <div key={dominio.key} className="py-2.5 border-b last:border-0">
              <p className="text-sm font-medium text-slate-700 mb-1.5">{dominio.label}</p>
              <div className="flex items-center gap-4 flex-wrap">
                <label className={`flex items-center gap-1.5 text-sm ${disabled ? 'text-slate-400' : 'text-slate-600 cursor-pointer'}`}>
                  <input type="radio" name={`${dominio.key}-nivel`} checked={valorActual === 'ausente'} disabled={disabled}
                    onChange={() => marcar(dominio.key, 'ausente')} />
                  Ausente
                </label>
                {NPI_GRAVEDAD_OPCIONES.map((o) => (
                  <label key={o.valor} className={`flex items-center gap-1.5 text-sm ${disabled ? 'text-slate-400' : 'text-slate-600 cursor-pointer'}`}>
                    <input type="radio" name={`${dominio.key}-nivel`} checked={valorActual === o.valor} disabled={disabled}
                      onChange={() => marcar(dominio.key, o.valor)} />
                    {o.etiqueta}
                  </label>
                ))}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}

export function EscalaGDSFAST({ gds, fast, onCambiarGds, onChangeFast, disabled }: {
  gds: number | null | undefined
  fast: string | null | undefined
  // Un único callback con los dos valores a la vez — llamar a
  // onChangeGds y onChangeFast por separado, casi en el mismo
  // instante, hacía que el segundo guardado pisara al primero (los
  // dos partían del mismo estado "antes de guardar" del padre,
  // comprobado reproduciéndolo de verdad en el navegador).
  onCambiarGds: (gds: number, fastDirecto: string | null) => void
  onChangeFast: (v: string) => void
  disabled?: boolean
}) {
  // Del 1 al 5, GDS y FAST son prácticamente lo mismo — se rellena
  // solo. Solo a partir del 6 hace falta elegir el subestadio de
  // verdad, porque ahí varias formas de deterioro pueden darse en
  // cualquier orden. Antes había que rellenar las dos listas
  // completas por separado, aunque casi siempre dijeran lo mismo.
  function elegirGds(estadio: number) {
    onCambiarGds(estadio, GDS_A_FAST_DIRECTO[estadio] ?? null)
  }

  const subestadios = gds === 6 || gds === 7
    ? FAST_ESTADIOS.filter((e) => e.estadio.startsWith(String(gds)))
    : []

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between mb-2">
        <p className="text-sm font-semibold text-slate-700">GDS (Reisberg) / FAST</p>
        <span className="text-sm font-semibold px-2.5 py-1 rounded-full bg-primary-50 text-primary-700">
          {gds ? `GDS ${gds}` : '—'}{fast ? ` · FAST ${fast}` : ''}
        </span>
      </div>
      <div className="bg-white rounded-lg border divide-y">
        {GDS_ESTADIOS.map((e) => (
          <label key={e.estadio} className={`flex items-center gap-2.5 px-3 py-2.5 text-sm ${disabled ? 'text-slate-400' : 'text-slate-600 cursor-pointer hover:bg-slate-50'}`}>
            <input type="radio" name="gds" checked={gds === e.estadio} disabled={disabled}
              onChange={() => elegirGds(e.estadio)} className="shrink-0" />
            <span><span className="font-semibold">{e.estadio}.</span> {e.corto}</span>
          </label>
        ))}
      </div>
      {/* Solo aparece para GDS 6 o 7 — el resto ya tiene su FAST
          resuelto sin preguntar dos veces lo mismo. */}
      {subestadios.length > 0 && (
        <div>
          <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-2">Subestadio FAST {gds}</p>
          <div className="bg-white rounded-lg border divide-y">
            {subestadios.map((e) => (
              <label key={e.estadio} className={`flex items-center gap-2.5 px-3 py-2 text-sm ${disabled ? 'text-slate-400' : 'text-slate-600 cursor-pointer hover:bg-slate-50'}`}>
                <input type="radio" name="fast-sub" checked={fast === e.estadio} disabled={disabled}
                  onChange={() => onChangeFast(e.estadio)} className="shrink-0" />
                <span><span className="font-semibold">{e.estadio}.</span> {e.corto}</span>
              </label>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
