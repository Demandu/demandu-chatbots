"use client";

import { useMemo, useState } from "react";
import { Search, ShoppingBag, Plus, Minus, ArrowLeft } from "lucide-react";
import { comoDinero, type GrupoVariedad } from "@/lib/tienda/variedades";
import type { ConfigTienda } from "@/lib/tienda/config";
import {
  claveDeLinea,
  cuantasUnidades,
  enlaceDeWhatsapp,
  faltaContestar,
  faltaElegir,
  precioUnitario,
  textoDelPedido,
  totalDelCarrito,
  totalDeLinea,
  type LineaCarrito,
} from "@/lib/tienda/pedido";

export type ProductoPublico = {
  id: string;
  nombre: string;
  descripcion: string | null;
  categoria: string | null;
  precio: number;
  precio_anterior: number | null;
  stock: number | null;
  imagen_url: string | null;
  variedades: GrupoVariedad[];
};

/**
 * La tienda que ve el cliente.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * SE PINTA CON LOS COLORES DEL NEGOCIO, NO CON LOS DE DEMANDU. Quien entra aquí
 * viene de un enlace en la biografía de Instagram de una panadería: si la
 * página se parece a un panel de software, la persona duda de si está en el
 * sitio correcto — y esa duda se paga en pedidos que no se hacen.
 *
 * TODO EN UNA SOLA PÁGINA y sin cuenta: el carrito vive en memoria y el pedido
 * sale por WhatsApp. Pedir registro en una tienda de barrio es perder al
 * cliente en la primera pantalla.
 *
 * EL PEDIDO SE MANDA DESDE EL WHATSAPP DEL CLIENTE. Eso significa que llega al
 * número del negocio como un mensaje entrante de verdad — con su teléfono, su
 * nombre y su historial— así que entra en la Bandeja como conversación. Es lo
 * que ninguna tienda suelta puede hacer.
 * ─────────────────────────────────────────────────────────────────────────────
 */
export function Escaparate({
  config,
  productos,
}: {
  config: ConfigTienda;
  productos: ProductoPublico[];
}) {
  const c = config.colores;
  const [busca, setBusca] = useState("");
  const [buscando, setBuscando] = useState(false);
  const [abierto, setAbierto] = useState<ProductoPublico | null>(null);
  const [carrito, setCarrito] = useState<LineaCarrito[]>([]);
  const [verCarrito, setVerCarrito] = useState(false);
  const [respuestas, setRespuestas] = useState<Record<string, string>>({});
  const [aviso, setAviso] = useState("");

  const visibles = useMemo(() => {
    const q = busca.trim().toLowerCase();
    if (!q) return productos;
    return productos.filter(
      (p) =>
        p.nombre.toLowerCase().includes(q) ||
        (p.descripcion ?? "").toLowerCase().includes(q) ||
        (p.categoria ?? "").toLowerCase().includes(q),
    );
  }, [productos, busca]);

  // Las categorías salen del catálogo y respetan el orden en que se cargaron:
  // el negocio decidió ese orden y casi siempre significa algo.
  const porCategoria = useMemo(() => {
    const mapa = new Map<string, ProductoPublico[]>();
    for (const p of visibles) {
      const k = p.categoria?.trim() || "";
      if (!mapa.has(k)) mapa.set(k, []);
      mapa.get(k)!.push(p);
    }
    return [...mapa.entries()];
  }, [visibles]);

  const total = totalDelCarrito(carrito);
  const unidades = cuantasUnidades(carrito);
  const bajoMinimo = config.minimo_pedido > 0 && total < config.minimo_pedido;

  const agregar = (linea: LineaCarrito) =>
    setCarrito((xs) => {
      const i = xs.findIndex((x) => x.clave === linea.clave);
      if (i >= 0) {
        return xs.map((x, j) => (j === i ? { ...x, cantidad: x.cantidad + linea.cantidad } : x));
      }
      return [...xs, linea];
    });

  const cambiarCantidad = (clave: string, delta: number) =>
    setCarrito((xs) =>
      xs
        .map((x) => (x.clave === clave ? { ...x, cantidad: x.cantidad + delta } : x))
        .filter((x) => x.cantidad > 0),
    );

  const enviar = () => {
    const falta = faltaContestar(config.preguntas, respuestas);
    if (falta.length) {
      setAviso(`Falta ${falta.join(", ")}.`);
      return;
    }
    if (bajoMinimo) {
      setAviso(`El pedido mínimo es ${comoDinero(config.minimo_pedido, config.moneda)}.`);
      return;
    }
    const texto = textoDelPedido({
      tienda: config.titulo,
      lineas: carrito,
      respuestas,
      preguntas: config.preguntas,
      moneda: config.moneda,
    });
    // `_blank` porque en el móvil abre WhatsApp y deja la tienda atrás: si el
    // cliente vuelve, su carrito sigue donde estaba.
    window.open(enlaceDeWhatsapp(config.whatsapp.numero, texto), "_blank");
  };

  return (
    <div style={{ backgroundColor: c.fondo, color: c.texto, minHeight: "100vh" }}>
      {/* ── Cabecera ── */}
      <header style={{ backgroundColor: c.principal }} className="px-4 py-3">
        <div className="mx-auto flex max-w-3xl items-center gap-3">
          {config.logo_url ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={config.logo_url}
              alt={config.titulo}
              className="h-10 w-10 flex-none rounded-xl bg-white/10 object-cover"
            />
          ) : null}
          <div className="min-w-0 flex-1">
            <p className="truncate text-base font-bold text-white">{config.titulo}</p>
            {config.contacto.horario && (
              <p className="truncate text-[11px] text-white/70">{config.contacto.horario}</p>
            )}
          </div>

          <button
            type="button"
            onClick={() => setBuscando((v) => !v)}
            className="grid h-9 w-9 flex-none place-items-center rounded-full text-white/90"
            style={{ backgroundColor: "rgba(255,255,255,.14)" }}
            aria-label="Buscar"
          >
            <Search className="h-4 w-4" />
          </button>

          <button
            type="button"
            onClick={() => setVerCarrito(true)}
            className="relative grid h-9 w-9 flex-none place-items-center rounded-full text-white"
            style={{ backgroundColor: "rgba(255,255,255,.14)" }}
            aria-label="Ver el pedido"
          >
            <ShoppingBag className="h-4 w-4" />
            {unidades > 0 && (
              <span
                className="absolute -right-1 -top-1 grid h-5 min-w-[20px] place-items-center rounded-full px-1 text-[11px] font-bold text-white"
                style={{ backgroundColor: c.acento }}
              >
                {unidades}
              </span>
            )}
          </button>
        </div>

        {buscando && (
          <div className="mx-auto mt-2 max-w-3xl">
            <input
              autoFocus
              value={busca}
              onChange={(e) => setBusca(e.target.value)}
              placeholder="Buscar en la tienda…"
              className="w-full rounded-xl border-0 px-3 py-2 text-sm outline-none"
              style={{ backgroundColor: "rgba(255,255,255,.92)", color: "#111" }}
            />
          </div>
        )}
      </header>

      {config.portada_url && (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={config.portada_url} alt="" className="h-36 w-full object-cover sm:h-52" />
      )}

      {/* ── Banners ── */}
      {config.banners.length > 0 && (
        <div className="mx-auto flex max-w-3xl gap-3 overflow-x-auto px-4 pt-4">
          {config.banners.map((b, i) => {
            const img = (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={b.imagen_url}
                alt={b.alt ?? ""}
                className="h-32 w-[85vw] max-w-md flex-none rounded-2xl object-cover sm:w-80"
              />
            );
            return b.enlace ? (
              <a key={i} href={b.enlace} target="_blank" rel="noopener noreferrer" className="flex-none">
                {img}
              </a>
            ) : (
              <span key={i} className="flex-none">
                {img}
              </span>
            );
          })}
        </div>
      )}

      {/* ── Catálogo ── */}
      <main className="mx-auto max-w-3xl px-4 pb-32 pt-4">
        {visibles.length === 0 && (
          <p className="py-10 text-center text-sm opacity-60">
            {busca ? "No encontramos nada con eso." : "Esta tienda todavía no tiene productos."}
          </p>
        )}

        {porCategoria.map(([cat, items]) => (
          <section key={cat || "sin-categoria"} className="mb-7">
            {cat && (
              <h2 className="mb-3 text-sm font-bold uppercase tracking-wide" style={{ opacity: 0.65 }}>
                {cat}
              </h2>
            )}
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
              {items.map((p) => {
                const agotado = p.stock === 0;
                return (
                  <button
                    key={p.id}
                    type="button"
                    disabled={agotado}
                    onClick={() => setAbierto(p)}
                    className="overflow-hidden rounded-2xl text-left transition disabled:opacity-50"
                    style={{ backgroundColor: "rgba(0,0,0,.04)" }}
                  >
                    {p.imagen_url ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={p.imagen_url} alt={p.nombre} className="aspect-square w-full object-cover" />
                    ) : (
                      <span className="grid aspect-square w-full place-items-center text-xs opacity-40">
                        sin foto
                      </span>
                    )}
                    <span className="block p-2.5">
                      <span className="block text-sm font-semibold leading-tight">{p.nombre}</span>
                      <span className="mt-1 flex items-baseline gap-1.5">
                        <span className="text-base font-bold" style={{ color: c.acento }}>
                          {comoDinero(p.precio, config.moneda)}
                        </span>
                        {p.precio_anterior ? (
                          <span className="text-[11px] line-through opacity-50">
                            {comoDinero(p.precio_anterior, config.moneda)}
                          </span>
                        ) : null}
                      </span>
                      {agotado && <span className="mt-1 block text-[11px] opacity-60">Agotado</span>}
                    </span>
                  </button>
                );
              })}
            </div>
          </section>
        ))}
      </main>

      {/* ── Pie ── */}
      <footer className="px-4 pb-28 text-center text-xs" style={{ opacity: 0.6 }}>
        {config.contacto.direccion && <p>{config.contacto.direccion}</p>}
        {config.contacto.instagram && (
          <p className="mt-1">
            <a
              href={`https://instagram.com/${config.contacto.instagram.replace(/^@/, "")}`}
              target="_blank"
              rel="noopener noreferrer"
              className="underline"
            >
              {config.contacto.instagram}
            </a>
          </p>
        )}
        {config.pie && <p className="mt-1">{config.pie}</p>}
        <p className="mt-2 opacity-70">Hecho con demandu.tech</p>
      </footer>

      {/* ── Barra del pedido, siempre a la vista cuando hay algo ── */}
      {unidades > 0 && !verCarrito && !abierto && (
        <div className="fixed inset-x-0 bottom-0 z-30 p-3">
          <button
            type="button"
            onClick={() => setVerCarrito(true)}
            className="mx-auto flex w-full max-w-3xl items-center justify-between rounded-2xl px-4 py-3 font-bold text-white shadow-lg"
            style={{ backgroundColor: c.whatsapp }}
          >
            <span>
              {unidades} {unidades === 1 ? "producto" : "productos"}
            </span>
            <span>Ver pedido · {comoDinero(total, config.moneda)}</span>
          </button>
        </div>
      )}

      {abierto && (
        <FichaProducto
          producto={abierto}
          config={config}
          onCerrar={() => setAbierto(null)}
          onAgregar={(l) => {
            agregar(l);
            setAbierto(null);
          }}
        />
      )}

      {verCarrito && (
        <div className="fixed inset-0 z-40 flex flex-col" style={{ backgroundColor: c.fondo }}>
          <header
            className="flex flex-none items-center gap-3 px-4 py-3"
            style={{ backgroundColor: c.principal }}
          >
            <button
              type="button"
              onClick={() => setVerCarrito(false)}
              className="text-white"
              aria-label="Volver"
            >
              <ArrowLeft className="h-5 w-5" />
            </button>
            <p className="font-bold text-white">Tu pedido</p>
          </header>

          <div className="flex-1 overflow-y-auto px-4 py-4">
            <div className="mx-auto max-w-3xl">
              {carrito.length === 0 && (
                <p className="py-10 text-center text-sm opacity-60">Todavía no has agregado nada.</p>
              )}

              {carrito.map((l) => (
                <div key={l.clave} className="mb-3 rounded-2xl p-3" style={{ backgroundColor: "rgba(0,0,0,.04)" }}>
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="text-sm font-semibold">{l.nombre}</p>
                      {l.elegidas.map((e, i) => (
                        <p key={i} className="text-xs opacity-70">
                          {e.grupo}: {e.texto}
                          {e.recargo ? ` (+${comoDinero(e.recargo, config.moneda)})` : ""}
                        </p>
                      ))}
                      {l.nota && <p className="mt-0.5 text-xs italic opacity-70">{l.nota}</p>}
                    </div>
                    <p className="flex-none text-sm font-bold">
                      {comoDinero(totalDeLinea(l), config.moneda)}
                    </p>
                  </div>

                  <div className="mt-2 flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => cambiarCantidad(l.clave, -1)}
                      className="grid h-7 w-7 place-items-center rounded-full"
                      style={{ backgroundColor: "rgba(0,0,0,.08)" }}
                      aria-label="Quitar uno"
                    >
                      <Minus className="h-3.5 w-3.5" />
                    </button>
                    <span className="w-6 text-center text-sm font-bold">{l.cantidad}</span>
                    <button
                      type="button"
                      onClick={() => cambiarCantidad(l.clave, 1)}
                      className="grid h-7 w-7 place-items-center rounded-full text-white"
                      style={{ backgroundColor: c.principal }}
                      aria-label="Agregar uno"
                    >
                      <Plus className="h-3.5 w-3.5" />
                    </button>
                  </div>
                </div>
              ))}

              {carrito.length > 0 && (
                <>
                  <p className="mb-4 mt-5 flex items-baseline justify-between text-lg font-bold">
                    <span>Total</span>
                    <span style={{ color: c.acento }}>{comoDinero(total, config.moneda)}</span>
                  </p>

                  {bajoMinimo && (
                    <p className="mb-4 rounded-xl p-3 text-sm" style={{ backgroundColor: "rgba(245,158,11,.15)" }}>
                      El pedido mínimo es {comoDinero(config.minimo_pedido, config.moneda)}. Te
                      faltan {comoDinero(config.minimo_pedido - total, config.moneda)}.
                    </p>
                  )}

                  {/* EL FORMULARIO DEL NEGOCIO, no uno nuestro: cada tienda
                      pregunta lo suyo (el PH, el apartamento, la forma de pago). */}
                  <div className="grid gap-3">
                    {config.preguntas.map((p) => (
                      <div key={p.id}>
                        <label className="mb-1 block text-xs font-semibold opacity-70">
                          {p.etiqueta}
                          {p.obligatoria && " *"}
                        </label>
                        {p.tipo === "lista" ? (
                          <select
                            value={respuestas[p.id] ?? ""}
                            onChange={(e) => setRespuestas((r) => ({ ...r, [p.id]: e.target.value }))}
                            className="w-full rounded-xl border px-3 py-2 text-sm"
                            style={{ borderColor: "rgba(0,0,0,.15)", backgroundColor: "transparent", color: c.texto }}
                          >
                            <option value="">Elige…</option>
                            {(p.opciones ?? []).map((o) => (
                              <option key={o} value={o}>
                                {o}
                              </option>
                            ))}
                          </select>
                        ) : p.tipo === "parrafo" ? (
                          <textarea
                            rows={2}
                            value={respuestas[p.id] ?? ""}
                            onChange={(e) => setRespuestas((r) => ({ ...r, [p.id]: e.target.value }))}
                            className="w-full rounded-xl border px-3 py-2 text-sm"
                            style={{ borderColor: "rgba(0,0,0,.15)", backgroundColor: "transparent", color: c.texto }}
                          />
                        ) : (
                          <input
                            type={p.tipo === "telefono" ? "tel" : "text"}
                            inputMode={p.tipo === "telefono" ? "tel" : undefined}
                            value={respuestas[p.id] ?? ""}
                            onChange={(e) => setRespuestas((r) => ({ ...r, [p.id]: e.target.value }))}
                            placeholder={p.ayuda ?? ""}
                            className="w-full rounded-xl border px-3 py-2 text-sm"
                            style={{ borderColor: "rgba(0,0,0,.15)", backgroundColor: "transparent", color: c.texto }}
                          />
                        )}
                      </div>
                    ))}
                  </div>

                  {aviso && (
                    <p className="mt-3 text-sm font-semibold" style={{ color: "#dc2626" }}>
                      {aviso}
                    </p>
                  )}
                </>
              )}
            </div>
          </div>

          {carrito.length > 0 && (
            <div className="flex-none p-3" style={{ paddingBottom: "max(12px, env(safe-area-inset-bottom))" }}>
              <button
                type="button"
                onClick={enviar}
                className="mx-auto block w-full max-w-3xl rounded-2xl py-3.5 text-center font-bold text-white shadow-lg"
                style={{ backgroundColor: c.whatsapp }}
              >
                {config.whatsapp.texto_boton}
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

/**
 * La ficha de un producto: aquí se eligen las opciones.
 *
 * NO DEJA AGREGAR SI FALTA ALGO OBLIGATORIO, y dice qué falta. Un pedido sin el
 * tamaño obliga al negocio a llamar al cliente, y esa llamada es donde se
 * pierden los pedidos pequeños: no contestan y no se prepara nada.
 */
function FichaProducto({
  producto,
  config,
  onCerrar,
  onAgregar,
}: {
  producto: ProductoPublico;
  config: ConfigTienda;
  onCerrar: () => void;
  onAgregar: (l: LineaCarrito) => void;
}) {
  const c = config.colores;
  const [elegidas, setElegidas] = useState<{ grupo: string; texto: string; recargo: number }[]>([]);
  const [cantidad, setCantidad] = useState(1);
  const [nota, setNota] = useState("");
  const [aviso, setAviso] = useState("");

  const alternar = (g: GrupoVariedad, texto: string, recargo: number) => {
    setAviso("");
    setElegidas((xs) => {
      const yaEsta = xs.some((e) => e.grupo === g.nombre && e.texto === texto);
      if (g.modo === "una") {
        // Una sola: elegir otra SUSTITUYE, no suma. Sumar dos tamaños haría un
        // pedido imposible de preparar.
        return [...xs.filter((e) => e.grupo !== g.nombre), { grupo: g.nombre, texto, recargo }];
      }
      if (yaEsta) return xs.filter((e) => !(e.grupo === g.nombre && e.texto === texto));
      if (g.modo === "hasta_completar") {
        const cuantas = xs.filter((e) => e.grupo === g.nombre).length;
        if (cuantas >= (g.cantidad ?? 0)) return xs;
      }
      return [...xs, { grupo: g.nombre, texto, recargo }];
    });
  };

  const linea: LineaCarrito = {
    clave: claveDeLinea(producto.id, elegidas, nota),
    producto_id: producto.id,
    nombre: producto.nombre,
    precio: producto.precio,
    cantidad,
    elegidas,
    nota,
  };

  const agregar = () => {
    const falta = faltaElegir(producto.variedades, elegidas);
    if (falta.length) {
      setAviso(`Elige ${falta.join(" y ")}.`);
      return;
    }
    onAgregar(linea);
  };

  return (
    <div className="fixed inset-0 z-40 flex flex-col" style={{ backgroundColor: c.fondo, color: c.texto }}>
      <header className="flex flex-none items-center gap-3 px-4 py-3" style={{ backgroundColor: c.principal }}>
        <button type="button" onClick={onCerrar} className="text-white" aria-label="Volver">
          <ArrowLeft className="h-5 w-5" />
        </button>
        <p className="truncate font-bold text-white">{producto.nombre}</p>
      </header>

      <div className="flex-1 overflow-y-auto">
        <div className="mx-auto max-w-3xl">
          {producto.imagen_url && (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={producto.imagen_url} alt={producto.nombre} className="aspect-square w-full object-cover sm:aspect-[2/1]" />
          )}

          <div className="px-4 py-4">
            <h1 className="text-lg font-bold">{producto.nombre}</h1>
            <p className="mt-1 text-xl font-bold" style={{ color: c.acento }}>
              {comoDinero(producto.precio, config.moneda)}
            </p>
            {producto.descripcion && (
              <p className="mt-2 whitespace-pre-wrap text-sm opacity-80">{producto.descripcion}</p>
            )}

            {producto.variedades.map((g, i) => {
              const cuantas = elegidas.filter((e) => e.grupo === g.nombre).length;
              return (
                <section key={i} className="mt-5">
                  <p className="text-sm font-bold">{g.nombre}</p>
                  <p className="mb-2 text-xs opacity-60">
                    {g.modo === "una"
                      ? "Elige una"
                      : g.modo === "hasta_completar"
                        ? `Elige ${g.cantidad ?? 0} · llevas ${cuantas}`
                        : "Elige las que quieras"}
                  </p>
                  <div className="grid gap-2">
                    {g.opciones.map((o, k) => {
                      const puesta = elegidas.some((e) => e.grupo === g.nombre && e.texto === o.texto);
                      return (
                        <button
                          key={k}
                          type="button"
                          onClick={() => alternar(g, o.texto, o.recargo)}
                          className="flex items-center justify-between rounded-xl border px-3 py-2.5 text-left text-sm transition"
                          style={{
                            borderColor: puesta ? c.principal : "rgba(0,0,0,.14)",
                            backgroundColor: puesta ? "rgba(0,0,0,.05)" : "transparent",
                            fontWeight: puesta ? 700 : 400,
                          }}
                        >
                          <span>{o.texto}</span>
                          {o.recargo ? (
                            <span className="opacity-70">+{comoDinero(o.recargo, config.moneda)}</span>
                          ) : null}
                        </button>
                      );
                    })}
                  </div>
                </section>
              );
            })}

            {config.aclaraciones && (
              <div className="mt-5">
                <label className="mb-1 block text-sm font-bold">Alguna aclaración</label>
                <textarea
                  rows={2}
                  value={nota}
                  onChange={(e) => setNota(e.target.value)}
                  placeholder="Sin cebolla, tocar el timbre…"
                  className="w-full rounded-xl border px-3 py-2 text-sm"
                  style={{ borderColor: "rgba(0,0,0,.15)", backgroundColor: "transparent", color: c.texto }}
                />
              </div>
            )}

            <div className="mt-5 flex items-center gap-3">
              <button
                type="button"
                onClick={() => setCantidad((n) => Math.max(1, n - 1))}
                className="grid h-9 w-9 place-items-center rounded-full"
                style={{ backgroundColor: "rgba(0,0,0,.08)" }}
                aria-label="Quitar uno"
              >
                <Minus className="h-4 w-4" />
              </button>
              <span className="w-8 text-center font-bold">{cantidad}</span>
              <button
                type="button"
                onClick={() => setCantidad((n) => n + 1)}
                className="grid h-9 w-9 place-items-center rounded-full text-white"
                style={{ backgroundColor: c.principal }}
                aria-label="Agregar uno"
              >
                <Plus className="h-4 w-4" />
              </button>
            </div>

            {aviso && (
              <p className="mt-3 text-sm font-semibold" style={{ color: "#dc2626" }}>
                {aviso}
              </p>
            )}
          </div>
        </div>
      </div>

      <div className="flex-none p-3" style={{ paddingBottom: "max(12px, env(safe-area-inset-bottom))" }}>
        <button
          type="button"
          onClick={agregar}
          className="mx-auto flex w-full max-w-3xl items-center justify-between rounded-2xl px-4 py-3.5 font-bold text-white shadow-lg"
          style={{ backgroundColor: c.principal }}
        >
          <span>Agregar</span>
          <span>{comoDinero(precioUnitario(linea) * cantidad, config.moneda)}</span>
        </button>
      </div>
    </div>
  );
}
