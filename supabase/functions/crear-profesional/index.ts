// ============================================================
// Edge Function: crear-profesional
//
// Crea la cuenta de acceso (correo + contraseña) y la ficha de
// profesional, ya enlazadas. La llave maestra (service_role) vive
// aquí dentro, en el servidor: NUNCA llega al navegador.
//
// Seguridad: solo un administrador autenticado puede invocarla.
// ============================================================

import { createClient } from 'jsr:@supabase/supabase-js@2'

// Permitir que el navegador (la app en Vercel) llame a la función.
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
  // El navegador manda primero una petición OPTIONS de comprobación.
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors })

  try {
    // Cliente con la llave maestra: se salta los candados. Solo para
    // lo que de verdad necesita privilegios de servidor (crear/borrar
    // cuentas de Auth). Para escribir en "profesionales" se usa un
    // cliente aparte, con el JWT de quien llama — así la auditoría
    // atribuye el cambio al administrador real, no a "Sistema" (que
    // es lo que pasaba usando la llave maestra también para esto:
    // auth.uid() no resuelve a nadie con esa clave).
    const admin = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    )

    // ── 1. ¿Quién llama? Validar su sesión ──────────────────
    const authHeader = req.headers.get('Authorization') ?? ''
    const jwt = authHeader.replace('Bearer ', '')
    if (!jwt) return respuesta(401, { error: 'No autorizado' })

    const { data: userData, error: userErr } = await admin.auth.getUser(jwt)
    if (userErr || !userData.user) return respuesta(401, { error: 'Sesión no válida' })

    // Este cliente sí lleva la identidad de quien llama — se usa para
    // cualquier escritura en "profesionales", para que quede bien
    // atribuida en la auditoría.
    const actor = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_ANON_KEY')!,
      { global: { headers: { Authorization: `Bearer ${jwt}` } } },
    )

    // ── 2. ¿Es administrador? Si no, se corta aquí ──────────
    const { data: perfil } = await admin
      .from('profesionales')
      .select('es_admin')
      .eq('user_id', userData.user.id)
      .eq('activo', true)
      .maybeSingle()

    if (!perfil?.es_admin) {
      return respuesta(403, { error: 'Solo un administrador puede crear profesionales.' })
    }

    // ── 3. Datos del nuevo profesional ──────────────────────
    const body = await req.json()
    const { nombre, apellidos, rol, email, password, colegiado, especialidad } = body ?? {}

    if (!nombre || !apellidos || !rol || !email || !password) {
      return respuesta(400, { error: 'Faltan datos obligatorios (nombre, apellidos, rol, correo y contraseña).' })
    }
    if (String(password).length < 8) {
      return respuesta(400, { error: 'La contraseña debe tener al menos 8 caracteres.' })
    }

    // ── 4. Crear la cuenta de acceso ────────────────────────
    // email_confirm: true → puede entrar de inmediato, sin verificar correo.
    const { data: creada, error: crearErr } = await admin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
    })
    if (crearErr || !creada.user) {
      return respuesta(400, { error: crearErr?.message ?? 'No se pudo crear la cuenta.' })
    }

    // ── 5. Crear la ficha de profesional, enlazada a la cuenta ──
    const { error: fichaErr } = await actor.from('profesionales').insert({
      nombre,
      apellidos,
      rol,
      colegiado: colegiado ?? null,
      especialidad: especialidad ?? null,
      activo: true,
      es_admin: false,
      user_id: creada.user.id,
    })

    if (fichaErr) {
      // Si la ficha falla, deshacemos la cuenta para no dejar huérfanos.
      await admin.auth.admin.deleteUser(creada.user.id)
      return respuesta(400, { error: 'La cuenta se creó pero falló la ficha: ' + fichaErr.message })
    }

    return respuesta(200, { ok: true })
  } catch (e) {
    return respuesta(500, { error: 'Error inesperado: ' + String(e) })
  }
})
