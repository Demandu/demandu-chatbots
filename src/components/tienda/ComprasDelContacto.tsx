"use client";

import { useEffect, useState } from "react";
import { ShoppingBag, RotateCcw } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { comoDinero } from "@/lib/tienda/variedades";
import {
  metricasDeCliente,
  comoFrecuencia,
  SIN_COMPRAS,
  type MetricasCliente,
  type PedidoDeCliente,
} from "@/lib/tienda/metricas";

/**
 * Lo que este contacto ha comprado, dentro de su ficha.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * ES LA RESPUESTA A «¿A QUIÉN ESTOY ATENDIENDO?», que es la pregunta que se
 * hace cualquiera antes de contestar un mensaje. Alguien que compra cada semana
 * y alguien que probó una vez no merecen la misma respuesta, y hoy eso solo lo
 * sabe quien se acuerde de esa persona.
 *
 * SI NO HA COMPRADO NUNCA, ESTE BLOQUE NO APARECE. Un panel lleno de ceros y
 * rayas ocupa el sitio de lo que sí importa —el nombre, de dónde vino, las
 * notas— y entrena a la gente a no mirar hacia abajo.
 *
 * LOS FAVORITOS SON LO ÚNICO QUE SE USA AL ESCRIBIR. El resto son números que
 * se miran; «siempre pide el saco de 30 lb» es una frase que se teclea.
 * ─────────────────────────────────────────────────────────────────────────────
 */
export function ComprasDelContacto({
  contactoId,
  moneda = "$",
}: {
  contactoId: string;
  moneda?: string;
}) {
  const [m, setM] = useState<MetricasCliente>(SIN_COMPRAS);
  const [cargando, setCargando] = useState(true);

  useEffect(() => {
    let vivo = true;
    setCargando(true);

    (async () => {
      const { data } = await createClient()
        .from("pedidos")
        .select("created_at,estado,total,pedido_lineas(nombre,cantidad,precio)")
        .eq("contacto_id", contactoId)
        .order("created_at", { ascending: false })
        .limit(200);

      if (!vivo) return;
      const pedidos: PedidoDeCliente[] = ((data ?? []) as Record<string, unknown>[]).map((p) => ({
        created_at: String(p.created_at),
        estado: String(p.estado),
        total: Number(p.total),
        lineas: (p.pedido_lineas ?? []) as PedidoDeCliente["lineas"],
      }));
      setM(metricasDeCliente(pedidos));
      setCargando(false);
    })();

    return () => {
      vivo = false;
    };
  }, [contactoId]);

  if (cargando || m.pedidos === 0) return null;

  const fecha = (iso: string | null) =>
    iso ? new Date(iso).toLocaleDateString("es", { day: "numeric", month: "short", year: "2-digit" }) : "—";

  return (
    <div className="border-t border-surface-border pt-4">
      <div className="mb-2 flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wide text-muted-2">
        <ShoppingBag className="h-3.5 w-3.5" /> Compras
      </div>

      {/* VOLVIÓ ES LO PRIMERO. Es el único dato que cambia el tono del mensaje
          antes de leer ninguna cifra: a un cliente que repite no se le trata
          como a un desconocido. */}
      {m.volvio && (
        <div className="mb-2 inline-flex items-center gap-1.5 rounded-full bg-success/15 px-2.5 py-1 text-[11px] font-semibold text-success">
          <RotateCcw className="h-3 w-3" /> Cliente que repite
          {m.frecuencia !== null && ` · ${comoFrecuencia(m.frecuencia)}`}
        </div>
      )}

      <div className="grid grid-cols-2 gap-2">
        <Dato titulo="Pedidos" valor={String(m.pedidos)} pie={`${m.entregados} entregados`} />
        <Dato
          titulo="Gastado"
          valor={comoDinero(m.gastado, moneda)}
          pie={`ticket ${comoDinero(m.ticket, moneda)}`}
        />
      </div>

      <p className="mt-2 text-[11px] text-muted-2">
        Primera compra {fecha(m.primera)} · última {fecha(m.ultima)}
        {m.cancelados > 0 && (
          <>
            {" · "}
            <span className="text-danger">
              {m.cancelados} cancelado{m.cancelados === 1 ? "" : "s"}
            </span>
          </>
        )}
      </p>

      {m.favoritos.length > 0 && (
        <div className="mt-2">
          <div className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-muted-2">
            Lo que más pide
          </div>
          <ul className="grid gap-0.5">
            {m.favoritos.map((f) => (
              <li key={f.nombre} className="flex items-baseline justify-between gap-2 text-xs text-muted">
                <span className="min-w-0 truncate text-white">{f.nombre}</span>
                <span className="flex-none text-[11px] text-muted-2">
                  {f.unidades}
                  {f.veces > 1 ? ` · ${f.veces} veces` : ""}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

function Dato({ titulo, valor, pie }: { titulo: string; valor: string; pie?: string }) {
  return (
    <div className="rounded-xl border border-surface-border bg-surface-raised p-2.5">
      <div className="text-[11px] uppercase tracking-wide text-muted-2">{titulo}</div>
      <div className="font-display text-lg font-bold text-white">{valor}</div>
      {pie && <div className="text-[11px] text-muted-2">{pie}</div>}
    </div>
  );
}
