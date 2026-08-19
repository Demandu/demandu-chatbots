/**
 * Pruebas del MOTOR de conversación (el que decide qué contesta el chatbot).
 *
 * Se ejecuta el motor de verdad — `src/lib/flow/webRuntime.ts` — contra una
 * base de datos simulada, así se prueba el comportamiento real sin tocar
 * datos de nadie ni depender de WhatsApp.
 *
 *   node --experimental-strip-types scripts/pruebas/motor.mjs
 */
import { describe, testAsync, esperar, correrPruebas } from "./_runner.mjs";
import { runWebFlow } from "../../src/lib/flow/webRuntime.ts";

// ─── Base de datos falsa ─────────────────────────────────────────────────────
/**
 * Imita lo justo del cliente de Supabase que usa el motor: guarda en memoria y
 * responde a las mismas cadenas (`insert().select().single()`, `update().eq()`,
 * `select().eq().is()`). Se hizo así para poder probar de verdad el registro de
 * recorridos de flujo, que es lo que alimenta la pantalla de Resultados.
 */
function baseFalsa() {
  const tablas = { conversations: [], messages: [], flow_runs: [] };
  const escrituras = { conversations: [], messages: [], flow_runs: [] };
  let seq = 0;

  function from(tabla) {
    const st = { op: null, patch: null, filas: null, filtros: [], single: false };
    const store = tablas[tabla] ?? (tablas[tabla] = []);
    const coincide = (r) => st.filtros.every(([k, v]) => (r[k] ?? null) === v);

    const resolver = () => {
      if (st.op === "insert") {
        const nuevas = st.filas.map((f) => ({ id: `${tabla}-${++seq}`, steps: 0, ...f }));
        store.push(...nuevas);
        escrituras[tabla]?.push(...st.filas);
        return { data: st.single ? nuevas[0] : nuevas, error: null };
      }
      if (st.op === "update") {
        const tocadas = store.filter(coincide);
        for (const r of tocadas) Object.assign(r, st.patch);
        escrituras[tabla]?.push({ __update: st.patch });
        return { data: tocadas, error: null };
      }
      const halladas = store.filter(coincide);
      return { data: st.single ? (halladas[0] ?? null) : halladas, error: null };
    };

    const q = {
      insert(filas) { st.op = "insert"; st.filas = Array.isArray(filas) ? filas : [filas]; return q; },
      update(patch) { st.op = "update"; st.patch = patch; return q; },
      delete() { st.op = "delete"; return q; },
      select() { if (!st.op) st.op = "select"; return q; },
      single() { st.single = true; return q; },
      maybeSingle() { st.single = true; return q; },
      eq(k, v) { st.filtros.push([k, v]); return q; },
      is(k, v) { st.filtros.push([k, v]); return q; },
      order() { return q; },
      limit() { return q; },
      then(ok, mal) { return Promise.resolve(resolver()).then(ok, mal); },
    };
    return q;
  }

  return { api: { from }, escrituras, tablas };
}

// ─── Un flujo de ejemplo, como el que arma un cliente ────────────────────────
const FLUJO = {
  id: "f1",
  name: "Bienvenida",
  nodes: [
    { id: "n1", type: "message", position: { x: 0, y: 0 }, data: { label: "Mensaje", text: "¡Hola {{nombre}}! Soy Lana 👩🏻‍💼", isStart: true } },
    { id: "n2", type: "buttons", position: { x: 0, y: 1 }, data: { label: "Botones", text: "¿Qué necesitas?", buttons: [
      { id: "b1", label: "Precios" },
      { id: "b2", label: "Soporte" },
    ] } },
    { id: "n3", type: "message", position: { x: 0, y: 2 }, data: { label: "Mensaje", text: "Nuestros planes van de $59 a $179." } },
    { id: "n4", type: "message", position: { x: 0, y: 3 }, data: { label: "Mensaje", text: "Cuéntame qué problema tienes." } },
    { id: "n5", type: "media", position: { x: 0, y: 4 }, data: { label: "Multimedia", text: "Imagen, video o archivo", caption: "Mira nuestro catálogo", mediaUrl: "https://ejemplo.com/foto.jpg", mediaType: "image" } },
  ],
  edges: [
    { id: "e1", source: "n1", target: "n2" },
    { id: "e2", source: "n2", target: "n3", sourceHandle: "b1" },
    { id: "e3", source: "n2", target: "n4", sourceHandle: "b2" },
  ],
};

/** Corre el motor y devuelve los textos que el bot habría enviado. */
async function correr({ texto = "", estado = {}, isStart = false, atajos = null, flujo = FLUJO, iaDeRespaldo = true } = {}) {
  const { api, escrituras, tablas } = baseFalsa();
  const r = await runWebFlow({
    flow: flujo,
    orgId: "org-1",
    conversationId: "conv-1",
    admin: api,
    flowState: estado,
    text: texto,
    isStart,
    botId: "bot-1",
    aiSettings: null,
    atajos,
    flowName: flujo.name ?? null,
    iaDeRespaldo,
  });
  return { ...r, textos: r.out.map((m) => m.text), escrituras, tablas };
}

describe("Motor: primera conversación", () => {
  testAsync("saluda y muestra el menú", async () => {
    const r = await correr({ isStart: true });
    esperar(r.textos[0]).contiene("Soy Lana");
    esperar(r.textos.some((t) => t.includes("¿Qué necesitas?"))).verdadero("debe mostrar el menú");
    esperar(r.awaiting?.type).igual("buttons", "debe quedarse esperando la opción");
  });

  testAsync("NUNCA envía el texto de ejemplo de un bloque sin configurar", async () => {
    const soloEjemplo = {
      ...FLUJO,
      nodes: [{ id: "x", type: "message", position: { x: 0, y: 0 }, data: { label: "Mensaje", text: "Texto simple", isStart: true } }],
      edges: [],
    };
    const r = await correr({ isStart: true, flujo: soloEjemplo });
    esperar(r.textos.join(" ")).noContiene("Texto simple", "se filtró el texto de ejemplo al cliente");
  });

  testAsync("el bloque de multimedia no manda su descripción", async () => {
    const conMedia = {
      ...FLUJO,
      nodes: [FLUJO.nodes.find((n) => n.id === "n5")].map((n) => ({ ...n, data: { ...n.data, isStart: true } })),
      edges: [],
    };
    const r = await correr({ isStart: true, flujo: conMedia });
    esperar(r.textos.join(" ")).noContiene("Imagen, video o archivo");
    esperar(r.textos.join(" ")).contiene("catálogo", "sí debe mandar el texto configurado");
  });
});

describe("Motor: el lead elige una opción", () => {
  testAsync("tocar 'Precios' lleva a la rama correcta", async () => {
    const estado = { awaiting: { nodeId: "n2", type: "buttons" }, hintEnviado: true };
    const r = await correr({ texto: "b1", estado });
    esperar(r.textos.join(" ")).contiene("$59");
  });

  testAsync("escribir el nombre de la opción también funciona", async () => {
    const estado = { awaiting: { nodeId: "n2", type: "buttons" }, hintEnviado: true };
    const r = await correr({ texto: "Soporte", estado });
    esperar(r.textos.join(" ")).contiene("qué problema tienes");
  });

  testAsync("responder cualquier otra cosa NO deja al bot mudo", async () => {
    const estado = { awaiting: { nodeId: "n2", type: "buttons" }, hintEnviado: true };
    const r = await correr({ texto: "aaaa", estado });
    esperar(r.textos.length).mayorQue(0, "el bot se quedó callado y el lead queda atorado");
  });
});

describe("Motor: atajos", () => {
  const estadoAMedias = { awaiting: { nodeId: "n2", type: "buttons" }, vars: {}, hintEnviado: true };

  testAsync("'0' vuelve al inicio aunque esté esperando otra cosa", async () => {
    const r = await correr({ texto: "0", estado: estadoAMedias });
    esperar(r.textos[0]).contiene("empezamos de nuevo");
    esperar(r.textos.join(" ")).contiene("Soy Lana", "debe volver a saludar");
  });

  testAsync("'1' calla al bot y marca la solicitud de persona", async () => {
    const r = await correr({ texto: "1", estado: estadoAMedias });
    esperar(r.textos[0]).contiene("una persona del equipo");
    esperar(r.awaiting).igual(null, "el bot debe dejar de conducir");
    const upd = r.escrituras.conversations.find((x) => x.__update?.handoff_requested_at);
    esperar(!!upd).verdadero("no se registró la solicitud de agente");
    esperar(upd.__update.status).igual("assigned");
  });

  testAsync("el recordatorio sale UNA vez, no en cada mensaje", async () => {
    const primera = await correr({ isStart: true, estado: {} });
    esperar(primera.textos.join(" ")).contiene("para volver al inicio");
    esperar(primera.hintEnviado).verdadero();

    const segunda = await correr({ texto: "b1", estado: { awaiting: { nodeId: "n2", type: "buttons" }, hintEnviado: true } });
    esperar(segunda.textos.join(" ")).noContiene("para volver al inicio", "se repitió el recordatorio");
  });

  testAsync("con los atajos apagados, '0' es un mensaje normal", async () => {
    const apagados = { reset: { enabled: false }, agent: { enabled: false }, hint: { enabled: false } };
    const r = await correr({ texto: "0", estado: estadoAMedias, atajos: apagados });
    esperar(r.textos.join(" ")).noContiene("empezamos de nuevo");
  });
});

describe("Motor: lo que se guarda en la Bandeja", () => {
  testAsync("cada respuesta del bot queda registrada", async () => {
    const r = await correr({ isStart: true });
    esperar(r.escrituras.messages.length).mayorQue(0, "el bot contestó pero no quedó en la Bandeja");
    esperar(r.escrituras.messages.every((m) => m.payload !== null && m.payload !== undefined)).verdadero(
      "payload en null invalida el insert completo — este bug ya nos costó una vez",
    );
    esperar(r.escrituras.messages.every((m) => m.org_id === "org-1")).verdadero("falta la organización");
  });

  testAsync("los botones se guardan para poder verlos después", async () => {
    const r = await correr({ isStart: true });
    const conBotones = r.escrituras.messages.find((m) => m.payload?.buttons);
    esperar(!!conBotones).verdadero();
    esperar(conBotones.payload.buttons.length).igual(2);
  });
});

describe("Motor: variables en los mensajes", () => {
  testAsync("{{nombre}} se reemplaza con el dato real", async () => {
    const r = await correr({ isStart: true, estado: { vars: { nombre: "Alex" } } });
    esperar(r.textos[0]).contiene("¡Hola Alex!");
  });

  testAsync("si no hay nombre, no queda 'Hola !'", async () => {
    const r = await correr({ isStart: true, estado: { vars: {} } });
    esperar(r.textos[0]).noContiene(" !");
    esperar(r.textos[0]).contiene("Hola");
  });
});

describe("Motor: no se cuelga", () => {
  testAsync("un flujo en círculo se detiene solo", async () => {
    const circular = {
      id: "f2", name: "Bucle",
      nodes: [
        { id: "a", type: "message", position: { x: 0, y: 0 }, data: { label: "a", text: "uno", isStart: true } },
        { id: "b", type: "message", position: { x: 0, y: 1 }, data: { label: "b", text: "dos" } },
      ],
      edges: [{ id: "e1", source: "a", target: "b" }, { id: "e2", source: "b", target: "a" }],
    };
    const r = await correr({ isStart: true, flujo: circular });
    esperar(r.textos.length).mayorQue(0);
    esperar(r.textos.length < 200).verdadero("el motor no cortó el bucle");
  });

  testAsync("un flujo vacío no revienta", async () => {
    const r = await correr({ isStart: true, flujo: { id: "f3", name: "Vacío", nodes: [], edges: [] } });
    esperar(r.textos.length).igual(0);
  });
});

// ─── Recorridos de flujo (lo que alimenta "qué flujo es más efectivo") ───────
describe("Motor: registro de recorridos", () => {
  testAsync("al empezar se abre un recorrido con el nombre del flujo", async () => {
    const r = await correr({ isStart: true });
    esperar(r.tablas.flow_runs.length).igual(1, "debería haberse abierto exactamente uno");
    const rec = r.tablas.flow_runs[0];
    esperar(rec.flow_name).igual("Bienvenida");
    esperar(rec.flow_id).igual("f1");
    esperar(rec.channel).igual("webchat");
    esperar(rec.ended_at ?? null).igual(null, "sigue abierto: el bot está esperando la opción");
    esperar(r.runId).igual(rec.id, "el id vuelve para guardarlo en la conversación");
  });

  testAsync("llegar al final del flujo lo cierra como completado", async () => {
    // Se simula el turno siguiente: el lead ya tocó "Precios" y n3 no tiene salida.
    const { api, tablas } = baseFalsa();
    const abierto = { id: "flow_runs-0", steps: 2, org_id: "org-1" };
    tablas.flow_runs.push(abierto);
    const r = await runWebFlow({
      flow: FLUJO, orgId: "org-1", conversationId: "conv-1", admin: api,
      flowState: { awaiting: { nodeId: "n2", type: "buttons" }, run_id: abierto.id },
      text: "b1", botId: "bot-1", flowName: "Bienvenida",
    });
    esperar(abierto.ended_reason).igual("completado");
    esperar(!!abierto.ended_at).verdadero("debe quedar con fecha de fin");
    esperar(abierto.steps).mayorQue(2, "debe sumar los bloques de este turno");
    esperar(r.runId ?? null).igual(null, "ya no hay recorrido abierto");
  });

  testAsync("pedir una persona cierra el recorrido como 'agente'", async () => {
    const { api, tablas } = baseFalsa();
    const abierto = { id: "flow_runs-0", steps: 1 };
    tablas.flow_runs.push(abierto);
    const r = await runWebFlow({
      flow: FLUJO, orgId: "org-1", conversationId: "conv-1", admin: api,
      flowState: { awaiting: { nodeId: "n2", type: "buttons" }, run_id: abierto.id },
      text: "1", botId: "bot-1", flowName: "Bienvenida",
    });
    esperar(abierto.ended_reason).igual("agente");
    esperar(r.runId ?? null).igual(null);
  });

  testAsync("reiniciar cierra el anterior y abre uno nuevo", async () => {
    const { api, tablas } = baseFalsa();
    const abierto = { id: "flow_runs-0", steps: 4 };
    tablas.flow_runs.push(abierto);
    await runWebFlow({
      flow: FLUJO, orgId: "org-1", conversationId: "conv-1", admin: api,
      flowState: { awaiting: { nodeId: "n2", type: "buttons" }, run_id: abierto.id },
      text: "0", botId: "bot-1", flowName: "Bienvenida",
    });
    esperar(abierto.ended_reason).igual("reiniciado", "el recorrido viejo no se mezcla con el nuevo");
    esperar(tablas.flow_runs.length).igual(2, "debe haber uno nuevo");
    esperar(tablas.flow_runs[1].ended_at ?? null).igual(null, "el nuevo queda abierto en el menú");
  });

  testAsync("se cuentan los bloques que recorrió el lead", async () => {
    const r = await correr({ isStart: true });
    // n1 (mensaje) + n2 (botones) = 2
    esperar(r.tablas.flow_runs[0].steps).igual(2);
  });

  testAsync("si la analítica falla, el bot contesta igual", async () => {
    // Es la regla de oro: medir nunca puede tumbar una conversación.
    const { api } = baseFalsa();
    const rota = {
      from(tabla) {
        if (tabla === "flow_runs") throw new Error("base caída");
        return api.from(tabla);
      },
    };
    const r = await runWebFlow({
      flow: FLUJO, orgId: "org-1", conversationId: "conv-1", admin: rota,
      flowState: {}, text: "", isStart: true, botId: "bot-1", flowName: "Bienvenida",
    });
    esperar(r.out.length).mayorQue(0, "el bot tiene que responder aunque no se pueda medir");
    esperar(r.out[0].text).contiene("Soy Lana");
  });
});

// ─── El cliente se sale del flujo (el fallo que se vio en producción) ───────
describe("Motor: el cliente se sale del flujo", () => {
  // Flujo de una sola caja, sin salida: exactamente el que tenía el bot web.
  const SOLO_SALUDO = {
    id: "f9", name: "Bienvenida",
    nodes: [{ id: "s1", type: "message", position: { x: 0, y: 0 },
      data: { label: "Mensaje", text: "¡Hola! 👋 ¿En qué te puedo ayudar?", isStart: true } }],
    edges: [],
  };

  testAsync("con el flujo terminado, NO vuelve a soltar el saludo", async () => {
    // Lo que pasaba: "hola" → saludo; "¿para qué sirves?" → el mismo saludo.
    // La IA no está configurada en las pruebas, así que lo que se comprueba es
    // que al menos deje de repetirse.
    const r = await correr({
      flujo: SOLO_SALUDO,
      texto: "para que sirves?",
      estado: { vars: {}, awaiting: null, terminado: true },
    });
    esperar(r.textos.some((t) => t.includes("¿En qué te puedo ayudar?"))).falso(
      "volvió a mandar el saludo: el bot se repite como perico",
    );
  });

  testAsync("el primer mensaje sí lo contesta el flujo", async () => {
    const r = await correr({ flujo: SOLO_SALUDO, isStart: true });
    esperar(r.textos.some((t) => t.includes("¿En qué te puedo ayudar?"))).verdadero();
    esperar(r.terminado).verdadero("el flujo no espera nada: queda marcado como terminado");
  });

  testAsync("con la IA de respaldo apagada, se conserva el comportamiento viejo", async () => {
    // Quien ya tenía su flujo armado no debe ver un cambio que no pidió.
    const r = await correr({
      flujo: SOLO_SALUDO,
      texto: "para que sirves?",
      estado: { vars: {}, awaiting: null, terminado: true },
      iaDeRespaldo: false,
    });
    esperar(r.textos.some((t) => t.includes("¿En qué te puedo ayudar?"))).verdadero(
      "apagada, el motor debe seguir reiniciando el flujo como antes",
    );
  });

  testAsync("responder una opción válida sigue funcionando igual", async () => {
    const r = await correr({ texto: "b1", estado: { awaiting: { nodeId: "n2", type: "buttons" } } });
    esperar(r.textos.join(" ")).contiene("$59");
  });
});

process.exit(await correrPruebas());
