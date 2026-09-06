/**
 * LO QUE CONTESTA EL CHATBOT EN INSTAGRAM, SIN ABRIR UN SOLO FLUJO.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * EL PROBLEMA. Todo esto YA se podía configurar: cada flujo lleva su disparador
 * en una barra gris arriba del editor. Pero para contestar la pregunta más
 * simple del mundo —«¿mi chatbot contesta los comentarios?»— había que abrir
 * los flujos uno a uno y leer una barra que casi nadie mira. Y para encenderlo,
 * entender qué es un flujo, un lienzo y un disparador.
 *
 * El dueño de una pastelería no quiere construir un flujo. Quiere decir «que
 * conteste los comentarios y los mensajes» y que conteste.
 *
 * ── DOS COSAS, Y SOLO DOS ─────────────────────────────────────────────────
 *
 *   1. DÓNDE CONTESTA LANA. Un interruptor por sitio: mensajes directos,
 *      comentarios en publicaciones, en reels, en directos, respuestas a
 *      historias. Encendido = Lana lee y contesta con la información del
 *      negocio. No hay nada que dibujar.
 *
 *   2. PROMOCIONES POR PALABRA CLAVE. «Comenta ENVÍO y te mando el catálogo».
 *      Una palabra, un mensaje y un archivo o enlace. Llega por privado.
 *
 * ── CÓMO SE DISTINGUEN, SIN INVENTAR UNA COLUMNA ──────────────────────────
 *
 * Una promoción es una regla CON palabra clave; una respuesta general es una
 * regla SIN palabras. No hace falta un campo «tipo»: ya lo dice el dato. Y
 * encaja con el motor tal cual está — el que tiene palabras es más específico
 * y gana, que es exactamente lo que uno quiere: la promoción manda sobre la
 * respuesta general.
 *
 * ── SIGUEN SIENDO FLUJOS ──────────────────────────────────────────────────
 *
 * Por debajo esta pantalla crea y edita `flows` normales. Nada de una tabla
 * paralela: el motor, la Bandeja y el editor siguen viendo lo de siempre, y
 * quien quiera abrir uno y añadirle botones puede hacerlo. La pantalla simple
 * y el editor avanzado son dos vistas de lo mismo, no dos sistemas.
 * ─────────────────────────────────────────────────────────────────────────────
 */

import { ORIGENES, type Origen } from "@/lib/flow/origenes";

/** Los sitios donde puede contestar, para el canal que sea. Del catálogo. */
export function superficiesDe(canal: string) {
  return ORIGENES.filter((o) => o.canales.includes(canal));
}

/**
 * Los dos prefijos que marcan «esto lo lleva la pantalla simple».
 *
 * SE USAN PARA CONSTRUIR Y PARA RECONOCER, en ese orden y desde aquí, para que
 * no puedan separarse. Un día alguien cambia el nombre al crear y la lista de
 * conversaciones se llena de reglas que el negocio nunca escribió.
 */
export const PREFIJO_LANA = "Lana · ";
export const PREFIJO_PROMO = "Promo · ";

/** El nombre con el que se guarda cada regla general. Sale del catálogo. */
export function nombreDeLana(origen: string): string {
  const info = ORIGENES.find((o) => o.valor === origen);
  return `${PREFIJO_LANA}${info?.label ?? origen}`;
}

export function nombreDePromo(palabra: string): string {
  return `${PREFIJO_PROMO}${limpiarPalabra(palabra)}`;
}

/**
 * ¿ESTA REGLA LA LLEVA LA PANTALLA SIMPLE?
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * POR QUÉ NO SE ENSEÑAN EN «CONVERSACIONES AUTOMÁTICAS».
 *
 * «No tengo que crear un flujo para cada respuesta automática: configuro la IA
 * y listo». Tiene razón, y es como debe sentirse. Que por debajo sean `flows`
 * es cosa nuestra —así el motor, la Bandeja y el editor siguen viendo lo de
 * siempre— pero enseñárselos al negocio le devuelve justo el trabajo que la
 * pantalla simple le quitó: media docena de flujos que él no escribió, con
 * lienzos que no quiere tocar.
 *
 * Se esconden de la lista, no se esconde lo que hacen: la lista dice dónde se
 * configuran y lleva ahí.
 * ─────────────────────────────────────────────────────────────────────────────
 */
export function laLlevaLaPantallaSimple(nombre: string | null | undefined): boolean {
  const n = String(nombre ?? "");
  return n.startsWith(PREFIJO_LANA) || n.startsWith(PREFIJO_PROMO);
}

/**
 * La palabra clave, tal y como se guarda.
 *
 * Se recorta y se deja en minúsculas porque el motor compara sin distinguir
 * mayúsculas: guardarla como «ENVÍO» y como «envío» crearía dos promociones
 * que en la práctica son la misma, y el negocio no entendería por qué le
 * aparecen dos filas iguales.
 */
export function limpiarPalabra(p: string | null | undefined): string {
  return String(p ?? "").trim().toLowerCase().slice(0, 40);
}

/** Una regla con palabra clave es una promoción; sin ella, la respuesta general. */
export function esPromo(f: { keywords?: string[] | null } | null | undefined): boolean {
  return (f?.keywords ?? []).filter(Boolean).length > 0;
}

/**
 * El flujo de «que conteste Lana»: un bloque de IA y nada más.
 *
 * NO ES UN FLUJO VACÍO. El motor no manda nada si el gráfico no tiene nodos, así
 * que encender el interruptor y dejar el lienzo en blanco habría sido otra de
 * esas funciones que se guardan y no hacen nada. Un bloque de IA es lo mínimo
 * que de verdad contesta.
 */
export function grafoDeLana() {
  return {
    nodes: [
      {
        id: "start",
        type: "start",
        position: { x: 60, y: 60 },
        data: { label: "Llega un mensaje", text: "Se activa cuando llega algo por aquí.", to: "lana" },
      },
      {
        id: "lana",
        type: "ai",
        position: { x: 60, y: 240 },
        data: {
          label: "Contesta Lana",
          text: "Lana responde con la información del negocio.",
          aiProvider: "demandu",
          isStart: true,
        },
      },
    ],
    edges: [{ id: "e-start", source: "start", target: "lana" }],
  };
}

/**
 * El flujo de una promoción: un mensaje, con su archivo o enlace si lo hay.
 *
 * EL ENLACE VA DENTRO DEL TEXTO, no en un botón. Instagram no permite botones
 * en el primer mensaje privado que se manda como respuesta a un comentario:
 * un botón ahí no se vería y la promoción llegaría sin lo prometido.
 */
export function grafoDePromo(v: {
  mensaje: string;
  enlace?: string | null;
  archivo?: string | null;
  tipoDeArchivo?: string | null;
}) {
  const enlace = String(v.enlace ?? "").trim();
  const texto = [String(v.mensaje ?? "").trim(), enlace].filter(Boolean).join("\n\n");
  const archivo = String(v.archivo ?? "").trim();

  return {
    nodes: [
      {
        id: "start",
        type: "start",
        position: { x: 60, y: 60 },
        data: { label: "Escriben la palabra", text: "Se activa con la palabra clave.", to: "promo" },
      },
      archivo
        ? {
            id: "promo",
            type: "media",
            position: { x: 60, y: 240 },
            data: {
              label: "Lo prometido",
              // EL TEXTO VA EN `caption`, NO EN `text`. El motor, para un
              // bloque de archivo, manda `mediaUrl` y `caption` y no mira
              // `text` — puesto ahí, la promoción llegaría como un enlace
              // suelto, sin una palabra que lo explique.
              caption: texto,
              mediaUrl: archivo,
              mediaType: String(v.tipoDeArchivo ?? "file"),
              isStart: true,
            },
          }
        : {
            id: "promo",
            type: "message",
            position: { x: 60, y: 240 },
            data: { label: "Lo prometido", text: texto, media: "none", isStart: true },
          },
    ],
    edges: [{ id: "e-start", source: "start", target: "promo" }],
  };
}

/**
 * Dónde escucha una promoción.
 *
 * «En los dos» son DOS reglas, una por sitio, porque una regla escucha en un
 * sitio y ya. Se agrupan en la pantalla por su palabra clave, que es lo que el
 * negocio entiende por «la promoción»; por debajo cada una es un flujo normal.
 */
export const DONDE_PROMO: { valor: string; label: string; origenes: Origen[] }[] = [
  { valor: "comentarios", label: "Cuando lo comentan", origenes: ["post", "reel"] },
  { valor: "dm", label: "Cuando me lo escriben por privado", origenes: ["dm"] },
  { valor: "ambos", label: "En los dos sitios", origenes: ["post", "reel", "dm"] },
];

export function origenesDePromo(donde: string | null | undefined): Origen[] {
  return (DONDE_PROMO.find((d) => d.valor === donde) ?? DONDE_PROMO[0]).origenes;
}

/** De vuelta: qué opción marcar al pintar una promoción que ya existe. */
export function dondeDeLosOrigenes(origenes: (string | null | undefined)[]): string {
  const tiene = (o: string) => origenes.some((x) => String(x ?? "") === o);
  const enComentarios = tiene("post") || tiene("reel");
  if (enComentarios && tiene("dm")) return "ambos";
  return tiene("dm") ? "dm" : "comentarios";
}
