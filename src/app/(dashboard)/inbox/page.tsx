import { createClient } from "@/lib/supabase/server";
import { Topbar } from "@/components/Topbar";
import { InboxClient } from "@/components/inbox/InboxClient";

export const dynamic = "force-dynamic";

export default async function InboxPage() {
  const sb = createClient();
  const [conv, mem, st, tg, attr, org, rapidas] = await Promise.all([
    sb
      .from("conversations")
      .select(
        "id, channel, status, unread, last_message_at, handoff_requested_at, state_id, assignee_member_id, opportunity_id, " +
          "contact:contacts(id,name,wa_name,phone,email,company,country,notes,attributes,channel,tags), " +
          "state:conversation_states(id,name,color), " +
          "member:team_members(id,name)"
      )
      .order("last_message_at", { ascending: false }),
    sb.from("team_members").select("id,name").order("name"),
    sb.from("conversation_states").select("id,name,color").order("sort"),
    sb.from("tags").select("id,name,color").order("name"),
    sb.from("custom_attributes").select("id,name,key").eq("visible", true).order("sort"),
    sb.from("organizations").select("id, branding").limit(1).maybeSingle(),
    sb.from("quick_replies").select("id, shortcut, title, body, category, sort, uses").order("sort").order("created_at"),
  ]);

  const branding = ((org.data as any)?.branding ?? {}) as { bubble_out?: string };

  return (
    <>
      <Topbar crumb={<span className="font-semibold text-white">Conversaciones</span>} />
      <InboxClient
        initial={(conv.data as any[]) ?? []}
        members={(mem.data as any[]) ?? []}
        states={(st.data as any[]) ?? []}
        tags={(tg.data as any[]) ?? []}
        attrs={(attr.data as any[]) ?? []}
        bubbleOut={branding.bubble_out ?? null}
        orgId={(org.data as any)?.id ?? null}
        quickReplies={(rapidas.data as any[]) ?? []}
      />
    </>
  );
}
