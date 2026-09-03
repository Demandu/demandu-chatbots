import Link from "next/link";

/**
 * Las pestañas de una tienda.
 *
 * SON ENLACES, NO ESTADO DE JAVASCRIPT: cada una es una dirección propia
 * (`?t=diseno`), así que se comparte, se vuelve con el botón de atrás y no se
 * pierde al recargar — la misma regla que ya sigue el entrenamiento del bot.
 *
 * ESTO NACIÓ DE UN FALLO MÍO: las tres secciones estaban pintadas como
 * tarjetas bonitas y no llevaban a ninguna parte. Un botón que parece un botón
 * y no hace nada es exactamente el mismo error que una opción de menú que
 * termina en un 404 — el cliente pulsa, no pasa nada, y se queda sin saber si
 * la culpa es suya.
 */

export const PESTANAS = [
  { clave: "productos", titulo: "Productos" },
  { clave: "diseno", titulo: "Diseño" },
  { clave: "cobros", titulo: "Cobros" },
] as const;

export type ClavePestana = (typeof PESTANAS)[number]["clave"];

export function esPestana(v: string | undefined): ClavePestana {
  return (PESTANAS.find((p) => p.clave === v)?.clave ?? "productos") as ClavePestana;
}

export function TiendaNav({ tiendaId, activa }: { tiendaId: string; activa: string }) {
  return (
    <nav className="mb-6 flex gap-1 overflow-x-auto border-b border-linea">
      {PESTANAS.map((p) => {
        const esta = p.clave === activa;
        return (
          <Link
            key={p.clave}
            href={`/tienda/${tiendaId}?t=${p.clave}`}
            className={`flex-none whitespace-nowrap border-b-2 px-3 py-2.5 text-sm transition ${
              esta
                ? "border-pink font-semibold text-ink"
                : "border-transparent text-ink-2 hover:text-ink"
            }`}
          >
            {p.titulo}
          </Link>
        );
      })}
    </nav>
  );
}
