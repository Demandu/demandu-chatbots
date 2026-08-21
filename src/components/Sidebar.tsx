"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Home, MessagesSquare, Users, Settings, BarChart3, Sparkles, Bot, KanbanSquare,
} from "lucide-react";
import { Logo } from "./Logo";
import { cn } from "@/lib/utils";
import { usePendientes } from "@/lib/pendientes";

// Lenguaje simple para gente no técnica. Cada opción dice en humano qué es.
// "Envíos masivos" (solo WhatsApp) NO va aquí: vive dentro de cada chatbot.
// "Integraciones" tampoco: cada canal se conecta desde la pestaña Conexión del bot.
const MAIN = [
  { href: "/dashboard", label: "Inicio", icon: Home },
  { href: "/bots", label: "Chatbots", icon: Bot },
  { href: "/inbox", label: "Conversaciones", icon: MessagesSquare },
  { href: "/crm", label: "Embudo", icon: KanbanSquare },
  { href: "/contacts", label: "Contactos", icon: Users },
];

const CONFIG = [
  { href: "/settings", label: "Configuración", icon: Settings },
  { href: "/analytics", label: "Resultados", icon: BarChart3 },
  { href: "/settings/ai", label: "Lana IA", icon: Sparkles },
];

export function Sidebar() {
  const pathname = usePathname();
  // Gente esperando a que alguien del equipo le conteste. Va aquí y no solo en
  // un aviso emergente porque el aviso se lo lleva el viento: si el agente
  // estaba en otra pestaña o recargó, la solicitud quedaba invisible.
  const pendientes = usePendientes();

  const Item = ({ href, label, icon: Icon }: (typeof MAIN)[number]) => {
    const active = pathname === href || pathname.startsWith(href + "/");
    const aviso = href === "/inbox" ? pendientes : 0;
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
        {aviso > 0 && (
          <span
            className="ml-auto grid h-5 min-w-[20px] animate-pulse place-items-center rounded-full bg-pink px-1.5 text-[11px] font-bold text-white"
            title={`${aviso} ${aviso === 1 ? "persona espera" : "personas esperan"} a que les contesten`}
          >
            {aviso > 9 ? "9+" : aviso}
          </span>
        )}
      </Link>
    );
  };

  return (
    <aside className="flex w-[248px] flex-none flex-col gap-1.5 overflow-y-auto border-r border-surface-border bg-gradient-to-b from-[#0d0d34] to-[#0a0a26] p-4">
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
        Ajustes
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
