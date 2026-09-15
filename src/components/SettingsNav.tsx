"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useTranslations } from "next-intl";
import {
  CreditCard, Bell, Zap, Palette, ListTree, Tags, Users,
  Shuffle, UsersRound, KanbanSquare, Clock, Plug,
  Languages,
} from "lucide-react";

/**
 * Menú de Configuración, como segunda columna junto al menú principal.
 *
 * Mismo tratamiento que las secciones del chatbot, y por la misma razón: trece
 * pestañas en una fila horizontal se parten en tres renglones y se comen la
 * pantalla antes de que empiece el contenido. En vertical caben de una y se
 * lee dónde estás.
 *
 * Van agrupadas porque trece opciones seguidas no se leen: se barren con la
 * vista y no se encuentra nada. Los títulos dicen para qué sirve cada grupo.
 *
 * ── AQUÍ NO HAY TEXTO, HAY CLAVES ────────────────────────────────────────────
 *
 * La lista guarda `titulo` y `label` como CLAVES del diccionario, no como
 * frases. Es a propósito y no es un detalle de estilo: esta misma lista la usa
 * `TituloSeccion` para pintar el encabezado de cada pantalla, así que una
 * etiqueta escrita a mano saldría en español en dos sitios y habría que
 * acordarse de los dos. Con la clave, traducir una vez alcanza a los dos.
 */
const GRUPOS: {
  titulo: string;
  items: { href: string; label: string; icon: any; adminOnly?: boolean }[];
}[] = [
  {
    titulo: "grupoCuenta",
    items: [
      { href: "/settings/plan", label: "plan", icon: CreditCard },
      // «Planes a la medida» se mudó a /superadmin: es del equipo de Demandu,
      // no del cliente, y no tenía por qué colgar del menú de su Configuración.
      { href: "/settings/notifications", label: "notificaciones", icon: Bell },
      { href: "/settings/hours", label: "horario", icon: Clock },
      { href: "/settings/idioma", label: "idioma", icon: Languages },
    ],
  },
  {
    titulo: "grupoEquipo",
    items: [
      { href: "/settings/teams", label: "equipos", icon: Users },
      { href: "/settings/assignment", label: "reparto", icon: Shuffle },
      { href: "/settings/quick-replies", label: "respuestasRapidas", icon: Zap },
    ],
  },
  {
    titulo: "grupoOrganizas",
    items: [
      { href: "/settings/states", label: "embudo", icon: KanbanSquare },
      { href: "/settings/tags", label: "etiquetas", icon: Tags },
      { href: "/settings/attributes", label: "atributos", icon: ListTree },
      { href: "/settings/lead-groups", label: "gruposLeads", icon: UsersRound },
    ],
  },
  {
    titulo: "grupoApariencia",
    items: [
      { href: "/settings/chat", label: "apariencia", icon: Palette },
      { href: "/settings/integrations", label: "integraciones", icon: Plug },
    ],
  },
];

/** `isAdmin` lo decide el servidor; las pestañas internas no se muestran a clientes. */
export function SettingsNav({ isAdmin = false }: { isAdmin?: boolean }) {
  const t = useTranslations("config");
  const pathname = usePathname();
  const visibles = GRUPOS.map((g) => ({
    ...g,
    items: g.items.filter((x) => !x.adminOnly || isAdmin),
  })).filter((g) => g.items.length);

  return (
    <>
      {/* ── Escritorio: columna ─────────────────────────────────────────── */}
      <nav
        aria-label={t("secciones")}
        className="hidden w-[236px] flex-none flex-col overflow-y-auto border-r border-surface-border bg-surface/40 p-3 lg:flex"
      >
        {visibles.map((g) => (
          <div key={g.titulo} className="mb-3 last:mb-0">
            <p className="px-2.5 pb-1.5 pt-1 text-[11px] font-semibold uppercase tracking-wider text-muted-2">
              {t(g.titulo)}
            </p>
            {g.items.map((x) => {
              const active = pathname === x.href;
              return (
                <Link
                  key={x.href}
                  href={x.href}
                  aria-current={active ? "page" : undefined}
                  className={`flex items-start gap-2.5 rounded-xl px-3 py-2 text-sm font-medium leading-tight transition ${
                    active
                      ? "border border-pink/35 bg-gradient-to-r from-pink/20 to-violet/20 text-white"
                      : "border border-transparent text-muted hover:bg-surface-raised hover:text-white"
                  }`}
                >
                  <x.icon className={`mt-0.5 h-4 w-4 flex-none ${active ? "text-pink" : ""}`} />
                  <span className="min-w-0">{t(x.label)}</span>
                </Link>
              );
            })}
          </div>
        ))}
      </nav>

      {/* ── Móvil y tablet: tira horizontal que se desliza ──────────────── */}
      <nav
        aria-label={t("secciones")}
        className="flex flex-none gap-1 overflow-x-auto border-b border-surface-border bg-surface/40 px-3 py-2 lg:hidden"
      >
        {visibles.flatMap((g) => g.items).map((x) => {
          const active = pathname === x.href;
          return (
            <Link
              key={x.href}
              href={x.href}
              aria-current={active ? "page" : undefined}
              className={`inline-flex flex-none items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-semibold transition ${
                active ? "bg-demandu-gradient text-white" : "text-muted hover:text-white"
              }`}
            >
              <x.icon className="h-4 w-4" /> {t(x.label)}
            </Link>
          );
        })}
      </nav>
    </>
  );
}

/**
 * El título de la sección en la que estás.
 *
 * El marco ya no puede poner un "Configuración" genérico —ahora la columna
 * dice dónde estás— pero varias pantallas no traen encabezado propio y se
 * quedaban empezando en seco. Esto lo saca de la MISMA lista del menú, así que
 * añadir una sección no obliga a acordarse de dos sitios.
 */
export function TituloSeccion() {
  const t = useTranslations("config");
  const pathname = usePathname();
  const item = GRUPOS.flatMap((g) => g.items).find((x) => x.href === pathname);
  if (!item) return null;
  return (
    <h1 className="mb-5 font-display text-2xl font-bold text-ink">{t(item.label)}</h1>
  );
}
