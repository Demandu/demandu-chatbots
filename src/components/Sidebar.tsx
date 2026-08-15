"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  LayoutGrid, Workflow, Inbox, Users, Megaphone,
  PieChart, Plug, Sparkles, Settings,
} from "lucide-react";
import { Logo } from "./Logo";
import { cn } from "@/lib/utils";

const MAIN = [
  { href: "/dashboard", label: "Panel", icon: LayoutGrid },
  { href: "/bots", label: "Constructor", icon: Workflow },
  { href: "/inbox", label: "Bandeja / Chat", icon: Inbox },
  { href: "/contacts", label: "Contactos", icon: Users },
  { href: "/campaigns", label: "Campañas", icon: Megaphone },
];

const CONFIG = [
  { href: "/settings", label: "Configuración", icon: Settings },
  { href: "/analytics", label: "Analytics", icon: PieChart },
  { href: "/settings/integrations", label: "Integraciones", icon: Plug },
  { href: "/settings/ai", label: "Lana AI", icon: Sparkles },
];

export function Sidebar() {
  const pathname = usePathname();

  const Item = ({ href, label, icon: Icon }: (typeof MAIN)[number]) => {
    const active = pathname === href || pathname.startsWith(href + "/");
    return (
      <Link
        href={href}
        className={cn(
          "flex items-center gap-3 rounded-xl border border-transparent px-3 py-2.5 text-sm font-medium transition",
          active
            ? "border-pink/35 bg-gradient-to-r from-pink/20 to-violet/20 text-white"
            : "text-muted hover:bg-surface-raised hover:text-white"
        )}
      >
        <Icon className={cn("h-5 w-5", active && "text-pink")} />
        {label}
      </Link>
    );
  };

  return (
    <aside className="flex w-[248px] flex-col gap-1.5 border-r border-surface-border bg-gradient-to-b from-[#0d0d34] to-[#0a0a26] p-4">
      <div className="px-2 pb-4 pt-1.5">
        <Logo />
      </div>

      <p className="px-2.5 pb-1.5 pt-3 text-[11px] font-semibold uppercase tracking-wider text-muted-2">
        Principal
      </p>
      {MAIN.map((i) => (
        <Item key={i.href} {...i} />
      ))}

      <p className="px-2.5 pb-1.5 pt-4 text-[11px] font-semibold uppercase tracking-wider text-muted-2">
        Configuración
      </p>
      {CONFIG.map((i) => (
        <Item key={i.href} {...i} />
      ))}

      <div className="mt-auto card p-3">
        <div className="flex items-center justify-between text-xs text-muted">
          <span>
            Plan <b className="text-white">Crecimiento</b>
          </span>
          <span>1.9k / 3k</span>
        </div>
        <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-surface-border">
          <span className="block h-full w-[64%] bg-gradient-to-r from-pink to-violet" />
        </div>
        <p className="mt-2 text-xs text-muted-2">Conversaciones este mes</p>
      </div>
    </aside>
  );
}
