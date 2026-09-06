import {
  BARTHEL_ITEMS, LAWTON_ITEMS, NPI_DOMINIOS, NPI_GRAVEDAD_OPCIONES,
  GDS_ESTADIOS, FAST_ESTADIOS,
  totalBarthel, totalLawton, totalNPI,
  type NPIRespuestaDominio,
} from '../types/escalas'

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

  function marcar(key: string, presente: boolean) {
    const actual = respuestas[key]
    onChange({ ...respuestas, [key]: presente ? { presente: true, gravedad: actual?.gravedad } : { presente: false } })
  }
  function marcarGravedad(key: string, gravedad: string) {
    onChange({ ...respuestas, [key]: { presente: true, gravedad } })
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
          return (
            <div key={dominio.key} className="py-2.5 border-b last:border-0">
              <p className="text-sm font-medium text-slate-700 mb-1.5">{dominio.label}</p>
              <div className="flex items-center gap-4 flex-wrap">
                <label className={`flex items-center gap-2 text-sm ${disabled ? 'text-slate-400' : 'text-slate-600 cursor-pointer'}`}>
                  <input type="radio" name={`${dominio.key}-presente`} checked={r?.presente === false} disabled={disabled}
                    onChange={() => marcar(dominio.key, false)} />
                  Ausente
                </label>
                <label className={`flex items-center gap-2 text-sm ${disabled ? 'text-slate-400' : 'text-slate-600 cursor-pointer'}`}>
                  <input type="radio" name={`${dominio.key}-presente`} checked={!!r?.presente} disabled={disabled}
                    onChange={() => marcar(dominio.key, true)} />
                  Presente
                </label>
                {r?.presente && (
                  <div className="flex items-center gap-3 ml-2">
                    {NPI_GRAVEDAD_OPCIONES.map((o) => (
                      <label key={o.valor} className={`flex items-center gap-1.5 text-xs ${disabled ? 'text-slate-400' : 'text-slate-600 cursor-pointer'}`}>
                        <input type="radio" name={`${dominio.key}-gravedad`} checked={r?.gravedad === o.valor} disabled={disabled}
                          onChange={() => marcarGravedad(dominio.key, o.valor)} />
                        {o.etiqueta}
                      </label>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}

export function EscalaGDSFAST({ gds, fast, onChangeGds, onChangeFast, disabled }: {
  gds: number | null | undefined
  fast: string | null | undefined
  onChangeGds: (v: number) => void
  onChangeFast: (v: string) => void
  disabled?: boolean
}) {
  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between mb-2">
        <p className="text-sm font-semibold text-slate-700">GDS (Reisberg) y FAST</p>
        <span className="text-sm font-semibold px-2.5 py-1 rounded-full bg-primary-50 text-primary-700">
          {gds ? `GDS ${gds}` : 'GDS —'} · {fast ? `FAST ${fast}` : 'FAST —'}
        </span>
      </div>
      <div className="bg-white rounded-lg border p-3">
        <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-2">Estadio GDS</p>
        <div className="space-y-1.5">
          {GDS_ESTADIOS.map((e) => (
            <label key={e.estadio} className={`flex items-start gap-2 text-sm ${disabled ? 'text-slate-400' : 'text-slate-600 cursor-pointer'}`}>
              <input type="radio" name="gds" checked={gds === e.estadio} disabled={disabled}
                onChange={() => onChangeGds(e.estadio)} className="mt-0.5 shrink-0" />
              <span><span className="font-medium">GDS {e.estadio}.</span> {e.descripcion}</span>
            </label>
          ))}
        </div>
      </div>
      <div className="bg-white rounded-lg border p-3">
        <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-2">Estadio / subestadio FAST</p>
        <div className="space-y-1.5">
          {FAST_ESTADIOS.map((e) => (
            <label key={e.estadio} className={`flex items-start gap-2 text-sm ${disabled ? 'text-slate-400' : 'text-slate-600 cursor-pointer'}`}>
              <input type="radio" name="fast" checked={fast === e.estadio} disabled={disabled}
                onChange={() => onChangeFast(e.estadio)} className="mt-0.5 shrink-0" />
              <span><span className="font-medium">FAST {e.estadio}.</span> {e.descripcion}</span>
            </label>
          ))}
        </div>
      </div>
    </div>
  )
}
