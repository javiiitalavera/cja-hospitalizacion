import { Fragment, memo } from 'react'
import { GRUPOS, BOLD_ROWS, LABEL_BOLD_ROWS, habBg, textColor } from './constantes'
import type { IngresoConItems } from './tipos'

// ─── TABLA EN PANTALLA ────────────────────────────────────────

const Bloque = memo(function Bloque({
  habs,
  offset,
  count = 16,
  onSelect,
  onSelectVacia,
  selectedId,
  readOnly = false,
}: {
  habs: IngresoConItems[]
  offset: number
  count?: number
  onSelect: (i: IngresoConItems) => void
  onSelectVacia?: (n: number) => void
  selectedId: string | null
  readOnly?: boolean
}) {
  const slots: (IngresoConItems | null)[] = Array(count).fill(null)
  habs.forEach((i) => {
    if (i.habitacion && i.habitacion > offset && i.habitacion <= offset + count) slots[i.habitacion - offset - 1] = i
  })
  const habNums = Array.from({ length: count }, (_, i) => i + 1 + offset)
  const cellCls = 'border border-slate-400 text-center text-[7.5pt] leading-tight px-0.5 py-0'
  const labelCls =
    'border border-slate-400 text-left text-[7.5pt] leading-tight px-1 py-0 font-medium bg-slate-100 whitespace-nowrap'

  return (
    <table className="w-full border-collapse table-fixed" style={{ fontSize: '7.5pt' }}>
      <colgroup>
        <col style={{ width: '80px' }} />
        {habNums.map((n) => (
          <col key={n} style={{ width: `${100 / count}%` }} />
        ))}
      </colgroup>
      <thead>
        <tr>
          <th className="border border-slate-400 bg-slate-200 text-[7.5pt] text-left px-1 py-0.5 font-bold">
            HABITACIÓN
          </th>
          {habNums.map((n) => {
            const ing = slots[n - offset - 1]
            const bg = habBg(ing)
            const color = textColor(bg)
            return (
              <th
                key={n}
                className={`border border-slate-400 text-[8pt] font-bold text-center py-0.5 ${!ing && !readOnly ? 'cursor-pointer hover:bg-primary-50' : ''}`}
                style={{ backgroundColor: bg, color }}
                onClick={() => {
                  if (!ing && !readOnly && onSelectVacia) onSelectVacia(n)
                }}
                title={!ing && !readOnly ? `Ingresar en habitación ${n}` : undefined}
              >
                {n}
              </th>
            )
          })}
        </tr>
      </thead>
      <tbody>
        {GRUPOS.map((grupo) => (
          <Fragment key={grupo.titulo}>
            {grupo.mostrarTitulo !== false && (
              <tr key={`g-${grupo.titulo}`}>
                <td colSpan={count + 1} className="border border-slate-400 bg-[#5b7a9d] text-white text-[7pt] font-bold px-1 py-0.5 tracking-wide">
                  {grupo.titulo.toUpperCase()}
                </td>
              </tr>
            )}
            {grupo.filas.map((fila) => {
              // El semáforo de caídas solo tiñe la fila del nombre, no
              // todas las filas del paciente.
              const tenirPorSemaforo = fila.key === 'nombre'
              // La alerta de conducta debe saltar a la vista: fondo
              // rojo fuerte en la celda si hay algo marcado.
              const esAlerta = fila.key === 'alerta'
              return (
                <tr key={fila.key}>
                  <td className={labelCls} style={{ fontWeight: LABEL_BOLD_ROWS.has(fila.key) ? 700 : 500 }}>
                    {fila.label}
                  </td>
                  {habNums.map((n) => {
                    const idx = n - offset - 1
                    const ingreso = slots[idx]
                    const it = ingreso?.items ?? null
                    const val = ingreso ? fila.get(it as any, ingreso as any) : ''
                    const bg = habBg(ingreso)
                    const alertaActiva = esAlerta && !!val
                    const cellBg = alertaActiva
                      ? '#dc2626'
                      : ingreso && tenirPorSemaforo
                        ? bg === '#FF0000'
                          ? '#ffcccc'
                          : bg === '#FF9900'
                            ? '#ffe5cc'
                            : bg === '#FFFF00'
                              ? '#ffffcc'
                              : bg === '#92D050'
                                ? '#e2f5cc'
                                : '#fff'
                        : '#fff'
                    const color = alertaActiva ? '#fff' : ingreso && tenirPorSemaforo ? textColor(bg) : '#000'
                    const isSelected = ingreso?.id === selectedId
                    return (
                      <td
                        key={n}
                        className={`${cellCls} ${ingreso && !readOnly ? 'cursor-pointer hover:brightness-95' : !ingreso && !readOnly ? 'cursor-pointer hover:bg-primary-50/40' : ''} ${isSelected ? 'ring-2 ring-inset ring-primary-500' : ''}`}
                        style={{ backgroundColor: cellBg, color, fontWeight: alertaActiva ? 700 : (BOLD_ROWS.has(fila.key) ? 600 : 400) }}
                        onClick={() => {
                          if (ingreso && !readOnly) onSelect(ingreso)
                          else if (!ingreso && !readOnly && onSelectVacia && fila.key === 'nombre') onSelectVacia(n)
                        }}
                      >
                        {val || '\u00a0'}
                      </td>
                    )
                  })}
                </tr>
              )
            })}
          </Fragment>
        ))}
      </tbody>
    </table>
  )
})

export default Bloque
