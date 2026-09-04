"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Home, MessagesSquare, Users, Settings, BarChart3, Sparkles, Bot, KanbanSquare, Crown,
  Store, Clock,
} from "lucide-react";
import { Logo } from "./Logo";
import { cn } from "@/lib/utils";
import { usePendientes, useEsperando } from "@/lib/pendientes";

// Lenguaje simple para gente no técnica. Cada opción dice en humano qué es.
// "Envíos masivos" (solo WhatsApp) NO va aquí: vive dentro de cada chatbot.
// "Integraciones" tampoco: cada canal se conecta desde la pestaña Conexión del bot.
const MAIN = [
  { href: "/dashboard", label: "Inicio", icon: Home },
  { href: "/bots", label: "Chatbots", icon: Bot },
  { href: "/inbox", label: "Conversaciones", icon: MessagesSquare },
  { href: "/crm", label: "Embudo", icon: KanbanSquare },
  { href: "/contacts", label: "Contactos", icon: Users },
  // La tienda va en Principal y no en Ajustes porque no es una configuración:
  // es un sitio donde se trabaja todos los días —cargar productos, agotar,
  // cambiar precios— igual que la Bandeja o el Embudo.
  { href: "/tienda", label: "Tienda", icon: Store },
];

/**
 * Las que solo salen cuando hay algo que hacer en ellas.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * «EN ESPERA» ESTABA FIJA Y ESTORBABA. Un menú corto no puede permitirse una
 * opción que el 90% de los días lleva a una lista vacía: la gente aprende a no
 * mirarla, y entonces tampoco la mira el día que sí importa.
 *
 * PERO LA PANTALLA VALE, y mucho, ese día: es el ÚNICO sitio donde se ven —y se
 * pueden CANCELAR— los mensajes que un bloque de Espera dejó programados para
 * dentro de horas. Sin ella, un envío programado sale sí o sí.
 *
 * Así que aparece sola cuando hay algo esperando, con cuántos. Es el mismo
 * patrón que ya usa Conversaciones para avisar de quién espera a una persona:
 * el menú te habla cuando tiene algo que decir, y calla cuando no.
 * ─────────────────────────────────────────────────────────────────────────────
 */
const CUANDO_HAY = [
  { href: "/inbox/programados", label: "En espera", icon: Clock },
];

const CONFIG = [
  { href: "/settings", label: "Configuración", icon: Settings },
  { href: "/analytics", label: "Resultados", icon: BarChart3 },
  { href: "/settings/ai", label: "Lana IA", icon: Sparkles },
];

/** Lo justo para pintar la tarjeta de abajo. Lo calcula el marco (servidor). */
export type ResumenDePlan = {
  nombre: string;
  usados: number;
  limite: number;
  pct: number;
};

function corto(n: number): string {
  if (n >= 1000) {
    const k = n / 1000;
    return `${k % 1 === 0 ? k : k.toFixed(1)}k`;
  }
  return String(n);
}

export function Sidebar({
  plan,
  esDelEquipo = false,
}: {
  plan?: ResumenDePlan | null;
  esDelEquipo?: boolean;
}) {
  const pathname = usePathname();
  // Gente esperando a que alguien del equipo le conteste. Va aquí y no solo en
  // un aviso emergente porque el aviso se lo lleva el viento: si el agente
  // estaba en otra pestaña o recargó, la solicitud quedaba invisible.
  const pendientes = usePendientes();
  // Mensajes que un bloque de Espera dejó programados. Mientras sean cero, la
  // opción no existe.
  const esperando = useEsperando();

  // Todas las direcciones del menú, para decidir cuál se ilumina. Gana la
  // coincidencia MÁS LARGA: con `startsWith` a secas, una pantalla dentro de
  // otra encendía dos opciones a la vez y el menú dejaba de decirte dónde
  // estás. Se queda aunque ahora mismo ninguna opción anide dentro de otra:
  // la próxima que se añada lo volvería a romper.
  const TODAS = [...MAIN, ...CUANDO_HAY, ...CONFIG].map((i) => i.href);

  const Item = ({ href, label, icon: Icon }: (typeof MAIN)[number]) => {
    const encaja = (h: string) => pathname === h || pathname.startsWith(h + "/");
    const mejor = TODAS.filter(encaja).sort((a, b) => b.length - a.length)[0];
    const active = encaja(href) && mejor === href;
    const aviso = href === "/inbox" ? pendientes : href === "/inbox/programados" ? esperando : 0;
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

      {/* SOLO SI HAY ALGO. Con cero esperando, esta opción no existe. */}
      {esperando > 0 &&
        CUANDO_HAY.map((i) => <Item key={i.href} {...i} />)}

      <p className="px-2.5 pb-1.5 pt-4 text-[11px] font-semibold uppercase tracking-wider text-muted-2">
        Ajustes
      </p>
      {CONFIG.map((i) => (
        <Item key={i.href} {...i} />
      ))}

      {/* LA PUERTA A LA TRASTIENDA.
          Existía el superadmin y no había forma de llegar salvo escribiendo la
          dirección a mano — una función entera invisible para quien la
          necesita todos los días.

          Va al final, separada y con otro color a propósito: entrar a la
          trastienda y trabajar en la cuenta de un cliente no deben parecerse.
          Confundirlas es como se toca por error algo de alguien. */}
      {esDelEquipo && (
        <Link
          href="/superadmin/clientes"
          className="mt-4 flex items-center gap-3 rounded-xl border border-amber-400/30 bg-amber-400/10 px-3 py-2.5 text-sm font-medium text-amber-200 transition hover:border-amber-400/60 hover:text-amber-100"
        >
          <Crown className="h-5 w-5" />
          Superadmin
        </Link>
      )}

      {/* ESTA TARJETA ESTUVO MINTIENDO. Nació como maqueta con números
          inventados a fuego —«Plan Crecimiento · 1.9k / 3k conversaciones»— y
          nunca se conectó, así que TODOS los clientes veían el mismo consumo
          falso, y encima con el nombre de un plan que no existe y contando
          conversaciones cuando lo que se cobra son mensajes.

          Ahora sale de `org_usage`, la misma fuente que la pantalla de Plan,
          para que los dos sitios no puedan volver a decir cosas distintas.
          Si no hay dato, la tarjeta NO se pinta: un hueco es honesto, un
          número inventado no. */}
      {plan && (
        <Link href="/settings/plan" className="mt-auto card p-3 transition hover:border-pink/35">
          <div className="flex items-center justify-between text-xs text-muted">
            <span>
              Plan <b className="text-white">{plan.nombre}</b>
            </span>
            {plan.limite > 0 && (
              <span>
                {corto(plan.usados)} / {corto(plan.limite)}
              </span>
            )}
          </div>
          {plan.limite > 0 && (
            <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-surface-border">
              <span
                className={cn(
                  "block h-full rounded-full transition-all",
                  plan.pct >= 100
                    ? "bg-danger"
                    : plan.pct >= 85
                      ? "bg-warning"
                      : "bg-gradient-to-r from-pink to-violet",
                )}
                // El mínimo del 2% es para que con poco consumo se vea que la
                // barra existe, en vez de parecer que está rota.
                style={{ width: `${Math.max(2, Math.min(100, plan.pct))}%` }}
              />
            </div>
          )}
          <p className="mt-2 text-xs text-muted-2">
            {plan.limite > 0 ? "Mensajes enviados este mes" : "Mensajes sin límite"}
          </p>
        </Link>
      )}
    </aside>
  );
}
