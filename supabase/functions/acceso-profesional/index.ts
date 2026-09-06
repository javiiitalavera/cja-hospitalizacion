// ============================================================
// Edge Function: acceso-profesional
//
// Da de baja (o reactiva) a un profesional de forma completa y
// coherente, SIN borrar nada:
//   • baja      → marca la ficha como inactiva y BLOQUEA su acceso
//                 (no podrá iniciar sesión aunque sepa su contraseña).
//   • reactivar → marca la ficha activa y DESBLOQUEA el acceso.
//
// No se borra la cuenta ni la ficha: se conserva toda la trazabilidad
// (informes firmados, incidencias registradas, etc.). El bloqueo es
// reversible.
//
// Seguridad: solo un administrador autenticado puede invocarla, y
// nadie puede darse de baja a sí mismo (evita quedarse fuera).
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

// "Bloqueo" muy largo (~100 años): en la práctica, indefinido pero reversible.
const BLOQUEO = '876000h'

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

    // Con la identidad de quien llama — para que la baja/reactivación
    // quede atribuida al administrador real en la auditoría, no a
    // "Sistema" (lo que pasaba usando la llave maestra también para
    // este cambio).
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
      return respuesta(403, { error: 'Solo un administrador puede dar de baja o reactivar.' })
    }

    // ── 3. Datos de la petición ─────────────────────────────
    const { profesionalId, activo } = (await req.json()) ?? {}
    if (!profesionalId || typeof activo !== 'boolean') {
      return respuesta(400, { error: 'Faltan datos (profesionalId y activo).' })
    }

    // ── 4. Buscar al profesional objetivo ───────────────────
    const { data: objetivo, error: objErr } = await admin
      .from('profesionales')
      .select('user_id')
      .eq('id', profesionalId)
      .maybeSingle()

    if (objErr || !objetivo) return respuesta(404, { error: 'Profesional no encontrado.' })

    // No permitir darse de baja a uno mismo.
    if (objetivo.user_id && objetivo.user_id === userData.user.id) {
      return respuesta(400, { error: 'No puedes cambiar tu propio acceso.' })
    }

    // ── 5. Bloquear o desbloquear PRIMERO la cuenta de acceso ──
    // (solo si el profesional tiene cuenta enlazada). Se hace antes que
    // el cambio en la ficha para poder deshacerlo limpiamente si falla.
    if (objetivo.user_id) {
      const { error: banErr } = await admin.auth.admin.updateUserById(objetivo.user_id, {
        ban_duration: activo ? 'none' : BLOQUEO,
      })
      if (banErr) {
        return respuesta(400, { error: 'No se pudo cambiar el acceso: ' + banErr.message + '. Nada se ha modificado, puedes reintentarlo.' })
      }
    }

    // ── 6. Actualizar la ficha (activo / inactivo) ──────────
    const { error: updErr } = await actor
      .from('profesionales')
      .update({ activo })
      .eq('id', profesionalId)

    if (updErr) {
      // La cuenta ya se bloqueó/desbloqueó pero la ficha no se pudo
      // actualizar: deshacemos el paso de Auth para no dejar un estado
      // a medias (ficha y cuenta desincronizadas).
      if (objetivo.user_id) {
        await admin.auth.admin.updateUserById(objetivo.user_id, {
          ban_duration: activo ? BLOQUEO : 'none',
        })
      }
      return respuesta(400, { error: 'No se pudo actualizar la ficha: ' + updErr.message + '. Se ha deshecho el cambio de acceso, puedes reintentarlo.' })
    }

    return respuesta(200, { ok: true })
  } catch (e) {
    return respuesta(500, { error: 'Error inesperado: ' + String(e) })
  }
})
