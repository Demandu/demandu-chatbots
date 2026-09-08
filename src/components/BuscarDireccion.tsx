"use client";

import { useEffect, useRef, useState } from "react";
import { MapPin, LoaderCircle, Check } from "lucide-react";
import {
  ESPERA_MS,
  LETRAS_MINIMAS,
  MAX_POR_BUSQUEDA,
  nuevaBusqueda,
  valeLaPenaBuscar,
  type Sugerencia,
  type Punto,
} from "@/lib/lugares/google";

/**
 * ESCRIBIR LA DIRECCIÓN Y ELEGIRLA DE UNA LISTA.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * LO QUE ESTO RESUELVE ES LA COORDENADA, NO LA COMODIDAD.
 *
 * ASAP exige cuatro números y en Panamá no se deducen de la dirección escrita.
 * Antes había que pedirle al cliente su ubicación por WhatsApp, o mandarlo a
 * Google Maps a copiar dos números. Aquí elige de una lista y el punto llega
 * solo, sin que nadie sepa que existe una coordenada.
 *
 * ── SE PUEDE ESCRIBIR A MANO, SIEMPRE. NO ES UN RESPALDO: ES LA REGLA ─────
 *
 * En Panamá hay direcciones que Google no conoce: una barriada sin
 * nomenclatura, un PH recién entregado, una casa «al lado de la panadería».
 * Si hubiera que elegir de la lista por narices, esa gente no podría comprar —
 * y el negocio nunca se enteraría, porque quien no puede terminar no escribe
 * para quejarse: se va.
 *
 * Por eso lo escrito vale igual, la lista es una ayuda, y no hay ningún estado
 * en el que este campo bloquee. Lo que se pierde sin elegir de la lista es la
 * coordenada, no la venta: el pedido entra y se le pide la ubicación después.
 *
 * ── Y SE ESPERA A QUE DEJE DE ESCRIBIR ────────────────────────────────────
 *
 * Preguntar en cada tecla convierte una dirección de treinta letras en treinta
 * llamadas de pago, la mayoría de ellas por respuestas que la tecla siguiente
 * borra antes de que nadie las lea. El cuánto y el cuándo están en
 * `lib/lugares/google.ts`, que es puro y se puede probar sin gastar nada.
 * ─────────────────────────────────────────────────────────────────────────────
 */
export function BuscarDireccion({
  valor,
  onCambio,
  onPunto,
  placeholder,
  estilo,
  acento,
  autoFocus,
}: {
  valor: string;
  /** Lo escrito, tal cual. Vale aunque no se elija nada de la lista. */
  onCambio: (v: string) => void;
  /** Solo cuando eligió una de la lista: trae la dirección Y el punto. */
  onPunto: (p: Punto) => void;
  placeholder?: string;
  estilo?: React.CSSProperties;
  acento?: string;
  autoFocus?: boolean;
}) {
  const [sugerencias, setSugerencias] = useState<Sugerencia[]>([]);
  const [buscando, setBuscando] = useState(false);
  const [elegido, setElegido] = useState(false);
  const [abierto, setAbierto] = useState(false);

  // El identificador que agrupa las llamadas de UNA búsqueda. Se renueva al
  // elegir: reutilizarlo dejaría de agrupar y cada tecla se cobraría suelta.
  const busqueda = useRef(nuevaBusqueda());
  const cuantas = useRef(0);
  // Para tirar la respuesta de una búsqueda vieja que llegue tarde: sin esto,
  // escribir rápido puede pintar las sugerencias de hace dos letras.
  const ultima = useRef(0);

  useEffect(() => {
    // Si acaba de elegir, lo que hay en el campo es lo que él eligió: preguntar
    // por ello sería pagar por confirmarnos lo que ya sabemos.
    if (elegido) return;
    if (!valeLaPenaBuscar(valor, cuantas.current)) {
      setSugerencias([]);
      return;
    }

    const mio = ++ultima.current;
    const t = setTimeout(async () => {
      setBuscando(true);
      try {
        cuantas.current += 1;
        const r = await fetch("/api/lugares", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ que: "sugerencias", texto: valor, busqueda: busqueda.current }),
        });
        const d = await r.json().catch(() => null);
        if (mio !== ultima.current) return; // llegó tarde: ya hay otra búsqueda
        setSugerencias(Array.isArray(d?.sugerencias) ? d.sugerencias : []);
        setAbierto(true);
      } catch {
        // NO SE ENSEÑA UN ERROR. Que no haya sugerencias no impide nada: lo
        // escrito sigue valiendo. Un aviso rojo aquí asustaría sin motivo.
        if (mio === ultima.current) setSugerencias([]);
      } finally {
        if (mio === ultima.current) setBuscando(false);
      }
    }, ESPERA_MS);

    return () => clearTimeout(t);
  }, [valor, elegido]);

  async function elegir(s: Sugerencia) {
    setAbierto(false);
    setElegido(true);
    setBuscando(true);
    try {
      const r = await fetch("/api/lugares", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ que: "punto", id: s.id, busqueda: busqueda.current }),
      });
      const d = await r.json().catch(() => null);
      if (d?.ok && d.punto) {
        onPunto(d.punto as Punto);
      } else {
        // SE QUEDA LO QUE ELIGIÓ, AUNQUE NO VENGAN LAS COORDENADAS. Borrar el
        // campo porque falló una llamada nuestra sería castigar al cliente por
        // un problema suyo que no es.
        onCambio([s.texto, s.detalle].filter(Boolean).join(", "));
        setElegido(false);
      }
    } catch {
      onCambio([s.texto, s.detalle].filter(Boolean).join(", "));
      setElegido(false);
    } finally {
      setBuscando(false);
      // La búsqueda se cerró en Google al pedir el punto: de aquí en adelante,
      // otra.
      busqueda.current = nuevaBusqueda();
      cuantas.current = 0;
      setSugerencias([]);
    }
  }

  const color = acento ?? "#e0397f";

  return (
    <div className="relative">
      <div className="relative">
        <input
          value={valor}
          autoFocus={autoFocus}
          onChange={(e) => {
            setElegido(false);
            onCambio(e.target.value);
          }}
          onFocus={() => sugerencias.length > 0 && setAbierto(true)}
          // Un clic en una sugerencia quita el foco del campo: si se cerrara al
          // instante, el clic no llegaría a registrarse nunca.
          onBlur={() => setTimeout(() => setAbierto(false), 150)}
          placeholder={placeholder ?? "Escribe tu dirección"}
          style={estilo}
          className="input-l pr-9"
          autoComplete="off"
        />
        <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2">
          {buscando ? (
            <LoaderCircle className="h-4 w-4 animate-spin opacity-50" />
          ) : elegido ? (
            <Check className="h-4 w-4" style={{ color }} />
          ) : null}
        </span>
      </div>

      {abierto && sugerencias.length > 0 && (
        <ul className="absolute z-20 mt-1 w-full overflow-hidden rounded-xl border border-linea bg-tarjeta shadow-lg">
          {sugerencias.map((s) => (
            <li key={s.id}>
              <button
                type="button"
                // `onMouseDown` y no `onClick`: el `blur` del campo se dispara
                // antes que el clic, y con `onClick` la lista ya se cerró.
                onMouseDown={(e) => {
                  e.preventDefault();
                  elegir(s);
                }}
                className="flex w-full items-start gap-2 px-3 py-2.5 text-left transition hover:bg-suave"
              >
                <MapPin className="mt-0.5 h-3.5 w-3.5 shrink-0 opacity-50" />
                <span className="min-w-0">
                  <span className="block truncate text-sm text-ink">{s.texto}</span>
                  {s.detalle && <span className="block truncate text-xs text-ink-3">{s.detalle}</span>}
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}

      {/* SE DICE QUE PUEDE ESCRIBIRLA IGUAL, y se dice siempre. Sin esta línea,
          quien no encuentra su dirección en la lista cree que no puede seguir —
          y se va sin comprar, en silencio. */}
      {!elegido && valor.trim().length >= LETRAS_MINIMAS && (
        <p className="mt-1 text-xs text-ink-3">
          ¿No aparece? Escríbela igual, se entiende perfectamente.
        </p>
      )}
    </div>
  );
}
