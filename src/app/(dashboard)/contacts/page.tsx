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
    .select("id,name,wa_name,phone,email,company,country,channel,tags,created_at")
    .order("created_at", { ascending: false });

  return (
    <>
      <Topbar crumb={<span className="font-semibold text-white">Contactos</span>} />
      <div className="min-h-0 flex-1 overflow-auto pb-[env(safe-area-inset-bottom)] bg-canvas p-4 sm:p-6 lg:p-8 text-ink">
        <h2 className="font-display text-2xl font-bold text-ink">Contactos</h2>
        <p className="mb-6 mt-1 text-ink-2">Toda tu base de contactos en un solo lugar.</p>

        <form action={createContact} className="mb-6 flex flex-wrap items-end gap-3 rounded-2xl border border-[#e6e8f2] bg-white p-4">
          <div className="min-w-[160px] flex-1">
            <label className="mb-1.5 block text-xs font-semibold text-ink-2">Nombre</label>
            <input name="name" required placeholder="Nombre del contacto" className="input-l" />
          </div>
          <div className="min-w-[150px]">
            <label className="mb-1.5 block text-xs font-semibold text-ink-2">Teléfono</label>
            <input name="phone" placeholder="+52…" className="input-l" />
          </div>
          <div className="min-w-[180px]">
            <label className="mb-1.5 block text-xs font-semibold text-ink-2">Correo</label>
            <input name="email" type="email" placeholder="correo@ejemplo.com" className="input-l" />
          </div>
          <div className="min-w-[150px]">
            <label className="mb-1.5 block text-xs font-semibold text-ink-2">Canal</label>
            <select name="channel" defaultValue="whatsapp" className="input-l">
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
