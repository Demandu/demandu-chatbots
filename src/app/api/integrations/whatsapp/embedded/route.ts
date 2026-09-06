import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getCurrentOrgId } from "@/lib/org";

export const dynamic = "force-dynamic";

const GRAPH = "https://graph.facebook.com/v20.0";

/** Cierra el Embedded Signup: intercambia el código por token y guarda el canal. */
export async function POST(req: Request) {
  const orgId = await getCurrentOrgId();
  if (!orgId) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const { code, bot_id, phone_number_id, waba_id } = await req.json().catch(() => ({} as any));
  if (!code) return NextResponse.json({ error: "missing_code" });

  const appId = process.env.NEXT_PUBLIC_META_APP_ID;
  const secret = process.env.META_APP_SECRET;
  if (!appId || !secret) return NextResponse.json({ error: "server_not_configured" });

  try {
    // 1) Intercambia el código por un token de negocio (System User de la integración)
    const tokRes = await fetch(
      `${GRAPH}/oauth/access_token?client_id=${appId}&client_secret=${secret}&code=${encodeURIComponent(code)}`
    );
    const tok = await tokRes.json();
    if (!tok.access_token) {
      return NextResponse.json({ error: tok.error?.message ?? "token_exchange_failed" });
    }
    const access_token: string = tok.access_token;

    // 2) Resuelve el phone_number_id si el popup no lo entregó
    let pnid = phone_number_id as string | undefined;
    let waid = waba_id as string | undefined;
    if (!pnid && waid) {
      const pn = await fetch(`${GRAPH}/${waid}/phone_numbers?access_token=${access_token}`)
        .then((r) => r.json())
        .catch(() => null);
      pnid = pn?.data?.[0]?.id;
    }
    if (!pnid) return NextResponse.json({ error: "no_phone_number" });

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

    // 4) Número visible (para mostrar en la UI)
    let display: string | null = null;
    try {
      const info = await fetch(`${GRAPH}/${pnid}?fields=display_phone_number&access_token=${access_token}`).then((r) => r.json());
      display = info?.display_phone_number ?? null;
    } catch {
      /* no-op */
    }

    await createClient()
      .from("whatsapp_channels")
      .upsert(
        {
          org_id: orgId,
          phone_number_id: pnid,
          waba_id: waid ?? null,
          display_number: display,
          access_token,
          bot_id: bot_id || null,
          updated_at: new Date().toISOString(),
        },
        { onConflict: "org_id" }
      );

    return NextResponse.json({ ok: true });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message ?? "embedded_signup_failed" });
  }
}
