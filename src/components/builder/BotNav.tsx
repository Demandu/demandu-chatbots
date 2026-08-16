"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { GitBranch, Megaphone, FileText, Plug, Settings } from "lucide-react";

/**
 * Menú de secciones DE UN BOT (cada bot tiene su propia configuración,
 * como en BotPenguin). Se muestra dentro del espacio del bot.
 */
export function BotNav({ botId }: { botId: string }) {
  const pathname = usePathname();
  const base = `/bots/${botId}`;
  const tabs = [
    { href: base, label: "Flujos", icon: GitBranch, active: pathname === base },
    { href: `${base}/broadcasts`, label: "Difusiones", icon: Megaphone, active: pathname.startsWith(`${base}/broadcasts`) },
    { href: `${base}/templates`, label: "Plantillas", icon: FileText, active: pathname.startsWith(`${base}/templates`) },
    { href: `${base}/install`, label: "Conexión", icon: Plug, active: pathname.startsWith(`${base}/install`) },
    { href: `${base}/settings`, label: "Ajustes", icon: Settings, active: pathname.startsWith(`${base}/settings`) },
  ];

  return (
    <div className="mb-6 inline-flex gap-1 rounded-xl border border-surface-border bg-surface p-1">
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
