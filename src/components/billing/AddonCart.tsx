"use client";

import { useMemo, useState } from "react";
import { Plus, Minus, ShoppingCart, Loader2, Lock } from "lucide-react";

export type Addon = {
  code: string;
  name: string;
  description: string | null;
  price: number;
  recurring: boolean;
  unit: string;
  /** El precio es un punto de partida y se cotiza según el trabajo real. */
  isQuote?: boolean;
};

function usd(v: number) {
  return `$${Number(v ?? 0).toLocaleString("es-MX", { maximumFractionDigits: 0 })}`;
}

/**
 * Tienda de complementos con carrito al lado derecho.
 * Pensada para gente no técnica: sumas con +, ves el total y pagas.
 */
export function AddonCart({ addons, pagosActivos }: { addons: Addon[]; pagosActivos: boolean }) {
  const [cart, setCart] = useState<Record<string, number>>({});
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const set = (code: string, n: number) =>
    setCart((c) => {
      const next = { ...c };
      if (n <= 0) delete next[code];
      else next[code] = Math.min(99, n);
      return next;
    });

  const lineas = useMemo(
    () =>
      Object.entries(cart)
        .map(([code, qty]) => {
          const a = addons.find((x) => x.code === code);
          return a ? { ...a, qty, subtotal: a.price * qty } : null;
        })
        .filter(Boolean) as (Addon & { qty: number; subtotal: number })[],
    [cart, addons],
  );

  const mensual = lineas.filter((l) => l.recurring).reduce((s, l) => s + l.subtotal, 0);
  const unico = lineas.filter((l) => !l.recurring).reduce((s, l) => s + l.subtotal, 0);
  const vacio = lineas.length === 0;

  const pagar = async () => {
    setBusy(true);
    setError("");
    try {
      const res = await fetch("/api/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ items: lineas.map((l) => ({ code: l.code, quantity: l.qty })) }),
      });
      const j = await res.json();
      if (j?.url) {
        window.location.href = j.url;
        return;
      }
      setError(j?.error ?? "No pudimos abrir el pago.");
    } catch {
      setError("No pudimos conectar. Revisa tu internet e inténtalo de nuevo.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="grid gap-5 lg:grid-cols-3">
      {/* Complementos */}
      <div className="lg:col-span-2">
        <div className="grid gap-3 sm:grid-cols-2">
          {addons.map((a) => {
            const qty = cart[a.code] ?? 0;
            return (
              <div key={a.code} className={`card-l flex flex-col p-4 transition ${qty > 0 ? "border-pink" : ""}`}>
                <div className="font-semibold text-ink">{a.name}</div>
                <p className="mt-0.5 flex-1 text-xs text-ink-2">{a.description}</p>

                <div className="mt-3 flex items-center justify-between">
                  <span className="font-display text-lg font-bold text-ink">
                    {a.isQuote && <span className="text-xs font-medium text-ink-3">desde </span>}
                    {usd(a.price)}
                    <span className="text-xs font-medium text-ink-3">{a.recurring ? "/mes" : " único"}</span>
                  </span>

                  {qty === 0 ? (
                    <button onClick={() => set(a.code, 1)} className="btn-soft px-3 py-1.5 text-xs">
                      <Plus className="h-3.5 w-3.5" /> Agregar
                    </button>
                  ) : (
                    <div className="flex items-center gap-1.5 rounded-lg border border-linea-2 bg-tarjeta p-1">
                      <button onClick={() => set(a.code, qty - 1)} className="grid h-6 w-6 place-items-center rounded text-ink-2 hover:bg-suave" aria-label="Quitar uno">
                        <Minus className="h-3.5 w-3.5" />
                      </button>
                      <span className="min-w-[22px] text-center text-sm font-bold text-ink">{qty}</span>
                      <button onClick={() => set(a.code, qty + 1)} className="grid h-6 w-6 place-items-center rounded text-ink-2 hover:bg-suave" aria-label="Agregar uno">
                        <Plus className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Carrito */}
      <div className="lg:col-span-1">
        <div className="card-l sticky top-4 p-5">
          <div className="mb-3 flex items-center gap-2">
            <ShoppingCart className="h-4 w-4 text-pink" />
            <h3 className="font-display text-base font-semibold text-ink">Tu carrito</h3>
          </div>

          {vacio ? (
            <p className="rounded-xl border border-dashed border-linea px-3 py-6 text-center text-xs text-ink-3">
              Elige lo que necesitas y aparecerá aquí.
            </p>
          ) : (
            <>
              <div className="space-y-2">
                {lineas.map((l) => (
                  <div key={l.code} className="flex items-start justify-between gap-2 rounded-lg bg-suave px-3 py-2">
                    <div className="min-w-0">
                      <div className="truncate text-[13px] font-medium text-ink">{l.name}</div>
                      <div className="text-[11px] text-ink-3">
                        {l.qty} × {usd(l.price)}{l.recurring ? "/mes" : ""}
                      </div>
                    </div>
                    <span className="flex-none text-sm font-semibold text-ink">{usd(l.subtotal)}</span>
                  </div>
                ))}
              </div>

              <div className="mt-4 space-y-1.5 border-t border-linea pt-3">
                {mensual > 0 && (
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-ink-2">Cada mes</span>
                    <b className="font-display text-lg text-ink">{usd(mensual)}</b>
                  </div>
                )}
                {unico > 0 && (
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-ink-2">Pago único</span>
                    <b className="font-display text-lg text-ink">{usd(unico)}</b>
                  </div>
                )}
              </div>

              {error && (
                <div className="mt-3 rounded-lg border border-danger/40 bg-danger/10 px-3 py-2 text-xs text-danger">
                  {error}
                </div>
              )}

              <button onClick={pagar} disabled={busy || !pagosActivos} className="btn-primary mt-4 w-full justify-center">
                {busy ? (
                  <><Loader2 className="h-4 w-4 animate-spin" /> Abriendo pago…</>
                ) : (
                  <><Lock className="h-4 w-4" /> Pagar</>
                )}
              </button>

              {!pagosActivos && (
                <p className="mt-2 text-center text-[11px] text-ink-3">
                  Los pagos en línea aún no están habilitados. Escríbenos y lo activamos.
                </p>
              )}

              <p className="mt-3 text-center text-[11px] text-ink-3">
                Pago seguro con Stripe. Puedes cancelar cuando quieras.
              </p>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
