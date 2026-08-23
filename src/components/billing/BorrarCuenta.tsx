"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Download, Loader2, TriangleAlert } from "lucide-react";
import { CONSENTIMIENTO } from "@/lib/billing/consentimiento";

/**
 * Borrar los datos de la cuenta.
 *
 * DOS DECISIONES DE DISEÑO QUE NO SON ADORNO:
 *
 *  · **Exportar va primero, y arriba.** Borrar solo es seguro cuando el cliente
 *    pudo llevarse lo suyo. Ofrecerlo después sería ofrecerlo tarde.
 *
 *  · **Hay que ESCRIBIR el nombre del negocio.** Una casilla se marca sin leer.
 *    Escribir obliga a mirar de qué cuenta se trata — protege del clic en
 *    caliente y de la pestaña equivocada, que es el error real.
 *
 * El consentimiento se muestra completo, no detrás de un enlace. Si el texto
 * da vergüenza enseñarlo entero, el problema es el texto.
 */
export function BorrarCuenta({ negocio }: { negocio: string }) {
  const router = useRouter();
  const [abierto, setAbierto] = useState(false);
  const [escrito, setEscrito] = useState("");
  const [acepto, setAcepto] = useState(false);
  const [motivo, setMotivo] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [listo, setListo] = useState<{ whatsappSoltada: boolean } | null>(null);
  const [ocupado, empezar] = useTransition();

  const normal = (s: string) =>
    s.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/\s+/g, " ").trim();
  const nombreOk = !!negocio && normal(escrito) === normal(negocio);

  const borrar = () =>
    empezar(async () => {
      setError(null);
      try {
        const r = await fetch("/api/billing/borrar", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ confirmacion: escrito, acepto, motivo: motivo || null }),
        });
        const j = await r.json();
        if (!r.ok) { setError(j?.error ?? "No se pudo."); return; }
        setListo({ whatsappSoltada: !!j.whatsappSoltada });
        router.refresh();
      } catch {
        setError("No pudimos conectar. Inténtalo otra vez.");
      }
    });

  if (listo) {
    return (
      <div className="rounded-2xl border border-linea bg-tarjeta p-5">
        <h3 className="font-display text-base font-semibold text-ink">Tus datos se borraron</h3>
        <p className="mt-1.5 text-sm leading-snug text-ink-2">
          Ya no conservamos tus contactos, conversaciones, chatbots ni tu información de entrenamiento.
          Solo quedan tus registros de facturación, porque la ley nos obliga.
        </p>
        <p className="mt-2 rounded-xl border border-warning/40 bg-warning/10 px-3 py-2 text-xs leading-snug text-ink">
          <TriangleAlert className="mr-1 inline h-3.5 w-3.5 text-warning" />
          <b>Tu cuenta de WhatsApp Business sigue existiendo en Meta</b> — es tuya, no nuestra.
          {listo.whatsappSoltada ? " Soltamos la conexión con Demandu." : ""} Si quieres eliminarla,
          hazlo desde tu Meta Business Manager.
        </p>
      </div>
    );
  }

  return (
    <div className="rounded-2xl border border-danger/30 bg-tarjeta p-5">
      <h3 className="font-display text-base font-semibold text-ink">Borrar mis datos</h3>
      <p className="mt-1 text-xs leading-snug text-ink-3">
        Elimina de forma permanente todo lo que tienes en Demandu. No se puede deshacer.
      </p>

      {/* Primero llevarse lo suyo. Sin esto, borrar es una trampa. */}
      <div className="mt-3 rounded-xl border border-linea bg-suave p-3">
        <p className="text-xs font-semibold text-ink">Antes de borrar, llévate tus datos</p>
        <div className="mt-2 flex flex-wrap gap-2">
          <a href="/api/billing/exportar?que=contactos" className="btn-soft px-3 py-1.5 text-xs">
            <Download className="h-3.5 w-3.5" /> Contactos (CSV)
          </a>
          <a href="/api/billing/exportar?que=conversaciones" className="btn-soft px-3 py-1.5 text-xs">
            <Download className="h-3.5 w-3.5" /> Conversaciones (CSV)
          </a>
        </div>
        <p className="mt-1.5 text-[11px] text-ink-3">Se abren en Excel o en Google Sheets.</p>
      </div>

      {!abierto ? (
        <button
          onClick={() => setAbierto(true)}
          className="mt-3 text-xs font-medium text-danger underline underline-offset-2"
        >
          Quiero borrar mis datos
        </button>
      ) : (
        <div className="mt-3 space-y-3">
          <pre className="max-h-48 overflow-auto whitespace-pre-wrap rounded-xl border border-linea bg-suave p-3 font-sans text-[11px] leading-relaxed text-ink-2">
            {CONSENTIMIENTO}
          </pre>

          <div>
            <label className="mb-1 block text-xs font-semibold text-ink-2">
              ¿Nos cuentas por qué te vas? (opcional)
            </label>
            <input
              value={motivo}
              onChange={(e) => setMotivo(e.target.value)}
              placeholder="Precio, me faltó una función, cerré el negocio…"
              className="input-l"
            />
          </div>

          <div>
            <label className="mb-1 block text-xs font-semibold text-ink-2">
              Escribe <b className="text-ink">{negocio}</b> para confirmar
            </label>
            <input
              value={escrito}
              onChange={(e) => setEscrito(e.target.value)}
              placeholder={negocio}
              className="input-l"
              autoComplete="off"
            />
          </div>

          <label className="flex cursor-pointer items-start gap-2.5">
            <input
              type="checkbox"
              checked={acepto}
              onChange={(e) => setAcepto(e.target.checked)}
              className="mt-0.5 h-4 w-4 accent-pink"
            />
            <span className="text-xs leading-snug text-ink-2">
              He leído y acepto lo de arriba. Entiendo que esto no se puede deshacer.
            </span>
          </label>

          {error && (
            <p className="rounded-xl border border-danger/40 bg-danger/10 px-3 py-2 text-xs text-danger">{error}</p>
          )}

          <div className="flex flex-wrap gap-2">
            <button
              onClick={borrar}
              disabled={ocupado || !nombreOk || !acepto}
              className="inline-flex items-center gap-2 rounded-xl bg-danger px-4 py-2.5 text-sm font-semibold text-white transition hover:opacity-90 disabled:opacity-40"
            >
              {ocupado && <Loader2 className="h-4 w-4 animate-spin" />}
              {ocupado ? "Borrando…" : "Borrar todo permanentemente"}
            </button>
            <button onClick={() => setAbierto(false)} disabled={ocupado} className="btn-soft">
              Cancelar
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
