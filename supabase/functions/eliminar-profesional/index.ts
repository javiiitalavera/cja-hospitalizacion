// ============================================================
// Edge Function: eliminar-profesional
//
// Borra por completo a un profesional (ficha + cuenta de acceso).
// Pensado para limpiar entradas de PRUEBA o creadas por error.
//
// Protección de trazabilidad: se comprueba ANTES de tocar nada si la
// persona tiene registros clínicos a su nombre (ingresos donde es
// médico responsable, incidencias que registró). Si los tiene, se
// rechaza sin más y no se borra nada — ni ficha ni cuenta. Así se
// evita el estado a medias de intentar borrar y deshacerlo si falla:
// o se puede borrar entero, o no se toca nada.
//
// Seguridad: solo un administrador, y nadie puede borrarse a sí mismo.
// ============================================================

import { createClient } from 'jsr:@supabase/supabase-js@2'

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

function respuesta(status: number, cuerpo: unknown) {
  return new Response(JSON.stringify(cuerpo), {
    status,
    headers: { ...cors, 'Content-Type': 'application/json' },
  })
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors })

  try {
    const admin = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    )

    // ── 1. ¿Quién llama? ────────────────────────────────────
    const jwt = (req.headers.get('Authorization') ?? '').replace('Bearer ', '')
    if (!jwt) return respuesta(401, { error: 'No autorizado' })

    const { data: userData, error: userErr } = await admin.auth.getUser(jwt)
    if (userErr || !userData.user) return respuesta(401, { error: 'Sesión no válida' })

    // Con la identidad de quien llama, para que el borrado quede
    // atribuido al administrador real en la auditoría.
    const actor = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_ANON_KEY')!,
      { global: { headers: { Authorization: `Bearer ${jwt}` } } },
    )

    // ── 2. ¿Es administrador? ───────────────────────────────
    const { data: perfilAdmin } = await admin
      .from('profesionales')
      .select('es_admin')
      .eq('user_id', userData.user.id)
      .eq('activo', true)
      .maybeSingle()

    if (!perfilAdmin?.es_admin) {
      return respuesta(403, { error: 'Solo un administrador puede eliminar profesionales.' })
    }

    // ── 3. Datos de la petición ─────────────────────────────
    const { profesionalId } = (await req.json()) ?? {}
    if (!profesionalId) return respuesta(400, { error: 'Falta el profesional a eliminar.' })

    // ── 4. Buscar al profesional objetivo ───────────────────
    const { data: objetivo, error: objErr } = await admin
      .from('profesionales')
      .select('user_id')
      .eq('id', profesionalId)
      .maybeSingle()

    if (objErr || !objetivo) return respuesta(404, { error: 'Profesional no encontrado.' })

    if (objetivo.user_id && objetivo.user_id === userData.user.id) {
      return respuesta(400, { error: 'No puedes eliminarte a ti mismo.' })
    }

    // ── 5. Comprobar ANTES de tocar nada si tiene datos clínicos ──
    // Las dos únicas tablas que de verdad referencian a un profesional
    // en producción: ingresos (médico responsable) y eventos
    // (quién registró la incidencia).
    const [{ count: comoMedico }, { count: comoRegistrador }] = await Promise.all([
      admin.from('ingresos').select('id', { count: 'exact', head: true }).eq('medico_responsable_id', profesionalId),
      admin.from('eventos').select('id', { count: 'exact', head: true }).eq('registrado_por_id', profesionalId),
    ])

    if ((comoMedico ?? 0) > 0 || (comoRegistrador ?? 0) > 0) {
      return respuesta(409, {
        error:
          'No se puede eliminar: esta persona tiene registros clínicos a su nombre ' +
          '(como médico responsable de un ingreso o como autora de una incidencia). ' +
          'Para conservar la trazabilidad, dale de baja en su lugar.',
      })
    }

    // ── 6. Borrar la ficha ──────────────────────────────────
    // Ya sabemos que no tiene datos asociados, así que esto debería
    // funcionar; el candado de la BD (FK) queda como red de seguridad
    // por si algo cambió justo en este instante.
    const { error: delErr } = await actor
      .from('profesionales')
      .delete()
      .eq('id', profesionalId)

    if (delErr) {
      const tieneDatos =
        delErr.code === '23503' ||
        /foreign key|violates|referenced/i.test(delErr.message ?? '')
      if (tieneDatos) {
        return respuesta(409, {
          error:
            'No se puede eliminar: esta persona tiene registros clínicos a su nombre. ' +
            'Para conservar la trazabilidad, dale de baja en su lugar.',
        })
      }
      return respuesta(400, { error: 'No se pudo eliminar: ' + delErr.message })
    }

    // ── 7. Borrar también la cuenta de acceso (si tenía) ────
    if (objetivo.user_id) {
      const { error: authErr } = await admin.auth.admin.deleteUser(objetivo.user_id)
      if (authErr) {
        // La ficha ya se borró (paso 6) y no hay vuelta atrás sencilla
        // para eso; avisamos con claridad de que queda una cuenta de
        // acceso suelta, para que se resuelva a mano si hace falta.
        // (200, no un código de error HTTP: así el aviso llega tal
        // cual a la pantalla en vez de perderse en el manejo genérico
        // de errores de red de la librería de Supabase.)
        return respuesta(200, {
          error:
            'La ficha se eliminó, pero no se pudo borrar la cuenta de acceso (' + authErr.message + '). ' +
            'Puede quedar bloqueando ese correo para futuras cuentas; revísalo en Supabase Auth.',
        })
      }
    }

    return respuesta(200, { ok: true })
  } catch (e) {
    return respuesta(500, { error: 'Error inesperado: ' + String(e) })
  }
})
