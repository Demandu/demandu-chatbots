"use client";

import { useMemo, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  Plus, Trash2, Image as ImagenIcono, Video, FileText, MapPin, Type, Ban,
  ExternalLink, Phone, Copy, Reply, Upload, TriangleAlert, Info, Loader2, Braces,
} from "lucide-react";
import {
  BORRADOR_VACIO, CATEGORIAS, IDIOMAS, TOPE,
  aNombreValido, cuantasVariables, hayGraves, renumerar, revisar,
  type Borrador, type Categoria, type FormatoEncabezado, type TipoBoton,
} from "@/lib/whatsapp/plantillas";
import { VistaTelefono } from "./VistaTelefono";
import { crearPlantilla, subirEjemploEncabezado } from "@/app/(dashboard)/bots/[id]/templates/acciones";

/**
 * Construir una plantilla de WhatsApp sin saber que existe Meta.
 *
 * LA IDEA: el cliente no tiene por qué aprender qué es un «component», un
 * «handle» ni por qué su mensaje no puede empezar con {{1}}. Escribe su
 * mensaje, ve cómo queda en el teléfono, y la pantalla le avisa de todo lo que
 * Meta rechazaría ANTES de enviarlo — porque un rechazo cuesta 24 horas.
 *
 * Las variables se llaman «datos que cambian» en la pantalla. {{1}} es jerga.
 */

const ENCABEZADOS: { valor: FormatoEncabezado; nombre: string; icono: React.ReactNode }[] = [
  { valor: "NINGUNO", nombre: "Sin encabezado", icono: <Ban className="h-4 w-4" /> },
  { valor: "TEXT", nombre: "Texto", icono: <Type className="h-4 w-4" /> },
  { valor: "IMAGE", nombre: "Imagen", icono: <ImagenIcono className="h-4 w-4" /> },
  { valor: "VIDEO", nombre: "Video", icono: <Video className="h-4 w-4" /> },
  { valor: "DOCUMENT", nombre: "Documento", icono: <FileText className="h-4 w-4" /> },
  { valor: "LOCATION", nombre: "Ubicación", icono: <MapPin className="h-4 w-4" /> },
];

const TIPOS_BOTON: { valor: TipoBoton; nombre: string; explica: string; icono: React.ReactNode }[] = [
  { valor: "QUICK_REPLY", nombre: "Respuesta rápida", explica: "El cliente toca y te contesta. Sirve para «Sí, confirmo» o «Ya no quiero promociones».", icono: <Reply className="h-4 w-4" /> },
  { valor: "URL", nombre: "Abrir un enlace", explica: "Lleva a tu tienda, a un formulario o a rastrear un pedido.", icono: <ExternalLink className="h-4 w-4" /> },
  { valor: "PHONE_NUMBER", nombre: "Llamar", explica: "Marca tu número. Solo se admite uno por plantilla.", icono: <Phone className="h-4 w-4" /> },
  { valor: "COPY_CODE", nombre: "Copiar un código", explica: "Copia un cupón al portapapeles. El texto del botón lo pone WhatsApp.", icono: <Copy className="h-4 w-4" /> },
];

export function ConstructorPlantilla({ botId, conectado }: { botId: string; conectado: boolean }) {
  const router = useRouter();
  const [b, setB] = useState<Borrador>(BORRADOR_VACIO);
  const [nombreTocado, setNombreTocado] = useState(false);
  const [subiendo, setSubiendo] = useState(false);
  const [errorArchivo, setErrorArchivo] = useState<string | null>(null);
  const [errorEnvio, setErrorEnvio] = useState<string | null>(null);
  const [enviado, setEnviado] = useState<{ estado: string; categoria: string } | null>(null);
  const [enviando, empezar] = useTransition();
  const cuerpoRef = useRef<HTMLTextAreaElement>(null);
  const archivoRef = useRef<HTMLInputElement>(null);

  const set = (parche: Partial<Borrador>) => setB((v) => ({ ...v, ...parche }));

  const avisos = useMemo(() => revisar(b), [b]);
  const bloqueado = hayGraves(avisos) || !conectado;
  const de = (campo: string) => avisos.filter((a) => a.campo === campo);

  const nVars = cuantasVariables(b.cuerpo);
  const esCodigo = b.categoria === "AUTHENTICATION";

  /* ── Variables ──────────────────────────────────────────────────────────── */

  /** Mete un {{n}} donde está el cursor y renumera todo. */
  const insertarVariable = () => {
    const ta = cuerpoRef.current;
    const pos = ta ? ta.selectionStart : b.cuerpo.length;
    const texto = renumerar(b.cuerpo.slice(0, pos) + "{{0}}" + b.cuerpo.slice(pos));
    set({ cuerpo: texto });
    requestAnimationFrame(() => {
      ta?.focus();
      const nuevo = pos + 5;
      ta?.setSelectionRange(nuevo, nuevo);
    });
  };

  const cambiarCuerpo = (texto: string) => {
    const limpio = renumerar(texto);
    const n = cuantasVariables(limpio);
    set({ cuerpo: limpio, ejemplos: b.ejemplos.slice(0, n) });
  };

  const ponerEjemplo = (i: number, v: string) => {
    const ej = [...b.ejemplos];
    ej[i] = v;
    set({ ejemplos: ej });
  };

  /* ── Botones ────────────────────────────────────────────────────────────── */

  const añadirBoton = (tipo: TipoBoton) => {
    const predet: Record<TipoBoton, string> = {
      QUICK_REPLY: "Sí, quiero",
      URL: "Ver más",
      PHONE_NUMBER: "Llamar",
      COPY_CODE: "",
    };
    set({ botones: [...b.botones, { tipo, texto: predet[tipo] }] });
  };
  const cambiarBoton = (i: number, parche: Partial<Borrador["botones"][number]>) => {
    const bs = [...b.botones];
    bs[i] = { ...bs[i], ...parche };
    set({ botones: bs });
  };
  const quitarBoton = (i: number) => set({ botones: b.botones.filter((_, j) => j !== i) });

  /* ── Archivo de muestra ─────────────────────────────────────────────────── */

  const subirArchivo = async (archivo: File) => {
    setErrorArchivo(null);
    setSubiendo(true);
    const datos = new FormData();
    datos.set("archivo", archivo);
    const r = await subirEjemploEncabezado(botId, datos);
    setSubiendo(false);
    if (r.ok && r.handle) set({ encabezadoHandle: r.handle, encabezadoNombreArchivo: r.nombre ?? archivo.name });
    else setErrorArchivo(r.error ?? "No se pudo subir.");
  };

  /* ── Enviar ─────────────────────────────────────────────────────────────── */

  const enviar = () =>
    empezar(async () => {
      setErrorEnvio(null);
      const r = await crearPlantilla(botId, b);
      if (r.ok) {
        setEnviado({ estado: r.estado ?? "PENDING", categoria: r.categoria ?? b.categoria });
        router.refresh();
      } else setErrorEnvio(r.error ?? "No se pudo enviar.");
    });

  if (enviado) {
    return <Enviada b={b} resultado={enviado} botId={botId} onOtra={() => { setEnviado(null); setB(BORRADOR_VACIO); setNombreTocado(false); }} />;
  }

  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_320px]">
      {/* ── Columna del formulario ── */}
      <div className="space-y-4">
        {!conectado && (
          <Nota tono="aviso">
            Este chatbot todavía no tiene WhatsApp conectado, así que no puedes enviar la plantilla
            a revisión. Puedes ir armándola: no se pierde.
          </Nota>
        )}

        {/* Categoría */}
        <Bloque titulo="¿De qué tipo es?" sub="Meta cobra distinto según el tipo, y revisa cada uno con distinto criterio.">
          <div className="grid gap-2 sm:grid-cols-3">
            {CATEGORIAS.map((c) => (
              <button
                key={c.valor}
                type="button"
                onClick={() => set({ categoria: c.valor as Categoria })}
                className={`rounded-xl border p-3 text-left transition ${
                  b.categoria === c.valor ? "border-pink bg-pink/5" : "border-linea hover:bg-suave-2"
                }`}
              >
                <p className="text-sm font-semibold text-ink">{c.titulo}</p>
                <p className="mt-1 text-[11px] leading-snug text-ink-3">{c.explica}</p>
              </button>
            ))}
          </div>
          <p className="mt-2 flex items-start gap-1.5 text-[11px] leading-snug text-ink-3">
            <Info className="mt-0.5 h-3 w-3 flex-none" />
            Si Meta cree que tu mensaje es de otro tipo, lo cambia por su cuenta en vez de rechazarlo.
            Te avisamos con qué tipo quedó.
          </p>
        </Bloque>

        {/* Nombre e idioma */}
        <Bloque titulo="Nombre e idioma" sub="El nombre es interno: tus clientes no lo ven. Sirve para encontrarla después.">
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <Etiqueta>Nombre</Etiqueta>
              <input
                value={b.nombre}
                onChange={(e) => { setNombreTocado(true); set({ nombre: aNombreValido(e.target.value) }); }}
                placeholder="pedido_en_camino"
                className="input-l"
              />
              {nombreTocado && (
                <p className="mt-1 text-[11px] text-ink-3">Solo minúsculas, números y guiones bajos: lo ajustamos solo.</p>
              )}
              <Errores avisos={de("nombre")} />
            </div>
            <div>
              <Etiqueta>Idioma</Etiqueta>
              <select value={b.idioma} onChange={(e) => set({ idioma: e.target.value })} className="input-l">
                {IDIOMAS.map((i) => (
                  <option key={i.codigo} value={i.codigo}>{i.nombre}</option>
                ))}
              </select>
              <p className="mt-1 text-[11px] text-ink-3">
                Para Meta «Español» y «Español (México)» son plantillas distintas. Elige una y úsala siempre.
              </p>
            </div>
          </div>
        </Bloque>

        {esCodigo ? (
          <Bloque titulo="Ajustes del código" sub="El texto lo escribe Meta y no se puede cambiar. Tú decides los detalles.">
            <label className="flex cursor-pointer items-start gap-2.5 rounded-xl border border-linea p-3">
              <input
                type="checkbox"
                checked={b.autRecomendacion}
                onChange={(e) => set({ autRecomendacion: e.target.checked })}
                className="mt-0.5 h-4 w-4 accent-pink"
              />
              <span>
                <span className="text-sm font-medium text-ink">Añadir la advertencia de seguridad</span>
                <span className="block text-[11px] text-ink-3">«Por tu seguridad, no compartas este código.»</span>
              </span>
            </label>

            <div className="mt-3">
              <Etiqueta>¿Cuándo vence el código?</Etiqueta>
              <div className="flex items-center gap-2">
                <input
                  type="number"
                  min={TOPE.caducidadMin}
                  max={TOPE.caducidadMax}
                  value={b.autCaducidad ?? ""}
                  onChange={(e) => set({ autCaducidad: e.target.value === "" ? null : Number(e.target.value) })}
                  className="input-l w-28"
                />
                <span className="text-sm text-ink-2">minutos</span>
                <button
                  type="button"
                  onClick={() => set({ autCaducidad: b.autCaducidad === null ? 10 : null })}
                  className="text-xs font-semibold text-pink hover:underline"
                >
                  {b.autCaducidad === null ? "poner un vencimiento" : "no mostrar vencimiento"}
                </button>
              </div>
              <Errores avisos={de("caducidad")} />
            </div>

            <div className="mt-3">
              <Etiqueta>El botón</Etiqueta>
              <div className="grid gap-2 sm:grid-cols-2">
                <button
                  type="button"
                  onClick={() => set({ autTipoCodigo: "copy_code" })}
                  className={`rounded-xl border p-3 text-left transition ${b.autTipoCodigo === "copy_code" ? "border-pink bg-pink/5" : "border-linea hover:bg-suave-2"}`}
                >
                  <p className="text-sm font-semibold text-ink">Copiar el código</p>
                  <p className="mt-0.5 text-[11px] leading-snug text-ink-3">Funciona en todos los teléfonos. Es la opción segura.</p>
                </button>
                <button
                  type="button"
                  onClick={() => set({ autTipoCodigo: "one_tap" })}
                  className={`rounded-xl border p-3 text-left transition ${b.autTipoCodigo === "one_tap" ? "border-pink bg-pink/5" : "border-linea hover:bg-suave-2"}`}
                >
                  <p className="text-sm font-semibold text-ink">Rellenarlo solo en tu app</p>
                  <p className="mt-0.5 text-[11px] leading-snug text-ink-3">Solo en Android, y necesitas tu app publicada. En lo demás se copia y ya.</p>
                </button>
              </div>
              <div className="mt-2">
                <Etiqueta>Texto del botón</Etiqueta>
                <input
                  value={b.autTextoBoton}
                  onChange={(e) => set({ autTextoBoton: e.target.value.slice(0, TOPE.botonTexto) })}
                  className="input-l"
                />
              </div>
              {b.autTipoCodigo === "one_tap" && <AppsAndroid b={b} set={set} errores={de("apps")} />}
            </div>
          </Bloque>
        ) : (
          <>
            {/* Encabezado */}
            <Bloque titulo="Encabezado" sub="Opcional. Lo primero que ve el cliente: un título, una foto, un PDF.">
              <div className="flex flex-wrap gap-1.5">
                {ENCABEZADOS.map((e) => (
                  <button
                    key={e.valor}
                    type="button"
                    onClick={() => set({ encabezado: e.valor, encabezadoHandle: "", encabezadoNombreArchivo: "" })}
                    className={`inline-flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs font-medium transition ${
                      b.encabezado === e.valor ? "border-pink bg-pink/5 text-ink" : "border-linea text-ink-2 hover:bg-suave-2"
                    }`}
                  >
                    {e.icono} {e.nombre}
                  </button>
                ))}
              </div>

              {b.encabezado === "TEXT" && (
                <div className="mt-3">
                  <input
                    value={b.encabezadoTexto}
                    onChange={(e) => set({ encabezadoTexto: renumerar(e.target.value) })}
                    placeholder="Tu pedido va en camino"
                    maxLength={TOPE.encabezadoTexto}
                    className="input-l"
                  />
                  <Contador n={b.encabezadoTexto.length} tope={TOPE.encabezadoTexto} />
                  {cuantasVariables(b.encabezadoTexto) === 1 && (
                    <div className="mt-2">
                      <Etiqueta>Ejemplo de lo que irá ahí</Etiqueta>
                      <input
                        value={b.encabezadoEjemplo}
                        onChange={(e) => set({ encabezadoEjemplo: e.target.value })}
                        placeholder="Ana"
                        className="input-l"
                      />
                    </div>
                  )}
                  <Errores avisos={de("encabezado")} />
                </div>
              )}

              {(b.encabezado === "IMAGE" || b.encabezado === "VIDEO" || b.encabezado === "DOCUMENT") && (
                <div className="mt-3">
                  <p className="mb-2 text-xs leading-snug text-ink-2">
                    Sube un archivo de <b className="text-ink">muestra</b>. Es el que verán los revisores de Meta.
                    Al enviar la plantilla de verdad podrás usar otro archivo distinto.
                  </p>
                  <input
                    ref={archivoRef}
                    type="file"
                    hidden
                    accept={b.encabezado === "IMAGE" ? "image/jpeg,image/png" : b.encabezado === "VIDEO" ? "video/mp4" : "application/pdf"}
                    onChange={(e) => { const f = e.target.files?.[0]; if (f) subirArchivo(f); e.target.value = ""; }}
                  />
                  <button type="button" onClick={() => archivoRef.current?.click()} disabled={subiendo} className="btn-soft">
                    {subiendo ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
                    {subiendo ? "Subiendo…" : b.encabezadoHandle ? "Cambiar el archivo" : "Subir archivo de muestra"}
                  </button>
                  {b.encabezadoHandle && (
                    <p className="mt-2 text-xs text-exito">✅ {b.encabezadoNombreArchivo}</p>
                  )}
                  <p className="mt-1.5 text-[11px] text-ink-3">
                    {b.encabezado === "IMAGE" ? "JPG o PNG, hasta 5 MB." : b.encabezado === "VIDEO" ? "MP4, hasta 16 MB." : "PDF, hasta 100 MB."}
                  </p>
                  {errorArchivo && <p className="mt-1 text-xs text-danger">{errorArchivo}</p>}
                  <Errores avisos={de("encabezado")} />
                </div>
              )}

              {b.encabezado === "LOCATION" && (
                <p className="mt-3 text-xs leading-snug text-ink-2">
                  La dirección exacta se elige al enviar el mensaje, no ahora. Aquí solo dejas
                  reservado el hueco del mapa.
                </p>
              )}
            </Bloque>

            {/* Cuerpo */}
            <Bloque titulo="El mensaje" sub="Lo único obligatorio. Puedes usar *negrita*, _cursiva_ y ~tachado~.">
              <textarea
                ref={cuerpoRef}
                value={b.cuerpo}
                onChange={(e) => cambiarCuerpo(e.target.value)}
                rows={5}
                maxLength={TOPE.cuerpo}
                placeholder="Hola {{1}}, tu pedido {{2}} ya salió y llega hoy. ¡Gracias por comprarnos!"
                className="input-l resize-y font-normal"
              />
              <div className="mt-1.5 flex flex-wrap items-center justify-between gap-2">
                <button type="button" onClick={insertarVariable} className="inline-flex items-center gap-1.5 rounded-lg border border-linea px-2.5 py-1 text-xs font-semibold text-ink-2 transition hover:bg-suave-2">
                  <Braces className="h-3.5 w-3.5" /> Insertar un dato que cambia
                </button>
                <Contador n={b.cuerpo.length} tope={TOPE.cuerpo} />
              </div>
              <p className="mt-1.5 text-[11px] leading-snug text-ink-3">
                Un «dato que cambia» es un hueco que se rellena con la información de cada cliente
                —su nombre, su número de pedido— cuando el mensaje sale.
              </p>

              {nVars > 0 && (
                <div className="mt-3 rounded-xl border border-linea bg-suave p-3">
                  <p className="mb-2 text-xs font-semibold text-ink">Un ejemplo por cada hueco</p>
                  <p className="mb-2 text-[11px] leading-snug text-ink-3">
                    Meta los pide para entender de qué va el mensaje. Pon algo realista: son lo que
                    van a leer sus revisores.
                  </p>
                  <div className="space-y-2">
                    {Array.from({ length: nVars }, (_, i) => (
                      <div key={i} className="flex items-center gap-2">
                        <span className="w-8 flex-none rounded-md bg-tarjeta px-1.5 py-1 text-center text-[11px] font-bold text-ink-2">{i + 1}</span>
                        <input
                          value={b.ejemplos[i] ?? ""}
                          onChange={(e) => ponerEjemplo(i, e.target.value)}
                          placeholder={i === 0 ? "Ana" : "1234"}
                          className="input-l"
                        />
                      </div>
                    ))}
                  </div>
                </div>
              )}
              <Errores avisos={[...de("cuerpo"), ...de("ejemplos")]} />
            </Bloque>

            {/* Pie */}
            <Bloque titulo="Pie" sub="Opcional. Una línea pequeña debajo, en gris. No admite datos que cambian.">
              <input
                value={b.pie}
                onChange={(e) => set({ pie: e.target.value })}
                maxLength={TOPE.pie}
                placeholder="Responde BAJA para no recibir más promociones"
                className="input-l"
              />
              <Contador n={b.pie.length} tope={TOPE.pie} />
              <Errores avisos={de("pie")} />
            </Bloque>

            {/* Botones */}
            <Bloque titulo="Botones" sub={`Opcional, hasta ${TOPE.botones}. Suben mucho la respuesta.`}>
              {b.botones.length > 0 && (
                <div className="mb-3 space-y-2">
                  {b.botones.map((bt, i) => (
                    <FilaBoton key={i} b={bt} i={i} onCambio={cambiarBoton} onQuitar={quitarBoton} />
                  ))}
                </div>
              )}
              <div className="flex flex-wrap gap-1.5">
                {TIPOS_BOTON.map((t) => (
                  <button
                    key={t.valor}
                    type="button"
                    onClick={() => añadirBoton(t.valor)}
                    disabled={b.botones.length >= TOPE.botones}
                    title={t.explica}
                    className="inline-flex items-center gap-1.5 rounded-lg border border-linea px-3 py-1.5 text-xs font-medium text-ink-2 transition hover:bg-suave-2 disabled:opacity-40"
                  >
                    <Plus className="h-3 w-3" /> {t.nombre}
                  </button>
                ))}
              </div>
              <Errores avisos={de("botones")} />
            </Bloque>
          </>
        )}

        {/* Enviar */}
        <div className="rounded-2xl border border-linea bg-tarjeta p-5">
          {avisos.filter((a) => a.grave).length > 0 && (
            <div className="mb-3 rounded-xl border border-danger/40 bg-danger/10 p-3">
              <p className="mb-1 text-xs font-semibold text-danger">Falta esto antes de enviar:</p>
              <ul className="space-y-0.5">
                {avisos.filter((a) => a.grave).map((a, i) => (
                  <li key={i} className="text-xs text-danger">· {a.texto}</li>
                ))}
              </ul>
            </div>
          )}
          {errorEnvio && (
            <div className="mb-3 rounded-xl border border-danger/40 bg-danger/10 px-3 py-2 text-sm text-danger">{errorEnvio}</div>
          )}
          <button onClick={enviar} disabled={bloqueado || enviando} className="btn-primary w-full sm:w-auto">
            {enviando ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
            {enviando ? "Enviando a Meta…" : "Enviar a revisión"}
          </button>
          <p className="mt-2 text-[11px] leading-snug text-ink-3">
            Meta la revisa y contesta normalmente en minutos, a veces hasta en 24 horas.
            Mientras tanto la verás como «En revisión». Demandu no te cobra nada por esto.
          </p>
        </div>
      </div>

      {/* ── Columna del teléfono ── */}
      <div>
        <VistaTelefono b={b} />
        {avisos.filter((a) => !a.grave).length > 0 && (
          <div className="mx-auto mt-3 max-w-[300px] space-y-1.5">
            {avisos.filter((a) => !a.grave).map((a, i) => (
              <p key={i} className="flex items-start gap-1.5 rounded-xl border border-warning/40 bg-warning/10 px-2.5 py-2 text-[11px] leading-snug text-ink">
                <TriangleAlert className="mt-0.5 h-3 w-3 flex-none text-warning" />
                {a.texto}
              </p>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

/* ─── Piezas ──────────────────────────────────────────────────────────────── */

function Bloque({ titulo, sub, children }: { titulo: string; sub?: string; children: React.ReactNode }) {
  return (
    <section className="rounded-2xl border border-linea bg-tarjeta p-5">
      <h3 className="font-display text-sm font-semibold text-ink">{titulo}</h3>
      {sub && <p className="mb-3 mt-0.5 text-xs leading-snug text-ink-3">{sub}</p>}
      {children}
    </section>
  );
}

const Etiqueta = ({ children }: { children: React.ReactNode }) => (
  <label className="mb-1 block text-xs font-semibold text-ink-2">{children}</label>
);

function Contador({ n, tope }: { n: number; tope: number }) {
  const cerca = n > tope * 0.9;
  return <p className={`mt-1 text-right text-[11px] ${cerca ? "text-warning" : "text-ink-3"}`}>{n}/{tope}</p>;
}

function Errores({ avisos }: { avisos: { texto: string; grave: boolean }[] }) {
  const graves = avisos.filter((a) => a.grave);
  if (!graves.length) return null;
  return (
    <ul className="mt-1.5 space-y-0.5">
      {graves.map((a, i) => (
        <li key={i} className="text-[11px] text-danger">{a.texto}</li>
      ))}
    </ul>
  );
}

function Nota({ tono, children }: { tono: "aviso" | "info"; children: React.ReactNode }) {
  const clase = tono === "aviso" ? "border-warning/50 bg-warning/10" : "border-linea bg-suave";
  return <div className={`rounded-2xl border p-4 text-sm leading-snug text-ink-2 ${clase}`}>{children}</div>;
}

function FilaBoton({
  b, i, onCambio, onQuitar,
}: {
  b: Borrador["botones"][number];
  i: number;
  onCambio: (i: number, p: Partial<Borrador["botones"][number]>) => void;
  onQuitar: (i: number) => void;
}) {
  const meta = TIPOS_BOTON.find((t) => t.valor === b.tipo)!;
  return (
    <div className="rounded-xl border border-linea p-3">
      <div className="mb-2 flex items-center justify-between gap-2">
        <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-ink">{meta.icono} {meta.nombre}</span>
        <button type="button" onClick={() => onQuitar(i)} className="rounded-lg p-1 text-ink-3 transition hover:bg-danger/10 hover:text-danger" aria-label="Quitar botón">
          <Trash2 className="h-3.5 w-3.5" />
        </button>
      </div>

      {b.tipo === "COPY_CODE" ? (
        <>
          <Etiqueta>Código de ejemplo</Etiqueta>
          <input
            value={b.codigo ?? ""}
            onChange={(e) => onCambio(i, { codigo: e.target.value.slice(0, TOPE.codigoOferta) })}
            placeholder="VERANO25"
            className="input-l"
          />
          <p className="mt-1 text-[11px] text-ink-3">El texto del botón lo escribe WhatsApp y no se puede cambiar.</p>
        </>
      ) : (
        <>
          <Etiqueta>Texto del botón</Etiqueta>
          <input
            value={b.texto}
            onChange={(e) => onCambio(i, { texto: e.target.value.slice(0, TOPE.botonTexto) })}
            className="input-l"
          />
          {b.tipo === "URL" && (
            <div className="mt-2 space-y-2">
              <div>
                <Etiqueta>Enlace</Etiqueta>
                <input
                  value={b.url ?? ""}
                  onChange={(e) => onCambio(i, { url: e.target.value })}
                  placeholder="https://tutienda.com/pedido/{{1}}"
                  className="input-l"
                />
                <p className="mt-1 text-[11px] leading-snug text-ink-3">
                  Puedes poner un dato que cambia, pero solo al final del enlace.
                </p>
              </div>
              {(b.url ?? "").includes("{{") && (
                <div>
                  <Etiqueta>Ejemplo del enlace completo</Etiqueta>
                  <input
                    value={b.ejemploUrl ?? ""}
                    onChange={(e) => onCambio(i, { ejemploUrl: e.target.value })}
                    placeholder="https://tutienda.com/pedido/1234"
                    className="input-l"
                  />
                </div>
              )}
            </div>
          )}
          {b.tipo === "PHONE_NUMBER" && (
            <div className="mt-2">
              <Etiqueta>Número con código de país</Etiqueta>
              <input
                value={b.telefono ?? ""}
                onChange={(e) => onCambio(i, { telefono: e.target.value })}
                placeholder="521555123456"
                className="input-l"
              />
              <p className="mt-1 text-[11px] text-ink-3">Sin el «+» y sin espacios.</p>
            </div>
          )}
        </>
      )}
    </div>
  );
}

function AppsAndroid({
  b, set, errores,
}: {
  b: Borrador;
  set: (p: Partial<Borrador>) => void;
  errores: { texto: string; grave: boolean }[];
}) {
  const cambiar = (i: number, p: Partial<{ paquete: string; firma: string }>) => {
    const apps = [...b.autApps];
    apps[i] = { ...apps[i], ...p };
    set({ autApps: apps });
  };
  return (
    <div className="mt-3 rounded-xl border border-linea bg-suave p-3">
      <p className="text-xs font-semibold text-ink">Tu app de Android</p>
      <p className="mb-2 mt-0.5 text-[11px] leading-snug text-ink-3">
        Estos dos datos te los da quien programó tu app. Sin ellos Meta no aprueba el autocompletado.
      </p>
      <div className="space-y-2">
        {b.autApps.map((a, i) => (
          <div key={i} className="grid gap-2 sm:grid-cols-[1fr_150px_auto]">
            <input value={a.paquete} onChange={(e) => cambiar(i, { paquete: e.target.value })} placeholder="com.tunegocio.app" className="input-l" />
            <input value={a.firma} onChange={(e) => cambiar(i, { firma: e.target.value })} placeholder="firma (11 caracteres)" className="input-l" />
            <button type="button" onClick={() => set({ autApps: b.autApps.filter((_, j) => j !== i) })} className="rounded-lg p-2 text-ink-3 hover:text-danger">
              <Trash2 className="h-3.5 w-3.5" />
            </button>
          </div>
        ))}
      </div>
      {b.autApps.length < 5 && (
        <button type="button" onClick={() => set({ autApps: [...b.autApps, { paquete: "", firma: "" }] })} className="mt-2 inline-flex items-center gap-1.5 text-xs font-semibold text-pink hover:underline">
          <Plus className="h-3 w-3" /> Añadir app
        </button>
      )}
      <Errores avisos={errores} />
    </div>
  );
}

function Enviada({
  b, resultado, botId, onOtra,
}: {
  b: Borrador;
  resultado: { estado: string; categoria: string };
  botId: string;
  onOtra: () => void;
}) {
  const cambiada = resultado.categoria !== b.categoria;
  const nombreCat = CATEGORIAS.find((c) => c.valor === resultado.categoria)?.titulo ?? resultado.categoria;
  return (
    <div className="mx-auto max-w-lg rounded-2xl border border-linea bg-tarjeta p-8 text-center">
      <div className="mx-auto mb-3 grid h-12 w-12 place-items-center rounded-full bg-success/15 text-2xl">✅</div>
      <h3 className="font-display text-lg font-semibold text-ink">«{b.nombre}» ya está con Meta</h3>
      <p className="mt-1.5 text-sm leading-snug text-ink-2">
        Normalmente contestan en minutos; el máximo es 24 horas. En cuanto la aprueben podrás usarla
        en tus envíos y en el bloque de plantilla del constructor.
      </p>
      {cambiada && (
        <p className="mt-3 rounded-xl border border-warning/40 bg-warning/10 px-3 py-2 text-xs leading-snug text-ink">
          Meta la reclasificó como <b>{nombreCat}</b>. Lo hace por su cuenta cuando cree que el contenido
          es de otro tipo; se te cobrará según esa categoría.
        </p>
      )}
      <div className="mt-5 flex flex-wrap justify-center gap-2">
        <a href={`/bots/${botId}/templates`} className="btn-primary">Ver mis plantillas</a>
        <button onClick={onOtra} className="btn-soft">Crear otra</button>
      </div>
    </div>
  );
}
