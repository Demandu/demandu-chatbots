import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createAdminClient } from "@/lib/supabase/admin";
import { getCurrentOrgId } from "@/lib/org";
import { misPermisos } from "@/lib/permisos-server";
import { publicOrigin } from "@/lib/integrations/google";
import {
  intercambiarCodigo, quienSoy, suscribirse, limpiarSuscripciones, nuevaClaveDeFirma,
} from "@/lib/integrations/calendly";

export const dynamic = "force-dynamic";

/**
 * Vuelta del OAuth de Calendly: guarda la conexión y se suscribe a los avisos.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * LA SUSCRIPCIÓN SE HACE AQUÍ, AL CONECTAR, y no la primera vez que haga falta.
 * Una cita que alguien agendó desde el enlace de la biografía de Instagram
 * tiene que entrar a la Bandeja igual que una del chat — y para eso el aviso
 * tiene que estar suscrito desde el minuto uno, no desde la primera cita que
 * pase por nosotros.
 *
 * SI LA SUSCRIPCIÓN FALLA, LA CONEXIÓN SE GUARDA IGUAL. Agendar desde el chat
 * funciona sin avisos; quedarse sin conectar por eso sería cambiar una cosa
 * grande por una pequeña. Se apunta para poder reintentarlo.
 * ─────────────────────────────────────────────────────────────────────────────
 */
export async function GET(req: Request) {
  const origen = publicOrigin(req);
  const ajustes = `${origen}/settings/integrations`;
  const url = new URL(req.url);
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  const err = url.searchParams.get("error");

  const galletas = cookies();
  const stateGuardado = galletas.get("cal_state")?.value;
  const verificador = galletas.get("cal_verifier")?.value;
  galletas.delete("cal_state");
  galletas.delete("cal_verifier");

  if (err) return NextResponse.redirect(`${ajustes}?error=${encodeURIComponent(err)}`);

  // EL `state` SE COMPRUEBA SIEMPRE: es lo único que impide que alguien te
  // enganche SU cuenta de Calendly a TU organización con un enlace.
  if (!code || !state || !stateGuardado || state !== stateGuardado || !verificador) {
    return NextResponse.redirect(`${ajustes}?error=calendly_state`);
  }

  const orgId = await getCurrentOrgId();
  if (!orgId) return NextResponse.redirect(`${origen}/login`);

  const { permisos } = await misPermisos();
  if (!permisos.has("conexiones")) return NextResponse.redirect(`${ajustes}?error=sin_permiso`);

  try {
    const t = await intercambiarCodigo({
      clientId: process.env.CALENDLY_CLIENT_ID ?? "",
      clientSecret: process.env.CALENDLY_CLIENT_SECRET ?? "",
      code,
      redirect: `${origen}/api/integrations/calendly/callback`,
      verificador,
    });

    const yo = await quienSoy(t.access_token);
    const clave = nuevaClaveDeFirma();
    const aviso = `${origen}/api/webhooks/calendly/${orgId}`;

    // SE BORRA LO VIEJO ANTES DE SUSCRIBIR. Una suscripción que sobrevivió a
    // una desconexión trae la clave de firma anterior: los avisos llegarían y
    // los rechazaríamos por firma inválida, sin un solo error a la vista. Ver
    // la nota larga en `suscribirse`.
    await limpiarSuscripciones(t.access_token, { organizacion: yo.organizacion, url: aviso });

    const sub = await suscribirse(t.access_token, {
      organizacion: yo.organizacion,
      // ── UNA DIRECCIÓN POR CLIENTE ────────────────────────────────────
      // El aviso de Calendly no dice a qué organización pertenece de forma
      // fiable, y la clave de firma es DE ESE CLIENTE: sin saber de quién es
      // el aviso no se puede ni comprobar la firma. Poniendo el id en la
      // dirección se sabe antes de tocar nada.
      //
      // El id no es un secreto y no hace falta que lo sea: lo que autentica es
      // la firma, no la dirección.
      url: aviso,
      clave,
    });

    const sb = createAdminClient();
    await sb.from("integrations").upsert(
      {
        org_id: orgId,
        provider: "calendly",
        account_email: yo.correo,
        access_token: t.access_token,
        refresh_token: t.refresh_token,
        token_expiry: new Date(Date.now() + (t.expires_in ?? 3600) * 1000).toISOString(),
        scope: "default",
        // ── LA CLAVE DE FIRMA VA EN SU PROPIA COLUMNA, NO EN `data` ────────
        //
        // `data` es legible por cualquier MIEMBRO con sesión (la 0092 la dejó
        // dentro de la concesión, y con razón: ahí van cosas de pantalla).
        // Esta clave no es de pantalla: quien la tenga puede firmar un aviso
        // falso y meter mensajes en las conversaciones de este cliente.
        //
        // `integrations.firma` no está concedida a nadie: se lee solo con la
        // llave de servicio, al comprobar cada aviso. Ver la 0093.
        firma: clave,
        // `data` guarda lo que hace falta después y no es secreto: a quién
        // pertenece, su organización, su página pública —el enlace de respaldo
        // para el plan gratis— y si los avisos quedaron suscritos.
        data: {
          usuario_uri: yo.uri,
          organizacion_uri: yo.organizacion,
          nombre: yo.nombre,
          agenda_url: yo.agenda,
          avisos: sub.ok,
          avisos_error: sub.ok ? null : (sub.error ?? null),
        },
        updated_at: new Date().toISOString(),
      },
      { onConflict: "org_id,provider" },
    );

    return NextResponse.redirect(`${ajustes}?ok=calendly`);
  } catch (e: any) {
    console.error("[calendly callback]", e?.message ?? e);
    return NextResponse.redirect(`${ajustes}?error=calendly_fallo`);
  }
}
