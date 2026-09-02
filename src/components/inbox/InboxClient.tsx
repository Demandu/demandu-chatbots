"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Search, Send, Bot, User, CheckCircle2, RotateCcw, CheckCheck, Paperclip, ChevronLeft, Hand, AlertTriangle } from "lucide-react";
import { useSearchParams } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { ChannelBadge } from "./ChannelBadge";
import { ContactPanel } from "./ContactPanel";
import { ConvoMenu, type AccionChat } from "./ConvoMenu";
import { TraductorBoton } from "./TraductorBoton";
import { RespuestasRapidas } from "./RespuestasRapidas";
import { ResponderEnIdioma } from "./ResponderEnIdioma";
import { EmojiPicker } from "./EmojiPicker";
import { VistaAdjunto, TOPE_BYTES, pesoLegible, type Adjunto } from "./Adjunto";
import { EnviarPlantilla } from "./EnviarPlantilla";
import { rellenar, type RespuestaRapida } from "@/lib/quickReplies";
import { Confirm } from "@/components/ui/Confirm";
import { bandera, paisDesdeTelefono } from "@/lib/phoneCountry";
import { paletaChat } from "@/lib/chatColors";

type Contact = {
  id: string; name: string | null; wa_name: string | null; phone: string | null; email: string | null;
  company: string | null; country: string | null; notes: string | null;
  attributes: Record<string, any> | null; channel: string | null; tags: string[] | null;
  /** De qué anuncio llegó esta persona la primera vez (Click to WhatsApp). */
  origen: Record<string, any> | null;
};
type State = { id: string; name: string; color: string };
type Member = { id: string; name: string };
type Convo = {
  id: string;
  channel: string;
  /** Para poder mandar al agente a las plantillas de ESE chatbot. */
  bot_id: string | null;
  status: string;
  unread: number;
  last_message_at: string;
  /** Cuándo pidió el lead hablar con una persona (null = no pidió) */
  handoff_requested_at: string | null;
  state_id: string | null;
  opportunity_id?: string | null;
  assignee_member_id: string | null;
  /** En qué idioma escribe el lead. Se detecta solo; el agente puede cambiarlo. */
  idioma_lead: string | null;
  contact: Contact | null;
  state: State | null;
  member: Member | null;
};
type Message = {
  id: string; direction: string; sender: string; body: string | null; created_at: string;
  payload?: {
    /** Si WhatsApp rechazó el envío, aquí viene el motivo en humano. */
    no_entregado?: { motivo: string; code: number | null };
    /**
     * Lo que el agente escribió de verdad, cuando el mensaje salió traducido.
     * Se guarda SIEMPRE: al lead le llega la traducción, pero el equipo tiene
     * que poder ver después qué se quiso decir. Sin esto, una conversación
     * traducida sería imposible de auditar.
     */
    original?: string;
    idioma?: string;
    /** Archivo enviado con el mensaje (imagen, PDF, lo que sea). */
    adjunto?: Adjunto;
  } | null;
};

const CH: Record<string, { label: string; emoji: string; color: string }> = {
  whatsapp: { label: "WhatsApp", emoji: "🟢", color: "#25D366" },
  instagram: { label: "Instagram", emoji: "📸", color: "#E1306C" },
  messenger: { label: "Messenger", emoji: "💬", color: "#0084FF" },
  telegram: { label: "Telegram", emoji: "✈️", color: "#229ED9" },
  webchat: { label: "Web Chat", emoji: "🌐", color: "#6E42FF" },
};

function ago(iso: string) {
  const diff = Date.now() - new Date(iso).getTime();
  const m = Math.floor(diff / 60000);
  if (m < 1) return "ahora";
  if (m < 60) return `hace ${m} min`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h} h`;
  const d = Math.floor(h / 24);
  return `${d} d`;
}
function clock(iso: string) {
  return new Date(iso).toLocaleTimeString("es-MX", { hour: "2-digit", minute: "2-digit" });
}
function initials(name?: string | null) {
  return (name ?? "?").trim().slice(0, 2).toUpperCase();
}

// El estilo del chat ya no está fijo: sale de `paletaChat()` a partir del
// color de burbuja que eligió el cliente en Configuración → Apariencia.

export function InboxClient({
  initial,
  members,
  states,
  tags,
  attrs = [],
  bubbleOut,
  orgId,
  quickReplies = [],
}: {
  initial: Convo[];
  members: Member[];
  states: State[];
  tags: { id: string; name: string; color: string }[];
  /** Atributos personalizados del cliente, para la ficha del lead. */
  attrs?: { id: string; name: string; key: string }[];
  /** Color de las burbujas que enviamos: lo elige cada cliente. */
  bubbleOut?: string | null;
  /** Organización actual, para guardar las notas internas */
  orgId?: string | null;
  /** Mensajes prediseñados del equipo */
  quickReplies?: RespuestaRapida[];
}) {
  const sb = useMemo(() => createClient(), []);
  const [convos, setConvos] = useState<Convo[]>(initial);
  const params = useSearchParams();
  const pedida = params.get("c");
  const [selId, setSelId] = useState<string | null>(pedida ?? initial[0]?.id ?? null);
  const [messages, setMessages] = useState<Message[]>([]);
  // Solo para la apertura de una conversación. Sin esto el panel se queda en
  // blanco varios segundos y parece una conversación rota o un error.
  // Arranca encendido si ya hay una conversación seleccionada: los efectos
  // corren después del primer pintado, así que empezar apagado enseñaría un
  // parpadeo de "todavía no hay mensajes" antes de siquiera pedirlos.
  const [cargandoMsgs, setCargandoMsgs] = useState<boolean>(Boolean(pedida ?? initial[0]?.id));
  // Cuál conversación se está esperando, para descartar respuestas atrasadas.
  const convoPedidaRef = useRef<string | null>(null);
  const [text, setText] = useState("");
  // Si el envío falla, el agente tiene que enterarse: antes fallaba en silencio.
  const [errorEnvio, setErrorEnvio] = useState("");
  const [filter, setFilter] = useState<"todas" | "solicitudes" | "abiertas" | "cerradas">("todas");
  const [q, setQ] = useState("");
  const bodyRef = useRef<HTMLDivElement>(null);
  // Acción destructiva pendiente de confirmar (vaciar o eliminar un chat)
  const [porConfirmar, setPorConfirmar] = useState<{ id: string; accion: "vaciar" | "eliminar"; quien: string } | null>(null);
  const [borrando, setBorrando] = useState(false);
  // Traductor: idioma elegido y traducciones ya resueltas (id del mensaje → texto)
  const [idioma, setIdioma] = useState<string | null>(null);
  const [traducciones, setTraducciones] = useState<Record<string, string>>({});
  const [traduciendo, setTraduciendo] = useState(false);
  const [errorTraduccion, setErrorTraduccion] = useState("");
  // Responder en el idioma del lead: interruptor, texto ya traducido y espera.
  // El interruptor arranca APAGADO en cada conversación a propósito: que un
  // mensaje salga traducido sin que el agente lo haya pedido es justo el tipo
  // de sorpresa que no queremos en algo que se manda en nombre del negocio.
  const [responderEn, setResponderEn] = useState(false);
  const [previa, setPrevia] = useState("");
  const [previaCargando, setPreviaCargando] = useState(false);
  // Si el idioma lo eligió el agente, no se le dice "detectado por sus
  // mensajes": sería mentirle sobre de dónde salió el dato.
  const [idiomaAMano, setIdiomaAMano] = useState(false);
  /** La ventana para retomar la conversación con una plantilla aprobada. */
  const [abrirPlantilla, setAbrirPlantilla] = useState(false);
  // Adjuntos: subida en curso y si hay algo arrastrándose por encima del chat.
  const [subiendo, setSubiendo] = useState<string | null>(null);
  const [arrastrando, setArrastrando] = useState(false);
  // Respuestas rápidas: se abren con el botón ⚡ o escribiendo "/" al inicio
  const [rapidasAbierto, setRapidasAbierto] = useState(false);
  const cajaTexto = useRef<HTMLTextAreaElement>(null);

  // Toda la paleta del chat sale del color de burbuja que eligió el cliente,
  // así el fondo y los textos siempre contrastan bien.
  const paleta = useMemo(() => paletaChat(bubbleOut), [bubbleOut]);

  const sel = convos.find((c) => c.id === selId) ?? null;

  /**
   * ¿Se cerró la ventana de 24 horas de WhatsApp?
   *
   * SE MIDE DESDE EL ÚLTIMO MENSAJE DEL CLIENTE, no desde el último de la
   * conversación. Es la diferencia que importa: si el agente escribe, el
   * `last_message_at` de la conversación se actualiza, y usar ese dato haría
   * parecer que la ventana está abierta cuando Meta ya la cerró. La ventana la
   * abre el cliente escribiendo, y solo él.
   *
   * Solo aplica a WhatsApp: el chat de la web y los demás canales no tienen
   * ventana, y bloquear ahí sería inventarse una limitación.
   */
  const ventanaCerrada = (() => {
    if (!sel || sel.channel !== "whatsapp") return false;
    const suyos = messages.filter((m) => m.direction === "inbound");
    const ultimo = suyos.length ? Date.parse(suyos[suyos.length - 1].created_at) : NaN;
    // Sin ningún mensaje del cliente todavía no se bloquea: puede ser una
    // conversación recién creada cuyos mensajes aún se están cargando, y dejar
    // al agente mudo por una carga a medias sería peor que el problema.
    if (!Number.isFinite(ultimo)) return false;
    return Date.now() - ultimo > 24 * 60 * 60 * 1000;
  })();

  const selectSql =
    "id, channel, bot_id, status, unread, last_message_at, handoff_requested_at, state_id, assignee_member_id, opportunity_id, idioma_lead, " +
    "contact:contacts(id,name,wa_name,phone,email,company,country,notes,attributes,channel,tags,origen), " +
    "state:conversation_states(id,name,color), member:team_members(id,name)";

  const loadConvos = useCallback(async () => {
    const { data } = await sb.from("conversations").select(selectSql).order("last_message_at", { ascending: false });
    if (data) setConvos(data as any);
  }, [sb]);

  /**
   * Trae los mensajes de una conversación.
   *
   * `inicial` distingue abrir una conversación de el refresco de cada 6 s. Solo
   * la apertura enciende el esqueleto: si lo encendiera también el refresco,
   * la charla parpadearía cada 6 segundos.
   */
  const loadMessages = useCallback(
    async (id: string, inicial = false) => {
      if (inicial) setCargandoMsgs(true);
      try {
        const { data } = await sb.from("messages").select("id,direction,sender,body,created_at,payload").eq("conversation_id", id).order("created_at");
        // Si mientras tanto el agente ya se cambió a otra conversación, esta
        // respuesta llegó tarde: pintarla mostraría los mensajes de quien no es.
        if (convoPedidaRef.current !== id) return;
        setMessages((data as any) ?? []);
      } finally {
        // En `finally` para que un fallo de red no deje el esqueleto girando
        // para siempre. Y solo si sigue siendo la conversación vigente: una
        // respuesta atrasada no debe apagar el esqueleto de la nueva.
        if (inicial && convoPedidaRef.current === id) setCargandoMsgs(false);
      }
    },
    [sb]
  );

  // Al seleccionar: carga mensajes y marca como leído
  useEffect(() => {
    if (!selId) return;
    // Se vacía primero: si no, durante un instante se ven los mensajes de la
    // conversación anterior debajo del nombre de la nueva.
    setMessages([]);
    convoPedidaRef.current = selId;
    loadMessages(selId, true);
    // Abrirla marca los mensajes como leídos. NADA MÁS.
    //
    // Antes también borraba `handoff_requested_at`, y eso destruía la solicitud
    // de atención humana con solo asomarse. Peor: la Bandeja abre sola la
    // conversación más reciente, así que la petición se borraba al entrar a la
    // pantalla, sin que nadie hiciera clic ni atendiera a nadie. La solicitud
    // desaparecía de "Solicitudes" para todo el equipo.
    //
    // Una solicitud se da por atendida cuando el agente CONTESTA (ver `send`),
    // no cuando alguien la ve de pasada.
    setConvos((cs) => cs.map((c) => (c.id === selId ? { ...c, unread: 0 } : c)));
    sb.from("conversations")
      .update({ unread: 0 })
      .eq("id", selId)
      .then(() => {});
  }, [selId, loadMessages, sb]);

  // Si llegamos desde un aviso (?c=…), abrimos esa conversación
  useEffect(() => {
    if (pedida) setSelId(pedida);
  }, [pedida]);

  // Refresco ligero (simula tiempo real mientras no hay motor en vivo)
  useEffect(() => {
    const t = setInterval(() => {
      loadConvos();
      if (selId) loadMessages(selId);
    }, 6000);
    return () => clearInterval(t);
  }, [loadConvos, loadMessages, selId]);

  useEffect(() => {
    bodyRef.current?.scrollTo({ top: bodyRef.current.scrollHeight, behavior: "smooth" });
  }, [messages]);

  // Al cambiar de conversación se limpia lo traducido (son otros mensajes)
  useEffect(() => setTraducciones({}), [selId]);

  // Traduce solo lo que todavía no está traducido, así los mensajes nuevos
  // que van llegando se traducen solos sin repetir trabajo.
  useEffect(() => {
    if (!idioma) return;
    const pendientes = messages.filter((m) => m.body && traducciones[m.id] === undefined);
    if (!pendientes.length) return;

    let cancelado = false;
    setTraduciendo(true);
    fetch("/api/translate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ idioma, textos: pendientes.map((m) => m.body) }),
    })
      .then(async (r) => ({ ok: r.ok, j: await r.json() }))
      .then(({ ok, j }) => {
        if (cancelado) return;
        if (!ok) {
          setErrorTraduccion(j?.error ?? "No se pudo traducir.");
          setIdioma(null);
          return;
        }
        setErrorTraduccion("");
        setTraducciones((prev) => {
          const next = { ...prev };
          pendientes.forEach((m, i) => { next[m.id] = j.traducciones?.[i] ?? ""; });
          return next;
        });
      })
      .catch(() => {
        if (!cancelado) { setErrorTraduccion("No se pudo conectar con el traductor."); setIdioma(null); }
      })
      .finally(() => { if (!cancelado) setTraduciendo(false); });

    return () => { cancelado = true; };
  }, [idioma, messages, traducciones]);

  /**
   * En qué idioma escribe el lead.
   *
   * SE DETECTA UNA SOLA VEZ POR CONVERSACIÓN y se guarda. Detectar en cada
   * mensaje sería inestable: con textos cortos —"ok", "gracias"— la detección
   * falla y el idioma cambiaría a media conversación. Se mira lo que ya
   * escribió el lead, se decide, y a partir de ahí manda lo guardado (o lo que
   * el agente corrija).
   */
  useEffect(() => {
    if (!sel || sel.idioma_lead) return;
    const suyos = messages.filter((m) => m.direction === "inbound" && m.body).map((m) => m.body!);
    if (suyos.length < 2) return; // con un solo mensaje no hay con qué decidir

    let cancelado = false;
    fetch("/api/translate/detectar", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ textos: suyos }),
    })
      .then((r) => r.json())
      .then((j) => {
        if (cancelado || !j?.idioma) return;
        sb.from("conversations").update({ idioma_lead: j.idioma }).eq("id", sel.id).then(() => {});
        setConvos((cs) => cs.map((c) => (c.id === sel.id ? { ...c, idioma_lead: j.idioma } : c)));
      })
      .catch(() => {});

    return () => { cancelado = true; };
  }, [sb, sel, messages]);

  /**
   * La vista previa de lo que va a salir.
   *
   * Va con espera de medio segundo: sin ella habría una llamada a Google por
   * cada letra que teclea el agente. Y el agente ve el texto ANTES de enviarlo
   * porque él responde de lo que se manda en nombre del negocio — una
   * traducción automática puede cambiarle el tono o estropear un modismo.
   */
  useEffect(() => {
    const destino = sel?.idioma_lead;
    if (!responderEn || !destino || !text.trim()) { setPrevia(""); return; }

    let cancelado = false;
    setPreviaCargando(true);
    const t = setTimeout(() => {
      fetch("/api/translate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ idioma: destino, textos: [text.trim()] }),
      })
        .then((r) => r.json())
        .then((j) => { if (!cancelado) setPrevia(j?.traducciones?.[0] ?? ""); })
        .catch(() => { if (!cancelado) setPrevia(""); })
        .finally(() => { if (!cancelado) setPreviaCargando(false); });
    }, 500);

    return () => { cancelado = true; clearTimeout(t); setPreviaCargando(false); };
  }, [responderEn, text, sel?.idioma_lead]);

  // Cambiar de conversación apaga el interruptor: el idioma del lead anterior
  // no tiene nada que ver con el de este.
  useEffect(() => { setResponderEn(false); setPrevia(""); setIdiomaAMano(false); }, [selId]);

  /**
   * Avisa al visitante de que hay alguien escribiéndole.
   *
   * Se manda como mucho una vez cada 3 s aunque el agente teclee sin parar: si
   * no, sería una escritura en la base por cada letra. El widget considera que
   * sigue escribiendo mientras la marca tenga menos de 8 segundos, así que con
   * refrescarla cada 3 basta para que los puntos no parpadeen.
   */
  const ultimoAviso = useRef(0);
  const avisarQueEscribo = useCallback(() => {
    if (!selId) return;
    const ahora = Date.now();
    if (ahora - ultimoAviso.current < 3000) return;
    ultimoAviso.current = ahora;
    sb.from("conversations")
      .update({ agent_typing_at: new Date().toISOString() })
      .eq("id", selId)
      .then(() => {});
  }, [sb, selId]);

  /** Mete un emoji donde está el cursor, no al final. */
  const insertarEmoji = (emoji: string) => {
    const caja = cajaTexto.current;
    if (!caja) { setText((t) => t + emoji); return; }
    const ini = caja.selectionStart ?? text.length;
    const fin = caja.selectionEnd ?? text.length;
    const nuevo = text.slice(0, ini) + emoji + text.slice(fin);
    setText(nuevo);
    // El cursor tiene que quedar DESPUÉS del emoji, si no cada uno siguiente se
    // metería delante del anterior y saldrían al revés.
    requestAnimationFrame(() => {
      caja.focus();
      const pos = ini + emoji.length;
      caja.setSelectionRange(pos, pos);
    });
  };

  /**
   * Sube un archivo y lo manda como mensaje.
   *
   * VA AL MISMO DEPÓSITO `media` QUE YA USA EL CONSTRUCTOR, con su propia
   * carpeta por organización y conversación. Reaprovecharlo evita inventar un
   * segundo sistema de archivos con sus propios permisos que mantener.
   *
   * El archivo se sube ANTES de crear el mensaje: si se creara primero, un
   * fallo de subida dejaría en la conversación una burbuja apuntando a un
   * archivo que no existe, y eso no hay forma de arreglarlo después.
   */
  const subirAdjunto = async (file: File) => {
    if (!sel || !file) return;
    setErrorEnvio("");

    if (file.size > TOPE_BYTES) {
      setErrorEnvio(`«${file.name}» pesa ${pesoLegible(file.size)}. El máximo son 25 MB.`);
      return;
    }

    setSubiendo(file.name);
    try {
      const limpio = file.name.replace(/[^\w.\-]+/g, "_").slice(-80);
      const ruta = `inbox/${orgId ?? "org"}/${sel.id}/${Date.now()}-${limpio}`;

      const { error: errSubida } = await sb.storage
        .from("media")
        .upload(ruta, file, { cacheControl: "3600", upsert: false });
      if (errSubida) throw new Error(errSubida.message);

      const { data: pub } = sb.storage.from("media").getPublicUrl(ruta);
      const adjunto: Adjunto = {
        url: pub.publicUrl,
        nombre: file.name,
        tipo: file.type || "application/octet-stream",
        bytes: file.size,
      };

      // Mismo camino que el texto: el servidor lo entrega por el canal del
      // cliente y después lo guarda. El cuerpo lleva el nombre del archivo para
      // que la lista de conversaciones y las notificaciones digan algo.
      const r = await fetch("/api/canales/enviar", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ conversacion: sel.id, texto: file.name, adjunto }),
      });
      const j = await r.json();
      if (!r.ok || !j?.mensaje) throw new Error(j?.error ?? "no se guardó el mensaje");

      setMessages((m) => [...m, j.mensaje as Message]);
      setConvos((cs) => cs.map((c) => (c.id === sel.id ? { ...c, handoff_requested_at: null } : c)));
      loadConvos();
    } catch (e: any) {
      console.error("[bandeja] no se pudo adjuntar:", e?.message);
      setErrorEnvio("No se pudo enviar el archivo. Inténtalo otra vez.");
    } finally {
      setSubiendo(null);
    }
  };

  const send = async () => {
    const escrito = text.trim();
    if (!escrito || !sel) return;

    // Si el agente pidió responder en el idioma del lead, lo que SALE es la
    // traducción y lo que escribió queda guardado al lado. Si la traducción no
    // llegó a tiempo, sale el texto original: es mejor que el lead reciba algo
    // en español a que se quede esperando.
    const traducido = responderEn && previa.trim() ? previa.trim() : "";
    const body = traducido || escrito;
    const extra = traducido
      ? { payload: { original: escrito, idioma: sel.idioma_lead ?? undefined } }
      : {};

    setText("");
    setPrevia("");
    const optimistic: Message = {
      id: `tmp-${Date.now()}`, direction: "outbound", sender: "agent", body,
      created_at: new Date().toISOString(),
      payload: traducido ? { original: escrito, idioma: sel.idioma_lead ?? undefined } : null,
    };
    setMessages((m) => [...m, optimistic]);

    // YA NO SE ESCRIBE DIRECTO EN LA BASE. Se pide al servidor que lo ENTREGUE
    // por el canal del cliente y después lo guarde con el resultado. Escribir
    // aquí funcionaba solo en el canal web —donde el widget del visitante
    // pregunta cada cuatro segundos— y en WhatsApp no llegaba nada, sin error.
    //
    // Vuelve el renglón guardado para CAMBIAR la burbuja provisional por la de
    // verdad conservando su sitio: si no, al refrescar la lista desaparecería y
    // volvería a aparecer con otro id, y eso React lo pinta como un parpadeo.
    let fila: Message | null = null;
    try {
      const r = await fetch("/api/canales/enviar", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          conversacion: sel.id,
          texto: body,
          original: traducido ? escrito : undefined,
          idioma: traducido ? sel.idioma_lead ?? undefined : undefined,
        }),
      });
      const j = await r.json();
      if (r.ok && j?.mensaje) fila = j.mensaje as Message;
    } catch {
      fila = null;
    }

    if (fila) {
      setMessages((m) => m.map((x) => (x.id === optimistic.id ? fila! : x)));
    } else {
      // Antes esto pasaba en SILENCIO: el agente veía su mensaje en pantalla y
      // se iba tan tranquilo, convencido de haber contestado.
      setMessages((m) => m.filter((x) => x.id !== optimistic.id));
      // Se devuelve lo que ESCRIBIÓ, no lo traducido: si le devolviéramos la
      // traducción, al reintentar se traduciría otra vez sobre sí misma.
      setText(escrito);
      setErrorEnvio("No se pudo enviar. Revisa tu conexión e inténtalo otra vez.");
      return;
    }
    setErrorEnvio("");
    // Contestar SÍ es atender: la solicitud de persona se cierra aquí, no al
    // abrir la conversación. Así sigue en "Solicitudes" hasta que alguien de
    // verdad le responda al cliente. (El servidor ya la limpió; esto es para
    // que la lista de la izquierda no espere al siguiente refresco.)
    setConvos((cs) => cs.map((c) => (c.id === sel.id ? { ...c, handoff_requested_at: null } : c)));
    loadConvos();
  };

  const setState = async (stateId: string) => {
    if (!sel) return;
    const st = states.find((s) => s.id === stateId) ?? null;
    setConvos((cs) => cs.map((c) => (c.id === sel.id ? { ...c, state_id: stateId, state: st } : c)));
    await sb.from("conversations").update({ state_id: stateId }).eq("id", sel.id);
    // La etapa que se ve aquí y la columna del Embudo son la MISMA cosa: si
    // solo se guardara en la conversación, el agente movería el estado desde
    // el chat y la tarjeta se quedaría quieta en el tablero.
    if ((sel as any).opportunity_id) {
      await sb.from("opportunities").update({ stage_id: stateId }).eq("id", (sel as any).opportunity_id);
    }
  };
  const setAssignee = async (memberId: string) => {
    if (!sel) return;
    const mm = members.find((m) => m.id === memberId) ?? null;
    setConvos((cs) => cs.map((c) => (c.id === sel.id ? { ...c, assignee_member_id: memberId || null, member: mm } : c)));
    await sb.from("conversations").update({ assignee_member_id: memberId || null }).eq("id", sel.id);
  };
  const toggleTag = async (name: string) => {
    if (!sel?.contact) return;
    const cur = new Set(sel.contact.tags ?? []);
    if (cur.has(name)) cur.delete(name); else cur.add(name);
    const next = Array.from(cur);
    setConvos((cs) => cs.map((c) => (c.id === sel.id ? { ...c, contact: { ...c.contact!, tags: next } } : c)));
    await sb.from("contacts").update({ tags: next }).eq("id", sel.contact.id);
  };

  const setConvStatus = async (status: string) => {
    if (!sel) return;
    setConvos((cs) => cs.map((c) => (c.id === sel.id ? { ...c, status } : c)));
    await sb.from("conversations").update({ status }).eq("id", sel.id);
  };

  /** Marca sin leer sin abrirla (si estaba abierta, la cierra para que no se relea). */
  const marcarNoLeido = async (id: string) => {
    setConvos((cs) => cs.map((c) => (c.id === id ? { ...c, unread: Math.max(1, c.unread) } : c)));
    if (selId === id) setSelId(null);
    await sb.from("conversations").update({ unread: 1 }).eq("id", id);
  };
  const marcarLeido = async (id: string) => {
    setConvos((cs) => cs.map((c) => (c.id === id ? { ...c, unread: 0 } : c)));
    await sb.from("conversations").update({ unread: 0 }).eq("id", id);
  };
  const cambiarEstado = async (id: string, status: string) => {
    setConvos((cs) => cs.map((c) => (c.id === id ? { ...c, status } : c)));
    await sb.from("conversations").update({ status }).eq("id", id);
  };

  /** Borra los mensajes pero conserva la conversación y el contacto. */
  const vaciarChat = async (id: string) => {
    await sb.from("messages").delete().eq("conversation_id", id);
    if (selId === id) setMessages([]);
    loadConvos();
  };
  /** Borra la conversación entera (sus mensajes se van en cascada). El contacto se queda. */
  const eliminarChat = async (id: string) => {
    await sb.from("messages").delete().eq("conversation_id", id);
    await sb.from("conversations").delete().eq("id", id);
    setConvos((cs) => cs.filter((c) => c.id !== id));
    if (selId === id) { setSelId(null); setMessages([]); }
  };

  const nombreDe = (c: Convo | null) => c?.contact?.name || c?.contact?.wa_name || "este contacto";

  const onAccion = (c: Convo, a: AccionChat) => {
    if (a === "no_leido") return void marcarNoLeido(c.id);
    if (a === "leido") return void marcarLeido(c.id);
    if (a === "cerrar") return void cambiarEstado(c.id, "closed");
    if (a === "reabrir") return void cambiarEstado(c.id, "open");
    setPorConfirmar({ id: c.id, accion: a, quien: nombreDe(c) });
  };

  const confirmarAccion = async () => {
    if (!porConfirmar) return;
    setBorrando(true);
    try {
      if (porConfirmar.accion === "vaciar") await vaciarChat(porConfirmar.id);
      else await eliminarChat(porConfirmar.id);
    } finally {
      setBorrando(false);
      setPorConfirmar(null);
    }
  };

  /** Si el mensaje empieza con "/", lo que sigue filtra las respuestas rápidas. */
  const atajoEscrito = /^\/(\S*)$/.exec(text);
  const busquedaRapida = atajoEscrito ? atajoEscrito[1] : "";
  useEffect(() => {
    if (atajoEscrito) setRapidasAbierto(true);
    else if (busquedaRapida === "" && text !== "") setRapidasAbierto(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [text]);

  /** Mete la respuesta en el cuadro de escritura, con los datos del lead ya puestos. */
  const usarRapida = useCallback(
    async (r: RespuestaRapida) => {
      const c = sel?.contact;
      const nombre = c?.name || c?.wa_name || "";
      const cuerpo = rellenar(r.body, {
        nombre,
        primerNombre: nombre.split(/\s+/)[0] ?? "",
        telefono: c?.phone ?? "",
        empresa: (c as any)?.company ?? "",
        agente: sel?.member?.name ?? "",
      });
      setText(cuerpo);
      setRapidasAbierto(false);
      setTimeout(() => {
        cajaTexto.current?.focus();
        const n = cuerpo.length;
        cajaTexto.current?.setSelectionRange(n, n);
      }, 20);
      // Para poder ordenarlas por uso más adelante (no bloquea nada si falla)
      try { await sb.rpc("bump_quick_reply", { p_id: r.id }); } catch { /* opcional */ }
    },
    [sel, sb],
  );

  // Se cuenta sobre la lista que ya tenemos, sin pedirle nada más a la base.
  const pendientes = convos.filter((c) => !!c.handoff_requested_at).length;

  const filtered = convos.filter((c) => {
    if (filter === "solicitudes" && !c.handoff_requested_at) return false;
    if (filter === "abiertas" && c.status === "closed") return false;
    if (filter === "cerradas" && c.status !== "closed") return false;
    if (q && !(c.contact?.name ?? "").toLowerCase().includes(q.toLowerCase())) return false;
    return true;
  });

  return (
    <div className="flow-light flex flex-1 overflow-hidden">
      {/* ── Lista de conversaciones ──
          En móvil se ve una cosa a la vez: la lista, o la conversación abierta. */}
      <div
        className={`w-full flex-none flex-col border-r border-surface-border bg-surface md:flex md:w-[330px] ${
          sel ? "hidden" : "flex"
        }`}
      >
        <div className="border-b border-surface-border p-3">
          <div className="flex items-center gap-2 rounded-xl border border-surface-border bg-surface-raised px-3 py-2">
            <Search className="h-4 w-4 text-muted-2" />
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Buscar contacto…"
              className="w-full bg-transparent text-sm text-white placeholder:text-muted-2 focus:outline-none"
            />
          </div>
          <div className="mt-2 flex gap-1">
            {(["todas", "solicitudes", "abiertas", "cerradas"] as const).map((f) => (
              <button
                key={f}
                onClick={() => setFilter(f)}
                className={`flex-1 rounded-lg px-2 py-1.5 text-xs font-semibold capitalize transition ${
                  filter === f ? "bg-demandu-gradient text-white" : "text-muted hover:text-white"
                }`}
              >
                {f}
                {/* El número junto a "solicitudes": si hay gente esperando, que
                    se vea sin tener que entrar a buscarla. */}
                {f === "solicitudes" && pendientes > 0 && (
                  <span className="ml-1 rounded-full bg-pink px-1.5 text-[10px] font-bold text-white">
                    {pendientes}
                  </span>
                )}
              </button>
            ))}
          </div>
        </div>

        <div className="flex-1 overflow-auto">
          {filtered.length === 0 && <p className="p-6 text-center text-sm text-muted-2">Sin conversaciones.</p>}
          {filtered.map((c) => {
            const ch = CH[c.channel] ?? CH.webchat;
            const active = c.id === selId;
            return (
              // Es un div (no un button) porque adentro lleva el menú "⋮",
              // y un botón dentro de otro botón no es HTML válido.
              <div
                key={c.id}
                role="button"
                tabIndex={0}
                onClick={() => setSelId(c.id)}
                onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); setSelId(c.id); } }}
                className={`group flex w-full cursor-pointer items-center gap-3 border-b border-surface-border px-3.5 py-3 text-left transition hover:bg-surface-raised ${active ? "bg-surface-raised" : ""}`}
              >
                <div className="relative flex-none">
                  <div className="grid h-11 w-11 place-items-center rounded-full bg-gradient-to-br from-pink to-violet font-display text-sm font-bold text-white">
                    {initials(c.contact?.name || c.contact?.wa_name)}
                  </div>
                  <span className="absolute -bottom-0.5 -right-0.5" title={ch.label}>
                    <ChannelBadge channel={c.channel} size={17} />
                  </span>
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center justify-between gap-2">
                    <span className="flex min-w-0 items-center gap-1.5">
                      <span className="flex-none text-sm leading-none" title="País del lead">
                        {bandera(c.contact?.country ?? paisDesdeTelefono(c.contact?.phone))}
                      </span>
                      <span className="truncate text-sm font-semibold text-white">
                        {c.contact?.name || c.contact?.wa_name || "Contacto"}
                      </span>
                    </span>
                    <span className="flex flex-none items-center gap-1">
                      <span className="text-[11px] text-muted-2">{ago(c.last_message_at)}</span>
                      <ConvoMenu
                        cerrada={c.status === "closed"}
                        sinLeer={c.unread > 0}
                        onAccion={(a) => onAccion(c, a)}
                        className="-mr-1.5 opacity-0 transition group-hover:opacity-100 focus-within:opacity-100 [@media(hover:none)]:opacity-100"
                      />
                    </span>
                  </div>
                  <div className="flex items-center justify-between gap-2">
                    <span className="truncate text-xs text-muted-2">{c.member?.name ? `👤 ${c.member.name}` : "Sin asignar"}</span>
                    {c.unread > 0 && (
                      <span className="grid h-5 min-w-5 flex-none place-items-center rounded-full bg-pink px-1 text-[10px] font-bold text-white">{c.unread}</span>
                    )}
                  </div>
                  <div className="mt-1 flex flex-wrap items-center gap-1">
                    {c.handoff_requested_at && (
                      <span className="inline-flex items-center gap-1 rounded bg-pink px-1.5 py-0.5 text-[10px] font-bold text-white">
                        <Hand className="h-3 w-3" /> Pide persona
                      </span>
                    )}
                    {c.state && (
                      <span className="inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[10px] font-semibold" style={{ background: `${c.state.color}22`, color: c.state.color }}>
                        ● {c.state.name}
                      </span>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* ── Hilo de conversación ── */}
      {!sel ? (
        <div className="hidden flex-1 items-center justify-center text-center md:flex" style={{ backgroundColor: paleta.canvas }}>
          <div className="max-w-xs">
            <div className="mx-auto mb-4 grid h-14 w-14 place-items-center rounded-2xl bg-gradient-to-br from-pink/20 to-violet/20 text-2xl">💬</div>
            <h3 className="font-display text-lg font-semibold text-white">Bandeja unificada</h3>
            <p className="mt-1 text-sm text-muted-2">Selecciona una conversación para atenderla.</p>
          </div>
        </div>
      ) : (
        <div className="flex min-w-0 flex-1 flex-col" style={{ backgroundColor: paleta.canvas }}>
          {/* Header */}
          <div className="flex flex-none flex-wrap items-center gap-x-3 gap-y-2 border-b border-surface-border px-3 py-2.5 sm:flex-nowrap sm:px-4" style={{ backgroundColor: "var(--tarjeta)" }}>
            {/* Volver a la lista (solo móvil) */}
            <button
              onClick={() => setSelId(null)}
              aria-label="Volver a la lista"
              className="-ml-1 grid h-9 w-9 flex-none place-items-center rounded-xl text-muted transition hover:text-white md:hidden"
            >
              <ChevronLeft className="h-5 w-5" />
            </button>
            <div className="relative flex-none">
              <div className="grid h-9 w-9 place-items-center rounded-full bg-gradient-to-br from-pink to-violet text-xs font-bold text-white">{initials(sel.contact?.name || sel.contact?.wa_name)}</div>
              <span className="absolute -bottom-1 -right-1"><ChannelBadge channel={sel.channel} size={15} /></span>
            </div>
            <div className="min-w-0">
              <div className="truncate text-sm font-semibold text-white">
                {sel.contact?.name || sel.contact?.wa_name || "Contacto"}
              </div>
              <div className="text-[11px] text-muted-2">{(CH[sel.channel] ?? CH.webchat).label} · {sel.contact?.phone ?? "—"}</div>
            </div>
            <div className="flex w-full items-center gap-2 overflow-x-auto sm:ml-auto sm:w-auto sm:overflow-visible">
              <TraductorBoton
                idioma={idioma}
                cargando={traduciendo}
                onElegir={(code) => { setErrorTraduccion(""); setTraducciones({}); setIdioma(code); }}
                onApagar={() => { setIdioma(null); setTraducciones({}); setErrorTraduccion(""); }}
              />
              <ConvoMenu
                cerrada={sel.status === "closed"}
                sinLeer={sel.unread > 0}
                onAccion={(a) => onAccion(sel, a)}
                className="flex-none rounded-lg border border-surface-border bg-surface-raised"
              />
              {sel.status === "closed" ? (
                <button
                  onClick={() => setConvStatus("open")}
                  className="flex items-center gap-1.5 rounded-lg border border-surface-border bg-surface-raised px-2.5 py-1.5 text-xs font-semibold text-muted transition hover:text-white"
                >
                  <RotateCcw className="h-3.5 w-3.5" /> Reabrir
                </button>
              ) : (
                <button
                  onClick={() => setConvStatus("closed")}
                  className="flex items-center gap-1.5 rounded-lg border border-success/40 bg-success/10 px-2.5 py-1.5 text-xs font-semibold text-success transition hover:bg-success/20"
                >
                  <CheckCircle2 className="h-3.5 w-3.5" /> Cerrar
                </button>
              )}
              <select
                value={sel.assignee_member_id ?? ""}
                onChange={(e) => setAssignee(e.target.value)}
                className="rounded-lg border border-surface-border bg-surface-raised px-2 py-1.5 text-xs text-white focus:outline-none"
              >
                <option value="">Sin asignar</option>
                {members.map((m) => (<option key={m.id} value={m.id}>{m.name}</option>))}
              </select>
              <select
                value={sel.state_id ?? ""}
                onChange={(e) => setState(e.target.value)}
                className="rounded-lg border border-surface-border bg-surface-raised px-2 py-1.5 text-xs font-semibold text-white focus:outline-none"
              >
                <option value="">Estado…</option>
                {states.map((s) => (<option key={s.id} value={s.id}>{s.name}</option>))}
              </select>
            </div>
          </div>

          {(() => {
            /**
             * EL AVISO SOLO VALE SI FALLÓ EL ÚLTIMO ENVÍO.
             *
             * Antes se buscaba el último mensaje QUE TUVIERA el fallo, sin
             * mirar si después salió algo bien. Consecuencia: un solo mensaje
             * rechazado dejaba «WhatsApp no está entregando tus mensajes» ahí
             * para siempre — y el dueño del negocio, viendo cómo el bot
             * contestaba con normalidad, leía que su canal estaba caído.
             *
             * Pasó de verdad: el 28 ago falló un bloque de catálogo (131009,
             * porque esa cuenta no tiene catálogo de Commerce). Ese mismo día,
             * horas después, el bot mandó ocho mensajes que llegaron todos. El
             * aviso rojo seguía puesto tres días más tarde.
             *
             * Lo único que de verdad significa «no está entregando» es que
             * falló lo ÚLTIMO que se intentó mandar.
             */
            const ultimoSaliente = [...messages].reverse().find((m) => m.direction === "outbound");
            const fallo = ultimoSaliente?.payload?.no_entregado;
            if (!fallo) return null;
            return (
              <div className="flex flex-none items-start gap-2 border-b border-danger/40 bg-danger/10 px-4 py-2.5 text-xs text-ink-2">
                <AlertTriangle className="mt-0.5 h-4 w-4 flex-none text-danger" />
                <span>
                  <b className="text-danger">WhatsApp no está entregando tus mensajes.</b> {fallo.motivo}
                </span>
              </div>
            );
          })()}

          {errorTraduccion && (
            <div className="flex flex-none items-center justify-between gap-3 border-b border-warning/40 bg-warning/10 px-4 py-2 text-xs text-ink-2">
              <span>{errorTraduccion}</span>
              <button onClick={() => setErrorTraduccion("")} className="font-semibold text-ink-3 hover:text-ink">
                Cerrar
              </button>
            </div>
          )}

          {/* Mensajes (estilo WhatsApp Web · paleta Demandu) */}
          <div
            ref={bodyRef}
            className="relative flex flex-1 flex-col gap-1.5 overflow-y-auto px-[8%] py-4"
            style={{ backgroundColor: paleta.canvas, backgroundImage: paleta.doodle }}
            // Arrastrar un archivo sobre la conversación lo envía. Es el gesto
            // que la gente intenta por instinto antes de buscar el clip.
            onDragOver={(e) => { e.preventDefault(); if (!arrastrando) setArrastrando(true); }}
            onDragLeave={(e) => {
              // Solo cuando el puntero sale DE VERDAD del área: sin esto, pasar
              // por encima de cada burbuja apagaría y encendería el aviso.
              if (!e.currentTarget.contains(e.relatedTarget as Node)) setArrastrando(false);
            }}
            onDrop={(e) => {
              e.preventDefault();
              setArrastrando(false);
              const f = e.dataTransfer.files?.[0];
              if (f) subirAdjunto(f);
            }}
          >
            {arrastrando && (
              <div className="pointer-events-none absolute inset-3 z-20 grid place-items-center rounded-2xl border-2 border-dashed border-violet bg-violet/15 backdrop-blur-[1px]">
                <p className="rounded-xl bg-surface px-4 py-2 text-sm font-semibold text-white shadow-lg">
                  Suéltalo para enviarlo
                </p>
              </div>
            )}
            {cargandoMsgs && !messages.length && <EsqueletoMensajes />}
            {!cargandoMsgs && !messages.length && (
              <div className="m-auto text-center text-[13px] text-ink-3">
                Todavía no hay mensajes en esta conversación.
              </div>
            )}

            {messages.map((m) => {
              const out = m.direction === "outbound";

              // UNA LLAMADA NO ES UN MENSAJE, y pintarla como tal engaña: en la
              // burbuja de la izquierda parece que el cliente escribió «Llamada
              // recibida · 3:12». Va centrada y en gris, como lo que es — algo
              // que pasó en la conversación, no algo que alguien dijo.
              const ll = (m.payload as any)?.llamada;
              if (ll) {
                const fallida = ll.estado === "perdida" || ll.estado === "fallida" || ll.estado === "rechazada";
                return (
                  <div key={m.id} className="my-1 self-center text-center">
                    <span
                      className="inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-[12px]"
                      style={{
                        backgroundColor: fallida ? "rgba(255,111,176,.12)" : "rgba(139,102,255,.12)",
                        color: fallida ? "#FF6FB0" : "#8B66FF",
                      }}
                    >
                      {m.body}
                    </span>
                  </div>
                );
              }

              return (
                <div
                  key={m.id}
                  className={`relative max-w-[82%] px-2.5 pb-1.5 pt-1.5 text-[13.5px] leading-snug shadow-sm sm:max-w-[65%] ${
                    out ? "self-end rounded-lg rounded-tr-sm" : "self-start rounded-lg rounded-tl-sm"
                  }`}
                  style={{ backgroundColor: out ? paleta.out : paleta.in, color: out ? paleta.textOut : paleta.textIn }}
                >
                  {out && (
                    <div className="mb-0.5 flex items-center gap-1 text-[11px] font-semibold" style={{ color: m.sender === "bot" ? "#8B66FF" : "#FF6FB0" }}>
                      {m.sender === "bot" ? <><Bot className="h-3 w-3" /> Lana</> : <><User className="h-3 w-3" /> Agente</>}
                    </div>
                  )}
                  {/* Con archivo, el nombre ya sale dentro de la tarjeta del
                      adjunto: repetirlo arriba sería decir dos veces lo mismo. */}
                  {!(m.payload?.adjunto && m.body === m.payload.adjunto.nombre) && (
                    <span className="whitespace-pre-wrap break-words align-bottom">{m.body}</span>
                  )}
                  {m.payload?.adjunto && (
                    <VistaAdjunto adjunto={m.payload.adjunto} oscuro={out} />
                  )}
                  {/* Si el mensaje salió traducido, se enseña lo que el agente
                      escribió de verdad. Sin esto, el equipo leería después una
                      conversación en un idioma que quizá nadie de la casa habla
                      y no habría forma de saber qué se quiso decir. */}
                  {m.payload?.original && (
                    <span
                      className="mt-1.5 block whitespace-pre-wrap break-words border-t pt-1.5 text-[12px]"
                      style={{ borderColor: `${paleta.textOut}22`, color: paleta.textOut, opacity: 0.7 }}
                    >
                      <b className="font-semibold">Escribiste:</b> {m.payload.original}
                    </span>
                  )}
                  {idioma && traducciones[m.id] && (
                    <span
                      className="mt-1.5 block whitespace-pre-wrap break-words border-t pt-1.5 text-[12.5px] italic"
                      style={{
                        borderColor: out ? `${paleta.textOut}22` : "#00000014",
                        color: out ? paleta.textOut : paleta.textIn,
                        opacity: 0.78,
                      }}
                    >
                      {traducciones[m.id]}
                    </span>
                  )}
                  <span
                    className="ml-2 inline-flex select-none items-center gap-0.5 align-bottom text-[10px]"
                    style={{ color: out ? paleta.metaOut : "rgba(0,0,0,.42)" }}
                  >
                    {clock(m.created_at)}
                    {out && !m.payload?.no_entregado && <CheckCheck className="h-3 w-3" />}
                  </span>
                  {m.payload?.no_entregado && (
                    <span
                      className="mt-1 flex items-center gap-1 text-[10.5px] font-semibold"
                      style={{ color: "#c02b31" }}
                      title={m.payload.no_entregado.motivo}
                    >
                      <AlertTriangle className="h-3 w-3" /> No se entregó
                    </span>
                  )}
                </div>
              );
            })}
          </div>

          {/* Si el envío falló, decirlo. El texto se devuelve a la caja para
              que el agente solo tenga que volver a darle a Enviar. */}
          {errorEnvio && (
            <div className="flex-none bg-danger/10 px-4 py-2 text-xs font-semibold text-danger">
              {errorEnvio}
            </div>
          )}

          {/* Responder en el idioma del lead.
              SIEMPRE VISIBLE. La primera versión solo salía si el detector
              había encontrado otro idioma, y eso dejaba al agente sin forma de
              encenderlo cuando la detección fallaba o cuando simplemente quería
              contestar en otro idioma. Apagado ocupa un renglón discreto. */}
          {sel && (
            <ResponderEnIdioma
              idioma={sel.idioma_lead}
              activo={responderEn}
              previa={previa}
              cargando={previaCargando}
              hayTexto={!!text.trim()}
              detectado={!idiomaAMano}
              onCambiar={setResponderEn}
              onElegirIdioma={(code) => {
                sb.from("conversations").update({ idioma_lead: code }).eq("id", sel.id).then(() => {});
                setConvos((cs) => cs.map((c) => (c.id === sel.id ? { ...c, idioma_lead: code } : c)));
                setIdiomaAMano(true);
                setPrevia("");
                setResponderEn(true);
              }}
            />
          )}

                  {/* LA VENTANA DE 24 HORAS DE WHATSAPP.
              Antes el agente escribía, pulsaba enviar, y Meta lo rechazaba: se
              enteraba DESPUÉS de haber redactado. Ahora el compositor se
              bloquea y lo dice antes de que escriba una palabra.
              Solo aplica a WhatsApp — el chat de la web no tiene ventana. */}
          {sel && ventanaCerrada && (
            <div className="flex flex-none flex-wrap items-center justify-between gap-2 border-t border-surface-border px-3 py-3" style={{ backgroundColor: "var(--tarjeta)" }}>
              <p className="text-sm text-muted">
                <b className="text-white">Pasaron más de 24 horas</b> desde el último mensaje de esta persona.
                WhatsApp ya no permite escribirle libremente — solo se puede retomar con una plantilla aprobada.
              </p>
              {/* ANTES ESTO ERA UN ENLACE, y por eso no hacía lo que decía.
                  Llevaba a la pantalla de GESTIÓN de plantillas —donde se crean
                  y se mandan a aprobar—, no a mandarle una a esta persona. Y si
                  la conversación no tenía chatbot, caía a "/bots" y dejaba al
                  agente en la lista de chatbots sin ninguna explicación. Ahora
                  es lo que su texto promete: elegir una aprobada y enviarla. */}
              <button
                onClick={() => setAbrirPlantilla(true)}
                className="flex-none rounded-lg px-3 py-1.5 text-xs font-bold text-white"
                style={{ backgroundColor: "#6E42FF" }}
              >
                Enviar una plantilla
              </button>
            </div>
          )}

          {abrirPlantilla && sel && (
            <EnviarPlantilla
              conversacionId={sel.id}
              botId={sel.bot_id ?? null}
              onCerrar={() => setAbrirPlantilla(false)}
              onEnviada={(m) => {
                // El mensaje enviado entra en la conversación al momento. Sin
                // esto el agente manda la plantilla y no ve nada hasta el
                // siguiente refresco: vuelve a pulsar, y manda dos.
                if (m) setMessages((prev) => [...prev, m as Message]);
              }}
            />
          )}

  {/* Composer (estilo WhatsApp Web · Demandu) */}
          <div
            className="flex flex-none items-end gap-2 px-3 py-2.5"
            style={{ backgroundColor: "var(--tarjeta)", display: ventanaCerrada ? "none" : undefined }}
          >
            <EmojiPicker onElegir={insertarEmoji} />

            {/* Adjuntar. Es una etiqueta con un campo de archivo escondido y no
                un botón que lo abre por código: así funciona el teclado, el
                lector de pantalla y el navegador no bloquea el diálogo. */}
            <label
              title="Adjuntar archivo"
              className="mb-1 grid h-8 w-8 flex-none cursor-pointer place-items-center rounded-lg text-muted-2 transition hover:text-white"
            >
              <input
                type="file"
                className="hidden"
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  // Se limpia el valor para que elegir DOS VECES el mismo
                  // archivo vuelva a disparar el evento.
                  e.target.value = "";
                  if (f) subirAdjunto(f);
                }}
              />
              {subiendo ? (
                <span className="h-4 w-4 animate-spin rounded-full border-2 border-white/30 border-t-white" />
              ) : (
                <Paperclip className="h-5 w-5" />
              )}
            </label>
            <RespuestasRapidas
              respuestas={quickReplies}
              abierto={rapidasAbierto}
              busqueda={busquedaRapida}
              onAbrir={() => setRapidasAbierto(true)}
              onCerrar={() => setRapidasAbierto(false)}
              onElegir={usarRapida}
            />
            <textarea
              ref={cajaTexto}
              value={text}
              onChange={(e) => { setText(e.target.value); avisarQueEscribo(); }}
              onKeyDown={(e) => {
                // Con el selector abierto, Enter elige la respuesta (no envía).
                if (rapidasAbierto && ["Enter", "Tab", "ArrowUp", "ArrowDown", "Escape"].includes(e.key)) return;
                if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send(); }
              }}
              rows={1}
              placeholder="Escribe un mensaje  ·  / para respuestas rápidas"
              className="max-h-32 min-h-[42px] flex-1 resize-none rounded-lg bg-surface-raised px-3.5 py-2.5 text-sm text-white placeholder:text-muted-2 focus:outline-none"
            />
            <button
              onClick={send}
              disabled={!text.trim()}
              className="grid h-[42px] w-[42px] flex-none place-items-center rounded-full text-white transition disabled:opacity-50"
              style={{ backgroundColor: "#6E42FF", color: "#fff" }}
            >
              <Send className="h-5 w-5" />
            </button>
          </div>
        </div>
      )}

      {/* ── Ficha del lead ── */}
      {sel?.contact && (
        <div className="hidden w-[320px] flex-none flex-col overflow-auto border-l border-surface-border bg-surface p-4 xl:flex">
          <ContactPanel
            contact={sel.contact as any}
            canal={(CH[sel.channel] ?? CH.webchat).label}
            agente={sel.member?.name}
            tags={tags}
            attrs={attrs}
            orgId={orgId}
            onPatch={(patch) =>
              setConvos((cs) => cs.map((c) => (c.id === sel.id ? { ...c, contact: { ...c.contact!, ...patch } as any } : c)))
            }
            onToggleTag={toggleTag}
          />
        </div>
      )}

      <Confirm
        abierto={!!porConfirmar}
        ocupado={borrando}
        titulo={porConfirmar?.accion === "vaciar" ? "¿Vaciar los mensajes?" : "¿Eliminar este chat?"}
        detalle={
          porConfirmar?.accion === "vaciar" ? (
            <>
              Se borran todos los mensajes de la conversación con{" "}
              <b className="text-ink">{porConfirmar?.quien}</b>, pero la conversación y el contacto se quedan. Esto no
              se puede deshacer.
            </>
          ) : (
            <>
              Se borra la conversación con <b className="text-ink">{porConfirmar?.quien}</b> y todos sus mensajes.{" "}
              <b className="text-ink">El contacto se queda</b> en tu lista. Si te vuelve a escribir, se abre una
              conversación nueva. Esto no se puede deshacer.
            </>
          )
        }
        confirmar={porConfirmar?.accion === "vaciar" ? "Sí, vaciar" : "Sí, eliminar"}
        onConfirmar={confirmarAccion}
        onCancelar={() => setPorConfirmar(null)}
      />
    </div>
  );
}

/**
 * Esqueleto de la charla mientras cargan los mensajes.
 *
 * Existe porque el panel se quedaba en blanco varios segundos al abrir una
 * conversación y se leía como "esta conversación está vacía" o "se rompió".
 * Imita la forma real —burbujas alternadas de anchos distintos— para que el
 * ojo entienda que viene una charla, no un error.
 */
function EsqueletoMensajes() {
  const formas = [
    { out: false, ancho: "58%" },
    { out: true, ancho: "44%" },
    { out: false, ancho: "70%" },
    { out: true, ancho: "52%" },
  ];
  return (
    <div className="flex flex-col gap-1.5" aria-label="Cargando mensajes" aria-busy="true">
      {formas.map((f, i) => (
        <div
          key={i}
          className={`h-9 animate-pulse rounded-lg bg-white/60 ${f.out ? "self-end" : "self-start"}`}
          style={{ width: f.ancho, animationDelay: `${i * 90}ms` }}
        />
      ))}
    </div>
  );
}
