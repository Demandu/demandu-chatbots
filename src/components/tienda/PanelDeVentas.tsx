"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useFormState, useFormStatus } from "react-dom";
import Link from "next/link";
import {
  TrendingUp, Wallet, AlertCircle, UserPlus, RotateCcw, UserSearch,
  Download, Tag, Send, Loader2, ChevronDown,
} from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { comoDinero } from "@/lib/tienda/variedades";
import {
  RANGOS, rangoDeFechas, rangoEscrito, comoRango, comoCasilla, cambio,
  comoCsv, comoNombre, aQuienSePuedeEscribir,
  type ClaveRango, type Rango, type PersonaDeLista,
} from "@/lib/tienda/panel";
import type { Estado } from "@/app/(dashboard)/tienda/[id]/actions";

/**
 * Qué pasó en la tienda, y a quién le pasó.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * UN NÚMERO QUE NO SE PUEDE ABRIR ES UN NÚMERO QUE NO SIRVE. «12 pedidos sin
 * cobrar» se lee, se asiente y se olvida. «12 pedidos sin cobrar → aquí están
 * las 12 personas → a las 12 les mando la plantilla de cobro» es dinero que
 * entra esta semana. Por eso cada cifra de aquí se abre, y lo que hay debajo no
 * es una tabla: son personas con teléfono.
 *
 * NO SE INVENTÓ UN OBJETO «GRUPO». Lo que sale de aquí se convierte en una
 * ETIQUETA, que ya existe en la ficha del contacto, en la Bandeja, en el
 * buscador y en el selector de audiencia de las difusiones. Un grupo que solo
 * entendiera esta pantalla sería una lista que ninguna otra puede usar — y la
 * gracia es justamente poder usarla en todas.
 *
 * VA ARRIBA DEL TABLERO Y ARRANCA CERRADO. Quien entra a Pedidos viene a
 * despachar; los números son para el dueño, que entra menos veces y con otra
 * pregunta en la cabeza.
 * ─────────────────────────────────────────────────────────────────────────────
 */

type Resumen = {
  ventas: {
    pedidos: number; monto: number; cobrado: number; sin_pagar: number;
    cuantos_sin_pagar: number; sin_cobro_en_linea: number; ticket: number;
  };
  anterior: { pedidos: number; monto: number; cobrado: number };
  gente: { compradores: number; nuevos: number; repiten: number; leads: number };
  listas: {
    nuevos: PersonaDeLista[]; repiten: PersonaDeLista[];
    sin_pagar: PersonaDeLista[]; leads: PersonaDeLista[];
  };
};

type ClaveLista = keyof Resumen["listas"];

const COLUMNAS: Record<ClaveLista, { clave: keyof PersonaDeLista; titulo: string }[]> = {
  nuevos: [
    { clave: "name", titulo: "Nombre" }, { clave: "phone", titulo: "Teléfono" },
    { clave: "pedidos", titulo: "Pedidos" }, { clave: "gastado", titulo: "Gastado" },
    { clave: "ultima", titulo: "Último pedido" }, { clave: "tags", titulo: "Etiquetas" },
  ],
  repiten: [
    { clave: "name", titulo: "Nombre" }, { clave: "phone", titulo: "Teléfono" },
    { clave: "pedidos", titulo: "Pedidos" }, { clave: "gastado", titulo: "Gastado" },
    { clave: "ultima", titulo: "Último pedido" }, { clave: "tags", titulo: "Etiquetas" },
  ],
  sin_pagar: [
    { clave: "name", titulo: "Nombre" }, { clave: "phone", titulo: "Teléfono" },
    { clave: "numero", titulo: "Pedido" }, { clave: "codigo", titulo: "Código" },
    { clave: "total", titulo: "Importe" }, { clave: "pago", titulo: "Estado del cobro" },
  ],
  leads: [
    { clave: "name", titulo: "Nombre" }, { clave: "phone", titulo: "Teléfono" },
    { clave: "created_at", titulo: "Entró" }, { clave: "tags", titulo: "Etiquetas" },
  ],
};

function Etiquetar() {
  const { pending } = useFormStatus();
  return (
    <button className="btn-soft px-3 py-1.5 text-xs" disabled={pending}>
      {pending ? "Etiquetando…" : "Etiquetar a todos"}
    </button>
  );
}

export function PanelDeVentas({
  tiendaId,
  botId,
  moneda,
  accionEtiquetar,
}: {
  tiendaId: string;
  /** Para poder mandarles una plantilla: las difusiones salen de un chatbot. */
  botId: string | null;
  moneda: string;
  accionEtiquetar: (e: Estado, fd: FormData) => Promise<Estado>;
}) {
  const sb = useMemo(() => createClient(), []);
  const [abierto, setAbierto] = useState(false);
  const [clave, setClave] = useState<ClaveRango>("mes");
  const [rango, setRango] = useState<Rango>(() => rangoDeFechas("mes"));
  const [aMano, setAMano] = useState({ desde: "", hasta: "" });
  const [r, setR] = useState<Resumen | null>(null);
  const [cargando, setCargando] = useState(false);
  const [error, setError] = useState("");
  const [lista, setLista] = useState<ClaveLista | null>(null);
  const [etiqueta, setEtiqueta] = useState("");
  const [estado, etiquetar] = useFormState(accionEtiquetar, { ok: false, mensaje: "" });

  const traer = useCallback(
    async (ran: Rango) => {
      setCargando(true);
      setError("");
      const { data, error: e } = await sb.rpc("tienda_resumen", {
        p_tienda: tiendaId,
        p_desde: ran.desde.toISOString(),
        p_hasta: ran.hasta.toISOString(),
        p_limite: 500,
      });
      setCargando(false);
      if (e) {
        setError("No se pudieron traer los números.");
        return;
      }
      setR(data as Resumen);
    },
    [sb, tiendaId],
  );

  // NO SE PIDE NADA HASTA QUE SE ABRE. Es la consulta más pesada de la
  // pantalla, y quien viene a despachar pedidos no la necesita nunca.
  useEffect(() => {
    if (abierto) traer(rango);
  }, [abierto, rango, traer]);

  const elegir = (c: ClaveRango) => {
    setClave(c);
    setLista(null);
    if (c !== "personalizado") setRango(rangoDeFechas(c));
  };

  const aplicarAMano = () => {
    const ran = rangoEscrito(aMano.desde, aMano.hasta);
    if (!ran) {
      setError("Esas fechas no cuadran: la primera tiene que ser anterior a la segunda.");
      return;
    }
    setError("");
    setLista(null);
    setRango(ran);
  };

  const filas = r && lista ? r.listas[lista] ?? [] : [];
  const aQuien = aQuienSePuedeEscribir(filas);

  const descargar = () => {
    if (!lista || !filas.length) return;
    const csv = comoCsv(filas, COLUMNAS[lista], moneda);
    // BOM al principio: sin él, Excel abre el archivo y los acentos salen rotos
    // («MarÃ­a»), que es lo primero que ve el cliente al abrirlo.
    const blob = new Blob(["﻿" + csv], { type: "text/csv;charset=utf-8;" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `${lista}-${comoCasilla(rango.desde)}-a-${comoCasilla(new Date(rango.hasta.getTime() - 1))}.csv`;
    a.click();
    URL.revokeObjectURL(a.href);
  };

  return (
    <section className="mb-4 rounded-2xl border border-linea">
      <button
        type="button"
        onClick={() => setAbierto((v) => !v)}
        className="flex w-full items-center gap-2 p-3 text-left"
      >
        <TrendingUp className="h-4 w-4 flex-none text-violet" />
        <span className="text-sm font-semibold text-ink">Resultados</span>
        <span className="text-sm text-ink-2">
          {r ? `${comoDinero(r.ventas.monto, moneda)} · ${comoRango(rango)}` : "ventas, clientes y quién quedó debiendo"}
        </span>
        <ChevronDown className={`ml-auto h-4 w-4 flex-none text-ink-2 transition ${abierto ? "rotate-180" : ""}`} />
      </button>

      {abierto && (
        <div className="border-t border-linea p-3">
          {/* ── El rango ─────────────────────────────────────────────────── */}
          <div className="mb-3 flex flex-wrap items-center gap-1.5">
            {RANGOS.map((x) => (
              <button
                key={x.clave}
                type="button"
                onClick={() => elegir(x.clave)}
                className={`rounded-lg px-2.5 py-1 text-xs font-medium transition ${
                  clave === x.clave ? "bg-violet text-white" : "text-ink-2 hover:bg-suave hover:text-ink"
                }`}
              >
                {x.etiqueta}
              </button>
            ))}
            {cargando && <Loader2 className="h-4 w-4 animate-spin text-ink-3" />}
          </div>

          {clave === "personalizado" && (
            <div className="mb-3 flex flex-wrap items-end gap-2">
              <div>
                <label className="mb-1 block text-[11px] font-semibold text-ink-2">Desde</label>
                <input
                  type="date"
                  value={aMano.desde}
                  onChange={(e) => setAMano((v) => ({ ...v, desde: e.target.value }))}
                  className="input-l py-1.5 text-sm"
                />
              </div>
              <div>
                <label className="mb-1 block text-[11px] font-semibold text-ink-2">Hasta</label>
                <input
                  type="date"
                  value={aMano.hasta}
                  onChange={(e) => setAMano((v) => ({ ...v, hasta: e.target.value }))}
                  className="input-l py-1.5 text-sm"
                />
              </div>
              <button type="button" onClick={aplicarAMano} className="btn-soft px-3 py-1.5 text-xs">
                Ver
              </button>
            </div>
          )}

          {error && <p className="mb-3 text-sm text-danger">{error}</p>}

          {r && (
            <>
              <div className="grid gap-2 sm:grid-cols-3 lg:grid-cols-6">
                <Cifra
                  icono={<TrendingUp className="h-3.5 w-3.5" />}
                  titulo="Vendido"
                  valor={comoDinero(r.ventas.monto, moneda)}
                  pie={`${r.ventas.pedidos} pedido${r.ventas.pedidos === 1 ? "" : "s"} · ticket ${comoDinero(r.ventas.ticket, moneda)}`}
                  delta={cambio(r.ventas.monto, r.anterior.monto)}
                />
                <Cifra
                  icono={<Wallet className="h-3.5 w-3.5" />}
                  titulo="Cobrado"
                  valor={comoDinero(r.ventas.cobrado, moneda)}
                  pie={
                    r.ventas.sin_cobro_en_linea > 0
                      ? `${r.ventas.sin_cobro_en_linea} se cobran al entregar`
                      : "por Yappy"
                  }
                  delta={cambio(r.ventas.cobrado, r.anterior.cobrado)}
                />
                {/* ESTA ES LA CIFRA QUE PAGA EL PANEL. Es dinero que ya se pidió
                    y no entró, y hay una plantilla aprobada para recuperarlo. */}
                <Cifra
                  icono={<AlertCircle className="h-3.5 w-3.5" />}
                  titulo="Sin pagar"
                  valor={comoDinero(r.ventas.sin_pagar, moneda)}
                  pie={`${r.ventas.cuantos_sin_pagar} pedido${r.ventas.cuantos_sin_pagar === 1 ? "" : "s"}`}
                  alerta={r.ventas.cuantos_sin_pagar > 0}
                  activa={lista === "sin_pagar"}
                  onClick={() => setLista(lista === "sin_pagar" ? null : "sin_pagar")}
                />
                <Cifra
                  icono={<UserPlus className="h-3.5 w-3.5" />}
                  titulo="Clientes nuevos"
                  valor={String(r.gente.nuevos)}
                  pie="primera compra aquí"
                  activa={lista === "nuevos"}
                  onClick={() => setLista(lista === "nuevos" ? null : "nuevos")}
                />
                <Cifra
                  icono={<RotateCcw className="h-3.5 w-3.5" />}
                  titulo="Volvieron"
                  valor={String(r.gente.repiten)}
                  pie={`de ${r.gente.compradores} que compraron`}
                  activa={lista === "repiten"}
                  onClick={() => setLista(lista === "repiten" ? null : "repiten")}
                />
                <Cifra
                  icono={<UserSearch className="h-3.5 w-3.5" />}
                  titulo="Leads"
                  valor={String(r.gente.leads)}
                  pie="escribieron y no han comprado"
                  activa={lista === "leads"}
                  onClick={() => setLista(lista === "leads" ? null : "leads")}
                />
              </div>

              {lista && <Detalle />}
            </>
          )}
        </div>
      )}
    </section>
  );

  function Detalle() {
    if (!lista) return null;
    if (!filas.length) {
      return (
        <p className="mt-3 rounded-xl border border-linea-2 p-3 text-sm text-ink-2">
          No hay nadie en esta lista en {comoRango(rango)}.
        </p>
      );
    }

    return (
      <div className="mt-3 rounded-xl border border-linea-2">
        {/* ── Lo que se puede HACER con la lista ─────────────────────────
            Va arriba y no abajo: con cuarenta filas, un botón al final del
            listado no lo encuentra nadie. */}
        <div className="flex flex-wrap items-center gap-2 border-b border-linea-2 p-2.5">
          <span className="text-xs font-semibold text-ink">
            {filas.length} {lista === "sin_pagar" ? "pedidos" : "personas"}
            {aQuien.length !== filas.length && ` · ${aQuien.length} con teléfono`}
          </span>

          <button type="button" onClick={descargar} className="btn-soft px-3 py-1.5 text-xs">
            <Download className="mr-1 inline h-3 w-3" /> Descargar
          </button>

          <form action={etiquetar} className="flex flex-wrap items-center gap-1.5">
            <input type="hidden" name="ids" value={JSON.stringify(aQuien)} />
            <Tag className="h-3.5 w-3.5 text-ink-3" />
            <input
              name="etiqueta"
              value={etiqueta}
              onChange={(e) => setEtiqueta(e.target.value)}
              placeholder={sugerencia(lista, rango)}
              maxLength={40}
              className="input-l w-48 py-1.5 text-xs"
            />
            <Etiquetar />
          </form>

          {/* ── Y de ahí a la difusión ──────────────────────────────────
              La etiqueta viaja en la dirección, así que la pantalla de
              difusiones llega con la audiencia ya puesta. Escribirla otra vez
              a mano es donde alguien se equivoca y le manda la plantilla a
              toda su base de contactos. */}
          {botId && etiqueta.trim() && estado.ok && (
            <Link
              href={`/bots/${botId}/broadcasts?tag=${encodeURIComponent(etiqueta.trim())}`}
              className="btn-primary px-3 py-1.5 text-xs"
            >
              <Send className="mr-1 inline h-3 w-3" /> Mandarles una plantilla
            </Link>
          )}

          {estado.mensaje && (
            <span className={`text-xs ${estado.ok ? "text-exito" : "text-danger"}`}>
              {estado.mensaje}
            </span>
          )}
        </div>

        <div className="max-h-80 overflow-auto">
          <table className="w-full text-left text-xs">
            <thead className="sticky top-0 bg-tarjeta">
              <tr className="text-ink-2">
                {COLUMNAS[lista].map((c) => (
                  <th key={String(c.clave)} className="px-2.5 py-2 font-semibold">{c.titulo}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filas.map((p, i) => (
                <tr key={i} className="border-t border-linea-2">
                  {COLUMNAS[lista!].map((c) => (
                    <td key={String(c.clave)} className="px-2.5 py-1.5 text-ink">
                      {celda(p, c.clave, moneda)}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    );
  }
}

/** Un nombre de etiqueta que ya viene escrito: casi nadie cambia el que se propone. */
function sugerencia(lista: ClaveLista, rango: Rango): string {
  const mes = rango.desde.toLocaleDateString("es", { month: "short", year: "2-digit" });
  const como: Record<ClaveLista, string> = {
    nuevos: "Nuevos",
    repiten: "Recurrentes",
    sin_pagar: "Debe pago",
    leads: "Leads",
  };
  return `${como[lista]} ${mes}`;
}

function celda(p: PersonaDeLista, clave: keyof PersonaDeLista, moneda: string) {
  const v = p[clave];
  if (clave === "name") return comoNombre(p);
  if (v === null || v === undefined || v === "") return <span className="text-ink-3">—</span>;
  if (clave === "gastado" || clave === "total") return comoDinero(Number(v), moneda);
  if (clave === "numero") return `#${v}`;
  if (clave === "tags") return Array.isArray(v) && v.length ? v.join(", ") : <span className="text-ink-3">—</span>;
  if (clave === "ultima" || clave === "created_at") {
    const d = new Date(String(v));
    return Number.isNaN(d.getTime()) ? "—" : d.toLocaleDateString("es", { day: "numeric", month: "short" });
  }
  return String(v);
}

function Cifra({
  icono, titulo, valor, pie, delta, alerta, activa, onClick,
}: {
  icono: React.ReactNode;
  titulo: string;
  valor: string;
  pie?: string;
  delta?: { texto: string; sube: boolean } | null;
  alerta?: boolean;
  activa?: boolean;
  onClick?: () => void;
}) {
  const Caja = onClick ? "button" : "div";
  return (
    <Caja
      {...(onClick ? { type: "button" as const, onClick } : {})}
      className={`rounded-xl border p-2.5 text-left transition ${
        activa ? "border-violet bg-suave" : "border-linea-2"
      } ${onClick ? "cursor-pointer hover:border-violet/50" : ""}`}
    >
      <div className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-ink-2">
        <span className={alerta ? "text-alerta" : "text-ink-3"}>{icono}</span>
        {titulo}
      </div>
      <div className="mt-0.5 flex items-baseline gap-1.5">
        <span className={`font-display text-lg font-bold ${alerta ? "text-alerta" : "text-ink"}`}>
          {valor}
        </span>
        {delta && (
          <span className={`text-[11px] font-semibold ${delta.sube ? "text-exito" : "text-alerta"}`}>
            {delta.texto}
          </span>
        )}
      </div>
      {pie && <div className="text-[11px] text-ink-3">{pie}</div>}
    </Caja>
  );
}
