"use client";

import { Image as ImagenIcono, Video, FileText, MapPin, Phone, ExternalLink, Copy, Reply } from "lucide-react";
import { conEjemplos, type Borrador, type TipoBoton } from "@/lib/whatsapp/plantillas";

/**
 * Cómo se verá la plantilla en el teléfono del cliente.
 *
 * POR QUÉ ESTO NO ES UN ADORNO: quien escribe la plantilla no está viendo un
 * formulario, está escribiendo un mensaje que va a llegarle a cientos de
 * personas y que Meta tarda 24 horas en aprobar. Ver el resultado mientras
 * escribe evita la mayoría de los errores antes de que cuesten un día.
 *
 * Se dibuja con los colores de WhatsApp a propósito, no con los del tema de
 * Demandu: es una foto de otra aplicación, y si cambiara con el tema dejaría
 * de parecerse a lo que el cliente va a ver de verdad.
 */

const BURBUJA = "#ffffff";
const FONDO_CHAT = "#e5ddd5";

/** Aplica el formato de WhatsApp: *negrita*, _cursiva_, ~tachado~, ```fijo```. */
function conFormato(texto: string): string {
  const escapa = (s: string) =>
    s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  return escapa(texto)
    .replace(/```([^`]+)```/g, '<code class="font-mono text-[0.92em]">$1</code>')
    .replace(/(^|\W)\*([^*\n]+)\*(?=\W|$)/g, "$1<b>$2</b>")
    .replace(/(^|\W)_([^_\n]+)_(?=\W|$)/g, "$1<i>$2</i>")
    .replace(/(^|\W)~([^~\n]+)~(?=\W|$)/g, "$1<s>$2</s>")
    .replace(/\n/g, "<br/>");
}

/** El texto fijo que Meta escribe por ti en las plantillas de código. */
function cuerpoDeCodigo(b: Borrador): string {
  const base = "123456 es tu código de verificación.";
  return b.autRecomendacion ? `${base}\n\nPor tu seguridad, no compartas este código.` : base;
}

export function VistaTelefono({ b }: { b: Borrador }) {
  const esCodigo = b.categoria === "AUTHENTICATION";

  const cuerpo = esCodigo ? cuerpoDeCodigo(b) : conEjemplos(b.cuerpo, b.ejemplos);
  const pie = esCodigo
    ? b.autCaducidad !== null
      ? `Este código vence en ${b.autCaducidad} minutos.`
      : ""
    : b.pie;

  const botones: { tipo: TipoBoton; texto: string }[] = esCodigo
    ? [{ tipo: "COPY_CODE", texto: b.autTextoBoton || "Copiar código" }]
    : b.botones.map((x) => ({ tipo: x.tipo, texto: x.texto }));

  // Con más de tres botones WhatsApp esconde el resto tras «Ver todas».
  const visibles = botones.slice(0, botones.length > 3 ? 2 : 3);
  const escondidos = botones.length - visibles.length;

  const encTexto = conEjemplos(b.encabezadoTexto, [b.encabezadoEjemplo]);

  return (
    <div className="sticky top-4">
      <p className="mb-2 text-center text-[11px] font-semibold uppercase tracking-wide text-ink-3">
        Así lo verá tu cliente
      </p>

      {/* ── EL TELÉFONO ──────────────────────────────────────────────────────
          Es un iPhone a propósito y no una caja gris. Quien escribe una
          plantilla está decidiendo qué va a leer una persona en su teléfono, y
          el tamaño real es la mitad de la información: un texto que aquí se ve
          cómodo y en un móvil ocupa cinco líneas se escribe distinto.

          El marco lleva isla dinámica y barra inferior porque son las dos cosas
          que hacen que el ojo lo lea como «un teléfono» y no como «un recuadro».
          Ancho 360: es el de un iPhone moderno en puntos, así que lo que quepa
          en una línea aquí, cabe allí. */}
      <div className="mx-auto w-[360px] rounded-[3rem] border-[12px] border-[#0b0b0d] bg-[#0b0b0d] shadow-[0_25px_60px_-15px_rgba(0,0,0,.55)] ring-1 ring-black/20">
        {/* La isla dinámica, encima de la barra de WhatsApp */}
        <div className="relative rounded-t-[2.2rem] bg-[#075e54]">
          <div className="flex justify-center pt-2">
            <div className="h-[22px] w-[92px] rounded-full bg-[#0b0b0d]" />
          </div>

          {/* Barra de WhatsApp */}
          <div className="flex items-center gap-2.5 px-3.5 pb-3 pt-2 text-white">
            <div className="grid h-9 w-9 place-items-center rounded-full bg-white/25 text-[13px] font-bold">
              {(b.nombre || "N").slice(0, 1).toUpperCase()}
            </div>
            <div className="min-w-0">
              <p className="truncate text-[14px] font-semibold leading-tight">Tu negocio</p>
              <p className="text-[11px] leading-tight text-white/70">en línea</p>
            </div>
          </div>
        </div>

        {/* Conversación */}
        <div
          className="min-h-[440px] px-3.5 py-4"
          style={{ backgroundColor: FONDO_CHAT, backgroundImage: "radial-gradient(rgba(0,0,0,.035) 1px, transparent 1px)", backgroundSize: "14px 14px" }}
        >
          <div className="max-w-[280px] overflow-hidden rounded-lg rounded-tl-none shadow-sm" style={{ backgroundColor: BURBUJA }}>
            {/* Encabezado */}
            {b.encabezado === "TEXT" && encTexto.trim() && (
              <p className="px-2.5 pt-2 text-[13px] font-bold leading-snug text-[#111b21]">{encTexto}</p>
            )}
            {b.encabezado === "IMAGE" && <Marco icono={<ImagenIcono className="h-6 w-6" />} etiqueta={b.encabezadoNombreArchivo || "Tu imagen"} alto="h-[120px]" />}
            {b.encabezado === "VIDEO" && <Marco icono={<Video className="h-6 w-6" />} etiqueta={b.encabezadoNombreArchivo || "Tu video"} alto="h-[120px]" />}
            {b.encabezado === "DOCUMENT" && (
              <div className="m-2 flex items-center gap-2 rounded-md bg-[#f0f2f5] px-2.5 py-2">
                <FileText className="h-5 w-5 flex-none text-[#5e6b73]" />
                <span className="truncate text-[12px] text-[#111b21]">{b.encabezadoNombreArchivo || "Tu documento.pdf"}</span>
              </div>
            )}
            {b.encabezado === "LOCATION" && <Marco icono={<MapPin className="h-6 w-6" />} etiqueta="Tu ubicación" alto="h-[92px]" />}

            {/* Cuerpo */}
            <p
              className="whitespace-pre-wrap px-2.5 pt-2 text-[13px] leading-[1.35] text-[#111b21]"
              dangerouslySetInnerHTML={{ __html: conFormato(cuerpo || "Escribe tu mensaje…") }}
            />

            {/* Pie */}
            {pie.trim() && <p className="px-2.5 pt-1.5 text-[11px] leading-snug text-[#8696a0]">{pie}</p>}

            <p className="px-2.5 pb-1.5 pt-1 text-right text-[10px] text-[#8696a0]">12:04 ✓✓</p>

            {/* Botones dentro de la burbuja */}
            {visibles.length > 0 && (
              <div className="border-t border-[#e9edef]">
                {visibles.map((bt, i) => (
                  <div
                    key={i}
                    className={`flex items-center justify-center gap-1.5 py-2 text-[13px] font-medium text-[#00a5f4] ${i > 0 ? "border-t border-[#e9edef]" : ""}`}
                  >
                    {bt.tipo === "URL" && <ExternalLink className="h-3.5 w-3.5" />}
                    {bt.tipo === "PHONE_NUMBER" && <Phone className="h-3.5 w-3.5" />}
                    {bt.tipo === "COPY_CODE" && <Copy className="h-3.5 w-3.5" />}
                    {bt.tipo === "QUICK_REPLY" && <Reply className="h-3.5 w-3.5" />}
                    <span className="truncate px-2">
                      {bt.tipo === "COPY_CODE" && !esCodigo ? "Copiar código de oferta" : bt.texto || "Botón"}
                    </span>
                  </div>
                ))}
                {escondidos > 0 && (
                  <div className="flex items-center justify-center border-t border-[#e9edef] py-2 text-[13px] font-medium text-[#00a5f4]">
                    Ver todas las opciones
                  </div>
                )}
              </div>
            )}
          </div>

          {/* La barra de inicio. Va DENTRO del área del chat y no debajo del
              marco: en un iPhone se dibuja encima del contenido, y ponerla
              fuera deja una franja blanca que delata que es un dibujo. */}
          <div className="flex justify-center pb-1.5 pt-4">
            <div className="h-[5px] w-[120px] rounded-full bg-black/25" />
          </div>
        </div>
      </div>

      {escondidos > 0 && (
        <p className="mx-auto mt-3 max-w-[320px] text-center text-[11px] leading-snug text-ink-3">
          Con más de 3 botones, WhatsApp esconde el resto detrás de «Ver todas las opciones».
        </p>
      )}
    </div>
  );
}

/** El recuadro gris que hace de imagen, video o mapa mientras no hay archivo. */
function Marco({ icono, etiqueta, alto }: { icono: React.ReactNode; etiqueta: string; alto: string }) {
  return (
    <div className={`m-1.5 grid ${alto} place-items-center gap-1 rounded-md bg-[#e9edef] text-[#8696a0]`}>
      {icono}
      <span className="max-w-[200px] truncate px-2 text-[11px]">{etiqueta}</span>
    </div>
  );
}
