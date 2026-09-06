import Link from "next/link";

/**
 * Las pestañas del entrenamiento.
 *
 * SON ENLACES, NO ESTADO DE JAVASCRIPT. Cada pestaña es una dirección propia
 * (`?t=web`), así que se puede compartir, se puede volver con el botón de atrás
 * del navegador y no se pierde al recargar. Con estado de cliente, cualquiera
 * de esas tres cosas mandaría al cliente de vuelta al principio.
 *
 * LAS QUE TODAVÍA NO EXISTEN SE MARCAN, no se esconden. Enseñar una pestaña que
 * no hace nada es peor que no tenerla: el cliente entra, no pasa nada, y
 * escribe a soporte. Diciendo «muy pronto» sabe qué va a haber y qué no hay
 * hoy — que es la misma regla que ya usa la conexión de Messenger.
 */

export type Pestana = {
  clave: string;
  titulo: string;
  /** Todavía no construida: se muestra apagada y con su aviso. */
  pronto?: boolean;
};

export const PESTANAS: Pestana[] = [
  { clave: "resumen", titulo: "Resumen" },
  { clave: "web", titulo: "Sitio web" },
  { clave: "archivos", titulo: "Archivos", pronto: true },
  { clave: "sheets", titulo: "Google Sheets", pronto: true },
  { clave: "faqs", titulo: "Preguntas frecuentes", pronto: true },
  { clave: "fragmentos", titulo: "Fragmentos" },
  { clave: "sin-respuesta", titulo: "Sin responder" },
];

export function EntrenamientoNav({ botId, activa }: { botId: string; activa: string }) {
  return (
    <nav className="mb-6 flex gap-1 overflow-x-auto border-b border-linea">
      {PESTANAS.map((p) => {
        const esta = p.clave === activa;
        return (
          <Link
            key={p.clave}
            href={`/bots/${botId}/training?t=${p.clave}`}
            className={`relative flex-none whitespace-nowrap border-b-2 px-3 py-2.5 text-sm transition ${
              esta
                ? "border-pink font-semibold text-ink"
                : "border-transparent text-ink-2 hover:text-ink"
            }`}
          >
            {p.titulo}
            {p.pronto && (
              <span className="ml-1.5 rounded bg-suave px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wide text-ink-3">
                pronto
              </span>
            )}
          </Link>
        );
      })}
    </nav>
  );
}
