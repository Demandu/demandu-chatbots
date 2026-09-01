"use client";

import { useRef, useState } from "react";
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
  placeholder,
  etiquetas = [],
  className = "input-l min-h-[190px]",
}: {
  name: string;
  defaultValue?: string;
  placeholder?: string;
  /** Las etiquetas reales del cliente, para sugerirlas tras «/etiquetar». */
  etiquetas?: string[];
  className?: string;
}) {
  const ref = useRef<HTMLTextAreaElement>(null);
  const [abierto, setAbierto] = useState(false);
  const [filtro, setFiltro] = useState("");
  const [texto, setTexto] = useState(defaultValue ?? "");

  const usadas = new Set(
    [...texto.matchAll(/(^|[\s(])\/([a-z_]+)/gm)].map((m) => m[2]),
  );

  const visibles = ACCIONES.filter(
    (a) => !filtro || a.clave.includes(filtro) || a.nombre.toLowerCase().includes(filtro),
  );

  /** Lo que hay entre la última barra y el cursor, si lo hay. */
  const barraAbierta = (valor: string, cursor: number) => {
    const antes = valor.slice(0, cursor);
    const m = antes.match(/(?:^|[\s(])\/([a-z_]*)$/);
    return m ? m[1] : null;
  };

  const alEscribir = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const v = e.target.value;
    setTexto(v);
    const pendiente = barraAbierta(v, e.target.selectionStart ?? v.length);
    setAbierto(pendiente !== null);
    setFiltro(pendiente ?? "");
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
    <div className="relative">
      <textarea
        ref={ref}
        name={name}
        value={texto}
        onChange={alEscribir}
        onBlur={() => setTimeout(() => setAbierto(false), 150)}
        onKeyDown={(e) => { if (e.key === "Escape") setAbierto(false); }}
        placeholder={placeholder}
        className={className}
      />

      {abierto && visibles.length > 0 && (
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

      {/* Lo que el bot PUEDE hacer, leído del propio prompt. Es la comprobación
          que faltaba: se ve de un vistazo si lo que pediste está encendido. */}
      <div className="mt-2 flex flex-wrap items-center gap-1.5">
        <span className="text-[11px] text-ink-3">
          Escribe <code className="rounded bg-suave px-1 font-mono text-violet">/</code> para insertar una acción.
        </span>
        {[...usadas].filter((u) => ACCIONES.some((a) => a.clave === u)).map((u) => (
          <span key={u} className="rounded-full bg-success/15 px-2 py-0.5 font-mono text-[10px] font-semibold text-exito">
            /{u}
          </span>
        ))}
      </div>

      {usadas.has("etiquetar") && etiquetas.length > 0 && (
        <p className="mt-1 text-[11px] text-ink-3">
          Tus etiquetas: {etiquetas.map((t) => <b key={t} className="text-ink-2">{t} </b>)}
          — usa estos nombres exactos en el criterio.
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
