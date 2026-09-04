"use client";

import { useState } from "react";
import { Store, Check } from "lucide-react";
import {
  GANCHO, BENEFICIOS, INCLUYE, IDEAL_PARA, LETRA_CHICA,
  PRECIO_TIENDA, precioEscrito, loQueTeAhorras, desdeCuantoSePagaSola, COMISION_APPS,
} from "@/lib/planes/tiendaAddon";

/**
 * La tarjeta que vende la Tienda en WhatsApp.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * NO ES UNA LÍNEA MÁS DE LA LISTA DE COMPLEMENTOS. Los demás complementos son
 * consumibles —mil mensajes, un giga— que se compran solos cuando hacen falta y
 * no necesitan convencer a nadie. La tienda es un producto de 59 al mes que
 * cambia lo que el negocio puede hacer, y eso hay que explicarlo.
 *
 * ── LA CALCULADORA VA ARRIBA Y NO ES UN ADORNO ────────────────────────────
 *
 * Contra quien se compite aquí no es contra otra plataforma: es contra las apps
 * de delivery, que se llevan entre el 25% y el 30% de cada pedido. Un negocio
 * que factura 3.000 al mes por ahí les está regalando unos 800. Ese número, con
 * SUS ventas, es lo que hace la venta — más que cualquier lista de funciones.
 *
 * EMPIEZA VACÍA, no con una cifra inventada. Un número puesto por nosotros es
 * una promesa; un número que él escribe es su propia cuenta.
 * ─────────────────────────────────────────────────────────────────────────────
 */
export function TiendaEnVenta({
  precio = PRECIO_TIENDA,
  tiendasActivas = 0,
  onComprar,
  comprando = false,
}: {
  precio?: number;
  /** Cuántas tiene ya. Cambia el texto entero: no es lo mismo vender que ampliar. */
  tiendasActivas?: number;
  onComprar?: () => void;
  comprando?: boolean;
}) {
  const [ventas, setVentas] = useState("");
  const ahorro = loQueTeAhorras(Number(ventas.replace(/[^\d]/g, "")), precio);
  const yaTiene = tiendasActivas > 0;

  return (
    <div className="card-l overflow-hidden p-0">
      <div className="border-b border-linea bg-suave p-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="flex items-start gap-3">
            <span className="grid h-11 w-11 flex-none place-items-center rounded-2xl bg-pink/15 text-pink">
              <Store className="h-5 w-5" />
            </span>
            <div>
              <h3 className="font-display text-lg font-semibold text-ink">Tienda en WhatsApp</h3>
              <p className="mt-0.5 max-w-lg text-sm text-ink-2">{GANCHO}</p>
            </div>
          </div>
          <div className="text-right">
            <div className="font-display text-2xl font-bold text-ink">${precio}</div>
            <div className="text-[11px] text-ink-3">al mes por tienda</div>
          </div>
        </div>

        {/* QUIEN YA PAGA UNA TIENE QUE VER SU FACTURA, no un anuncio. */}
        {yaTiene && (
          <p className="mt-3 rounded-xl border border-linea bg-fondo px-3 py-2 text-xs text-ink-2">
            Tienes <b className="text-ink">{tiendasActivas}</b>{" "}
            {tiendasActivas === 1 ? "tienda activa" : "tiendas activas"}:{" "}
            <b className="text-ink">${tiendasActivas * precio} al mes</b>. Cada local lleva su
            propio inventario, su propio Yappy y sus propios pedidos.
          </p>
        )}
      </div>

      {/* ── La cuenta que hace la venta ─────────────────────────────────── */}
      <div className="border-b border-linea p-5">
        <label className="block text-xs font-semibold text-ink-2">
          ¿Cuánto vendes al mes por apps de delivery?
        </label>
        <div className="mt-1.5 flex flex-wrap items-center gap-3">
          <div className="flex items-center gap-1.5">
            <span className="text-sm text-ink-3">$</span>
            <input
              inputMode="numeric"
              value={ventas}
              onChange={(e) => setVentas(e.target.value)}
              placeholder="3000"
              className="input-l w-32"
            />
          </div>
          {ahorro > 0 && (
            <p className="text-sm text-ink-2">
              Les estás dejando ~<b className="text-ink">${Math.round(Number(ventas.replace(/[^\d]/g, "")) * COMISION_APPS)}</b>{" "}
              al mes en comisiones. Aquí te ahorrarías{" "}
              <b className="text-exito">${ahorro}</b>.
            </p>
          )}
        </div>
        <p className="mt-2 text-[11px] text-ink-3">
          Las apps se llevan entre el 25% y el 30% de cada pedido. La tienda se paga sola a partir
          de <b className="text-ink-2">${desdeCuantoSePagaSola(precio)}</b> vendidos al mes.
        </p>
      </div>

      {/* ── Por qué, en orden de lo que más mueve ───────────────────────── */}
      <div className="grid gap-4 p-5 sm:grid-cols-2">
        {BENEFICIOS.map((b) => (
          <div key={b.titulo}>
            <h4 className="text-sm font-semibold text-ink">{b.titulo}</h4>
            <p className="mt-0.5 text-[13px] leading-snug text-ink-2">{b.texto}</p>
          </div>
        ))}
      </div>

      <div className="grid gap-5 border-t border-linea p-5 sm:grid-cols-2">
        <div>
          <h4 className="text-xs font-bold uppercase tracking-wide text-ink-3">Qué incluye</h4>
          <ul className="mt-2 space-y-1">
            {INCLUYE.map((x) => (
              <li key={x} className="flex gap-2 text-[13px] text-ink-2">
                <Check className="mt-[3px] h-3.5 w-3.5 flex-none text-exito" />
                <span>{x}</span>
              </li>
            ))}
          </ul>
        </div>
        <div>
          <h4 className="text-xs font-bold uppercase tracking-wide text-ink-3">Ideal para</h4>
          <ul className="mt-2 space-y-1">
            {IDEAL_PARA.map((x) => (
              <li key={x} className="text-[13px] text-ink-2">· {x}</li>
            ))}
          </ul>
        </div>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3 border-t border-linea bg-suave p-5">
        {/* LA LETRA CHICA NO SE ESCONDE. Una cadena tiene que poder calcular su
            factura antes de preguntar, y quien cierra un local tiene que saber
            que deja de pagarlo. Enterarse DESPUÉS es lo que rompe la confianza. */}
        <p className="max-w-md text-[11px] leading-snug text-ink-3">{LETRA_CHICA}</p>
        <button
          type="button"
          onClick={onComprar}
          disabled={comprando || !onComprar}
          className="btn-primario disabled:opacity-60"
        >
          {comprando ? "Un momento…" : yaTiene ? "Agregar otra tienda" : `Activar mi tienda · ${precioEscrito(precio)}`}
        </button>
      </div>
    </div>
  );
}
