/**
 * La equivalencia en pesos, debajo del precio en dólares.
 *
 * Tres cosas que este componente hace a propósito:
 *
 * 1. **Va debajo y en pequeño.** El precio de verdad es el de arriba. Si los
 *    dos números pesan igual, el cliente no sabe cuál le van a cobrar.
 * 2. **Dice "aprox."** No es un adorno legal: el monto real depende del día y
 *    de su banco. Prometer una cifra exacta es prometer algo que no controlamos.
 * 3. **Desaparece entero** si no hay tipo de cambio de fiar. Sin número roto,
 *    sin "—", sin hueco raro: no está y ya.
 */
export function Pesos({ monto }: { monto: string | null }) {
  if (!monto) return null;
  return (
    <div className="mt-0.5 text-[11px] text-ink-3">
      aprox. <span className="font-semibold text-ink-2">{monto} MXN</span>
    </div>
  );
}

/**
 * La nota que explica la equivalencia. Va UNA vez por pantalla, no una por
 * tarjeta: repetir la advertencia cinco veces la convierte en ruido y deja de
 * leerse justo cuando importa.
 */
export function NotaDePesos({ visible }: { visible: boolean }) {
  if (!visible) return null;
  return (
    <p className="mt-3 text-[11px] leading-relaxed text-ink-3">
      Los precios están en <b className="text-ink-2">dólares</b> y así es como se cobran. El monto en pesos es
      una referencia del día para que sepas de qué tamaño es el gasto — al pagar, tu banco o la pantalla de
      pago te mostrarán el importe exacto en tu moneda.
    </p>
  );
}
