"use client";

import { useState } from "react";
import Link from "next/link";
import { CalendarCheck, CalendarX, AlertTriangle, Clock } from "lucide-react";
import type { EstadoAgenda } from "@/lib/ai/agenda";

/**
 * El estado real de la agenda, dentro de la pantalla donde se enciende.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * VA AQUÍ Y NO EN INTEGRACIONES A PROPÓSITO. Quien marca «Agendar citas» está
 * en esta pantalla, no en la de conexiones; mandarle a otro sitio a comprobar
 * si su calendario está enchufado es exactamente cómo se queda sin comprobar.
 *
 * Y HAY UN BOTÓN QUE LO PRUEBA DE VERDAD. Decir «conectado» es una promesa;
 * enseñar las tres próximas horas libres es una demostración. Es la misma
 * lección que el cobro: una pantalla que dice que algo está encendido no es lo
 * mismo que ese algo funcionando.
 * ─────────────────────────────────────────────────────────────────────────────
 */
export function EstadoDeAgenda({
  estado,
  cuenta,
  timezone,
  resumenHorario,
}: {
  estado: EstadoAgenda;
  cuenta: string;
  timezone: string;
  resumenHorario: string;
}) {
  const [probando, setProbando] = useState(false);
  const [huecos, setHuecos] = useState<string[] | null>(null);
  const [fallo, setFallo] = useState("");

  // Si no usa la agenda, este bloque no existe: nadie tiene que leer sobre
  // calendarios para montar un bot que solo contesta.
  if (!estado.usaAgenda) return null;

  const probar = async () => {
    setProbando(true);
    setFallo("");
    setHuecos(null);
    try {
      const r = await fetch("/api/calendar/slots", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ durationMin: 30, days: 14, maxSlots: 3 }),
      });
      const j = await r.json();
      if (j?.error === "not_connected") {
        setFallo("Google Calendar no está conectado.");
      } else if (!Array.isArray(j?.slots) || j.slots.length === 0) {
        // NO ES UN ERROR TÉCNICO Y POR ESO ENGAÑA: la conexión funciona y la
        // respuesta es «ninguna hora». Casi siempre es el horario o la agenda
        // llena, no el calendario.
        setFallo(
          "Conecta bien, pero no encontró ni un hueco en 14 días. Revisa tu horario: así el bot le dirá a todo el mundo que no hay disponibilidad.",
        );
      } else {
        setHuecos(j.slots.slice(0, 3).map((s: { label?: string }) => String(s.label ?? "")));
      }
    } catch {
      setFallo("No se pudo comprobar. Inténtalo otra vez.");
    }
    setProbando(false);
  };

  const bien = estado.lista;

  return (
    <div
      className="mt-3 rounded-xl border p-3"
      style={{
        borderColor: bien ? "rgba(16,185,129,.35)" : "rgba(220,38,38,.35)",
        backgroundColor: bien ? "rgba(16,185,129,.07)" : "rgba(220,38,38,.07)",
      }}
    >
      <div className="flex items-center gap-2">
        {bien ? (
          <CalendarCheck className="h-4 w-4 flex-none text-emerald-400" />
        ) : (
          <CalendarX className="h-4 w-4 flex-none text-danger" />
        )}
        <b className="text-[13px] text-ink">
          {bien ? "Tu agenda está lista" : "Tu agenda todavía no puede funcionar"}
        </b>
      </div>

      {estado.problemas.length > 0 && (
        <ul className="mt-2 grid gap-1">
          {estado.problemas.map((p) => (
            <li key={p} className="flex items-start gap-1.5 text-[12px] text-ink-2">
              <AlertTriangle className="mt-0.5 h-3.5 w-3.5 flex-none text-danger" />
              {p}
            </li>
          ))}
        </ul>
      )}

      <dl className="mt-2 grid gap-1 text-[12px] text-ink-2">
        <div className="flex flex-wrap gap-x-1.5">
          <dt className="text-ink-3">Calendario:</dt>
          <dd className="text-ink">{cuenta || "sin conectar"}</dd>
        </div>
        <div className="flex flex-wrap gap-x-1.5">
          <dt className="text-ink-3">Horario:</dt>
          <dd className="text-ink">{resumenHorario}</dd>
        </div>
        <div className="flex flex-wrap gap-x-1.5">
          <dt className="text-ink-3">Zona horaria:</dt>
          {/* LA ZONA HORARIA SE ENSEÑA SIEMPRE Y EN GRANDE. Viene puesta por
              defecto en la de Ciudad de México, y un negocio de otro país que
              no la cambie ofrece todas sus horas corridas. Nadie va a buscarla;
              hay que ponérsela delante. */}
          <dd className="inline-flex items-center gap-1 font-semibold text-ink">
            <Clock className="h-3 w-3" /> {timezone}
          </dd>
        </div>
      </dl>

      <div className="mt-2 flex flex-wrap items-center gap-2">
        <button type="button" onClick={probar} disabled={probando} className="btn-soft">
          {probando ? "Comprobando…" : "Probar mi agenda"}
        </button>
        <Link href="/settings/hours" className="text-[12px] text-ink-2 underline hover:text-ink">
          Cambiar horario y zona
        </Link>
        {!estado.problemas.length || (
          <Link href="/settings/integrations" className="text-[12px] text-ink-2 underline hover:text-ink">
            Conectar Google Calendar
          </Link>
        )}
      </div>

      {huecos && (
        <p className="mt-2 text-[12px] text-emerald-400">
          Funciona. Las próximas horas que ofrecería: <b>{huecos.join(" · ")}</b>
        </p>
      )}
      {fallo && <p className="mt-2 text-[12px] text-danger">{fallo}</p>}

      {estado.avisos.map((a) => (
        <p key={a} className="mt-2 text-[11px] text-ink-3">
          {a}
        </p>
      ))}
    </div>
  );
}
