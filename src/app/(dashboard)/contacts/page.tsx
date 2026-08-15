import { createClient } from "@/lib/supabase/server";
import { Topbar } from "@/components/Topbar";
import { ContactsClient } from "@/components/contacts/ContactsClient";
import { createContact } from "./actions";

export const dynamic = "force-dynamic";

const CHANNELS = [
  { value: "whatsapp", label: "WhatsApp" },
  { value: "instagram", label: "Instagram" },
  { value: "messenger", label: "Messenger" },
  { value: "telegram", label: "Telegram" },
  { value: "webchat", label: "Web Chat" },
];

export default async function ContactsPage() {
  const { data } = await createClient()
    .from("contacts")
    .select("id,name,phone,email,channel,tags,created_at")
    .order("created_at", { ascending: false });

  return (
    <>
      <Topbar crumb={<span className="font-semibold text-white">Contactos</span>} />
      <div className="flex-1 overflow-auto p-8">
        <h2 className="font-display text-2xl font-bold text-white">Contactos</h2>
        <p className="mb-6 mt-1 text-muted">Toda tu base de contactos en un solo lugar.</p>

        <form action={createContact} className="mb-6 flex flex-wrap items-end gap-3 rounded-2xl border border-surface-border bg-surface-card p-4">
          <div className="min-w-[160px] flex-1">
            <label className="mb-1.5 block text-xs font-semibold text-muted">Nombre</label>
            <input name="name" required placeholder="Nombre del contacto" className="input" />
          </div>
          <div className="min-w-[150px]">
            <label className="mb-1.5 block text-xs font-semibold text-muted">Teléfono</label>
            <input name="phone" placeholder="+52…" className="input" />
          </div>
          <div className="min-w-[180px]">
            <label className="mb-1.5 block text-xs font-semibold text-muted">Correo</label>
            <input name="email" type="email" placeholder="correo@ejemplo.com" className="input" />
          </div>
          <div className="min-w-[150px]">
            <label className="mb-1.5 block text-xs font-semibold text-muted">Canal</label>
            <select name="channel" defaultValue="whatsapp" className="input">
              {CHANNELS.map((c) => (<option key={c.value} value={c.value}>{c.label}</option>))}
            </select>
          </div>
          <button className="btn-primary">Agregar contacto</button>
        </form>

        <ContactsClient contacts={(data as any[]) ?? []} />
      </div>
    </>
  );
}
