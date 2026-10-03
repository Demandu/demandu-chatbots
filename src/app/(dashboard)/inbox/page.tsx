import { createClient } from "@/lib/supabase/server";
import { getCurrentOrgId } from "@/lib/org";
import { Topbar } from "@/components/Topbar";
import { InboxClient } from "@/components/inbox/InboxClient";
import { ordenarEtapas } from "@/lib/enBloque";

export const dynamic = "force-dynamic";

export default async function InboxPage() {
  const sb = createClient();
  // SE PIDE LA CUENTA POR SU ID, NO «UNA CUALQUIERA». Un `.limit(1)` sobre
  // `organizations` se apoyaba solo en RLS, y quien tiene dos accesos —soporte
  // abierto en la cuenta de un cliente— recibía una de las dos al azar: el
  // color de las burbujas de un negocio dentro del inbox de otro.
  const orgId = await getCurrentOrgId();
  // Quién está mirando. La cabecera necesita distinguir «te la pasó Ana» de
  // «la asignó Ana» — y callarse cuando el que la movió fui yo mismo.
  const { data: sesion } = await sb.auth.getUser();
  const miUserId = sesion.user?.id ?? null;
  const [conv, mem, st, tg, attr, org, rapidas] = await Promise.all([
    sb
      .from("conversations")
      .select(
        "id, channel, status, unread, last_message_at, handoff_requested_at, state_id, assignee_member_id, asignada_por, opportunity_id, idioma_lead, " +
          "contact:contacts(id,name,wa_name,phone,email,company,country,notes,attributes,channel,tags,origen), " +
          "state:conversation_states(id,name,color), " +
          "member:team_members(id,name)"
      )
      // Las que creó «Probar flujo» no son clientes: son el dueño probando su
      // propio chatbot. Verlas aquí es ver un lead que no existe.
      .eq("prueba", false)
      .order("last_message_at", { ascending: false }),
    sb.from("team_members").select("id,name,user_id").order("name"),
    // `pipeline` y `sort` los usa la barra de «varias a la vez» para agrupar
    // las etapas por embudo. Los selectores de siempre solo miran id/nombre/color.
    sb.from("conversation_states").select("id,name,color,sort,outcome,pipeline:pipelines(name,sort)").order("sort"),
    sb.from("tags").select("id,name,color").order("name"),
    sb.from("custom_attributes").select("id,name,key").eq("visible", true).order("sort"),
    sb.from("organizations").select("id, branding").eq("id", orgId ?? "").maybeSingle(),
    sb.from("quick_replies").select("id, shortcut, title, body, category, sort, uses").order("sort").order("created_at"),
  ]);

  const branding = ((org.data as any)?.branding ?? {}) as { bubble_out?: string };

  return (
    <>
      <Topbar crumb={<span className="font-semibold text-white">Conversaciones</span>} />
      <InboxClient
        initial={(conv.data as any[]) ?? []}
        members={(mem.data as any[]) ?? []}
        states={ordenarEtapas((st.data as any[]) ?? [])}
        tags={(tg.data as any[]) ?? []}
        attrs={(attr.data as any[]) ?? []}
        bubbleOut={branding.bubble_out ?? null}
        orgId={(org.data as any)?.id ?? null}
        quickReplies={(rapidas.data as any[]) ?? []}
        userId={miUserId}
      />
    </>
  );
}
