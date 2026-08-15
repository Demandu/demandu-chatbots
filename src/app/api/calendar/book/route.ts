import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getCurrentOrgId } from "@/lib/org";
import { getValidAccessTokenForOrg, createCalendarEvent } from "@/lib/integrations/google";

export const dynamic = "force-dynamic";

/** Crea el evento en Google Calendar para la cita elegida. */
export async function POST(req: Request) {
  const orgId = await getCurrentOrgId();
  if (!orgId) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const body = await req.json().catch(() => ({}));
  const startISO = String(body.startISO || "");
  const durationMin = Number(body.durationMin) || 30;
  if (!startISO) return NextResponse.json({ error: "missing_start" }, { status: 400 });

  const supabase = createClient();
  const { data: org } = await supabase
    .from("organizations")
    .select("timezone")
    .eq("id", orgId)
    .maybeSingle();
  const timeZone = (org?.timezone as string) ?? "America/Mexico_City";

  const token = await getValidAccessTokenForOrg(supabase, orgId);
  if (!token) return NextResponse.json({ error: "not_connected" }, { status: 200 });

  let calendarId = String(body.calendarId || "").trim();
  if (!calendarId) calendarId = "primary";

  const endISO = body.endISO || new Date(new Date(startISO).getTime() + durationMin * 60_000).toISOString();

  try {
    const event = await createCalendarEvent(token, calendarId, {
      summary: String(body.summary || "Cita agendada · Demandu"),
      description: String(body.description || "Cita agendada desde el chatbot de Demandu."),
      startISO,
      endISO,
      timeZone,
      attendeeEmail: body.attendeeEmail ? String(body.attendeeEmail) : undefined,
    });
    return NextResponse.json({ ok: true, ...event });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message ?? "book_failed" }, { status: 200 });
  }
}
