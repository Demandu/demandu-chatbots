"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { ACCIONES } from "@/lib/ai/acciones";

/**
 * El editor del prompt, con «/» para insertar acciones.
 *
 * EL PROBLEMA QUE RESUELVE. La gente no sigue el guión: escribe lo que quiere.
 * Un flujo de bloques va bien cuando el negocio manda el ritmo, pero para
 * cotizar casas la conversación va donde va, y ahí quien tiene que actuar es
 * la IA. El estorbo era que para que la IA pudiera actuar había que hacer DOS
 * cosas en DOS pantallas: escribir el criterio aquí y acordarse de encender la
 * herramienta allá. Nadie se acuerda — se vio un prompt de dos páginas
 * pidiendo etiquetar y transferir con CERO herramientas activadas.
 *
 * Ahora se escribe `/etiquetar` donde toca y la acción queda encendida sola.
 * Lo que se lee en el prompt es lo que el bot puede hacer.
 *
 * NO ES UN AUTOCOMPLETADO DE ADORNO: la lista sale del catálogo real, así que
 * no se puede escribir una acción que no existe sin darse cuenta — que es
 * exactamente lo que pasó con `crear_lead_hubspot`, escrito en un prompt
 * durante días sin que existiera.
 */
export function EditorDePrompt({
  name,
  defaultValue,
  value,
  onValueChange,
  placeholder,
  etiquetas = [],
  className = "input-l min-h-[190px]",
}: {
  /** Modo formulario: el valor viaja en el `submit` con este nombre. */
  name?: string;
  defaultValue?: string;
  /**
   * Modo controlado, para el constructor: el prompt del bloque vive en el
   * flujo, no en un formulario. Se usan los dos modos porque son las DOS
   * pantallas donde se escribe un prompt, y el «/» tiene que estar en ambas —
   * si solo estuviera en una, quien escribe en la otra pensaría que no existe.
   */
  value?: string;
  onValueChange?: (v: string) => void;
  placeholder?: string;
  /** Las etiquetas reales del cliente, para sugerirlas tras «/etiquetar». */
  etiquetas?: string[];
  className?: string;
}) {
  const ref = useRef<HTMLTextAreaElement>(null);
  const espejo = useRef<HTMLDivElement>(null);
  const caja = useRef<HTMLDivElement>(null);

  const [abierto, setAbierto] = useState(false);
  const [filtro, setFiltro] = useState("");
  const [modo, setModo] = useState<"acciones" | "etiquetas">("acciones");
  const [propio, setPropio] = useState(defaultValue ?? "");

  const controlado = value !== undefined;
  const texto = controlado ? value : propio;
  const setTexto = (v: string) => {
    if (!controlado) setPropio(v);
    onValueChange?.(v);
  };

  /**
   * El espejo COPIA las medidas del textarea, no las hereda de una clase.
   *
   * La primera versión confiaba en que las dos capas llevaran el mismo
   * `className` y por tanto la misma tipografía. No basta: el textarea del
   * constructor y el de Lana IA usan clases distintas, el navegador le pone su
   * propia fuente por defecto a los `textarea`, y cualquier diferencia de
   * interlineado desplaza el resaltado. Se veía el texto duplicado y corrido.
   *
   * Copiando las medidas reales ya calculadas, el espejo encaja pase lo que
   * pase con el CSS. Se rehace al cambiar de tamaño porque el textarea se
   * puede arrastrar para agrandarlo.
   */
  useEffect(() => {
    const ta = ref.current;
    const es = espejo.current;
    if (!ta || !es) return;

    const copiar = () => {
      const c = window.getComputedStyle(ta);
      for (const prop of [
        "fontFamily", "fontSize", "fontWeight", "fontStyle", "lineHeight",
        "letterSpacing", "wordSpacing", "textIndent", "textTransform",
        "paddingTop", "paddingRight", "paddingBottom", "paddingLeft",
        "borderTopWidth", "borderRightWidth", "borderBottomWidth", "borderLeftWidth",
        "boxSizing", "whiteSpace", "wordBreak", "overflowWrap", "tabSize",
      ] as const) {
        (es.style as any)[prop] = c[prop as any];
      }
      // EL FONDO SE MUDA AL CONTENEDOR. El espejo va DEBAJO del textarea, así
      // que el textarea tiene que ser transparente para dejarlo ver — y si el
      // relleno se perdiera sin más, el campo quedaría flotando sin caja.
      // Se toma el color real que tenía y se pinta en el contenedor: se ve
      // exactamente igual que antes.
      if (caja.current && c.backgroundColor && c.backgroundColor !== "rgba(0, 0, 0, 0)") {
        caja.current.style.backgroundColor = c.backgroundColor;
        caja.current.style.borderRadius = c.borderRadius;
      }
      ta.style.backgroundColor = "transparent";

      // Estas no se copian: se imponen. El espejo no debe verse a sí mismo.
      es.style.borderColor = "transparent";
      es.style.borderStyle = c.borderStyle;
      es.style.borderRadius = c.borderRadius;
      es.style.color = "transparent";
      es.style.background = "transparent";
      es.scrollTop = ta.scrollTop;
    };

    copiar();
    const obs = new ResizeObserver(copiar);
    obs.observe(ta);
    return () => obs.disconnect();
  }, [texto, className]);

  /**
   * El texto partido en trozos, marcando dónde hay una acción.
   *
   * POR QUÉ UNA CAPA DETRÁS Y NO TEXTO DE COLOR. Un `<textarea>` no puede
   * pintar partes de su propio contenido: o todo de un color, o nada. La
   * técnica es poner DEBAJO un espejo del mismo texto, con la misma tipografía
   * y los mismos márgenes, donde las acciones llevan fondo morado; encima va
   * el textarea con el fondo transparente. Se ve el resaltado a través.
   *
   * Alineación al píxel o no sirve: espejo y textarea comparten la MISMA clase
   * —mismo padding, mismo borde, mismo tamaño de letra— y se sincroniza el
   * scroll. Cualquier diferencia se notaría como un resaltado corrido.
   *
   * Se marca la acción Y la palabra que la sigue, para que «/etiquetar
   * lead-alto» se vea de una pieza: es una sola instrucción, no dos.
   */
  const trozos = useMemo(() => {
    const partes: { t: string; accion?: boolean }[] = [];
    let ultimo = 0;
    for (const m of texto.matchAll(/(^|[\s(])\/([a-z_]+)([ \t]+[\wáéíóúñ-]+)?/gm)) {
      const clave = m[2];
      if (!ACCIONES.some((a) => a.clave === clave)) continue;
      const desde = (m.index ?? 0) + m[1].length;
      const hasta = desde + 1 + clave.length + (m[3]?.length ?? 0);
      if (desde > ultimo) partes.push({ t: texto.slice(ultimo, desde) });
      partes.push({ t: texto.slice(desde, hasta), accion: true });
      ultimo = hasta;
    }
    partes.push({ t: texto.slice(ultimo) });
    return partes;
  }, [texto]);

  const usadas = new Set(
    [...texto.matchAll(/(^|[\s(])\/([a-z_]+)/gm)].map((m) => m[2]),
  );

  const activas = ACCIONES.filter((a) => usadas.has(a.clave));

  const visibles = ACCIONES.filter(
    (a) => !filtro || a.clave.includes(filtro) || a.nombre.toLowerCase().includes(filtro),
  );

  /** Lo que hay entre la última barra y el cursor, si lo hay. */
  const barraAbierta = (valor: string, cursor: number) => {
    const antes = valor.slice(0, cursor);
    const m = antes.match(/(?:^|[\s(])\/([a-z_]*)$/);
    return m ? m[1] : null;
  };

  /**
   * ¿El cursor está justo detrás de un `/etiquetar` recién puesto?
   *
   * ESTO CONTESTA «¿y cómo sabe qué etiqueta poner?». La respuesta corta es
   * que el modelo solo puede elegir entre las etiquetas de ESTE cliente —el
   * motor se las pasa como lista cerrada y rechaza cualquier otra—, pero
   * CUÁNDO poner cada una lo decides tú escribiéndolo aquí. Así que en cuanto
   * escribes `/etiquetar` te ofrecemos tus etiquetas de verdad, para que no
   * tengas que acordarte del nombre exacto ni salir a otra pantalla a mirarlo.
   */
  const esperandoEtiqueta = (valor: string, cursor: number) => {
    const antes = valor.slice(0, cursor);
    return /(?:^|[\s(])\/etiquetar\s+([\wáéíóúñ-]*)$/i.test(antes);
  };

  const alEscribir = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const v = e.target.value;
    const cursor = e.target.selectionStart ?? v.length;
    setTexto(v);

    const pendiente = barraAbierta(v, cursor);
    if (pendiente !== null) {
      setModo("acciones");
      setAbierto(true);
      setFiltro(pendiente);
      return;
    }
    if (etiquetas.length && esperandoEtiqueta(v, cursor)) {
      const m = v.slice(0, cursor).match(/([\wáéíóúñ-]*)$/);
      setModo("etiquetas");
      setAbierto(true);
      setFiltro((m?.[1] ?? "").toLowerCase());
      return;
    }
    setAbierto(false);
  };

  const insertarEtiqueta = (nombre: string) => {
    const el = ref.current;
    if (!el) return;
    const cursor = el.selectionStart ?? texto.length;
    const antes = texto.slice(0, cursor).replace(/[\wáéíóúñ-]*$/, "");
    const nuevo = `${antes}${nombre} ${texto.slice(cursor)}`;
    setTexto(nuevo);
    setAbierto(false);
    const pos = antes.length + nombre.length + 1;
    requestAnimationFrame(() => { el.focus(); el.setSelectionRange(pos, pos); });
  };

  const insertar = (clave: string) => {
    const el = ref.current;
    if (!el) return;
    const cursor = el.selectionStart ?? texto.length;
    const antes = texto.slice(0, cursor);
    // Se sustituye lo que la persona ya llevaba escrito tras la barra, para
    // que escribir "/eti" y elegir no deje "/eti/etiquetar".
    const limpio = antes.replace(/\/[a-z_]*$/, "");
    const nuevo = `${limpio}/${clave} ${texto.slice(cursor)}`;
    setTexto(nuevo);
    setAbierto(false);
    // El cursor va justo detrás de la acción, que es donde se sigue escribiendo
    // el criterio: «/etiquetar como lead-alto si…».
    const pos = limpio.length + clave.length + 2;
    requestAnimationFrame(() => {
      el.focus();
      el.setSelectionRange(pos, pos);
    });
  };

  return (
    <div ref={caja} className="relative">
      {/* El espejo. `aria-hidden` porque para un lector de pantalla el texto
          ya está en el textarea: leerlo dos veces sería peor que no marcarlo. */}
      <div
        ref={espejo}
        aria-hidden
        // NO lleva el `className` del campo: sus medidas se copian del textarea
        // en el efecto de arriba. Heredar la clase era justo lo que fallaba —
        // parecía que las dos capas coincidían y no coincidían.
        //
        // `scrollbar-gutter: stable` sí va aquí y en el textarea: en cuanto el
        // prompt es largo, el textarea saca barra de scroll y su texto cabe en
        // menos ancho. El espejo, sin barra, partiría las líneas en otro sitio.
        style={{ scrollbarGutter: "stable", color: "transparent" }}
        className="pointer-events-none absolute inset-0 overflow-hidden rounded-xl border"
      >
        {trozos.map((p, i) =>
          p.accion ? (
            <span key={i} className="rounded bg-violet/30" style={{ color: "transparent" }}>
              {p.t}
            </span>
          ) : (
            <span key={i}>{p.t}</span>
          ),
        )}
        {/* Una línea de más: sin esto, al terminar el prompt con Enter el
            espejo se queda una línea corto y el resaltado se desplaza. */}
        {"\n"}
      </div>

      <textarea
        ref={ref}
        name={name}
        value={texto}
        onChange={alEscribir}
        onScroll={(e) => { if (espejo.current) espejo.current.scrollTop = e.currentTarget.scrollTop; }}
        onBlur={() => setTimeout(() => setAbierto(false), 150)}
        onKeyDown={(e) => { if (e.key === "Escape") setAbierto(false); }}
        placeholder={placeholder}
        style={{ scrollbarGutter: "stable" }}
        className={`${className} relative`}
      />

      {abierto && modo === "etiquetas" && (
        <div className="absolute left-2 right-2 z-20 mt-1 max-h-64 overflow-y-auto rounded-xl border border-linea bg-tarjeta p-1 shadow-xl">
          <p className="px-2 py-1.5 text-[10px] font-bold uppercase tracking-wider text-ink-3">
            Tus etiquetas
          </p>
          {etiquetas
            .filter((t) => !filtro || t.toLowerCase().includes(filtro))
            .map((t) => (
              <button
                key={t}
                type="button"
                onMouseDown={(e) => { e.preventDefault(); insertarEtiqueta(t); }}
                className="flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left text-xs text-ink transition hover:bg-suave"
              >
                <span className="h-2 w-2 flex-none rounded-full bg-violet" />
                {t}
              </button>
            ))}
        </div>
      )}

      {abierto && modo === "acciones" && visibles.length > 0 && (
        <div className="absolute left-2 right-2 z-20 mt-1 max-h-64 overflow-y-auto rounded-xl border border-linea bg-tarjeta p-1 shadow-xl">
          <p className="px-2 py-1.5 text-[10px] font-bold uppercase tracking-wider text-ink-3">
            Acciones que puede ejecutar
          </p>
          {visibles.map((a) => (
            <button
              key={a.clave}
              type="button"
              // `onMouseDown` y no `onClick`: el clic quita el foco del textarea
              // y el `onBlur` cerraría la lista antes de que llegara el clic.
              onMouseDown={(e) => { e.preventDefault(); insertar(a.clave); }}
              className="flex w-full items-start gap-2.5 rounded-lg px-2 py-1.5 text-left transition hover:bg-suave"
            >
              <code className="mt-0.5 flex-none rounded bg-violet/15 px-1.5 py-0.5 font-mono text-[11px] text-violet">
                /{a.clave}
              </code>
              <span className="min-w-0">
                <span className="block text-xs font-semibold text-ink">
                  {a.nombre}
                  {usadas.has(a.clave) && (
                    <span className="ml-1.5 font-normal text-[10px] text-exito">ya activada</span>
                  )}
                </span>
                <span className="block text-[11px] leading-snug text-ink-3">{a.desc}</span>
              </span>
            </button>
          ))}
        </div>
      )}

      {/* LO QUE ESTE PROMPT ACTIVA, en una franja que se ve.
          Antes esto eran unas etiquetitas discretas al pie y la queja fue
          exacta: «no se nota que se guardó la acción». Escribir `/etiquetar`
          enciende una herramienta que ESCRIBE en las fichas de los leads:
          eso merece una confirmación que se lea, no un adorno. */}
      {activas.length > 0 ? (
        <div className="mt-2 rounded-lg border border-success/40 bg-success/10 px-2.5 py-2">
          <p className="text-[11px] font-semibold text-exito">
            ✓ Este asistente ya puede: {activas.map((a) => a.nombre).join(" · ")}
          </p>
          <p className="mt-0.5 text-[11px] text-ink-3">
            Se activaron solas al escribirlas. No hace falta marcar nada más.
          </p>
        </div>
      ) : (
        <p className="mt-2 text-[11px] text-ink-3">
          Escribe <code className="rounded bg-suave px-1 font-mono text-violet">/</code> para que además de
          conversar pueda etiquetar, agendar o pasar con una persona.
        </p>
      )}

      {usadas.has("etiquetar") && etiquetas.length > 0 && (
        <p className="mt-1.5 text-[11px] leading-relaxed text-ink-3">
          Solo puede usar <b className="text-ink-2">tus</b> etiquetas —{" "}
          {etiquetas.map((t) => (
            <code key={t} className="mr-1 rounded bg-suave px-1 font-mono text-[10px] text-ink-2">{t}</code>
          ))}
          — y si se inventa otra, se rechaza. Escribe tú cuándo va cada una; al teclear{" "}
          <code className="rounded bg-suave px-1 font-mono text-violet">/etiquetar</code> te las sugiere.
        </p>
      )}
      {usadas.has("etiquetar") && etiquetas.length === 0 && (
        <p className="mt-1 text-[11px] text-danger">
          Pediste <code className="font-mono">/etiquetar</code> pero no tienes ninguna etiqueta creada.
          Créalas en Configuración → Etiquetas o la acción no hará nada.
        </p>
      )}
    </div>
  );
}
