import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { Cargando } from './Cargando'
import ModalContencion from './ModalContencion'
import {
  severidadDia, severidadNoche, necesitaConfirmacion, SEVERIDAD_ESTILO, SEVERIDAD_BOTON_ESTILO,
  type ContencionDia, type ContencionNoche, type EstadoContencion,
} from '../types/contenciones'

// «Pauta de contención» de un ingreso: la situación de día y de noche, si un médico la ha confirmado y el acceso a la
// ventana donde se revisa o se cambia (con su historial). Es la MISMA pauta en todas partes (ficha → Hoja de ítems,
// panel de la Hoja de ítems, Inicio e Incidencias → Contenciones): aquí no hay campos propios, solo se muestra y se
// abre la ventana de siempre, así que nada se registra dos veces.
export function BloqueContencion({ ingresoId, pacienteInfo, compacto = false, onCambio }: {
  ingresoId: string
  pacienteInfo?: { nombre: string; habitacion?: number | null }
  compacto?: boolean           // versión estrecha del panel lateral de la Hoja de ítems
  onCambio?: (nueva: { dia: ContencionDia | null; noche: ContencionNoche[] | null }) => void   // tras guardar en la ventana
}) {
  const [estado, setEstado] = useState<EstadoContencion | null | 'cargando'>('cargando')
  const [error, setError] = useState('')
  const [modal, setModal] = useState(false)

  function cargar(trasGuardar = false) {
    supabase
      .from('contenciones')
      .select('*, confirmado_por:profesionales!confirmado_por_id(nombre, apellidos)')
      .eq('ingreso_id', ingresoId)
      .maybeSingle()
      .then(({ data, error: err }) => {
        if (err) {
          // Un error real (red, permisos…) no es lo mismo que «sin revisar todavía».
          setError((trasGuardar ? 'No se pudo confirmar el guardado: ' : 'No se pudo comprobar la contención: ') + err.message)
          setEstado(null)
          return
        }
        setError('')
        const d = (data as EstadoContencion | null) ?? null
        setEstado(d)
        if (trasGuardar) onCambio?.({ dia: d?.dia ?? null, noche: d?.noche ?? null })
      })
  }
  useEffect(() => { setEstado('cargando'); cargar() }, [ingresoId]) // eslint-disable-line react-hooks/exhaustive-deps

  const datos = estado !== 'cargando' ? estado : null
  const requiere = !!datos && necesitaConfirmacion(datos.dia, datos.noche)
  const pendiente = requiere && !datos?.confirmado_por_id
  const confirmada = requiere && !!datos?.confirmado_por_id

  return (
    <div className="py-1.5 border-b border-slate-100 space-y-1.5" data-testid="bloque-contencion">
      <div>
        <span className={`${compacto ? 'text-xs' : 'text-sm'} text-slate-600 block`}>Pauta de contención</span>
        <p className="text-[0.7rem] text-slate-500">
          {compacto
            ? 'Pulsa Día o Noche para ver o editar la pauta.'
            : 'Día y noche (barras, cota cero, sensor, contención). Pulsa Día o Noche para ver o editar la pauta; cada cambio queda en su historial.'}
        </p>
      </div>
      {error && <p className="aviso aviso-error">{error}</p>}
      {estado === 'cargando' ? (
        <Cargando />
      ) : (
        <div className="flex flex-wrap gap-2" role="group" aria-label="Pauta de contención">
          {(['dia', 'noche'] as const).map((eje) => {
            const sev = eje === 'dia' ? severidadDia(datos?.dia) : severidadNoche(datos?.noche)
            const estilo = SEVERIDAD_ESTILO[sev]
            return (
              <button key={eje} type="button" onClick={() => setModal(true)}
                aria-label={`Contención ${eje === 'dia' ? 'día' : 'noche'}: ${estilo.label}. Ver o editar`}
                className={`${compacto ? 'flex-1 min-w-[7rem] px-2' : 'min-w-[11rem] px-3'} py-1.5 rounded-lg text-xs font-semibold border-2 transition-all hover:brightness-95 ${SEVERIDAD_BOTON_ESTILO[sev]}`}>
                {eje === 'dia' ? 'Día' : 'Noche'}: {estilo.label}
              </button>
            )
          })}
        </div>
      )}
      {pendiente && <p className="text-xs font-medium text-amber-800">Pendiente de confirmación médica</p>}
      {confirmada && datos && (
        <p className="text-xs text-emerald-700">
          Confirmada por {datos.confirmado_por?.nombre} {datos.confirmado_por?.apellidos}
          {datos.confirmado_en && ` · ${new Date(datos.confirmado_en).toLocaleString('es-ES', { dateStyle: 'short', timeStyle: 'short' })}`}
        </p>
      )}
      {modal && (
        <ModalContencion ingresoId={ingresoId} onClose={() => setModal(false)} onGuardado={() => cargar(true)} pacienteInfo={pacienteInfo} />
      )}
    </div>
  )
}
