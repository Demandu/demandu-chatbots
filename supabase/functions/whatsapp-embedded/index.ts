// Edge Function: whatsapp-embedded
// Cierra el Embedded Signup de Meta SIN tocar el webhook a nivel de app.
//
// PATRÓN (mismo que Demandu Property Management / demandu-residencial):
// se reusa la app "Demandu Tech" (359551260017042) que ya es Business
// Partner y que hoy tiene su webhook a nivel de app apuntando a
// BotPenguin. NO cambiamos ese webhook. En su lugar, al conectar un
// número nuevo hacemos un OVERRIDE de webhook POR NÚMERO
// (webhook_configuration.override_callback_uri) hacia nuestra función
// `whatsapp`. Así:
//   • Los números que siguen en BotPenguin -> webhook de app (BotPenguin), intacto.
//   • Los números nuevos de Demandu -> override -> nuestra función.
//
// No hace falta App Secret ni intercambio de code: usamos un token de
// System User de larga duración (secreto WHATSAPP_TOKEN) con permisos
// whatsapp_business_management + whatsapp_business_messaging, igual que
// residencial. El navegador nos manda { waba_id, phone_number_id, bot_id }
// (que obtiene del evento WA_EMBEDDED_SIGNUP del popup) + su access_token
// de Supabase para identificar la organización.
//
// Se despliega con verify_jwt=false porque validamos el token manualmente.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const GRAPH = "https://graph.facebook.com/v20.0";

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

function generatePin(): string {
  // PIN de verificación en dos pasos (6 dígitos) para /register.
  let pin = "";
  for (let i = 0; i < 6; i++) pin += Math.floor(Math.random() * 10);
  return pin;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return json({ error: "method_not_allowed" }, 405);

  const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
  const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const ANON = Deno.env.get("SUPABASE_ANON_KEY")!;
  const WHATSAPP_TOKEN = Deno.env.get("WHATSAPP_TOKEN");
  const VERIFY_TOKEN = Deno.env.get("WHATSAPP_VERIFY_TOKEN") ?? "demandu_wa_2026";
  if (!WHATSAPP_TOKEN) return json({ error: "server_not_configured" }, 500);

  // 0) Autenticar al usuario a partir del access_token del navegador
  const authHeader = req.headers.get("Authorization") ?? "";
  const token = authHeader.replace(/^Bearer\s+/i, "");
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
  const waba_id = body.waba_id as string | undefined;
  const phone_number_id = body.phone_number_id as string | undefined;
  const bot_id = body.bot_id as string | undefined;
  if (!waba_id || !phone_number_id) {
    return json({ error: "missing_waba_or_phone" });
  }

  try {
    // 1) Suscribe nuestra app (Demandu Tech) al WABA de este número
    const subRes = await fetch(`${GRAPH}/${waba_id}/subscribed_apps`, {
      method: "POST",
      headers: { Authorization: `Bearer ${WHATSAPP_TOKEN}` },
    });
    const subJson = await subRes.json().catch(() => ({}));
    if (!subRes.ok) {
      return json({
        error: `no_subscribe: ${subJson?.error?.message ?? JSON.stringify(subJson)}`,
      });
    }

    // 2) Datos visibles del número
    let display: string | null = null;
    try {
      const info = await fetch(
        `${GRAPH}/${phone_number_id}?fields=display_phone_number,verified_name`,
        { headers: { Authorization: `Bearer ${WHATSAPP_TOKEN}` } },
      ).then((r) => r.json());
      display = info?.display_phone_number ?? null;
    } catch {
      /* no-op */
    }

    // 3) OVERRIDE de webhook POR NÚMERO -> nuestra función `whatsapp`.
    //    Esto NO cambia el webhook a nivel de app (BotPenguin sigue igual).
    const callbackUrl = `${SUPABASE_URL}/functions/v1/whatsapp`;
    const overrideRes = await fetch(`${GRAPH}/${phone_number_id}`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${WHATSAPP_TOKEN}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        webhook_configuration: {
          override_callback_uri: callbackUrl,
          verify_token: VERIFY_TOKEN,
        },
      }),
    });
    const overrideJson = await overrideRes.json().catch(() => ({}));
    if (!overrideRes.ok) {
      console.error("[whatsapp-embedded] override falló:", overrideJson);
    }

    // 4) Registra el número para Cloud API (idempotente)
    const pin = generatePin();
    const regRes = await fetch(`${GRAPH}/${phone_number_id}/register`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${WHATSAPP_TOKEN}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ messaging_product: "whatsapp", pin }),
    });
    let registerOk = regRes.ok;
    if (!regRes.ok) {
      const regJson = await regRes.json().catch(() => ({}));
      const msg: string =
        regJson?.error?.error_user_msg ?? regJson?.error?.message ?? "";
      registerOk = /already registered|already verified/i.test(msg);
      if (!registerOk) console.error("[whatsapp-embedded] register falló:", msg);
    }

    // 5) Guarda el canal. Enviamos con el mismo System User token.
    const { error } = await admin.from("whatsapp_channels").upsert(
      {
        org_id: orgId,
        phone_number_id,
        waba_id,
        display_number: display,
        access_token: WHATSAPP_TOKEN,
        bot_id: bot_id || null,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "org_id" },
    );
    if (error) return json({ error: error.message });

    return json({
      ok: true,
      number: display,
      phone_number_id,
      webhookOverrideOk: overrideRes.ok,
      registerOk,
    });
  } catch (e) {
    return json({ error: (e as Error)?.message ?? "embedded_signup_failed" });
  }
});
