import { Topbar } from "@/components/Topbar";

const CONVOS = [
  { name: "María López", channel: "WhatsApp", last: "¿Tienen envío a Guadalajara?", time: "9:41", unread: 2, active: true },
  { name: "Carlos Ruiz", channel: "Instagram", last: "Perfecto, lo quiero 🙌", time: "9:32", unread: 0 },
  { name: "Ana Torres", channel: "Web Chat", last: "Gracias por la ayuda", time: "8:57", unread: 0 },
  { name: "Diego M.", channel: "Messenger", last: "¿Cuál es el precio del kit?", time: "8:20", unread: 1 },
];

export default function InboxPage() {
  return (
    <>
      <Topbar crumb={<span className="font-semibold text-white">Bandeja unificada</span>} />
      <div className="flex flex-1 overflow-hidden">
        {/* Lista */}
        <div className="w-[340px] overflow-auto border-r border-surface-border">
          {CONVOS.map((c) => (
            <div
              key={c.name}
              className={`flex cursor-pointer items-center gap-3 border-b border-surface-border px-4 py-3.5 transition hover:bg-surface-raised ${
                c.active ? "bg-surface-raised" : ""
              }`}
            >
              <div className="grid h-11 w-11 flex-none place-items-center rounded-full bg-gradient-to-br from-pink to-violet font-display text-sm font-bold text-white">
                {c.name.slice(0, 2)}
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex items-center justify-between">
                  <span className="text-sm font-semibold text-white">{c.name}</span>
                  <span className="text-[11px] text-muted-2">{c.time}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="truncate text-xs text-muted-2">{c.last}</span>
                  {c.unread > 0 && (
                    <span className="ml-2 grid h-5 min-w-5 place-items-center rounded-full bg-pink px-1 text-[10px] font-bold text-white">
                      {c.unread}
                    </span>
                  )}
                </div>
                <span className="mt-1 inline-block rounded bg-surface-card px-1.5 py-0.5 text-[10px] text-muted-2">
                  {c.channel}
                </span>
              </div>
            </div>
          ))}
        </div>

        {/* Conversación */}
        <div className="flex flex-1 items-center justify-center bg-[#0b0b23] text-center">
          <div className="max-w-xs">
            <div className="mx-auto mb-4 grid h-14 w-14 place-items-center rounded-2xl bg-gradient-to-br from-pink/20 to-violet/20 text-2xl">
              💬
            </div>
            <h3 className="font-display text-lg font-semibold text-white">Bandeja unificada</h3>
            <p className="mt-1 text-sm text-muted-2">
              Todas tus conversaciones de WhatsApp, Instagram, Messenger, Telegram y Web Chat en un solo lugar. Selecciona una conversación para atender.
            </p>
          </div>
        </div>
      </div>
    </>
  );
}
