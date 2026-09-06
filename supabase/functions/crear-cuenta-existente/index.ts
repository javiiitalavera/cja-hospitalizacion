// ============================================================
// Edge Function: crear-cuenta-existente
//
// Da acceso (correo + contraseña) a un profesional que YA tiene ficha
// pero aún no tiene cuenta. Crea la cuenta y la enlaza a esa ficha
// (a diferencia de "crear-profesional", que crea también la ficha).
//
// Seguridad: solo un administrador autenticado.
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

    // Con la identidad de quien llama, para que enlazar la cuenta
    // quede atribuido al administrador real en la auditoría.
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
      return respuesta(403, { error: 'Solo un administrador puede crear cuentas de acceso.' })
    }

    // ── 3. Datos de la petición ─────────────────────────────
    const { profesionalId, email, password } = (await req.json()) ?? {}
    if (!profesionalId || !email || !password) {
      return respuesta(400, { error: 'Faltan datos (profesional, correo y contraseña).' })
    }
    if (String(password).length < 8) {
      return respuesta(400, { error: 'La contraseña debe tener al menos 8 caracteres.' })
    }

    // ── 4. Comprobar la ficha y que no tenga ya cuenta ──────
    const { data: ficha, error: fichaErr } = await admin
      .from('profesionales')
      .select('user_id')
      .eq('id', profesionalId)
      .maybeSingle()

    if (fichaErr || !ficha) return respuesta(404, { error: 'Profesional no encontrado.' })
    if (ficha.user_id) {
      return respuesta(400, { error: 'Este profesional ya tiene una cuenta de acceso.' })
    }

    // ── 5. Crear la cuenta ──────────────────────────────────
    const { data: creada, error: crearErr } = await admin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
    })
    if (crearErr || !creada.user) {
      return respuesta(400, { error: crearErr?.message ?? 'No se pudo crear la cuenta.' })
    }

    // ── 6. Enlazar la cuenta a la ficha existente ───────────
    // La condición ".is('user_id', null)" cierra la ventana de carrera:
    // si dos peticiones casi simultáneas llegan aquí para la misma
    // ficha, solo la primera consigue enlazar (afecta a una fila); la
    // segunda no actualiza nada y lo detectamos por el "select" vacío.
    const { data: linked, error: linkErr } = await actor
      .from('profesionales')
      .update({ user_id: creada.user.id })
      .eq('id', profesionalId)
      .is('user_id', null)
      .select('id')

    if (linkErr) {
      await admin.auth.admin.deleteUser(creada.user.id)
      return respuesta(400, { error: 'La cuenta se creó pero falló el enlace: ' + linkErr.message })
    }
    if (!linked || linked.length === 0) {
      // Alguien más enlazó esta ficha justo antes: deshacemos la cuenta
      // que acabamos de crear para no dejarla huérfana.
      await admin.auth.admin.deleteUser(creada.user.id)
      return respuesta(409, { error: 'Este profesional ya ha recibido una cuenta desde otra petición. Recarga y revisa antes de reintentar.' })
    }

    return respuesta(200, { ok: true })
  } catch (e) {
    return respuesta(500, { error: 'Error inesperado: ' + String(e) })
  }
})
