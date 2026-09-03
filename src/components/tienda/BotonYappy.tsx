"use client";

import { useEffect, useRef, useState } from "react";

/**
 * El botón de Yappy.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * NO LO DIBUJAMOS NOSOTROS: lo dibuja un componente que sirve Banco General
 * desde su propio dominio (<btn-yappy>). Y tiene que ser así — es la marca del
 * banco, con su forma y su color, y el cliente la reconoce. Un botón «parecido»
 * hecho por nosotros es exactamente lo que enseña a la gente a confiar en
 * botones de pago falsos.
 *
 * SE MONTA A MANO, sin JSX, porque su interfaz es imperativa: se le escucha
 * `eventClick`, y cuando ya tenemos la orden creada en el servidor se le llama
 * `eventPayment(...)`. Meterlo en el árbol de React solo añadiría una capa que
 * hay que esquivar.
 *
 * SI EL SCRIPT DEL BANCO NO CARGA, ESTE COMPONENTE DESAPARECE. Un hueco donde
 * debería estar el botón deja al cliente esperando algo que no va a venir; sin
 * botón, sigue estando el pedido por WhatsApp, que es como se vendía ayer.
 * ─────────────────────────────────────────────────────────────────────────────
 */

type Datos = { transactionId: string; token: string; documentName: string };

type ElementoYappy = HTMLElement & {
  eventPayment?: (d: Datos) => void;
  isButtonLoading?: boolean;
};

export function BotonYappy({
  cdn,
  onPagar,
  onExito,
  onFallo,
}: {
  cdn: string;
  /** Crea el pedido y la orden en el servidor. `null` = no se pudo seguir. */
  onPagar: () => Promise<Datos | null>;
  onExito: () => void;
  onFallo: (mensaje: string) => void;
}) {
  const caja = useRef<HTMLDivElement | null>(null);
  const [listo, setListo] = useState(false);
  const [muerto, setMuerto] = useState(false);

  // LAS FUNCIONES SE GUARDAN EN UNA REFERENCIA, y no en las dependencias del
  // efecto, a propósito: cambian en cada tecla que el cliente escribe en el
  // formulario, y si el efecto dependiera de ellas el botón del banco se
  // destruiría y se volvería a crear letra a letra.
  const manos = useRef({ onPagar, onExito, onFallo });
  manos.current = { onPagar, onExito, onFallo };

  // El script del banco, una sola vez por página aunque el carrito se abra y
  // se cierre veinte veces.
  useEffect(() => {
    if (typeof window === "undefined") return;
    if (customElements.get("btn-yappy")) return setListo(true);

    const yaEsta = document.querySelector<HTMLScriptElement>(`script[data-yappy="1"]`);
    const s = yaEsta ?? document.createElement("script");
    if (!yaEsta) {
      s.src = cdn;
      s.type = "module";
      s.dataset.yappy = "1";
      document.head.appendChild(s);
    }
    const bien = () => setListo(true);
    const mal = () => setMuerto(true);
    s.addEventListener("load", bien);
    s.addEventListener("error", mal);
    return () => {
      s.removeEventListener("load", bien);
      s.removeEventListener("error", mal);
    };
  }, [cdn]);

  useEffect(() => {
    if (!listo || !caja.current) return;

    caja.current.innerHTML = "";
    const el = document.createElement("btn-yappy") as ElementoYappy;
    el.setAttribute("theme", "blue");
    el.setAttribute("rounded", "true");
    caja.current.appendChild(el);

    const alPulsar = async () => {
      el.isButtonLoading = true;
      try {
        const datos = await manos.current.onPagar();
        if (!datos) return;
        el.eventPayment?.(datos);
      } finally {
        el.isButtonLoading = false;
      }
    };

    // EL ÉXITO DEL BOTÓN NO ES EL DINERO. Dice que la app aceptó, no que el
    // banco confirmó: lo que marca el pedido como pagado es el aviso firmado
    // que Yappy le manda a nuestro servidor, y ese llega por su cuenta.
    const alExito = () => manos.current.onExito();
    const alError = () =>
      manos.current.onFallo("El pago no se completó. Puedes intentarlo otra vez.");

    el.addEventListener("eventClick", alPulsar);
    el.addEventListener("eventSuccess", alExito);
    el.addEventListener("eventError", alError);

    return () => {
      el.removeEventListener("eventClick", alPulsar);
      el.removeEventListener("eventSuccess", alExito);
      el.removeEventListener("eventError", alError);
    };
  }, [listo]);

  if (muerto) return null;
  return <div ref={caja} className="min-h-[48px]" />;
}
