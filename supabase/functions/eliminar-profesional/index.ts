// ============================================================
// Edge Function: eliminar-profesional
//
// Borra por completo a un profesional (ficha + cuenta de acceso).
// Pensado para limpiar entradas de PRUEBA o creadas por error.
//
// Protección de trazabilidad: si la persona tiene registros clínicos
// asociados (incidencias, ingresos, informes…), la base de datos
// rechaza el borrado y se devuelve un aviso para usar la baja. Así
// nunca se puede destruir por accidente el rastro de alguien real.
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

    // ── 5. Borrar la ficha ──────────────────────────────────
    // Si tiene registros clínicos asociados, la BD lo rechaza (FK).
    const { error: delErr } = await admin
      .from('profesionales')
      .delete()
      .eq('id', profesionalId)

    if (delErr) {
      // 23503 = violación de clave foránea → tiene datos asociados.
      const tieneDatos =
        delErr.code === '23503' ||
        /foreign key|violates|referenced/i.test(delErr.message ?? '')
      if (tieneDatos) {
        return respuesta(409, {
          error:
            'No se puede eliminar: esta persona tiene registros clínicos a su nombre ' +
            '(incidencias, ingresos o informes). Para conservar la trazabilidad, dale de baja en su lugar.',
        })
      }
      return respuesta(400, { error: 'No se pudo eliminar: ' + delErr.message })
    }

    // ── 6. Borrar también la cuenta de acceso (si tenía) ────
    if (objetivo.user_id) {
      await admin.auth.admin.deleteUser(objetivo.user_id)
    }

    return respuesta(200, { ok: true })
  } catch (e) {
    return respuesta(500, { error: 'Error inesperado: ' + String(e) })
  }
})
