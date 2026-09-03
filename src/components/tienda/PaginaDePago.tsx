"use client";

import { useState } from "react";
import { BotonYappy } from "./BotonYappy";
import { comoDinero } from "@/lib/tienda/variedades";
import type { ConfigTienda } from "@/lib/tienda/config";

/**
 * La página donde se paga un pedido.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * SE LLEGA AQUÍ POR EL ENLACE DEL MENSAJE DE WHATSAPP, no desde el carrito. Eso
 * cambia tres cosas para el negocio:
 *
 *   · El pedido ya llegó. Si el pago falla, la venta no se pierde.
 *   · El enlace se puede reenviar mañana: «aún me debes esto, aquí está».
 *   · Quien pidió en la computadora lo abre en el teléfono, que es donde tiene
 *     la app de Yappy.
 *
 * PRIMERO SE VE QUÉ SE ESTÁ PAGANDO, y luego el botón. Un botón de pago sin el
 * detalle encima es exactamente lo que la gente aprendió a no pulsar.
 *
 * EL ESTADO REAL LO PONE EL SERVIDOR, no esta pantalla: aquí solo se dice que
 * el pago se envió. Que esté cobrado lo decide el aviso firmado del banco.
 * ─────────────────────────────────────────────────────────────────────────────
 */

type Linea = { nombre: string; cantidad: number; precio: number; elegidas: { texto: string }[] };

export function PaginaDePago({
  slug,
  codigo,
  numero,
  tienda,
  total,
  moneda,
  lineas,
  colores,
  cdnYappy,
  whatsapp,
}: {
  slug: string;
  codigo: string;
  numero: number;
  tienda: string;
  total: number;
  moneda: string;
  lineas: Linea[];
  colores: ConfigTienda["colores"];
  cdnYappy: string;
  whatsapp: string;
}) {
  const [enviado, setEnviado] = useState(false);
  const [aviso, setAviso] = useState("");

  const pagar = async () => {
    setAviso("");
    try {
      const r = await fetch("/api/tienda/pedido/cobrar", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ slug, codigo }),
      });
      const j = await r.json();
      if (!r.ok || j?.error || j?.yappy_error || !j?.yappy) {
        setAviso(j?.error ?? j?.yappy_error ?? "No se pudo iniciar el pago.");
        return null;
      }
      return j.yappy as { transactionId: string; token: string; documentName: string };
    } catch {
      setAviso("No se pudo hablar con el servidor. Inténtalo otra vez.");
      return null;
    }
  };

  return (
    <div className="grid gap-4">
      <div
        className="rounded-2xl p-4"
        style={{ backgroundColor: "rgba(0,0,0,.04)", border: "1px solid rgba(0,0,0,.08)" }}
      >
        <ul className="grid gap-2">
          {lineas.map((l, i) => (
            <li key={i} className="flex items-start justify-between gap-3">
              <span className="min-w-0">
                <b className="font-semibold">{l.cantidad}×</b> {l.nombre}
                {l.elegidas.length > 0 && (
                  <span className="block text-sm opacity-60">
                    {l.elegidas.map((e) => e.texto).join(", ")}
                  </span>
                )}
              </span>
              <span className="flex-none font-semibold">
                {comoDinero(l.precio * l.cantidad, moneda)}
              </span>
            </li>
          ))}
        </ul>

        <div
          className="mt-3 flex items-baseline justify-between border-t pt-3"
          style={{ borderColor: "rgba(0,0,0,.10)" }}
        >
          <span className="text-lg font-bold">A pagar</span>
          <span className="text-lg font-bold" style={{ color: colores.acento }}>
            {comoDinero(total, moneda)}
          </span>
        </div>
      </div>

      {enviado ? (
        <>
          <p
            className="rounded-2xl py-3 text-center font-bold text-white"
            style={{ backgroundColor: "#16a34a" }}
          >
            Pago enviado ✅
          </p>
          <p className="text-center text-sm opacity-70">
            {tienda} lo confirma en un momento. Puedes cerrar esta página.
          </p>
        </>
      ) : (
        <>
          <BotonYappy
            cdn={cdnYappy}
            onPagar={pagar}
            onExito={() => {
              setEnviado(true);
              setAviso("");
            }}
            onFallo={setAviso}
          />
          <p className="text-center text-sm opacity-70">
            Se abre tu app de Yappy para confirmar. Pedido{" "}
            <b className="font-semibold">#{numero}</b> · código{" "}
            <span className="font-mono">{codigo}</span>
          </p>
        </>
      )}

      {aviso && (
        <p className="text-center text-sm font-semibold" style={{ color: "#dc2626" }}>
          {aviso}
        </p>
      )}

      {/* SIEMPRE HAY UNA SALIDA QUE NO ES PAGAR. Si el banco falla, quien ya
          hizo el pedido tiene que poder escribirle al negocio en vez de
          quedarse mirando un error. */}
      {whatsapp && (
        <a
          href={`https://wa.me/${whatsapp}?text=${encodeURIComponent(`Hola, sobre mi pedido #${numero} (${codigo})`)}`}
          target="_blank"
          rel="noopener noreferrer"
          className="text-center text-sm underline opacity-70"
        >
          Escribirle a {tienda}
        </a>
      )}
    </div>
  );
}
