/**
 * Revisión estática del código.
 *
 * En este entorno no se puede instalar TypeScript, así que estas reglas
 * cubren a mano los errores que un compilador atraparía — y además varias
 * trampas propias de este proyecto que YA nos costaron un bug en producción.
 * Cada regla existe porque algo se rompió de verdad.
 *
 *   node --experimental-strip-types scripts/pruebas/correr.mjs scripts/pruebas/estatico.mjs
 */
import fs from "node:fs";
import path from "node:path";
import { describe, test, esperar, correrPruebas } from "./_runner.mjs";

const RAIZ = path.resolve(import.meta.dirname, "../..");
const SRC = path.join(RAIZ, "src");

function listar(dir, filtro = /\.(ts|tsx)$/) {
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const p = path.join(dir, e.name);
    return e.isDirectory() ? listar(p, filtro) : filtro.test(e.name) ? [p] : [];
  });
}
const ARCHIVOS = listar(SRC).map((f) => ({ ruta: path.relative(RAIZ, f), texto: fs.readFileSync(f, "utf8") }));
const sinComentarios = (t) => t.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");

// ─── Imports ─────────────────────────────────────────────────────────────────
describe("Imports", () => {
  test("todo lo que se importa existe en el disco", () => {
    const rotos = [];
    for (const { ruta, texto } of ARCHIVOS) {
      for (const m of texto.matchAll(/from\s+["'](@\/[^"']+|\.[^"']+)["']/g)) {
        const spec = m[1];
        const base = spec.startsWith("@/")
          ? path.join(SRC, spec.slice(2))
          : path.resolve(RAIZ, path.dirname(ruta), spec);
        const existe = [".ts", ".tsx", ".js", ".json", "/index.ts", "/index.tsx", ""].some((ext) =>
          fs.existsSync(base + ext),
        );
        if (!existe) rotos.push(`${ruta} → ${spec}`);
      }
    }
    esperar(rotos).igual([], "imports que apuntan a archivos que no existen");
  });

  test("los símbolos importados existen en el archivo de origen", () => {
    const rotos = [];
    for (const { ruta, texto } of ARCHIVOS) {
      for (const m of texto.matchAll(/import\s*\{([^}]+)\}\s*from\s+["'](@\/[^"']+|\.[^"']+)["']/g)) {
        const spec = m[2];
        const base = spec.startsWith("@/")
          ? path.join(SRC, spec.slice(2))
          : path.resolve(RAIZ, path.dirname(ruta), spec);
        const destino = [".ts", ".tsx", "/index.ts", "/index.tsx"].map((e) => base + e).find((p) => fs.existsSync(p));
        if (!destino) continue;
        const fuente = fs.readFileSync(destino, "utf8");
        for (let nombre of m[1].split(",")) {
          nombre = nombre.trim().replace(/^type\s+/, "").split(/\s+as\s+/)[0].trim();
          if (!nombre) continue;
          const declarado = new RegExp(
            `export\\s+(async\\s+)?(function|const|let|var|class|type|interface|enum)\\s+${nombre}\\b|` +
            `export\\s*\\{[^}]*\\b${nombre}\\b|export\\s+default`,
          ).test(fuente);
          if (!declarado) rotos.push(`${ruta} importa "${nombre}" de ${spec}, que no lo exporta`);
        }
      }
    }
    esperar(rotos).igual([], "símbolos importados que no existen");
  });
});

// ─── Trampas de Next.js ──────────────────────────────────────────────────────
describe("Reglas de Next.js", () => {
  test("los archivos con 'use server' solo exportan funciones asíncronas", () => {
    const malos = [];
    for (const { ruta, texto } of ARCHIVOS) {
      if (!/^\s*["']use server["']/m.test(texto)) continue;
      for (const m of texto.matchAll(/^export\s+(?!async\s+function)(const|let|var|function|class)\s+(\w+)/gm)) {
        malos.push(`${ruta} exporta "${m[2]}" y no es una función asíncrona`);
      }
    }
    esperar(malos).igual([], "Next exige que todo export de un archivo 'use server' sea async function");
  });

  test("quien usa useSearchParams está en una página dinámica", () => {
    // Si no, Next falla al compilar pidiendo un <Suspense>.
    const clientes = ARCHIVOS.filter((a) => a.texto.includes("useSearchParams"));
    const sinProteger = [];
    for (const c of clientes) {
      // Buscamos la página que lo usa, subiendo por quien lo importa
      const nombre = path.basename(c.ruta).replace(/\.tsx?$/, "");
      const usadoPor = ARCHIVOS.filter((a) => a.texto.includes(`/${nombre}"`) || a.texto.includes(`/${nombre}'`));
      const paginas = usadoPor.filter((a) => /\/page\.tsx$/.test(a.ruta));
      for (const p of paginas) {
        if (!/export const dynamic\s*=\s*["']force-dynamic["']/.test(p.texto)) {
          sinProteger.push(`${p.ruta} usa ${nombre} (useSearchParams) sin force-dynamic`);
        }
      }
    }
    esperar(sinProteger).igual([], "faltó force-dynamic");
  });

  test("no se mezclan ?? y || sin paréntesis (error de compilación)", () => {
    const malos = [];
    for (const { ruta, texto } of ARCHIVOS) {
      const t = sinComentarios(texto);
      // ?? seguido de || (o al revés) en la misma expresión, sin paréntesis entre medias
      if (/\?\?[^;()\n]*\|\||\|\|[^;()\n]*\?\?/.test(t)) {
        const linea = t.split("\n").findIndex((l) => /\?\?.*\|\||\|\|.*\?\?/.test(l) && !/[()]/.test(l));
        if (linea >= 0) malos.push(`${ruta}:${linea + 1}`);
      }
    }
    esperar(malos).igual([], "mezclar ?? con || sin paréntesis no compila");
  });
});

// ─── Trampas propias de este proyecto ────────────────────────────────────────
describe("Trampas que ya nos costaron un bug", () => {
  test("ningún botón dentro de un <form> se envía sin querer", () => {
    // Un <button> sin type dentro de un formulario es type="submit".
    // Nos pasó en la ventana de confirmación: "Cancelar" enviaba el formulario.
    const sospechosos = [];
    for (const { ruta, texto } of ARCHIVOS) {
      if (!/<form/.test(texto)) continue;
      for (const m of texto.matchAll(/<button(?![^>]*\btype=)[^>]*onClick/g)) {
        const antes = texto.slice(0, m.index);
        // Solo nos importa si ese botón está dentro de un <form>
        if ((antes.match(/<form/g) || []).length > (antes.match(/<\/form>/g) || []).length) {
          sospechosos.push(`${ruta} — botón con onClick sin type="button" dentro de un <form>`);
        }
      }
    }
    esperar(sospechosos).igual([], "añade type=\"button\"");
  });

  test("nadie manda payload: null a la tabla de mensajes", () => {
    // `payload` es NOT NULL con default '{}'. Mandar null invalida el insert
    // completo en silencio: el bot "contesta" y no queda registro.
    const malos = ARCHIVOS.filter((a) => /payload:\s*null/.test(sinComentarios(a.texto))).map((a) => a.ruta);
    esperar(malos).igual([], "usa {} en vez de null");
  });

  test("ninguna pantalla usa min-h-full dentro del marco (corta el scroll)", () => {
    // El marco mide 100dvh; pedir además "100% de alto" desborda por el alto
    // de la barra superior y el final de la página queda cortado.
    const malos = ARCHIVOS.filter((a) => /min-h-full/.test(a.texto)).map((a) => a.ruta);
    esperar(malos).igual([], "usa min-h-0 flex-1 overflow-auto");
  });

  test("la lista de textos de ejemplo está en los DOS motores", () => {
    const web = fs.readFileSync(path.join(SRC, "lib/flow/webRuntime.ts"), "utf8");
    const wa = fs.readFileSync(path.join(RAIZ, "supabase/functions/whatsapp/index.ts"), "utf8");
    const sacar = (t) => {
      const m = t.match(/const PLACEHOLDERS = new Set\(\[([\s\S]*?)\]\)/);
      return m ? (m[1].match(/"[^"]+"/g) ?? []).sort() : null;
    };
    const a = sacar(web);
    const b = sacar(wa);
    esperar(!!a && !!b).verdadero("no encontré la lista en alguno de los dos motores");
    esperar(a.length).igual(b.length, "las dos listas deben tener lo mismo: si agregas un componente, va en ambas");
  });

  test("los atajos se comportan igual en los dos motores", () => {
    const wa = fs.readFileSync(path.join(RAIZ, "supabase/functions/whatsapp/index.ts"), "utf8");
    const web = fs.readFileSync(path.join(SRC, "lib/flow/shortcuts.ts"), "utf8");
    for (const clave of ["reset", "agent", "hint"]) {
      esperar(wa.includes(`${clave}:`)).verdadero(`falta "${clave}" en el motor de WhatsApp`);
      esperar(web.includes(`${clave}:`)).verdadero(`falta "${clave}" en el motor web`);
    }
    // Ambos limpian signos al principio Y al final
    esperar(/\^\[\\u00a1!\\u00bf\?\.,;:\\s\]\+/.test(wa) || /\^\[¡!¿\?\.,;:\\s\]\+/.test(wa)).verdadero(
      "el motor de WhatsApp no limpia los signos del principio (¡0! no activaría el atajo)",
    );
  });

  test("nadie escribe claves ni tokens en el código", () => {
    const patrones = [
      /sk-[a-zA-Z0-9]{20,}/,           // Anthropic / OpenAI
      /EAA[a-zA-Z0-9]{40,}/,           // Meta
      /eyJ[A-Za-z0-9_-]{30,}\.[A-Za-z0-9_-]{30,}\./, // JWT de servicio
      /pa-[a-zA-Z0-9]{20,}/,           // Voyage
    ];
    const malos = [];
    for (const { ruta, texto } of ARCHIVOS) {
      for (const p of patrones) if (p.test(texto)) malos.push(`${ruta} parece traer una clave escrita a mano`);
    }
    esperar(malos).igual([], "las claves van en variables de entorno, nunca en el código");
  });

  test("la clave de servicio nunca se usa en un componente del navegador", () => {
    const malos = ARCHIVOS.filter(
      (a) => /^\s*["']use client["']/m.test(a.texto) && /SERVICE_ROLE|createAdminClient/.test(a.texto),
    ).map((a) => a.ruta);
    esperar(malos).igual([], "el cliente con permisos elevados SOLO va en el servidor");
  });
});

// ─── Contraste del área clara ────────────────────────────────────────────────
describe("Contraste del tema claro", () => {
  test("los estados :hover tienen su equivalente claro", () => {
    const css = fs.readFileSync(path.join(SRC, "app/globals.css"), "utf8");
    const usados = new Set();
    for (const { texto } of ARCHIVOS) {
      for (const m of texto.matchAll(/hover:(text-white|bg-surface-raised|bg-surface-card|bg-surface)\b/g)) {
        usados.add(m[1]);
      }
    }
    const sinCubrir = [...usados].filter((u) => !css.includes(`.flow-light .hover\\:${u}:hover`));
    esperar(sinCubrir).igual([], "esas clases se vuelven ilegibles sobre el fondo claro de la Bandeja");
  });
});

// ─── Analítica ───────────────────────────────────────────────────────────────
describe("Registro de recorridos de flujo", () => {
  test("los motivos de fin son los MISMOS en los dos motores y en la base", () => {
    // Si se desincronizan, la base rechaza el renglón (hay un CHECK) y se
    // pierde la medición en silencio, justo la que alimenta "qué flujo
    // funciona mejor". Por eso se vigila desde aquí.
    const lib = fs.readFileSync(path.join(SRC, "lib/flow/flowRuns.ts"), "utf8");
    const wa = fs.readFileSync(path.join(RAIZ, "supabase/functions/whatsapp/index.ts"), "utf8");
    const sql = fs.readFileSync(path.join(RAIZ, "supabase/migrations/0011_analitica.sql"), "utf8");

    const enLib = (lib.match(/MOTIVOS_FIN: MotivoFin\[\] = \[([^\]]+)\]/)?.[1] ?? "")
      .match(/"[^"]+"/g)?.map((x) => x.slice(1, -1)).sort() ?? [];
    esperar(enLib.length).mayorQue(2, "no encontré la lista de motivos en flowRuns.ts");

    const faltanEnWa = enLib.filter((m) => !wa.includes(`"${m}"`));
    esperar(faltanEnWa).igual([], "el motor de WhatsApp no usa esos motivos");

    const enSql = (sql.match(/ended_reason in \(([^)]+)\)/)?.[1] ?? "")
      .match(/'[^']+'/g)?.map((x) => x.slice(1, -1)).sort() ?? [];
    esperar(enSql).igual(enLib, "la base acepta otros motivos que los que escriben los motores");
  });

  test("medir nunca lanza: todo el registro va en try/catch", () => {
    // La regla de oro: si la analítica falla, el bot tiene que seguir
    // contestando. Un `await` suelto ahí tumbaría la conversación.
    const lib = fs.readFileSync(path.join(SRC, "lib/flow/flowRuns.ts"), "utf8");
    for (const fn of ["abrirRecorrido", "avanzarRecorrido", "cerrarRecorrido"]) {
      const cuerpo = lib.slice(lib.indexOf(`function ${fn}`));
      const hasta = cuerpo.indexOf("\n}");
      esperar(cuerpo.slice(0, hasta).includes("try {")).verdadero(`${fn} no está protegida`);
    }
  });
});

describe("Motor de WhatsApp desplegado", () => {
  test("el archivo del repo declara su versión, para poder comparar con producción", () => {
    const wa = fs.readFileSync(path.join(RAIZ, "supabase/functions/whatsapp/index.ts"), "utf8");
    esperar(/const VERSION_MOTOR = "[^"]+"/.test(wa)).verdadero(
      "el motor debe declarar VERSION_MOTOR para saber si lo desplegado coincide con el repo",
    );
  });
});

// ─── El agente le escribe al visitante web ───────────────────────────────────
describe("Lo que escribe el agente llega al chat web", () => {
  // EL BUG: el widget solo hablaba cuando le hablaban. Devolvía la respuesta
  // del bot de ESE turno y nada más. Cuando un agente tomaba la conversación y
  // escribía desde la Bandeja, el mensaje NUNCA llegaba al visitante — al que
  // además se le acababa de prometer "un asesor continuará contigo por aquí".
  const wid = fs.readFileSync(path.join(RAIZ, "public/widget.js"), "utf8");
  const ruta = fs.readFileSync(path.join(SRC, "app/api/webchat/route.ts"), "utf8");

  test("el widget pregunta por mensajes nuevos", () => {
    esperar(wid.includes("poll: true")).verdadero("el widget no sondea: el agente hablaría solo");
    esperar(/setInterval\(\s*preguntar/.test(wid)).verdadero("no hay sondeo periódico");
  });

  test("el sondeo NO devuelve lo que escribió el propio visitante", () => {
    // Si devolviera los entrantes, el visitante vería sus propios mensajes
    // repetidos como si se los mandara el negocio.
    const bloque = ruta.slice(ruta.indexOf("if (esSondeo)"), ruta.indexOf("// Contacto anónimo"));
    esperar(bloque.includes('"outbound"')).verdadero("el sondeo debe filtrar solo mensajes salientes");
  });

  test("el sondeo está acotado a la organización y a la sesión", () => {
    // Aislamiento entre clientes: es un endpoint PÚBLICO, sin sesión.
    const bloque = ruta.slice(ruta.indexOf("if (esSondeo)"), ruta.indexOf("// Contacto anónimo"));
    esperar(bloque.includes("bot.org_id")).verdadero("sin filtro de organización");
    esperar(bloque.includes("external_id")).verdadero("sin filtro por la sesión del visitante");
  });

  test("la marca de lectura solo avanza, comparando FECHAS y no texto", () => {
    // ESTE ES EL BUG QUE DUPLICABA MENSAJES, y la primera prueba que escribí
    // no lo habría atrapado porque solo comprobaba que la función existiera.
    //
    // La base devuelve "2026-08-21T03:21:11.469294+00:00" y JavaScript genera
    // "2026-08-21T03:21:11.469Z". Comparados como TEXTO, la "Z" gana contra
    // cualquier dígito, así que la marca se clavaba en una hora falsa y cada
    // sondeo repetía los mismos mensajes cada 4 segundos, para siempre.
    esperar(wid.includes("function avanzar")).verdadero("no hay guardia de la marca");
    esperar(wid.includes("Date.parse")).verdadero(
      "la marca se compara como texto: dos formatos ISO distintos la congelan",
    );

    // Y se comprueba la comparación de verdad, con los dos formatos reales.
    const dePg = "2026-08-21T03:21:11.469294+00:00";
    const deJs = "2026-08-21T03:21:11.469Z";
    esperar(dePg > deJs).falso("como texto, el de la base parece MENOR — de ahí venía el fallo");
    esperar(Date.parse(dePg) >= Date.parse(deJs)).verdadero("como fecha, el orden sí es el correcto");
  });

  test("dos sondeos no se solapan", () => {
    // Si una vuelta tarda más que el intervalo, dos peticiones salen con la
    // MISMA marca y traen el mismo mensaje dos veces.
    esperar(wid.includes("sondeando")).verdadero("faltan las riendas para que no se solapen");
  });

  test("la marca sale de la base, no del reloj del servidor", () => {
    // Con los relojes desfasados un instante, un mensaje escrito justo en medio
    // se perdería para siempre.
    const bloque = ruta.slice(ruta.indexOf("if (esSondeo)"), ruta.indexOf("// Contacto anónimo"));
    esperar(/desde:\s*await marcaActual/.test(bloque)).verdadero(
      "el sondeo se inventa la marca con `new Date()` en vez de leerla de la base",
    );
  });
});

// ─── Solicitudes de atención humana ──────────────────────────────────────────
describe("La solicitud de persona no se borra sola", () => {
  const inbox = fs.readFileSync(path.join(SRC, "components/inbox/InboxClient.tsx"), "utf8");

  test("abrir una conversación NO cancela la solicitud", () => {
    // Lo hacía, y era destructivo: la Bandeja abre sola la conversación más
    // reciente, así que la petición se borraba con solo entrar a la pantalla,
    // sin que nadie atendiera a nadie. Desaparecía de "Solicitudes" para todo
    // el equipo y el cliente se quedaba esperando.
    esperar(/unread:\s*0,\s*handoff_requested_at:\s*null/.test(inbox)).falso(
      "marcar como leído no puede cancelar la solicitud de atención humana",
    );
  });

  test("contestar SÍ la da por atendida", () => {
    const send = inbox.slice(inbox.indexOf("const send ="));
    const cuerpo = send.slice(0, send.indexOf("\n  };"));
    esperar(cuerpo.includes("handoff_requested_at: null")).verdadero(
      "al responder al cliente, la solicitud debe cerrarse",
    );
  });

  test("hay un contador que sobrevive a recargar la página", () => {
    // El aviso emergente es un parpadeo: si el agente estaba en otra pestaña o
    // recargó, la solicitud quedaba invisible.
    const side = fs.readFileSync(path.join(SRC, "components/Sidebar.tsx"), "utf8");
    esperar(side.includes("usePendientes")).verdadero("el menú no muestra cuánta gente espera");
    const watcher = fs.readFileSync(path.join(SRC, "components/notifications/NotificationsWatcher.tsx"), "utf8");
    esperar(watcher.includes("anunciarPendientes")).verdadero("nadie publica el número de pendientes");
  });
});

// ─── La franja del traductor ─────────────────────────────────────────────────
describe("Responder en otro idioma: se tiene que leer", () => {
  // SIN COMENTARIOS. Los comentarios que explican este arreglo citan las clases
  // que prohíben —`bg-surface/60`, `text-muted-2`— así que leer el texto crudo
  // encuentra la prosa y falla contra código correcto. Es la quinta vez que
  // este archivo tropieza con lo mismo; ya debería ser un reflejo.
  const t = sinComentarios(
    fs.readFileSync(path.join(SRC, "components/inbox/ResponderEnIdioma.tsx"), "utf8"),
  );

  test("comparte superficie con el compositor", () => {
    // ESTABA CON `bg-surface/60`: una banda semitransparente MÁS OSCURA que la
    // franja de arriba y la de abajo, con los textos en gris apagado encima.
    // El resultado era una tira sucia con letras que había que adivinar. Se vio
    // en una captura de la Bandeja de verdad, no en teoría.
    esperar(/bg-surface\/60/.test(t)).falso(
      "esa banda semitransparente rompe la continuidad y apaga los textos",
    );
    esperar(/backgroundColor: "var\(--tarjeta\)"/.test(t)).verdadero(
      "el fondo tiene que ser el mismo del compositor",
    );
  });

  test("los textos pequeños no usan el gris más apagado", () => {
    // `text-muted-2` sobre esta franja es ilegible. El de al lado, `text-muted`,
    // es el que usa la franja de «la IA está en pausa» y sí se lee.
    //
    // SE MIRA SOLO LA FRANJA, no el archivo entero: el desplegable de idiomas
    // tiene su propio fondo sólido y ahí ese gris sí se lee. La primera versión
    // de esta prueba prohibía la clase en todo el archivo y fallaba contra dos
    // usos correctos — prohibir de más también es una prueba mal escrita.
    const franja = t.slice(0, t.indexOf("{eligiendo &&"));
    esperar(franja.length > 500).verdadero("no pude recortar la franja: la prueba no valdría");
    esperar(/text-muted-2/.test(franja)).falso(
      "el gris más apagado no se lee sobre esta franja",
    );
  });
});

// ─── Quién habla: el bot o la persona ────────────────────────────────────────
describe("Cuando escribe un agente, el bot se calla", () => {
  const ruta = sinComentarios(
    fs.readFileSync(path.join(SRC, "app/api/canales/enviar/route.ts"), "utf8"),
  );
  const inbox = sinComentarios(
    fs.readFileSync(path.join(SRC, "components/inbox/InboxClient.tsx"), "utf8"),
  );

  test("escribir desde la Bandeja TOMA la conversación", () => {
    // EL CAOS QUE ARREGLA. Los dos motores ya se callaban con `assigned`, pero
    // NADIE LO PONÍA NUNCA: el agente escribía, el lead contestaba, y le
    // respondía el bot. Dos voces hablando con el mismo cliente, preguntando
    // cada una lo que la otra ya había preguntado. Pasó en producción.
    // SE BUSCA LA ACTUALIZACIÓN, NO LA PRIMERA MENCIÓN DE LA TABLA. Anclar en
    // `.from("conversations")` encontraba la CONSULTA de arriba —la que lee la
    // conversación— y la comprobación miraba 400 caracteres donde nunca iba a
    // estar. Saltó al correrla, que es justo para lo que sirve.
    esperar(/handoff_requested_at: null,\s*status: "assigned",/.test(ruta)).verdadero(
      "un mensaje de un agente tiene que tomar la conversación, o el bot le sigue pisando",
    );
  });

  test("los motores respetan que esté tomada", () => {
    // La otra mitad del trato. Si un motor dejara de mirarlo, poner el estado
    // no serviría de nada.
    const wa = fs.readFileSync(path.join(RAIZ, "supabase/functions/whatsapp/index.ts"), "utf8");
    const web = fs.readFileSync(path.join(SRC, "app/api/webchat/route.ts"), "utf8");
    const ig = fs.readFileSync(path.join(SRC, "app/api/webhooks/instagram/route.ts"), "utf8");
    for (const [nombre, texto] of [["WhatsApp", wa], ["canal web", web], ["Instagram", ig]]) {
      esperar(/status === "assigned"/.test(texto)).verdadero(
        `el motor de ${nombre} tiene que callarse cuando la lleva una persona`,
      );
    }
  });

  test("hay forma de devolvérsela a la IA", () => {
    // Sin vuelta atrás, la primera respuesta de un agente apagaría el bot en
    // esa conversación PARA SIEMPRE. Antes de esto no existía ningún botón.
    esperar(inbox.includes("Devolver a la IA")).verdadero(
      "hace falta un botón para que el chatbot vuelva a contestar",
    );
    const i = inbox.indexOf("Devolver a la IA");
    esperar(inbox.slice(Math.max(0, i - 400), i).includes('setConvStatus("open")')).verdadero(
      "ese botón tiene que devolver la conversación al estado abierto",
    );
  });

  test("se avisa de que la IA está en pausa", () => {
    // Si no se dice, el agente cree que el bot sigue trabajando y se
    // desentiende; o nadie sabe a quién le toca y la conversación se muere.
    esperar(/sel\.status === "assigned"/.test(inbox)).verdadero(
      "el aviso tiene que depender del estado real de la conversación",
    );
    esperar(inbox.includes("La IA está en pausa")).verdadero("hay que decirlo con todas las letras");

    // Y NO PUEDE DEPENDER DE LA VENTANA DE 24 H. Se escribió así al principio y
    // era un error: en una conversación de más de 24 horas —donde el agente ya
    // está obligado a intervenir a mano con una plantilla— el botón para
    // devolvérsela a la IA desaparecía. Justo cuando más falta hace.
    esperar(/sel\.status === "assigned" && !ventanaCerrada/.test(inbox)).falso(
      "el botón de devolver no puede esconderse cuando la ventana está cerrada",
    );
  });

  test("se puede tomar la conversación SIN escribir", () => {
    // EL CASO QUE FALTABA. La primera versión solo enseñaba algo cuando la
    // conversación YA estaba tomada, así que el agente que se sienta a atender
    // no tenía forma de callar al bot antes de escribir: tenía que mandar un
    // mensaje, y mientras lo redactaba el bot podía contestar por él.
    esperar(inbox.includes("Tomar la conversación")).verdadero(
      "hace falta poder tomarla antes de escribir",
    );
    const i = inbox.indexOf("Tomar la conversación");
    esperar(inbox.slice(Math.max(0, i - 400), i).includes('setConvStatus("assigned")')).verdadero(
      "ese botón tiene que poner la conversación en manos de la persona",
    );
    // Y el aviso tiene que verse SIEMPRE, no solo cuando ya está tomada.
    esperar(/sel\.status !== "closed"/.test(inbox)).verdadero(
      "quién está hablando tiene que verse en toda conversación viva",
    );
  });
});

// ─── El entrenamiento por pestañas ───────────────────────────────────────────
describe("Entrenamiento: pestañas", () => {
  const pagina = fs.readFileSync(
    path.join(SRC, "app/(dashboard)/bots/[id]/training/page.tsx"), "utf8",
  );
  const acciones = sinComentarios(
    fs.readFileSync(path.join(SRC, "app/(dashboard)/bots/[id]/training/actions.ts"), "utf8"),
  );
  const nav = fs.readFileSync(path.join(SRC, "components/bots/EntrenamientoNav.tsx"), "utf8");

  test("una pestaña inventada no deja la pantalla en blanco", () => {
    // `?t=loquesea` llega desde la barra de direcciones, y de ahí puede venir
    // cualquier cosa. Sin este respaldo, la página no pintaría ninguna sección.
    esperar(/PESTANAS\.some\(\(p\) => p\.clave === pedida\) \? pedida : "resumen"/.test(sinComentarios(pagina)))
      .verdadero("hay que caer al resumen cuando la pestaña no existe");
  });

  test("los avisos se pegan con & y no con ?", () => {
    // LA TRAMPA: `base` ya lleva `?t=web`, así que `${base}?error=` produce
    // `?t=web?error=…` y el aviso NO se lee — la importación parecería no
    // haber hecho nada. Se coló al escribir esto y saltó al releer.
    esperar(/\$\{base\}\?(error|imported)=/.test(acciones)).falso(
      "con `?` sobre una dirección que ya tiene interrogación, el aviso se pierde",
    );
    esperar(/\$\{base\}&(error|imported)=/.test(acciones)).verdadero(
      "los avisos van con & porque `base` ya trae la pestaña",
    );
  });

  test("revalidatePath recibe la ruta, no la dirección con pestaña", () => {
    // `revalidatePath` espera una RUTA. Pasarle `?t=web` no refresca nada y el
    // cliente ve la lista vieja después de importar.
    esperar(/revalidatePath\(ruta\)/.test(acciones)).verdadero(
      "revalidatePath necesita la ruta a secas",
    );
    esperar(/revalidatePath\(base\)/.test(acciones)).falso(
      "`base` lleva query: revalidarlo no refresca la pantalla",
    );
  });

  test("las pestañas son enlaces, no estado de JavaScript", () => {
    // Así se comparten, funciona el botón de atrás y sobreviven a recargar.
    esperar(nav.includes("useState")).falso("las pestañas no pueden vivir en estado de cliente");
    esperar(/href=\{`\/bots\/\$\{botId\}\/training\?t=\$\{p\.clave\}`\}/.test(nav)).verdadero(
      "cada pestaña tiene que ser una dirección propia",
    );
  });

  test("lo que no existe se marca, no se esconde ni se finge", () => {
    // Una pestaña que no hace nada es peor que no tenerla: el cliente entra, no
    // pasa nada, y escribe a soporte. Misma regla que la conexión de Messenger.
    esperar(/pronto: true/.test(nav)).verdadero("las pestañas sin construir tienen que marcarse");
    esperar(pagina.includes("Todavía no está disponible")).verdadero(
      "hay que decir que no está y qué hacer mientras tanto",
    );
  });

  test("las preguntas sin responder son las de ESTE chatbot", () => {
    // El RPC devuelve las de todos. Mezclarlas aquí distrae de lo que hay que
    // enseñarle a este bot en concreto.
    esperar(/filter\(\(p\) => p\.bot_id === params\.id\)/.test(pagina)).verdadero(
      "hay que filtrar por el chatbot de la pantalla",
    );
  });
});

// ─── Subir archivos al almacén ───────────────────────────────────────────────
describe("Adjuntos: la ruta del almacén", () => {
  test("toda subida empieza por la organización", () => {
    // ESTA PRUEBA EXISTE POR UN FALLO QUE NUNCA FUNCIONÓ NI UNA VEZ. La regla
    // de seguridad del almacén mira la PRIMERA carpeta de la ruta:
    //   foldername(name)[1]::uuid IN (auth_org_ids())
    // La Bandeja subía a `inbox/<org>/…`, así que la primera carpeta era el
    // texto "inbox", el cast a uuid fallaba y se rechazaban TODAS las subidas.
    // El agente solo veía «No se pudo enviar el archivo. Inténtalo otra vez.»
    //
    // Cualquier ruta nueva que no empiece por la organización tiene el mismo
    // destino, y sin esta prueba se descubre en producción — como esta vez.
    const malas = [];
    for (const { ruta, texto } of ARCHIVOS) {
      const t = sinComentarios(texto);
      if (!/storage\s*\n?\s*\.from\(\s*["']media["']\s*\)/.test(t.replace(/\s+/g, " "))) continue;
      // Las plantillas de ruta que se pasan a .upload()
      for (const m of t.matchAll(/(?:const|let)\s+\w+\s*=\s*`([^`]+)`/g)) {
        const plantilla = m[1];
        if (!/\$\{Date\.now\(\)\}/.test(plantilla)) continue; // no es una ruta de subida
        if (!/^\$\{\s*orgId\s*[^}]*\}\//.test(plantilla)) {
          malas.push(`${ruta} → "${plantilla}"`);
        }
      }
    }
    esperar(malas.join(", ")).igual(
      "",
      "una ruta del almacén que no empieza por la organización la rechaza SIEMPRE la regla de seguridad",
    );
  });

  test("sin organización no se intenta subir", () => {
    // `${orgId ?? "org"}` metía el texto "org" en la ruta, que tampoco es un
    // uuid: mismo rechazo, y encima disfrazado de ruta válida.
    const inbox = sinComentarios(
      fs.readFileSync(path.join(SRC, "components/inbox/InboxClient.tsx"), "utf8"),
    );
    esperar(/orgId \?\? ["']org["']/.test(inbox)).falso(
      "un valor de respaldo que no sea un uuid rompe la regla igual, pero en silencio",
    );
    esperar(inbox.includes("if (!orgId)")).verdadero(
      "sin organización hay que decirlo antes de subir nada",
    );
  });

  test("el motivo del fallo llega al agente, no solo a la consola", () => {
    // «Inténtalo otra vez» invita a repetir algo que a veces no puede
    // funcionar nunca. El motivo tiene que verse en pantalla.
    const inbox = fs.readFileSync(path.join(SRC, "components/inbox/InboxClient.tsx"), "utf8");
    esperar(/setErrorEnvio\(motivoAdjunto\(crudo\)\)/.test(inbox)).verdadero(
      "el error de subida tiene que traducirse y enseñarse, no tragarse",
    );
  });
});

// ─── Retomar una conversación con una plantilla ──────────────────────────────
describe("Enviar una plantilla desde la Bandeja", () => {
  const inbox = fs.readFileSync(path.join(SRC, "components/inbox/InboxClient.tsx"), "utf8");
  const modal = fs.readFileSync(path.join(SRC, "components/inbox/EnviarPlantilla.tsx"), "utf8");
  const ruta = sinComentarios(
    fs.readFileSync(path.join(SRC, "app/api/canales/enviar/route.ts"), "utf8"),
  );

  test("el botón ENVÍA, no lleva a otra pantalla", () => {
    // EL FALLO REAL: «Enviar una plantilla» era un enlace a la pantalla de
    // gestión de plantillas —donde se crean y se mandan a aprobar—, no a
    // mandarle una a esa persona. Y si la conversación no tenía chatbot, caía
    // a "/bots" y dejaba al agente en la lista de chatbots, sin explicación.
    const i = inbox.indexOf("Enviar una plantilla");
    esperar(i > 0).verdadero("no encuentro el botón de plantilla");
    const bloque = sinComentarios(inbox.slice(Math.max(0, i - 700), i));
    esperar(/href=\{sel\.bot_id \?/.test(bloque)).falso(
      "volvió el enlace: un botón que promete enviar no puede navegar a otro sitio",
    );
    esperar(bloque.includes("setAbrirPlantilla(true)")).verdadero(
      "el botón tiene que abrir la ventana de envío",
    );
  });

  test("una conversación sin chatbot no se queda sin plantillas", () => {
    // Es exactamente el caso que falló. Sin `bot_id` hay que enseñar las
    // aprobadas de la organización, no dejar al agente sin nada que hacer.
    esperar(/if \(botId\) q = q\.eq\("bot_id", botId\)/.test(modal)).verdadero(
      "el filtro por chatbot tiene que ser opcional",
    );
  });

  test("solo se ofrecen plantillas APROBADAS", () => {
    // Meta rechaza en el momento cualquier otra, y el agente se quedaría
    // creyendo que reabrió la conversación sin que llegara nada.
    esperar(/\.eq\("status", "APPROVED"\)/.test(modal)).verdadero(
      "la lista tiene que filtrar por aprobadas",
    );
  });

  test("el servidor NO se fía de lo que manda el navegador", () => {
    // El nombre de la plantilla y sus valores vienen del cliente. Si el
    // servidor los reenviara a Meta sin comprobar, cualquiera podría mandar
    // plantillas de otra organización o sin aprobar.
    const i = ruta.indexOf("whatsapp_templates");
    esperar(i > 0).verdadero("el servidor no está comprobando la plantilla contra la base");
    const bloque = ruta.slice(i - 200, i + 700);
    esperar(bloque.includes('.eq("org_id", conv.org_id)')).verdadero(
      "la plantilla tiene que ser de la organización de esa conversación",
    );
    esperar(/APPROVED/.test(bloque)).verdadero("hay que exigir que esté aprobada");
  });

  test("no se manda una plantilla con huecos sin rellenar", () => {
    // Meta rechaza el envío entero si el número de valores no cuadra, con un
    // error que no dice cuál falta. Comprobarlo antes ahorra el intento y
    // permite decírselo al agente en cristiano.
    esperar(ruta.includes("fila.variables")).verdadero(
      "hay que comparar los valores con las variables de la plantilla guardada",
    );
  });

  test("«aceptado» no se confunde con «entregado»", () => {
    // EL FALLO REAL: Meta contesta 200 al ACEPTAR el mensaje, no al
    // entregarlo. La entrega la avisa después por el webhook de estados, con
    // el identificador `wamid`. Sin guardarlo, ese aviso no se puede casar con
    // ningún mensaje y se descarta: la Bandeja enseña «enviado» para siempre.
    // Pasó con la primera plantilla enviada desde la Bandeja.
    const env = sinComentarios(
      fs.readFileSync(path.join(SRC, "lib/canales/whatsappEnviar.ts"), "utf8"),
    );
    esperar(/j\?\.messages\?\.\[0\]\?\.id/.test(env)).verdadero(
      "hay que quedarse con el identificador que devuelve Meta",
    );
    esperar(/payload\.wamid = envio\.wamid/.test(ruta)).verdadero(
      "y guardarlo en el mensaje, o el aviso de entrega no tiene a qué referirse",
    );
  });

  test("el motor marca el mensaje cuando Meta dice que falló", () => {
    // `handleStatuses` solo miraba difusiones y seguimientos: lo que manda un
    // agente desde la Bandeja quedaba fuera y su fallo se perdía en silencio.
    const wa = sinComentarios(
      fs.readFileSync(path.join(RAIZ, "supabase/functions/whatsapp/index.ts"), "utf8"),
    );
    const i = wa.indexOf('if (s === "failed")');
    esperar(i > 0).verdadero("no encuentro el manejo del estado fallido");
    esperar(wa.slice(i, i + 600).includes("marcarMensajeFallido")).verdadero(
      "los mensajes de la Bandeja también tienen que marcarse",
    );
    esperar(/\.eq\("payload->>wamid", wamid\)/.test(wa)).verdadero(
      "se busca por el identificador de Meta guardado en el mensaje",
    );
    // Y el índice que hace que esa búsqueda no recorra la tabla entera.
    const mig = fs.readFileSync(
      path.join(RAIZ, "supabase/migrations/0069_estado_de_entrega_en_la_bandeja.sql"), "utf8",
    );
    esperar(mig.includes("messages_wamid_idx")).verdadero(
      "sin índice, cada aviso de entrega recorre la tabla de mensajes entera",
    );
  });

  test("el motivo de la no entrega se explica, no se copia de Meta", () => {
    // 131049 es el más común y el más confuso: Meta decidió no entregar una
    // plantilla de marketing. No se arregla reintentando, y decir «failed» a
    // secas hace que el agente reintente hasta rendirse.
    const wa = fs.readFileSync(path.join(RAIZ, "supabase/functions/whatsapp/index.ts"), "utf8");
    esperar(wa.includes("case 131049:")).verdadero(
      "hay que explicar el rechazo por calidad: es el que más despista",
    );
  });

  test("al enviar se confirma, y sin prometer la entrega", () => {
    // El agente necesita saber que salió. Pero decir «envío exitoso» a secas
    // sería repetir la mentira que se acaba de quitar: WhatsApp ACEPTA el
    // mensaje y avisa después si no pudo entregarlo.
    esperar(modal.includes("lanzarAviso(")).verdadero("hace falta confirmar el envío");
    const i = modal.indexOf("lanzarAviso(");
    const bloque = modal.slice(i, i + 400);
    esperar(/exitoso|entregad[oa] con éxito/i.test(bloque)).falso(
      "no se puede prometer una entrega que WhatsApp todavía no ha confirmado",
    );
    esperar(/acept/i.test(bloque)).verdadero(
      "hay que decir lo que de verdad pasó: WhatsApp la aceptó",
    );
  });

  test("si WhatsApp la rechaza en el momento, no se dice que salió", () => {
    // El servidor guarda el mensaje MARCADO cuando Meta lo rechaza. Dar por
    // bueno el 200 enseñaría «enviada» sobre un mensaje que nadie recibió.
    esperar(/const fallo = j\?\.mensaje\?\.payload\?\.no_entregado/.test(modal)).verdadero(
      "hay que mirar la marca del mensaje, no solo el código HTTP",
    );
  });

  test("el motivo del fallo se lee en la conversación", () => {
    // Estaba solo en el `title` del navegador: hay que pasar el ratón, y en un
    // teléfono eso no existe. Reintentar, cambiar de plantilla o llamar son
    // tres arreglos distintos, y sin el motivo no se puede elegir.
    // SIN COMENTARIOS: el comentario que explica este mismo arreglo contiene
    // las palabras «No se entregó» y «title», así que anclarse en el texto
    // crudo encuentra la prosa en vez del código. Es la cuarta vez que este
    // archivo tropieza con lo mismo.
    const inbox = sinComentarios(
      fs.readFileSync(path.join(SRC, "components/inbox/InboxClient.tsx"), "utf8"),
    );
    const i = inbox.indexOf("No se entregó");
    esperar(i > 0).verdadero("no encuentro la marca de no entregado");
    const bloque = inbox.slice(Math.max(0, i - 500), i + 400);
    esperar(/title=\{m\.payload\.no_entregado\.motivo\}/.test(bloque)).falso(
      "el motivo no puede vivir solo en un tooltip",
    );
    esperar(/\{m\.payload\.no_entregado\.motivo\}/.test(bloque)).verdadero(
      "el motivo tiene que pintarse en pantalla",
    );
  });

  test("en la Bandeja se guarda lo que LEE la persona", () => {
    // Guardar «📨 Plantilla xyz» dejaría al agente sin saber qué le dijo al
    // lead, y la siguiente respuesta del lead sin ningún contexto.
    // SE BUSCA EL USO, NO LA DECLARACIÓN. La primera versión de esta prueba
    // buscaba «textoDeLaPlantilla(» a secas y casaba con la propia función, así
    // que pasaba aunque el `body:` guardara otra cosa. Se descubrió mutando.
    esperar(/body:\s*plantillaOk\s*\?\s*textoDeLaPlantilla\(/.test(ruta)).verdadero(
      "el cuerpo guardado tiene que ser el texto con los datos puestos",
    );
  });

  test("un hueco sin valor se queda a la vista, no se borra", () => {
    // Una frase a la que le falta una palabra parece correcta y engaña; un
    // {{2}} a la vista se detecta de un vistazo.
    const fn = ruta.slice(ruta.indexOf("function textoDeLaPlantilla"));
    esperar(fn.slice(0, 400).includes("entero")).verdadero(
      "si no hay valor hay que dejar el hueco visible",
    );
  });
});

// ─── Modelo de IA ────────────────────────────────────────────────────────────
describe("Modelo de IA", () => {
  // POR QUÉ EXISTE ESTA PRUEBA: cuando el nombre del modelo caduca, la API
  // devuelve error, el código cae al mensaje de respaldo y el bot contesta
  // "esa no me la sé" — idéntico a no tener la respuesta. Pasó de verdad con
  // `claude-3-5-haiku-latest` y costó una tarde encontrarlo, porque todo lo
  // demás (llave, despliegue, conocimiento) estaba bien.
  const RETIRADOS = [/claude-3-5-/, /claude-3-opus/, /claude-2/, /claude-instant/];

  const modeloDe = (texto) =>
    texto.match(/ANTHROPIC_MODEL"?\)?\s*(?:\|\||\?\?)\s*"([^"]+)"/)?.[1] ?? null;

  const web = fs.readFileSync(path.join(SRC, "lib/ai/answer.ts"), "utf8");
  const wa = fs.readFileSync(path.join(RAIZ, "supabase/functions/whatsapp/index.ts"), "utf8");

  test("los dos motores usan el mismo modelo", () => {
    const a = modeloDe(web);
    const b = modeloDe(wa);
    esperar(!!a).verdadero("no encontré el modelo por defecto en answer.ts");
    esperar(b).igual(a, "WhatsApp y el canal web contestarían con modelos distintos");
  });

  test("el modelo no es uno retirado", () => {
    for (const [archivo, texto] of [["answer.ts", web], ["whatsapp/index.ts", wa]]) {
      const m = modeloDe(texto) ?? "";
      const malo = RETIRADOS.find((r) => r.test(m));
      esperar(!malo).verdadero(`${archivo} apunta a un modelo retirado: ${m}`);
    }
  });

  test("la prueba del panel muestra el error real, no el mensaje de respaldo", () => {
    // Sin esto, el dueño del negocio no puede distinguir "no lo sé" de
    // "la llave está vencida", que es exactamente lo que nos pasó.
    const ruta = fs.readFileSync(path.join(SRC, "app/api/ai/probar/route.ts"), "utf8");
    esperar(ruta.includes("diagnostico: true")).verdadero(
      "/api/ai/probar debe pedir diagnóstico para que los fallos se vean",
    );
    esperar(web.includes("opts.diagnostico")).verdadero("aiAnswer ignora la opción de diagnóstico");
  });

  test("el interruptor corta también en el motor de WhatsApp", () => {
    // El comportamiento se prueba de verdad en negocio.mjs, pero solo contra
    // el motor web. El de WhatsApp es una copia en Deno que no se puede
    // importar desde aquí, así que al menos se vigila que tenga el candado.
    esperar(/enabled\s*===\s*false/.test(wa)).verdadero(
      "responderConIA no corta cuando la IA está apagada: cobraría IA que el cliente apagó",
    );
    esperar(/enabled:\s*true/.test(wa)).verdadero(
      "AI_DEFAULTS de WhatsApp debe nacer encendida, igual que el canal web",
    );
  });

  test("apagar la IA apaga también el desvío del flujo", () => {
    // El desvío llama a la IA. Si el interruptor general no lo cubriera, un
    // cliente que apaga la IA seguiría gastándola cada vez que alguien se
    // sale del guion.
    const ruta = fs.readFileSync(path.join(SRC, "app/api/webchat/route.ts"), "utf8");
    const linea = ruta.slice(ruta.indexOf("iaDeRespaldo:"), ruta.indexOf("iaDeRespaldo:") + 200);
    esperar(linea.includes("enabled")).verdadero(
      "iaDeRespaldo no mira el interruptor general",
    );
  });

  test("el diagnóstico nunca se enciende en una conversación con un cliente", () => {
    // Un cliente final jamás debe ver "la llave no es válida".
    for (const rel of ["lib/flow/webRuntime.ts"]) {
      const t = fs.readFileSync(path.join(SRC, rel), "utf8");
      esperar(t.includes("diagnostico")).falso(`${rel} no debe pedir diagnóstico`);
    }

    // ANTES ESTA PRUEBA BUSCABA LA PALABRA EN TODO EL ARCHIVO y se rompió el
    // día que el motor ganó un diagnóstico de administrador. La palabra no era
    // el peligro: el peligro es que el diagnóstico se cuele en el camino por
    // donde entran los mensajes. Eso es lo que se comprueba ahora.
    const iPost = wa.indexOf('req.method === "POST"');
    esperar(iPost > 0).verdadero("no encuentro el manejador POST del motor de WhatsApp");

    // Los mensajes de los clientes llegan por POST. De ahí para abajo no puede
    // haber ni rastro del diagnóstico.
    esperar(wa.slice(iPost).includes("diagnostico")).falso(
      "el camino de los mensajes del motor de WhatsApp no debe tocar el diagnóstico",
    );

    // Y donde sí se llama, tiene que ir detrás del token del webhook.
    const llamadas = wa.split("\n").filter((l) => /diagnosticoIA\s*\(/.test(l) && !/^\s*(\*|\/\/)/.test(l));
    // Una sola llamada, y la declaración. Si aparece una tercera línea es que
    // alguien llamó al diagnóstico desde otro sitio: hay que mirarlo a mano.
    esperar(llamadas.length).igual(2, "el diagnóstico debe llamarse desde un solo sitio");
    const llamada = llamadas.find((l) => !/function\s+diagnosticoIA/.test(l)) ?? "";
    esperar(llamada.includes("VERIFY_TOKEN")).verdadero(
      "el diagnóstico del motor de WhatsApp debe ir detrás del token del webhook",
    );
  });
});

// ─── El conocimiento del negocio ─────────────────────────────────────────────
describe("Búsqueda en el conocimiento del negocio", () => {
  const wa = fs.readFileSync(path.join(RAIZ, "supabase/functions/whatsapp/index.ts"), "utf8");
  const web = fs.readFileSync(path.join(RAIZ, "src/lib/ai/answer.ts"), "utf8");

  test("ningún motor cae a «los primeros fragmentos» cuando no encuentra nada", () => {
    // POR QUÉ EXISTE ESTA PRUEBA. Ese respaldo mandaba a la IA cinco fragmentos
    // SIN RELACIÓN con lo preguntado. Con contexto que no viene al caso, un
    // modelo no se calla: rellena. Así aseguró que el plan de 99 USD «no tiene
    // límite de mensajes» — dato que nadie le dio y que es falso.
    // El invariante real: NINGÚN motor lee la tabla del conocimiento a pelo.
    // Todo pasa por las dos funciones que sí saben ordenar por relevancia
    // (`match_bot_knowledge` por significado, `buscar_conocimiento` por
    // palabras). Quien vuelva a poner un `.from("bot_knowledge")` aquí está
    // reabriendo la puerta por la que entró el respaldo que inventaba datos.
    for (const [nombre, texto] of [["el motor de WhatsApp", wa], ["la web", web]]) {
      esperar(/from\(\s*["']bot_knowledge["']\s*\)/.test(sinComentarios(texto))).falso(
        `${nombre} debe buscar con buscar_conocimiento, no leyendo la tabla a pelo`,
      );
    }
  });

  test("los dos motores buscan por relevancia con la misma función", () => {
    for (const [nombre, texto] of [["el motor de WhatsApp", wa], ["la web", web]]) {
      esperar(texto.includes("buscar_conocimiento")).verdadero(
        `${nombre} no usa la búsqueda por relevancia`,
      );
    }
  });

  test("la búsqueda sigue acotada a organización Y chatbot", () => {
    for (const [nombre, texto] of [["el motor de WhatsApp", wa], ["la web", web]]) {
      esperar(texto.includes("p_org_id") && texto.includes("p_bot_id")).verdadero(
        `${nombre} debe pasar SIEMPRE organización y chatbot: el conocimiento de un cliente no puede rozar el de otro`,
      );
    }
  });
});

// ─── La agenda entre el motor y la web ───────────────────────────────────────
describe("Puerta de agenda del motor", () => {
  const ruta = fs.readFileSync(path.join(RAIZ, "src/app/api/motor/agenda/route.ts"), "utf8");
  const wa = fs.readFileSync(path.join(RAIZ, "supabase/functions/whatsapp/index.ts"), "utf8");

  test("no se autoriza comparando dos copias de un secreto", () => {
    // Comparar la llave del motor con la de la web se cayó en producción: las
    // dos eran válidas y ninguna era igual a la otra (Supabase convive con dos
    // formatos de llave de servicio). El calendario dejó de ofrecer horarios y
    // el mensaje al cliente no decía por qué.
    esperar(ruta.includes("/auth/v1/admin/users")).verdadero(
      "la puerta del motor debe comprobar que la llave MANDA en el proyecto, no que sea idéntica a la de aquí",
    );
  });

  test("cuando la plataforma no contesta bien, queda escrito el porqué", () => {
    esperar(wa.includes("__fallo")).verdadero(
      "un fallo de la agenda tiene que distinguirse de «no hay horarios»: son dos arreglos distintos",
    );
  });

  test("tras un fallo de calendario NUNCA se sigue por la salida de éxito", () => {
    // El peor error del proyecto: el bot decía «te paso con una persona» y un
    // segundo después «tu cita ha sido agendada», con los datos en blanco.
    const i = wa.indexOf('case "calendar"');
    esperar(i > 0).verdadero("no encuentro el bloque de calendario en el motor");
    const bloque = wa.slice(i, i + 1200);
    esperar(/handoff_reason/.test(bloque)).verdadero(
      "sin horarios, el calendario tiene que pasar la conversación a una persona",
    );
  });
});

// ─── El catálogo de componentes ──────────────────────────────────────────────
describe("Catálogo de componentes", () => {
  const tipos = fs.readFileSync(path.join(RAIZ, "src/lib/flow/types.ts"), "utf8");
  const canales = fs.readFileSync(path.join(RAIZ, "src/lib/channels.ts"), "utf8");
  const motor = fs.readFileSync(path.join(RAIZ, "supabase/functions/whatsapp/index.ts"), "utf8");

  // Se recorta CADA tabla por su nombre antes de leer las claves. Buscar
  // `algo: { label:` en todo el archivo pesca también los canales y las
  // acciones, y una prueba que falla por estar mal escrita es peor que no
  // tenerla: enseña a ignorar las alarmas.
  // Se busca la llave del VALOR (`= {`), no la primera llave que aparezca: el
  // tipo de la tabla es `Record<NodeType, { label: string; ... }>` y esa llave
  // llega antes. Buscándola mal, la tabla salía VACÍA y las comprobaciones de
  // abajo pasaban sin comparar nada — que es la peor forma de fallar, porque
  // enseña a confiar en una alarma que no suena.
  const tabla = (texto, nombre) => {
    const i = texto.indexOf(nombre);
    if (i < 0) return [];
    const desde = texto.indexOf("= {", i);
    if (desde < 0) return [];
    let nivel = 0, fin = desde + 2;
    for (let j = desde + 2; j < texto.length; j++) {
      if (texto[j] === "{") nivel++;
      else if (texto[j] === "}") { nivel--; if (nivel === 0) { fin = j; break; } }
    }
    return [...texto.slice(desde, fin).matchAll(/^\s{2}(\w+):\s*\{/gm)].map((m) => m[1]);
  };

  const meta = tabla(tipos, "NODE_META");
  const documentados = tabla(canales, "export const COMPONENTS");

  test("las dos tablas se leyeron de verdad", () => {
    // Guarda contra el fallo silencioso: si el recorte devuelve una lista
    // vacía, TODAS las comprobaciones de este bloque pasarían sin comparar
    // nada. Ya pasó una vez. Que no vuelva a pasar sin avisar.
    esperar(meta.length > 10).verdadero("no pude leer NODE_META: las demás pruebas de este bloque no valdrían");
    esperar(documentados.length > 10).verdadero("no pude leer COMPONENTS: las demás pruebas de este bloque no valdrían");
  });

  test("todo componente que se puede arrastrar está explicado", () => {
    // `channels.ts` lo dice en un comentario: si documentamos un bloque que no
    // existe, prometemos algo que no está; si falta uno, se queda sin
    // explicación y sin tutorial de Lana. Hasta hoy nadie lo comprobaba.
    // `start` es interno: no se arrastra y no necesita explicación.
    const sinExplicar = meta.filter((k) => k !== "start" && !documentados.includes(k));
    esperar(sinExplicar.join(",")).igual("", "hay componentes sin explicación en channels.ts");
  });

  test("no se explica ningún componente que no exista", () => {
    const inventados = documentados.filter((k) => !meta.includes(k));
    esperar(inventados.join(",")).igual("", "channels.ts promete bloques que el constructor no tiene");
  });

  test("todo componente aparece en el orden de la paleta", () => {
    const orden = (tipos.match(/PALETTE_ORDER[^=]*=\s*\[([\s\S]*?)\]/) ?? [])[1] ?? "";
    // Los de Instagram y Messenger viven en su propia categoría del canal.
    const propiosDeOtroCanal = ["ig_story", "ig_comment", "ig_dm", "fb_comment", "web_form", "start"];
    const fuera = meta.filter((k) => !propiosDeOtroCanal.includes(k) && !orden.includes('"' + k + '"'));
    esperar(fuera.join(",")).igual("", "hay componentes que no aparecen en la paleta");
  });

  test("el motor de WhatsApp sabe ejecutar TODOS los bloques de WhatsApp", () => {
    // ESTA ES LA PRUEBA QUE FALTABA. Seis bloques vivieron meses en la paleta
    // sin que el motor supiera ejecutarlos: etiquetar, acción, espera,
    // redirigir, plantilla y catálogo. El cliente los arrastraba, los
    // configuraba, guardaba — y en la conversación no pasaba nada. Etiquetar
    // era el peor: el negocio creía que estaba segmentando y filtraba por
    // etiquetas que nunca se pusieron.
    //
    // Un bloque en la paleta es una promesa. Esto comprueba que el motor la
    // puede cumplir.
    const soloDeOtroCanal = ["ig_story", "ig_comment", "ig_dm", "fb_comment", "web_form"];
    // `start` no es un componente: es el nodo de arranque, no se arrastra.
    const internos = ["start"];
    const casos = [...motor.matchAll(/case "(\w+)":/g)].map((m) => m[1]);
    const sinMotor = meta.filter((k) => !soloDeOtroCanal.includes(k) && !internos.includes(k) && !casos.includes(k));
    esperar(sinMotor.join(",")).igual("", "hay bloques en la paleta que el motor de WhatsApp no ejecuta");
  });

  test("el motor sabe ejecutar el bloque de permiso para llamar", () => {
    // Un bloque en la paleta que el motor no sabe ejecutar es una promesa rota:
    // el cliente lo arrastra, lo configura, y en la conversación no pasa nada.
    esperar(motor.includes('case "call_permission"')).verdadero(
      "el bloque de permiso para llamar está en la paleta pero el motor no lo ejecuta",
    );
    esperar(motor.includes("call_permission_request")).verdadero(
      "el motor no manda la petición de permiso de Meta",
    );
    esperar(motor.includes("call_permission_reply")).verdadero(
      "el motor no reconoce la respuesta del cliente al permiso",
    );
  });
});

// ─── Reenvíos de Meta ────────────────────────────────────────────────────────
describe("WhatsApp: quién puede llamar al webhook", () => {
  // ESTE ENDPOINT ESTUVO ABIERTO A INTERNET. Atendía POST sin comprobar nada:
  // ni firma, ni token, ni cabecera. Y la dirección no es secreta —
  // `NEXT_PUBLIC_SUPABASE_URL` viaja al navegador en cada carga—, así que
  // cualquiera podía inventarse mensajes de cualquier cliente, meterlos en su
  // Bandeja, disparar los flujos y gastar la cuota de IA que paga Demandu.
  const wa = sinComentarios(
    fs.readFileSync(path.join(RAIZ, "supabase/functions/whatsapp/index.ts"), "utf8"),
  );

  test("el cuerpo se lee CRUDO antes de nada", () => {
    // El HMAC va sobre los bytes exactos que mandó Meta. Parsear y volver a
    // serializar cambia espacios y orden, y una firma válida se rechazaría.
    const i = wa.indexOf('req.method === "POST"');
    esperar(i > 0).verdadero("no encuentro el manejador POST");
    const bloque = wa.slice(i, i + 700);
    esperar(bloque.includes("await req.text()")).verdadero(
      "hay que leer el cuerpo como texto para poder verificar la firma",
    );
    esperar(/await req\.json\(\)/.test(bloque)).falso(
      "si se parsea antes de firmar, el HMAC ya no cuadra con lo que mandó Meta",
    );
  });

  test("la firma se comprueba ANTES de procesar el mensaje", () => {
    const iFirma = wa.indexOf("firmaDeMetaValida(crudo");
    const iProcesa = wa.indexOf("body?.entry?.[0]?.changes?.[0]?.value");
    esperar(iFirma > 0 && iProcesa > 0).verdadero("no encuentro la firma o el procesado");
    esperar(iFirma < iProcesa).verdadero(
      "comprobar después de procesar no sirve de nada: el daño ya está hecho",
    );
  });

  test("el reloj de la base NO necesita la firma de Meta", () => {
    // A `?continuar=` lo llama Postgres, no Meta, y se autoriza con su propio
    // testigo de un solo uso. Exigirle la firma de Meta dejaría todas las
    // esperas largas sin retomar: el «recuérdaselo en 2 h» no llegaría nunca.
    const iContinuar = wa.indexOf('url.searchParams.has("continuar")');
    const iFirma = wa.indexOf("firmaDeMetaValida(crudo");
    esperar(iContinuar > 0 && iFirma > iContinuar).verdadero(
      "la vía del reloj tiene que resolverse ANTES de exigir la firma de Meta",
    );
    esperar(wa.slice(iContinuar, iFirma).includes("testigo")).verdadero(
      "esa vía sigue autorizándose con su testigo",
    );
  });

  test("se puede estrenar sin dejar mudos a los clientes", () => {
    // Encender la comprobación de golpe sobre tráfico real es una apuesta: si
    // el secreto no fuera el que firma, se rechazarían TODOS los mensajes de
    // TODOS los clientes. El modo por defecto tiene que ser el prudente.
    esperar(wa.includes("WA_FIRMA")).verdadero("hace falta poder observar antes de exigir");
    const m = wa.match(/Deno\.env\.get\("WA_FIRMA"\)\s*\?\?\s*"([a-z]+)"/);
    esperar(m?.[1]).igual(
      "observar",
      "el valor por defecto tiene que ser observar: desplegar esto sin leer no puede tumbar a nadie",
    );
    esperar(/MODO_FIRMA === "exigir"/.test(wa)).verdadero(
      "solo se rechaza en modo exigir",
    );
  });

  test("una firma que no cuadra queda apuntada", () => {
    // Es lo que hace útil el modo observar —dice si el secreto es el bueno— y
    // sigue haciendo falta al exigir: un 401 solo en consola es invisible, y
    // Meta acaba DESACTIVANDO la suscripción del cliente sin avisar a nadie.
    esperar(wa.includes("anotarFirmaMala")).verdadero("hay que dejar constancia");
    const i = wa.indexOf("async function anotarFirmaMala");
    const fn = wa.slice(i, i + 1400);
    esperar(fn.includes("webhook_firma")).verdadero("se apunta en la tabla de fallos");
    esperar(/\$\{\s*cabecera\s*\}/.test(fn)).falso("la firma de Meta no se guarda");
    esperar(/\$\{\s*APP_SECRET\s*\}/.test(fn)).falso("el secreto NUNCA se guarda");
    esperar(fn.includes("APP_SECRET.length")).verdadero(
      "del secreto se apunta el largo, que es lo que sirve para diagnosticar sin filtrarlo",
    );
  });

  test("el token de verificación no está escrito en el repositorio", () => {
    // Estaba: `?? "demandu_wa_2026"`. Un token público con el que cualquiera
    // podía dar de alta el webhook y abrir `?diag=`, que enseña el diagnóstico.
    esperar(wa.includes("demandu_wa_2026")).falso(
      "un token por defecto en el repositorio es un token público",
    );
    esperar(/WHATSAPP_VERIFY_TOKEN"\)\s*\?\?\s*""/.test(wa)).verdadero(
      "sin la variable hay que fallar cerrado, no caer a un valor conocido",
    );
  });

  test("un token vacío no abre el diagnóstico a cualquiera", () => {
    // LA TRAMPA AL QUITAR EL VALOR POR DEFECTO: en JavaScript `"" === ""` es
    // CIERTO, así que con el token vacío una petición con `?diag=` coincidiría
    // y enseñaría el diagnóstico. Cerrar un agujero abriendo otro no vale.
    const iGet = wa.indexOf('req.method === "GET"');
    const iDiag = wa.indexOf('url.searchParams.get("diag")');
    esperar(iGet > 0 && iDiag > iGet).verdadero("no encuentro el diagnóstico");
    const antes = wa.slice(iGet, iDiag);
    esperar(/if \(!VERIFY_TOKEN\)/.test(antes)).verdadero(
      "hay que cortar ANTES si el token está vacío",
    );
  });
});

describe("Reenvíos del webhook", () => {
  const wa = fs.readFileSync(path.join(RAIZ, "supabase/functions/whatsapp/index.ts"), "utf8");

  test("un mensaje repetido no vuelve a correr el flujo", () => {
    // Meta reenvía el webhook cuando no le contestamos rápido. Sin esto, cada
    // reenvío repetía los mensajes al cliente, agendaba la cita otra vez,
    // disparaba el webhook del negocio otra vez y cobraba la bolsa otra vez.
    esperar(wa.includes("mensajes_vistos")).verdadero(
      "el motor tiene que descartar los reenvíos de Meta por el id del mensaje",
    );
    esperar(wa.includes("23505")).verdadero(
      "el descarte se decide por la clave duplicada del INSERT, no por una consulta previa (que deja hueco a la carrera)",
    );
  });

  test("la espera del bloque de retardo no invita a que Meta reintente", () => {
    const m = wa.match(/ESPERA_MAXIMA_MS\s*=\s*(\d+)/);
    esperar(!!m).verdadero("no encuentro el tope de la espera");
    esperar(Number(m[1]) <= 5000).verdadero(
      "retener la respuesta del webhook más de 5 s hace que Meta reenvíe el mensaje",
    );
  });
});

// ─── Saltos a bloques que no existen ─────────────────────────────────────────
describe("Saltos rotos en un flujo", () => {
  const wa = fs.readFileSync(path.join(RAIZ, "supabase/functions/whatsapp/index.ts"), "utf8");

  test("el bloque de inicio no salta a ciegas", () => {
    // El bot «Lana» estuvo MUDO en producción por esto: su nodo de inicio
    // apuntaba a un bloque «welcome» que ya no existía —basta con borrar un
    // bloque en el constructor— y el motor saltaba al vacío. Quien le escribía
    // no recibía nada, y no quedaba ni rastro de por qué.
    const i = wa.indexOf('case "start"');
    esperar(i > 0).verdadero("no encuentro el caso del bloque de inicio");
    const bloque = wa.slice(i, i + 900);
    esperar(/getNode\(ctx\.flow,\s*node\.data\.to\)/.test(bloque)).verdadero(
      "el inicio debe comprobar que su destino existe antes de saltar",
    );
    esperar(/defaultNext/.test(bloque)).verdadero(
      "si el destino no existe hay que usar la flecha dibujada, no morirse",
    );
  });
});

// ─── Esperas largas ──────────────────────────────────────────────────────────
describe("Esperas de minutos u horas", () => {
  const wa = fs.readFileSync(path.join(RAIZ, "supabase/functions/whatsapp/index.ts"), "utf8");

  test("una espera larga se programa, no se finge", () => {
    // El bloque «Espera» dejaba elegir horas y se ejecutaba en cero segundos:
    // el «recuérdaselo en 2 h» salía en el mismo instante. No se puede dormir
    // dentro del webhook de Meta, así que se apunta y se retoma después.
    esperar(wa.includes("esperas_pendientes")).verdadero(
      "una espera que no cabe en el webhook tiene que quedar programada",
    );
    esperar(wa.includes("retomarEn")).verdadero(
      "al despertar hay que retomar por el bloque exacto, no por el principio del flujo",
    );
  });

  test("dormido no es lo mismo que mudo", () => {
    // La red de seguridad pasa con un agente al cliente cuando el bot no dijo
    // nada. Una conversación en pausa NO puede caer ahí: está esperando su
    // recordatorio, no abandonada.
    const i = wa.indexOf("nextAwait === null && !ctx.dijoAlgo");
    esperar(i > 0).verdadero("no encuentro la red de seguridad del silencio");
    esperar(wa.slice(i, i + 120).includes("enPausa")).verdadero(
      "una conversación dormida no debe activar el rescate por silencio",
    );
  });

  test("si el lead escribe durante la pausa, la espera se cancela", () => {
    // Si no, el bot le contesta a algo que ya no viene a cuento — la charla
    // siguió por otro lado mientras dormía.
    esperar(wa.includes("cancelar_esperas_de")).verdadero(
      "un mensaje nuevo del lead tiene que cancelar lo que estuviera programado",
    );
  });

  test("al despertar se respeta la ventana de 24 h", () => {
    // Es LA diferencia entre una espera corta y una larga: cuando vence el
    // reloj pueden haber pasado horas, y fuera de la ventana WhatsApp no deja
    // escribir. Mandarlo igual deja en la Bandeja un mensaje que nunca llegó.
    const i = wa.indexOf("async function retomarEspera");
    esperar(i > 0).verdadero("no encuentro el punto de entrada del reloj");
    const bloque = wa.slice(i, i + 4000);
    esperar(/horas\s*>=\s*24/.test(bloque)).verdadero(
      "al retomar hay que comprobar la ventana de 24 h antes de escribir",
    );
    esperar(bloque.includes("caducada")).verdadero(
      "fuera de la ventana la espera se marca caducada, no se manda igual",
    );
  });

  test("el reloj no necesita ninguna llave guardada", () => {
    // La alternativa era dejar la llave de servicio dentro de la definición del
    // cron, que cualquiera con acceso a `cron.job` puede leer. Cada espera
    // lleva su propio testigo de un solo uso.
    const i = wa.indexOf("async function retomarEspera");
    const bloque = wa.slice(i, i + 1200);
    esperar(bloque.includes("testigo")).verdadero(
      "retomar se autoriza con el testigo de esa espera, no con un secreto compartido",
    );
  });
});

// ─── Tareas programadas ──────────────────────────────────────────────────────
describe("Tareas programadas", () => {
  test("ninguna tarea depende de un secreto que hay que pegar a mano", () => {
    // La tarea de Google Sheets estuvo 4.859 ejecuciones seguidas siendo
    // rechazada con 401: se registró con el texto de ejemplo
    // «PEGA_AQUI_TU_SECRETO» y `CRON_SECRET` nunca existió en Netlify. Nadie se
    // enteró porque el registro del cron decía «succeeded» — el SQL sí corría;
    // lo que fallaba era la petición HTTP, que se guarda en otra tabla.
    //
    // Ahora la base emite un ticket de un solo uso y no hay nada que copiar.
    const rutas = ARCHIVOS.filter(
      (f) => f.ruta.startsWith("src/app/api/") && /x-demandu-cron|CRON_SECRET/.test(sinComentarios(f.texto)),
    );
    const sinTicket = rutas
      .filter((f) => !f.texto.includes("llamadaDeTareaProgramada"))
      .map((f) => f.ruta);
    esperar(sinTicket.join(", ")).igual(
      "",
      "hay endpoints de tarea programada que siguen comprobando el secreto a mano",
    );
  });

  test("el ticket se comprueba y se gasta en una sola operación", () => {
    // Comprobar y marcar por separado deja pasar dos peticiones simultáneas.
    const lib = fs.readFileSync(path.join(RAIZ, "src/lib/cron.ts"), "utf8");
    esperar(lib.includes("usar_ticket_de_cron")).verdadero(
      "el ticket tiene que consumirse en la base, no comprobarse desde fuera",
    );
    esperar(lib.includes("p_proposito")).verdadero(
      "un ticket sirve para UN propósito: si no, el de una tarea abre la puerta de otra",
    );
  });
});

// ─── El agente con herramientas ──────────────────────────────────────────────
describe("Agente de IA con herramientas", () => {
  const wa = fs.readFileSync(path.join(RAIZ, "supabase/functions/whatsapp/index.ts"), "utf8");

  test("sin herramientas activadas, se comporta igual que antes", () => {
    // Nadie que solo quería un bot que contesta puede notar que existe todo
    // esto. `tools` solo se manda si el cliente activó alguna.
    esperar(/if \(tools\.length\) cuerpo\.tools = tools;/.test(wa)).verdadero(
      "el campo de herramientas solo debe mandarse cuando hay alguna activada",
    );
  });

  test("lo que el modelo pide se valida contra el catálogo del cliente", () => {
    // La regla que sostiene el diseño: la capacidad es código, la política es
    // dato del cliente. Si el modelo se inventa una etiqueta y la aceptamos,
    // el embudo del negocio deja de significar nada.
    //
    // Quien valida es la BASE (`poner_etiqueta`), no el motor: hay dos motores
    // y esta regla no puede divergir. Además la base sabe de GRUPOS, que es lo
    // que impide que un lead quede «alto» y «medio» a la vez.
    const i = wa.indexOf('case "etiquetar"');
    esperar(i > 0).verdadero("no encuentro la herramienta de etiquetar");
    const bloque = wa.slice(i, i + 2200);
    esperar(bloque.includes('rpc("poner_etiqueta"')).verdadero(
      "etiquetar tiene que pasar por la base, que es quien conoce el catálogo y los grupos",
    );
    esperar(bloque.includes("no existe")).verdadero(
      "cuando la etiqueta no existe hay que decirle al modelo cuáles sí, para que corrija",
    );
    esperar(!/juntas\.add|new Set<string>\(c\.tags/.test(bloque)).verdadero(
      "el motor no puede volver a juntar etiquetas a mano: así fue como un lead quedó en dos niveles",
    );
  });

  test("el modelo nunca elige a qué dirección se llama", () => {
    // Si pudiera, bastaría con convencerlo para hacernos pedir cualquier
    // dirección de internet desde nuestros servidores.
    const i = wa.indexOf('case "consultar_sistema"');
    esperar(i > 0).verdadero("no encuentro la herramienta de consultar el sistema");
    const bloque = wa.slice(i, i + 500);
    esperar(bloque.includes("ai.sistemaUrl")).verdadero(
      "la dirección tiene que salir de la configuración del cliente, no de lo que pida el modelo",
    );
  });

  test("el ciclo de herramientas tiene tope", () => {
    // Esto corre dentro del webhook de Meta, que reintenta si tardamos.
    const m = wa.match(/MAX_VUELTAS\s*=\s*(\d+)/);
    esperar(!!m).verdadero("el ciclo de herramientas necesita un tope de vueltas");
    esperar(Number(m[1]) <= 6).verdadero("un tope alto deja que un bucle agote el tiempo del webhook");
  });

  test("si el agente pasa con una persona, el bloque se detiene", () => {
    // Si no, el bot seguiría conversando después de haber dicho que lo atiende
    // alguien — y el siguiente mensaje del cliente es para esa persona.
    esperar(wa.includes("if (ctx.pasoAHumano) return null;")).verdadero(
      "tras pasar con una persona el bloque de IA no puede seguir esperando preguntas",
    );
  });

  // ── LOS DOS MOTORES ────────────────────────────────────────────────────────
  //
  // Las herramientas están escritas dos veces —Deno en la función de WhatsApp,
  // Node en `src/lib/ai/herramientas.ts`— porque son runtimes distintos y no
  // pueden compartir archivo. En este proyecto los dos motores YA se
  // desincronizaron dos veces (el respaldo del RAG que hacía inventar datos, y
  // la regla de texto plano), y las dos veces se descubrió en producción.
  //
  // Esta prueba es el guardián de esa duplicación.
  const web = fs.readFileSync(path.join(RAIZ, "src/lib/ai/herramientas.ts"), "utf8");
  /**
   * Los `case` de UNA función, no los del archivo entero.
   *
   * La primera versión de esto cortaba desde `ejecutarHerramienta` hasta el
   * final del archivo y se traía los `case` del motor de flujos —"start",
   * "delay", "media"…— como si fueran herramientas. La prueba fallaba por un
   * motivo falso, que es la otra forma de que una prueba no sirva.
   */
  const casesDeLaFuncion = (texto, firma) => {
    const desde = texto.indexOf(firma);
    if (desde < 0) return new Set();
    const resto = texto.slice(desde + firma.length);
    const hasta = resto.search(/\n(export )?(async )?function /);
    const cuerpo = hasta < 0 ? resto : resto.slice(0, hasta);
    return new Set([...cuerpo.matchAll(/case "([a-z_]+)": \{/g)].map((m) => m[1]));
  };

  test("los dos motores conocen exactamente las mismas herramientas", () => {
    const enWa = casesDeLaFuncion(wa, "async function ejecutarHerramienta");
    const enWeb = casesDeLaFuncion(web, "export async function ejecutarHerramienta");

    // Guardián del guardián: si el regex deja de casar, los dos conjuntos
    // salen vacíos y la comparación pasaría sin comparar nada. Ya pasó con
    // otras tres pruebas de este archivo.
    esperar(enWa.size >= 6).verdadero(
      `leí ${enWa.size} herramientas en el motor de WhatsApp; esperaba al menos 6 — el regex ya no casa`,
    );
    esperar(enWeb.size >= 6).verdadero(
      `leí ${enWeb.size} herramientas en el motor web; esperaba al menos 6 — el regex ya no casa`,
    );

    const soloWa = [...enWa].filter((n) => !enWeb.has(n));
    const soloWeb = [...enWeb].filter((n) => !enWa.has(n));
    esperar(soloWa.length === 0).verdadero(
      `WhatsApp tiene herramientas que el canal web no: ${soloWa.join(", ")}`,
    );
    esperar(soloWeb.length === 0).verdadero(
      `el canal web tiene herramientas que WhatsApp no: ${soloWeb.join(", ")}`,
    );
  });

  test("el motor web también valida contra el catálogo del cliente", () => {
    // Mismo motivo que en WhatsApp: el modelo propone, la base decide.
    const i = web.indexOf('case "etiquetar"');
    esperar(i > 0).verdadero("no encuentro la herramienta de etiquetar en el motor web");
    const bloque = web.slice(i, i + 2200);
    esperar(bloque.includes('rpc("poner_etiqueta"')).verdadero(
      "etiquetar tiene que pasar por la base, que es quien conoce el catálogo y los grupos",
    );
    esperar(bloque.includes("no existe")).verdadero(
      "cuando la etiqueta no existe hay que decirle al modelo cuáles sí, para que corrija",
    );
    esperar(!/juntas\.add|new Set<string>\(c\.tags/.test(bloque)).verdadero(
      "el motor no puede volver a juntar etiquetas a mano: así fue como un lead quedó en dos niveles",
    );
  });

  test("no se puede calificar sin decir en qué te basas", () => {
    // Un lead se calificó como «alto» en el primer mensaje, antes de que la
    // conversación hubiera empezado y contra el criterio que el cliente había
    // escrito. Pedirle al modelo «espera a saberlo» dentro del prompt no basta:
    // hay que obligarle a NOMBRAR lo que la persona dijo. Cuando no hay nada
    // que citar, se nota — y queda escrito para quien lo audite después.
    for (const [donde, texto] of [["WhatsApp", wa], ["canal web", web]]) {
      const i = texto.indexOf('name: "etiquetar"');
      esperar(i > 0).verdadero(`no encuentro la herramienta de etiquetar en ${donde}`);
      const bloque = texto.slice(i, i + 2600);
      esperar(bloque.includes('required: ["etiqueta", "por_que", "en_que_me_baso"]')).verdadero(
        `en ${donde}, citar la evidencia tiene que ser OBLIGATORIO, no opcional`,
      );
      esperar(bloque.includes("NO llames a esta herramienta")).verdadero(
        `en ${donde} hay que decirle explícitamente que pregunte antes de calificar`,
      );
    }
  });

  test("el bloque de etiquetas del flujo también respeta los grupos", () => {
    // La regla «solo una del grupo» tiene que valer para los DOS caminos. Si
    // el bloque del constructor siguiera juntando etiquetas a mano, un flujo
    // podría dejar a un lead como «alto» y «bajo» a la vez — justo el problema
    // que se arregló en el agente.
    const i = wa.indexOf("async function etiquetar(ctx: any, node: any)");
    esperar(i > 0).verdadero("no encuentro el bloque de etiquetas del flujo");
    const bloque = wa.slice(i, i + 2200);
    esperar(bloque.includes('rpc("poner_etiqueta"')).verdadero(
      "poner etiquetas desde el flujo tiene que pasar por la base, que conoce los grupos",
    );
    esperar(!/for \(const id of poner\) \{ const n = nombre\.get\(id\); if \(n\) actuales\.add\(n\); \}/.test(bloque)).verdadero(
      "el bloque no puede volver a añadir etiquetas a mano: así se acumulan las de un mismo grupo",
    );
  });

  test("los dos motores encienden acciones desde el prompt igual", () => {
    // El «/» del prompt está implementado dos veces (Deno y Node). Si uno
    // reconociera una acción que el otro no, el mismo prompt haría cosas
    // distintas en WhatsApp y en la web — la peor clase de diferencia, porque
    // el cliente no tiene forma de verla.
    const claves = (t) => {
      const i = t.indexOf("CLAVES_DE_ACCION");
      const j = t.indexOf("]", i);
      return [...t.slice(i, j).matchAll(/"([a-z_]+)"/g)].map((m) => m[1]).sort();
    };
    const cat = fs.readFileSync(path.join(RAIZ, "src/lib/ai/acciones.ts"), "utf8");
    const enWa = claves(wa);
    esperar(enWa.length >= 6).verdadero(`leí ${enWa.length} acciones en el motor; el regex ya no casa`);

    const enCatalogo = [...cat.matchAll(/clave: "([a-z_]+)"/g)].map((m) => m[1]).sort();
    esperar(enCatalogo.length >= 6).verdadero("el catálogo se leyó vacío: el regex ya no casa");
    esperar(JSON.stringify(enWa) === JSON.stringify(enCatalogo)).verdadero(
      `el motor conoce [${enWa}] y el catálogo [${enCatalogo}]`,
    );

    // Y la expresión que las busca tiene que ser la misma en los dos sitios.
    const patron = /\(\^\|\[\\s\(\]\)\\\/\(\[a-z_\]\+\)/;
    esperar(patron.test(wa)).verdadero("el motor de WhatsApp no usa la expresión estricta");
    esperar(patron.test(cat)).verdadero("el catálogo no usa la expresión estricta");
  });

  test("el «/» está en las DOS pantallas donde se escribe un prompt", () => {
    // Solo en Lana IA no sirve: quien arma un bot con flujo escribe el prompt
    // en el Inspector del constructor, y ahí pulsaba «/» y no salía nada.
    for (const [donde, ruta] of [
      ["Lana IA", "src/app/(dashboard)/bots/[id]/ai/page.tsx"],
      ["el constructor", "src/components/builder/Inspector.tsx"],
    ]) {
      const t = fs.readFileSync(path.join(RAIZ, ruta), "utf8");
      esperar(t.includes("<EditorDePrompt")).verdadero(
        `en ${donde} el prompt tiene que escribirse con el editor que trae el «/»`,
      );
      esperar(!/<textarea[^>]*name="persona"/.test(t) && !/<textarea[^>]*systemPrompt/.test(t)).verdadero(
        `en ${donde} quedó un textarea suelto: ahí el «/» no funcionaría`,
      );
    }
  });

  test("una promesa de pasar con una persona SE CUMPLE", () => {
    // El modelo a veces narra la acción en vez de ejecutarla: escribe «un
    // asesor se va a comunicar contigo» y no llama a la herramienta. El lead
    // espera a alguien que no va a llegar, y la promesa la hizo el bot en
    // nombre del negocio. Pasó el 1 sep.
    for (const [donde, texto] of [["WhatsApp", wa], ["canal web", web]]) {
      esperar(texto.includes("cumplirLoPrometido")).verdadero(
        `el motor de ${donde} tiene que cumplir el pase que el bot prometió`,
      );
      esperar(texto.includes("prometioUnaPersona")).verdadero(
        `el motor de ${donde} tiene que detectar la promesa en el texto`,
      );
    }
    // Y tiene que estar ENCHUFADO, no solo escrito.
    const answer = fs.readFileSync(path.join(RAIZ, "src/lib/ai/answer.ts"), "utf8");
    esperar(answer.includes("await cumplirLoPrometido(")).verdadero(
      "el canal web lo tiene escrito pero no lo llama",
    );
    esperar(/return await cumplirLoPrometido\(ctx, texto, tools\)/.test(wa)).verdadero(
      "el motor de WhatsApp lo tiene escrito pero no lo llama",
    );
  });

  test("la lista REAL de acciones se le dice al modelo, y al final", () => {
    // Un prompt del cliente puede nombrar herramientas que no existen —pasó con
    // `crear_lead_hubspot`— y el modelo se cree esa lista. La nuestra va la
    // última: lo último que se lee es lo que manda.
    for (const [donde, texto] of [["WhatsApp", wa], ["canal web", web]]) {
      esperar(texto.includes("ACCIONES QUE PUEDES EJECUTAR DE VERDAD")).verdadero(
        `el motor de ${donde} tiene que decirle cuáles son sus herramientas reales`,
      );
      esperar(texto.includes("NO ANUNCIES LO QUE NO EJECUTAS")).verdadero(
        `el motor de ${donde} tiene que prohibir anunciar acciones sin ejecutarlas`,
      );
      const i = texto.indexOf("ACCIONES QUE PUEDES EJECUTAR DE VERDAD");
      const j = texto.indexOf("Criterios del negocio");
      esperar(i > j && j > 0).verdadero(
        `en ${donde}, la lista real tiene que ir DESPUÉS del prompt y los criterios del cliente`,
      );
    }
  });

  test("un dato con casilla propia se guarda TAMBIÉN en la casilla", () => {
    // El bot pidió el correo, la persona lo dio, el bot dijo «registrado» y la
    // casilla «Correo» de la ficha seguía vacía: se había guardado solo como
    // atributo. Para el agente que abre esa ficha, el dato no existía.
    for (const [donde, texto] of [["WhatsApp", wa], ["canal web", web]]) {
      esperar(texto.includes("CASILLA_DE_LA_FICHA")).verdadero(
        `el motor de ${donde} tiene que llevar el correo a su casilla, no solo a los atributos`,
      );
      esperar(/if \(casilla\) cambios\[casilla\] = valor;/.test(texto)).verdadero(
        `el motor de ${donde} tiene la tabla pero no la usa`,
      );
    }
  });

  test("ningún motor reparte por su cuenta", () => {
    // El reparto lo hace un disparador de la base (migración 0016 + 0064). Si
    // un motor además repartiera, habría dos repartos pisándose y nadie sabría
    // cuál decidió.
    for (const [donde, texto] of [["WhatsApp", wa], ["canal web", web]]) {
      esperar(!texto.includes("repartir_conversacion")).verdadero(
        `el motor de ${donde} no debe elegir agente: eso lo hace el disparador de la base`,
      );
    }
  });

  test("el motor web tampoco deja que el modelo elija la dirección", () => {
    const i = web.indexOf('case "consultar_sistema"');
    esperar(i > 0).verdadero("no encuentro la herramienta de consultar el sistema en el motor web");
    esperar(web.slice(i, i + 500).includes("ai.sistemaUrl")).verdadero(
      "la dirección tiene que salir de la configuración del cliente, no de lo que pida el modelo",
    );
  });

  test("una herramienta nunca toca la ficha de otra organización", () => {
    // Las herramientas corren con el cliente de administración, que se salta
    // RLS. El filtro por organización es la ÚNICA barrera que queda.
    const i = web.indexOf("async function fichaDeLaConversacion");
    esperar(i > 0).verdadero("no encuentro cómo el motor web resuelve la ficha de la persona");
    const bloque = web.slice(i, i + 900);
    esperar((bloque.match(/\.eq\("org_id", ctx\.orgId\)/g) ?? []).length >= 2).verdadero(
      "la conversación Y el contacto tienen que filtrarse por organización",
    );
  });

  test("la prueba del panel no deja rastro en los datos del negocio", () => {
    // Probar la IA desde el panel no puede etiquetar contactos ni agendar
    // citas de verdad. Sin contexto de agente, no se arma ninguna herramienta.
    const respuesta = fs.readFileSync(path.join(RAIZ, "src/lib/ai/answer.ts"), "utf8");
    esperar(/opts\.agente\s*\n?\s*\?\s*await armarHerramientas/.test(respuesta)).verdadero(
      "las herramientas solo deben armarse cuando hay una conversación real donde actuar",
    );
    esperar(respuesta.includes("|| !opts.agente")).verdadero(
      "sin contexto de agente el ciclo tiene que devolver el texto y parar, nunca ejecutar nada",
    );
  });

  test("el canal web se detiene cuando el agente pasa con una persona", () => {
    const motorWeb = fs.readFileSync(path.join(RAIZ, "src/lib/flow/webRuntime.ts"), "utf8");
    esperar(motorWeb.includes("if (agente.pasoAHumano)")).verdadero(
      "tras pasar con una persona el bloque de IA del canal web no puede seguir esperando preguntas",
    );
  });
});

// ─── Origen de campaña (Click to WhatsApp) ───────────────────────────────────
//
// Meta manda un objeto `referral` cuando alguien llega desde un anuncio de
// Facebook o Instagram. Hasta la v36 el motor NI LO MIRABA: se perdía en cada
// mensaje, y con él la única forma de saber qué anuncio trae gente que compra.
describe("Origen de campaña", () => {
  const wa = fs.readFileSync(path.join(RAIZ, "supabase/functions/whatsapp/index.ts"), "utf8");

  test("el motor lee el referral de Meta", () => {
    esperar(wa.includes("origenDelAnuncio(msg.referral)")).verdadero(
      "hay que leer `referral` del mensaje: es donde Meta manda de qué anuncio viene",
    );
  });

  test("se guarda el objeto crudo, no solo lo que hoy sabemos leer", () => {
    // Los campos de Meta cambian y se añaden. Si solo guardáramos los que hoy
    // entendemos, el día que añadan uno útil lo habríamos estado tirando
    // durante meses sin enterarnos.
    const i = wa.indexOf("function origenDelAnuncio");
    esperar(i > 0).verdadero("no encuentro el normalizador del origen");
    esperar(wa.slice(i, i + 2500).includes("crudo: referral")).verdadero(
      "hay que guardar el referral tal cual además de lo normalizado",
    );
  });

  test("un anuncio de Estados sin ctwa_clid también cuenta", () => {
    // Meta OMITE `ctwa_clid` en los anuncios colocados en Estados de WhatsApp.
    // Exigirlo dejaría fuera esa colocación entera sin que nadie entienda por qué.
    const i = wa.indexOf("function origenDelAnuncio");
    const bloque = wa.slice(i, i + 2500);
    esperar(bloque.includes("if (!anuncioId && !clid) return null;")).verdadero(
      "basta con el id del anuncio O el clid; exigir los dos rompe los anuncios de Estados",
    );
  });

  test("el primer toque del contacto no se pisa", () => {
    // Quién trajo al cliente y qué disparó esta venta son preguntas distintas,
    // y marketing necesita las dos. La decisión la toma la base.
    const mig = fs.readFileSync(path.join(RAIZ, "supabase/migrations/0065_origen_de_campana.sql"), "utf8");
    esperar(mig.includes("set origen = coalesce(c.origen, p_origen)")).verdadero(
      "el origen del CONTACTO es el primer toque y no se sobrescribe",
    );
    esperar(/update public\.conversations\s+set origen = p_origen/.test(mig)).verdadero(
      "el de la CONVERSACIÓN sí se actualiza: una segunda venta es de la segunda campaña",
    );
  });

  test("un fallo de atribución nunca deja al cliente sin respuesta", () => {
    const i = wa.indexOf('rpc("guardar_origen"');
    esperar(i > 0).verdadero("no encuentro dónde se guarda el origen");
    // Tiene que estar dentro de un try/catch: la atribución es importante, la
    // conversación lo es más.
    esperar(wa.slice(Math.max(0, i - 300), i).includes("try {")).verdadero(
      "guardar el origen tiene que ir en un try: si falla, el bot igual contesta",
    );
  });

  test("el marcador [cmp:] se lee DESPUÉS de tener el texto del mensaje", () => {
    // Se escribió al revés la primera vez: la línea usaba `visible` 23 líneas
    // antes de declararlo. En JavaScript eso no avisa al escribirlo, revienta
    // en producción con «Cannot access before initialization» — y revienta el
    // webhook entero, no solo la atribución.
    const uso = wa.indexOf("origenDelEnlace(visible");
    const decl = wa.indexOf("const visible =");
    esperar(uso > 0 && decl > 0).verdadero("no encuentro el uso o la declaración de `visible`");
    esperar(uso > decl).verdadero("`visible` se usa antes de declararse: eso tumba el webhook");
  });
});

// ─── La métrica de campañas ──────────────────────────────────────────────────
describe("Resultados: leads por campaña", () => {
  // SIN LOS COMENTARIOS. La primera versión de estas pruebas fallaba contra un
  // código correcto: el comentario que explica «esto NO lleva security
  // definer» contiene esas dos palabras, y la prueba las encontraba. Una
  // prueba que reacciona a la prosa no está mirando el código.
  const mig = fs
    .readFileSync(path.join(RAIZ, "supabase/migrations/0067_metrica_de_campanas.sql"), "utf8")
    .replace(/^\s*--.*$/gm, "");
  const pagina = fs.readFileSync(
    path.join(RAIZ, "src/app/(dashboard)/analytics/page.tsx"), "utf8",
  );

  test("la consulta NO se salta el aislamiento entre clientes", () => {
    // ESTA PRUEBA EXISTE POR UN FALLO REAL. La primera versión se aplicó con
    // `security definer`, que lee saltándose RLS. Como la organización llega
    // por parámetro, cualquier usuario con sesión podía pedir el id de otra
    // empresa y ver sus campañas. Es la peor clase de bug de un multi-cliente:
    // no se nota nunca hasta que se nota en la prensa.
    esperar(/security\s+definer/i.test(mig)).falso(
      "esta función lee datos de contactos: con `security definer` se salta RLS",
    );
    esperar(mig.includes("p_org not in (select auth_org_ids())")).verdadero(
      "hay que comprobar a la cara que la organización es de quien pregunta",
    );
  });

  test("las campañas se ordenan por número, no por texto", () => {
    // `jsonb_agg(x order by x->>'leads' desc)` ordena CADENAS: "9" va después
    // de "10". La campaña con más leads acababa al final de la tabla.
    esperar(/order by\s+x->>/.test(mig)).falso(
      "ordenar por un campo de jsonb es ordenar por texto: 10 quedaría antes que 9",
    );
    esperar((mig.match(/order by leads desc/g) ?? []).length >= 2).verdadero(
      "el orden va sobre la columna numérica, en las dos listas",
    );
  });

  test("un contacto sin origen no cuenta como campaña", () => {
    // La diferencia entre «llegaron 11 leads, 2 por anuncios» y «llegaron 11
    // por anuncios» es la que decide si se sube o se baja el presupuesto.
    esperar(mig.includes("ct.origen is not null")).verdadero(
      "solo cuentan como campaña los contactos que traen origen",
    );
  });

  test("la pantalla de Resultados la pide y la dibuja", () => {
    esperar(pagina.includes('sb.rpc("analytics_campanas"')).verdadero(
      "la tarjeta no sirve de nada si la página no pide los datos",
    );
    esperar(pagina.includes("<Campanas datos=")).verdadero("hay que dibujar la tarjeta");
  });

  test("si la métrica falla, el resto del tablero se sigue viendo", () => {
    // Son quince números en la misma pantalla. Que uno no cargue no puede
    // dejar en blanco a los otros catorce.
    const i = pagina.indexOf("const campanas");
    esperar(i > 0).verdadero("no encuentro dónde se leen los datos de campañas");
    // Se busca el objeto por defecto EN SÍ, no un «??» cerca. La primera
    // versión de esta prueba miraba los 400 caracteres siguientes y pasaba con
    // el respaldo borrado: el «??» que encontraba era el de la línea de abajo,
    // que no tiene nada que ver. Una prueba que pasa sin el código que prueba
    // es peor que no tenerla, porque da tranquilidad falsa.
    const asignacion = pagina.slice(i, i + 400);
    esperar(asignacion.includes("total_con_campana: 0")).verdadero(
      "hace falta un respaldo vacío: sin él, un error de esta consulta deja la pantalla en blanco",
    );
  });

  test("no se promete separar Facebook de Instagram", () => {
    // WhatsApp manda el MISMO objeto para las dos: no dice la colocación.
    // Pintar dos barras sería repartir a ojo un número que no tenemos, y
    // alguien movería dinero con él.
    const tarjeta = fs.readFileSync(
      path.join(RAIZ, "src/components/analytics/Campanas.tsx"), "utf8",
    );
    esperar(tarjeta.includes('meta: "Facebook e Instagram"')).verdadero(
      "Meta va en una sola fila mientras el webhook no distinga la colocación",
    );
    // Se mira el MAPA de nombres, no el archivo entero: el texto explicativo
    // que ve el cliente sí nombra a Instagram, y debe hacerlo.
    const i = tarjeta.indexOf("const NOMBRE");
    const mapa = tarjeta.slice(i, tarjeta.indexOf("}", i));
    esperar(/instagram/i.test(mapa.replace(/Facebook e Instagram/g, ""))).falso(
      "no puede haber otra fila que separe Instagram: el webhook no da ese dato",
    );
  });
});

// ─── Qué flujo atiende ───────────────────────────────────────────────────────
//
// El 31 ago un bot se quedó mudo: dos flujos con la palabra clave «AI», uno de
// ellos SIN NINGÚN BLOQUE. El motor se quedaba con el primero que coincidiera,
// y si le tocaba el vacío no ejecutaba nada. Además no había ningún orden, así
// que unas veces habría funcionado y otras no.
describe("Qué flujo atiende", () => {
  const wa = fs.readFileSync(path.join(RAIZ, "supabase/functions/whatsapp/index.ts"), "utf8");
  const web = fs.readFileSync(path.join(RAIZ, "src/lib/flow/webRuntime.ts"), "utf8");

  test("un flujo sin bloques nunca compite por un disparador", () => {
    for (const [donde, texto] of [["WhatsApp", wa], ["canal web", web]]) {
      esperar(texto.includes("function flujosQuePuedenAtender")).verdadero(
        `el motor de ${donde} tiene que descartar los flujos vacíos antes de elegir`,
      );
      esperar(/\.filter\(\(f: any\) => \(f\?\.graph\?\.nodes\?\.length \?\? 0\) > 0\)/.test(texto)).verdadero(
        `el motor de ${donde} tiene que filtrar por número de bloques`,
      );
      esperar(/const flows = flujosQuePuedenAtender\(entrantes\);/.test(texto)).verdadero(
        `el motor de ${donde} tiene que USAR el filtro, no solo tenerlo escrito`,
      );
    }
  });

  test("con dos flujos empatados siempre gana el mismo", () => {
    // Sin orden, la base devuelve las filas como quiere: el bot funciona unas
    // veces sí y otras no, y quien lo reporta parece que se lo inventa.
    for (const [donde, texto] of [["WhatsApp", wa], ["canal web", web]]) {
      esperar(texto.includes("(b.priority ?? 0) - (a.priority ?? 0)")).verdadero(
        `el motor de ${donde} tiene que ordenar por prioridad`,
      );
      esperar(texto.includes('String(b.updated_at ?? "").localeCompare(String(a.updated_at ?? ""))')).verdadero(
        `en empate, el motor de ${donde} tiene que quedarse con el editado más recientemente`,
      );
    }
  });

  test("los dos motores piden a la base los datos con los que ordenan", () => {
    // Ordenar por `priority` sin haberla traído la deja siempre en undefined:
    // el orden parecería estar puesto y no ordenaría nada.
    const ruta = fs.readFileSync(path.join(RAIZ, "src/app/api/webchat/route.ts"), "utf8");
    for (const [donde, texto] of [["WhatsApp", wa], ["canal web", ruta]]) {
      const i = texto.indexOf('.select("id, name, graph, trigger_type, keywords, enabled');
      esperar(i > 0).verdadero(`no encuentro la consulta de flujos del ${donde}`);
      esperar(texto.slice(i, i + 140).includes("priority, updated_at")).verdadero(
        `la consulta del ${donde} tiene que traer priority y updated_at o el orden no ordena nada`,
      );
    }
  });
});

// ─── Calificar sin depender del modelo ───────────────────────────────────────
//
// Pedirle a un modelo «etiqueta lead-bajo si gana menos de 890» funciona casi
// siempre, y «casi» no sirve para una regla con dinero detrás. En la prueba del
// 1 sep la IA capturó bien el ingreso (500) y aun así no etiquetó.
describe("Calificación automática", () => {
  const mig = fs.readFileSync(
    path.join(RAIZ, "supabase/migrations/0066_calificacion_automatica.sql"), "utf8");

  test("la regla la aplica la BASE, no el motor", () => {
    // Si viviera en un motor, el otro no la aplicaría — y ya van tres veces que
    // los dos motores se desincronizan.
    esperar(mig.includes("create trigger contacts_calificar")).verdadero(
      "tiene que dispararse solo al cambiar la ficha",
    );
    esperar(mig.includes("after insert or update of attributes, email, phone, name, company")).verdadero(
      "tiene que mirar los DATOS, no las etiquetas",
    );
  });

  test("etiquetar no vuelve a disparar la calificación", () => {
    // `poner_etiqueta` solo toca `tags`; si el disparador escuchara `tags`,
    // calificar provocaría calificar y sería un bucle infinito en producción.
    const i = mig.indexOf("after insert or update of");
    esperar(!/after insert or update of[^\n]*\btags\b/.test(mig.slice(i, i + 200))).verdadero(
      "el disparador NO puede escuchar `tags`: se llamaría a sí mismo",
    );
    esperar(mig.includes("pg_trigger_depth() > 1")).verdadero(
      "y hace falta el segundo cinturón por si alguien añade otro disparador",
    );
  });

  test("sin dato NO se califica: desconocido no es lo mismo que bajo", () => {
    // Sin esto, «menor que 890» se cumpliría para todo contacto nuevo y el
    // primer mensaje de cualquiera lo marcaría como lead bajo.
    esperar(mig.includes("if coalesce(trim(p_valor), '') = '' then return false; end if;")).verdadero(
      "una ficha sin el dato no cumple ninguna comparación",
    );
  });

  test("los números se leen aunque vengan sucios", () => {
    // La gente escribe «1000 dolitas» y «$1,200.50». Comparar eso como texto
    // diría que 1000 es menor que 900, porque "1" va antes que "9".
    esperar(mig.includes("replace(p_valor, ',', '')")).verdadero(
      "hay que quitar los separadores de miles antes de leer el número",
    );
    esperar(mig.includes("'-?[0-9]+\\.?[0-9]*'")).verdadero(
      "hay que extraer el número del texto en vez de convertir la cadena entera",
    );
  });

  test("una regla mal escrita no tumba la conversación", () => {
    // `sinComentarios` quita comentarios de JavaScript; esto es SQL, donde
    // empiezan por `--`. Entre `exception` y `return false` va la línea que
    // explica el porqué, y sin quitarla el regex nunca llega al código.
    const sinSQL = mig.replace(/^\s*--.*$/gm, "");
    esperar(/exception when others then\s+return false;/.test(sinSQL)).verdadero(
      "si la comparación revienta, se devuelve falso y el chat sigue",
    );
  });

  test("la pantalla para escribirlas existe y está enchufada", () => {
    const pantalla = fs.readFileSync(path.join(RAIZ, "src/app/(dashboard)/settings/tags/page.tsx"), "utf8");
    esperar(pantalla.includes("<ReglasDeCalificacion")).verdadero(
      "sin pantalla, la función existe y nadie puede usarla",
    );
    const acciones = fs.readFileSync(path.join(RAIZ, "src/app/(dashboard)/settings/actions.ts"), "utf8");
    esperar(acciones.includes("reglas_de_calificacion")).verdadero(
      "y hacen falta las acciones para crearlas y quitarlas",
    );
  });
});

// ─── Guardar tiene que decir que guardó ──────────────────────────────────────
//
// El 1 sep, Alex le dio a «Guardar configuración» en Lana IA y no pasó nada en
// pantalla: misma página, mismos campos, cero señal. SÍ había guardado — en la
// base estaban las cuatro herramientas—, pero él concluyó, con razón, que el
// botón estaba roto. Un formulario que guarda en silencio es un formulario
// roto aunque el dato llegue.
describe("Guardar dice que guardó", () => {
  // La señal EXACTA del caso bueno, no un prefijo. La primera versión de esta
  // prueba comprobaba solo `?guardado=`, y seguía pasando al borrar el aviso
  // de éxito porque el de error también lo contiene. Una prueba que pasa sin
  // comparar lo que importa es peor que no tenerla.
  const PANTALLAS = [
    ["Lana IA", "src/app/(dashboard)/bots/[id]/ai/actions.ts", "src/app/(dashboard)/bots/[id]/ai/page.tsx", "guardado=si"],
    ["Horario laboral", "src/app/(dashboard)/settings/actions.ts", "src/app/(dashboard)/settings/hours/page.tsx", "saved=1"],
  ];

  for (const [nombre, accion, pantalla, exito] of PANTALLAS) {
    test(`${nombre}: la acción avisa y la pantalla lo enseña`, () => {
      const a = fs.readFileSync(path.join(RAIZ, accion), "utf8");
      const p = fs.readFileSync(path.join(RAIZ, pantalla), "utf8");
      esperar(a.includes(`?${exito}`)).verdadero(
        `${nombre}: al guardar BIEN hay que volver con la señal de éxito`,
      );
      esperar(p.includes("searchParams")).verdadero(
        `${nombre}: la pantalla tiene que leer esa señal`,
      );
      esperar(/guardad|Guardad|guardó/.test(p)).verdadero(
        `${nombre}: y decirlo con palabras que la persona entienda`,
      );
    });
  }

  test("Lana IA también avisa si NO se pudo guardar", () => {
    // Peor que no avisar del éxito es no avisar del fallo: la persona se va
    // creyendo que su bot quedó configurado.
    const a = fs.readFileSync(path.join(RAIZ, "src/app/(dashboard)/bots/[id]/ai/actions.ts"), "utf8");
    esperar(a.includes("if (error)")).verdadero(
      "hay que mirar el error de la base, no descartarlo",
    );
    esperar(a.includes("guardado=no")).verdadero(
      "y contárselo a quien acaba de pulsar Guardar",
    );
  });
});

// ─── El aviso de "no se está entregando" ─────────────────────────────────────
describe("Avisos de la Bandeja", () => {
  test("el aviso de no entregado mira el ÚLTIMO envío, no cualquiera que falló", () => {
    // Buscar «el último mensaje que tenga el fallo» deja el aviso rojo puesto
    // para siempre después de un solo rechazo, aunque el bot siga contestando
    // con normalidad delante de los ojos del dueño. Pasó: un bloque de
    // catálogo falló el 28 ago y el aviso seguía tres días después.
    const inbox = fs.readFileSync(path.join(RAIZ, "src/components/inbox/InboxClient.tsx"), "utf8");
    esperar(inbox.includes('find((m) => m.direction === "outbound")')).verdadero(
      "hay que mirar el último mensaje SALIENTE y ver si ese falló",
    );
    esperar(!/find\(\(m\) => m\.payload\?\.no_entregado\)/.test(inbox)).verdadero(
      "no vale buscar cualquier mensaje fallido del historial: eso no dice si el canal funciona ahora",
    );
  });
});

// ─── Recuperar la contraseña ─────────────────────────────────────────────────
//
// Esto NO existía. Quien olvidaba su contraseña se quedaba fuera de su cuenta
// para siempre: no había pantalla, ni enlace, ni ruta. Y no se notaba porque
// nada fallaba — sencillamente no estaba. Se descubrió el 31 ago, buscando el
// enlace en la pantalla de entrar.
describe("Recuperar la contraseña", () => {
  test("la pantalla de entrar ofrece recuperar la contraseña", () => {
    const form = fs.readFileSync(path.join(RAIZ, "src/components/AuthForm.tsx"), "utf8");
    esperar(form.includes('href="/recuperar"')).verdadero(
      "sin este enlace, quien olvida su contraseña no tiene ninguna salida dentro del producto",
    );
    esperar(fs.existsSync(path.join(RAIZ, "src/app/(auth)/recuperar/page.tsx"))).verdadero(
      "el enlace tiene que llevar a una pantalla que exista",
    );
  });

  test("el enlace del correo pasa por el canje de sesión", () => {
    const rec = fs.readFileSync(path.join(RAIZ, "src/components/RecuperarForm.tsx"), "utf8");
    esperar(rec.includes("/auth/callback?next=")).verdadero(
      "el enlace tiene que volver por una dirección ya permitida en Supabase",
    );
    esperar(rec.includes("resetPasswordForEmail")).verdadero(
      "la recuperación la manda Supabase por correo; aquí no se toca ninguna contraseña",
    );
  });

  // ── LO QUE SE ROMPIÓ DE VERDAD ────────────────────────────────────────────
  //
  // La primera versión usaba el flujo PKCE, que guarda un secreto EN EL
  // NAVEGADOR que pidió el enlace. Alex pidió el enlace desde Chrome y el
  // correo de iCloud le abrió Safari: el enlace lo devolvió al login con un
  // párrafo en inglés sobre "PKCE code verifier". Las pruebas estáticas de
  // entonces pasaban todas, porque comprobaban que las piezas existían y
  // ninguna comprobaba que el camino funcionara.
  //
  // Estas tres cubren cada eslabón del camino real. No sustituyen recorrerlo
  // de punta a punta, pero cada una falla si alguien deshace el arreglo.

  test("el enlace sirve aunque se abra en otro navegador o en el teléfono", () => {
    const rec = fs.readFileSync(path.join(RAIZ, "src/components/RecuperarForm.tsx"), "utf8");
    esperar(/flowType:\s*"implicit"/.test(rec)).verdadero(
      "con PKCE el enlace solo vale en el navegador que lo pidió, y la gente abre el correo en el teléfono",
    );
  });

  test("la pantalla recoge la sesión que viene en el enlace", () => {
    // La sesión llega en el trozo (`#access_token=…`), que el servidor NO ve.
    // Si nadie la recoge, la persona escribe su contraseña nueva y al guardar
    // recibe un error — enterándose en el peor momento.
    const form = fs.readFileSync(path.join(RAIZ, "src/components/FormularioDeContrasena.tsx"), "utf8");
    esperar(form.includes("window.location.hash")).verdadero(
      "hay que leer el trozo de la dirección: ahí viene la sesión del enlace del correo",
    );
    esperar(form.includes("setSession")).verdadero(
      "el trozo hay que canjearlo por una sesión de verdad antes de poder guardar la contraseña",
    );
    esperar(form.includes("history.replaceState")).verdadero(
      "hay que limpiar el trozo de la barra: si no, ese enlace lleva una sesión dentro y se reenvía sin darse cuenta",
    );
    esperar(/hidden=\{sesion !== "lista"\}/.test(form)).verdadero(
      "sin sesión no se enseña el formulario: escribir la contraseña dos veces para que falle es la peor forma de enterarse",
    );
  });

  test("nunca se le enseña al cliente el mensaje crudo del SDK", () => {
    // Lo que se vio en pantalla: "PKCE code verifier not found in storage…
    // For SSR frameworks (Next.js, SvelteKit, etc.)". Quien lo lee no entiende
    // qué hizo mal, y parece que la plataforma se rompió.
    const cb = fs.readFileSync(path.join(RAIZ, "src/app/auth/callback/route.ts"), "utf8");
    esperar(!/error=\$\{encodeURIComponent\(error\.message\)\}/.test(cb)).verdadero(
      "el mensaje de Supabase va a la consola, no a la pantalla de entrar",
    );
    esperar(/code verifier\|pkce/i.test(cb)).verdadero(
      "hay que traducir el fallo del enlace abierto en otro navegador a algo accionable",
    );
  });

  test("un enlace sin código pero con destino no se trata como un fallo", () => {
    // El enlace de recuperación llega SIN `code` a propósito. Antes esto caía
    // en "Faltó el código de acceso" y el enlace bueno parecía roto.
    // Se comparan SIN comentarios: el porqué de este caso ocupa nueve líneas,
    // y un trozo fijo del archivo se las come enteras y no llega al código.
    const cb = sinComentarios(fs.readFileSync(path.join(RAIZ, "src/app/auth/callback/route.ts"), "utf8"));
    const i = cb.indexOf("if (!code)");
    esperar(i > 0).verdadero("no encuentro el caso de enlace sin código");
    esperar(cb.slice(i, i + 300).includes("if (pedido) return")).verdadero(
      "sin código pero con destino, hay que seguir al destino: la sesión viaja en el trozo de la URL",
    );
  });

  test("no se le dice a un extraño si un correo tiene cuenta", () => {
    // Si el mensaje cambiara según exista o no la cuenta, cualquiera podría ir
    // probando direcciones para averiguar quién es cliente de Demandu.
    const rec = fs.readFileSync(path.join(RAIZ, "src/components/RecuperarForm.tsx"), "utf8");
    esperar(/setEnviado\(true\);\s*\};/.test(rec)).verdadero(
      "el aviso de «revisa tu correo» tiene que salir siempre, haya cuenta o no",
    );
    esperar(!/no (existe|est[aá] registrad)/i.test(rec)).verdadero(
      "ningún mensaje puede revelar que ese correo no tiene cuenta",
    );
  });
});

// ─── A dónde va cada quien al entrar ─────────────────────────────────────────
describe("Puerta de entrada", () => {
  const marco = fs.readFileSync(path.join(RAIZ, "src/app/(dashboard)/layout.tsx"), "utf8");

  test("alguien del equipo sin organización propia no acaba en un panel de cliente vacío", () => {
    // El login manda a todos a /dashboard. Un vendedor NO tiene organización
    // —dejó de tenerla a propósito para no ensuciar la lista de clientes— así
    // que veía el panel de un cliente vacío: sin chatbots, sin conversaciones,
    // sin poder crear nada. Parecía una plataforma rota.
    esperar(marco.includes('redirect("/panel")')).verdadero(
      "el marco del panel tiene que desviar a /panel a quien es del equipo y no tiene organización",
    );
    const i = marco.indexOf('redirect("/panel")');
    const antes = marco.slice(Math.max(0, i - 700), i);
    esperar(antes.includes("equipo_demandu")).verdadero(
      "el desvío tiene que comprobar que de verdad es del equipo, no desviar a cualquiera sin organización",
    );
    esperar(antes.includes("getCurrentOrgId")).verdadero(
      "solo se desvía a quien NO tiene ninguna organización: dando soporte sí tiene una y debe quedarse",
    );
  });
});

// ─── Poder salir ─────────────────────────────────────────────────────────────
//
// ESTAS PRUEBAS EXISTEN POR UNA PERSONA ATRAPADA. Darwin, vendedor, no podía
// salir de la plataforma: pulsaba «Salir» y no pasaba nada. No era su
// navegador ni sus permisos — el botón era un `<Link href="/login">` que no
// cerraba ninguna sesión, y los tres desvíos se pasaban la pelota en círculo:
//
//   /panel → «Salir» → /login → el middleware ve sesión → /dashboard
//          → el marco ve equipo sin organización → /panel
//
// Cada pieza por separado estaba bien pensada. El bucle solo existe al
// juntarlas, que es justo lo que una prueba de una sola pieza no ve.
describe("Poder salir de la plataforma", () => {
  const salir = fs.readFileSync(path.join(RAIZ, "src/app/salir.ts"), "utf8");
  const panel = fs.readFileSync(path.join(RAIZ, "src/app/panel/layout.tsx"), "utf8");
  const superadmin = fs.readFileSync(path.join(RAIZ, "src/app/superadmin/layout.tsx"), "utf8");
  const medio = fs.readFileSync(path.join(RAIZ, "src/lib/supabase/middleware.ts"), "utf8");

  test("cerrar sesión de verdad cierra la sesión", () => {
    esperar(salir.includes("auth.signOut()")).verdadero(
      "sin `signOut` esto es un enlace disfrazado: la galleta sigue viva y no sales de nada",
    );
    esperar(salir.includes('"use server"')).verdadero(
      "tiene que ser una acción de servidor: la galleta solo se puede borrar desde el servidor",
    );
  });

  test("salir cierra también el soporte abierto en la cuenta de un cliente", () => {
    // Irse a casa dentro de la cuenta de un cliente no puede dejar ese acceso
    // vivo una hora más sin nadie delante.
    esperar(salir.includes("cerrarSoporte(user.id)")).verdadero(
      "al salir hay que cerrar la membresía temporal de soporte",
    );
  });

  test("las dos casas del equipo tienen una salida real, no un enlace", () => {
    for (const [nombre, marco] of [["panel de ventas", panel], ["superadmin", superadmin]]) {
      esperar(marco.includes("cerrarSesion")).verdadero(
        `el ${nombre} necesita un botón que cierre sesión de verdad`,
      );
      esperar(/href="\/login"/.test(marco)).falso(
        `en el ${nombre}, un enlace a /login NO saca a nadie: con sesión viva el middleware lo devuelve`,
      );
    }
  });

  test("el bucle sigue siendo un bucle, y por eso hace falta la salida", () => {
    // Esta prueba vigila la PREMISA. Si algún día el middleware deja de rebotar
    // a quien va a /login con sesión, la salida del panel deja de ser lo único
    // que rompe el círculo — y entonces conviene enterarse leyendo esto, no
    // volviendo a atrapar a alguien.
    esperar(medio.includes("user && isAuthPage")).verdadero(
      "el middleware devuelve al panel a quien va a /login con la sesión viva",
    );
    esperar(panel.includes("cerrarSesion")).verdadero(
      "mientras eso siga así, /panel es la única puerta de salida y no puede perderla",
    );
  });
});

// ─── El webhook de Instagram ─────────────────────────────────────────────────
describe("Instagram: la puerta de entrada", () => {
  const firma = fs.readFileSync(path.join(RAIZ, "src/lib/canales/instagramFirma.ts"), "utf8");
  // SIN COMENTARIOS, y esto ya me ha mordido dos veces hoy: el comentario que
  // explica «no uses req.json() aquí» contiene esa llamada, y la prueba la
  // encontraba y fallaba contra un código correcto. Una prueba que reacciona a
  // la prosa no está mirando el código.
  const ruta = sinComentarios(
    fs.readFileSync(path.join(RAIZ, "src/app/api/webhooks/instagram/route.ts"), "utf8"),
  );

  test("la firma se compara en tiempo constante", () => {
    // ESTA PRUEBA ES ESTÁTICA A PROPÓSITO, y es la única forma de vigilar esto.
    // Se comprobó mutando el código: cambiar `timingSafeEqual` por `===` deja
    // pasar TODAS las pruebas funcionales, porque el resultado es idéntico y lo
    // único que cambia es cuánto tarda en darlo. Esa diferencia de
    // microsegundos es justo lo que deja adivinar una firma byte a byte.
    esperar(firma.includes("timingSafeEqual(mio, suyo)")).verdadero(
      "la firma tiene que compararse con timingSafeEqual, nunca con === ni con localeCompare",
    );
  });

  test("el cuerpo se lee CRUDO, no con req.json()", () => {
    // El HMAC se calcula sobre los bytes exactos que mandó Meta. Parsear y
    // volver a serializar cambia espacios y orden, y entonces una firma
    // perfectamente válida se rechazaría: el webhook dejaría de funcionar
    // entero y el motivo no se ve por ningún lado.
    const i = ruta.indexOf("const crudo = await req.text()");
    esperar(i > 0).verdadero("hay que leer el cuerpo como texto para poder verificar la firma");
    const antes = ruta.slice(0, i);
    esperar(antes.includes("req.json()")).falso(
      "si se parsea antes de firmar, el HMAC ya no cuadra con lo que mandó Meta",
    );
  });

  test("sin firma válida no se procesa nada", () => {
    // El orden importa: primero la firma, después todo lo demás. Este endpoint
    // es público y sin sesión; la firma es lo único que lo separa de un
    // formulario abierto a internet.
    const iFirma = ruta.indexOf("firmaValida(crudo");
    const iLeer = ruta.indexOf("leerEventos(cuerpo)");
    esperar(iFirma > 0 && iLeer > 0).verdadero("no encuentro la verificación o el procesado");
    esperar(iFirma < iLeer).verdadero("la firma se comprueba ANTES de procesar, no después");
  });

  test("se contesta 200 aunque algo falle procesando", () => {
    // Si Meta recibe un error, reintenta; y si reintenta muchas veces,
    // DESACTIVA la suscripción del cliente. Un fallo tonto con un mensaje no
    // puede acabar en «a este cliente le dejó de funcionar Instagram» sin que
    // nadie sepa desde cuándo.
    const i = ruta.indexOf("const eventos = leerEventos(cuerpo)");
    esperar(ruta.slice(Math.max(0, i - 200), i).includes("try {")).verdadero(
      "procesar va dentro de un try: un fallo no puede hacer que Meta desactive el webhook",
    );
  });

  test("no se atiende dos veces el mismo mensaje", () => {
    // Meta reintenta. Sin esto el bot contesta dos veces al mismo mensaje, que
    // es de las cosas que más rápido hacen que un cliente pierda la confianza.
    esperar(ruta.includes("mensajes_vistos")).verdadero(
      "hace falta anotar el mensaje para no atenderlo en un reintento",
    );
  });

  test("el consentimiento NO exige página de Facebook", () => {
    // ESTA ES LA REGLA DE NEGOCIO, no una preferencia técnica: la mayoría de
    // los clientes de esta plataforma no tienen página de Facebook. El camino
    // de «Inicio de sesión con Facebook para empresas» funcionaba —se probó de
    // punta a punta y conectaba— pero exigía la página, y eso convierte cada
    // alta en una llamada a soporte explicando cómo crear algo que el cliente
    // no quiere.
    //
    // Los tres anfitriones de Meta NO son intercambiables, y confundirlos da
    // errores que culpan a otra cosa. Aquí se vigila el de la autorización.
    const integ = sinComentarios(
      fs.readFileSync(path.join(RAIZ, "src/lib/integrations/instagram.ts"), "utf8"),
    );
    esperar(integ.includes("https://www.instagram.com/oauth/authorize")).verdadero(
      "el permiso se pide en instagram.com: el de facebook.com es el camino que exige página",
    );
    esperar(/graph\.facebook\.com|www\.facebook\.com\/v\d/.test(integ)).falso(
      "no puede quedar ninguna llamada al camino de Facebook: arrastraría el requisito de la página",
    );

    const i = integ.indexOf("export function urlDeConsentimiento");
    esperar(i > 0).verdadero("no encuentro la construcción de la URL de consentimiento");
    const bloque = integ.slice(i, i + 700);
    esperar(bloque.includes("config_id")).falso(
      "`config_id` es del camino de Facebook para empresas; aquí los permisos van en `scope`",
    );
    esperar(/scope\s*:/.test(bloque)).verdadero("sin `scope` Instagram no pide ningún permiso");
    esperar(bloque.includes("NEXT_PUBLIC_INSTAGRAM_APP_ID")).verdadero(
      "son las credenciales de la app de INSTAGRAM, no las de Facebook que usa WhatsApp",
    );
  });

  test("se piden los tres permisos, y solo esos", () => {
    // Copiados de la integración de referencia que sí funciona. Cada permiso
    // extra hay que justificarlo con vídeo en la revisión de la app, y uno que
    // no se usa es imposible de justificar — así que pedir de más retrasa la
    // aprobación de todos.
    const integ = sinComentarios(
      fs.readFileSync(path.join(RAIZ, "src/lib/integrations/instagram.ts"), "utf8"),
    );
    const i = integ.indexOf("PERMISOS_INSTAGRAM");
    const bloque = integ.slice(i, integ.indexOf("join(\",\")", i) + 12);
    const pedidos = [...bloque.matchAll(/"(instagram_[a-z_]+)"/g)].map((m) => m[1]).sort();
    esperar(pedidos).igual(
      ["instagram_business_basic", "instagram_business_manage_comments", "instagram_business_manage_messages"],
      "la lista de permisos cambió: si es a propósito, hay que rehacer la revisión de la app en Meta",
    );
  });

  test("el consentimiento NO lleva force_reauth ni enable_fb_login", () => {
    // ESTOS DOS COSTARON UNA TARDE ENTERA. Se añadieron «por seguridad» y por
    // una hipótesis equivocada, y con ellos el CANJE DEL CÓDIGO falla con un
    // error que culpa a la `redirect_uri` — estando la URI correcta y
    // comprobada tres veces. La integración de referencia no manda ninguno.
    const integ = sinComentarios(
      fs.readFileSync(path.join(RAIZ, "src/lib/integrations/instagram.ts"), "utf8"),
    );
    esperar(integ.includes("force_reauth")).falso("force_reauth rompe el canje del código");
    esperar(integ.includes("enable_fb_login")).falso("enable_fb_login arrastra el camino de Facebook");
  });

  test("el envío va por graph.instagram.com", () => {
    // Cada camino de Meta tiene su anfitrión y NO son intercambiables. Con un
    // token de Instagram Login, `graph.facebook.com` responde con un error de
    // permisos que hace perder horas buscando un permiso que no falta.
    const env = sinComentarios(
      fs.readFileSync(path.join(RAIZ, "src/lib/canales/instagramEnviar.ts"), "utf8"),
    );
    esperar(env.includes("https://graph.instagram.com")).verdadero("el anfitrión tiene que ser graph.instagram.com");
    esperar(env.includes("graph.facebook.com")).falso("ese anfitrión es del otro camino y rechaza este token");
  });

  test("el token se canjea por uno de 60 días", () => {
    // ESTO ES UNA BOMBA DE RELOJERÍA SI SE HACE MAL. El canje directo devuelve
    // un token de UNA HORA. Guardarlo daría una conexión que funciona en la
    // demo y se cae esa misma tarde, sin ningún error que lo explique.
    const integ = sinComentarios(
      fs.readFileSync(path.join(RAIZ, "src/lib/integrations/instagram.ts"), "utf8"),
    );
    // SE BUSCA EL `grant_type`, no la cadena suelta: el nombre del canje
    // aparece también en prosa y en la función de renovación, así que buscarlo
    // a secas dejaría pasar el canje desactivado. Ya pasó con el equivalente
    // del otro camino y se descubrió mutando el código.
    esperar(/grant_type:\s*"ig_exchange_token"/.test(integ)).verdadero(
      "hay que cambiar el token corto de una hora por el largo de 60 días",
    );
    const iCorto = integ.indexOf('append("grant_type", "authorization_code")');
    const iLargo = integ.search(/grant_type:\s*"ig_exchange_token"/);
    esperar(iCorto > 0 && iLargo > iCorto).verdadero(
      "el canje largo va DESPUÉS del corto: es el token corto lo que se cambia",
    );
  });

  test("la respuesta del canje se lee de data[0], no de la raíz", () => {
    // Instagram devuelve {"data":[{access_token,user_id,permissions}]} —
    // ENVUELTO. Leerlo de la raíz hace que un canje CORRECTO se trate como
    // fallido: el peor error posible, porque el problema real ya está resuelto
    // y el síntoma sigue siendo exactamente el mismo.
    const integ = sinComentarios(
      fs.readFileSync(path.join(RAIZ, "src/lib/integrations/instagram.ts"), "utf8"),
    );
    esperar(/Array\.isArray\(\s*j1\?\.data\s*\)/.test(integ)).verdadero(
      "el canje tiene que mirar dentro de `data[0]`",
    );
  });

  test("se suscribe la cuenta, no solo se guarda", () => {
    // Configurar el webhook en Meta dice A DÓNDE mandar los avisos; suscribir
    // la cuenta dice DE QUIÉN. Sin esto todo parece conectado y no llega nada
    // — el síntoma más desconcertante que hay.
    const cb = sinComentarios(
      fs.readFileSync(path.join(RAIZ, "src/app/api/integrations/instagram/callback/route.ts"), "utf8"),
    );
    esperar(cb.includes("suscribirCuenta(")).verdadero("hay que suscribir la cuenta al conectar");
    esperar(cb.includes("sin_suscribir")).verdadero(
      "si la suscripción falla hay que decirlo: un «conectado» que no recibe mensajes es mentira",
    );
  });

  test("al cliente no se le enseña jerga de programador", () => {
    // ESTA PRUEBA EXISTE POR UN MENSAJE QUE SÍ SE PUBLICÓ. Un aviso de la
    // pantalla de Conexión decía literalmente «Falta configurar la dirección
    // pública de la plataforma en el servidor (NEXT_PUBLIC_SITE_URL)... Meta
    // rechaza el inicio de sesión con "Invalid redirect_uri"». Quien lo leyó
    // vende chatbots, no despliega servidores: no podía hacer nada con eso
    // salvo asustarse y pensar que había roto algo.
    //
    // Ya existía la misma regla para recuperar contraseña («nunca se le enseña
    // al cliente el mensaje crudo del SDK»). Esto la extiende a los avisos de
    // conexión, que es por donde se coló.
    const pagina = fs.readFileSync(
      path.join(RAIZ, "src/app/(dashboard)/bots/[id]/install/page.tsx"), "utf8",
    );

    // Solo los textos que ve el cliente: los mapas de avisos y de errores.
    const desde = pagina.indexOf("const AVISO_IG");
    const hasta = pagina.indexOf("export default");
    esperar(desde > 0 && hasta > desde).verdadero("no encuentro los mensajes de la pantalla");
    const mensajes = sinComentarios(pagina.slice(desde, hasta));

    // Nombres de variables de entorno: MAYUSCULAS_CON_GUION_BAJO.
    const variables = mensajes.match(/\b[A-Z][A-Z0-9]*(_[A-Z0-9]+){2,}\b/g) ?? [];
    esperar(variables.join(", ")).igual(
      "",
      "un mensaje para el cliente nombra una variable del servidor: eso no le sirve de nada",
    );

    // Parámetros crudos de la API de Meta.
    const jerga = ["redirect_uri", "client_id", "access_token", "hub.challenge", "webhook", "endpoint"]
      .filter((p) => mensajes.toLowerCase().includes(p.toLowerCase()));
    esperar(jerga.join(", ")).igual(
      "",
      "un mensaje para el cliente usa vocabulario de la API de Meta en vez de decirle qué le pasa a él",
    );
  });

  test("la suscripción va contra «me», no contra el id", () => {
    // ESTE ES EL ÚNICO ENDPOINT DEL CAMINO QUE NO ACEPTA EL ID. Con el id
    // contesta «Object with ID … does not exist, cannot be loaded due to
    // missing permissions, or does not support this operation»: nombra tres
    // causas y la buena es la tercera, así que se busca un permiso que no
    // falta. La cuenta queda guardada y no llega ni un mensaje.
    const integ = sinComentarios(
      fs.readFileSync(path.join(RAIZ, "src/lib/integrations/instagram.ts"), "utf8"),
    );
    esperar(integ.includes("/me/subscribed_apps")).verdadero(
      "suscribir tiene que ir contra `me`: el token ya dice de qué cuenta hablamos",
    );
    esperar(/\$\{\s*\w*[iI]g\w*Id\s*\}\/subscribed_apps/.test(integ)).falso(
      "volvió el id en la ruta de suscripción: eso es exactamente lo que fallaba",
    );
  });

  test("se guarda el id de la CUENTA, no el que devuelve el canje", () => {
    // DOS IDENTIFICADORES QUE SE PARECEN Y NO SON LO MISMO. El canje devuelve
    // el id de la app; los endpoints y los avisos del webhook usan el de la
    // cuenta profesional, que viene de `/me?fields=user_id`. Guardar el
    // primero deja una conexión que parece buena y por la que no entra nada.
    const integ = sinComentarios(
      fs.readFileSync(path.join(RAIZ, "src/lib/integrations/instagram.ts"), "utf8"),
    );
    esperar(/me\?fields=user_id,username/.test(integ)).verdadero(
      "hay que preguntarle a Meta el id de la cuenta, no dar por bueno el del canje",
    );
    esperar(/igUserId:\s*idDeLaCuenta\s*\|\|\s*igUserId/.test(integ)).verdadero(
      "el id de la cuenta tiene que MANDAR sobre el del canje, con este de respaldo",
    );
  });

  test("las respuestas del bot no se guardan dos veces", () => {
    // EL MOTOR GUARDA EN LA BANDEJA PARA EL WIDGET DE LA WEB, donde no hay nada
    // que «enviar» y el visitante lee lo que haya en `messages`. Instagram
    // manda por la API de Meta y guarda ÉL, porque solo él sabe si la entrega
    // falló. Con los dos guardando, cada respuesta salía duplicada en la
    // Bandeja: al cliente le llegaba una vez y el equipo veía dos.
    esperar(ruta.includes("guardarEnBandeja: false")).verdadero(
      "el canal de Instagram tiene que decirle al motor que no guarde: guarda él",
    );
    const motor = fs.readFileSync(path.join(SRC, "lib/flow/webRuntime.ts"), "utf8");
    esperar(/opts\.guardarEnBandeja === false/.test(sinComentarios(motor))).verdadero(
      "el motor tiene que respetar esa opción, o la bandera no sirve de nada",
    );
    // Y que siga guardando por defecto: el widget de la web depende de ello.
    esperar(/guardarEnBandeja\?:\s*boolean/.test(motor)).verdadero(
      "la opción es opcional a propósito: sin ella, el motor guarda, que es lo que necesita la web",
    );
  });

  test("la firma se comprueba con la clave de INSTAGRAM", () => {
    // LA APP QUE MANDA ESTE WEBHOOK ES LA DE INSTAGRAM, no la de Facebook: son
    // dos apps con dos claves distintas. Verificar solo con la de Facebook
    // rechaza todo con un 401 — y ese 401 es invisible: Meta cree que entregó,
    // la pantalla dice «conectado», y no llega ni un mensaje. Pasó de verdad.
    esperar(ruta.includes("INSTAGRAM_APP_SECRET")).verdadero(
      "el webhook de Instagram tiene que aceptar la clave de la app de Instagram",
    );
    const i = ruta.indexOf("INSTAGRAM_APP_SECRET");
    const j = ruta.indexOf("META_APP_SECRET");
    esperar(j > 0 && i < j).verdadero(
      "la de Instagram va primero: es la que firma este canal, la otra es el respaldo",
    );
  });

  test("una firma que no cuadra deja rastro", () => {
    // Un 401 solo en consola es un fallo perfecto: Meta reintenta, después
    // DESACTIVA la suscripción del cliente, y no queda nada que mirar porque
    // los registros de Netlify solo se transmiten en vivo.
    esperar(ruta.includes("webhook_firma")).verdadero(
      "rechazar por firma tiene que quedar apuntado en la base, no solo en consola",
    );
    const i = ruta.indexOf("firma inválida\", { status: 401 }");
    esperar(i > 0).verdadero("no encuentro el rechazo por firma");
    esperar(ruta.slice(Math.max(0, i - 200), i).includes("firmaNoCuadra")).verdadero(
      "hay que anotar ANTES de contestar 401",
    );
  });

  test("ni la firma ni las claves acaban en el apunte", () => {
    // El apunte se guarda en la base y lo puede leer quien entre a diagnosticar.
    // Sirve saber QUÉ claves se probaron —por su nombre— y un trozo del cuerpo;
    // jamás el valor de una clave ni la firma que mandó Meta.
    const cuerpo = ruta.slice(ruta.indexOf("async function firmaNoCuadra"));
    const hasta = cuerpo.indexOf("\n}");
    const fn = cuerpo.slice(0, hasta);
    esperar(/\$\{\s*cabecera\s*\}/.test(fn)).falso("la firma de Meta no se guarda");
    esperar(/APP_SECRET/.test(fn)).falso("ninguna clave puede aparecer en el apunte");
  });

  test("un chatbot no se queda con dos cuentas de Instagram", () => {
    // LA CLAVE ÚNICA ES `ig_user_id`, NO `bot_id`, así que nada impedía que un
    // chatbot acabara con dos. Y pasó de verdad: al corregir el identificador,
    // la cuenta se guardó con el id bueno y la fila del id viejo se quedó,
    // ambas diciendo ser la misma @cuenta. La pantalla de Conexión las busca
    // con `maybeSingle()`, que con dos filas revienta.
    const cb = sinComentarios(
      fs.readFileSync(path.join(RAIZ, "src/app/api/integrations/instagram/callback/route.ts"), "utf8"),
    );
    const i = cb.indexOf(".delete()");
    esperar(i > 0).verdadero("al conectar hay que retirar la cuenta anterior de ese chatbot");
    const bloque = cb.slice(Math.max(0, i - 300), i + 200);
    esperar(bloque.includes('.eq("bot_id"')).verdadero("el borrado tiene que ir acotado al chatbot");
    esperar(bloque.includes('.neq("ig_user_id"')).verdadero(
      "y tiene que EXCLUIR la que se acaba de guardar: si no, se borra a sí misma",
    );
  });

  test("un aviso para una cuenta desconocida deja rastro", () => {
    // El `return` silencioso de un webhook sin canal es por donde se cae el
    // fallo más difícil de ver: la pantalla dice «conectado», Meta dice que
    // entregó, y no pasa nada. Sin apunte no queda nada que mirar.
    const wh = sinComentarios(
      fs.readFileSync(path.join(RAIZ, "src/app/api/webhooks/instagram/route.ts"), "utf8"),
    );
    esperar(wh.includes("webhook_sin_cuenta")).verdadero(
      "hay que anotar el id que mandó Meta cuando no encontramos la cuenta",
    );
    const i = wh.indexOf("if (!canal)");
    esperar(i > 0).verdadero("no encuentro la salida silenciosa del webhook");
    esperar(wh.slice(i, i + 160).includes("noHayCanal")).verdadero(
      "esa salida tiene que dejar constancia antes de volverse silenciosa",
    );
  });

  test("se suscribe la CUENTA de Instagram, no ninguna página", () => {
    // Suscribir el id equivocado devuelve éxito y no llega ni un mensaje: el
    // fallo más desconcertante de toda la integración, porque todo dice
    // «conectado». En este camino no hay página de por medio, así que el id que
    // vale es el de la cuenta de Instagram.
    const cb = sinComentarios(
      fs.readFileSync(path.join(RAIZ, "src/app/api/integrations/instagram/callback/route.ts"), "utf8"),
    );
    esperar(cb.includes("suscribirCuenta(c.igUserId")).verdadero(
      "se suscribe la cuenta de Instagram (`igUserId`), que es la que recibe los mensajes",
    );
    esperar(/page_id:\s*c\.pageId/.test(cb)).falso(
      "no hay página que guardar: eso es del camino que exige página de Facebook",
    );
  });

  test("ninguna pantalla le pide al cliente una página de Facebook", () => {
    // El requisito de la página es EXACTAMENTE lo que se quitó, y es fácil que
    // sobreviva en un texto: el cliente leería que necesita algo que no
    // necesita y abandonaría el alta antes de intentarlo.
    const boton = fs.readFileSync(path.join(RAIZ, "src/components/builder/ConnectButton.tsx"), "utf8");
    const i = boton.indexOf('{channel === "instagram" && (');
    const j = boton.indexOf('{channel === "messenger" && (');
    esperar(i > 0 && j > i).verdadero("no encuentro el bloque de Instagram del diálogo de conexión");
    // Sin comentarios: lo que importa es lo que LEE el cliente.
    const visible = sinComentarios(boton.slice(i, j));
    esperar(/no necesitas página de facebook/i.test(visible)).verdadero(
      "hay que decirle que NO hace falta página: es la duda que frena el alta",
    );
    esperar(/(ligada|vinculada|conectada) a (la|una) página/i.test(visible)).falso(
      "queda un texto que pide ligar la cuenta a una página de Facebook",
    );

    const pagina = fs.readFileSync(
      path.join(RAIZ, "src/app/(dashboard)/bots/[id]/install/page.tsx"), "utf8",
    );
    const mensajes = sinComentarios(
      pagina.slice(pagina.indexOf("const AVISO_IG"), pagina.indexOf("export default")),
    );
    esperar(/página de facebook/i.test(mensajes)).falso(
      "un mensaje de error sigue nombrando la página de Facebook",
    );
  });

  test("el secreto de la app NUNCA puede acabar en un mensaje de error", () => {
    // Los fallos de conexión se guardan en la base para poder diagnosticarlos
    // después. Eso es útil y es justo lo que hizo falta aquí — pero convierte
    // cualquier dato metido en un mensaje de error en un dato ALMACENADO. Del
    // secreto se apunta su largo y si trae espacios pegados; su valor, jamás.
    // SIN COMENTARIOS, Y ESTA ES LA TERCERA VEZ QUE HACE FALTA EN ESTE ARCHIVO.
    // Los comentarios llevan comillas invertidas para citar código, y al buscar
    // plantillas en el texto crudo una comilla de un comentario se empareja con
    // otra del código de más abajo: nace una «plantilla» que no existe y la
    // prueba falla contra código correcto. Una alarma que suena sola enseña a
    // ignorar las alarmas, que es peor que no tenerla.
    const integ = sinComentarios(
      fs.readFileSync(path.join(RAIZ, "src/lib/integrations/instagram.ts"), "utf8"),
    );

    // El único sitio donde la variable puede aparecer es en el cuerpo de la
    // petición a Meta. En ninguna plantilla de texto.
    const enPlantillas = [...integ.matchAll(/`[^`]*`/g)]
      .map((m) => m[0])
      .filter((t) => /\$\{\s*secreto\s*\}/.test(t));
    esperar(enPlantillas.join(" | ")).igual(
      "",
      "el valor del secreto se está interpolando en un texto: acabaría guardado en la base",
    );

    esperar(integ.includes("secreto_largo=${secreto.length}")).verdadero(
      "del secreto se apunta el largo, que es lo que sirve para diagnosticar sin filtrarlo",
    );

    // El diagnóstico compara la clave de Instagram con la de Facebook —las dos
    // son 32 hexadecimales y están una debajo de la otra en el panel, así que
    // pegar la que no es da un error que culpa a la redirect_uri. Comparar es
    // legítimo; INTERPOLAR el valor de la de Facebook sería el mismo agujero
    // que se acaba de cerrar con la otra.
    const fbEnPlantillas = [...integ.matchAll(/`[^`]*`/g)]
      .map((m) => m[0])
      .filter((t) => /\$\{[^}]*META_APP_SECRET[^}]*\}/.test(t));
    esperar(fbEnPlantillas.join(" | ")).igual(
      "",
      "el valor de la clave de Facebook se está interpolando en un texto: acabaría guardado en la base",
    );
  });

  test("el login solo arranca desde el dominio registrado en Meta", () => {
    // ESTA PRUEBA EXISTE POR UN FALLO REAL. La misma plataforma responde en
    // varios dominios a la vez —el propio, el de la rama de Netlify, el de
    // cualquier vista previa— y la URL de retorno se construía a partir del
    // dominio desde el que navegabas. Entrar por el de Netlify mandaba a Meta
    // una dirección que no es la registrada, y Meta contestaba «Invalid
    // redirect_uri»: un error que no dice qué esperaba ni qué recibió.
    const start = sinComentarios(
      fs.readFileSync(path.join(RAIZ, "src/app/api/integrations/instagram/start/route.ts"), "utf8"),
    );
    esperar(start.includes("NEXT_PUBLIC_SITE_URL")).verdadero(
      "hay que partir de la dirección pública configurada, no de la que traiga la petición",
    );
    esperar(start.includes("origen !== canonico")).verdadero(
      "si se entra por otro dominio hay que llevar a la persona al bueno antes de ir a Meta",
    );
    const iCompr = start.indexOf("origen !== canonico");
    const iMeta = start.indexOf("urlDeConsentimiento(");
    esperar(iCompr > 0 && iMeta > iCompr).verdadero(
      "la comprobación va ANTES de mandar a nadie a Meta: después ya es un error incomprensible",
    );
  });

  test("el turno de la respuesta privada se pide ANTES de enviar", () => {
    // Meta permite UNA respuesta privada por comentario. Si se enviara primero
    // y se anotara después, dos entregas del mismo webhook mandarían dos y la
    // segunda se estrellaría — habiendo quemado el único disparo.
    const iTurno = ruta.indexOf("tomar_turno_respuesta_privada");
    const iEnvio = ruta.indexOf("responderEnPrivado(canal.ig_user_id");
    esperar(iTurno > 0 && iEnvio > 0).verdadero("no encuentro el turno o el envío privado");
    esperar(iTurno < iEnvio).verdadero(
      "primero se pide el turno, después se envía: al revés se pierde el único disparo",
    );
  });
});

// ─── La barrera entre servidor y navegador ───────────────────────────────────
describe("Servidor y navegador", () => {
  test("ningún componente de cliente importa un módulo de solo-servidor", () => {
    // ESTA PRUEBA EXISTE POR UN DESPLIEGUE ROTO. `SalidasCrm.tsx` («use
    // client») importaba `@/lib/salidas`, que empieza con `import
    // "server-only"`. Eso NO es un aviso: rompe el build entero. Netlify se
    // quedó sirviendo la versión anterior y un endpoint nuevo daba 404 con el
    // código perfectamente subido — que es de las cosas más difíciles de
    // diagnosticar, porque todo «parece» estar bien.
    //
    // La barrera `server-only` existe para que una llave de servicio no acabe
    // en el navegador. Se hereda por importación, así que hay que respetarla
    // por importación.
    const soloServidor = new Set(
      ARCHIVOS.filter((f) => /^import\s+"server-only"/m.test(f.texto))
        .map((f) => "@/" + f.ruta.replace(/^src\//, "").replace(/\.(ts|tsx)$/, "")),
    );

    const rotos = [];
    for (const { ruta, texto } of ARCHIVOS) {
      if (!/^\s*"use client"/m.test(texto)) continue;
      for (const m of texto.matchAll(/from\s+"(@\/[^"]+)"/g)) {
        if (soloServidor.has(m[1])) rotos.push(`${ruta} → ${m[1]}`);
      }
    }
    esperar(rotos.join(", ")).igual("", "un componente de cliente importa código de solo-servidor: eso rompe el build");
  });
});


// ─── El menú de la izquierda ─────────────────────────────────────────────────
describe("El menú lleva a alguna parte", () => {
  // TODAS las direcciones que existen de verdad, sacadas de los `page.tsx`.
  // Los grupos entre paréntesis —«(dashboard)»— no salen en la dirección: son
  // solo carpetas para compartir marco.
  const APP = path.join(SRC, "app");
  const RUTAS = new Set(
    listar(APP, /^page\.tsx$/).map((f) =>
      "/" +
      path
        .relative(APP, path.dirname(f))
        .split(path.sep)
        .filter((s) => s && !/^\(.*\)$/.test(s))
        .join("/"),
    ),
  );

  test("cada opción del menú abre una pantalla que existe", () => {
    // POR QUÉ ESTA PRUEBA: añadir una opción al menú y olvidar la pantalla no
    // da error al compilar. Se ve en producción, cuando un cliente pulsa y le
    // sale un 404 dentro de su propia plataforma.
    const side = sinComentarios(
      fs.readFileSync(path.join(SRC, "components/Sidebar.tsx"), "utf8"),
    );
    const rotas = [];
    for (const m of side.matchAll(/href:\s*"(\/[^"]*)"/g)) {
      const href = m[1];
      // Una dirección con parte variable la resuelve Next; aquí solo se
      // comprueban las fijas, que son todas las del menú.
      const encaja = [...RUTAS].some(
        (r) => r === href || r.split("/").length === href.split("/").length && r.includes("["),
      );
      if (!encaja) rotas.push(href);
    }
    esperar(rotas.join(", ")).igual("", "el menú apunta a pantallas que no existen");
  });

  test("la Tienda está en el menú", () => {
    const side = sinComentarios(
      fs.readFileSync(path.join(SRC, "components/Sidebar.tsx"), "utf8"),
    );
    esperar(/href:\s*"\/tienda"/.test(side)).verdadero("no hay acceso a la Tienda desde el menú");
  });
});


// ─── La tienda ───────────────────────────────────────────────────────────────
describe("Tienda: nada que se pulse puede quedarse callado", () => {
  const RUTA = "app/(dashboard)/tienda/[id]/page.tsx";
  const ficha = sinComentarios(fs.readFileSync(path.join(SRC, RUTA), "utf8"));

  test("las tres secciones son pestañas de verdad, no adorno", () => {
    // ESTA PRUEBA EXISTE POR UN FALLO MÍO. Productos, Diseño y Cobros estaban
    // pintadas como tarjetas bonitas que no llevaban a ninguna parte: el
    // cliente pulsaba, no pasaba nada, y se quedaba sin saber si la culpa era
    // suya. Un botón que parece un botón y no hace nada es el mismo error que
    // una opción de menú que acaba en un 404.
    esperar(ficha.includes("<TiendaNav")).verdadero("la ficha no tiene pestañas");
    for (const comp of ["<Productos", "<EditorDiseno", "<Cobros"]) {
      esperar(ficha.includes(comp)).verdadero(`falta la sección ${comp}`);
    }
  });

  test("el secreto de cobro NUNCA se pide a la base desde la pantalla", () => {
    // No se puede filtrar lo que nunca se leyó. La pantalla solo necesita
    // saber SI hay secreto, y eso se pregunta contando.
    esperar(/select\(\s*["'][^"']*secreto/.test(ficha)).falso(
      "la ficha está trayendo el secreto de cobro a la vista",
    );
  });

  test("las opciones NO se le piden al cliente como sintaxis", () => {
    // POR QUÉ EXISTE ESTA REGLA: la tabla llegó a pedir esto en una casilla —
    //   Sabor | hasta completar 3 | Pollo, Salmón {2.50}
    // que está bien para quien programa y es un idioma extranjero para la
    // señora de la panadería. Si para poner tres sabores hay que aprender una
    // sintaxis, la tienda no se arma; y una tienda a medias no vende.
    const tabla = sinComentarios(
      fs.readFileSync(path.join(SRC, "components/tienda/Productos.tsx"), "utf8"),
    );
    esperar(/escribirGrupos|leerGruposEscritos/.test(tabla)).falso(
      "la tabla volvió a editar las variedades como texto con barras",
    );
    esperar(tabla.includes("<EditorVariedades")).verdadero(
      "las opciones tienen que abrirse en su pantalla de casillas y botones",
    );

    // Y en esa pantalla no puede aparecer la sintaxis por ningún lado.
    const editor = sinComentarios(
      fs.readFileSync(path.join(SRC, "components/tienda/EditorVariedades.tsx"), "utf8"),
    );
    esperar(/escribirGrupos|leerGruposEscritos/.test(editor)).falso(
      "el editor visual no puede volver al texto con barras",
    );

    // NI LAS PREGUNTAS DEL FORMULARIO. El mismo error, cometido dos veces:
    // «Forma de Pago* | Yappy, Efectivo» es un idioma de programador, y quien
    // configura una tienda no lo habla.
    const diseno = sinComentarios(
      fs.readFileSync(path.join(SRC, "components/tienda/EditorDiseno.tsx"), "utf8"),
    );
    esperar(diseno.includes("<EditorPreguntas")).verdadero(
      "las preguntas del pedido tienen que armarse con casillas y botones",
    );
    esperar(/escribirPreguntas|name="preguntas"[\s\S]{0,80}textarea/.test(diseno)).falso(
      "las preguntas volvieron a pedirse como texto con barras",
    );
  });

  test("lo que llega del navegador se sanea en el servidor", () => {
    // La pantalla es una comodidad. Las opciones llegan como JSON y deciden
    // cuánto se le cobra a una persona: la puerta está en el servidor.
    const acciones = sinComentarios(
      fs.readFileSync(path.join(SRC, "app/(dashboard)/tienda/[id]/actions.ts"), "utf8"),
    );
    esperar(/variedades:\s*sanearGrupos\(/.test(acciones)).verdadero(
      "las variedades se guardan sin sanear",
    );
  });

  test("el escaparate público existe y no pide sesión", () => {
    // Sin esto, la plataforma sabe crear tiendas que nadie puede visitar.
    esperar(fs.existsSync(path.join(SRC, "app/t/[slug]/page.tsx"))).verdadero(
      "no hay pantalla pública de tienda",
    );
    const mw = sinComentarios(fs.readFileSync(path.join(RAIZ, "middleware.ts"), "utf8"));
    esperar(mw.includes("DOMINIO_TIENDAS")).verdadero(
      "el dominio de tiendas no se enruta en el middleware",
    );
    // En el escaparate NO se pregunta por la sesión: es un viaje a Supabase en
    // cada visita de cada cliente de cada tienda, y la respuesta siempre es
    // «nadie».
    const iTienda = mw.indexOf("DOMINIO_TIENDAS");
    const iSesion = mw.indexOf("updateSession(request)");
    esperar(iTienda > 0 && iSesion > iTienda).verdadero(
      "el dominio de tiendas tiene que resolverse ANTES de comprobar la sesión",
    );
  });

  test("el pedido se recalcula en el servidor, nunca se cree al navegador", () => {
    // LA TIENDA ES PÚBLICA: cualquiera abre la consola y manda lo que quiera.
    // Si el servidor se creyera el precio que llega, alguien pediría un saco de
    // sesenta dólares por un centavo, y el negocio se enteraría al empacarlo.
    const ruta = sinComentarios(
      fs.readFileSync(path.join(SRC, "app/api/tienda/pedido/route.ts"), "utf8"),
    );
    esperar(ruta.includes("recalcularPedido(")).verdadero(
      "la ruta de pedidos no recalcula contra el catálogo",
    );
    // El total que se guarda tiene que ser el recalculado, no uno que venga en
    // el cuerpo de la petición.
    esperar(/total,\s*$/m.test(ruta) || ruta.includes("total,")).verdadero();
    esperar(/cuerpo\??\.?\s*\.?total|body\.total/.test(ruta)).falso(
      "la ruta está leyendo un total del navegador",
    );

    // Y los pedidos NO se pueden crear desde el navegador contra la base: la
    // migración no lleva política para `anon`.
    const mig = fs.readFileSync(path.join(RAIZ, "supabase/migrations/0072_pedidos.sql"), "utf8");
    esperar(/to\s+anon/.test(mig.replace(/--.*$/gm, ""))).falso(
      "pedidos no puede tener política para anon: el precio se forjaría desde el navegador",
    );
  });

  test("el precio de una línea de pedido queda congelado", () => {
    // Si la línea leyera el precio del producto, mañana el negocio sube un
    // precio y TODOS los pedidos viejos pasarían a decir el precio nuevo. Eso
    // rompe la contabilidad, las devoluciones y cualquier reclamo.
    const mig = fs.readFileSync(path.join(RAIZ, "supabase/migrations/0072_pedidos.sql"), "utf8");
    esperar(/create table if not exists public\.pedido_lineas[\s\S]*?precio\s+integer\s+not null/.test(mig)).verdadero(
      "la línea del pedido no guarda su propio precio",
    );
    esperar(/create table if not exists public\.pedido_lineas[\s\S]*?nombre\s+text\s+not null/.test(mig)).verdadero(
      "la línea del pedido no guarda su propio nombre",
    );
  });

  test("no se mezcla la tarjeta oscura con el texto del tema", () => {
    // TEXTO INVISIBLE, VISTO EN UNA CAPTURA DE ALEX. Hay dos clases de tarjeta:
    // `.card` es la vieja y es azul oscuro SIEMPRE, en los dos temas; `.card-l`
    // respeta el tema. `text-ink` es texto oscuro en modo claro. Juntas dan
    // letra negra sobre fondo azul marino: los títulos y los nombres de las
    // categorías no se leían.
    //
    // Nadie lo nota programando en modo oscuro, que es donde ambas cosas se ven
    // bien. Por eso hace falta una regla y no buena memoria.
    const malos = [];
    for (const { ruta, texto } of ARCHIVOS) {
      const t = sinComentarios(texto);
      const usaTarjetaOscura = /className="card[ "]|className=\{`card[ `]/.test(t);
      const usaTextoDelTema = /\btext-ink\b/.test(t);
      if (usaTarjetaOscura && usaTextoDelTema) malos.push(ruta);
    }
    esperar(malos.join(", ")).igual(
      "",
      "una pantalla mezcla `card` (siempre oscura) con `text-ink` (oscuro en tema claro): el texto no se lee",
    );
  });

  test("la tabla se resincroniza cuando el servidor cambia", () => {
    // FALLO REAL, Y CON DIENTES: Alex vació el catálogo, los 96 productos se
    // borraron de verdad en la base, y la pantalla siguió enseñándolos.
    // `useState(x)` solo mira su valor inicial al montar; después el estado se
    // queda con lo de antes aunque el servidor mande otra cosa.
    //
    // Lo peligroso no era enseñar datos viejos: esas 96 filas seguían siendo
    // filas «sin id», así que pulsar Guardar las habría vuelto a CREAR todas.
    // El cliente borra su catálogo, guarda, y el catálogo resucita.
    const tabla = sinComentarios(
      fs.readFileSync(path.join(SRC, "components/tienda/Productos.tsx"), "utf8"),
    );
    esperar(/firma\s*!==\s*firmaVista/.test(tabla)).verdadero(
      "la tabla no se vuelve a leer cuando cambian los datos del servidor",
    );
    esperar(/setFilas\(originales\)/.test(tabla)).verdadero(
      "al cambiar el servidor, las filas tienen que volver a salir de él",
    );
    // Por FIRMA, no por identidad del array: cada render del servidor crea un
    // array nuevo, y comparar referencias borraría lo que estás escribiendo.
    esperar(/const firma = useMemo\(/.test(tabla)).verdadero(
      "hay que comparar el contenido, no la referencia",
    );
  });

  test("vaciar el catálogo no se puede hacer de un clic descuidado", () => {
    // BORRAR NOVENTA Y SEIS PRODUCTOS NO SE DESHACE: no hay papelera ni copia.
    // Un botón de confirmar se pulsa sin leer —todos lo hacemos— pero nadie
    // teclea seis letras por accidente.
    const acciones = sinComentarios(
      fs.readFileSync(path.join(SRC, "app/(dashboard)/tienda/[id]/actions.ts"), "utf8"),
    );
    const i = acciones.indexOf("export async function vaciarCatalogo");
    esperar(i > 0).verdadero("no existe la acción de vaciar el catálogo");
    const cuerpo = acciones.slice(i, acciones.indexOf("export async function", i + 10));

    // La palabra se comprueba EN EL SERVIDOR, no solo en la pantalla: la
    // pantalla es una comodidad, esto es la puerta.
    esperar(/confirmacion[\s\S]{0,120}BORRAR/.test(cuerpo)).verdadero(
      "el servidor no exige escribir BORRAR",
    );
    // Y siempre acotado a esta tienda: un delete sin `tienda_id` en un sistema
    // multi-inquilino no borra un catálogo, borra todos.
    esperar(/\.delete\(\)[\s\S]{0,80}\.eq\("tienda_id"/.test(cuerpo)).verdadero(
      "el borrado no está acotado a la tienda",
    );

    // Y el botón no puede vivir pegado al de guardar.
    const tabla = sinComentarios(
      fs.readFileSync(path.join(SRC, "components/tienda/Productos.tsx"), "utf8"),
    );
    const iGuardar = tabla.indexOf("<Guardar cuantos");
    const iVaciar = tabla.indexOf("Vaciar el catálogo");
    esperar(iVaciar > iGuardar).verdadero(
      "el botón de vaciar tiene que estar lejos del de guardar, no al lado",
    );
  });

  test("la tienda abre por categorías, no soltando todo el catálogo", () => {
    // ESTA ES LA FORMA QUE SUS CLIENTES YA SABEN USAR, copiada de la tienda que
    // llevan años usando: cabecera, banner, y las categorías CERRADAS con su
    // foto. Con noventa y seis productos, soltarlos de golpe es una pared de
    // fotos donde no se encuentra nada — y encima obliga a reaprender algo que
    // ya sabían.
    const esc = sinComentarios(
      fs.readFileSync(path.join(SRC, "components/tienda/Escaparate.tsx"), "utf8"),
    );
    esperar(esc.includes("estaAbierta")).verdadero("las categorías no se pueden abrir y cerrar");
    esperar(/Boolean\(q\)/.test(esc)).verdadero(
      "buscando hay que abrirlo todo, o los resultados quedan escondidos y la búsqueda parece rota",
    );
    esperar(esc.includes("tieneRecargos")).verdadero(
      "sin «Desde», un producto con opciones que cobran de más enseña un precio que no es el que se paga",
    );
  });

  test("el dominio de las tiendas se escribe en UN solo sitio", () => {
    // YA CAMBIÓ UNA VEZ (`shop` → `store`) antes de tener un cliente encima. Si
    // el nombre estuviera repartido por las pantallas, el día que vuelva a
    // cambiar se olvidaría una — y esa mandaría clientes a una tienda que no
    // existe, sin que nadie lo note hasta que alguien se queje.
    const sueltos = [];
    for (const { ruta, texto } of ARCHIVOS) {
      if (ruta.includes("lib/tienda/direccion")) continue;
      // Solo los nombres que sirven TIENDAS. `platform.demandu.tech` escrito a
      // mano como recurso de última hora es otra cosa y es legítimo.
      if (/(shop|store|eshop|tienda|tiendas)\.demandu\.tech/.test(sinComentarios(texto))) {
        sueltos.push(ruta);
      }
    }
    esperar(sueltos.join(", ")).igual(
      "",
      "hay un dominio de demandu escrito a mano fuera de la constante",
    );

    const dir = fs.readFileSync(path.join(SRC, "lib/tienda/direccion.ts"), "utf8");
    esperar(/DOMINIO_TIENDAS[\s\S]{0,200}?store\.demandu\.tech/.test(dir)).verdadero(
      "la constante no apunta al dominio de tiendas",
    );
  });

  test("ninguna pantalla manda a las tiendas viejas", () => {
    // `eshop.demandu.tech` lo sirve HOY el proveedor anterior, con clientes
    // reales vendiendo. Que la plataforma imprima esa dirección en un enlace
    // nuevo manda al cliente a una tienda que no es la suya.
    const malas = [];
    for (const { ruta, texto } of ARCHIVOS) {
      if (ruta.includes("lib/tienda/direccion") || ruta.includes("lib/tienda/config")) continue;
      if (sinComentarios(texto).includes("eshop.demandu.tech")) malas.push(ruta);
    }
    esperar(malas.join(", ")).igual("", "hay pantallas apuntando al dominio de las tiendas viejas");
  });

  test("las llaves de cobro no viven donde cualquiera puede leerlas", () => {
    // `tiendas.config` tiene lectura ANÓNIMA a propósito: es lo que pinta el
    // escaparate. Un secreto de comercio ahí estaría publicado en internet.
    const cfg = fs.readFileSync(path.join(SRC, "lib/tienda/config.ts"), "utf8");
    esperar(/secreto|api_key|token/i.test(sinComentarios(cfg))).falso(
      "la configuración pública de la tienda no puede contener credenciales",
    );

    const mig = path.join(RAIZ, "supabase/migrations/0071_tienda_cobros.sql");
    esperar(fs.existsSync(mig)).verdadero("falta la tabla aparte para las llaves de cobro");
    const sql = fs.readFileSync(mig, "utf8");
    esperar(/to\s+anon/.test(sql.replace(/--.*$/gm, ""))).falso(
      "tienda_cobros no puede tener ninguna política para anon",
    );
    esperar(/enable row level security/.test(sql)).verdadero("tienda_cobros sin RLS");
  });

  test("el secreto de cobro nunca llega al navegador", () => {
    // ─────────────────────────────────────────────────────────────────────────
    // EL ESCAPARATE ES UNA PÁGINA PÚBLICA: todo lo que el servidor le pase a un
    // componente de cliente viaja en el HTML y se lee con el botón derecho. El
    // secreto de comercio no puede estar en esa lista ni por accidente, así que
    // se prohíbe nombrarlo en todo lo que se pinta al público.
    // ─────────────────────────────────────────────────────────────────────────
    const publicos = ARCHIVOS.filter(
      (a) =>
        a.ruta.startsWith("src/app/t/") ||
        a.ruta.endsWith("components/tienda/Escaparate.tsx") ||
        a.ruta.endsWith("components/tienda/BotonYappy.tsx") ||
        a.ruta.endsWith("lib/tienda/cobro-publico.ts"),
    );
    esperar(publicos.length > 0).verdadero("no se encontró el escaparate público");

    const malos = publicos
      .filter((a) => /secreto/.test(sinComentarios(a.texto)))
      .map((a) => a.ruta);
    esperar(malos.join(", ")).igual("", "el secreto de cobro se nombra en una pantalla pública");
  });

  test("el aviso de pago se comprueba ANTES de tocar el pedido", () => {
    // Es la única voz que puede decir «esto está pagado», y llega por una URL
    // que cualquiera puede llamar. Escribir primero y comprobar después es lo
    // mismo que no comprobar.
    const ruta = path.join(SRC, "app/api/tienda/yappy/ipn/route.ts");
    esperar(fs.existsSync(ruta)).verdadero("falta la ruta del aviso de pago");
    const t = sinComentarios(fs.readFileSync(ruta, "utf8"));

    esperar(t.includes("ipnValido(")).verdadero("el aviso de pago no comprueba la firma");

    const firma = t.indexOf("ipnValido(");
    const escribe = t.indexOf('.from("pedidos")\n    .update');
    const escribe2 = t.indexOf('from("pedidos").update');
    const primerCambio = [escribe, escribe2].filter((i) => i >= 0).sort((a, b) => a - b)[0];
    if (primerCambio !== undefined) {
      esperar(firma < primerCambio).verdadero("se cambia el pedido antes de comprobar la firma");
    }

    // Y el importe del pedido NO puede salir de la URL del aviso: Yappy dice
    // qué pasó con el cobro, no cuánto se cobró.
    esperar(/q\.get\(\s*["'](total|amount|monto)["']/.test(t)).falso(
      "el importe no puede leerse del aviso",
    );
  });

  test("las direcciones de Yappy se escriben en UN solo sitio", () => {
    // Ya pasó con el dominio de las tiendas: repartido por las pantallas,
    // cambiarlo obliga a acordarse de todas. Aquí además hay dos entornos, y
    // una dirección de pruebas olvidada en producción es un cobro que no entra.
    const malos = [];
    for (const { ruta, texto } of ARCHIVOS) {
      if (ruta.endsWith("lib/tienda/yappy.ts")) continue;
      if (/yappycloud\.com|bgeneral\.cloud/.test(sinComentarios(texto))) malos.push(ruta);
    }
    esperar(malos.join(", ")).igual("", "hay direcciones de Yappy fuera de lib/tienda/yappy.ts");
  });

  test("la migración de cobros sigue sin abrirle la puerta a nadie", () => {
    const mig = path.join(RAIZ, "supabase/migrations/0073_yappy.sql");
    esperar(fs.existsSync(mig)).verdadero("falta la migración de Yappy");
    const sql = fs.readFileSync(mig, "utf8").replace(/--.*$/gm, "");
    esperar(/to\s+anon/.test(sql)).falso("ninguna migración de cobros puede tocar los permisos de anon");
  });

  test("el módulo que firma los cobros no puede acabar en el navegador", () => {
    // ─────────────────────────────────────────────────────────────────────────
    // `lib/tienda/yappy.ts` usa `crypto` de Node y es donde se manejan las
    // llaves. Si una pantalla de cliente lo importara, ese módulo entraría en
    // el paquete que se descarga el visitante — además de romper el build. El
    // trozo que sí necesita el tablero (el estado del cobro) vive aparte, en
    // `lib/tienda/cobro.ts`, sin crypto y sin secretos.
    // ─────────────────────────────────────────────────────────────────────────
    const malos = [];
    for (const { ruta, texto } of ARCHIVOS) {
      if (!/^\s*["']use client["']/m.test(texto)) continue;
      if (/from\s+["'][^"']*tienda\/yappy["']/.test(sinComentarios(texto))) malos.push(ruta);
    }
    esperar(malos.join(", ")).igual("", "una pantalla de cliente importa el módulo que firma");

    const cobro = fs.readFileSync(path.join(SRC, "lib/tienda/cobro.ts"), "utf8");
    esperar(/from\s+["']crypto["']|require\(["']crypto["']\)/.test(cobro)).falso(
      "lib/tienda/cobro.ts tiene que poder correr en el navegador",
    );
  });
});

process.exit(await correrPruebas());
