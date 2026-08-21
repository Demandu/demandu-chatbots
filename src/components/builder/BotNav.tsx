"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { MessagesSquare, Megaphone, FileText, Plug, Settings, Timer, ShoppingBag, ClipboardList, Palette, Sparkles, BookOpen, ChevronLeft } from "lucide-react";
import { channelOf, featuresFor, FEATURES, type FeatureKey } from "@/lib/channels";

/**
 * Menú de secciones DE UN CHATBOT, como segunda columna junto al menú principal.
 *
 * ANTES era una fila de píldoras encima del contenido. Dos problemas: competía
 * visualmente con el menú principal —dos barras oscuras, ninguna clara— y con
 * once secciones se partía en dos filas en cuanto la pantalla no era enorme,
 * comiéndose el sitio donde empieza a leerse la página.
 *
 * Como columna se entiende sola: "el menú de la izquierda es la plataforma,
 * este es el chatbot en el que estoy". Y once opciones en vertical caben sin
 * doblarse.
 *
 * Las pestañas se muestran según el CANAL (WhatsApp ve todo; Instagram,
 * Messenger y web no ven Envíos masivos ni Plantillas — reglas de Meta/API).
 */
const TAB_UI: Record<FeatureKey, { suffix: string; icon: any }> = {
  flows: { suffix: "", icon: MessagesSquare },
  broadcasts: { suffix: "/broadcasts", icon: Megaphone },
  drips: { suffix: "/drips", icon: Timer },
  templates: { suffix: "/templates", icon: FileText },
  catalog: { suffix: "/catalog", icon: ShoppingBag },
  forms: { suffix: "/forms", icon: ClipboardList },
  appearance: { suffix: "/appearance", icon: Palette },
  ai: { suffix: "/ai", icon: Sparkles },
  training: { suffix: "/training", icon: BookOpen },
  install: { suffix: "/install", icon: Plug },
  settings: { suffix: "/settings", icon: Settings },
};

export function BotNav({
  botId,
  channel,
  nombre,
}: {
  botId: string;
  channel?: string | null;
  nombre?: string | null;
}) {
  const pathname = usePathname();
  const base = `/bots/${botId}`;
  const ch = channelOf(channel);

  // El constructor de flujos necesita la pantalla entera para el lienzo: ahí
  // esta columna estorba más de lo que ayuda.
  if (pathname.startsWith(`${base}/flows/`)) return null;

  const allowed = featuresFor(ch);
  const tabs = FEATURES.filter((f) => allowed.includes(f.key)).map((f) => {
    const ui = TAB_UI[f.key];
    const href = `${base}${ui.suffix}`;
    const active = ui.suffix === "" ? pathname === base : pathname.startsWith(href);
    return { href, label: f.label, icon: ui.icon, active };
  });

  return (
    <>
      {/* ── Escritorio: columna ─────────────────────────────────────────── */}
      <nav
        aria-label="Secciones del chatbot"
        className="hidden w-[236px] flex-none flex-col gap-0.5 overflow-y-auto border-r border-surface-border bg-surface/40 p-3 lg:flex"
      >
        <Link
          href="/bots"
          className="mb-2 flex items-center gap-1.5 rounded-lg px-2 py-1.5 text-xs font-semibold text-muted-2 transition hover:text-white"
        >
          <ChevronLeft className="h-3.5 w-3.5" /> Todos los chatbots
        </Link>

        {nombre && (
          <p className="truncate px-2.5 pb-2 font-display text-sm font-bold text-white" title={nombre}>
            {nombre}
          </p>
        )}

        {tabs.map((t) => (
          <Link
            key={t.href}
            href={t.href}
            aria-current={t.active ? "page" : undefined}
            className={`flex items-start gap-2.5 rounded-xl px-3 py-2 text-sm font-medium leading-tight transition ${
              t.active
                ? "border border-pink/35 bg-gradient-to-r from-pink/20 to-violet/20 text-white"
                : "border border-transparent text-muted hover:bg-surface-raised hover:text-white"
            }`}
          >
            <t.icon className={`mt-0.5 h-4 w-4 flex-none ${t.active ? "text-pink" : ""}`} />
            <span className="min-w-0">{t.label}</span>
          </Link>
        ))}
      </nav>

      {/* ── Móvil y tablet: tira horizontal que se desliza ──────────────── */}
      <nav
        aria-label="Secciones del chatbot"
        className="flex flex-none gap-1 overflow-x-auto border-b border-surface-border bg-surface/40 px-3 py-2 lg:hidden"
      >
        {tabs.map((t) => (
          <Link
            key={t.href}
            href={t.href}
            aria-current={t.active ? "page" : undefined}
            className={`inline-flex flex-none items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-semibold transition ${
              t.active ? "bg-demandu-gradient text-white" : "text-muted hover:text-white"
            }`}
          >
            <t.icon className="h-4 w-4" /> {t.label}
          </Link>
        ))}
      </nav>
    </>
  );
}
