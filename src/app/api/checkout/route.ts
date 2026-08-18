import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getCurrentOrgId } from "@/lib/org";
import { createCheckout, type CartItem } from "@/lib/billing/stripe";

export const dynamic = "force-dynamic";

/**
 * Abre el pago de los complementos del carrito.
 * Requiere sesión iniciada; los precios se leen de la base, no del navegador.
 */
export async function POST(req: Request) {
  try {
    const supabase = createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: "no_autenticado" }, { status: 401 });

    const orgId = await getCurrentOrgId();
    if (!orgId) return NextResponse.json({ error: "sin_organizacion" }, { status: 403 });

    const body = await req.json().catch(() => ({}));
    const items: CartItem[] = Array.isArray(body?.items)
      ? body.items
          .filter((i: any) => typeof i?.code === "string")
          .map((i: any) => ({ code: String(i.code), quantity: Number(i.quantity) || 0 }))
      : [];

    const origin = new URL(req.url).origin;
    const result = await createCheckout({
      admin: createAdminClient(),
      orgId,
      email: user.email ?? null,
      items,
      successUrl: `${origin}/settings/plan?pago=ok`,
      cancelUrl: `${origin}/settings/plan?pago=cancelado`,
    });

    if (!result.ok) return NextResponse.json({ error: result.error }, { status: 400 });
    return NextResponse.json({ url: result.url });
  } catch (e: any) {
    console.error("[checkout]", e?.message ?? e);
    return NextResponse.json({ error: "Ocurrió un error. Inténtalo de nuevo." }, { status: 500 });
  }
}
