// ============================================================
// Edge Function: restablecer-password
//
// Permite a un administrador poner una nueva contraseña a un
// profesional (que luego se la comunica a la persona). Útil cuando
// alguien olvida la suya.
//
// Seguridad: solo un administrador autenticado puede invocarla.
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
      .maybeSingle()

    if (!perfilAdmin?.es_admin) {
      return respuesta(403, { error: 'Solo un administrador puede restablecer contraseñas.' })
    }

    // ── 3. Datos de la petición ─────────────────────────────
    const { profesionalId, nuevaPassword } = (await req.json()) ?? {}
    if (!profesionalId || !nuevaPassword) {
      return respuesta(400, { error: 'Faltan datos (profesional y nueva contraseña).' })
    }
    if (String(nuevaPassword).length < 8) {
      return respuesta(400, { error: 'La contraseña debe tener al menos 8 caracteres.' })
    }

    // ── 4. Buscar la cuenta enlazada ────────────────────────
    const { data: objetivo, error: objErr } = await admin
      .from('profesionales')
      .select('user_id')
      .eq('id', profesionalId)
      .maybeSingle()

    if (objErr || !objetivo) return respuesta(404, { error: 'Profesional no encontrado.' })
    if (!objetivo.user_id) {
      return respuesta(400, { error: 'Este profesional no tiene cuenta de acceso.' })
    }

    // ── 5. Cambiar la contraseña ────────────────────────────
    const { error: updErr } = await admin.auth.admin.updateUserById(objetivo.user_id, {
      password: String(nuevaPassword),
    })
    if (updErr) return respuesta(400, { error: 'No se pudo cambiar la contraseña: ' + updErr.message })

    return respuesta(200, { ok: true })
  } catch (e) {
    return respuesta(500, { error: 'Error inesperado: ' + String(e) })
  }
})
