import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getCurrentOrgId } from "@/lib/org";
import {
  exchangeCode, fetchUserEmail, fetchCalendars, publicOrigin,
} from "@/lib/integrations/google";

export const dynamic = "force-dynamic";

/** Callback del OAuth de Google: intercambia el código y guarda la conexión. */
export async function GET(req: Request) {
  const origin = publicOrigin(req);
  const url = new URL(req.url);
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  const err = url.searchParams.get("error");
  const settings = `${origin}/settings/integrations`;

  if (err) return NextResponse.redirect(`${settings}?error=${encodeURIComponent(err)}`);

  // Verifica el state anti-CSRF
  const cookieState = cookies().get("g_oauth_state")?.value;
  cookies().delete("g_oauth_state");
  if (!code || !state || !cookieState || state !== cookieState) {
    return NextResponse.redirect(`${settings}?error=invalid_state`);
  }

  const orgId = await getCurrentOrgId();
  if (!orgId) return NextResponse.redirect(`${origin}/login`);

  try {
    const tokens = await exchangeCode(req, code);
    const [email, calendars] = await Promise.all([
      fetchUserEmail(tokens.access_token),
      fetchCalendars(tokens.access_token),
    ]);

    const supabase = createClient();
    // Conserva el refresh_token previo si Google no lo devuelve esta vez
    let refresh = tokens.refresh_token ?? null;
    if (!refresh) {
      const { data: prev } = await createAdminClient()
        .from("integrations")
        .select("refresh_token")
        .eq("org_id", orgId)
        .eq("provider", "google_calendar")
        .maybeSingle();
      refresh = (prev?.refresh_token as string | undefined) ?? null;
    }

    const expiry = new Date(Date.now() + (tokens.expires_in ?? 3600) * 1000).toISOString();

    await supabase.from("integrations").upsert(
      {
        org_id: orgId,
        provider: "google_calendar",
        account_email: email,
        access_token: tokens.access_token,
        refresh_token: refresh,
        token_expiry: expiry,
        scope: tokens.scope ?? null,
        data: { calendars },
        updated_at: new Date().toISOString(),
      },
      { onConflict: "org_id,provider" }
    );

    return NextResponse.redirect(`${settings}?connected=1`);
  } catch (e: any) {
    return NextResponse.redirect(`${settings}?error=${encodeURIComponent(e?.message ?? "oauth_failed")}`);
  }
}
