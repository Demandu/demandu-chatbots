"use client";

import { useEffect, useState } from "react";

/**
 * Cuántas personas están esperando a que alguien del equipo les conteste.
 *
 * POR QUÉ EXISTE: el aviso emergente es un parpadeo. Si el agente estaba en
 * otra pestaña, comiendo, o simplemente recargó la página, el aviso ya pasó y
 * la solicitud se quedaba invisible — un cliente esperando y nadie enterado.
 * Un contador en el menú no se pierde: sigue ahí cuando vuelves.
 *
 * El número lo calcula `NotificationsWatcher`, que ya consulta la base cada 8
 * segundos. Se reparte por un evento del navegador en vez de que cada
 * componente pregunte por su cuenta: una sola consulta, varios sitios pintando.
 */
export const EVENTO_PENDIENTES = "demandu:pendientes";

/** Último valor conocido, para que quien se monte tarde no empiece en blanco. */
let ultimo = 0;

export function anunciarPendientes(n: number) {
  ultimo = Math.max(0, Number(n) || 0);
  if (typeof window !== "undefined") {
    window.dispatchEvent(new CustomEvent(EVENTO_PENDIENTES, { detail: ultimo }));
  }
}

export function usePendientes(): number {
  const [n, setN] = useState(ultimo);
  useEffect(() => {
    // Por si el vigilante ya publicó un número antes de que esto se montara.
    setN(ultimo);
    const oir = (e: Event) => setN(Number((e as CustomEvent).detail) || 0);
    window.addEventListener(EVENTO_PENDIENTES, oir);
    return () => window.removeEventListener(EVENTO_PENDIENTES, oir);
  }, []);
  return n;
}
