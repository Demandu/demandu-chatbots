"use client";

import { useMemo, useRef, useState } from "react";
import { Search, ShoppingBag, Plus, Minus, ArrowLeft, ChevronDown } from "lucide-react";
import { comoDinero, type GrupoVariedad } from "@/lib/tienda/variedades";
import type { ConfigTienda } from "@/lib/tienda/config";
import { proporcionDe } from "@/lib/tienda/imagenes";
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
 * ¿Desde cuánto sale este producto?
 *
 * Cuando hay opciones que cobran de más, el precio de la ficha NO es lo que se
 * va a pagar. La tienda actual lo resuelve con «Desde $16,35» y es lo correcto:
 * enseñar el precio pelado y que en el carrito aparezca otro es la forma más
 * rápida de que alguien se sienta engañado y abandone el pedido.
 */
function tieneRecargos(p: ProductoPublico): boolean {
  return (p.variedades ?? []).some((g) => (g.opciones ?? []).some((o) => o.recargo > 0));
}

/**
 * La tienda que ve el cliente.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * LA ESTRUCTURA ESTÁ COPIADA DE LA TIENDA QUE YA FUNCIONA, no inventada:
 * cabecera con logo y nombre, banner, y debajo LAS CATEGORÍAS CERRADAS, cada
 * una con su foto redonda. Se abre una y sale su listado.
 *
 * POR QUÉ CERRADAS Y NO TODO A LA VEZ: este catálogo tiene noventa y seis
 * productos. Soltarlos de golpe en una parrilla es una pared de fotos donde no
 * se encuentra nada; con cuatro marcas a la vista, el cliente sabe dónde está
 * parado desde el primer segundo. Y esa es además la forma en que sus clientes
 * ya saben usar la tienda: cambiarla sin motivo es hacerles reaprender.
 *
 * SE PINTA CON LOS COLORES DEL NEGOCIO, no con los de Demandu: quien entra
 * viene del enlace en la biografía de Instagram de una veterinaria, y si esto
 * parece un panel de software, duda de si está en el sitio correcto.
 *
 * EL PEDIDO SALE DESDE EL WHATSAPP DEL CLIENTE, así que llega al número del
 * negocio como mensaje entrante de verdad y entra en la Bandeja como
 * conversación. Es lo que ninguna tienda suelta puede hacer.
 * ─────────────────────────────────────────────────────────────────────────────
 */
export function Escaparate({
  config,
  productos,
  slug,
}: {
  config: ConfigTienda;
  productos: ProductoPublico[];
  slug: string;
}) {
  const c = config.colores;
  const [busca, setBusca] = useState("");
  const [buscando, setBuscando] = useState(false);
  const [abiertas, setAbiertas] = useState<Set<string>>(new Set());
  const [abierto, setAbierto] = useState<ProductoPublico | null>(null);
  const [carrito, setCarrito] = useState<LineaCarrito[]>([]);
  const [verCarrito, setVerCarrito] = useState(false);
  const [respuestas, setRespuestas] = useState<Record<string, string>>({});
  const [aviso, setAviso] = useState("");
  const [enviando, setEnviando] = useState(false);
  const [saltando, setSaltando] = useState(false);

  const q = busca.trim().toLowerCase();
  const visibles = useMemo(() => {
    if (!q) return productos;
    return productos.filter(
      (p) =>
        p.nombre.toLowerCase().includes(q) ||
        (p.descripcion ?? "").toLowerCase().includes(q) ||
        (p.categoria ?? "").toLowerCase().includes(q),
    );
  }, [productos, q]);

  // Las categorías salen del catálogo, en el orden en que el negocio cargó los
  // productos: ese orden lo decidió alguien y casi siempre significa algo.
  const grupos = useMemo(() => {
    const mapa = new Map<string, ProductoPublico[]>();
    for (const p of visibles) {
      const k = (p.categoria ?? "").trim();
      if (!mapa.has(k)) mapa.set(k, []);
      mapa.get(k)!.push(p);
    }
    const sueltos = mapa.get("") ?? [];
    mapa.delete("");
    return { conCategoria: [...mapa.entries()], sueltos };
  }, [visibles]);

  const fotoDe = (nombre: string) =>
    config.categorias.find((x) => x.nombre === nombre)?.imagen_url ?? "";

  // BUSCANDO SE ABRE TODO. Si no, los resultados quedan escondidos dentro de
  // acordeones cerrados y la búsqueda parece rota.
  const estaAbierta = (nombre: string) =>
    Boolean(q) || abiertas.has(nombre) || grupos.conCategoria.length === 1;

  const alternar = (nombre: string) =>
    setAbiertas((s) => {
      const n = new Set(s);
      if (n.has(nombre)) n.delete(nombre);
      else n.add(nombre);
      return n;
    });

  const total = totalDelCarrito(carrito);
  const unidades = cuantasUnidades(carrito);
  const bajoMinimo = config.minimo_pedido > 0 && total < config.minimo_pedido;

  const agregar = (linea: LineaCarrito) => {
    setCarrito((xs) => {
      const i = xs.findIndex((x) => x.clave === linea.clave);
      if (i >= 0) return xs.map((x, j) => (j === i ? { ...x, cantidad: x.cantidad + linea.cantidad } : x));
      return [...xs, linea];
    });

    // ─────────────────────────────────────────────────────────────────────────
    // QUE SE NOTE QUE PASÓ ALGO.
    //
    // Agregar al carrito no cambiaba nada visible salvo un número pequeño
    // abajo, y ese número nadie lo mira: el cliente agrega, no ve reacción,
    // duda de si funcionó, y se va. La barra de abajo se pone verde, dice qué
    // hacer con todas sus letras, y salta un momento para que el ojo la
    // encuentre sola.
    //
    // SALTA UN MOMENTO, NO SIEMPRE. Algo que se mueve sin parar deja de verse a
    // los diez segundos y encima marea.
    // ─────────────────────────────────────────────────────────────────────────
    setSaltando(true);
    setTimeout(() => setSaltando(false), 1400);
  };

  const cambiarCantidad = (clave: string, delta: number) =>
    setCarrito((xs) =>
      xs.map((x) => (x.clave === clave ? { ...x, cantidad: x.cantidad + delta } : x)).filter((x) => x.cantidad > 0),
    );

  /**
   * EL PEDIDO SE REGISTRA ANTES DE ABRIR WHATSAPP.
   *
   * Antes se abría el chat y ya. Si el cliente no llegaba a enviar el mensaje
   * —se arrepintió, se le fue el internet, cerró sin querer— ese pedido se
   * perdía entero y el negocio nunca supo que existió. Ahora queda guardado con
   * su número, y se puede ir a buscar.
   *
   * LA VENTANA SE ABRE PASE LO QUE PASE. Si el servidor falla, se manda el
   * texto armado aquí: el cliente que ya decidió comprar no puede quedarse
   * mirando un error nuestro. Se pierde el registro, no la venta.
   */
  const pedir = async (): Promise<{ texto: string } | null> => {
    const falta = faltaContestar(config.preguntas, respuestas);
    if (falta.length) {
      setAviso(`Falta ${falta.join(", ")}.`);
      return null;
    }
    if (bajoMinimo) {
      setAviso(`El pedido mínimo es ${comoDinero(config.minimo_pedido, config.moneda)}.`);
      return null;
    }

    setAviso("");
    setEnviando(true);

    const deRespaldo = textoDelPedido({
      tienda: config.titulo,
      lineas: carrito,
      respuestas,
      preguntas: config.preguntas,
      moneda: config.moneda,
    });

    try {
      const r = await fetch("/api/tienda/pedido", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          slug,
          respuestas,
          lineas: carrito.map((l) => ({
            producto_id: l.producto_id,
            cantidad: l.cantidad,
            elegidas: l.elegidas.map((e) => ({ grupo: e.grupo, texto: e.texto })),
            nota: l.nota,
          })),
        }),
      });
      const j = await r.json();

      if (!r.ok || j?.error) {
        // Un rechazo del servidor SÍ para el envío: significa que el precio o
        // las existencias cambiaron mientras el cliente pedía, y mandar ese
        // pedido sería mandar algo que el negocio no puede cumplir.
        setEnviando(false);
        setAviso(j?.error ?? "No se pudo registrar el pedido.");
        return null;
      }

      setEnviando(false);
      return { texto: j?.texto || deRespaldo };
    } catch {
      // Sin red hacia nuestro servidor, pero el cliente sí tiene WhatsApp: se
      // pierde el registro, no la venta.
      setEnviando(false);
      return { texto: deRespaldo };
    }
  };

  const enviar = async () => {
    const r = await pedir();
    if (!r) return;
    window.open(enlaceDeWhatsapp(config.whatsapp.numero, r.texto), "_blank");
  };

  /**
   * PAGAR CON YAPPY.
   *
   * El texto del pedido se guarda para mandarlo por WhatsApp DESPUÉS de pagar:
   * el negocio necesita el detalle igual, y pedirle al cliente que lo mande él
   * después de haber pagado es donde se pierde la mitad de los mensajes.
   */
  const waConsultas = config.whatsapp.numero
    ? `https://wa.me/${config.whatsapp.numero}?text=${encodeURIComponent("Hola, tengo una consulta")}`
    : "";

  const instagramTienda = config.contacto.instagram
    ? `https://instagram.com/${config.contacto.instagram.replace(/^@/, "")}`
    : "";

  // Las categorías del catálogo entero, no las del filtro de búsqueda: es un
  // dato del negocio y no puede bajar mientras alguien escribe.
  const cuantasCategorias = useMemo(
    () => new Set(productos.map((p) => (p.categoria ?? "").trim()).filter(Boolean)).size,
    [productos],
  );

  return (
    <div style={{ backgroundColor: c.fondo, color: c.texto, minHeight: "100vh", paddingBottom: 86 }}>
      {/* ── Cabecera, con forma de perfil de Instagram ───────────────────────
          NO ES UN CAPRICHO ESTÉTICO: quien entra aquí viene del enlace de una
          biografía de Instagram y acaba de salir de esa misma pantalla. Darle
          la forma que ya conoce —portada, foto redonda encima, nombre, y los
          botones debajo— hace que en el primer segundo sepa que llegó al
          negocio correcto, que es lo único que importa en ese segundo.

          Y RESUELVE EL PROBLEMA DEL LOGO. Antes iba sobre el color del negocio:
          un logo con fondo blanco quedaba como un recorte pegado. Sobre el
          fondo de la tienda y con su aro, se ve como una foto de perfil. */}
      <header>
        {/* ── LA PORTADA NO SE RECORTA NUNCA ────────────────────────────
            Antes la banda imponía 4:1 y la imagen entraba con `object-cover`:
            lo que sobraba se cortaba por arriba y por abajo. Al cliente le
            desaparecía media pieza —el logo de la cabecera, el texto del pie—
            y desde fuera parecía que la tienda estaba rota.

            NO SE ARREGLA CON UNA MEDIDA MEJOR. Da igual qué número se
            recomiende: alguien va a subir otra cosa, y cortarle el banner a un
            negocio es de las cosas que más rápido le hacen perder la confianza
            en la plataforma.

            AHORA MANDA LA IMAGEN. La banda toma la altura que le toque por su
            proporción, y solo si es altísima se limita —con `contain`, que deja
            franjas del color del negocio, nunca recorta—. La proporción
            recomendada (4:1) sigue siendo la que mejor se ve, pero ya es un
            consejo y no una condición. */}
        <div
          className="w-full overflow-hidden"
          style={{
            // Sin portada, la banda guarda su sitio con el color del negocio:
            // una tienda recién creada tiene que verse terminada antes de que
            // nadie suba nada.
            ...(config.portada_url ? {} : { aspectRatio: proporcionDe("portada"), maxHeight: 200 }),
            background: `linear-gradient(120deg, ${c.principal}, ${c.acento})`,
          }}
        >
          {config.portada_url && (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={config.portada_url}
              alt=""
              className="block w-full object-contain"
              style={{ height: "auto", maxHeight: 260 }}
            />
          )}
        </div>

        <div className="mx-auto max-w-4xl px-4">
          {/* ── EL LOGO VA POR DELANTE DE LA PORTADA ──────────────────────
              Y hay que decírselo. La portada es un elemento posicionado y esto
              no lo era, así que el navegador la pintaba encima: el logo salía
              cortado por arriba, como una placa. Se veía roto y no había
              ningún error en ninguna parte. */}
          <div className="relative z-10 -mt-11 flex items-end gap-3 sm:-mt-12">
            <span
              className="grid h-22 w-22 flex-none place-items-center overflow-hidden rounded-full sm:h-24 sm:w-24"
              style={{
                height: 88,
                width: 88,
                backgroundColor: c.fondo,
                // El aro del color del fondo es lo que despega la foto de la
                // portada, igual que en Instagram.
                boxShadow: `0 0 0 4px ${c.fondo}, 0 8px 24px rgba(0,0,0,.18)`,
              }}
            >
              {config.logo_url ? (
                // ENTERO, NO RECORTADO: un logo con el nombre del negocio dentro
                // recortado al círculo pierde justo el nombre.
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={config.logo_url}
                  alt={config.titulo}
                  className="h-[86%] w-[86%] object-contain"
                />
              ) : (
                <span className="text-3xl font-bold" style={{ color: c.principal }}>
                  {(config.titulo || "?").slice(0, 1).toUpperCase()}
                </span>
              )}
            </span>

            {/* Las cifras, como las de un perfil. No son vanidad: dicen de un
                vistazo si esta tienda tiene tres cosas o tiene cien. */}
            <div className="flex flex-1 items-baseline justify-end gap-6 pb-2 pr-1 text-center">
              <span className="leading-tight">
                <b className="block text-base font-bold">{productos.length}</b>
                <span className="text-[11px] opacity-55">
                  {productos.length === 1 ? "producto" : "productos"}
                </span>
              </span>
              {cuantasCategorias > 0 && (
                <span className="leading-tight">
                  <b className="block text-base font-bold">{cuantasCategorias}</b>
                  <span className="text-[11px] opacity-55">
                    {cuantasCategorias === 1 ? "categoría" : "categorías"}
                  </span>
                </span>
              )}
            </div>
          </div>

          <div className="mt-2.5 flex items-start gap-2 pb-4">
            <div className="min-w-0 flex-1">
              <p className="text-lg font-bold leading-tight sm:text-xl">{config.titulo}</p>
              {config.contacto.horario && (
                <p className="mt-0.5 text-sm opacity-70">{config.contacto.horario}</p>
              )}
              {config.contacto.direccion && (
                <p className="text-sm opacity-70">{config.contacto.direccion}</p>
              )}
            </div>

            {/* ── NI BOTÓN DE ESCRIBIR NI GLOBO FLOTANTE ────────────────────
                Los quitamos después de verlo: la gente pulsaba el botón verde
                grande para HACER EL PEDIDO, escribía «hola quiero croquetas» y
                el carrito se quedaba vacío. Un atajo a WhatsApp arriba del
                catálogo compite con el catálogo, y gana él por ser más grande
                y más familiar — así se pierde el pedido y el negocio vuelve a
                tomar nota a mano, que es justo de lo que veníamos huyendo.

                Instagram SÍ se queda, y pequeño: no compite con comprar
                —lleva a otra aplicación— y es de donde viene casi toda la
                gente que llega aquí. */}
            {instagramTienda && (
              <a
                href={instagramTienda}
                target="_blank"
                rel="noopener noreferrer"
                aria-label="Ver el Instagram del negocio"
                className="grid h-10 w-10 flex-none place-items-center rounded-xl text-white shadow-sm transition hover:opacity-90"
                style={{
                  background:
                    "radial-gradient(circle at 30% 107%, #fdf497 0%, #fdf497 5%, #fd5949 45%, #d6249f 60%, #285AEB 90%)",
                }}
              >
                <IconoInstagram className="h-5 w-5" />
              </a>
            )}
          </div>
        </div>
      </header>

      {config.banners.length > 0 && (
        <div className="mx-auto flex max-w-4xl gap-3 overflow-x-auto px-4 pt-4">
          {config.banners.map((b, i) => {
            const img = (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={b.imagen_url}
                alt={b.alt ?? ""}
                className="w-[85vw] max-w-md flex-none rounded-2xl object-cover sm:w-96"
                style={{ aspectRatio: proporcionDe("banner") }}
              />
            );
            return b.enlace ? (
              <a key={i} href={b.enlace} target="_blank" rel="noopener noreferrer" className="flex-none">{img}</a>
            ) : (
              <span key={i} className="flex-none">{img}</span>
            );
          })}
        </div>
      )}

      {buscando && (
        <div className="mx-auto max-w-4xl px-4 pt-4">
          <input
            autoFocus
            value={busca}
            onChange={(e) => setBusca(e.target.value)}
            placeholder="Buscar en la tienda…"
            className="w-full rounded-xl border px-3 py-2.5 text-sm outline-none"
            style={{ borderColor: "rgba(0,0,0,.15)", backgroundColor: "transparent", color: c.texto }}
          />
        </div>
      )}

      {/* ── Categorías ── */}
      <main className="mx-auto max-w-4xl px-4 pt-4">
        {visibles.length === 0 && (
          <p className="py-12 text-center text-sm opacity-60">
            {q ? "No encontramos nada con eso." : "Esta tienda todavía no tiene productos."}
          </p>
        )}

        {grupos.sueltos.length > 0 && (
          <div className="mb-2">
            {grupos.sueltos.map((p) => (
              <FilaProducto key={p.id} p={p} config={config} onAbrir={() => setAbierto(p)} />
            ))}
          </div>
        )}

        {grupos.conCategoria.map(([nombre, items]) => {
          const abiertaEsta = estaAbierta(nombre);
          const foto = fotoDe(nombre);
          return (
            <section key={nombre} style={{ borderBottom: "1px solid rgba(0,0,0,.10)" }}>
              <button
                type="button"
                onClick={() => alternar(nombre)}
                className="flex w-full items-center gap-3 py-3 text-left"
              >
                {foto ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={foto}
                    alt=""
                    className="h-14 w-14 flex-none rounded-full object-cover"
                    style={{ border: "1px solid rgba(0,0,0,.12)" }}
                  />
                ) : (
                  <span
                    className="grid h-14 w-14 flex-none place-items-center rounded-full text-lg font-bold"
                    style={{ border: "1px solid rgba(0,0,0,.12)", color: c.principal }}
                  >
                    {nombre.slice(0, 1).toUpperCase()}
                  </span>
                )}
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-base font-bold">{nombre}</span>
                  <span className="block text-xs opacity-55">
                    {items.length} {items.length === 1 ? "producto" : "productos"}
                  </span>
                </span>
                <ChevronDown
                  className="h-5 w-5 flex-none opacity-60 transition-transform"
                  style={{ transform: abiertaEsta ? "rotate(180deg)" : "none" }}
                />
              </button>

              {abiertaEsta && (
                <div className="pb-3">
                  {items.map((p) => (
                    <FilaProducto key={p.id} p={p} config={config} onAbrir={() => setAbierto(p)} />
                  ))}
                </div>
              )}
            </section>
          );
        })}
      </main>

      {/* ── Pie ── */}
      <footer className="mt-8 px-4 py-8 text-center text-sm" style={{ backgroundColor: c.principal, color: "rgba(255,255,255,.85)" }}>
        <p className="font-bold text-white">{config.titulo}</p>
        {waConsultas && (
          <>
            <p className="mt-1 text-xs">Consultas al</p>
            <a
              href={waConsultas}
              target="_blank"
              rel="noopener noreferrer"
              className="mx-auto mt-2 grid h-9 w-9 place-items-center rounded-lg"
              style={{ backgroundColor: c.whatsapp }}
              aria-label="Escribir por WhatsApp"
            >
              <IconoWhatsapp className="h-5 w-5" />
            </a>
          </>
        )}
        {config.contacto.horario && <p className="mt-3 text-xs">{config.contacto.horario}</p>}
        {config.contacto.direccion && <p className="mt-1 text-xs">{config.contacto.direccion}</p>}
        {config.contacto.instagram && (
          <p className="mt-1 text-xs">
            <a
              href={`https://instagram.com/${config.contacto.instagram.replace(/^@/, "")}`}
              target="_blank"
              rel="noopener noreferrer"
            >
              {config.contacto.instagram}
            </a>
          </p>
        )}
        {config.pie && <p className="mt-1 text-xs">{config.pie}</p>}
        <p className="mt-2 text-xs opacity-70">Powered By demandu.tech</p>
      </footer>

      {/* ── Barra de abajo ───────────────────────────────────────────────
          VACÍA ES DISCRETA, CON ALGO DENTRO GRITA. Mientras no hay nada que
          pedir, buscar es lo único que importa y la barra no debe robar
          atención. En cuanto entra un producto, se convierte en el botón más
          grande de la pantalla y dice exactamente qué va a pasar al pulsarlo:
          nadie tiene que deducir que ese carrito pequeño lleva a algún sitio. */}
      <nav
        className="fixed inset-x-0 bottom-0 z-30 flex items-center gap-2 px-3"
        style={{
          backgroundColor: unidades > 0 ? c.whatsapp : c.principal,
          paddingTop: 10,
          paddingBottom: "max(10px, env(safe-area-inset-bottom))",
          transition: "background-color .25s",
        }}
      >
        <button
          type="button"
          onClick={() => setBuscando((v) => !v)}
          className="grid h-11 w-11 flex-none place-items-center rounded-full text-white/90"
          style={{ backgroundColor: unidades > 0 ? "rgba(0,0,0,.16)" : "transparent" }}
          aria-label="Buscar"
        >
          <Search className="h-5 w-5" />
        </button>

        {unidades === 0 ? (
          <span className="flex-1 text-center text-sm text-white/70">
            Toca un producto para agregarlo
          </span>
        ) : (
          <button
            type="button"
            onClick={() => setVerCarrito(true)}
            className={`flex flex-1 items-center justify-center gap-2 rounded-full py-3 text-white shadow-lg ${
              saltando ? "animate-bounce" : ""
            }`}
            style={{ backgroundColor: "rgba(0,0,0,.22)" }}
          >
            <ShoppingBag className="h-5 w-5 flex-none" />
            <span className="text-[15px] font-bold">
              Ver mi pedido · {comoDinero(total, config.moneda)}
            </span>
            <span className="grid h-6 min-w-6 flex-none place-items-center rounded-full bg-white px-1.5 text-xs font-bold" style={{ color: c.whatsapp }}>
              {unidades}
            </span>
          </button>
        )}
      </nav>

      {/* AQUÍ HABÍA UN GLOBO DE WHATSAPP FLOTANDO, y se quitó a propósito.
          Estaba justo encima del carrito y la gente lo pulsaba para hacer el
          pedido: escribían «hola quiero croquetas» y el carrito se quedaba
          vacío. Competía con el único botón que tiene que ganar en esta
          pantalla. Para consultas está el WhatsApp del pie. */}

      {abierto && (
        <FichaProducto
          producto={abierto}
          config={config}
          unidadesEnCarrito={unidades}
          totalEnCarrito={total}
          onVerPedido={() => {
            setAbierto(null);
            setVerCarrito(true);
          }}
          onCerrar={() => setAbierto(null)}
          onAgregar={(l) => {
            agregar(l);
            setAbierto(null);
          }}
        />
      )}

      {verCarrito && (
        <VistaCarrito
          config={config}
          carrito={carrito}
          total={total}
          bajoMinimo={bajoMinimo}
          respuestas={respuestas}
          setRespuestas={setRespuestas}
          aviso={aviso}
          onCantidad={cambiarCantidad}
          onCerrar={() => setVerCarrito(false)}
          onEnviar={enviar}
          enviando={enviando}
        />
      )}
    </div>
  );
}

/**
 * Un producto dentro de su categoría.
 *
 * ES UNA FILA, NO UNA TARJETA EN PARRILLA: con noventa y seis productos, las
 * filas se recorren con el pulgar y se comparan de un vistazo; una parrilla de
 * fotos obliga a leer en zigzag. La foto va pequeña y a la izquierda, como en
 * la tienda que ya usan sus clientes.
 */
function FilaProducto({
  p,
  config,
  onAbrir,
}: {
  p: ProductoPublico;
  config: ConfigTienda;
  onAbrir: () => void;
}) {
  const agotado = p.stock === 0;
  return (
    <button
      type="button"
      disabled={agotado}
      onClick={onAbrir}
      className="flex w-full items-center gap-3 py-2.5 text-left disabled:opacity-45"
      style={{ borderTop: "1px solid rgba(0,0,0,.06)" }}
    >
      {p.imagen_url ? (
        // eslint-disable-next-line @next/next/no-img-element
        // LA FOTO ENTERA, NO RECORTADA. Un saco de comida es más alto que
        // ancho: recortándolo al cuadrado se corta la marca y el peso, que es
        // justo lo que el cliente busca para distinguir un producto de otro.
        <img
          src={p.imagen_url}
          alt=""
          className="h-16 w-16 flex-none rounded-xl object-contain"
          style={{ backgroundColor: "rgba(0,0,0,.04)" }}
        />
      ) : (
        <span
          className="grid h-16 w-16 flex-none place-items-center rounded-xl text-[10px] opacity-40"
          style={{ backgroundColor: "rgba(0,0,0,.05)" }}
        >
          sin foto
        </span>
      )}

      <span className="min-w-0 flex-1">
        <span className="block text-sm font-semibold leading-snug">{p.nombre}</span>
        {p.descripcion && (
          <span className="mt-0.5 block text-xs leading-snug opacity-60" style={{
            display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical", overflow: "hidden",
          }}>
            {p.descripcion}
          </span>
        )}
        {agotado && <span className="mt-0.5 block text-xs font-semibold opacity-70">Agotado</span>}
      </span>

      <span className="flex-none text-right">
        {/* «Desde» cuando hay opciones que cobran de más: enseñar el precio
            pelado y que en el carrito salga otro es como se pierde la
            confianza de un cliente en un segundo. */}
        {tieneRecargos(p) && <span className="block text-[10px] opacity-60">Desde</span>}
        <span className="block text-sm font-bold" style={{ color: config.colores.acento }}>
          {comoDinero(p.precio, config.moneda)}
        </span>
        {p.precio_anterior ? (
          <span className="block text-[11px] line-through opacity-45">
            {comoDinero(p.precio_anterior, config.moneda)}
          </span>
        ) : null}
      </span>
    </button>
  );
}

function IconoWhatsapp({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="#fff" className={className} aria-hidden="true">
      <path d="M17.47 14.38c-.3-.15-1.75-.86-2.02-.96-.27-.1-.47-.15-.67.15-.2.3-.77.96-.94 1.16-.17.2-.35.22-.64.07-.3-.15-1.25-.46-2.38-1.47-.88-.78-1.47-1.75-1.64-2.05-.17-.3-.02-.46.13-.6.13-.13.3-.35.45-.52.15-.17.2-.3.3-.5.1-.2.05-.37-.02-.52-.08-.15-.67-1.6-.92-2.2-.24-.58-.49-.5-.67-.51h-.57c-.2 0-.52.07-.79.37-.27.3-1.04 1.01-1.04 2.47s1.06 2.86 1.21 3.06c.15.2 2.1 3.2 5.08 4.49.71.3 1.26.49 1.69.63.71.22 1.36.19 1.87.12.57-.09 1.75-.72 2-1.41.25-.7.25-1.29.17-1.41-.07-.13-.27-.2-.57-.35zM12.04 2c-5.5 0-9.96 4.46-9.96 9.96 0 1.76.46 3.42 1.27 4.86L2 22l5.32-1.39a9.9 9.9 0 0 0 4.72 1.2h.01c5.5 0 9.96-4.46 9.96-9.96S17.54 2 12.04 2zm0 18.02h-.01a8.2 8.2 0 0 1-4.18-1.15l-.3-.18-3.16.83.84-3.08-.2-.32a8.18 8.18 0 0 1-1.25-4.36c0-4.54 3.7-8.24 8.25-8.24 2.2 0 4.27.86 5.83 2.42a8.19 8.19 0 0 1 2.41 5.83c0 4.54-3.7 8.25-8.23 8.25z" />
    </svg>
  );
}

/**
 * El logotipo de Instagram, dibujado y no traído de fuera.
 *
 * Una tienda que carga un icono desde otro servidor depende de ese servidor
 * para verse bien, y le cuenta a Meta quién visita la tienda de su cliente.
 * Son treinta bytes de SVG.
 */
function IconoInstagram({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="none" aria-hidden="true">
      <rect x="2.5" y="2.5" width="19" height="19" rx="5.5" stroke="currentColor" strokeWidth="2" />
      <circle cx="12" cy="12" r="4.2" stroke="currentColor" strokeWidth="2" />
      <circle cx="17.4" cy="6.6" r="1.3" fill="currentColor" />
    </svg>
  );
}

/** La ficha: aquí se eligen las opciones. */
function FichaProducto({
  producto,
  config,
  unidadesEnCarrito,
  totalEnCarrito,
  onVerPedido,
  onCerrar,
  onAgregar,
}: {
  producto: ProductoPublico;
  config: ConfigTienda;
  unidadesEnCarrito: number;
  totalEnCarrito: number;
  onVerPedido: () => void;
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
        // Elegir otra SUSTITUYE. Sumar dos tamaños haría un pedido imposible.
        return [...xs.filter((e) => e.grupo !== g.nombre), { grupo: g.nombre, texto, recargo }];
      }
      if (yaEsta) return xs.filter((e) => !(e.grupo === g.nombre && e.texto === texto));
      // El tope solo aplica si de verdad HAY un tope. Sin esta guarda, un grupo
      // con «hasta completar» y cantidad vacía tiene tope cero y bloquea cada
      // clic sin decir nada — el cliente pulsa y no pasa nada.
      const tope = Number(g.cantidad);
      if (
        g.modo === "hasta_completar" &&
        Number.isFinite(tope) &&
        tope > 0 &&
        xs.filter((e) => e.grupo === g.nombre).length >= tope
      ) {
        return xs;
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
    if (falta.length) return setAviso(`Elige ${falta.join(" y ")}.`);
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
        <div className="mx-auto max-w-2xl">
          {producto.imagen_url && (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={producto.imagen_url}
              alt={producto.nombre}
              className="aspect-square w-full object-contain"
              style={{ backgroundColor: "rgba(0,0,0,.04)" }}
            />
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
                          {o.recargo ? <span className="opacity-70">+{comoDinero(o.recargo, config.moneda)}</span> : null}
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

            {aviso && <p className="mt-3 text-sm font-semibold" style={{ color: "#dc2626" }}>{aviso}</p>}
          </div>
        </div>
      </div>

      <div className="flex-none p-3" style={{ paddingBottom: "max(12px, env(safe-area-inset-bottom))" }}>
        <div className="mx-auto grid w-full max-w-2xl gap-2">
          <button
            type="button"
            onClick={agregar}
            className="flex items-center justify-between rounded-2xl px-4 py-3.5 font-bold text-white shadow-lg"
            style={{ backgroundColor: c.principal }}
          >
            <span>Agregar</span>
            <span>{comoDinero(precioUnitario(linea) * cantidad, config.moneda)}</span>
          </button>

          {/* EL PEDIDO NO DESAPARECE AL ENTRAR EN UN PRODUCTO. Si ya hay cosas
              en el carrito y aquí solo se ve «Agregar», el cliente que ya
              terminó tiene que adivinar cómo salir a enviarlo — y adivinar,
              con el pedido hecho, es donde se pierde la venta. */}
          {unidadesEnCarrito > 0 && (
            <button
              type="button"
              onClick={onVerPedido}
              className="flex items-center justify-between rounded-2xl px-4 py-3 font-bold text-white"
              style={{ backgroundColor: c.whatsapp }}
            >
              <span className="text-sm">
                {config.whatsapp.texto_boton} ({unidadesEnCarrito})
              </span>
              <span className="text-sm">{comoDinero(totalEnCarrito, config.moneda)}</span>
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

function VistaCarrito({
  config,
  carrito,
  total,
  bajoMinimo,
  respuestas,
  setRespuestas,
  aviso,
  onCantidad,
  onCerrar,
  onEnviar,
  enviando,
}: {
  config: ConfigTienda;
  carrito: LineaCarrito[];
  total: number;
  bajoMinimo: boolean;
  respuestas: Record<string, string>;
  setRespuestas: (f: (r: Record<string, string>) => Record<string, string>) => void;
  aviso: string;
  onCantidad: (clave: string, delta: number) => void;
  onCerrar: () => void;
  onEnviar: () => void;
  enviando: boolean;
}) {
  const c = config.colores;
  const campo = {
    borderColor: "rgba(0,0,0,.15)",
    backgroundColor: "transparent",
    color: c.texto,
  } as const;

  return (
    <div className="fixed inset-0 z-40 flex flex-col" style={{ backgroundColor: c.fondo, color: c.texto }}>
      <header className="flex flex-none items-center gap-3 px-4 py-3" style={{ backgroundColor: c.principal }}>
        <button type="button" onClick={onCerrar} className="text-white" aria-label="Volver">
          <ArrowLeft className="h-5 w-5" />
        </button>
        <p className="font-bold text-white">Tu pedido</p>
      </header>

      <div className="flex-1 overflow-y-auto px-4 py-4">
        <div className="mx-auto max-w-2xl">
          {carrito.length === 0 && <p className="py-10 text-center text-sm opacity-60">Todavía no has agregado nada.</p>}

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
                <p className="flex-none text-sm font-bold">{comoDinero(totalDeLinea(l), config.moneda)}</p>
              </div>

              <div className="mt-2 flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => onCantidad(l.clave, -1)}
                  className="grid h-7 w-7 place-items-center rounded-full"
                  style={{ backgroundColor: "rgba(0,0,0,.08)" }}
                  aria-label="Quitar uno"
                >
                  <Minus className="h-3.5 w-3.5" />
                </button>
                <span className="w-6 text-center text-sm font-bold">{l.cantidad}</span>
                <button
                  type="button"
                  onClick={() => onCantidad(l.clave, 1)}
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
                  El pedido mínimo es {comoDinero(config.minimo_pedido, config.moneda)}. Te faltan{" "}
                  {comoDinero(config.minimo_pedido - total, config.moneda)}.
                </p>
              )}

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
                        style={campo}
                      >
                        <option value="">Elige…</option>
                        {(p.opciones ?? []).map((o) => (
                          <option key={o} value={o}>{o}</option>
                        ))}
                      </select>
                    ) : p.tipo === "parrafo" ? (
                      <textarea
                        rows={2}
                        value={respuestas[p.id] ?? ""}
                        onChange={(e) => setRespuestas((r) => ({ ...r, [p.id]: e.target.value }))}
                        className="w-full rounded-xl border px-3 py-2 text-sm"
                        style={campo}
                      />
                    ) : (
                      <input
                        type={p.tipo === "telefono" ? "tel" : "text"}
                        inputMode={p.tipo === "telefono" ? "tel" : undefined}
                        value={respuestas[p.id] ?? ""}
                        onChange={(e) => setRespuestas((r) => ({ ...r, [p.id]: e.target.value }))}
                        placeholder={p.ayuda ?? ""}
                        className="w-full rounded-xl border px-3 py-2 text-sm"
                        style={campo}
                      />
                    )}
                  </div>
                ))}
              </div>

              {aviso && <p className="mt-3 text-sm font-semibold" style={{ color: "#dc2626" }}>{aviso}</p>}
            </>
          )}
        </div>
      </div>

      {carrito.length > 0 && (
        <div
          className="mx-auto flex w-full max-w-2xl flex-none flex-col gap-2 p-3"
          style={{ paddingBottom: "max(12px, env(safe-area-inset-bottom))" }}
        >
          <button
            type="button"
            onClick={onEnviar}
            disabled={enviando}
            className="block w-full rounded-2xl py-3.5 text-center font-bold text-white shadow-lg disabled:opacity-70"
            style={{ backgroundColor: c.whatsapp }}
          >
            {enviando ? "Preparando tu pedido…" : config.whatsapp.texto_boton}
          </button>
        </div>
      )}
    </div>
  );
}
