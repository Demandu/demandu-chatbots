import Link from "next/link";
import { Topbar } from "@/components/Topbar";
import { LanaAvatar } from "@/components/Lana";
import { createClient } from "@/lib/supabase/server";
import { Bot, MessagesSquare, BarChart3, Plus, ArrowRight } from "lucide-react";

export const dynamic = "force-dynamic";

export default async function InicioPage() {
  const sb = createClient();
  const [{ count: bots }, { count: convs }, { count: contacts }, { count: msgs }] =
    await Promise.all([
      sb.from("bots").select("id", { count: "exact", head: true }),
      sb.from("conversations").select("id", { count: "exact", head: true }),
      sb.from("contacts").select("id", { count: "exact", head: true }),
      sb.from("messages").select("id", { count: "exact", head: true }),
    ]);

  const noBots = (bots ?? 0) === 0;

  const stats = [
    { k: "Chatbots", v: bots ?? 0 },
    { k: "Conversaciones", v: convs ?? 0 },
    { k: "Contactos", v: contacts ?? 0 },
    { k: "Mensajes", v: msgs ?? 0 },
  ];

  const doCards = [
    {
      href: "/bots/new",
      title: noBots ? "Crear un chatbot" : "Crear otro chatbot",
      desc: "Un robot que contesta solo por WhatsApp, Instagram o tu web.",
      icon: Bot,
      tint: "bg-pink/15 text-pink",
    },
    {
      href: "/inbox",
      title: "Ver conversaciones",
      desc: "Lee y responde tú mismo los chats de tus clientes.",
      icon: MessagesSquare,
      tint: "bg-sky-500/15 text-sky-500",
    },
    {
      href: "/analytics",
      title: "Ver resultados",
      desc: "Cuántos te escribieron, cuántos respondió el bot y más.",
      icon: BarChart3,
      tint: "bg-violet/15 text-violet",
    },
  ];

  return (
    <>
      <Topbar crumb={<span className="font-semibold text-white">Inicio</span>} />
      <div className="min-h-full flex-1 overflow-auto bg-canvas p-8 text-ink">
        {/* Hero con Lana */}
        <div className="mb-7 flex flex-wrap items-center justify-between gap-6 rounded-3xl border border-[#e7e2fb] bg-gradient-to-br from-white to-[#f3efff] p-7">
          <div className="max-w-xl">
            <h1 className="font-display text-3xl font-bold text-ink">¡Hola! 👋</h1>
            <p className="mt-2 text-[15px] text-ink-2">
              Un <b className="text-ink">chatbot</b> es tu robot que contesta a tus clientes solo, día y
              noche. {noBots ? "Vamos a crear el primero" : "Crea otro cuando quieras"} — te lleva pocos
              minutos y <b className="text-ink">Lana</b> te acompaña en cada paso.
            </p>
            <Link
              href="/bots/new"
              className="mt-5 inline-flex items-center gap-2 rounded-2xl bg-demandu-gradient px-6 py-3.5 text-[15px] font-semibold text-white transition hover:opacity-90"
            >
              <Plus className="h-5 w-5" />
              {noBots ? "Crear mi primer chatbot" : "Crear un chatbot"}
            </Link>
          </div>
          <LanaAvatar size={132} className="shadow-[0_12px_40px_-8px_rgba(124,66,255,0.45)]" />
        </div>

        {/* Stats reales */}
        <div className="mb-8 grid grid-cols-2 gap-3.5 md:grid-cols-4">
          {stats.map((s) => (
            <div key={s.k} className="card-l p-5">
              <div className="font-display text-[26px] font-bold text-ink">{s.v}</div>
              <div className="mt-0.5 text-xs uppercase tracking-wide text-ink-3">{s.k}</div>
            </div>
          ))}
        </div>

        {/* ¿Qué quieres hacer? */}
        <h2 className="mb-4 font-display text-xl font-bold text-ink">¿Qué quieres hacer?</h2>
        <div className="grid gap-4 md:grid-cols-3">
          {doCards.map((c) => (
            <Link
              key={c.href}
              href={c.href}
              className="card-l group p-5 transition hover:-translate-y-0.5 hover:border-pink"
            >
              <div className={`mb-3.5 grid h-12 w-12 place-items-center rounded-2xl ${c.tint}`}>
                <c.icon className="h-6 w-6" />
              </div>
              <div className="flex items-center gap-1.5">
                <h3 className="font-display text-base font-semibold text-ink">{c.title}</h3>
                <ArrowRight className="h-4 w-4 -translate-x-1 text-ink-3 opacity-0 transition group-hover:translate-x-0 group-hover:opacity-100" />
              </div>
              <p className="mt-1 text-sm text-ink-2">{c.desc}</p>
            </Link>
          ))}
        </div>
      </div>
    </>
  );
}
