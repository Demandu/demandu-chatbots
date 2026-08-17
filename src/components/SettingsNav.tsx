"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const TABS = [
  { href: "/settings/plan", label: "Plan y uso" },
  { href: "/settings/attributes", label: "Atributos" },
  { href: "/settings/tags", label: "Etiquetas" },
  { href: "/settings/teams", label: "Equipos y miembros" },
  { href: "/settings/lead-groups", label: "Grupos de leads" },
  { href: "/settings/states", label: "Estados" },
  { href: "/settings/hours", label: "Horario laboral" },
  { href: "/settings/integrations", label: "Integraciones" },
];

export function SettingsNav() {
  const pathname = usePathname();
  return (
    <div className="flex w-fit flex-wrap gap-1 rounded-xl border border-surface-border bg-surface-raised p-1">
      {TABS.map((t) => {
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
