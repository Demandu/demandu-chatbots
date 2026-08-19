"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const TABS = [
  { href: "/settings/plan", label: "Plan y uso" },
  { href: "/admin/planes", label: "Planes a la medida", adminOnly: true },
  { href: "/settings/notifications", label: "Notificaciones" },
  { href: "/settings/quick-replies", label: "Respuestas rápidas" },
  { href: "/settings/chat", label: "Apariencia del chat" },
  { href: "/settings/attributes", label: "Atributos" },
  { href: "/settings/tags", label: "Etiquetas" },
  { href: "/settings/teams", label: "Equipos y miembros" },
  { href: "/settings/assignment", label: "Reparto de chats" },
  { href: "/settings/lead-groups", label: "Grupos de leads" },
  { href: "/settings/states", label: "Embudo y etapas" },
  { href: "/settings/hours", label: "Horario laboral" },
  { href: "/settings/integrations", label: "Integraciones" },
];

/** `isAdmin` lo decide el servidor; las pestañas internas no se muestran a clientes. */
export function SettingsNav({ isAdmin = false }: { isAdmin?: boolean }) {
  const pathname = usePathname();
  return (
    <div className="flex w-fit max-w-full flex-wrap gap-1 rounded-xl border border-surface-border bg-surface-raised p-1">
      {TABS.filter((t) => !t.adminOnly || isAdmin).map((t) => {
        const active = pathname === t.href;
        return (
          <Link
            key={t.href}
            href={t.href}
            className={
              active
                ? "rounded-lg bg-demandu-gradient px-4 py-2 text-sm font-semibold text-white"
                : "rounded-lg px-4 py-2 text-sm font-medium text-muted transition hover:text-white"
            }
          >
            {t.label}
          </Link>
        );
      })}
    </div>
  );
}
