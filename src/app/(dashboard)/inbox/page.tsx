import { createClient } from "@/lib/supabase/server";
import { Topbar } from "@/components/Topbar";
import { InboxClient } from "@/components/inbox/InboxClient";

export const dynamic = "force-dynamic";

export default async function InboxPage() {
  const sb = createClient();
  const [conv, mem, st, tg] = await Promise.all([
    sb
      .from("conversations")
      .select(
        "id, channel, status, unread, last_message_at, state_id, assignee_member_id, " +
          "contact:contacts(id,name,phone,email,channel,tags), " +
          "state:conversation_states(id,name,color), " +
          "member:team_members(id,name)"
      )
      .order("last_message_at", { ascending: false }),
    sb.from("team_members").select("id,name").order("name"),
    sb.from("conversation_states").select("id,name,color").order("sort"),
    sb.from("tags").select("id,name,color").order("name"),
  ]);

  return (
    <>
      <Topbar crumb={<span className="font-semibold text-white">Conversaciones</span>} />
      <InboxClient
        initial={(conv.data as any[]) ?? []}
        members={(mem.data as any[]) ?? []}
        states={(st.data as any[]) ?? []}
        tags={(tg.data as any[]) ?? []}
      />
    </>
  );
}
