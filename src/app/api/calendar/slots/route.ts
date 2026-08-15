import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getCurrentOrgId } from "@/lib/org";
import { getValidAccessTokenForOrg, freeBusy } from "@/lib/integrations/google";
import { computeSlots } from "@/lib/integrations/availability";

export const dynamic = "force-dynamic";

/** Devuelve horarios disponibles para agendar, respetando horario laboral + freebusy. */
export async function POST(req: Request) {
  const orgId = await getCurrentOrgId();
  if (!orgId) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const body = await req.json().catch(() => ({}));
  const durationMin = Number(body.durationMin) || 30;
  const days = Number(body.days) || 14;
  const maxSlots = Number(body.maxSlots) || 6;

  const supabase = createClient();
  const { data: org } = await supabase
    .from("organizations")
    .select("business_hours, timezone")
    .eq("id", orgId)
    .maybeSingle();

  const token = await getValidAccessTokenForOrg(supabase, orgId);
  if (!token) return NextResponse.json({ error: "not_connected", slots: [] }, { status: 200 });

  // Resuelve el calendario: el indicado, o el principal
  let calendarId = String(body.calendarId || "").trim();
  if (!calendarId || calendarId === "primary") calendarId = "primary";

  const now = new Date();
  const timeMax = new Date(now.getTime() + days * 24 * 3600 * 1000).toISOString();

  let busy: any[] = [];
  try {
    busy = await freeBusy(token, calendarId, now.toISOString(), timeMax);
  } catch {
    busy = [];
  }

  const slots = computeSlots({
    businessHours: (org?.business_hours as any) ?? {},
    timeZone: (org?.timezone as string) ?? "America/Mexico_City",
    durationMin,
    busy,
    now,
    days,
    maxSlots,
  });

  return NextResponse.json({ slots, calendarId });
}
