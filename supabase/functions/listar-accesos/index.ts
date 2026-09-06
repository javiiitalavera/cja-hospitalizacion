// ============================================================
// Edge Function: listar-accesos
//
// El correo de acceso y la fecha del último inicio de sesión viven
// solo en Auth, no en la tabla "profesionales" — antes de esto, la
// pantalla de Personal no tenía forma de mostrarlos (solo sabía
// "tiene cuenta" o "no tiene cuenta"). Devuelve ambos datos para
// todo el personal con cuenta, de una sola vez.
//
// Seguridad: solo un administrador autenticado puede invocarla. No
// devuelve nada más de cada cuenta (ni contraseñas, que Auth nunca
// expone en ningún caso, ni ningún otro dato).
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
      return respuesta(403, { error: 'Solo un administrador puede ver esta información.' })
    }

    // ── 3. Recorrer todas las páginas de usuarios de Auth ───
    // listUsers() no devuelve todo de golpe — con el tamaño de
    // equipo de hoy probablemente cabe en una sola página, pero se
    // recorre por si acaso hasta que ya no queden más.
    const accesos: Record<string, { email: string | null; ultimo_acceso: string | null }> = {}
    let pagina = 1
    while (true) {
      const { data, error } = await admin.auth.admin.listUsers({ page: pagina, perPage: 200 })
      if (error) return respuesta(400, { error: 'No se pudo leer Auth: ' + error.message })
      for (const u of data.users) {
        accesos[u.id] = { email: u.email ?? null, ultimo_acceso: u.last_sign_in_at ?? null }
      }
      if (data.users.length < 200) break
      pagina++
    }

    return respuesta(200, { accesos })
  } catch (e) {
    return respuesta(500, { error: 'Error inesperado: ' + String(e) })
  }
})
