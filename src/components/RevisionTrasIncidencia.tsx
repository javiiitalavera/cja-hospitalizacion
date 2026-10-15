// Después de registrar una incidencia nueva, la aplicación propone revisar lo que suele cambiar con ella:
//   · caída               → el semáforo de caídas del paciente
//   · agresividad física  → la contención del paciente
// Es una propuesta, no una obligación: se puede cerrar sin tocar nada. Si el episodio ya está cerrado no se propone
// (no se puede modificar nada).

import { useEffect, useRef, useState } from 'react'
import { supabase } from '../lib/supabase'
import { SemaforoCaidas } from './SemaforoCaidas'
import ModalContencion from './ModalContencion'

export type RevisionTipo = 'semaforo' | 'contencion'

export function revisionPara(tipoEvento: string): RevisionTipo | null {
  return tipoEvento === 'caida' ? 'semaforo' : tipoEvento === 'agresividad_fisica' ? 'contencion' : null
}

export default function RevisionTrasIncidencia({
  tipo, ingresoId, pacienteInfo, onTerminar: onTerminarProp,
}: {
  tipo: RevisionTipo
  ingresoId: string
  pacienteInfo?: { nombre: string; habitacion?: number | null }
  onTerminar: () => void
}) {
  const [cargando, setCargando] = useState(true)
  const [semaforo, setSemaforo] = useState<string | null>(null)
  const [contencionAbierta, setContencionAbierta] = useState(false)
  // El modal de contención llama a onGuardado y luego a onClose: el aviso de «terminado» ha de salir una sola vez.
  const terminado = useRef(false)
  function onTerminar() {
    if (terminado.current) return
    terminado.current = true
    onTerminarProp()
  }

  useEffect(() => {
    let vigente = true
    ;(async () => {
      const [{ data: ing }, { data: it }] = await Promise.all([
        supabase.from('ingresos').select('estado').eq('id', ingresoId).maybeSingle(),
        supabase.from('items_paciente').select('semaforo_caidas').eq('ingreso_id', ingresoId).maybeSingle(),
      ])
      if (!vigente) return
      if ((ing as { estado?: string } | null)?.estado !== 'activo') { onTerminar(); return }
      setSemaforo((it as { semaforo_caidas?: string | null } | null)?.semaforo_caidas ?? null)
      setCargando(false)
    })()
    return () => { vigente = false }
  }, [ingresoId])

  if (cargando) return null

  if (contencionAbierta) {
    return <ModalContencion ingresoId={ingresoId} pacienteInfo={pacienteInfo} onClose={onTerminar} onGuardado={onTerminar} />
  }

  const quien = pacienteInfo ? `${pacienteInfo.nombre}${pacienteInfo.habitacion != null ? ` · Hab. ${pacienteInfo.habitacion}` : ''}` : null

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-[70] p-4" role="dialog" aria-modal="true" data-testid="revision-tras-incidencia">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm p-5 space-y-4">
        <div>
          <p className="text-xs font-semibold text-emerald-700">
            {tipo === 'semaforo' ? 'Caída registrada' : 'Agresividad registrada'}
          </p>
          <h3 className="font-bold text-slate-800 mt-0.5">
            {tipo === 'semaforo' ? '¿Revisar el semáforo de caídas de este paciente?' : '¿Revisar la contención de este paciente?'}
          </h3>
          {quien && <p className="text-xs text-slate-500 mt-0.5">{quien}</p>}
        </div>

        {tipo === 'semaforo' ? (
          <div className="space-y-2">
            <p className="text-sm text-slate-600">
              {semaforo ? <>Ahora mismo está en <strong>{semaforo}</strong>.</> : 'Ahora mismo no tiene semáforo asignado.'} Puedes cambiarlo aquí.
            </p>
            <SemaforoCaidas ingresoId={ingresoId} valor={semaforo} onCambio={setSemaforo} variante="botones" />
          </div>
        ) : (
          <p className="text-sm text-slate-600">
            Tras una agresión suele hacer falta repasar si la pauta de contención sigue siendo la adecuada.
          </p>
        )}

        <div className="flex justify-end gap-3">
          {tipo === 'semaforo' ? (
            <button onClick={onTerminar} className="btn-primary">Listo</button>
          ) : (
            <>
              <button onClick={onTerminar} className="btn-secondary">Ahora no</button>
              <button onClick={() => setContencionAbierta(true)} className="btn-primary">Revisar contención</button>
            </>
          )}
        </div>
      </div>
    </div>
  )
}
