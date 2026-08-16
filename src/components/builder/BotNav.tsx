"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { MessagesSquare, Megaphone, FileText, Plug, Settings } from "lucide-react";
import { channelOf, featuresFor, FEATURES, type FeatureKey } from "@/lib/channels";

/**
 * Menú de secciones DE UN CHATBOT. Cada chatbot tiene su propia configuración.
 * Las pestañas se muestran según el CANAL (WhatsApp ve todo; Instagram,
 * Messenger y web no ven Envíos masivos ni Plantillas — reglas de Meta/API).
 */
const TAB_UI: Record<FeatureKey, { suffix: string; icon: any }> = {
  flows: { suffix: "", icon: MessagesSquare },
  broadcasts: { suffix: "/broadcasts", icon: Megaphone },
  templates: { suffix: "/templates", icon: FileText },
  install: { suffix: "/install", icon: Plug },
  settings: { suffix: "/settings", icon: Settings },
};

export function BotNav({ botId, channel }: { botId: string; channel?: string | null }) {
  const pathname = usePathname();
  const base = `/bots/${botId}`;
  const ch = channelOf(channel);

  const allowed = featuresFor(ch);
  const tabs = FEATURES.filter((f) => allowed.includes(f.key)).map((f) => {
    const ui = TAB_UI[f.key];
    const href = `${base}${ui.suffix}`;
    const active = ui.suffix === "" ? pathname === base : pathname.startsWith(href);
    return { href, label: f.label, icon: ui.icon, active };
  });

  return (
    <div className="mb-6 inline-flex flex-wrap gap-1 rounded-xl border border-surface-border bg-surface p-1">
      {tabs.map((t) => (
        <Link
          key={t.href}
          href={t.href}
          className={`inline-flex items-center gap-1.5 rounded-lg px-3.5 py-2 text-sm font-semibold transition ${
            t.active ? "bg-demandu-gradient text-white" : "text-muted hover:text-white"
          }`}
        >
          <t.icon className="h-4 w-4" /> {t.label}
        </Link>
      ))}
    </div>
  );
}
