// Registro de accesos: apunta quién abre un expediente o una ficha, quién imprime o exporta a Word y cuándo
// se entra en la aplicación (se consulta en Auditoría → Accesos, solo los administradores).
//
// Se avisa a la base de datos sin esperar y sin molestar: si falla (sin conexión, o aún no está creada la
// tabla), no pasa nada y el usuario ni se entera. Quién es lo pone el servidor, no esta función, y las repeticiones
// seguidas se descartan allí.

import { supabase } from './supabase'

export type TipoAcceso = 'inicio_sesion' | 'expediente' | 'ficha_paciente' | 'impresion' | 'exportacion_word'

export interface DatosAcceso {
  ingresoId?: string | null
  pacienteId?: string | null
  detalle?: string | null
}

export function registrarAcceso(tipo: TipoAcceso, datos: DatosAcceso = {}): void {
  try {
    void supabase
      .rpc('registrar_acceso', {
        p_tipo: tipo,
        p_ingreso_id: datos.ingresoId ?? null,
        p_paciente_id: datos.pacienteId ?? null,
        p_detalle: datos.detalle ?? null,
      })
      .then(() => undefined, () => undefined)
  } catch {
    /* el registro nunca debe estropear lo que la persona está haciendo */
  }
}
