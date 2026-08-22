"use client";

import { useState } from "react";
import { Loader2 } from "lucide-react";
import { linkWhatsApp } from "@/lib/contacto";

/**
 * Contratar un plan.
 *
 * Al navegador solo le confiamos el CÓDIGO del plan. El precio lo pone el
 * servidor leyéndolo de la base — si el monto viajara desde aquí, cualquiera
 * podría contratar el plan Profesional por un dólar desde la consola.
 */
export function BotonPlan({
  code,
  etiqueta,
  variante = "suave",
  disponible,
}: {
  code: string;
  etiqueta: string;
  variante?: "suave" | "principal";
  disponible: boolean;
}) {
  const [ocupado, setOcupado] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const contratar = async () => {
    setError(null);
    setOcupado(true);
    try {
      const r = await fetch("/api/checkout/plan", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ plan: code }),
      });
      const j = await r.json();
      if (j?.url) {
        // Se sale a Stripe: no se vuelve, así que no se apaga el "ocupado".
        window.location.href = j.url;
        return;
      }
      setError(j?.error ?? "No pudimos abrir el pago.");
    } catch {
      setError("No pudimos conectar. Revisa tu internet e inténtalo otra vez.");
    }
    setOcupado(false);
  };

  if (!disponible) {
    return (
      <a
        href={linkWhatsApp("Hola, quiero cambiar mi plan de Demandu.")}
        target="_blank"
        rel="noopener noreferrer"
        className="btn-soft mt-4 w-full justify-center"
      >
        Escríbenos para cambiar
      </a>
    );
  }

  return (
    <>
      <button
        onClick={contratar}
        disabled={ocupado}
        className={`${variante === "principal" ? "btn-primary" : "btn-soft"} mt-4 w-full justify-center disabled:opacity-60`}
      >
        {ocupado && <Loader2 className="h-4 w-4 animate-spin" />}
        {ocupado ? "Abriendo el pago…" : etiqueta}
      </button>
      {error && <p className="mt-1.5 text-[11px] text-danger">{error}</p>}
    </>
  );
}
