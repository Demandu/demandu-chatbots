/**
 * ASAP: el mensajero.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * QUÉ HACE ESTE ARCHIVO Y QUÉ NO.
 *
 * Aquí está TODO lo que se puede decidir sin base de datos y sin internet:
 * cómo se arma el pedido que espera ASAP, qué significa cada número de estado,
 * qué falta para poder mandar. Nada de esto toca la red, así que todo se puede
 * probar de verdad — y falta hacía, porque el error caro de una integración de
 * mensajería no es que falle la llamada: es que salga bien con la dirección
 * equivocada y el paquete acabe en otro barrio.
 *
 * ── LAS COORDENADAS SON EL CORAZÓN DEL ASUNTO ─────────────────────────────
 *
 * ASAP exige cuatro números: dónde recoger y dónde entregar. No acepta «PH
 * Pijao, apto 12B». Y NO SE PUEDEN ADIVINAR del texto: en Panamá media ciudad
 * no tiene nomenclatura, los mapas inventan, y una coordenada adivinada manda
 * la moto a un sitio donde no hay nadie — sin error, sin aviso, con el negocio
 * pagando el viaje.
 *
 * Por eso la ubicación viene de quien sabe dónde vive: el botón de ubicación de
 * WhatsApp o el pin del mapa de la tienda. Si no está, no se manda; y decirlo
 * antes (`loQueFaltaParaMandar`) es mejor que enterarse cuando ASAP lo rechaza.
 *
 * ── EL DINERO DEL ENVÍO NO PASA POR AQUÍ ──────────────────────────────────
 *
 * Cada negocio pone su propia cuenta de ASAP, igual que con Yappy. El envío se
 * lo cobra ASAP a él, con su tarifa y su contrato. Demandu no factura el envío
 * de nadie.
 * ─────────────────────────────────────────────────────────────────────────────
 */

export type AmbienteEnvio = "prueba" | "produccion";

/** El de pruebas existe para equivocarse sin sacar una moto a la calle. */
export const API_ASAP: Record<AmbienteEnvio, string> = {
  prueba: "https://goasap.dev/ecommerce/v2/api",
  produccion: "https://goasap.app/ecommerce/v2/api",
};

export function esAmbienteEnvio(v: unknown): AmbienteEnvio {
  return v === "produccion" ? "produccion" : "prueba";
}

/** Lo que ASAP admite como vehículo. El valor es suyo; la etiqueta, nuestra. */
export const VEHICULOS: { valor: string; label: string }[] = [
  { valor: "bike", label: "Moto" },
  { valor: "car", label: "Carro" },
  { valor: "truck", label: "Camión" },
];

export function vehiculoValido(v: unknown): string {
  const s = String(v ?? "").trim().toLowerCase();
  return VEHICULOS.some((x) => x.valor === s) ? s : "bike";
}

/* ── Coordenadas ───────────────────────────────────────────────────────────── */

/**
 * Un número que de verdad puede ser una ubicación.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * EL CERO ES EL ENEMIGO. `Number("")` es 0, `Number(null)` es 0, y (0, 0) es un
 * punto real: está en el Atlántico, frente a África. Una comprobación con
 * `if (lat)` lo deja pasar como «no hay» —cierto por casualidad— pero
 * `Number.isFinite(0)` lo deja pasar como «sí hay», y entonces se manda una
 * moto al golfo de Guinea.
 *
 * Se exige que sea finito, que esté dentro del rango del planeta, y que el
 * texto de origen no estuviera vacío. Fuera de rango se devuelve nulo en vez de
 * recortar: una latitud de 200 no es una latitud mal puesta, es un dato que
 * vino de otro sitio, y arreglarlo a 90 sería inventarse una ubicación.
 * ─────────────────────────────────────────────────────────────────────────────
 */
export function coordenada(v: unknown, tope: number): number | null {
  if (v === null || v === undefined) return null;
  const texto = String(v).trim();
  if (!texto) return null;
  const n = Number(texto);
  if (!Number.isFinite(n)) return null;
  if (n < -tope || n > tope) return null;
  return n;
}

export function latitud(v: unknown): number | null {
  return coordenada(v, 90);
}

export function longitud(v: unknown): number | null {
  return coordenada(v, 180);
}

export type Ubicacion = { lat: number; long: number };

/** Las dos juntas o ninguna: media coordenada no lleva a ninguna parte. */
export function ubicacionDe(lat: unknown, long: unknown): Ubicacion | null {
  const la = latitud(lat);
  const lo = longitud(long);
  if (la === null || lo === null) return null;
  // (0,0) es el punto nulo de todos los sistemas que pierden el dato por el
  // camino. Nadie pide un domicilio en mitad del Atlántico.
  if (la === 0 && lo === 0) return null;
  return { lat: la, long: lo };
}

/**
 * ASAP quiere las coordenadas como TEXTO en el punto A y B («"9.0136814"»), y
 * como NÚMERO dentro de `deliveries`. Se respeta su formato tal cual en vez de
 * mandar lo que nos parezca: un campo que espera texto y recibe número es de
 * los rechazos que llegan con un mensaje que no dice qué campo era.
 */
export function comoTexto(n: number): string {
  return String(n);
}

/* ── Teléfonos ─────────────────────────────────────────────────────────────── */

/**
 * El teléfono como lo enseña ASAP en sus ejemplos: ocho dígitos, sin el 507.
 *
 * La gente lo escribe de siete maneras —+507 6123-4567, 507 61234567,
 * 6123 4567— y todas son la misma. Se normaliza aquí y no se le pide a nadie
 * que teclee bonito, que es lo mismo que ya se hace con Yappy.
 *
 * SI NO PARECE PANAMEÑO SE DEVUELVE LIMPIO Y ENTERO, no recortado: un número
 * de otro país recortado a ocho dígitos no es un número, es basura con forma de
 * teléfono — y el mensajero lo marcaría.
 */
export function telefonoAsap(tel: string | null | undefined): string {
  const d = String(tel ?? "").replace(/\D+/g, "");
  if (d.length === 11 && d.startsWith("507")) return d.slice(3);
  return d;
}

/* ── Las instrucciones que lee el mensajero ────────────────────────────────── */

/**
 * «Nombre: Daniel; Teléfono: 62159100; Portón verde».
 *
 * ES EL FORMATO DE SUS PROPIOS EJEMPLOS, y no es casualidad: el mensajero lee
 * ese renglón en su teléfono y ahí tiene a quién buscar y a quién llamar. Un
 * párrafo largo con la dirección repetida dentro no le sirve — ya tiene la
 * dirección arriba.
 *
 * LAS PARTES VACÍAS DESAPARECEN. «Nombre: ; Teléfono: ;» es peor que no poner
 * nada: le hace creer que el dato existe y está en blanco.
 */
export function instrucciones(v: {
  nombre?: string | null;
  telefono?: string | null;
  nota?: string | null;
}): string {
  const nombre = String(v.nombre ?? "").trim();
  const tel = telefonoAsap(v.telefono);
  const nota = String(v.nota ?? "").trim().replace(/\s+/g, " ");

  const partes: string[] = [];
  if (nombre) partes.push(`Nombre: ${nombre}`);
  if (tel) partes.push(`Teléfono: ${tel}`);
  if (nota) partes.push(nota);
  return partes.join("; ");
}

/* ── ¿Se puede mandar? ─────────────────────────────────────────────────────── */

export type ConfigEnvio = {
  activo?: boolean | null;
  ambiente?: string | null;
  api_key?: string | null;
  user_token?: string | null;
  shared_secret?: string | null;
  telefono?: string | null;
  origen_direccion?: string | null;
  origen_lat?: unknown;
  origen_long?: unknown;
  origen_nombre?: string | null;
  origen_telefono?: string | null;
  origen_nota?: string | null;
  vehiculo?: string | null;
};

export type PedidoParaEnviar = {
  codigo?: string | null;
  entrega_direccion?: string | null;
  entrega_lat?: unknown;
  entrega_long?: unknown;
  entrega_nota?: string | null;
  cliente_nombre?: string | null;
  cliente_telefono?: string | null;
};

/**
 * Todo lo que impide mandar este pedido, dicho ANTES de intentarlo.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * POR QUÉ UNA LISTA Y NO UN «SÍ/NO». Es la misma decisión que
 * `loQueFaltaParaVender`: un botón gris que no explica por qué está gris manda
 * al negocio a adivinar, y adivinar acaba en un mensaje nuestro un domingo.
 *
 * Y SE DICE EN CASTELLANO DE PERSONA. ASAP contesta cosas como «Invalid
 * parameters»; eso no le dice al dueño de la panadería que le falta el pin de
 * su propio local.
 * ─────────────────────────────────────────────────────────────────────────────
 */
export function loQueFaltaParaMandar(c: ConfigEnvio, p: PedidoParaEnviar): string[] {
  const falta: string[] = [];

  if (!c || c.activo !== true) falta.push("activar los envíos con ASAP en la tienda");
  if (!String(c?.api_key ?? "").trim()) falta.push("la llave de API de ASAP");
  if (!String(c?.user_token ?? "").trim()) falta.push("el user token de ASAP");
  if (!String(c?.shared_secret ?? "").trim()) falta.push("el shared secret de ASAP");
  if (!String(c?.telefono ?? "").trim()) falta.push("el teléfono de la cuenta de ASAP");

  if (!String(c?.origen_direccion ?? "").trim()) falta.push("la dirección del local");
  if (!ubicacionDe(c?.origen_lat, c?.origen_long)) falta.push("la ubicación del local en el mapa");

  if (!String(p?.entrega_direccion ?? "").trim()) falta.push("la dirección de entrega del pedido");
  if (!ubicacionDe(p?.entrega_lat, p?.entrega_long)) {
    // ESTE ES EL QUE MÁS VA A SALIR, y por eso se explica cómo se arregla: el
    // negocio no puede ponerla él, tiene que pedírsela al cliente.
    falta.push("la ubicación del cliente (que la mande por WhatsApp o la marque en el mapa)");
  }
  if (!telefonoAsap(p?.cliente_telefono)) falta.push("el teléfono de quien recibe");
  if (!String(p?.codigo ?? "").trim()) falta.push("el código del pedido");

  return falta;
}

/* ── El cuerpo de la orden ─────────────────────────────────────────────────── */

/**
 * El JSON que se le manda a `POST /order`.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * SE ARMA EN UNA FUNCIÓN PURA, APARTE DE LA LLAMADA, porque es donde están los
 * errores que no se ven: un campo con el nombre mal escrito, una coordenada
 * cambiada de sitio, el teléfono del negocio donde va el del cliente. Nada de
 * eso da error — da una entrega en la dirección equivocada.
 *
 * `request_later: 0` A PROPÓSITO. El envío se pide cuando el negocio pulsa
 * «Enviar», es decir cuando el paquete ya está armado sobre el mostrador:
 * programarlo para más tarde sería inventarse una hora que nadie pidió.
 *
 * `external_order_id` ES EL CÓDIGO, NO EL NÚMERO. El número del pedido va por
 * tienda y empieza en 1 en todas: el pedido 12 existe en cien tiendas a la vez,
 * y cuando ASAP nos devuelva un aviso con ese 12 no sabríamos de cuál habla.
 * ─────────────────────────────────────────────────────────────────────────────
 */
export function cuerpoDeOrden(c: ConfigEnvio, p: PedidoParaEnviar): Record<string, unknown> {
  const origen = ubicacionDe(c?.origen_lat, c?.origen_long);
  const destino = ubicacionDe(p?.entrega_lat, p?.entrega_long);

  return {
    user_token: String(c?.user_token ?? "").trim(),
    shared_secret: String(c?.shared_secret ?? "").trim(),
    phone: String(c?.telefono ?? "").trim(),

    // De su documentación, tal cual: 2 es el servicio de comercio electrónico,
    // no es personal, y es un solo tramo (A → B).
    type_id: 2,
    is_personal: 0,
    is_oneway: 1,

    source_address: String(c?.origen_direccion ?? "").trim(),
    source_lat: origen ? comoTexto(origen.lat) : "",
    source_long: origen ? comoTexto(origen.long) : "",
    source_seller_name: String(c?.origen_nombre ?? "").trim(),
    source_seller_phone: telefonoAsap(c?.origen_telefono),
    special_inst: instrucciones({
      nombre: c?.origen_nombre,
      telefono: c?.origen_telefono,
      nota: c?.origen_nota,
    }),

    desti_address: String(p?.entrega_direccion ?? "").trim(),
    desti_lat: destino ? comoTexto(destino.lat) : "",
    desti_long: destino ? comoTexto(destino.long) : "",
    desti_customer_name: String(p?.cliente_nombre ?? "").trim(),
    desti_customer_phone: telefonoAsap(p?.cliente_telefono),
    dest_special_inst: instrucciones({
      nombre: p?.cliente_nombre,
      telefono: p?.cliente_telefono,
      nota: p?.entrega_nota,
    }),

    request_later: 0,
    external_order_id: String(p?.codigo ?? "").trim(),
    vehicle_type: vehiculoValido(c?.vehiculo),
  };
}

/* ── Lo que contesta ASAP ──────────────────────────────────────────────────── */

/**
 * El `delivery_id`, lo busquen donde lo busquen.
 *
 * ES EL ÚNICO DATO QUE IMPORTA DE LA RESPUESTA: con él se pregunta el estado,
 * se pide el enlace de rastreo y se cancela. Lo dan UNA VEZ. Si no se guarda en
 * ese momento, el pedido ya está en la calle y nosotros sin forma de seguirlo.
 *
 * SE MIRA EN VARIOS SITIOS a propósito. Su colección de Postman no trae ni un
 * ejemplo de respuesta de creación, y las tres formas de abajo son las que usan
 * en el resto de sus rutas. Adivinar una sola y equivocarse costaría un envío
 * hecho y perdido — el peor de los dos errores posibles.
 */
export function leerDeliveryId(respuesta: unknown): string {
  const r = (respuesta ?? {}) as Record<string, any>;
  const candidatos = [
    r.delivery_id,
    r.deliveryId,
    r.id,
    r.data?.delivery_id,
    r.data?.id,
    r.order?.delivery_id,
    r.order?.id,
  ];
  for (const c of candidatos) {
    if (c === null || c === undefined) continue;
    const s = String(c).trim();
    if (s && s !== "0") return s;
  }
  return "";
}

/**
 * Lo que dice ASAP cuando algo no le gusta.
 *
 * SE ENSEÑA SU MENSAJE TAL CUAL cuando lo hay, igual que con Yappy: traducirlo
 * a «hubo un error» borra la única pista que existe.
 */
export function motivoDelFallo(respuesta: unknown): string {
  const r = (respuesta ?? {}) as Record<string, any>;
  const bruto = r.message ?? r.error ?? r.status_message ?? r.msg ?? r.data?.message;
  const texto = String(bruto ?? "").trim();
  return texto || "ASAP no aceptó el pedido y no dijo por qué.";
}

/* ── Los estados ───────────────────────────────────────────────────────────── */

export type EstadoEnvio =
  | "pedido"
  | "confirmado"
  | "recogiendo"
  | "en_camino"
  | "entregado"
  | "cancelado"
  | "devuelto"
  | "fallido";

/**
 * Los códigos de ASAP, traducidos a algo que se pueda enseñar.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * NO ESTÁN EN ORDEN Y ESO IMPORTA. Van 0, 1, 2, 3, 4, 5, 6, 7 y luego saltan a
 * 100 y 101 — y el 100 («llegó») ocurre ANTES que el 2 («completado») pero
 * también antes del 7 («despachado»), porque el mensajero llega primero al
 * local y después al cliente. Tratar el número como un progreso (mayor = más
 * avanzado) haría que un pedido entregado retrocediera a «en camino».
 *
 * Por eso lo que manda es SIEMPRE el último aviso, no el número más alto.
 * ─────────────────────────────────────────────────────────────────────────────
 */
export const ESTADOS_ASAP: Record<number, { clave: EstadoEnvio; label: string }> = {
  0: { clave: "pedido", label: "Pedido al mensajero" },
  1: { clave: "cancelado", label: "Cancelado" },
  2: { clave: "entregado", label: "Entregado" },
  3: { clave: "fallido", label: "Falló el pago del envío" },
  4: { clave: "fallido", label: "Sin mensajero disponible" },
  5: { clave: "devuelto", label: "Devuelto al local" },
  6: { clave: "confirmado", label: "Mensajero asignado" },
  7: { clave: "en_camino", label: "En camino" },
  100: { clave: "recogiendo", label: "El mensajero llegó" },
  101: { clave: "en_camino", label: "En camino" },
};

/**
 * OJO CON EL CERO, OTRA VEZ. `Number(null)` y `Number("")` son 0, y 0 es un
 * código REAL: «pedido al mensajero». Un aviso al que le falte el campo diría
 * que el envío acaba de empezar —y pisaría el estado verdadero, que podía ser
 * «entregado»—. Se exige que el campo venga, y que traiga algo.
 */
export function estadoDeCodigo(codigo: unknown): { clave: EstadoEnvio; label: string } | null {
  if (codigo === null || codigo === undefined) return null;
  const texto = String(codigo).trim();
  if (!texto) return null;
  const n = Number(texto);
  if (!Number.isInteger(n)) return null;
  return ESTADOS_ASAP[n] ?? null;
}

/** Ya no va a cambiar más: ni se vuelve a preguntar ni se puede cancelar. */
export function envioTerminado(clave: string | null | undefined): boolean {
  return ["entregado", "cancelado", "devuelto", "fallido"].includes(String(clave ?? ""));
}

/**
 * Qué le pasa al PEDIDO cuando su envío se mueve.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * EL ENVÍO Y EL PEDIDO NO SON LO MISMO, y mezclarlos ya sería un error aquí.
 * Un envío cancelado no cancela el pedido: el negocio lo puede volver a mandar,
 * o llevarlo él. Un envío entregado SÍ entrega el pedido — es literalmente lo
 * que significa.
 *
 * Se devuelve nulo cuando el pedido no debe moverse, y quien llama no toca
 * `estado`. Es la diferencia entre un embudo que cuenta la verdad y uno donde
 * los pedidos se cancelan solos porque una moto se averió.
 * ─────────────────────────────────────────────────────────────────────────────
 */
export function estadoDelPedido(clave: EstadoEnvio | null | undefined): string | null {
  switch (clave) {
    case "en_camino":
      return "en_camino";
    case "entregado":
      return "entregado";
    default:
      return null;
  }
}

/**
 * Los avisos del webhook, traducidos a un estado.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * EL WEBHOOK NO MANDA EL CÓDIGO, MANDA UN NOMBRE (`action`). Y algunos nombres
 * hablan de la RECOGIDA y otros de la ENTREGA, con palabras casi iguales:
 * `pickupAgentArrived` es «llegó al local» y `deliveryAgentArrived` es «llegó
 * a casa del cliente». Confundirlos le diría al cliente que su pedido ya llegó
 * cuando el mensajero está todavía en la panadería.
 *
 * Lo que no esté en esta tabla se guarda con su nombre y sin cambiar el estado.
 * Un aviso desconocido no es motivo para inventarse en qué punto va el paquete.
 * ─────────────────────────────────────────────────────────────────────────────
 */
export const AVISOS_ASAP: Record<string, EstadoEnvio> = {
  pickuprequestreceived: "pedido",
  deliveryrequestreceived: "pedido",
  pickuptaskupdate: "confirmado",
  deliverytaskupdate: "confirmado",
  pickupstarted: "confirmado",
  pickupagentarrived: "recogiendo",
  pickupsuccessful: "en_camino",
  deliveryagentstarted: "en_camino",
  deliveryagentarrived: "en_camino",
  deliverysuccessful: "entregado",
};

export function estadoDeAviso(accion: unknown): EstadoEnvio | null {
  return AVISOS_ASAP[String(accion ?? "").trim().toLowerCase()] ?? null;
}

/**
 * Un aviso puede traer además un `state`: «Cancel» o «Declined» mandan sobre la
 * acción. `deliveryTaskUpdate` con `state: "Cancel"` no es una actualización
 * cualquiera: es que nadie va a ir.
 */
export function estadoDeAvisoConEstado(accion: unknown, estado: unknown): EstadoEnvio | null {
  const e = String(estado ?? "").trim().toLowerCase();
  if (e === "cancel" || e === "cancelled" || e === "canceled") return "cancelado";
  if (e === "declined") return "fallido";
  return estadoDeAviso(accion);
}
