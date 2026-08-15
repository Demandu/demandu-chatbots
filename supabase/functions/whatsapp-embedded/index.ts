// Edge Function: whatsapp-embedded
// Cierra el Embedded Signup de Meta: intercambia el `code` por un token de
// negocio, resuelve el número, suscribe la app al webhook de la WABA y guarda
// el canal en `whatsapp_channels`.
//
// El App Secret vive AQUÍ (secreto de Supabase: META_APP_SECRET), no en Netlify.
// El App ID es público; se usa el valor por defecto de la app "Demandu Chatbots"
// y puede sobreescribirse con el secreto META_APP_ID si algún día cambia.
//
// Auth: el navegador manda el access_token de Supabase del usuario en el header
// Authorization. Con él identificamos al usuario y su org (memberships).
// Se despliega con verify_jwt=false porque validamos el token manualmente.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const GRAPH = "https://graph.facebook.com/v20.0";
const DEFAULT_APP_ID = "1105017185196755"; // Demandu Chatbots

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function json(obj: unknown, status = 200) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: { ...cors, "Content-Type": "application/json" },
  });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return json({ error: "method_not_allowed" }, 405);

  const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
  const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const ANON = Deno.env.get("SUPABASE_ANON_KEY")!;
  const appId = Deno.env.get("META_APP_ID") ?? DEFAULT_APP_ID;
  const secret = Deno.env.get("META_APP_SECRET");
  if (!secret) return json({ error: "server_not_configured" }, 500);

  // 0) Autenticar al usuario a partir del access_token que manda el navegador
  const token = (req.headers.get("Authorization") ?? "").replace(/^Bearer\s+/i, "");
  if (!token) return json({ error: "unauthorized" }, 401);

  const userClient = createClient(SUPABASE_URL, ANON, {
    global: { headers: { Authorization: `Bearer ${token}` } },
  });
  const {
    data: { user },
  } = await userClient.auth.getUser();
  if (!user) return json({ error: "unauthorized" }, 401);

  const admin = createClient(SUPABASE_URL, SERVICE_ROLE);
  const { data: mem } = await admin
    .from("memberships")
    .select("org_id")
    .eq("user_id", user.id)
    .limit(1)
    .maybeSingle();
  const orgId = (mem as { org_id?: string } | null)?.org_id;
  if (!orgId) return json({ error: "no_org" }, 403);

  const body = await req.json().catch(() => ({} as Record<string, unknown>));
  const code = body.code as string | undefined;
  const bot_id = body.bot_id as string | undefined;
  let pnid = body.phone_number_id as string | undefined;
  const waid = body.waba_id as string | undefined;
  if (!code) return json({ error: "missing_code" });

  try {
    // 1) Intercambia el código por un token de negocio (System User)
    const tok = await fetch(
      `${GRAPH}/oauth/access_token?client_id=${appId}&client_secret=${secret}&code=${encodeURIComponent(code)}`,
    ).then((r) => r.json());
    if (!tok.access_token) {
      return json({ error: tok.error?.message ?? "token_exchange_failed" });
    }
    const access_token: string = tok.access_token;

    // 2) Resuelve el phone_number_id si el popup no lo entregó
    if (!pnid && waid) {
      const pn = await fetch(
        `${GRAPH}/${waid}/phone_numbers?access_token=${access_token}`,
      )
        .then((r) => r.json())
        .catch(() => null);
      pnid = pn?.data?.[0]?.id;
    }
    if (!pnid) return json({ error: "no_phone_number" });

    // 3) Suscribe nuestra app al webhook de esa WABA
    if (waid) {
      try {
        await fetch(`${GRAPH}/${waid}/subscribed_apps`, {
          method: "POST",
          headers: { Authorization: `Bearer ${access_token}` },
        });
      } catch {
        /* best-effort */
      }
    }

    // 4) Número visible (para la UI)
    let display: string | null = null;
    try {
      const info = await fetch(
        `${GRAPH}/${pnid}?fields=display_phone_number&access_token=${access_token}`,
      ).then((r) => r.json());
      display = info?.display_phone_number ?? null;
    } catch {
      /* no-op */
    }

    const { error } = await admin.from("whatsapp_channels").upsert(
      {
        org_id: orgId,
        phone_number_id: pnid,
        waba_id: waid ?? null,
        display_number: display,
        access_token,
        bot_id: bot_id || null,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "org_id" },
    );
    if (error) return json({ error: error.message });

    return json({ ok: true, number: display, phone_number_id: pnid });
  } catch (e) {
    return json({ error: (e as Error)?.message ?? "embedded_signup_failed" });
  }
});
