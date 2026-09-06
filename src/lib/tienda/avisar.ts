import type { SupabaseClient } from "@supabase/supabase-js";
import { leerConfig } from "./config";
import { textoDelAviso, botonDelAviso, type MomentoAviso } from "./avisos";
import { comoDinero } from "./variedades";
import { enlaceDeTienda, enlaceDePago } from "./direccion";
import {
  enviarTexto, enviarConBoton, enviarPlantilla, type ResultadoEnvio,
} from "@/lib/canales/whatsappEnviar";
import {
  plantillaDe, valoresDe, faltaAlgunDato, dentroDeLaVentana, esFueraDeVentana,
} from "./plantillasDePedido";

/**
 * Mandarle al cliente el aviso de su pedido.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * SE MANDA POR LA CONVERSACIÓN QUE YA EXISTE, no a un número suelto. Y no es un
 * detalle técnico: WhatsApp solo deja escribir texto libre dentro de las 24 h
 * siguientes al último mensaje de la persona. Si el cliente nunca nos escribió,
 * no hay ventana que aprovechar y Meta rechaza el envío —así que aquí ni se
 * intenta, se apunta el motivo y se sigue.
 *
 * EL PEDIDO SE MUEVE AUNQUE EL AVISO FALLE. El estado del pedido es la verdad
 * del negocio; el aviso es una cortesía al cliente. Si se atara una cosa a la
 * otra, un token de Meta caducado dejaría al negocio sin poder mover sus
 * pedidos, que es infinitamente peor que un cliente sin notificación.
 *
 * NO SE AVISA DOS VECES DE LO MISMO. El tablero se arrastra, se arrastra de
 * vuelta, y se vuelve a arrastrar: por dentro son tres cambios de estado y para
 * el cliente sería el mismo mensaje tres veces. La bitácora es la que lo
 * impide, y de paso deja por escrito qué recibió el cliente y cuándo.
 *
 * QUEDA ESCRITO EN LA BANDEJA. El aviso entra en la conversación como un
 * mensaje más —de `system`, no del bot ni de un agente— para que quien atienda
 * vea lo que el cliente ya sabe. Sin eso, el agente saluda a alguien a quien el
 * sistema acaba de escribir y no tiene ni idea.
 * ─────────────────────────────────────────────────────────────────────────────
 */

export type ResultadoAviso = {
  enviado: boolean;
  /** En cristiano, para enseñárselo a quien movió el pedido. Vacío si salió. */
  motivo?: string;
};

/** Lo que se apunta en la bitácora del pedido, se envíe o no. */
const QUE_SI = "aviso_enviado";
const QUE_NO = "aviso_no_enviado";

export async function avisarDelPedido(
  sb: SupabaseClient,
  pedidoId: string,
  momento: MomentoAviso,
): Promise<ResultadoAviso> {
  const anotar = async (ok: boolean, detalle: Record<string, unknown>) => {
    await sb.from("pedido_eventos").insert({
      pedido_id: pedidoId,
      que: ok ? QUE_SI : QUE_NO,
      quien: "tienda",
      detalle: { momento, ...detalle },
    });
  };

  const { data: ped } = await sb
    .from("pedidos")
    .select("id,org_id,tienda_id,numero,codigo,total,conversacion_id,contacto_id")
    .eq("id", pedidoId)
    .maybeSingle();

  // Sin pedido no hay nada que anotar: ni siquiera hay dónde.
  if (!ped) return { enviado: false, motivo: "No encuentro ese pedido." };

  const { data: tienda } = await sb
    .from("tiendas")
    .select("nombre,slug,config")
    .eq("id", ped.tienda_id)
    .maybeSingle();

  const config = leerConfig(tienda?.config);
  const nombre = config.titulo || tienda?.nombre || "la tienda";

  // ── ¿Hay algo que decir? ──────────────────────────────────────────────────
  // Apagado no se apunta. Si cada estado de cada pedido dejara un «estaba
  // apagado» en la bitácora, la bitácora dejaría de servir para lo que sirve.
  const texto = textoDelAviso(momento, config.avisos, {
    numero: ped.numero,
    tienda: nombre,
    total: comoDinero(Number(ped.total), config.moneda),
    codigo: String(ped.codigo ?? ""),
    cliente: await nombreDelCliente(sb, ped.contacto_id as string | null),
  });

  if (!texto) return { enviado: false, motivo: "" };

  // ── ¿Ya se lo dijimos? ────────────────────────────────────────────────────
  const { data: yaFue } = await sb
    .from("pedido_eventos")
    .select("id")
    .eq("pedido_id", pedidoId)
    .eq("que", QUE_SI)
    .contains("detalle", { momento })
    .limit(1);

  if (yaFue && yaFue.length) return { enviado: false, motivo: "" };

  // ── ¿Por dónde se le escribe? ─────────────────────────────────────────────
  const conversacion = await conversacionDelPedido(sb, ped);

  if (!conversacion) {
    const motivo =
      "El cliente todavía no ha escrito por WhatsApp, así que no hay conversación abierta para avisarle.";
    await anotar(false, { motivo });
    return { enviado: false, motivo };
  }

  if (conversacion.channel !== "whatsapp") {
    const motivo = "Los avisos de pedido hoy solo salen por WhatsApp.";
    await anotar(false, { motivo, canal: conversacion.channel });
    return { enviado: false, motivo };
  }

  const { data: canal } = await sb
    .from("whatsapp_channels")
    .select("phone_number_id,access_token")
    .eq("org_id", ped.org_id)
    .maybeSingle();

  const para = String(conversacion.telefono ?? "").replace(/\D+/g, "");

  if (!canal?.phone_number_id || !canal?.access_token) {
    const motivo = "No hay un número de WhatsApp conectado, así que el cliente no recibió el aviso.";
    await anotar(false, { motivo });
    return { enviado: false, motivo };
  }
  if (!para) {
    const motivo = "Ese contacto no tiene un número de WhatsApp guardado.";
    await anotar(false, { motivo });
    return { enviado: false, motivo };
  }

  // ── El botón, cuando este momento lleva uno ───────────────────────────────
  //
  // EL ENLACE SE ARMA AQUÍ Y NO SE GUARDA. Un enlace guardado en el texto del
  // aviso se quedaría apuntando a la dirección vieja el día que el negocio
  // cambie la suya, y esos son justamente los mensajes que llevan dinero
  // dentro.
  const boton = botonDelAviso(momento);
  const slug = String(tienda?.slug ?? "");
  const destino =
    !boton || !slug
      ? ""
      : boton.a === "pago"
        ? enlaceDePago(slug, String(ped.codigo ?? ""))
        : enlaceDeTienda(slug);

  /* ── ¿TEXTO LIBRE O PLANTILLA? ─────────────────────────────────────────
   *
   * WhatsApp solo entrega texto libre dentro de las 24 h siguientes al último
   * mensaje DEL CLIENTE. Pasado ese rato Meta lo rechaza y no pasa nada más: el
   * pedido avanza, el negocio lo ve avanzar, y el cliente no se entera. Y es
   * justo cuando más importa — quien pidió anoche y recibe hoy a mediodía lleva
   * catorce horas sin escribir, así que «va en camino» y «entregado» caían
   * SIEMPRE fuera.
   *
   * FUERA DE LA VENTANA VA PLANTILLA, DENTRO NO. Dentro, el texto libre llega
   * igual, se lee como un mensaje normal y no cuesta; fuera, Meta abre una
   * conversación facturable. Mandar plantilla siempre sería pagar por mensajes
   * que ya podían salir gratis, y que además se leen peor.
   */
  const ultimoDelCliente = await ultimoMensajeDelCliente(sb, conversacion.id);
  const hayVentana = dentroDeLaVentana(ultimoDelCliente);
  const plantilla = plantillaDe(momento);

  // La cola del botón: Meta guarda la dirección fija con un hueco al final y en
  // el envío solo va lo que entra en ese hueco.
  const colaDelBoton =
    plantilla?.boton?.a === "pago" ? String(ped.codigo ?? "") : slug;

  const mandarPlantilla = async (): Promise<ResultadoEnvio> => {
    if (!plantilla) {
      return { ok: false, error: "Este aviso no tiene plantilla para fuera de las 24 horas." };
    }
    const valores = valoresDe(plantilla, {
      numero: ped.numero,
      tienda: nombre,
      total: comoDinero(Number(ped.total), config.moneda),
    });
    // UN HUECO VACÍO NO SE MANDA. Meta acepta el envío y lo que llega es «Tu
    // pedido # en …», que se lee como un error de la plataforma.
    if (faltaAlgunDato(plantilla, valores)) {
      return { ok: false, error: "Faltan datos para armar el aviso." };
    }
    return enviarPlantilla(
      canal.phone_number_id, canal.access_token, para,
      plantilla.nombre, "es", valores,
      plantilla.boton ? colaDelBoton : undefined,
    );
  };

  // ── Se manda ANTES de guardarlo ───────────────────────────────────────────
  // Mismo orden que la Bandeja y que el motor: guardar primero pintaría en
  // pantalla un mensaje que el cliente nunca recibió.
  let porPlantilla = !hayVentana;
  let envio = hayVentana
    ? destino
      ? await enviarConBoton(
          canal.phone_number_id, canal.access_token, para, texto, boton!.texto, destino,
        )
      : await enviarTexto(canal.phone_number_id, canal.access_token, para, texto)
    : await mandarPlantilla();

  /* EL RESPALDO, Y NO SOBRA. Mirar la hora no basta: la que tenemos guardada es
   * la de NUESTRO reloj, el cliente puede haber borrado la conversación, y
   * entre el webhook y la escritura se van segundos. Si el texto libre se cae
   * por la ventana, se reintenta con plantilla en el mismo momento en vez de
   * dejar al cliente sin aviso. */
  if (!envio.ok && hayVentana && esFueraDeVentana(envio.code, envio.error) && plantilla) {
    porPlantilla = true;
    envio = await mandarPlantilla();
  }

  await sb.from("messages").insert({
    conversation_id: conversacion.id,
    org_id: ped.org_id,
    direction: "outbound",
    // NI BOT NI AGENTE: esto lo manda el sistema por una regla que el negocio
    // configuró. Confundirlo con el bot ensucia la analítica de la IA y hace
    // creer al agente que hay un bot contestando en esa conversación.
    sender: "system",
    // CON EL ENLACE DENTRO. El cliente ve un botón; el agente que abre la
    // conversación tiene que poder abrir exactamente lo mismo que le mandamos,
    // y un botón no se puede leer desde la Bandeja.
    body: destino ? `${texto}\n${destino}` : texto,
    payload: {
      aviso_pedido: { pedido_id: ped.id, momento, numero: ped.numero },
      ...(envio.ok
        ? envio.wamid
          ? { wamid: envio.wamid }
          : {}
        : { no_entregado: { motivo: envio.error ?? "No se pudo enviar", code: envio.code ?? null } }),
    },
  });

  await anotar(envio.ok, {
    texto,
    conversacion_id: conversacion.id,
    // POR DÓNDE SALIÓ QUEDA ESCRITO. Es lo primero que hay que saber cuando un
    // cliente jura que no recibió nada: si fue plantilla y Meta la tenía sin
    // aprobar, el motivo está aquí y no hay que adivinarlo.
    via: porPlantilla ? "plantilla" : "texto",
    ...(porPlantilla && plantilla ? { plantilla: plantilla.nombre } : {}),
    ...(destino ? { boton: boton!.texto, destino } : {}),
    ...(envio.ok ? {} : { motivo: envio.error ?? "No se pudo enviar", code: envio.code ?? null }),
  });

  return envio.ok
    ? { enviado: true }
    : { enviado: false, motivo: envio.error ?? "No se pudo enviar el aviso." };
}

/**
 * La conversación por la que se le escribe.
 *
 * PRIMERO LA DEL PEDIDO, que es la buena: la ató el propio código del pedido
 * cuando el cliente mandó su mensaje.
 *
 * SI NO LA HAY, SE BUSCA POR EL CONTACTO. Pasa siempre en el momento del pago:
 * el cliente paga desde el enlace antes de mandar el mensaje del pedido, así
 * que el pedido aún no está enganchado a ninguna conversación —pero si esa
 * persona ya había escrito antes al negocio, su chat existe y está abierto.
 * Encontrarlo es la diferencia entre avisarle del pago y no avisarle.
 */
async function conversacionDelPedido(
  sb: SupabaseClient,
  ped: { org_id: string; conversacion_id: string | null; contacto_id: string | null },
): Promise<{ id: string; channel: string; telefono: string } | null> {
  const leer = async (id: string) => {
    const { data } = await sb
      .from("conversations")
      .select("id,channel,contact:contacts(phone,external_id)")
      .eq("id", id)
      .maybeSingle();
    if (!data) return null;
    const c = (data as { contact?: { phone?: string; external_id?: string } }).contact;
    return {
      id: String(data.id),
      channel: String(data.channel),
      telefono: String(c?.phone ?? c?.external_id ?? ""),
    };
  };

  if (ped.conversacion_id) {
    const c = await leer(ped.conversacion_id);
    if (c) return c;
  }

  if (!ped.contacto_id) return null;

  const { data } = await sb
    .from("conversations")
    .select("id")
    .eq("org_id", ped.org_id)
    .eq("contact_id", ped.contacto_id)
    .eq("channel", "whatsapp")
    .order("last_message_at", { ascending: false, nullsFirst: false })
    .limit(1)
    .maybeSingle();

  return data ? leer(String(data.id)) : null;
}

/**
 * El nombre de pila del cliente, para el hueco `{cliente}`.
 *
 * SOLO EL PRIMER NOMBRE. «Hola, María José Rodríguez de la Guardia» no lo
 * escribe nadie que conozca a María.
 */
async function nombreDelCliente(sb: SupabaseClient, contactoId: string | null): Promise<string> {
  if (!contactoId) return "";
  const { data } = await sb.from("contacts").select("name").eq("id", contactoId).maybeSingle();
  const entero = String(data?.name ?? "").trim();
  // Un nombre que es en realidad un número (el contacto sin nombre se guarda
  // así) no es un nombre: mejor el hueco vacío que «Hola, 50761234567».
  if (!entero || /^[\d+\s-]+$/.test(entero)) return "";
  return entero.split(/\s+/)[0];
}

/**
 * Cuándo escribió el cliente por última vez.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * ES LO ÚNICO QUE DECIDE SI HAY VENTANA. Y se pregunta por `direction`, no por
 * `sender`: lo que abre la ventana de WhatsApp es que la persona escriba, no
 * quién conteste de nuestro lado.
 *
 * SIN NINGUNO, DEVUELVE NULO Y ESO ES «NO HAY VENTANA». Pasa siempre con quien
 * pidió desde la tienda sin haber escrito nunca: ahí solo cabe plantilla.
 * ─────────────────────────────────────────────────────────────────────────────
 */
async function ultimoMensajeDelCliente(
  sb: SupabaseClient,
  conversacionId: string,
): Promise<string | null> {
  const { data } = await sb
    .from("messages")
    .select("created_at")
    .eq("conversation_id", conversacionId)
    .eq("direction", "inbound")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  return (data?.created_at as string | undefined) ?? null;
}
