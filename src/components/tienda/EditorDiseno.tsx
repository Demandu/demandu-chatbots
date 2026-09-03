"use client";

import { useState } from "react";
import { useFormState, useFormStatus } from "react-dom";
import { AlertTriangle } from "lucide-react";
import type { ConfigTienda } from "@/lib/tienda/config";
import { DOMINIO_TIENDAS } from "@/lib/tienda/direccion";
import { escribirPreguntas } from "@/lib/tienda/escritura";
import type { Estado } from "@/app/(dashboard)/tienda/[id]/actions";

function Guardar() {
  const { pending } = useFormStatus();
  return (
    <button className="btn-primary" disabled={pending}>
      {pending ? "Guardando…" : "Guardar diseño"}
    </button>
  );
}

/** Un color: la muestra y el código, porque a veces se pega un hex de marca. */
function Color({ name, etiqueta, valor }: { name: string; etiqueta: string; valor: string }) {
  const [v, setV] = useState(valor);
  return (
    <div>
      <label className="mb-1.5 block text-xs font-semibold text-ink-2">{etiqueta}</label>
      <div className="flex items-center gap-2">
        <input
          type="color"
          value={v}
          onChange={(e) => setV(e.target.value)}
          className="h-9 w-10 flex-none cursor-pointer rounded-lg border border-linea bg-transparent p-0.5"
          aria-label={etiqueta}
        />
        <input name={name} value={v} onChange={(e) => setV(e.target.value)} className="input-l" />
      </div>
    </div>
  );
}

/**
 * Todo lo que cambia la cara de una tienda.
 *
 * LA VISTA PREVIA DE COLORES ESTÁ ARRIBA Y SE MUEVE SOLA. Elegir cinco colores
 * a ciegas y descubrir el resultado publicando es como salen tiendas con texto
 * gris sobre fondo gris — y quien las publica no lo ve, porque conoce su marca
 * de memoria.
 */
export function EditorDiseno({
  tiendaId,
  slug,
  config,
  categoriasEnUso,
  accion,
}: {
  tiendaId: string;
  slug: string;
  config: ConfigTienda;
  /** Las que de verdad tienen productos, sacadas del catálogo. */
  categoriasEnUso: string[];
  accion: (e: Estado, fd: FormData) => Promise<Estado>;
}) {
  const [estado, enviar] = useFormState(accion, { ok: false, mensaje: "" });
  const [titulo, setTitulo] = useState(config.titulo);
  const [wa, setWa] = useState(config.whatsapp.numero);

  // LAS CATEGORÍAS NO SE ESCRIBEN AQUÍ: salen del catálogo, que es donde el
  // negocio ya las puso. Escribirlas otra vez es garantizar que un día no
  // coincidan y una categoría entera desaparezca del escaparate.
  const [fotos, setFotos] = useState<Record<string, string>>(() =>
    Object.fromEntries(config.categorias.map((c) => [c.nombre, c.imagen_url ?? ""])),
  );

  const faltaWhatsapp = !wa.trim();

  return (
    <form action={enviar} className="grid gap-5 lg:grid-cols-[1fr_320px]">
      <input type="hidden" name="tienda_id" value={tiendaId} />
      <input
        type="hidden"
        name="categorias"
        value={JSON.stringify(
          categoriasEnUso.map((n) => ({ nombre: n, imagen_url: (fotos[n] ?? "").trim() })),
        )}
      />

      <div className="grid gap-5">
        {/* ── Identidad ── */}
        <section className="card p-4">
          <h2 className="mb-3 font-semibold text-ink">La cara del negocio</h2>
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <label className="mb-1.5 block text-xs font-semibold text-ink-2">
                Nombre que se lee arriba
              </label>
              <input
                name="titulo"
                value={titulo}
                onChange={(e) => setTitulo(e.target.value)}
                placeholder="Paws at Home"
                className="input-l"
              />
            </div>
            <div>
              <label className="mb-1.5 block text-xs font-semibold text-ink-2">
                Moneda
              </label>
              <input name="moneda" defaultValue={config.moneda} className="input-l" />
            </div>
            <div>
              <label className="mb-1.5 block text-xs font-semibold text-ink-2">
                Enlace del logo
              </label>
              <input
                name="logo_url"
                defaultValue={config.logo_url ?? ""}
                placeholder="https://…/logo.png"
                className="input-l"
              />
            </div>
            <div>
              <label className="mb-1.5 block text-xs font-semibold text-ink-2">
                Enlace de la portada
              </label>
              <input
                name="portada_url"
                defaultValue={config.portada_url ?? ""}
                placeholder="https://…/portada.jpg"
                className="input-l"
              />
            </div>
          </div>

          <label className="mb-1.5 mt-3 block text-xs font-semibold text-ink-2">
            Banners — uno por línea: enlace de la imagen, y si lleva a algún sitio, «| dirección»
          </label>
          <textarea
            name="banners"
            rows={3}
            defaultValue={config.banners
              .map((b) => (b.enlace ? `${b.imagen_url} | ${b.enlace}` : b.imagen_url))
              .join("\n")}
            placeholder={"https://…/promo.jpg | https://wa.me/507…"}
            className="input-l font-mono text-xs"
          />
        </section>

        {/* ── Categorías ── */}
        <section className="card p-4">
          <h2 className="font-semibold text-ink">Categorías</h2>
          <p className="mb-3 mt-1 text-sm text-ink-2">
            Salen solas de tus productos. Aquí solo les pones foto — es lo primero que ve quien
            entra, porque la tienda abre mostrando las categorías cerradas.
          </p>

          {categoriasEnUso.length === 0 ? (
            <p className="text-sm text-ink-2">
              Todavía no hay categorías. Ponles una a tus productos en la pestaña Productos y
              aparecerán aquí.
            </p>
          ) : (
            <div className="grid gap-2">
              {categoriasEnUso.map((n) => (
                <div key={n} className="flex items-center gap-3">
                  {fotos[n]?.trim() ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={fotos[n]} alt="" className="h-10 w-10 flex-none rounded-full object-cover" />
                  ) : (
                    <span className="grid h-10 w-10 flex-none place-items-center rounded-full border border-dashed border-linea-2 text-[10px] text-ink-3">
                      foto
                    </span>
                  )}
                  <span className="w-40 flex-none truncate text-sm font-semibold text-ink">{n}</span>
                  <input
                    value={fotos[n] ?? ""}
                    onChange={(e) => setFotos((f) => ({ ...f, [n]: e.target.value }))}
                    placeholder="https://…/logo-de-la-marca.png"
                    className="input-l flex-1"
                  />
                </div>
              ))}
            </div>
          )}
        </section>

        {/* ── Colores ── */}
        <section className="card p-4">
          <h2 className="mb-3 font-semibold text-ink">Colores</h2>
          <div className="grid gap-3 sm:grid-cols-3">
            <Color name="color_principal" etiqueta="Principal" valor={config.colores.principal} />
            <Color name="color_acento" etiqueta="Acento (ofertas, carrito)" valor={config.colores.acento} />
            <Color name="color_fondo" etiqueta="Fondo" valor={config.colores.fondo} />
            <Color name="color_texto" etiqueta="Texto" valor={config.colores.texto} />
            <Color name="color_whatsapp" etiqueta="Botón de WhatsApp" valor={config.colores.whatsapp} />
          </div>
        </section>

        {/* ── El pedido ── */}
        <section className="card p-4">
          <h2 className="font-semibold text-ink">A dónde llega el pedido</h2>
          <p className="mb-3 mt-1 text-sm text-ink-2">
            Sin esto la tienda se ve perfecta y no vende: el cliente llena el carrito, pulsa el
            botón y no pasa nada.
          </p>
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <label className="mb-1.5 block text-xs font-semibold text-ink-2">
                WhatsApp con código de país
              </label>
              <input
                name="wa_numero"
                value={wa}
                onChange={(e) => setWa(e.target.value)}
                placeholder="+507 6238-1138"
                className="input-l"
              />
            </div>
            <div>
              <label className="mb-1.5 block text-xs font-semibold text-ink-2">
                Texto del botón
              </label>
              <input
                name="wa_texto"
                defaultValue={config.whatsapp.texto_boton}
                className="input-l"
              />
            </div>
          </div>

          <label className="mb-1.5 mt-4 block text-xs font-semibold text-ink-2">
            Preguntas del formulario — una por línea
          </label>
          <textarea
            name="preguntas"
            rows={6}
            defaultValue={escribirPreguntas(config.preguntas)}
            className="input-l font-mono text-xs"
          />
          <p className="mt-1.5 text-xs text-ink-2">
            Un <b className="text-ink">*</b> al final la hace obligatoria. Para una lista, escribe
            las opciones después de una barra:{" "}
            <code className="text-ink">Forma de Pago* | Yappy, Efectivo, Tarjeta</code>. Para
            respuesta larga, <code className="text-ink">| parrafo</code>.
          </p>

          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            <div>
              <label className="mb-1.5 block text-xs font-semibold text-ink-2">
                Pedido mínimo (vacío o 0 = sin mínimo)
              </label>
              <input
                name="minimo"
                defaultValue={config.minimo_pedido ? (config.minimo_pedido / 100).toFixed(2) : ""}
                placeholder="0.00"
                className="input-l"
              />
            </div>
            <label className="flex cursor-pointer items-center gap-2 self-end pb-2 text-sm text-ink">
              <input
                type="checkbox"
                name="aclaraciones"
                defaultChecked={config.aclaraciones}
                className="h-4 w-4"
                style={{ accentColor: "#6E42FF" }}
              />
              Dejar escribir una nota en cada producto
            </label>
          </div>
        </section>

        {/* ── Contacto ── */}
        <section className="card p-4">
          <h2 className="mb-3 font-semibold text-ink">Contacto y pie</h2>
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <label className="mb-1.5 block text-xs font-semibold text-ink-2">Horario</label>
              <input
                name="horario"
                defaultValue={config.contacto.horario ?? ""}
                placeholder="Lunes a viernes de 9 a 18"
                className="input-l"
              />
            </div>
            <div>
              <label className="mb-1.5 block text-xs font-semibold text-ink-2">Instagram</label>
              <input
                name="instagram"
                defaultValue={config.contacto.instagram ?? ""}
                placeholder="@tunegocio"
                className="input-l"
              />
            </div>
            <div>
              <label className="mb-1.5 block text-xs font-semibold text-ink-2">Facebook</label>
              <input name="facebook" defaultValue={config.contacto.facebook ?? ""} className="input-l" />
            </div>
            <div>
              <label className="mb-1.5 block text-xs font-semibold text-ink-2">Correo</label>
              <input name="correo" defaultValue={config.contacto.correo ?? ""} className="input-l" />
            </div>
            <div className="sm:col-span-2">
              <label className="mb-1.5 block text-xs font-semibold text-ink-2">Dirección</label>
              <input name="direccion" defaultValue={config.contacto.direccion ?? ""} className="input-l" />
            </div>
            <div className="sm:col-span-2">
              <label className="mb-1.5 block text-xs font-semibold text-ink-2">
                Texto del pie
              </label>
              <input name="pie" defaultValue={config.pie ?? ""} className="input-l" />
            </div>
          </div>
        </section>

        <div className="flex flex-wrap items-center gap-3">
          <Guardar />
          {estado.mensaje && (
            <span className={`text-sm ${estado.ok ? "text-emerald-400" : "text-danger"}`}>
              {estado.mensaje}
            </span>
          )}
        </div>
      </div>

      {/* ── Vista previa ── */}
      <aside className="lg:sticky lg:top-4 lg:self-start">
        <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-ink-2">
          Así se va a ver
        </p>
        <VistaPrevia titulo={titulo} config={config} slug={slug} />

        {faltaWhatsapp && (
          <div className="mt-3 flex gap-2 rounded-2xl border border-warning/40 bg-warning/10 p-3 text-xs text-ink-2">
            <AlertTriangle className="h-4 w-4 flex-none text-warning" />
            <span>
              Falta el WhatsApp. Hasta que lo pongas, el botón de pedido no lleva a ninguna parte.
            </span>
          </div>
        )}
      </aside>
    </form>
  );
}

/**
 * La previa NO se actualiza con los colores mientras se arrastran.
 *
 * Se pinta con lo guardado y con el nombre que se está escribiendo. Podría
 * seguir cada color en vivo, pero eso obliga a manejar aquí cinco estados más
 * y a duplicar la validación de color que ya vive en el servidor — y sobre
 * todo enseñaría cosas que todavía no están guardadas como si lo estuvieran.
 */
function VistaPrevia({
  titulo,
  config,
  slug,
}: {
  titulo: string;
  config: ConfigTienda;
  slug: string;
}) {
  const c = config.colores;
  return (
    <div className="overflow-hidden rounded-2xl border border-linea">
      <div className="px-4 py-3" style={{ backgroundColor: c.principal }}>
        <p className="truncate text-sm font-bold" style={{ color: "#fff" }}>
          {titulo || "Tu negocio"}
        </p>
        <p className="truncate text-[11px]" style={{ color: "rgba(255,255,255,.7)" }}>
          {DOMINIO_TIENDAS}/{slug}
        </p>
      </div>
      <div className="p-4" style={{ backgroundColor: c.fondo }}>
        <div className="rounded-xl border p-3" style={{ borderColor: "rgba(0,0,0,.1)" }}>
          <p className="text-sm font-semibold" style={{ color: c.texto }}>
            Producto de ejemplo
          </p>
          <p className="mt-0.5 text-lg font-bold" style={{ color: c.acento }}>
            {config.moneda}12.50
          </p>
          <button
            type="button"
            className="mt-2 w-full rounded-lg py-1.5 text-xs font-semibold"
            style={{ backgroundColor: c.principal, color: "#fff" }}
          >
            Agregar
          </button>
        </div>
        <button
          type="button"
          className="mt-3 w-full rounded-lg py-2 text-xs font-bold"
          style={{ backgroundColor: c.whatsapp, color: "#fff" }}
        >
          {config.whatsapp.texto_boton}
        </button>
      </div>
    </div>
  );
}
