/**
 * El catálogo de eventos que Demandu sabe contar hacia fuera.
 *
 * POR QUÉ VIVE EN SU PROPIO ARCHIVO, SEPARADO DE `salidas.ts`. Porque esta
 * lista la necesitan LOS DOS LADOS: el servidor para encolar, y la pantalla de
 * configuración —que es un componente de cliente— para pintar las casillas.
 *
 * `salidas.ts` empieza con `import "server-only"`, que es una barrera a
 * propósito: impide que la llave de servicio acabe en el navegador. Pero esa
 * barrera se hereda por importación, así que un componente de cliente que
 * importara de ahí ROMPE EL BUILD ENTERO. Pasó: Netlify se quedó sirviendo la
 * versión anterior y `/api/salidas/enviar` daba 404 mientras el código estaba
 * perfectamente subido.
 *
 * Datos puros aquí, servidor allá.
 *
 * ESTA LISTA ES UN CONTRATO. Quien conecta su CRM escribe código contra estos
 * nombres; renombrar uno rompe integraciones ajenas sin avisar. Se añaden
 * eventos nuevos, no se renombran los que ya salieron.
 */
export const EVENTOS = [
  { clave: "lead.nuevo", nombre: "Lead nuevo", desc: "Alguien escribe por primera vez." },
  { clave: "lead.datos", nombre: "Datos del lead", desc: "El chatbot capturó su nombre, correo u otro dato." },
  { clave: "cita.agendada", nombre: "Cita agendada", desc: "Se reservó una cita en el calendario." },
  { clave: "pase.a.humano", nombre: "Pidió una persona", desc: "La conversación necesita a alguien del equipo." },
  { clave: "conversacion.cerrada", nombre: "Conversación cerrada", desc: "Terminó la conversación." },

  /* ── LO QUE PASA EN LA TIENDA ────────────────────────────────────────────
     Se emiten desde un DISPARADOR DE LA BASE, no desde el código: hay tres
     caminos que crean pedidos —el escaparate, el pedido por chat y el cambio a
     mano en el panel— y un cuarto que los paga (la conciliación de Yappy).
     Emitir desde cada uno es garantizar que el que se añada mañana se olvide.

     Y los escuchan DOS: el CRM del cliente por webhook, y el embudo por
     dentro. Ese es todo el diseño: un catálogo, dos consumidores. */
  { clave: "pedido.creado", nombre: "Pedido nuevo", desc: "Alguien hizo un pedido y falta cobrarlo." },
  { clave: "pedido.pagado", nombre: "Pedido pagado", desc: "El pago se confirmó." },
  { clave: "pedido.pago_vencido", nombre: "Pago vencido", desc: "El enlace de pago caducó sin que pagaran." },

  { clave: "cita.cancelada", nombre: "Cita cancelada", desc: "La persona canceló su cita." },
] as const;

export type ClaveDeEvento = (typeof EVENTOS)[number]["clave"];
