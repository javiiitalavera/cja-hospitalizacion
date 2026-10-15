import type { ReactNode } from 'react'
import { BloqueOxigeno, BloqueSonda, SelectorAislamiento, SelectorVias } from './ViasDispositivos'
import { BloqueContencion } from './BloqueContencion'
import { SEMAFORO_CAIDAS_COLOR } from '../types'
import { SEMAFOROS } from './SemaforoCaidas'
import type { ContencionDia, ContencionNoche } from '../types/contenciones'
import type { DatosDispositivos } from '../types/pautaCuidados'

// Los campos de la Hoja de ítems de un paciente: UN SOLO sitio donde se define qué se pregunta y en qué orden.
// Lo usan el panel lateral de la pantalla «Hoja de ítems» (variante «panel», estrecha) y la pestaña Plan de cuidados →
// Hoja de ítems de la ficha (variante «ficha», en tarjetas). Así los dos son idénticos punto por punto y en el mismo
// orden, y un campo nuevo se añade una sola vez. Quien lo usa pone el guardado: aquí solo se pintan los campos.

type Opciones = { v: string; l: string }[]

// Fuera de CamposItems a propósito: definido dentro, React lo trataría como un componente nuevo en cada pulsación y
// los campos de dentro (con su estado y su foco) se reiniciarían.
function Seccion({ panel, titulo, primera = false, children }: { panel: boolean; titulo: string; primera?: boolean; children: ReactNode }) {
  return panel ? (
    <>
      <p className={`section-title ${primera ? 'mt-1' : 'mt-3'}`}>{titulo}</p>
      {children}
    </>
  ) : (
    <div className="card p-6">
      <p className="section-title">{titulo}</p>
      {children}
    </div>
  )
}

export function CamposItems({ data, update, updateVarios, ingresoId, pacienteInfo, onContencionCambio, variante }: {
  data: Record<string, any>
  update: (key: string, valor: any) => void
  updateVarios: (cambios: Record<string, any>) => void
  ingresoId: string
  pacienteInfo?: { nombre: string; habitacion?: number | null }
  onContencionCambio?: (nueva: { dia: ContencionDia | null; noche: ContencionNoche[] | null }) => void
  variante: 'panel' | 'ficha'
}) {
  const panel = variante === 'panel'
  const fila = `flex items-center justify-between gap-3 py-1.5 border-b border-slate-100 last:border-0`
  const etiqueta = panel ? 'text-xs text-slate-600 w-32 shrink-0' : 'text-sm text-slate-700 w-44 shrink-0'
  const control = panel
    ? 'text-xs border border-slate-200 rounded px-1.5 py-1 bg-white'
    : 'input !py-1.5'

  const sel = (key: string, label: string, opts: Opciones) => (
    <div key={key} className={fila}>
      <span className={etiqueta}>{label}</span>
      <select className={`${control} flex-1 ${panel ? 'max-w-[160px]' : 'max-w-[16rem]'}`}
        value={(data[key] as string) ?? ''} onChange={(e) => update(key, e.target.value || null)}>
        <option value="">—</option>
        {opts.map((o) => <option key={o.v} value={o.v}>{o.l}</option>)}
      </select>
    </div>
  )

  const bool = (key: string, label: string) => (
    <label key={key} className={`${fila} cursor-pointer`}>
      <span className={panel ? 'text-xs text-slate-600' : 'text-sm text-slate-700'}>{label}</span>
      <input type="checkbox" className="w-4 h-4 rounded text-primary-600" checked={!!data[key]} onChange={(e) => update(key, e.target.checked)} />
    </label>
  )

  const texto = (key: string, label: string, placeholder?: string, ancho = 'max-w-[160px]') => (
    <div className={fila}>
      <span className={etiqueta}>{label}</span>
      <input className={`${control} flex-1 ${panel ? ancho : 'max-w-[16rem]'}`} placeholder={placeholder}
        value={(data[key] as string) ?? ''} onChange={(e) => update(key, e.target.value)} />
    </div>
  )

  const semaforo = data.semaforo_caidas as string | undefined
  const alertas: string[] = (data.alerta_conducta as string[]) ?? []
  const d = data as DatosDispositivos

  return (
    <div className={panel ? '' : 'space-y-6'}>
      <Seccion panel={panel} titulo="Semáforo de caídas" primera>
        <div className={`flex gap-2 py-2 ${panel ? 'border-b border-slate-100 mb-1' : ''}`} role="group" aria-label="Semáforo de caídas">
          {SEMAFOROS.map((color) => {
            const activo = semaforo === color
            return (
              <button key={color} type="button" aria-pressed={activo} aria-label={`Semáforo de caídas ${color}`}
                onClick={() => update('semaforo_caidas', activo ? null : color)}
                className={`${panel ? 'flex-1' : 'min-w-[5.5rem]'} py-1.5 rounded-lg text-xs font-semibold border-2 transition-all ${activo ? 'border-slate-700 scale-105' : 'border-transparent opacity-90 hover:opacity-100'}`}
                style={{ backgroundColor: SEMAFORO_CAIDAS_COLOR[color], color: color === 'rojo' ? '#fff' : '#000' }}>
                {color.charAt(0).toUpperCase() + color.slice(1)}
              </button>
            )
          })}
        </div>
        {!panel && <p className="text-xs text-slate-500">Riesgo de caída del paciente. Pulsa el color activo para quitarlo.</p>}
      </Seccion>

      <Seccion panel={panel} titulo="Seguridad y conducta">
        <BloqueContencion ingresoId={ingresoId} pacienteInfo={pacienteInfo} compacto={panel} onCambio={onContencionCambio} />
        <div className="py-1.5 border-b border-slate-100">
          <span className={`${panel ? 'text-xs text-slate-600' : 'text-sm text-slate-700'} block mb-1`}>Alerta de conducta</span>
          <div className="flex flex-wrap gap-1.5" data-testid="bloque-alerta-conducta">
            {([
              { v: 'riesgo_autolitico', l: 'Riesgo autolítico' },
              { v: 'agresion_imprevisible', l: 'Agresión imprevisible' },
              { v: 'riesgo_fuga', l: 'Riesgo de fuga' },
            ] as const).map((opt) => {
              const activo = alertas.includes(opt.v)
              return (
                <button key={opt.v} type="button" aria-pressed={activo}
                  onClick={() => update('alerta_conducta', activo ? alertas.filter((x) => x !== opt.v) : [...alertas, opt.v])}
                  className={`px-2.5 py-1 rounded-md text-xs font-medium border transition-colors ${activo ? 'bg-red-50 text-red-700 border-red-200' : 'bg-white text-slate-500 border-slate-300 hover:border-slate-400'}`}>
                  {opt.l}
                </button>
              )
            })}
          </div>
        </div>
        {texto('objetos_calma', 'Objetos de calma')}
      </Seccion>

      <Seccion panel={panel} titulo="Aislamiento, vías y dispositivos">
        <div className="space-y-4 py-1.5">
          <div className="space-y-1.5">
            <span className={panel ? 'text-xs text-slate-600' : 'text-sm text-slate-700'}>Aislamiento</span>
            <SelectorAislamiento datos={d} onCambio={updateVarios} />
          </div>
          <div className="space-y-1.5">
            <span className={panel ? 'text-xs text-slate-600' : 'text-sm text-slate-700'}>Vías</span>
            <SelectorVias datos={d} onCambio={updateVarios} />
          </div>
          <BloqueSonda datos={d} onCambio={updateVarios} />
          <BloqueOxigeno datos={d} onCambio={updateVarios} />
        </div>
      </Seccion>

      <Seccion panel={panel} titulo="Movilidad">
        {sel('deambulacion', 'Deambulación', [
          { v: 'autonomo', l: 'Autónomo' }, { v: '1_persona', l: '1 persona' }, { v: '2_personas', l: '2 personas' },
        ])}
        {sel('ayudas_deambulacion', 'Ayudas', [
          { v: 'ninguna', l: 'Ninguna' }, { v: 'baston', l: 'Bastón' }, { v: 'andador_2r', l: 'Andador 2r' },
          { v: 'andador_4r', l: 'Andador 4r' }, { v: 'silla_ruedas', l: 'Silla ruedas' },
        ])}
        {bool('bipedestador', 'Bipedestador')}
        {bool('grua', 'Grúa')}
        {texto('cabecero_grados', 'Cabecero elevado (º)', 'p. ej. 30', 'w-20')}
      </Seccion>

      <Seccion panel={panel} titulo="Alimentación">
        {sel('ingestas', 'Ingestas', [{ v: 'autonomo', l: 'Autónomo' }, { v: 'dependiente', l: 'Dependiente' }])}
      </Seccion>

      <Seccion panel={panel} titulo="Higiene y continencia">
        {sel('dependencia_avd', 'Dependencia', [{ v: '1', l: '1 persona' }, { v: '2', l: '2 personas' }])}
        {sel('panial_dia', 'Pañal día', [{ v: 'ninguno', l: 'Ninguno' }, { v: 'BP', l: 'BP' }, { v: 'CA', l: 'CA' }])}
        {sel('panial_noche', 'Pañal noche', [
          { v: 'ninguno', l: 'Ninguno' }, { v: 'BP', l: 'BP' }, { v: 'CA', l: 'CA' }, { v: 'CA+malla', l: 'CA+malla' },
        ])}
        {bool('colector', 'Colector')}
        {sel('higiene', 'Higiene', [{ v: 'lavabo', l: 'Lavabo' }, { v: 'cama', l: 'Cama' }])}
        {sel('ducha', 'Ducha', [{ v: 'pie', l: 'De pie' }, { v: 'sentado', l: 'Sentado' }])}
        {sel('vestido', 'Vestido', [{ v: 'autonomo', l: 'Autónomo' }, { v: 'dependiente', l: 'Dependiente' }])}
        {bool('banio', 'Baño acompañado (no va solo)')}
      </Seccion>

      <Seccion panel={panel} titulo="Piel y postura">
        {bool('colchon_antiescaras', 'Colchón antiescaras')}
        {bool('patucos_coderas', 'Patucos / coderas')}
        {bool('cambios_posturales', 'Cambios posturales')}
      </Seccion>

      <Seccion panel={panel} titulo="Prótesis y sensorial">
        {sel('dentadura', 'Dentadura', [
          { v: 'ninguna', l: 'Ninguna' }, { v: 'superior', l: 'Superior' }, { v: 'inferior', l: 'Inferior' },
          { v: 'completa', l: 'Completa' }, { v: 'fija', l: 'Fija' }, { v: 'puente', l: 'Puente' },
        ])}
        {sel('audifonos', 'Audífonos', [
          { v: 'ninguno', l: 'Ninguno' }, { v: 'derecho', l: 'Derecho' }, { v: 'izquierdo', l: 'Izquierdo' }, { v: 'ambos', l: 'Ambos' },
        ])}
        {sel('gafas', 'Gafas', [{ v: 'no', l: 'No' }, { v: 'si', l: 'Sí' }, { v: 'solo_tv', l: 'Solo TV' }])}
      </Seccion>

      <Seccion panel={panel} titulo="Otros">
        {bool('botella_noche', 'Botella noche')}
        {bool('timbre_habitacion', 'Timbre en habitación')}
        {bool('siestas', 'Siesta por la tarde')}
      </Seccion>

      <Seccion panel={panel} titulo="Observaciones">
        <textarea className={`textarea w-full ${panel ? 'text-xs' : ''}`} rows={3} placeholder="Notas libres…"
          value={(data.observaciones as string) ?? ''} onChange={(e) => update('observaciones', e.target.value)} />
      </Seccion>
    </div>
  )
}
