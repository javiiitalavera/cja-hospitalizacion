import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { Cargando } from './Cargando'
import ModalContencion from './ModalContencion'
import {
  severidadDia, severidadNoche, necesitaConfirmacion, SEVERIDAD_ESTILO, SEVERIDAD_BOTON_ESTILO,
  type EstadoContencion,
} from '../types/contenciones'

// Contención y seguridad nocturna de un ingreso: la situación de día y de noche, si un médico la ha confirmado y el
// acceso a la ventana donde se revisa o se cambia (con su historial). Es la MISMA pauta en todas partes (Pauta de
// cuidados, Hoja de ítems, Inicio e Incidencias → Contenciones): aquí no hay campos propios, solo se muestra y se
// abre la ventana de siempre, así que nada se registra dos veces.
export function BloqueContencion({ ingresoId, pacienteInfo, className = '' }: {
  ingresoId: string
  pacienteInfo?: { nombre: string; habitacion?: number | null }
  className?: string
}) {
  const [estado, setEstado] = useState<EstadoContencion | null | 'cargando'>('cargando')
  const [error, setError] = useState('')
  const [modal, setModal] = useState(false)

  function cargar() {
    supabase
      .from('contenciones')
      .select('*, confirmado_por:profesionales!confirmado_por_id(nombre, apellidos)')
      .eq('ingreso_id', ingresoId)
      .maybeSingle()
      .then(({ data, error: err }) => {
        if (err) {
          // Un error real (red, permisos…) no es lo mismo que «sin revisar todavía».
          setError('No se pudo comprobar la contención: ' + err.message)
          setEstado(null)
          return
        }
        setError('')
        setEstado((data as EstadoContencion | null) ?? null)
      })
  }
  useEffect(() => { setEstado('cargando'); cargar() }, [ingresoId]) // eslint-disable-line react-hooks/exhaustive-deps

  const datos = estado !== 'cargando' ? estado : null
  const requiere = !!datos && necesitaConfirmacion(datos.dia, datos.noche)
  const pendiente = requiere && !datos?.confirmado_por_id
  const confirmada = requiere && !!datos?.confirmado_por_id

  return (
    <div className={`rounded-xl bg-slate-50 border border-slate-200 p-4 space-y-2.5 ${className}`} data-testid="bloque-contencion">
      <div>
        <p className="label !mb-0">Contención y seguridad nocturna</p>
        <p className="text-xs text-slate-500">
          Contención pautada para el día y medidas para la noche (barras, cota cero, sensor, contención). Pulsa Día o Noche para verla o cambiarla; cada cambio queda en su historial.
        </p>
      </div>
      {error && <p className="aviso aviso-error">{error}</p>}
      {estado === 'cargando' ? (
        <Cargando />
      ) : (
        <div className="flex flex-wrap gap-2" role="group" aria-label="Contención y seguridad nocturna">
          {(['dia', 'noche'] as const).map((eje) => {
            const sev = eje === 'dia' ? severidadDia(datos?.dia) : severidadNoche(datos?.noche)
            const estilo = SEVERIDAD_ESTILO[sev]
            return (
              <button key={eje} type="button" onClick={() => setModal(true)}
                aria-label={`${eje === 'dia' ? 'Día' : 'Noche'}: ${estilo.label}. Ver o cambiar`}
                className={`min-w-[11rem] px-3 py-1.5 rounded-lg text-xs font-semibold border-2 transition-all hover:brightness-95 ${SEVERIDAD_BOTON_ESTILO[sev]}`}>
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
        <ModalContencion ingresoId={ingresoId} onClose={() => setModal(false)} onGuardado={cargar} pacienteInfo={pacienteInfo} />
      )}
    </div>
  )
}
