// ============================================================
// Edge Function: cambiar-email-profesional
//
// Permite a un administrador cambiar el correo de acceso de un
// profesional que YA tiene cuenta (una errata al crearla, un cambio
// de correo institucional...). Antes no había forma de hacerlo desde
// la aplicación — había que entrar directamente en Supabase.
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
      .eq('activo', true)
      .maybeSingle()

    if (!perfilAdmin?.es_admin) {
      return respuesta(403, { error: 'Solo un administrador puede cambiar el correo de acceso.' })
    }

    // ── 3. Datos de la petición ─────────────────────────────
    const { profesionalId, nuevoEmail } = (await req.json()) ?? {}
    if (!profesionalId || !nuevoEmail) {
      return respuesta(400, { error: 'Faltan datos (profesional y nuevo correo).' })
    }

    // ── 4. Buscar la cuenta enlazada ────────────────────────
    const { data: objetivo, error: objErr } = await admin
      .from('profesionales')
      .select('user_id')
      .eq('id', profesionalId)
      .maybeSingle()

    if (objErr || !objetivo) return respuesta(404, { error: 'Profesional no encontrado.' })
    if (!objetivo.user_id) {
      return respuesta(400, { error: 'Este profesional no tiene todavía cuenta de acceso.' })
    }

    // ── 5. Cambiar el correo ────────────────────────────────
    // email_confirm: true — igual que al crear la cuenta, para que
    // pueda entrar de inmediato con el correo nuevo sin verificarlo.
    const { error: updErr } = await admin.auth.admin.updateUserById(objetivo.user_id, {
      email: String(nuevoEmail).trim(),
      email_confirm: true,
    })
    if (updErr) return respuesta(400, { error: 'No se pudo cambiar el correo: ' + updErr.message })

    // El correo vive solo en Auth, no en "profesionales" — sin este
    // registro explícito, el cambio no dejaría ningún rastro en la
    // auditoría.
    await admin.from('auditoria').insert({
      tabla: 'profesionales',
      registro_id: profesionalId,
      accion: 'cambio_email',
      usuario_id: userData.user.id,
    })

    return respuesta(200, { ok: true })
  } catch (e) {
    return respuesta(500, { error: 'Error inesperado: ' + String(e) })
  }
})
