"use client";

import { useState } from "react";
import { CreditCard, Loader2 } from "lucide-react";

/**
 * Lleva al portal de Stripe: cambiar tarjeta, ver recibos, cancelar.
 *
 * POR QUÉ NO HACEMOS ESA PANTALLA NOSOTROS: los datos de la tarjeta no deben
 * pasar jamás por nuestro servidor, y los recibos y facturas ya los emite
 * Stripe. Rehacerlo sería mucho trabajo para quedar peor y asumir un riesgo
 * que hoy no tenemos.
 */
export function PortalPago({ etiqueta = "Administrar mi pago" }: { etiqueta?: string }) {
  const [ocupado, setOcupado] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const abrir = async () => {
    setError(null);
    setOcupado(true);
    try {
      const r = await fetch("/api/billing/portal", { method: "POST" });
      const j = await r.json();
      if (j?.url) {
        window.location.href = j.url;
        return;
      }
      setError(j?.error ?? "No pudimos abrir el portal.");
    } catch {
      setError("No pudimos conectar. Inténtalo otra vez.");
    }
    setOcupado(false);
  };

  return (
    <>
      <button onClick={abrir} disabled={ocupado} className="btn-soft disabled:opacity-60">
        {ocupado ? <Loader2 className="h-4 w-4 animate-spin" /> : <CreditCard className="h-4 w-4" />}
        {ocupado ? "Abriendo…" : etiqueta}
      </button>
      {error && <p className="mt-1.5 text-[11px] text-danger">{error}</p>}
    </>
  );
}
