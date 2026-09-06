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
    // ── DOS ARREGLOS, LOS DOS SALIDOS DE UN FALSO POSITIVO ─────────────────
    //
    // Esta regla acusó a una línea que compila perfectamente:
    //
    //     titulo: d.tituloEvento || `Cita con ${nombre ?? "cliente"}`
    //
    // El `??` vive dentro de un `${…}` de una plantilla, que es SU PROPIO
    // contexto de expresión: ahí no hay nada que mezclar. Se quitan los
    // interiores de las plantillas antes de mirar.
    //
    // Y el número de línea salía del texto SIN COMENTARIOS, así que no
    // correspondía con el archivo de verdad — mandaba a mirar una línea que no
    // tenía nada. Ahora se busca en el texto original. Una pista falsa cuesta
    // más tiempo que no dar ninguna.
    const malos = [];
    for (const { ruta, texto } of ARCHIVOS) {
      const t = sinComentarios(texto).replace(/\$\{[^}]*\}/g, "\u0000");
      const sospechosa = (l) => /\?\?.*\|\||\|\|.*\?\?/.test(l) && !/[()]/.test(l);
      const lineas = t.split("\n");
      const i = lineas.findIndex(sospechosa);
      if (i < 0) continue;
      // El número se busca en el ORIGINAL, no en el recortado.
      const aguja = lineas[i].replace(/\u0000/g, "").trim();
      const real = texto.split("\n").findIndex((l) => l.replace(/\$\{[^}]*\}/g, "").trim() === aguja);
      malos.push(`${ruta}:${(real >= 0 ? real : i) + 1}`);
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
  // LA PUERTA VIVE EN UN SOLO ARCHIVO desde que hubo una segunda entrada del
  // motor (`/api/motor/pedido`). Dos copias de una comprobación de permisos es
  // donde empieza el agujero: se arregla una y la otra se queda como estaba.
  const ruta = fs.readFileSync(path.join(RAIZ, "src/lib/motor/autorizado.ts"), "utf8");
  const puertas = ["src/app/api/motor/agenda/route.ts", "src/app/api/motor/pedido/route.ts"]
    .map((r) => fs.readFileSync(path.join(RAIZ, r), "utf8"));
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

  test("NINGÚN SECRETO SE PIDE CON LA SESIÓN DEL USUARIO", () => {
    // ─────────────────────────────────────────────────────────────────────────
    // El secreto de Yappy, los tokens de Meta, el refresh token de Google y el
    // secreto de firma de los webhooks los leía CUALQUIER miembro de la cuenta
    // —un `agent` o un `viewer`, alguien que solo debería atender chats— desde
    // la consola del navegador: las cinco políticas comprobaban solo `org_id`.
    //
    // Ahora esas columnas no están concedidas a `authenticated`, y quien las
    // necesita de verdad las pide por una función que comprueba el permiso de
    // conexiones. Esta prueba impide que alguien vuelva a pedirlas directo:
    // dejaría de funcionar en silencio, o peor, alguien «arreglaría» la
    // consulta volviendo a abrir la columna.
    //
    // `select("*")` sobre esas tablas también se prohíbe: expande a todas las
    // columnas, incluida la secreta, y la consulta ENTERA falla — la pantalla
    // se quedaría diciendo «no conectado» a todo el mundo.
    // ─────────────────────────────────────────────────────────────────────────
    const TABLAS = ["whatsapp_channels", "instagram_channels", "integrations", "salidas", "tienda_cobros"];
    // `firma` ES DE LA MISMA FAMILIA aunque no lo parezca: es la clave con la
    // que se comprueban los avisos de Calendly, y quien la tenga puede mandar
    // un `invitee.created` firmado que nos creeremos — o sea, meter contactos
    // y mensajes en las conversaciones de ese cliente. La 0093 la sacó de
    // `data` justo por esto; esta línea impide que vuelva a pedirse con la
    // sesión del usuario.
    const SECRETAS = ["access_token", "refresh_token", "secreto", "firma"];
    const malos = [];

    for (const { ruta, texto } of ARCHIVOS) {
      const t = sinComentarios(texto);

      // ── QUIÉN QUEDA FUERA, Y POR QUÉ ────────────────────────────────────
      // Solo se mira lo que CREA un cliente con la sesión del usuario. Un
      // archivo que RECIBE el cliente por parámetro (`sb: SupabaseClient`) no
      // decide con cuál se le llama: eso lo decide quien lo llama, y ese sí
      // pasa por aquí. Mirarlo también llenaba esto de falsos positivos —
      // `avisar.ts`, `cobrar-pedido.ts`, `baja.ts`— que se llaman siempre con
      // la llave de servicio.
      if (!/createClient\(\)/.test(t)) continue;

      for (const tabla of TABLAS) {
        // TODAS las consultas a esa tabla, no solo la primera: un archivo
        // puede tener varias y la mala ser la segunda.
        let desde = 0;
        for (;;) {
          const i = t.indexOf(`from("${tabla}")`, desde);
          if (i < 0) break;
          desde = i + 1;

          // Se corta en el `.maybeSingle()`/`.single()`/`;` para no leerse la
          // consulta siguiente: así fue como esta prueba acusó a un archivo
          // por un `select("*")` que era de OTRA tabla, tres líneas más abajo.
          const fin = Math.min(
            ...[".maybeSingle(", ".single(", ";"]
              .map((f) => { const j = t.indexOf(f, i); return j < 0 ? i + 400 : j; }),
          );
          const consulta = t.slice(i, fin);

          // ── CON QUÉ CLIENTE SE PIDE ─────────────────────────────────────
          // El nombre del cliente va justo ANTES del `.from(`, así que se mira
          // hacia atrás. Un archivo puede usar los dos —la sesión para lo suyo
          // y la llave de servicio para lo que habla con Meta— y mirar solo el
          // archivo entero acusaba consultas que ya estaban bien.
          const antes = t.slice(Math.max(0, i - 140), i);
          if (/createAdminClient\(\)[\s\S]{0,10}$|\badmin[\s\S]{0,3}$/.test(antes)) continue;

          const sel = consulta.match(/\.select\(\s*"([^"]*)"/);
          if (!sel) continue; // `select(CONSTANTE)`: se revisa donde se define
          if (sel[1].trim() === "*") { malos.push(`${ruta} → ${tabla}: select("*")`); continue; }
          for (const col of SECRETAS) {
            // COLUMNA ENTERA, no subcadena: `includes("firma")` acusaría a un
            // `confirmado` cualquiera, y una prueba que acusa en falso es una
            // prueba que se acaba desactivando.
            if (new RegExp(`(^|[\\s,(])${col}([\\s,)]|$)`).test(sel[1])) {
              malos.push(`${ruta} → ${tabla}.${col}`);
            }
          }
        }
      }
    }

    esperar(malos.join("\n      ")).igual(
      "",
      "hay un secreto pedido con la sesión del usuario: tiene que ir por token_de_whatsapp / secreto_de_salida o con la llave de servicio",
    );
  });

  test("WhatsApp tiene la IA de respaldo, y con las mismas reglas que el widget", () => {
    // ─────────────────────────────────────────────────────────────────────────
    // NO LA TENÍA. `desvio.ts` decide qué pasa cuando el cliente se sale del
    // guion, y lo usaban el widget e Instagram — no WhatsApp, que es el canal
    // por el que entra casi todo el mundo. El cliente pagaba la IA de respaldo,
    // la veía funcionar al probar el widget, y en WhatsApp no existía: el flujo
    // terminado repetía el saludo, y una pregunta se guardaba como si fuera el
    // dato que se había pedido — y así viajaba al CRM.
    //
    // Se comprueba también que las LISTAS coincidan: son dos copias en dos
    // lenguajes, y el día que se separen el mismo bot entenderá cosas distintas
    // según por dónde le escriban.
    // ─────────────────────────────────────────────────────────────────────────
    const motor = sinComentarios(
      fs.readFileSync(path.join(RAIZ, "supabase/functions/whatsapp/index.ts"), "utf8"),
    );
    esperar(motor.includes("decidirDesvio(")).verdadero(
      "el motor de WhatsApp no desvía a la IA cuando el cliente se sale del guion",
    );
    esperar(motor.includes("puenteDeVuelta(")).verdadero(
      "sin el puente, el cliente recibe la respuesta y se queda sin saber cómo seguir",
    );

    const arranques = (t) => {
      const i = t.indexOf("const ARRANQUES");
      return i < 0 ? [] : (t.slice(i, t.indexOf("];", i)).match(/"[^"]+"/g) ?? []).sort();
    };
    const web = arranques(fs.readFileSync(path.join(SRC, "lib/flow/desvio.ts"), "utf8"));
    const den = arranques(motor);
    esperar(web.length > 10).verdadero("no encontré la lista del widget, revisa esta prueba");
    esperar(den.join(",")).igual(
      web.join(","),
      "las dos listas de «esto parece una pregunta» se separaron: el mismo bot entendería distinto según el canal",
    );
  });

  test("HAY UN SOLO MOTOR DE WHATSAPP, y ninguna firma falla abierta", () => {
    // ─────────────────────────────────────────────────────────────────────────
    // HABÍA DOS, Y EL SEGUNDO ERA UN PROTOTIPO DE 2023 QUE SEGUÍA DESPLEGADO.
    //
    // `src/app/api/webhooks/whatsapp/route.ts` verificaba la firma de Meta,
    // resolvía el cliente y procesaba mensajes de verdad — pero sin
    // deduplicación (cada reintento de Meta = flujo completo otra vez, IA
    // cobrada dos veces), sin atajos, sin IA, sin analítica, y eligiendo el
    // flujo por `version` en vez de por disparador. Se desplegaba con todo
    // `src/` en cada publicación.
    //
    // Y su comprobación de firma FALLABA ABIERTA:
    //
    //     if (!secret) return true;   // «best-effort»
    //
    // Con la variable de entorno ausente —una rotación a medias, un despliegue
    // de vista previa— cualquiera podía inyectar mensajes entrantes falsos en
    // la Bandeja de cualquier cliente y disparar sus flujos y su IA.
    //
    // Un segundo motor no se nota nunca: los dos «funcionan». Por eso esto se
    // prueba en vez de confiar en que nadie lo vuelva a crear.
    // ─────────────────────────────────────────────────────────────────────────
    const rutas = ARCHIVOS.filter(
      (a) => /app\/api\/webhooks\/.*whatsapp/.test(a.ruta) || /lib\/flow\/runtime\.ts$/.test(a.ruta),
    );
    esperar(rutas.map((a) => a.ruta).join(", ")).igual(
      "",
      "el motor de WhatsApp vive en supabase/functions/whatsapp: un segundo motor procesa los mismos mensajes con otras reglas",
    );

    // NINGUNA firma puede dejar pasar por no tener el secreto. El webhook de
    // Instagram falla cerrado (503) y es el criterio de toda la plataforma.
    const abiertas = [];
    for (const { ruta, texto } of ARCHIVOS) {
      const t = sinComentarios(texto);
      if (!/firma|signature/i.test(t)) continue;
      if (/if\s*\(\s*!\s*secret\s*\)\s*return\s+true/.test(t)) abiertas.push(ruta);
    }
    esperar(abiertas.join(", ")).igual("", "hay una comprobación de firma que deja pasar si falta el secreto");
  });

  test("el recordatorio de atajos CABE en el pie del mensaje", () => {
    // ─────────────────────────────────────────────────────────────────────────
    // Va en el pie —la línea gris pequeña dentro del cuadro de opciones— y Meta
    // corta el pie en 60 caracteres. El texto de fábrica tenía 68 con sus
    // asteriscos: no cabía, así que caía al cuerpo del mensaje y en un menú de
    // tres líneas se comía lo que el negocio quiso decir.
    //
    // Se comprueba en los DOS motores: si se separan, el mismo bot se ve
    // distinto en WhatsApp y en el widget.
    // ─────────────────────────────────────────────────────────────────────────
    const saca = (t) => (t.match(/text:\s*['"]Escribe[^'"]*['"]/) ?? [""])[0]
      .replace(/^text:\s*['"]/, "").replace(/['"]$/, "");

    const web = saca(fs.readFileSync(path.join(SRC, "lib/flow/shortcuts.ts"), "utf8"));
    const motor = saca(fs.readFileSync(path.join(RAIZ, "supabase/functions/whatsapp/index.ts"), "utf8"));

    esperar(web.length > 0 && web === motor).verdadero(
      `los dos motores traen un recordatorio distinto de fábrica:\n      web:   "${web}"\n      motor: "${motor}"`,
    );
    esperar(web.replace(/\*/g, "").length <= 60).verdadero(
      `el recordatorio de fábrica tiene ${web.length} caracteres y en el pie caben 60: se caería al cuerpo del mensaje`,
    );
    esperar(web.includes("*")).falso(
      "en el pie no hay negrita: los asteriscos salen tal cual y gastan del tope",
    );
  });

  test("TODAS las puertas del motor usan la misma comprobación", () => {
    // Una entrada nueva que se autorice a su manera es una entrada sin revisar.
    for (const p of puertas) {
      esperar(p.includes("esDelMotor(req)")).verdadero(
        "hay una puerta del motor que no usa la comprobación compartida",
      );
    }
  });

  test("EL CAMPO DE GOOGLE NUNCA SE LE PASA A CALENDLY", () => {
    // ─────────────────────────────────────────────────────────────────────────
    // LA RAÍZ DEL PEOR FALLO QUE HA TENIDO LA AGENDA, y la regla que impide
    // que vuelva.
    //
    // El bloque «Agendar cita» guardaba UN solo campo, `calendarId`, para las
    // dos agendas — «así nadie reconfigura sus flujos al cambiar de
    // proveedor». El día que un cliente con Google conectó Calendly, ese valor
    // —`contacto@demandu.tech`— viajó a Calendly como tipo de cita. Calendly no
    // devuelve un error entendible ante eso: devuelve CERO HORARIOS, que se lee
    // igual que «no hay huecos esta semana». El bot dejó de agendar y empezó a
    // pasar a la gente con un humano, sin un solo error a la vista.
    //
    // Ahora hay un campo por agenda. Esta prueba comprueba que el de Calendly
    // se lee de `calendlyTipo` y NUNCA de `calendarId`.
    // ─────────────────────────────────────────────────────────────────────────
    const agenda = fs.readFileSync(path.join(SRC, "lib/agenda.ts"), "utf8");
    const t = sinComentarios(agenda);

    const usos = [...t.matchAll(/tipoDeEventoDeCalendly\(([^)]*)\)/g)].map((m) => m[1].trim());
    esperar(usos.length >= 2).verdadero(
      "el tipo de evento de Calendly tiene que comprobarse al ver horarios Y al agendar",
    );
    for (const u of usos) {
      esperar(/calendlyTipo/.test(u)).verdadero(
        `el tipo de cita de Calendly se está sacando de \`${u}\` — tiene que salir de \`calendlyTipo\`, nunca del campo de Google`,
      );
      esperar(/calendarId/.test(u)).falso(
        `\`${u}\` mezcla el campo de Google con el de Calendly: es exactamente el fallo que rompió una cuenta`,
      );
    }

    // Y los dos campos siguen siendo dos en el catálogo de bloques.
    const tipos = fs.readFileSync(path.join(SRC, "lib/flow/types.ts"), "utf8");
    esperar(/calendlyTipo\?:/.test(tipos)).verdadero("desapareció el campo propio de Calendly");
    esperar(/calendarId\?:/.test(tipos)).verdadero("desapareció el campo propio de Google");

    // ── LAS DOS LLAMADAS DEL BLOQUE, NO «alguna del archivo» ─────────────
    //
    // `/calendly_tipo/.test(wa)` se conformaba con encontrarlo en CUALQUIER
    // sitio: el mutante que lo quitaba de «ver horarios» no lo cazaba, porque
    // seguía estando en «agendar». Una prueba así da tranquilidad falsa.
    //
    // Y se ancla en las dos funciones DEL BLOQUE, no en `accion: "horarios"`:
    // hay otra llamada con esa misma acción —la herramienta `ver_horarios` de
    // la IA— que NO manda nada de esto Y HACE BIEN. La IA no tiene bloque
    // donde elegir, así que usa la agenda de la cuenta, que es justo lo que
    // debe pasar. Anclar por la acción acusaba a esa llamada de un fallo que
    // no tiene.
    for (const fn of ["sayCalendario", "agendarElegido"]) {
      const i = wa.indexOf(`function ${fn}(`);
      esperar(i > 0).verdadero(`no encuentro ${fn} en el motor`);
      const cuerpo = wa.slice(i, i + 900);
      esperar(/calendly_tipo/.test(cuerpo)).verdadero(
        `${fn} no manda el tipo de cita de Calendly por su propio campo`,
      );
      esperar(/agenda:/.test(cuerpo)).verdadero(
        `${fn} no manda qué agenda eligió el bloque: al otro lado llegaría siempre lo mismo`,
      );
    }
  });

  test("cuando la plataforma no contesta bien, queda escrito el porqué", () => {
    esperar(wa.includes("__fallo")).verdadero(
      "un fallo de la agenda tiene que distinguirse de «no hay horarios»: son dos arreglos distintos",
    );
  });

  test("tras un fallo de calendario NUNCA se sigue por la salida de éxito", () => {
    // El peor error del proyecto: el bot decía «te paso con una persona» y un
    // segundo después «tu cita ha sido agendada», con los datos en blanco.
    //
    // ── EL BLOQUE SE RECORTA POR EL SIGUIENTE `case`, NO POR 1200 LETRAS ──
    // Con la ventana fija esta prueba falló el día que el bloque creció tres
    // líneas: el traspaso seguía ahí, solo que fuera del recorte. Una prueba
    // que se rompe por escribir un comentario enseña a ignorarla, y esta
    // guarda el peor fallo que ha tenido el proyecto.
    const i = wa.indexOf('case "calendar"');
    esperar(i > 0).verdadero("no encuentro el bloque de calendario en el motor");
    const sig = wa.indexOf('case "', i + 20);
    const bloque = wa.slice(i, sig > i ? sig : i + 2000);

    esperar(/handoff_reason/.test(bloque)).verdadero(
      "sin horarios, el calendario tiene que pasar la conversación a una persona",
    );

    // ── LA ÚNICA SALIDA QUE SE SALTA EL TRASPASO ES EL ENLACE ────────────
    // Mandar el enlace de la agenda NO es un fallo: la cita se puede hacer y
    // entra sola a la Bandeja por el aviso de Calendly. Gastar un humano ahí
    // sería tirar una persona del equipo a algo que el cliente resuelve solo.
    //
    // Pero tampoco puede seguir por la salida normal del bloque, que es la que
    // dice «tu cita ha sido agendada» — nadie ha agendado nada todavía. Tiene
    // que DETENERSE. Si alguien cambia ese `return null` por un `break`,
    // vuelve el fallo de las dos mentiras seguidas, esta vez con enlace.
    const enlace = bloque.match(/===\s*"enlace"[\s\S]{0,120}/);
    esperar(!!enlace).verdadero("el camino del enlace de agenda desapareció del motor");
    esperar(/return null/.test(enlace[0])).verdadero(
      "tras mandar el enlace el flujo tiene que detenerse, no seguir a «tu cita ha sido agendada»",
    );
  });
});

// ─── LA IA DE RESPALDO TAMBIÉN TIENE MANOS ──────────────────────────────────
describe("La IA de respaldo puede HACER, no solo hablar", () => {
  // ─────────────────────────────────────────────────────────────────────────
  // ESTO COSTÓ UNA DEMO DE VERDAD, y era una divergencia entre los dos motores
  // que ninguna regla vigilaba.
  //
  // El «desvío» es lo que atiende una conversación cuando el flujo ya terminó
  // — o sea, casi todas las conversaciones abiertas. En el motor de WhatsApp,
  // la MISMA función sirve al bloque de IA y al desvío, así que las
  // herramientas iban en los dos casos. En el motor web —que atiende el widget
  // Y a Instagram— el desvío llamaba a `aiAnswer` SIN `agente`, y sin `agente`
  // no se arma ni una herramienta.
  //
  // Resultado: un prospecto pidió una demo por Instagram, la IA no tenía
  // `agendar_cita`, y como su prompt le decía que la usara, la ESCRIBIÓ:
  //
  //     «/agendar_cita hora: 9:00 AM fecha: mañana correo: …»
  //
  // Le llegó al cliente tal cual, y en el mensaje siguiente la IA confirmó una
  // cita que no existía.
  // ─────────────────────────────────────────────────────────────────────────
  const web = fs.readFileSync(path.join(SRC, "lib/flow/webRuntime.ts"), "utf8");
  const acciones = fs.readFileSync(path.join(SRC, "lib/ai/acciones.ts"), "utf8");
  const answer = fs.readFileSync(path.join(SRC, "lib/ai/answer.ts"), "utf8");
  const deno = fs.readFileSync(path.join(RAIZ, "supabase/functions/whatsapp/index.ts"), "utf8");

  test("el desvío del motor web arma el agente", () => {
    // ── SE MIRA LA LLAMADA, NO LA FIRMA ──────────────────────────────────
    // Escrita mirando el CUERPO de `responderDuda`, esta prueba no cazaba su
    // propio mutante: quitar el argumento en quien la llama deja la función
    // igual —sigue teniendo su parámetro `agente`— y las herramientas vuelven
    // a desaparecer. Lo que importa es que alguien se lo PASE.
    const t = sinComentarios(web);

    const firma = /async function responderDuda\([^)]*agente[^)]*\)/.test(t);
    esperar(firma).verdadero("la IA de respaldo ya no acepta un agente");

    const llamada = /responderDuda\(\s*ctx\s*,\s*[A-Za-z_$][\w$]*\s*\)/.test(t);
    esperar(llamada).verdadero(
      "se llama a la IA de respaldo SIN agente: puede hablar pero no puede agendar, etiquetar ni pasar con una persona — y si su prompt le pide una herramienta, la escribirá como texto al cliente",
    );
  });

  test("y quien lo llama le pasa un contexto de verdad", () => {
    // `agente` presente pero siempre `undefined` sería la misma avería con
    // mejor cara. Tiene que construirse un contexto con la conversación.
    const i = web.indexOf("const agenteDelDesvio");
    esperar(i > 0).verdadero("el desvío no construye contexto de agente");
    const bloque = web.slice(i, i + 400);
    for (const campo of ["orgId", "botId", "conversationId", "vars", "pasoAHumano"]) {
      esperar(bloque.includes(campo)).verdadero(`al contexto del desvío le falta ${campo}`);
    }
  });

  test("si la IA pasa con una persona en el desvío, el bot deja de esperar", () => {
    // Seguir escuchando sería que el bot volviera a contestar después de haber
    // dicho «ya te atiende alguien del equipo».
    esperar(/pasoAHumano \? null : awaiting/.test(sinComentarios(web))).verdadero(
      "tras un pase a humano desde el desvío, el flujo sigue esperando: el bot hablaría encima de la persona",
    );
  });

  test("LOS DOS MOTORES limpian los marcadores antes de enviar", () => {
    // Segunda barrera. La causa de fondo está arreglada, pero puede volver de
    // otra forma —una herramienta apagada, un tope de IA— y el síntoma siempre
    // es el mismo: el cliente ve las tripas.
    esperar(/export function sinMarcadores/.test(acciones)).verdadero("desapareció el limpiador");
    esperar(/sinMarcadores\(/.test(answer)).verdadero("el motor web no limpia la respuesta de la IA");
    esperar(/function sinMarcadores/.test(deno)).verdadero("el motor de WhatsApp perdió su copia del limpiador");
    esperar(/sinMarcadores\(bloques/.test(deno)).verdadero("el motor de WhatsApp no limpia la respuesta de la IA");
  });
});

// ─── EL CANAL NO SE ESCRIBE A MANO ──────────────────────────────────────────
describe("La Bandeja no confunde de canal", () => {
  // ─────────────────────────────────────────────────────────────────────────
  // El aviso de entrega decía «WhatsApp no está entregando tus mensajes»
  // SIEMPRE — también en una conversación de Instagram, y encima justo encima
  // de una explicación que hablaba de Instagram. El dueño leía dos canales
  // distintos en el mismo aviso y se ponía a revisar su WhatsApp, que estaba
  // perfectamente.
  //
  // El dato estaba a mano: la conversación sabe su canal y la línea del nombre
  // ya lo pintaba bien tres bloques más arriba.
  // ─────────────────────────────────────────────────────────────────────────
  const inbox = fs.readFileSync(path.join(SRC, "components/inbox/InboxClient.tsx"), "utf8");

  test("ningún mensaje al usuario nombra un canal a mano", () => {
    const t = sinComentarios(inbox);
    const malos = [];
    for (const canal of ["WhatsApp", "Instagram", "Messenger"]) {
      // Dentro de un texto que se le enseña a la persona: entre `>` y `<`, o
      // dentro de una cadena que acaba en punto. Se permite en atributos y en
      // nombres de campo (`whatsapp_channels`, `channel === "whatsapp"`).
      const re = new RegExp(`>\\s*${canal}\\s+no\\s|"[^"]*${canal}\\s+no\\s[^"]*"`, "g");
      if (re.test(t)) malos.push(canal);
    }
    esperar(malos.join(", ")).igual(
      "",
      "hay un aviso de la Bandeja con el nombre del canal escrito a mano: en una conversación de otro canal dirá el canal equivocado",
    );
  });
});

// ─── EL CATÁLOGO DE EVENTOS ES UN CONTRATO ──────────────────────────────────
describe("Los eventos que la plataforma cuenta", () => {
  const cat = fs.readFileSync(path.join(SRC, "lib/salidas-eventos.ts"), "utf8");
  const claves = [...cat.matchAll(/clave:\s*"([a-z_.]+)"/g)].map((m) => m[1]);

  test("la lista se leyó de verdad", () => {
    esperar(claves.length >= 5).verdadero("no pude leer el catálogo de eventos");
  });

  test("NINGÚN EVENTO DESAPARECE NI SE RENOMBRA", () => {
    // ─────────────────────────────────────────────────────────────────────
    // El propio archivo lo dice: «ESTA LISTA ES UN CONTRATO». Quien conecta su
    // CRM escribe código contra estos nombres, y renombrar uno rompe una
    // integración ajena sin avisar a nadie — el cliente se entera semanas
    // después, cuando le faltan leads en su sistema.
    //
    // Y desde que el embudo escucha los mismos eventos, un renombrado rompe
    // TAMBIÉN las reglas guardadas en `reglas_de_embudo`, que apuntan a estos
    // nombres. Se añaden eventos; no se renombran.
    // ─────────────────────────────────────────────────────────────────────
    const YA_PUBLICADOS = [
      "lead.nuevo", "lead.datos", "cita.agendada", "pase.a.humano", "conversacion.cerrada",
      "pedido.creado", "pedido.pagado", "pedido.pago_vencido", "cita.cancelada",
    ];
    const faltan = YA_PUBLICADOS.filter((k) => !claves.includes(k));
    esperar(faltan.join(", ")).igual(
      "",
      "desapareció un evento que ya salió al mundo: hay integraciones de clientes escritas contra ese nombre, y reglas de embudo apuntando a él",
    );
  });

  test("lo que el catálogo promete, alguien lo emite", () => {
    // Un evento en la lista que nadie emite es una casilla que el cliente marca
    // y que no le llega nunca. Se busca en el código Y en las migraciones,
    // porque los de la tienda salen de un disparador de la base.
    // ── EL PROPIO CATÁLOGO NO CUENTA COMO FUENTE ────────────────────────
    // Escrita sin esta exclusión, la regla se encontraba A SÍ MISMA: cada
    // clave aparece en el catálogo, así que TODAS pasaban y la prueba no
    // comprobaba nada. Lo cazó su mutante — un evento inventado que nadie
    // emitía pasaba tan campante.
    const fuentes = [
      ...ARCHIVOS.filter((a) => !a.ruta.endsWith("lib/salidas-eventos.ts")).map((a) => a.texto),
      fs.readFileSync(path.join(RAIZ, "supabase/functions/whatsapp/index.ts"), "utf8"),
      ...fs.readdirSync(path.join(RAIZ, "supabase/migrations"))
        .filter((f) => f.endsWith(".sql"))
        .map((f) => fs.readFileSync(path.join(RAIZ, "supabase/migrations", f), "utf8")),
    ].join("\n");

    const huerfanos = claves.filter((k) => !fuentes.includes(`"${k}"`) && !fuentes.includes(`'${k}'`));
    esperar(huerfanos.join(", ")).igual(
      "",
      "el catálogo promete eventos que nadie emite: el cliente marcaría la casilla y no le llegaría nada",
    );
  });
});

// ─── EL AGENTE SE LEE IGUAL EN LOS DOS MOTORES ──────────────────────────────
describe("El agente de IA, en los dos motores", () => {
  // ─────────────────────────────────────────────────────────────────────────
  // La traducción de «fila de agente» a «ajustes del motor» está escrita DOS
  // VECES: en `agenteAjustes.ts` (Node, puro y probado) y a mano dentro de la
  // función de Deno, que no puede importar del proyecto.
  //
  // El día que se separen, el MISMO agente hablará distinto según por dónde le
  // escriban — y eso no se ve en ninguna pantalla: se ve en la cara del cliente
  // que recibe otra respuesta en WhatsApp que en la web.
  // ─────────────────────────────────────────────────────────────────────────
  const puro = fs.readFileSync(path.join(SRC, "lib/ai/agenteAjustes.ts"), "utf8");
  const deno = fs.readFileSync(path.join(RAIZ, "supabase/functions/whatsapp/index.ts"), "utf8");

  // `columna → clave` tal como se escriben las asignaciones en los dos sitios.
  const pares = (t) =>
    [...t.matchAll(/o\.(\w+)\s*=\s*a\.(\w+)/g)].map((m) => `${m[2]}→${m[1]}`).sort();

  const soloElAgente = deno.slice(deno.indexOf("async function agenteDeEsteBot"));

  test("las dos listas se leyeron de verdad", () => {
    esperar(pares(puro).length >= 6).verdadero("no pude leer el mapeo puro");
    esperar(pares(soloElAgente).length >= 6).verdadero("no pude leer el mapeo del motor de Deno");
  });

  test("traducen las MISMAS columnas a las MISMAS claves", () => {
    esperar(pares(soloElAgente).join("\n      ")).igual(
      pares(puro).join("\n      "),
      "el mapeo del agente se separó entre los dos motores: el mismo agente hablaría distinto según el canal",
    );
  });

  test("los dos comprueban el nulo, no la verdad", () => {
    // `if (a.ia_encendida)` tira a la basura un `false`: apagar la IA no
    // serviría de nada y el bot seguiría contestando. Tiene que compararse
    // contra null/undefined en los dos sitios.
    for (const [nombre, texto] of [["el puro", puro], ["el motor de Deno", soloElAgente]]) {
      const flojas = [...texto.matchAll(/if \(a\.(\w+)\)\s*o\./g)].map((m) => m[1]);
      esperar(flojas.join(", ")).igual(
        "",
        `en ${nombre} hay campos del agente comprobados con una condición floja: un \`false\` o un texto vacío se perderían`,
      );
    }
  });

  test("los dos caen a `bots.ai` si no hay agente", () => {
    // Es la red que permite publicar esto sin jugarse los bots que ya venden.
    // Sin ella, un agente borrado deja al chatbot mudo.
    esperar(/aiDelBot/.test(puro)).verdadero("el puro perdió la caída a bots.ai");
    esperar(/bot\?\.ai|bot\.ai/.test(soloElAgente)).verdadero("el motor de Deno perdió la caída a bots.ai");
  });

  test("la tienda elegida manda en los dos, y no deja al bot sin tienda", () => {
    const paraElBot = fs.readFileSync(path.join(SRC, "lib/tienda/paraElBot.ts"), "utf8");
    esperar(/elegida/.test(paraElBot)).verdadero("el lado Node dejó de mirar la tienda elegida");
    esperar(/tiendaElegida/.test(deno)).verdadero("el motor de WhatsApp dejó de mirar la tienda elegida");

    // Y en los dos, si la elegida ya no vale se sigue con el criterio de
    // siempre en vez de devolver «no hay tienda».
    const tramo = deno.slice(deno.indexOf("const elegida = String(ctx.tiendaElegida"), deno.indexOf("const elegida = String(ctx.tiendaElegida") + 400);
    esperar(/if \(suya\) return suya/.test(tramo)).verdadero(
      "el motor de WhatsApp devuelve null cuando la tienda elegida ya no vale: tiene que caer al criterio de siempre",
    );
  });
});

// ─── LO QUE LA PALETA PROMETE, EL MOTOR LO CUMPLE ───────────────────────────
describe("Ningún bloque se ofrece en un canal donde no hace nada", () => {
  // ─────────────────────────────────────────────────────────────────────────
  // ESTA PRUEBA DEBERÍA HABER EXISTIDO DESDE EL PRINCIPIO.
  //
  // `channels.ts` se declara «fuente ÚNICA de verdad: qué componente aplica en
  // cada canal», y la paleta del constructor la obedece. Pero los motores no
  // la miraban: `webRuntime.ts` —el que atiende el widget Y a Instagram— no
  // implementaba `calendar`, `action`, `api` ni `redirect`, y los cuatro están
  // declarados para TODOS los canales.
  //
  // El cliente los arrastraba, los configuraba, y el motor los mandaba al caso
  // por defecto: imprimir el texto y seguir. SIN UN SOLO ERROR. Un bloque
  // «Agendar cita» en un bot de Instagram no agendaba nada y tampoco lo decía;
  // un webhook nunca salía; un «Ir a otra conversación» se quedaba donde
  // estaba.
  //
  // Prometer un bloque y no ejecutarlo es peor que no ofrecerlo: quien lo
  // arrastra construye su negocio encima.
  // ─────────────────────────────────────────────────────────────────────────
  const canales = fs.readFileSync(path.join(SRC, "lib/channels.ts"), "utf8");
  const web = fs.readFileSync(path.join(SRC, "lib/flow/webRuntime.ts"), "utf8");
  const deno = fs.readFileSync(path.join(RAIZ, "supabase/functions/whatsapp/index.ts"), "utf8");

  // Qué promete `COMPONENTS` para cada canal. Se lee del propio archivo para
  // que añadir un bloque nuevo entre en esta prueba solo.
  const promete = (canal) => {
    const i = canales.indexOf("export const COMPONENTS");
    const cuerpo = canales.slice(i);
    return [...cuerpo.matchAll(/^  (\w+):\s*\{[\s\S]*?channels:\s*(ALL|\[[^\]]*\])/gm)]
      .filter((m) => m[2] === "ALL" || m[2].includes(`"${canal}"`))
      .map((m) => m[1]);
  };

  const casos = (t) => new Set([...t.matchAll(/^      case "([a-z_]+)"/gm)].map((m) => m[1]));

  // `case "human": case "assign":` — dos en una línea. Sin esto la prueba
  // acusaría en falso a `assign`, que sí está implementado.
  const casosDeVerdad = (t) => {
    const s = casos(t);
    for (const m of t.matchAll(/case "([a-z_]+)":\s*case "([a-z_]+)":/g)) { s.add(m[1]); s.add(m[2]); }
    return s;
  };

  // EL ÚNICO QUE PUEDE VIVIR EN EL CASO POR DEFECTO. Un «Mensaje» es
  // exactamente lo que hace el caso por defecto —escribir su texto y seguir—
  // así que darle un `case` propio sería repetirlo por gusto. Cualquier otro
  // que caiga ahí es un bloque que no hace lo que promete.
  const PUEDE_IR_POR_DEFECTO = new Set(["message"]);

  // ── LOS QUE NUNCA SE CONSTRUYERON, Y ESTÁN EN LA PALETA ──────────────────
  //
  // Cinco bloques tienen tarjeta en la paleta, panel de configuración en el
  // Inspector y hasta tutorial de Lana — y NINGÚN motor los ejecuta. No es que
  // se hayan roto: nunca se escribieron.
  //
  // Van en una lista CERRADA en vez de dejar la prueba en rojo para siempre,
  // porque una prueba que siempre falla enseña a ignorar la suite entera. Pero
  // la lista se comprueba EXACTA: si aparece un sexto, la prueba lo caza; y
  // cuando se construya uno, hay que quitarlo de aquí a mano, que es
  // exactamente el momento de acordarse.
  const SIN_CONSTRUIR = ["ig_story", "ig_comment", "ig_dm", "fb_comment", "web_form"];

  test("la lista de bloques sin construir no crece sola", () => {
    const canales = ["webchat", "instagram", "messenger", "whatsapp"];
    const motorDe = (c) => (c === "whatsapp" ? deno : web);
    const huerfanos = new Set();
    for (const c of canales) {
      for (const k of promete(c)) {
        if (!casosDeVerdad(motorDe(c)).has(k) && !PUEDE_IR_POR_DEFECTO.has(k)) huerfanos.add(k);
      }
    }
    esperar([...huerfanos].sort().join(", ")).igual(
      [...SIN_CONSTRUIR].sort().join(", "),
      "cambió la lista de bloques que la paleta ofrece y ningún motor ejecuta: si construiste uno, quítalo de SIN_CONSTRUIR; si añadiste uno nuevo, constrúyelo antes de ofrecerlo",
    );
  });

  test("las listas se leyeron de verdad", () => {
    // Guarda contra el fallo silencioso: con un recorte roto, todo lo de abajo
    // pasaría sin comparar nada.
    esperar(promete("webchat").length > 10).verdadero("no pude leer COMPONENTS");
    esperar(casosDeVerdad(web).size > 10).verdadero("no pude leer los casos del motor web");
    esperar(casosDeVerdad(deno).size > 10).verdadero("no pude leer los casos del motor de WhatsApp");
  });

  for (const [canal, motor, nombre] of [
    ["webchat", () => web, "el widget web"],
    ["instagram", () => web, "Instagram"],
    ["whatsapp", () => deno, "WhatsApp"],
  ]) {
    test(`todo lo que la paleta ofrece en ${nombre} lo ejecuta su motor`, () => {
      const hechos = casosDeVerdad(motor());
      const faltan = promete(canal).filter(
        (k) => !hechos.has(k) && !PUEDE_IR_POR_DEFECTO.has(k) && !SIN_CONSTRUIR.includes(k),
      );
      esperar(faltan.join(", ")).igual(
        "",
        `en ${nombre} la paleta ofrece bloques que su motor no ejecuta: se arrastran, se configuran y no hacen nada`,
      );
    });
  }
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
    // SE LEE EL DE `src/`, QUE ES EL QUE CORRE. Esta prueba leyó durante horas
    // una copia en la raíz que Next nunca carga: pasaba en verde mientras el
    // escaparate daba 404 en su propio dominio. Una prueba que mira el archivo
    // equivocado no es una prueba, es una coartada.
    const mw = sinComentarios(fs.readFileSync(path.join(SRC, "middleware.ts"), "utf8"));
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
    // SE MIRA EL CREADOR, NO LA RUTA. La creación del pedido se sacó a
    // `crearPedido` el día que el chat empezó a tomar pedidos: hay DOS puertas
    // —el escaparate y el motor— y las dos entran por aquí. Mirar solo una
    // ruta dejaría la otra sin revisar, que es justo lo que esto evita.
    const ruta = sinComentarios(
      fs.readFileSync(path.join(SRC, "lib/tienda/crearPedido.ts"), "utf8"),
    );
    // SE MIRA DENTRO DE `crearPedido`, NO EN EL ARCHIVO ENTERO. La prueba
    // pasaba aunque se quitara el recálculo: `presupuestar` también lo llama,
    // y con buscar en todo el texto bastaba con que existiera en cualquier
    // parte. Lo cazó la prueba de mutación.
    const iCrea = ruta.indexOf("export async function crearPedido");
    esperar(iCrea > 0).verdadero("cambió el nombre del creador, revisa esta prueba");
    const cuerpo = ruta.slice(iCrea);
    esperar(cuerpo.includes("recalcularPedido(")).verdadero(
      "crearPedido no recalcula contra el catálogo: le estaría creyendo los precios a quien llama",
    );

    // Y NINGUNA PUERTA PUEDE CREAR EL PEDIDO POR SU CUENTA. El día que una
    // inserte en `pedidos` directamente, se salta el recálculo entero.
    for (const r of ["app/api/tienda/pedido/route.ts", "app/api/motor/pedido/route.ts"]) {
      const t = sinComentarios(fs.readFileSync(path.join(SRC, r), "utf8"));
      esperar(/from\(["']pedidos["']\)/.test(t)).falso(
        `${r} escribe en pedidos por su cuenta: tiene que pasar por crearPedido`,
      );
    }
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

  test("cada pedido nuevo intenta atarse a su contacto", () => {
    // ─────────────────────────────────────────────────────────────────────────
    // ESTO NO SE PUEDE ARREGLAR DESPUÉS. Un pedido que entra sin `contacto_id`
    // ya no sabe de quién era: el historial, la frecuencia y el ticket de esa
    // persona quedan incompletos para siempre. Es barato hacerlo en el momento
    // y imposible reconstruirlo luego, así que se protege con una prueba.
    // ─────────────────────────────────────────────────────────────────────────
    const ruta = path.join(SRC, "lib/tienda/crearPedido.ts");
    const t = sinComentarios(fs.readFileSync(ruta, "utf8"));

    // NO BASTA CON QUE LA PALABRA APAREZCA: tiene que ESCRIBIRSE. La prueba
    // pasaba con el guardado quitado, porque `contacto_id` sale también en el
    // tipo y en el insert. Lo cazó la prueba de mutación.
    esperar(/contacto_id:\s*contactoId/.test(t)).verdadero(
      "el pedido no llega a guardar el contacto que encontró",
    );
    esperar(t.includes("aWhatsapp(")).verdadero(
      "el teléfono tiene que normalizarse igual que en WhatsApp, o la persona queda partida en dos fichas",
    );
  });

  test("el teléfono del pedido se normaliza en UN solo sitio", () => {
    // Dos normalizaciones distintas es exactamente cómo se crean dos fichas
    // para la misma persona, y eso se nota cuando ya hay cien contactos.
    const malos = [];
    for (const { ruta, texto } of ARCHIVOS) {
      if (ruta.endsWith("lib/tienda/telefono.ts")) continue;
      if (ruta.endsWith("lib/phoneCountry.ts")) continue;
      if (/replace\(\s*\/\^507/.test(sinComentarios(texto))) malos.push(ruta);
    }
    esperar(malos.join(", ")).igual("", "hay prefijos de país escritos a mano fuera de telefono.ts");
  });

  test("el dominio del cobro se decide en UN solo sitio", () => {
    // ─────────────────────────────────────────────────────────────────────────
    // El cobro se CREA con un dominio y el aviso se COMPRUEBA contra otro. Si
    // esas dos piezas lo leen cada una por su cuenta y una de las dos se
    // encuentra el campo vacío, el pago entra y el pedido nunca se marca. Ya
    // estuvo a punto de pasar con una tienda real.
    // ─────────────────────────────────────────────────────────────────────────
    const rutas = [
      "app/api/tienda/yappy/ipn/route.ts",
      "lib/tienda/cobrar-pedido.ts",
    ];
    for (const r of rutas) {
      const t = sinComentarios(fs.readFileSync(path.join(SRC, r), "utf8"));
      esperar(t.includes("dominioDeCobro(")).verdadero(
        `${r} lee el dominio del cobro por su cuenta en vez de usar el respaldo`,
      );
      esperar(/dominio\s*\?\?\s*""/.test(t)).falso(`${r} deja pasar un dominio vacío`);
    }
  });

  test("reintentar el pago no crea un pedido nuevo", () => {
    // Se vio en la base: dos pedidos idénticos, cuatro segundos de diferencia.
    // Era alguien pulsando «pagar», viendo un error y pulsando otra vez.
    const ruta = path.join(SRC, "app/api/tienda/pedido/cobrar/route.ts");
    esperar(fs.existsSync(ruta)).verdadero("falta la ruta para reintentar el cobro");
    const t = sinComentarios(fs.readFileSync(ruta, "utf8"));

    esperar(/from\(\s*["']pedidos["']\s*\)[\s\S]{0,120}insert/.test(t)).falso(
      "reintentar el cobro no puede insertar un pedido",
    );
    esperar(t.includes('pago === "pagado"')).verdadero(
      "un pedido ya pagado no se puede volver a cobrar",
    );
  });

  test("la página de pago no lee el importe de la dirección", () => {
    // ─────────────────────────────────────────────────────────────────────────
    // Es la diferencia con la tienda anterior, y la única que importa de
    // verdad: allí el importe viajaba en la URL. Aquí solo el código.
    // ─────────────────────────────────────────────────────────────────────────
    const ruta = path.join(SRC, "app/t/[slug]/pagar/[codigo]/page.tsx");
    esperar(fs.existsSync(ruta)).verdadero("falta la página de pago");
    const t = sinComentarios(fs.readFileSync(ruta, "utf8"));

    esperar(/searchParams/.test(t)).falso("la página de pago no puede leer parámetros de la dirección");
    esperar(t.includes('.eq("codigo"')).verdadero("el pedido se busca por su código");
    esperar(t.includes('.eq("tienda_id"')).verdadero(
      "el pedido tiene que buscarse dentro de su tienda, no en toda la plataforma",
    );
  });

  test("el escaparate ya no cobra: pagar vive en su propia página", () => {
    // El botón dentro del carrito existía treinta segundos y desaparecía. El
    // enlace del mensaje se puede reenviar mañana.
    const esc = sinComentarios(
      fs.readFileSync(path.join(SRC, "components/tienda/Escaparate.tsx"), "utf8"),
    );
    esperar(/BotonYappy/.test(esc)).falso("el botón de pago volvió al carrito");
  });

  test("HAY UN SOLO middleware, y vive en src/", () => {
    // ─────────────────────────────────────────────────────────────────────────
    // ESTA PRUEBA EXISTE POR UNA TARDE PERDIDA. La aplicación vive en
    // `src/app`, así que Next solo carga `src/middleware.ts`. Había una segunda
    // copia en la raíz con todo el enrutado del dominio de tiendas: código
    // correcto, pruebas en verde, y NUNCA se ejecutaba. El escaparate daba 404
    // en su propia dirección y no había un solo error donde mirar.
    //
    // Un archivo que no corre es peor que uno que falla: el que falla avisa.
    // ─────────────────────────────────────────────────────────────────────────
    esperar(fs.existsSync(path.join(SRC, "middleware.ts"))).verdadero(
      "el middleware tiene que estar en src/, que es donde Next lo busca",
    );
    esperar(fs.existsSync(path.join(RAIZ, "middleware.ts"))).falso(
      "hay un middleware en la raíz que Next ignora: o se borra, o alguien va a editarlo creyendo que corre",
    );

    // Y el que sí corre es el que enruta el dominio de tiendas.
    const t = sinComentarios(fs.readFileSync(path.join(SRC, "middleware.ts"), "utf8"));
    esperar(t.includes("DOMINIO_TIENDAS")).verdadero(
      "el middleware que corre no sabe nada del dominio de tiendas",
    );
    esperar(t.includes("hostDeLaPeticion(")).verdadero(
      "el dominio se lee sin tener en cuenta el proxy que hay delante",
    );
  });

  test("cambiar la dirección NO puede romper los enlaces repartidos", () => {
    // ─────────────────────────────────────────────────────────────────────────
    // Dentro de cada enlace de cobro que ya está en el chat de un cliente va la
    // dirección de la tienda del día en que se mandó. Si el negocio la cambia y
    // la vieja deja de llevar aquí, esos cobros mueren en silencio: el cliente
    // abre el enlace, no ve nada, y nadie se entera de que ese dinero no entra.
    // ─────────────────────────────────────────────────────────────────────────
    const acciones = sinComentarios(
      fs.readFileSync(path.join(SRC, "app/(dashboard)/tienda/[id]/actions.ts"), "utf8"),
    );
    esperar(acciones.includes("cambiarDireccion")).verdadero("no se puede cambiar la dirección");
    esperar(acciones.includes("tienda_direcciones_previas")).verdadero(
      "al cambiar la dirección no se guarda la anterior: los enlaces repartidos quedarían muertos",
    );

    // Y las dos puertas públicas tienen que llevar de la vieja a la nueva.
    for (const r of ["app/t/[slug]/page.tsx", "app/t/[slug]/pagar/[codigo]/page.tsx"]) {
      const t = sinComentarios(fs.readFileSync(path.join(SRC, r), "utf8"));
      esperar(t.includes("direccionAnterior(")).verdadero(
        `${r} contesta 404 a una dirección vieja en vez de llevar a la nueva`,
      );
    }
  });

  test("una dirección abandonada no la puede reclamar otro negocio", () => {
    // Quedarse con la dirección vieja de otro es quedarse con su tráfico y con
    // los enlaces de cobro que tenga repartidos.
    const crear = sinComentarios(
      fs.readFileSync(path.join(SRC, "app/(dashboard)/tienda/actions.ts"), "utf8"),
    );
    esperar(crear.includes("tienda_direcciones_previas")).verdadero(
      "al crear una tienda no se comprueban las direcciones que ya estuvieron en uso",
    );
  });

  test("la pantalla que enciende la agenda dice si la agenda funciona", () => {
    // ─────────────────────────────────────────────────────────────────────────
    // Es la misma lección que el cobro: una casilla marcada no es una función
    // que funciona. Quien enciende «Agendar citas» está en esta pantalla, y
    // mandarle a otra a comprobar si su calendario está conectado es
    // exactamente cómo se queda sin comprobar.
    // ─────────────────────────────────────────────────────────────────────────
    const t = sinComentarios(
      fs.readFileSync(path.join(SRC, "app/(dashboard)/bots/[id]/ai/page.tsx"), "utf8"),
    );
    esperar(t.includes("loQueFaltaParaAgendar(")).verdadero(
      "la pantalla de la IA no comprueba si la agenda puede funcionar",
    );
    esperar(t.includes("google_calendar")).verdadero(
      "no se mira si Google Calendar está conectado",
    );
    esperar(/timezone/.test(t)).verdadero(
      "la zona horaria no se enseña: viene por defecto en otra ciudad y corre todas las horas",
    );
  });

  test("después de pagar hay un botón para avisarle al negocio", () => {
    // ─────────────────────────────────────────────────────────────────────────
    // ESTO SE VIO EN EL PRIMER COBRO REAL. El pago entró, la página dijo «Pago
    // enviado» y ahí se quedó: quien llega por el enlace puede no haber mandado
    // nunca el mensaje del pedido —lo abrió desde otro sitio, o cerró WhatsApp
    // sin enviarlo— y el negocio se queda con el dinero en la cuenta y sin
    // saber qué preparar ni para quién.
    // ─────────────────────────────────────────────────────────────────────────
    const t = sinComentarios(
      fs.readFileSync(path.join(SRC, "components/tienda/PaginaDePago.tsx"), "utf8"),
    );
    esperar(t.includes("textoPedido")).verdadero(
      "la página de pago no tiene el pedido escrito para mandarlo",
    );
    esperar(t.includes("enlaceDeWhatsapp(")).verdadero(
      "después de pagar no hay forma de avisarle al negocio",
    );

    // Y el texto lo arma el SERVIDOR con los precios de la base, no el navegador.
    const pagina = sinComentarios(
      fs.readFileSync(path.join(SRC, "app/t/[slug]/pagar/[codigo]/page.tsx"), "utf8"),
    );
    esperar(pagina.includes("textoDelPedido(")).verdadero(
      "el mensaje del pedido pagado tiene que armarse en el servidor",
    );
  });

  test("el pedido entra a la Bandeja con dueño, no suelto", () => {
    // ─────────────────────────────────────────────────────────────────────────
    // AQUÍ SE CORTABA EL RECORRIDO. El cliente mandaba su pedido por WhatsApp,
    // el mensaje entraba a la Bandeja como texto cualquiera, y el pedido vivía
    // en otra pantalla sin relación con esa conversación. Nadie quedaba
    // encargado: el negocio ataba a mano el chat, el pedido y el cobro.
    //
    // Es justo lo que ninguna tienda suelta puede hacer, y era la tesis de
    // meter la tienda dentro de la plataforma.
    // ─────────────────────────────────────────────────────────────────────────
    const mig = path.join(RAIZ, "supabase/migrations/0078_pedido_entra_a_la_bandeja.sql");
    esperar(fs.existsSync(mig)).verdadero("falta el enlace entre el pedido y la conversación");
    const sql = fs.readFileSync(mig, "utf8").replace(/--.*$/gm, "");

    esperar(/on\s+public\.messages/.test(sql)).verdadero(
      "el enlace tiene que dispararse al entrar el mensaje",
    );
    esperar(/conversacion_id/.test(sql)).verdadero("el pedido no se ata a su conversación");
    esperar(/assignee_member_id/.test(sql)).verdadero("nadie queda encargado del pedido");

    // VA EN LA BASE Y NO EN EL MOTOR: es la regla que ya fijó el reparto, para
    // que valga igual en WhatsApp y en el widget web sin duplicarla.
    esperar(/direction\s*<>\s*'inbound'/.test(sql)).verdadero(
      "se dispararía también con lo que manda el negocio, que repite el mismo código",
    );
  });

  test("EL MOTOR NO SABE CREAR PEDIDOS, Y NO DEBE APRENDER", () => {
    // ─────────────────────────────────────────────────────────────────────────
    // El motor corre en Deno con la llave de servicio: podría insertar en
    // `pedidos` él solo. Sería el error más caro del proyecto — habría DOS
    // calculadoras de dinero con las mismas reglas copiadas, y el día que
    // alguien arregle un redondeo en una, la otra sigue cobrando mal durante
    // meses porque los dos caminos parecen funcionar.
    //
    // El motor hace de cartero: le pregunta a la plataforma y manda lo que le
    // dicen. Esta prueba es lo que impide que un día deje de hacerlo.
    // ─────────────────────────────────────────────────────────────────────────
    const motor = sinComentarios(
      fs.readFileSync(path.join(RAIZ, "supabase/functions/whatsapp/index.ts"), "utf8"),
    );
    for (const tabla of ["pedidos", "pedido_lineas", "pedido_eventos"]) {
      esperar(new RegExp(`from\\(["']${tabla}["']\\)\\s*\\n?\\s*\\.insert`).test(motor)).falso(
        `el motor escribe en ${tabla} por su cuenta: tiene que pasar por /api/motor/pedido`,
      );
    }
    esperar(motor.includes("/api/motor/pedido")).verdadero(
      "el motor tiene que pedirle el pedido a la plataforma",
    );
  });

  test("la conversación del pedido está escrita UNA vez para los dos motores", () => {
    // Hay dos motores que no comparten un archivo: Deno para WhatsApp e
    // Instagram, Node para el widget. Si cada uno tuviera sus preguntas, un día
    // preguntarían distinto — y con un pedido eso es cobrar distinto según por
    // dónde escribió el cliente.
    // TIENE QUE LLAMARLA, no solo nombrar el archivo. La prueba pasaba con la
    // importación convertida en `type MensajeChat = any`, porque el nombre del
    // archivo seguía apareciendo en el import dinámico. Lo cazó la mutación.
    const web = sinComentarios(fs.readFileSync(path.join(SRC, "lib/flow/webRuntime.ts"), "utf8"));
    esperar(web.includes("tienda/conversacionDePedido")).verdadero(
      "el widget web se armó su propia conversación de pedido",
    );
    esperar(/await\s+conversar\(/.test(web)).verdadero(
      "el widget no llega a llamar a la conversación compartida",
    );
    esperar(/siguientePaso\(|cabeEnElChat\(|recalcularPedido\(/.test(web)).falso(
      "el widget está decidiendo la conversación del pedido por su cuenta",
    );
    const motor = sinComentarios(
      fs.readFileSync(path.join(RAIZ, "supabase/functions/whatsapp/index.ts"), "utf8"),
    );
    esperar(/siguientePaso|cabeEnElChat|recalcularPedido/.test(motor)).falso(
      "el motor está decidiendo la conversación del pedido en vez de preguntar",
    );
  });

  test("el código del pedido viaja SIEMPRE en el mensaje", () => {
    // Es lo único que permite reconocer el pedido al llegar a la Bandeja. Si
    // solo viajara dentro del enlace de cobro, una tienda que cobra al recibir
    // mandaría un texto que nadie puede relacionar con nada.
    const t = sinComentarios(
      fs.readFileSync(path.join(SRC, "lib/tienda/crearPedido.ts"), "utf8"),
    );
    const iCodigo = t.indexOf("Código: ");
    esperar(iCodigo > 0).verdadero("el mensaje no lleva el código del pedido");

    // Y va FUERA del trozo condicional del cobro: lo que se añade solo cuando
    // la tienda cobra en línea termina en `: []),`, y el código va después.
    const iFinDelCondicional = t.lastIndexOf(": []),");
    esperar(iFinDelCondicional > 0).verdadero("cambió la forma del mensaje, revisa esta prueba");
    esperar(iCodigo > iFinDelCondicional).verdadero(
      "el código está dentro del trozo del cobro: una tienda que cobra al recibir mandaría un mensaje que nadie puede relacionar con su pedido",
    );
  });
});

describe("Tienda: los avisos al cliente", () => {
  test("EL PEDIDO SE MUEVE AUNQUE EL AVISO FALLE", () => {
    // ─────────────────────────────────────────────────────────────────────────
    // El estado del pedido es la verdad del negocio; el aviso es una cortesía
    // al cliente. Si se avisara ANTES de guardar, un token de Meta caducado o
    // un mensaje fuera de las 24 h dejaría al negocio sin poder mover sus
    // pedidos — infinitamente peor que un cliente sin notificación.
    // ─────────────────────────────────────────────────────────────────────────
    const t = sinComentarios(
      fs.readFileSync(path.join(SRC, "app/(dashboard)/tienda/[id]/actions.ts"), "utf8"),
    );

    const iGuardar = t.indexOf('.update({ estado');
    const iAvisar = t.indexOf("avisarDelPedido(");
    esperar(iGuardar > 0).verdadero("cambió la forma de guardar el estado, revisa esta prueba");
    esperar(iAvisar > 0).verdadero("mover un pedido ya no avisa al cliente");
    esperar(iAvisar > iGuardar).verdadero(
      "se avisa antes de guardar: un fallo de WhatsApp bloquearía el tablero",
    );
  });

  test("arrastrar una tarjeta al sitio donde ya estaba no vuelve a avisar", () => {
    // Tres arrastres de ida y vuelta son tres cambios por dentro y un solo
    // hecho para el cliente. Sin esto recibe el mismo mensaje tres veces.
    const t = sinComentarios(
      fs.readFileSync(path.join(SRC, "app/(dashboard)/tienda/[id]/actions.ts"), "utf8"),
    );
    esperar(/antes\.estado === estado/.test(t)).verdadero(
      "no se compara con el estado anterior antes de mover y avisar",
    );
  });

  test("EL AVISO NO PUEDE ROMPER LA RESPUESTA A YAPPY", () => {
    // ─────────────────────────────────────────────────────────────────────────
    // Si esta ruta contestara error, Yappy reintentaría el mismo aviso de pago
    // —que ya está guardado— y el cliente recibiría el mensaje otra vez. El
    // cobro manda; el aviso va detrás y protegido.
    // ─────────────────────────────────────────────────────────────────────────
    const t = sinComentarios(
      fs.readFileSync(path.join(SRC, "app/api/tienda/yappy/ipn/route.ts"), "utf8"),
    );
    const i = t.indexOf("avisarDelPedido(");
    esperar(i > 0).verdadero("el pago ya no avisa al cliente");
    esperar(/try\s*{[\s\S]{0,200}avisarDelPedido\(/.test(t)).verdadero(
      "el aviso no está protegido: un fallo suyo haría reintentar el pago a Yappy",
    );
    esperar(t.indexOf("update(cambios)") < i).verdadero(
      "se avisa antes de guardar el pago",
    );
  });

  test("UN ENLACE VENCIDO CANCELA EL PEDIDO; UN RECHAZO, NO", () => {
    // ─────────────────────────────────────────────────────────────────────────
    // Los dos se leen como «no pagó» y no son lo mismo. El enlace vencido está
    // muerto y no vuelve nadie; el rechazo tiene a una persona delante que casi
    // siempre reintenta a los diez segundos —cancelar en la app de Yappy es un
    // dedazo clásico— y cancelarle el pedido le cuesta el carrito entero.
    // ─────────────────────────────────────────────────────────────────────────
    const t = sinComentarios(
      fs.readFileSync(path.join(SRC, "app/api/tienda/yappy/ipn/route.ts"), "utf8"),
    );

    esperar(/pago === "expirado"[^;]{0,80}estado === "recibido"/.test(t)).verdadero(
      "no se distingue el enlace vencido, o se cancela un pedido que el negocio ya movió",
    );
    esperar(/rechazado[\s\S]{0,120}cancelar/i.test(t)).falso(
      "un pago rechazado está cancelando el pedido",
    );
    esperar(t.includes('"enlace_vencido"') && t.includes('"pago_no_completado"')).verdadero(
      "los dos finales mandan el mismo mensaje",
    );
  });

  test("UN PEDIDO CANCELADO NO SE PUEDE PAGAR POR NINGUNA PUERTA", () => {
    // ─────────────────────────────────────────────────────────────────────────
    // Al vencer el enlace le decimos al cliente que su pedido quedó cancelado.
    // Si ese mismo enlace siguiera cobrando, esa persona pagaría algo que le
    // acabamos de decir que ya no existe, y el negocio tendría dinero de un
    // pedido que no está en ninguna columna. Son dos puertas y hay que cerrar
    // las dos: la pantalla y la ruta que cobra.
    // ─────────────────────────────────────────────────────────────────────────
    const ruta = sinComentarios(
      fs.readFileSync(path.join(SRC, "app/api/tienda/pedido/cobrar/route.ts"), "utf8"),
    );
    esperar(/if\s*\(\s*pedido\.estado === "cancelado"\s*\)\s*{[\s\S]{0,300}return/.test(ruta)).verdadero(
      "la ruta que cobra acepta un pedido cancelado (o la comprobación lleva una condición de más)",
    );

    const pagina = sinComentarios(
      fs.readFileSync(path.join(SRC, "app/t/[slug]/pagar/[codigo]/page.tsx"), "utf8"),
    );
    const iCancelado = pagina.indexOf('estado === "cancelado"');
    const iBoton = pagina.indexOf("<PaginaDePago");
    esperar(iCancelado > 0).verdadero("la pantalla de pago no mira si el pedido está cancelado");
    esperar(iCancelado < iBoton).verdadero(
      "la comprobación va después del botón de pago, así que no lo evita",
    );
  });

  test("el enlace corto de los botones de plantilla existe de verdad", () => {
    // Una plantilla aprobada por Meta lleva la dirección dentro. Si la ruta no
    // existe, el botón que el cliente pulsa para pagar da 404 — y eso no se
    // arregla sin volver a pasar por revisión.
    const ruta = path.join(SRC, "app/t/r/[codigo]/page.tsx");
    esperar(fs.existsSync(ruta)).verdadero("falta la ruta /r/<código> que usan los botones");
    const t = sinComentarios(fs.readFileSync(ruta, "utf8"));
    esperar(t.includes("codigoValido(")).verdadero(
      "no se comprueba la forma del código: esta dirección serviría para adivinarlos",
    );
    esperar(/redirect\(/.test(t)).verdadero("el enlace corto no redirige a ninguna parte");
  });

  test("el que manda los avisos NO puede acabar en el navegador", () => {
    // `lib/tienda/avisar.ts` lee el token de WhatsApp de la organización. Que
    // una pantalla de cliente lo importe metería ese camino en el paquete que
    // se descarga el visitante de la tienda.
    const malos = [];
    for (const { ruta, texto } of ARCHIVOS) {
      if (!/^\s*["']use client["']/m.test(texto)) continue;
      if (/from\s+["'][^"']*tienda\/avisar["']/.test(sinComentarios(texto))) malos.push(ruta);
    }
    esperar(malos.join(", ")).igual("", "una pantalla de cliente importa el módulo que envía");
  });

  test("los textos de los avisos SÍ pueden pintarse en el navegador", () => {
    // La vista previa es lo único que hace que alguien note que escribió
    // {pedido} en vez de {numero} antes de que ese mensaje salga de verdad.
    // Para eso, el módulo de los textos no puede arrastrar nada de servidor.
    const t = fs.readFileSync(path.join(SRC, "lib/tienda/avisos.ts"), "utf8");
    esperar(/from\s+["'](node:|crypto|@supabase|@\/lib\/canales)/.test(sinComentarios(t))).falso(
      "lib/tienda/avisos.ts tiene que poder correr en el navegador",
    );
  });

  test("el aviso queda escrito en la conversación, y no como si fuera el bot", () => {
    // Un aviso que no entra en la Bandeja hace que el agente salude a alguien
    // a quien el sistema acaba de escribir sin tener ni idea. Y marcarlo como
    // «bot» ensucia la analítica de la IA con mensajes que no son suyos.
    const t = sinComentarios(fs.readFileSync(path.join(SRC, "lib/tienda/avisar.ts"), "utf8"));
    esperar(/from\(\s*["']messages["']\s*\)[\s\S]{0,200}insert/.test(t)).verdadero(
      "el aviso no se guarda en la conversación",
    );
    esperar(/sender:\s*["']system["']/.test(t)).verdadero(
      "el aviso se guarda como bot o como agente, y no lo es",
    );
  });

  test("NO SE AVISA DOS VECES DE LO MISMO", () => {
    // ─────────────────────────────────────────────────────────────────────────
    // No basta con preguntarle a la bitácora: hay que IRSE si la respuesta es
    // que sí. Preguntar y seguir enviando igual es el error que esta prueba
    // existe para cazar, porque desde fuera se ve idéntico a estar protegido.
    // ─────────────────────────────────────────────────────────────────────────
    const t = sinComentarios(fs.readFileSync(path.join(SRC, "lib/tienda/avisar.ts"), "utf8"));

    const consulta = t.match(/const\s*{\s*data:\s*(\w+)\s*}[^;]{0,400}contains\(/);
    esperar(!!consulta).verdadero("no se comprueba en la bitácora si ese aviso ya salió");

    const usa = new RegExp(`${consulta[1]}[^;]{0,120}return`);
    esperar(usa.test(t)).verdadero(
      "se pregunta si el aviso ya salió y se manda igual: el cliente lo recibe dos veces",
    );

    const iCorte = t.search(usa);
    esperar(iCorte > 0 && iCorte < t.indexOf("enviarTexto(")).verdadero(
      "la comprobación de duplicados va después del envío, así que no lo evita",
    );
  });
});

describe("Tienda: el pedido y su conversación, en los dos sentidos", () => {
  test("DESDE EL PEDIDO SE LLEGA AL CHAT", () => {
    // Sin esto hay que abrir Conversaciones en otra pestaña y buscar a la
    // persona por el nombre. En hora punta eso no lo hace nadie, y el pedido
    // se despacha sin leer lo que el cliente escribió después.
    const t = sinComentarios(fs.readFileSync(path.join(SRC, "components/tienda/Pedidos.tsx"), "utf8"));
    esperar(/\/inbox\?c=\$\{[^}]*conversacion_id/.test(t)).verdadero(
      "la tarjeta del pedido no lleva a su conversación",
    );
    // Y NO SE PINTA SI NO HAY CHAT: un botón que no lleva a ninguna parte
    // enseña a la gente a no pulsarlo.
    esperar(/\{p\.conversacion_id &&/.test(t)).verdadero(
      "el enlace al chat se pinta aunque el pedido no tenga conversación",
    );
  });

  test("Y DESDE EL CHAT SE VUELVE AL PEDIDO", () => {
    // La ida sin la vuelta no sirve: el agente que resuelve la duda tendría
    // que buscar el pedido a mano para moverlo, y en hora punta no lo mueve.
    // Así es como un pedido pagado se queda en «Recibidos».
    const t = sinComentarios(
      fs.readFileSync(path.join(SRC, "components/tienda/ComprasDelContacto.tsx"), "utf8"),
    );
    esperar(/t=pedidos#pedido-\$\{/.test(t)).verdadero("la ficha del contacto no vuelve al pedido");

    // Y EL ANCLA TIENE QUE EXISTIR AL OTRO LADO, o el enlace lleva a la lista
    // entera y el agente busca a ojo justo lo que veníamos a evitar.
    const tablero = sinComentarios(
      fs.readFileSync(path.join(SRC, "components/tienda/Pedidos.tsx"), "utf8"),
    );
    esperar(/id=\{`pedido-\$\{p\.numero\}`\}/.test(tablero)).verdadero(
      "las tarjetas no tienen ancla: el enlace de vuelta no cae en ninguna",
    );
  });

  test("se vuelve al pedido DE ESTA conversación, no al último", () => {
    // Un cliente que repite tiene varios pedidos. Llevar al agente al pedido
    // equivocado mientras habla de otro es peor que no llevarlo a ninguno.
    const t = sinComentarios(
      fs.readFileSync(path.join(SRC, "components/tienda/ComprasDelContacto.tsx"), "utf8"),
    );
    esperar(/conversacion_id[^;]{0,80}=== conversacionId/.test(t)).verdadero(
      "no se busca el pedido de esta conversación",
    );
  });
});

describe("Tienda: las medidas de las imágenes", () => {
  test("LA INSTRUCCIÓN Y EL RECORTE SALEN DEL MISMO NÚMERO", () => {
    // ─────────────────────────────────────────────────────────────────────────
    // Escritos en dos sitios, el día que alguien cambie el diseño la ayuda
    // seguirá diciendo lo de antes — y el cliente mandará una imagen que se ve
    // cortada haciendo exactamente lo que le pedimos.
    // ─────────────────────────────────────────────────────────────────────────
    const esc = sinComentarios(
      fs.readFileSync(path.join(SRC, "components/tienda/Escaparate.tsx"), "utf8"),
    );
    esperar(esc.includes('proporcionDe("portada")')).verdadero(
      "la portada recorta con una proporción escrita a mano",
    );
    esperar(esc.includes('proporcionDe("banner")')).verdadero(
      "los banners recortan con una proporción escrita a mano",
    );

    const editor = sinComentarios(
      fs.readFileSync(path.join(SRC, "components/tienda/EditorDiseno.tsx"), "utf8"),
    );
    for (const clave of ["logo", "portada", "banner", "categoria"]) {
      esperar(editor.includes(`<Medida clave="${clave}"`)).verdadero(
        `el campo de ${clave} no dice qué medida tiene que tener`,
      );
    }
  });
});

describe("Los pedidos alimentan el embudo", () => {
  const mig = sinComentarios(
    fs.readFileSync(path.join(RAIZ, "supabase/migrations/0079_pedidos_al_embudo.sql"), "utf8"),
  );

  test("DE CENTAVOS A UNIDADES, o el reporte de ventas se multiplica por cien", () => {
    // El pedido guarda 1763 y el embudo muestra 17.63. Los dos números son
    // correctos en su sitio; confundirlos es el error más caro posible en una
    // pantalla que el dueño usa para decidir.
    esperar(/\/\s*100/.test(mig)).verdadero("el importe no se convierte de centavos");
  });

  test("SE RECALCULA ENTERO, no se va sumando", () => {
    // Ir sumando obliga a acordarse de restar. Una resta olvidada —un pedido
    // cancelado, uno editado— deja el embudo inflado para siempre y nadie lo
    // nota, porque el número sigue pareciendo razonable.
    esperar(/sum\(pe\.total\)/.test(mig)).verdadero("no se recalcula la suma de los pedidos");
    esperar(/estado <> 'cancelado'/.test(mig)).verdadero("los pedidos cancelados suman");
  });

  test("UN PAGO SOLO GANA EN EL INSTANTE EN QUE OCURRE", () => {
    // Sin esto, cualquier cambio posterior sobre un pedido ya pagado volvería
    // a arrastrar la tarjeta a Ganada — incluso después de que el dueño la
    // hubiera reabierto a propósito. Un tablero que no obedece.
    esperar(/old\.pago is distinct from new\.pago/.test(mig)).verdadero(
      "se mira el estado del pago a secas: la tarjeta se cerrará sola una y otra vez",
    );
    esperar(/v_status = 'abierta'/.test(mig)).verdadero(
      "una tarjeta ya cerrada se puede volver a mover: es una decisión tomada",
    );
  });

  test("UN PEDIDO CANCELADO NO PIERDE LA OPORTUNIDAD", () => {
    // Un enlace de pago vencido se vuelve a pedir casi siempre. Marcar
    // «perdida» por eso llenaría el embudo de derrotas que no ocurrieron.
    // Se mira el CÓDIGO, no el texto: `sinComentarios` no quita los «--» de
    // SQL, así que buscar la palabra suelta encontraría el comentario que
    // explica justamente por qué no se hace.
    esperar(/outcome\s*=\s*'perdido'/.test(mig)).falso(
      "la migración busca la etapa de perdida: un enlace vencido no es una derrota",
    );
    esperar(/status\s*(:)?=\s*'perdida'/.test(mig)).falso(
      "la migración marca oportunidades como perdidas",
    );
  });

  test("los dos interruptores existen y vienen encendidos", () => {
    // Encendidos de fábrica porque quien vende por tienda quiere las dos
    // cosas; apagables porque en venta consultiva un pedido de $17 no puede
    // pisar un pronóstico de $5.000.
    for (const c of ["pedidos_suman", "pedido_pagado_gana"]) {
      esperar(new RegExp(`${c} boolean not null default true`).test(mig)).verdadero(
        `falta el interruptor ${c}`,
      );
      esperar(mig.includes(`coalesce(p.${c}, true)`)).verdadero(
        `${c} no se respeta en el disparador`,
      );
    }

    // Y se pueden tocar desde la pantalla, o no sirven de nada.
    const pantalla = sinComentarios(
      fs.readFileSync(path.join(SRC, "app/(dashboard)/settings/states/page.tsx"), "utf8"),
    );
    const accion = sinComentarios(
      fs.readFileSync(path.join(SRC, "app/(dashboard)/settings/actions.ts"), "utf8"),
    );
    for (const c of ["pedidos_suman", "pedido_pagado_gana"]) {
      esperar(pantalla.includes(`name="${c}"`)).verdadero(`${c} no se puede ver en Configuración`);
      esperar(accion.includes(`${c}:`)).verdadero(`${c} no se guarda`);
    }
  });

  test("la regla vive en la BASE, no en el panel", () => {
    // El pago lo confirma una ruta pública (el aviso de Yappy) y el estado lo
    // cambia otra pantalla. Escrita en cada una, un día dejan de coincidir.
    esperar(/create trigger pedidos_al_embudo/.test(mig)).verdadero("no hay disparador");
    const rutaIpn = sinComentarios(
      fs.readFileSync(path.join(SRC, "app/api/tienda/yappy/ipn/route.ts"), "utf8"),
    );
    esperar(/opportunit/i.test(rutaIpn)).falso(
      "el aviso de pago toca el embudo por su cuenta: esa regla tiene que estar en un solo sitio",
    );
  });
});

describe("La tienda tiene UN solo botón que gana", () => {
  const esc = fs.readFileSync(path.join(SRC, "components/tienda/Escaparate.tsx"), "utf8");
  const limpio = sinComentarios(esc);

  test("ARRIBA DEL CATÁLOGO NO HAY ATAJO A WHATSAPP", () => {
    // ─────────────────────────────────────────────────────────────────────────
    // Se quitó después de verlo pasar: había un botón verde grande «Escribir» y
    // un globo flotando sobre el carrito, y la gente los pulsaba para HACER EL
    // PEDIDO. Escribían «hola quiero croquetas», el carrito se quedaba vacío y
    // el negocio volvía a tomar nota a mano — justo de lo que veníamos huyendo.
    //
    // Un atajo a WhatsApp compite con el catálogo y gana él, por más grande y
    // más familiar. El WhatsApp de consultas vive en el pie, después de todo.
    // ─────────────────────────────────────────────────────────────────────────
    const pie = limpio.indexOf("Consultas al");
    esperar(pie > 0).verdadero("cambió el pie, revisa esta prueba");

    // Se miran los ENLACES, no la variable: declararla arriba es normal, usarla
    // arriba es el problema.
    const usos = [...limpio.matchAll(/href=\{waConsultas\}/g)].map((m) => m.index ?? 0);
    esperar(usos.length).igual(1, "hay más de un atajo a WhatsApp en la tienda");
    esperar(usos[0] > pie).verdadero(
      "hay un atajo a WhatsApp antes del pie: va a competir con el carrito y va a ganar",
    );
    esperar(/fixed[^"']*bottom-24/.test(limpio)).falso(
      "volvió el globo flotante de WhatsApp encima del carrito",
    );
  });

  test("el logo se pinta POR DELANTE de la portada", () => {
    // La portada está posicionada y el logo no lo estaba, así que el navegador
    // la pintaba encima: el logo salía cortado por arriba como una placa. Se
    // veía roto y no había ningún error en ninguna parte.
    esperar(/relative z-10 -mt-/.test(limpio)).verdadero(
      "el logo no se declara por delante de la portada: va a salir cortado",
    );
  });

  test("el icono de Instagram se dibuja aquí, no se trae de fuera", () => {
    // Una tienda que carga el icono desde otro servidor depende de ese servidor
    // para verse bien, y le cuenta a Meta quién visita la tienda de su cliente.
    esperar(limpio.includes("function IconoInstagram")).verdadero("falta el icono de Instagram");
    esperar(/<img[^>]*instagram/i.test(limpio)).falso("el icono de Instagram viene de fuera");
  });
});

describe("El panel de resultados de la tienda", () => {
  const mig = fs.readFileSync(
    path.join(RAIZ, "supabase/migrations/0082_lista_de_quienes_pagaron.sql"), "utf8");

  test("TODO LO QUE NO ESTÁ PAGADO ES DEUDA", () => {
    // ─────────────────────────────────────────────────────────────────────────
    // La primera versión dejó `sin_cobro` fuera, tratándolo como «esta tienda
    // cobra al entregar». No existe esa tienda: aquí SIEMPRE se cobra antes de
    // procesar, y siempre por Yappy. `sin_cobro` significa que el cobro nunca
    // llegó a crearse — y con el criterio anterior esos pedidos no salían en
    // ninguna cifra: ni cobrados ni por cobrar. Simplemente no existían.
    // ─────────────────────────────────────────────────────────────────────────
    const deudores = /deudores as \([\s\S]{0,400}?\n  \)/.exec(mig)?.[0] ?? "";
    esperar(deudores.length > 0).verdadero("cambió la forma de la consulta, revisa esta prueba");
    esperar(/pago <> 'pagado'/.test(deudores)).verdadero(
      "hay estados de cobro que no cuentan ni como cobrados ni como deuda",
    );

    // Y SE CUENTAN APARTE los que nunca llegaron a tener cobro: uno rechazado
    // es problema del cliente, uno que no se creó es de configuración.
    esperar(/'nunca_cobrados'/.test(mig)).verdadero(
      "no se distingue el cobro que nunca se creó del que el cliente no completó",
    );
  });

  test("los cancelados no cuentan en NINGUNA cifra de dinero", () => {
    // Un pedido cancelado no es una venta ni una deuda. Se filtra una sola vez,
    // arriba del todo, para que ninguna cifra pueda olvidarse de hacerlo.
    const todos = /todos as \([\s\S]{0,400}?\n  \)/.exec(mig)?.[0] ?? "";
    esperar(/estado <> 'cancelado'/.test(todos)).verdadero(
      "los cancelados entran en las sumas",
    );
  });

  test("CLIENTE NUEVO ES QUIEN COMPRA POR PRIMERA VEZ, no quien se registró", () => {
    // Un contacto puede llevar meses escribiendo; el día que compra es el día
    // que se convierte, y ese es el número que dice si el mes fue bueno.
    esperar(/min\(created_at\) as primera_vez/.test(mig)).verdadero(
      "no se calcula la primera compra de cada persona",
    );
    esperar(/primera_vez >= p_desde/.test(mig)).verdadero("«nuevos» no usa la primera compra");
    esperar(/primera_vez <  ?p_desde/.test(mig)).verdadero("«repiten» no usa la primera compra");
  });

  test("LEAD ES QUIEN TODAVÍA NO HA COMPRADO", () => {
    // Contar como lead a alguien que ya compró tres veces infla el embudo y
    // esconde justo lo que hay que mirar.
    esperar(/not exists \(select 1 from todos t where t\.contacto_id = c\.id\)/.test(mig)).verdadero(
      "los leads incluyen a gente que ya compró",
    );
  });

  test("el rango es [desde, hasta), abierto por arriba", () => {
    // Con «<= hasta» un pedido de las 23:59 del día 30 cae en septiembre y en
    // octubre a la vez, y la suma del año no cuadra con la de los meses.
    esperar(/created_at >= p_desde and created_at < p_hasta/.test(mig)).verdadero(
      "el rango está cerrado por arriba: los meses se van a solapar",
    );
  });

  test("la función respeta el permiso de la organización", () => {
    // Es una función que devuelve teléfonos de personas. `security invoker`
    // más la comprobación explícita: lo mismo que hace `crm_board`.
    esperar(/security invoker/.test(mig)).verdadero("la función corre con permisos de más");
    esperar(/not in \(select auth_org_ids\(\)\)/.test(mig)).verdadero(
      "no se comprueba de quién es la tienda",
    );
  });

  test("la lista se puede DESCARGAR y ETIQUETAR, o el panel es de presumir", () => {
    // Un número que no se puede abrir es un número que no sirve: se lee, se
    // asiente y se olvida.
    const p = sinComentarios(
      fs.readFileSync(path.join(SRC, "components/tienda/PanelDeVentas.tsx"), "utf8"));
    esperar(p.includes("comoCsv(")).verdadero("la lista no se puede descargar");
    esperar(p.includes("accionEtiquetar")).verdadero("la lista no se puede etiquetar");
    esperar(/broadcasts\?tag=/.test(p)).verdadero(
      "no se puede pasar de la lista a mandarles una plantilla",
    );
  });

  test("EL GRUPO ES UNA ETIQUETA, no un objeto nuevo", () => {
    // Las etiquetas ya existen en la ficha, en la Bandeja, en el buscador y en
    // el selector de audiencia de las difusiones. Un grupo que solo entendiera
    // esta pantalla sería una lista que ninguna otra puede usar.
    const acc = sinComentarios(
      fs.readFileSync(path.join(SRC, "app/(dashboard)/tienda/[id]/actions.ts"), "utf8"));
    esperar(/from\(\s*["']tags["']\s*\)[\s\S]{0,200}insert/.test(acc)).verdadero(
      "la etiqueta no se da de alta en el catálogo: sería invisible en las demás pantallas",
    );
    // Y NO SE PISAN LAS QUE YA TENÍA: escribir el array a pelo borraría el
    // resto de etiquetas de esa persona, y eso no se deshace.
    esperar(/\[\.\.\.actuales, etiqueta\]/.test(acc)).verdadero(
      "al etiquetar se borran las etiquetas que ya tenía",
    );
  });

  test("la difusión llega con la audiencia ya puesta", () => {
    // Escribir la etiqueta otra vez a mano es donde alguien se equivoca y le
    // manda la plantilla a toda su base de contactos.
    const b = sinComentarios(
      fs.readFileSync(path.join(SRC, "app/(dashboard)/bots/[id]/broadcasts/page.tsx"), "utf8"));
    esperar(/defaultValue=\{searchParams\?\.tag/.test(b)).verdadero(
      "la pantalla de difusiones no recoge la etiqueta que le mandan",
    );
  });
});

describe("Aquí se cobra ANTES de preparar", () => {
  const acc = sinComentarios(
    fs.readFileSync(path.join(SRC, "app/(dashboard)/tienda/[id]/actions.ts"), "utf8"));

  test("NO SE PUEDE AVANZAR UN PEDIDO SIN COBRAR", () => {
    // ─────────────────────────────────────────────────────────────────────────
    // Es la regla del negocio: ninguna tienda cobra al entregar, siempre se
    // cobra antes de procesar y siempre por Yappy. El tablero dejaba arrastrar
    // cualquier tarjeta, así que un pedido sin pagar podía prepararse y
    // entregarse — y eso solo se descubre al cuadrar caja, cuando ya se fue.
    //
    // VA EN EL SERVIDOR y no solo en la pantalla: la pantalla es una comodidad,
    // esto es la puerta.
    // ─────────────────────────────────────────────────────────────────────────
    esperar(/antes\.pago !== "pagado"/.test(acc)).verdadero(
      "el servidor deja avanzar un pedido que no está cobrado",
    );
  });

  test("CANCELAR SIEMPRE SE PUEDE", () => {
    // Es justo lo que hay que hacer con un pedido que no se cobró. Bloquearlo
    // dejaría esos pedidos atrapados en «Recibidos» para siempre.
    esperar(/estado !== "cancelado" && antes\.pago !== "pagado"/.test(acc)).verdadero(
      "el bloqueo también impide cancelar",
    );
  });

  test("LA SALIDA EXISTE Y QUEDA APUNTADA", () => {
    // Si Yappy falló y el negocio cobró por transferencia, tiene que poder
    // seguir. Bloquear sin salida convierte una regla en una trampa — y quien
    // se queda atrapado se va a la competencia, no nos escribe.
    esperar(acc.includes('"cobrado_por_fuera"')).verdadero("no hay forma de marcar un cobro externo");
    esperar(/que: "pago_por_fuera"/.test(acc)).verdadero(
      "el cobro externo no queda en la bitácora: dentro de un mes nadie sabrá que no fue Yappy",
    );
    esperar(/pago_referencia: "Cobrado por fuera"/.test(acc)).verdadero(
      "en la tarjeta se confundirá con un cobro de Yappy",
    );
  });

  test("una tienda sin Yappy NO PUEDE PUBLICARSE", () => {
    // Recogería pedidos que nadie puede cobrar: el cliente pide, el negocio
    // prepara, y el dinero no está por ningún lado.
    const cfg = sinComentarios(fs.readFileSync(path.join(SRC, "lib/tienda/config.ts"), "utf8"));
    esperar(/loQueFaltaParaVender\(c: ConfigTienda, cobraConYappy: boolean\)/.test(cfg)).verdadero(
      "publicar no comprueba el cobro",
    );
    esperar(/if \(!cobraConYappy\) falta\.push/.test(cfg)).verdadero(
      "el cobro se pide pero no se exige",
    );
  });

  test("el tablero pinta sello a TODO lo que no está pagado", () => {
    // Antes «sin cobro» no pintaba nada, tratado como lo normal, y era justo el
    // peligroso: se veía igual que un pedido cobrado.
    const ped = sinComentarios(fs.readFileSync(path.join(SRC, "components/tienda/Pedidos.tsx"), "utf8"));
    for (const s of ["sin_cobrar", "esperando", "sin_confirmar", "fallido", "anulado", "pagado"]) {
      esperar(new RegExp(`\\b${s}:`).test(ped)).verdadero(`falta el sello de ${s}`);
    }
  });
});

describe("A quién SÍ se le puede escribir", () => {
  const mig = fs.readFileSync(
    path.join(RAIZ, "supabase/migrations/0082_lista_de_quienes_pagaron.sql"), "utf8");
  const panel = sinComentarios(
    fs.readFileSync(path.join(SRC, "components/tienda/PanelDeVentas.tsx"), "utf8"));

  test("LA LISTA DE QUIENES PAGARON ES DE PERSONAS, NO DE PEDIDOS", () => {
    // ─────────────────────────────────────────────────────────────────────────
    // Quien pagó tres veces este mes recibe UNA encuesta, no tres. Agrupar en la
    // base y no en el navegador es lo que evita que un cliente bueno reciba el
    // mismo mensaje tres veces y silencie el chat — y ese es justo el cliente
    // que no te puedes permitir perder.
    // ─────────────────────────────────────────────────────────────────────────
    const pagadores = /pagadores as \([\s\S]{0,600}?\n  \)/.exec(mig)?.[0] ?? "";
    esperar(pagadores.length > 0).verdadero("no existe la lista de quienes pagaron");
    esperar(/group by d\.contacto_id/.test(pagadores)).verdadero(
      "la lista no está agrupada por persona: el mismo cliente recibiría varios mensajes",
    );
    esperar(/pago = 'pagado'/.test(pagadores)).verdadero("la lista incluye a quien no pagó");
  });

  test("se sabe a quién YA SE LE ENTREGÓ", () => {
    // Preguntarle «¿qué tal tu pedido?» a alguien que todavía lo está esperando
    // es el error clásico de las encuestas automáticas.
    esperar(/filter \(where d\.estado = 'entregado'\)/.test(mig)).verdadero(
      "no se distingue a quien ya recibió su pedido de quien lo espera",
    );
    esperar(panel.includes('clave: "entregados"')).verdadero(
      "la pantalla no enseña quién ya recibió su pedido",
    );
  });

  test("TODAS LAS LISTAS LLEVAN QUIÉN SE DIO DE BAJA", () => {
    // Si `opted_out` solo se mirara al enviar, la lista diría 40 y saldrían 31
    // sin que nadie entendiera la diferencia.
    const listas = mig.slice(mig.indexOf("'listas'"));
    const cuantas = (listas.match(/opted_out/g) ?? []).length;
    esperar(cuantas >= 5).verdadero(`solo ${cuantas} listas llevan opted_out, hacen falta 5`);
  });

  test("y la pantalla lo dice ANTES de enviar", () => {
    esperar(/pidieron no recibir mensajes/.test(panel)).verdadero(
      "no se avisa de cuántos están dados de baja",
    );
  });

  test("la cifra de cobrado se puede abrir", () => {
    // El panel enseñaba a quién perseguir —los que deben— y no a quién cuidar.
    esperar(/lista === "pagaron"/.test(panel)).verdadero(
      "«Cobrado» no se abre: no hay forma de sacar a quién mandarle la encuesta",
    );
  });
});

describe("Las difusiones salen por una cola, no dentro de la petición", () => {
  // SE MIRA EL CÓDIGO, NO LOS COMENTARIOS. `sinComentarios` no quita los «--»
  // de SQL, y la cabecera de esta migración explica justamente lo que hay que
  // comprobar: buscar la frase encontraría la explicación aunque alguien
  // hubiera borrado la línea que importa.
  const mig = fs
    .readFileSync(path.join(RAIZ, "supabase/migrations/0083_cola_de_difusiones.sql"), "utf8")
    .split("\n")
    .filter((l) => !l.trim().startsWith("--"))
    .join("\n");
  const acc = sinComentarios(
    fs.readFileSync(path.join(SRC, "app/(dashboard)/campaigns/actions.ts"), "utf8"));
  const ruta = sinComentarios(
    fs.readFileSync(path.join(SRC, "app/api/campanas/enviar/route.ts"), "utf8"));

  test("LA PANTALLA YA NO MANDA NADA: solo encola", () => {
    // ─────────────────────────────────────────────────────────────────────────
    // Antes recorría la audiencia llamando a Meta una vez por contacto mientras
    // el navegador esperaba. Con mil, la función se corta a mitad y el
    // resultado es el peor posible: unos recibieron, otros no, NADIE SABE
    // QUIÉNES, y volver a pulsar se lo repite a los que ya lo tenían.
    // ─────────────────────────────────────────────────────────────────────────
    esperar(/graph\.facebook/i.test(acc.slice(acc.indexOf("export async function sendCampaign")))).falso(
      "sendCampaign todavía llama a Meta: con mil contactos se va a cortar a mitad",
    );
    esperar(/status: "pendiente"/.test(acc)).verdadero("la audiencia no se encola");
    esperar(/status: "encolada"/.test(acc)).verdadero("la campaña no nace encolada");
  });

  test("QUE NADIE RECIBA DOS VECES", () => {
    // ─────────────────────────────────────────────────────────────────────────
    // Dos tandas solapadas —el reloj dispara cada minuto y una tanda puede
    // tardar más— leerían los mismos pendientes y mandarían el mensaje por
    // duplicado. Eso no se arregla mirando después: se arregla al TOMAR el
    // lote. `for update skip locked` hace que el segundo salte esas filas en
    // vez de esperarlas —esperar sería igual de malo: acabaría mandándolas él.
    // ─────────────────────────────────────────────────────────────────────────
    esperar(/for update skip locked/.test(mig)).verdadero(
      "sin «skip locked» dos tandas solapadas mandan el mismo mensaje dos veces",
    );
    // Y se marcan como tomadas EN LA MISMA sentencia que las selecciona: en dos
    // pasos queda un hueco por el que pasan las dos.
    esperar(/update campaign_recipients[\s\S]{0,200}status\s*=\s*'enviando'/.test(mig)).verdadero(
      "las filas no se marcan al tomarlas",
    );
  });

  test("UN ENVÍO DEL QUE NO SE SABE NADA NO SE REINTENTA A CIEGAS", () => {
    // Rescatar una fila que quizá sí salió es mandársela dos veces a alguien.
    // Solo se rescata lo que no tiene NI identificador de Meta NI error
    // apuntado —o sea, lo que nunca llegó a intentarse— y un par de veces.
    const i = mig.indexOf("x.status = 'enviando'");
    esperar(i > 0).verdadero("cambió la consulta de rescate, revisa esta prueba");
    const rescate = mig.slice(i, i + 400);
    esperar(rescate.includes("wa_message_id is null")).verdadero(
      "se reintentan envíos que quizá ya salieron",
    );
    esperar(rescate.includes("error is null")).verdadero(
      "se reintentan envíos que ya fallaron con motivo",
    );
    esperar(/intentos < \d/.test(rescate)).verdadero("no hay tope de reintentos");
  });

  test("cada resultado se apunta EN CUANTO SE SABE", () => {
    // Si se apuntara al final de la tanda y la función muriera, lo ya enviado
    // figuraría como pendiente y volvería a salir.
    const i = ruta.indexOf("Promise.all(trozo.map");
    const j = ruta.indexOf('from("campaign_recipients")');
    esperar(i > 0 && j > i).verdadero("los resultados no se guardan dentro del bucle");
  });

  test("la tanda se para sola antes de que la corten", () => {
    // Una función cortada a mitad es justo el fallo del que venimos.
    esperar(/PRESUPUESTO_MS/.test(ruta)).verdadero("la tanda no tiene límite de tiempo");
    esperar(/while \(Date\.now\(\) - arranque < PRESUPUESTO_MS\)/.test(ruta)).verdadero(
      "el presupuesto no controla el bucle",
    );
  });

  test("solo la tarea programada puede vaciar la cola", () => {
    esperar(/llamadaDeTareaProgramada\(req, "difusiones"\)/.test(ruta)).verdadero(
      "cualquiera puede disparar los envíos",
    );
    esperar(/revoke execute on function public\.campanas_tomar_lote/.test(mig)).verdadero(
      "la función de la cola es alcanzable desde el navegador",
    );
  });

  test("quien se dio de baja no entra ni en la cola", () => {
    // Una fila en la cola es una fila que alguien puede reintentar después.
    esperar(/eq\("opted_out", false\)/.test(acc)).verdadero(
      "se encolan contactos dados de baja",
    );
  });
});

describe("Cada cliente es un lienzo limpio", () => {
  const MIGRACIONES = path.join(RAIZ, "supabase/migrations");
  const sqls = fs.readdirSync(MIGRACIONES).filter((f) => f.endsWith(".sql")).sort();

  /** El SQL sin sus comentarios: `sinComentarios` no quita los «--». */
  const soloCodigo = (t) =>
    t.split("\n").filter((l) => !l.trim().startsWith("--")).join("\n");

  test("NINGUNA TABLA NUEVA SE QUEDA SIN RLS", () => {
    // ─────────────────────────────────────────────────────────────────────────
    // Una tabla sin RLS en este esquema la puede leer —y escribir— CUALQUIERA
    // con la llave anónima, que viaja en el navegador de todos los visitantes
    // de todas las tiendas. No hace falta ser cliente ni estar registrado.
    //
    // Pasó de verdad: `respaldo_flujos` se creó a mano, sin migración y sin
    // RLS, y quedó abierta a lectura y escritura para `anon`. Un flujo entero
    // de un cliente, editable desde fuera.
    //
    // POR ESO SE COMPRUEBA AQUÍ Y NO EN UNA REVISIÓN: la próxima tabla la va a
    // crear alguien con prisa, y el fallo no se ve en ninguna pantalla.
    // ─────────────────────────────────────────────────────────────────────────
    const malas = [];

    for (const f of sqls) {
      const sql = soloCodigo(fs.readFileSync(path.join(MIGRACIONES, f), "utf8"));

      const creadas = [...sql.matchAll(/create table (?:if not exists )?(?:public\.)?(\w+)/gi)]
        .map((m) => m[1].toLowerCase());
      if (!creadas.length) continue;

      // El «enable row level security» puede estar en la misma migración o en
      // un bucle que recorre varias tablas a la vez; las dos formas valen.
      const encendidas = new Set(
        [...sql.matchAll(/alter table (?:public\.)?(\w+)\s+enable row level security/gi)]
          .map((m) => m[1].toLowerCase()),
      );
      const enBucle = /foreach\s+\w+\s+in\s+array/i.test(sql) && /enable row level security/i.test(sql);

      for (const tabla of creadas) {
        if (!encendidas.has(tabla) && !enBucle) malas.push(`${f} → ${tabla}`);
      }
    }

    esperar(malas.join(", ")).igual("", "hay tablas creadas sin encender RLS");
  });

  test("un cliente nuevo nace con SU embudo y SUS etapas", () => {
    // Si el alta no sembrara nada, el cliente entraría a un tablero sin
    // columnas y sin forma de crear la primera — y las etapas no se pueden
    // compartir entre clientes: son suyas y las renombra.
    const alta = sqls
      .map((f) => fs.readFileSync(path.join(MIGRACIONES, f), "utf8"))
      .filter((s) => /create or replace function public\.handle_new_user|create or replace function handle_new_user/i.test(s))
      .pop();

    esperar(Boolean(alta)).verdadero("no encuentro la función del alta de usuarios");
    const codigo = soloCodigo(alta);

    esperar(/insert into organizations/i.test(codigo)).verdadero("el alta no crea organización");
    esperar(/insert into memberships[\s\S]{0,200}'owner'/i.test(codigo)).verdadero(
      "el alta no deja al usuario como dueño de su organización",
    );
    esperar(/insert into pipelines/i.test(codigo)).verdadero("el alta no siembra el embudo");
    esperar(/insert into conversation_states/i.test(codigo)).verdadero("el alta no siembra las etapas");
  });

  test("lo que se comparte entre clientes NO puede ser el nombre", () => {
    // Dos negocios pueden llamarse igual, tener el mismo cliente y usar la
    // misma etiqueta. Lo único único de verdad tiene que llevar el `org_id`
    // dentro, o el segundo cliente que se registre choca con el primero.
    const todo = sqls.map((f) => soloCodigo(fs.readFileSync(path.join(MIGRACIONES, f), "utf8"))).join("\n");

    // Un contacto se identifica por (organización, canal, id externo).
    esperar(/unique\s*\(\s*org_id\s*,\s*channel\s*,\s*external_id\s*\)/i.test(todo)).verdadero(
      "los contactos no están acotados por organización: dos clientes con el mismo comprador chocarían",
    );
    // Y las etiquetas y las etapas, por (organización, nombre).
    for (const tabla of ["tags", "conversation_states"]) {
      esperar(new RegExp(`${tabla}[\\s\\S]{0,900}?unique\\s*\\(\\s*org_id\\s*,\\s*name`, "i").test(todo)).verdadero(
        `${tabla} no está acotada por organización`,
      );
    }
  });
});


// ─── Una cuenta a la vez ─────────────────────────────────────────────────────
//
// COSTÓ UN FALLO REAL. El dueño entró como soporte a la cuenta de un cliente y
// la plataforma le enseñó SU PROPIA cuenta: dos filas en `memberships` y un
// `.limit(1)` sin orden, que no devuelve «la primera» sino la que Postgres
// quiera. Y como los permisos se preguntaban en OTRA consulta igual de suelta,
// podía tocar la cuenta del cliente con el rol de dueño de la propia.
describe("Una cuenta a la vez", () => {
  test("nadie vuelve a elegir la membresía con un limit(1) suelto", () => {
    // Solo se persigue la forma que causó el fallo: preguntarle a `memberships`
    // EN CUÁL CUENTA ESTÁS quedándose con una fila arbitraria. Las consultas
    // que leen otra cosa de la tabla (la marca de cambiar contraseña, por
    // ejemplo) no eligen cuenta y no vienen al caso.
    const permitidos = new Set(["src/lib/org.ts", "src/lib/soporte.ts", "src/lib/clientes/alta.ts"]);
    const malos = [];
    for (const { ruta, texto } of ARCHIVOS) {
      if (permitidos.has(ruta)) continue;
      const t = sinComentarios(texto);
      for (const m of t.matchAll(/from\(\s*["']memberships["']\s*\)([\s\S]{0,220})/g)) {
        const cola = m[1];
        const eligeCuenta = /\.select\([^)]*org_id/.test(cola);
        if (eligeCuenta && /\.limit\(\s*1\s*\)|\.maybeSingle\(\)|\.single\(\)/.test(cola)) {
          malos.push(`${ruta}: ${cola.trim().slice(0, 70)}`);
        }
      }
    }
    esperar(malos).igual(
      [],
      "elige la cuenta quedándose con una fila arbitraria de memberships: trae todas y pásalas por membresiaActiva()",
    );
  });

  test("nadie pide «una organización cualquiera»", () => {
    // `.limit(1)` sobre `organizations` se apoyaba solo en RLS. Con dos cuentas
    // visibles —soporte abierto— devolvía una de las dos al azar: el color de
    // las burbujas o la zona horaria de otro negocio.
    //
    // Un conteo (`head: true`) no trae datos de nadie: ese sí puede.
    const malos = [];
    for (const { ruta, texto } of ARCHIVOS) {
      const t = sinComentarios(texto);
      for (const m of t.matchAll(/from\(\s*["']organizations["']\s*\)([\s\S]{0,200})/g)) {
        const cola = m[1];
        if (/head:\s*true/.test(cola)) continue;
        if (/\.limit\(\s*1\s*\)/.test(cola)) malos.push(`${ruta}: ${cola.trim().slice(0, 70)}`);
      }
    }
    esperar(malos).igual([], "pide organizations con limit(1): filtra por .eq(\"id\", orgId)");
  });

  test("los permisos salen de la misma fila que la cuenta", () => {
    // Si `misPermisos` vuelve a consultar `memberships` por su cuenta, vuelve
    // el cruce: cuenta del cliente + rol de dueño de la propia.
    const t = sinComentarios(
      fs.readFileSync(path.join(SRC, "lib/permisos-server.ts"), "utf8"),
    );
    esperar(/from\(\s*["']memberships["']/.test(t)).falso(
      "permisos-server.ts no debe consultar memberships: tiene que usar membresiaDeLaSesion()",
    );
    esperar(/membresiaDeLaSesion\(/.test(t)).verdadero(
      "permisos-server.ts tiene que sacar el rol de la membresía activa",
    );
  });

  test("abrir soporte cierra el anterior", () => {
    // Con dos accesos abiertos el aviso rojo desaparece —lo pinta una consulta
    // que espera una sola fila— y sin aviso no hay botón de salir: el acceso al
    // primer cliente sigue vivo, invisible, hasta caducar solo.
    const t = sinComentarios(fs.readFileSync(path.join(SRC, "lib/soporte.ts"), "utf8"));
    const abrir = t.slice(t.indexOf("export async function abrirSoporte"), t.indexOf("export async function cerrarSoporte"));
    const borra = /\.delete\(\)[\s\S]{0,220}?soporte_hasta[\s\S]{0,120}?\.neq\(/.test(abrir);
    esperar(borra).verdadero(
      "abrirSoporte tiene que borrar las sesiones de soporte de OTRAS cuentas antes de abrir la nueva",
    );
  });

  test("la base también lo impide, no solo el código", () => {
    // Las dos mitades de la regla viven en 0084. Si alguien borra el índice o
    // el orden, el código de arriba deja de estar respaldado.
    const dir = path.join(RAIZ, "supabase/migrations");
    const sql = fs
      .readdirSync(dir)
      .filter((f) => f.endsWith(".sql"))
      .map((f) => fs.readFileSync(path.join(dir, f), "utf8"))
      // `sinComentarios` NO quita los `--` de SQL, y ya nos ha hecho pasar dos
      // pruebas que en realidad encontraban la frase dentro de un comentario.
      .map((t) => t.split("\n").filter((l) => !l.trim().startsWith("--")).join("\n"))
      .join("\n");

    esperar(/create unique index[\s\S]{0,200}memberships[\s\S]{0,200}soporte_hasta is not null/.test(sql))
      .verdadero("falta el índice único que impide dos sesiones de soporte a la vez");
    esperar(/create or replace function public\.auth_puede[\s\S]{0,900}order by/.test(sql))
      .verdadero("auth_puede volvió a elegir la membresía sin order by");
  });
});


// ─── La portada no se recorta ────────────────────────────────────────────────
//
// PASÓ DE VERDAD, DOS VECES. Primero la portada tapaba el logo; luego, ya con
// el aro de Instagram, a un cliente le cortó el banner por arriba y por abajo:
// desapareció el logo de la cabecera de su arte y el texto del pie. Desde fuera
// parece que la tienda está rota, y no hay ningún error en ninguna parte.
//
// No se arregla recomendando una medida mejor: siempre habrá quien suba otra
// cosa. Se arregla no recortando.
describe("La portada no se recorta", () => {
  const ESC = fs.readFileSync(path.join(SRC, "components/tienda/Escaparate.tsx"), "utf8");

  test("la imagen de portada entra con contain, nunca con cover", () => {
    const t = sinComentarios(ESC);
    const i = t.indexOf("config.portada_url && (");
    esperar(i > 0).verdadero("cambió la forma del componente, revisa esta prueba");
    const bloque = t.slice(i, i + 400);
    esperar(/object-contain/.test(bloque)).verdadero(
      "la portada tiene que entrar con object-contain: con cover se le corta el arte al cliente",
    );
    esperar(/object-cover/.test(bloque)).falso(
      "object-cover en la portada recorta lo que sobra: eso es justo el fallo",
    );
  });

  test("con portada, la banda no impone una proporción", () => {
    // Imponer 4:1 y meter la imagen dentro es lo que la recortaba. La
    // proporción solo puede aplicarse cuando NO hay imagen, para que la banda
    // de color guarde su sitio.
    const t = sinComentarios(ESC);
    const i = t.indexOf('proporcionDe("portada")');
    esperar(i > 0).verdadero("cambió la forma del componente, revisa esta prueba");
    const alrededor = t.slice(Math.max(0, i - 200), i);
    esperar(/config\.portada_url\s*\?/.test(alrededor)).verdadero(
      "la proporción fija solo vale sin portada: con imagen manda la imagen",
    );
  });

  test("la instrucción que se le manda al cliente dice que se ve entera", () => {
    // La medida y lo que hace la pantalla salen del mismo archivo justamente
    // para que no puedan contradecirse. Si el recorte cambia y el texto no,
    // el cliente hace lo que le pedimos y le sale mal igual.
    //
    // SIN COMENTARIOS, Y NO ES UN DETALLE: la primera versión de esta prueba
    // pasaba con el texto ya roto, porque encontraba la frase en el comentario
    // que hay justo encima explicando el arreglo. Es la tercera vez que este
    // proyecto se traga una prueba que en realidad leía un comentario.
    const t = sinComentarios(fs.readFileSync(path.join(SRC, "lib/tienda/imagenes.ts"), "utf8"));
    const i = t.indexOf('clave: "portada"');
    esperar(i > 0).verdadero("cambió la forma de imagenes.ts, revisa esta prueba");
    const bloque = t.slice(i, t.indexOf('clave: "banner"'));
    esperar(/no se recorta|se ve entera/i.test(bloque)).verdadero(
      "la ficha de la portada sigue diciendo que se recorta",
    );
    esperar(/se recorta al centro/i.test(bloque)).falso(
      "la ficha dice que se recorta al centro y ya no es verdad",
    );
  });
});


// ─── La tienda dentro del chat ───────────────────────────────────────────────
//
// La misma decisión vive en TRES sitios: `src/lib/tienda/paraElBot.ts` (puro,
// para el widget y la IA), el motor de WhatsApp en Deno, y las herramientas del
// agente. Deno no puede importar de `src/`, así que se copia — igual que ya
// pasa con las herramientas del agente. Estas reglas son lo único que impide
// que las copias se separen sin que nadie se entere.
describe("La tienda dentro del chat", () => {
  const WA = fs.readFileSync(path.join(RAIZ, "supabase/functions/whatsapp/index.ts"), "utf8");
  const PURO = fs.readFileSync(path.join(SRC, "lib/tienda/paraElBot.ts"), "utf8");

  test("el motor de WhatsApp ejecuta los tres bloques de la tienda", () => {
    // Un tipo sin `case` no rompe nada visible: el motor lo salta en silencio y
    // el cliente ve que su bloque «no hace nada».
    const casos = new Set([...sinComentarios(WA).matchAll(/case "(\w+)":/g)].map((m) => m[1]));
    for (const t of ["tienda", "tienda_catalogo", "tienda_pedido"]) {
      esperar(casos.has(t)).verdadero(`el motor de WhatsApp no sabe ejecutar "${t}"`);
    }
  });

  test("el motor del webchat también, y no los deja mudos", () => {
    // Es el fallo de `catalog`, `payment` y `template`: caen en el `default` y
    // solo mandan su texto. El negocio arma el flujo, lo prueba en el panel, se
    // ve bien, y en su sitio web no pasa nada.
    const web = sinComentarios(fs.readFileSync(path.join(SRC, "lib/flow/webRuntime.ts"), "utf8"));
    const casos = new Set([...web.matchAll(/case "(\w+)":/g)].map((m) => m[1]));
    for (const t of ["tienda", "tienda_catalogo", "tienda_pedido"]) {
      esperar(casos.has(t)).verdadero(`el webchat deja mudo el bloque "${t}"`);
    }
  });

  test("una tienda APAGADA no se manda por ningún motor", () => {
    // Es la regla que más importa y está en tres sitios. Mandar el enlace de
    // una tienda apagada es peor que no mandar nada: el cliente hace el viaje y
    // se encuentra una pantalla muerta.
    const wa = sinComentarios(WA);
    const i = wa.indexOf("async function tiendaDeEsteBot");
    esperar(i > 0).verdadero("cambió la forma del motor, revisa esta prueba");
    esperar(/\.eq\(\s*"activa"\s*,\s*true\s*\)/.test(wa.slice(i, i + 700))).verdadero(
      "el motor de WhatsApp trae tiendas apagadas",
    );
    esperar(/soloActivas/.test(sinComentarios(PURO))).verdadero(
      "la lógica compartida ya no distingue una tienda apagada",
    );
  });

  test("el stock NULO no se trata como agotado", () => {
    // `stock: null` es «no llevo control de existencias». Es el valor de la
    // mayoría de los productos: tratarlo como cero vaciaría el catálogo entero
    // de casi todas las tiendas, y en el motor de Deno no hay prueba unitaria
    // que lo cace.
    const wa = sinComentarios(WA);
    const i = wa.indexOf("function productosQueSePuedenOfrecer");
    esperar(i > 0).verdadero("cambió la forma del motor, revisa esta prueba");
    const cuerpo = wa.slice(i, i + 500);
    esperar(/stock === null/.test(cuerpo) && /undefined/.test(cuerpo)).verdadero(
      "el motor de WhatsApp trata el stock nulo como agotado",
    );
  });

  test("las tres herramientas de la tienda están en los DOS motores", () => {
    // Si una herramienta existe en un motor y no en el otro, el mismo prompt
    // hace cosas distintas en WhatsApp y en la web, y el cliente no tiene forma
    // de verlo.
    const nodo = sinComentarios(fs.readFileSync(path.join(SRC, "lib/ai/herramientas.ts"), "utf8"));
    const wa = sinComentarios(WA);
    for (const h of ["ver_catalogo", "estado_de_pedido", "enlace_de_tienda"]) {
      esperar(nodo.includes(`name: "${h}"`)).verdadero(`falta declarar "${h}" en el motor de Node`);
      esperar(wa.includes(`name: "${h}"`)).verdadero(`falta declarar "${h}" en el motor de WhatsApp`);
      esperar(nodo.includes(`case "${h}"`)).verdadero(`falta ejecutar "${h}" en el motor de Node`);
      esperar(wa.includes(`case "${h}"`)).verdadero(`falta ejecutar "${h}" en el motor de WhatsApp`);
    }
  });

  test("la lista de WhatsApp nunca pasa de 10 filas", () => {
    // Meta rechaza el mensaje ENTERO si te pasas, con un error que no dice cuál
    // es el problema. Un catálogo de 48 productos —el tamaño de una tienda real
    // nuestra— hay que partirlo sí o sí.
    const wa = sinComentarios(WA);
    const m = /MAX_FILAS_LISTA = (\d+)/.exec(wa);
    esperar(Boolean(m)).verdadero("el motor ya no declara el tope de filas");
    esperar(Number(m[1]) <= 10).verdadero(`el motor manda hasta ${m[1]} filas y Meta acepta 10`);

    const puro = /MAX_FILAS_LISTA = (\d+)/.exec(sinComentarios(PURO));
    esperar(Boolean(puro)).verdadero("la lógica compartida ya no declara el tope");
    esperar(puro[1]).igual(m[1], "los dos motores no están de acuerdo en cuántas filas caben");
  });

  test("el catálogo espera a que la persona elija", () => {
    // Sin esto la lista sale y el flujo sigue de largo: el cliente toca un
    // producto y no pasa nada. Es el fallo más fácil de cometer aquí porque
    // TODO parece funcionar hasta que alguien toca.
    //
    // SE MIRA DENTRO DEL `case`, NO EL ARCHIVO ENTERO. La primera versión de
    // esta prueba buscaba la frase en todo el motor, y la encontraba en el
    // recogedor de la respuesta: quitar el `return` del bloque la dejaba pasar.
    const wa = sinComentarios(WA);
    const i = wa.indexOf('case "tienda_catalogo": {');
    esperar(i > 0).verdadero("cambió la forma del motor, revisa esta prueba");
    const cuerpo = wa.slice(i, wa.indexOf("break;", i) + 6);
    esperar(/return \{ nodeId: node\.id, type: "tienda_catalogo" \}/.test(cuerpo)).verdadero(
      "el bloque de catálogo no se queda esperando: la lista sale y el flujo sigue de largo, " +
        "así que el cliente toca un producto y no pasa nada",
    );
    esperar(/awaiting\.type === "tienda_catalogo"/.test(wa)).verdadero(
      "nadie recoge lo que la persona eligió de la lista",
    );
  });
});


// ─── Los tutoriales de 30 segundos ───────────────────────────────────────────
//
// El botón «▶ Ver tutorial (30 seg)» estuvo en la pantalla SIN HACER NADA —ni
// un `onClick`— y al lado, la caja de «Lana explica» enseñaba la frase de una
// línea mientras el texto bueno de los 28 componentes era dato muerto que nadie
// veía. Estas reglas existen para que ninguna de las dos cosas vuelva.
describe("Los tutoriales de los componentes", () => {
  const TUT = fs.readFileSync(path.join(SRC, "lib/flow/tutoriales.ts"), "utf8");
  const CH = fs.readFileSync(path.join(SRC, "lib/channels.ts"), "utf8");
  const INS = fs.readFileSync(path.join(SRC, "components/builder/Inspector.tsx"), "utf8");

  const clavesDocumentadas = () => {
    const i = CH.indexOf("export type ComponentKey");
    return [...CH.slice(i, CH.indexOf(";", i)).matchAll(/"([a-z_]+)"/g)].map((m) => m[1]);
  };

  test("todo componente que se puede arrastrar tiene su tutorial", () => {
    // Sin esto, el bloque nuevo sale a producción con un botón que no abre
    // nada: exactamente el estado del que venimos.
    const t = sinComentarios(TUT);
    const conTutorial = new Set([...t.matchAll(/^  ([a-z_]+): \{$/gm)].map((m) => m[1]));
    const faltan = clavesDocumentadas().filter((k) => !conTutorial.has(k));
    esperar(faltan).igual([], "componentes sin tutorial de 30 segundos");
  });

  test("ningún tutorial se queda a medias", () => {
    // Un tutorial con los pasos vacíos se pinta como una caja en blanco, que es
    // peor que no tener botón.
    const t = sinComentarios(TUT);
    const vacios = [];
    for (const m of t.matchAll(/^  ([a-z_]+): \{([\s\S]*?)^  \},$/gm)) {
      const cuerpo = m[2];
      // SE MIRA DENTRO DE CADA CORCHETE, NO A PARTIR DE ÉL. La primera versión
      // usaba `pasos: \[[\s\S]*?"` y con `pasos: []` encontraba la comilla del
      // EJEMPLO de más abajo: pasaba con el tutorial ya vacío.
      const dentro = (campo) => {
        const r = new RegExp(`${campo}: \\[([^\\]]*)\\]`).exec(cuerpo);
        return r ? r[1] : "";
      };
      const tienePasos = /"[^"]/.test(dentro("pasos"));
      const tieneEjemplo = /\(/.test(dentro("ejemplo"));
      const tieneOjo = /ojo:\s*\n?\s*"[^"]/.test(cuerpo) || /ojo:\s*"[^"]/.test(cuerpo);
      if (!tienePasos || !tieneEjemplo || !tieneOjo) vacios.push(m[1]);
    }
    esperar(vacios).igual([], "tutoriales sin pasos, sin ejemplo o sin el «ojo»");
  });

  test("son de treinta segundos: cuatro pasos como mucho", () => {
    // Quien abre esto está a mitad de armar un flujo. Un manual de dos páginas
    // no se lee, y no leerlo cuesta lo mismo que no tenerlo.
    const t = sinComentarios(TUT);
    const largos = [];
    for (const m of t.matchAll(/^  ([a-z_]+): \{([\s\S]*?)^  \},$/gm)) {
      const pasos = /pasos: \[([\s\S]*?)\],/.exec(m[2]);
      if (pasos && (pasos[1].match(/^\s*"/gm) ?? []).length > 4) largos.push(m[1]);
    }
    esperar(largos).igual([], "tutoriales con más de 4 pasos: ya no son 30 segundos");
  });

  test("el botón del tutorial de verdad abre algo", () => {
    // La regla que caza el fallo original: un botón sin `onClick`.
    const t = sinComentarios(INS);
    const i = t.indexOf("Ver tutorial");
    esperar(i > 0).verdadero("desapareció el botón del tutorial");
    const alrededor = t.slice(Math.max(0, i - 500), i);
    esperar(/onClick=/.test(alrededor)).verdadero(
      "el botón «Ver tutorial» volvió a no hacer nada: es una promesa pintada",
    );
    esperar(/tutorialDe\(/.test(t)).verdadero("el panel no lee los tutoriales");
  });

  test("«Lana explica» enseña el texto bueno, no la frase de una línea", () => {
    // Los 28 textos de `channels.ts` fueron dato muerto durante meses porque el
    // panel pintaba `meta.description` en su lugar.
    const t = sinComentarios(INS);
    esperar(/COMPONENTS\[/.test(t)).verdadero(
      "el panel no usa la explicación de channels.ts: vuelve a ser dato muerto",
    );
  });
});


// ─── Clases de estilo que no existen ─────────────────────────────────────────
//
// PASA, Y NO SE VE EN NINGÚN ERROR. Una clase inventada —`btn-primario` en vez
// de `btn-primary`, `bg-fondo` en vez de `bg-tarjeta`— no rompe nada: el
// navegador la ignora y el elemento se pinta desnudo. Un botón principal que
// aparece como texto suelto, y ni una línea en la consola.
//
// Ya pasó con `text-amber-400` y `bg-fondo-2`, y volvió a pasar con la tarjeta
// que vende la tienda. La tercera vez toca automatizarlo.
describe("Clases de estilo", () => {
  const CSS = fs.readFileSync(path.join(SRC, "app/globals.css"), "utf8");
  const CONF = fs.readFileSync(path.join(RAIZ, "tailwind.config.ts"), "utf8");

  // Lo que el proyecto define a mano en globals.css: `.btn-primary`, `.bg-suave`…
  const definidas = new Set([...CSS.matchAll(/^\s*\.([a-z0-9\\:-]+)\s*[,{]/gm)].map((m) =>
    m[1].replace(/\\:/g, ":"),
  ));

  test("los botones y tarjetas usan clases que existen", () => {
    // `btn-`, `card-`, `input-` son TODAS del proyecto: ninguna viene de
    // Tailwind, así que si no está en globals.css no existe en ningún sitio.
    const malas = [];
    for (const { ruta, texto } of ARCHIVOS) {
      // `btn-yappy` NO es una clase: es el nombre del componente web de Yappy
      // (`<btn-yappy>`) y del archivo que sirve su CDN.
      for (const m of sinComentarios(texto).matchAll(/\b((?:btn|card|input)-[a-z0-9-]+)\b/g)) {
        if (m[1] === "btn-yappy") continue;
        if (!definidas.has(m[1])) malas.push(`${ruta}: ${m[1]}`);
      }
    }
    esperar([...new Set(malas)]).igual([], "clases de componente que no existen en globals.css");
  });

  test("un botón de compra tiene que comprar", () => {
    // ES EL MISMO FALLO QUE EL DEL TUTORIAL, y lo cometí dos veces el mismo
    // día: una tarjeta preciosa con un botón que no llamaba a nada. Con dinero
    // de por medio es peor: el cliente quiere pagar, pulsa, y no pasa nada.
    const t = sinComentarios(
      fs.readFileSync(path.join(SRC, "components/planes/TiendaEnVenta.tsx"), "utf8"),
    );
    esperar(/\/api\/checkout/.test(t)).verdadero(
      "la tarjeta de la tienda no llama al cobro: el botón no compra nada",
    );
    esperar(/CODIGO_TIENDA/.test(t)).verdadero("no manda el código del complemento");
    // Y el error se enseña. Un fallo silencioso en un pago se lee como que la
    // plataforma está rota.
    esperar(/setError\(/.test(t)).verdadero("un fallo al pagar no se le dice a nadie");
  });

  test("los colores del tema existen", () => {
    // Los tokens del proyecto son palabras en español (suave, linea, ink,
    // tarjeta, exito, aviso, alerta) y los de Tailwind en inglés. Si una clase
    // en español no está definida, es un invento.
    const familias = new Set();
    for (const c of definidas) {
      const m = /^(?:bg|text|border|divide)-(.+)$/.exec(c);
      if (m) familias.add(m[1]);
    }
    // Las raíces que SÍ vienen del tema de Tailwind (tailwind.config.ts).
    const delTema = new Set([...CONF.matchAll(/^\s{6,8}"?([a-z][a-z0-9-]*)"?:/gm)].map((m) => m[1]));

    const enEspanol = /^(suave|linea|ink|tarjeta|canvas|exito|aviso|alerta|fondo|alarma|primario|secundario|error)/;
    const malas = [];
    for (const { ruta, texto } of ARCHIVOS) {
      for (const m of sinComentarios(texto).matchAll(/\b(?:bg|text|border)-([a-z][a-z0-9-]*)\b/g)) {
        const raiz = m[1];
        if (!enEspanol.test(raiz)) continue;      // inglés: es de Tailwind
        if (familias.has(raiz) || delTema.has(raiz)) continue;
        malas.push(`${ruta}: ${m[0]}`);
      }
    }
    esperar([...new Set(malas)]).igual([], "colores del tema que no existen: se pintan transparentes");
  });
});


// ─── Los complementos y Stripe ───────────────────────────────────────────────
//
// LOS PLANES SE SINCRONIZABAN DESDE EL PRIMER DÍA; LOS COMPLEMENTOS NO, y nadie
// lo notó porque el cobro funcionaba igual: armaba el precio al vuelo. Lo que no
// se ve es que cada compra crea un producto NUEVO en Stripe — veinte clientes
// con la tienda son veinte productos con el mismo nombre, y ninguna forma de
// saber cuánto factura ese complemento ni de subirle el precio en un sitio.
describe("Los complementos y Stripe", () => {
  const ADD = fs.readFileSync(path.join(SRC, "lib/billing/stripeAddons.ts"), "utf8");
  const CHK = fs.readFileSync(path.join(SRC, "lib/billing/stripe.ts"), "utf8");
  const ACC = fs.readFileSync(path.join(SRC, "app/superadmin/complementos/actions.ts"), "utf8");

  test("guardar un complemento lo registra en Stripe", () => {
    // SE MIRA DENTRO DE `guardarComplemento`, NO EL ARCHIVO ENTERO. La primera
    // versión buscaba el nombre en todo el archivo y lo encontraba en el
    // `import` y en `resincronizar`: quitar la llamada del guardado la pasaba.
    const t = sinComentarios(ACC);
    const i = t.indexOf("export async function guardarComplemento");
    esperar(i > 0).verdadero("cambió la forma del archivo, revisa esta prueba");
    const guardar = t.slice(i, t.indexOf("export async function resincronizar"));
    esperar(/const sync = await syncAddonToStripe\(/.test(guardar)).verdadero(
      "guardar un complemento ya no lo crea en Stripe: vuelve a haber que hacerlo a mano",
    );
    esperar(/stripe_price_id:\s*sync\.priceId/.test(t)).verdadero(
      "no se guarda el identificador del precio, así que la próxima compra crea otro producto",
    );
  });

  test("si Stripe falla, el complemento NO se pierde", () => {
    // Perder el trabajo del equipo porque un tercero tuvo un mal minuto no es
    // una opción. Es la misma regla que ya tenían los planes.
    const t = sinComentarios(ACC);
    const i = t.indexOf("syncAddonToStripe(");
    const antes = t.slice(0, i);
    esperar(/from\("addons"\)[\s\S]{0,120}upsert\(/.test(antes)).verdadero(
      "ahora se sincroniza ANTES de guardar: si Stripe falla se pierde el complemento",
    );
    esperar(/stripe_error:\s*sync\.error/.test(t)).verdadero(
      "el error de Stripe no queda apuntado y nadie sabe qué reintentar",
    );
  });

  test("el cobro usa el precio del catálogo cuando existe", () => {
    const t = sinComentarios(CHK);
    esperar(/stripe_price_id/.test(t)).verdadero(
      "el cobro no lee el precio sincronizado: sigue creando un producto por compra",
    );
    // LA RAMA TIENE QUE DEPENDER DEL PRECIO DE VERDAD. Comprobar solo que el
    // texto `line_items[...][price]` existe no sirve: con la condición puesta a
    // `false` la línea sigue ahí y no se ejecuta nunca.
    esperar(/if\s*\(precioDelCatalogo\)\s*\{[\s\S]{0,200}?line_items\[\$\{i\}\]\[price\]/.test(t))
      .verdadero("el cobro nunca manda el precio del catálogo a Stripe");
    // Y EL RESPALDO SE QUEDA: un complemento sin sincronizar tiene que poder
    // comprarse igual, o un fallo de Stripe al guardarlo deja al cliente sin
    // poder pagar.
    esperar(/price_data/.test(t)).verdadero(
      "se quitó el respaldo: un complemento sin sincronizar ya no se puede comprar",
    );
  });

  test("un complemento de una sola vez no abre una suscripción", () => {
    // Mandar `recurring` en algo que se paga una vez le abriría un cargo
    // mensual a quien compró una instalación asistida.
    const t = sinComentarios(ADD);
    const i = t.indexOf("recurring[interval]");
    esperar(i > 0).verdadero("cambió la forma del archivo, revisa esta prueba");
    const antes = t.slice(Math.max(0, i - 200), i);
    esperar(/if\s*\(a\.recurring\)/.test(antes)).verdadero(
      "el intervalo mensual se manda siempre: un pago único se convierte en suscripción",
    );
  });

  test("apagar un complemento lo archiva en Stripe", () => {
    // Dejarlo vivo allá permite que alguien con un enlace viejo lo siga
    // contratando después de que lo quitamos de la venta.
    const t = sinComentarios(ACC);
    esperar(/archiveAddonInStripe\(/.test(t)).verdadero(
      "apagar un complemento lo deja contratable en Stripe",
    );
  });

  test("hay UNA sola forma de llamar a Stripe", () => {
    // Con dos copias, el día que Stripe cambie una cabecera se arregla una y la
    // otra se queda rota sin que nadie lo note.
    esperar(/from "@\/lib\/billing\/stripePlans"/.test(sinComentarios(ADD))).verdadero(
      "stripeAddons.ts tiene su propia copia de la llamada a Stripe",
    );
  });
});


// ─── El aviso fuera de las 24 horas ──────────────────────────────────────────
//
// Los avisos salían SIEMPRE como texto libre, y WhatsApp solo lo entrega dentro
// de las 24 h siguientes al último mensaje del cliente. Pasado ese rato Meta lo
// rechaza y no pasa nada más: el pedido avanza, el negocio lo ve avanzar, y el
// cliente no se entera. Justo los dos avisos que la gente espera —«va en
// camino» y «entregado»— caían casi siempre fuera.
describe("El aviso fuera de las 24 horas", () => {
  const AV = sinComentarios(fs.readFileSync(path.join(SRC, "lib/tienda/avisar.ts"), "utf8"));
  const ENV = sinComentarios(fs.readFileSync(path.join(SRC, "lib/canales/whatsappEnviar.ts"), "utf8"));

  test("se mira la ventana ANTES de mandar", () => {
    esperar(/dentroDeLaVentana\(/.test(AV)).verdadero(
      "el aviso ya no mira la ventana: fuera de las 24 h se pierde en silencio",
    );
    // Y la hora sale de un mensaje ENTRANTE: lo que abre la ventana es que la
    // persona escriba, no que nosotros contestemos.
    esperar(/direction"?\s*,\s*"inbound"/.test(AV)).verdadero(
      "la ventana se calcula con mensajes que no son del cliente",
    );
  });

  test("fuera de la ventana se manda plantilla", () => {
    const i = AV.indexOf("const mandarPlantilla");
    esperar(i > 0).verdadero("cambió la forma del archivo, revisa esta prueba");
    esperar(/enviarPlantilla\(/.test(AV.slice(i, i + 900))).verdadero(
      "hay una rama de plantilla que no llama a enviarPlantilla",
    );
    // La decisión depende de la ventana de verdad, no de una constante.
    esperar(/hayVentana\s*\n?\s*\?/.test(AV) || /hayVentana\s*\?/.test(AV)).verdadero(
      "la elección entre texto y plantilla ya no depende de la ventana",
    );
  });

  test("si Meta cierra la ventana a mitad, se reintenta con plantilla", () => {
    // Mirar la hora no basta: la que tenemos es la de NUESTRO reloj, y el
    // cliente puede haber borrado la conversación.
    esperar(/esFueraDeVentana\(/.test(AV)).verdadero(
      "se quitó el respaldo: un desfase de relojes deja al cliente sin aviso",
    );
  });

  test("una plantilla con botón manda su parámetro", () => {
    // Sin esto Meta rechaza el envío entero con «number of parameters does not
    // match», un mensaje que hace revisar el cuerpo, que no era el problema.
    esperar(/sub_type:\s*"url"/.test(ENV)).verdadero(
      "enviarPlantilla no sabe mandar el botón de enlace",
    );
    esperar(/colaDelBoton/.test(AV)).verdadero(
      "el aviso no le pasa a la plantilla lo que va en el botón",
    );
  });

  test("las plantillas se crean en la cuenta del CLIENTE", () => {
    // Es lo que más sorprende de esto: Meta las aprueba por cuenta de WhatsApp,
    // así que las siete del WABA de Demandu no existen en el de ningún cliente.
    // Cablear por nombre y ya habría funcionado en nuestras pruebas y en cero
    // cuentas de verdad.
    const alta = sinComentarios(
      fs.readFileSync(path.join(SRC, "lib/tienda/altaDePlantillas.ts"), "utf8"),
    );
    esperar(/whatsapp_channels/.test(alta)).verdadero(
      "no busca la cuenta de WhatsApp del cliente: las crearía donde no toca",
    );
    esperar(/waba_id/.test(alta)).verdadero("no usa el WABA del cliente");
    // Y «ya existe» cuenta como bien: si no, el botón parecería roto en cuanto
    // se pulse dos veces.
    esperar(/already exists\|duplicate/.test(alta)).verdadero(
      "una plantilla que ya existe se trata como fallo",
    );
  });

  test("el dominio del botón no se escribe a mano", () => {
    // Estas plantillas quedan aprobadas en Meta CON la dirección que se les
    // puso, para siempre. El dominio ya cambió una vez.
    const alta = sinComentarios(
      fs.readFileSync(path.join(SRC, "lib/tienda/altaDePlantillas.ts"), "utf8"),
    );
    esperar(/DOMINIO_TIENDAS/.test(alta)).verdadero(
      "el dominio de las plantillas está escrito a mano",
    );
  });

  test("queda escrito por dónde salió cada aviso", () => {
    // Es lo primero que hay que saber cuando un cliente jura que no recibió
    // nada: si fue plantilla y Meta la tenía sin aprobar, el motivo está ahí.
    esperar(/via:\s*porPlantilla/.test(AV)).verdadero(
      "la bitácora ya no dice si el aviso salió por texto o por plantilla",
    );
  });
});


// ─── El candado de los planes ────────────────────────────────────────────────
//
// LA PANTALLA APAGADA NO ES UN CANDADO. Enseñar la función en gris con el
// mensaje de upgrade es lo correcto de cara al cliente, pero la acción del
// servidor se puede llamar por debajo sin pasar por ningún botón. Si el freno
// viviera solo en la pantalla, cualquiera usaría la IA gratis.
describe("El candado de los planes", () => {
  test("la IA se frena donde se GASTA, en los dos motores", () => {
    // Node (webchat y prueba del panel).
    // SE MIDE DENTRO DE `aiAnswer`, no desde el principio del archivo: la
    // primera versión buscaba `ANTHROPIC_API_KEY` y la encontraba en una
    // función de más arriba que solo comprueba si la llave existe.
    const nodo = sinComentarios(fs.readFileSync(path.join(SRC, "lib/ai/answer.ts"), "utf8"));
    const desde = nodo.indexOf("export async function aiAnswer");
    esperar(desde > 0).verdadero("cambió la forma del archivo, revisa esta prueba");
    const llave = nodo.indexOf("const key = process.env.ANTHROPIC_API_KEY", desde);
    esperar(llave > desde).verdadero("cambió la forma del archivo, revisa esta prueba");
    esperar(/orgConIA\(/.test(nodo.slice(desde, llave))).verdadero(
      "en Node no se comprueba el plan ANTES de llamar al modelo",
    );

    // Deno (WhatsApp e Instagram).
    const wa = sinComentarios(
      fs.readFileSync(path.join(RAIZ, "supabase/functions/whatsapp/index.ts"), "utf8"),
    );
    // SE MIDE POR POSICIÓN, no por el texto exacto del `return`. La primera
    // versión de esta regla clavaba `return ai.fallback` y se rompió el día que
    // todos los respaldos pasaron a anotar su motivo — con la comprobación del
    // plan intacta. Una regla que falla cuando NO hay nada roto acaba siendo
    // una regla que se desactiva.
    const desdeIA = wa.indexOf("async function responderConIA");
    esperar(desdeIA > 0).verdadero("cambió la forma del motor, revisa esta prueba");
    const plan = wa.indexOf("await tieneIA(ctx)", desdeIA);
    const modelo = wa.indexOf("api.anthropic.com", desdeIA);
    esperar(plan > desdeIA && plan < modelo).verdadero(
      "en WhatsApp no se comprueba el plan antes de pensar la respuesta",
    );
    // Y QUE CORTE DE VERDAD. Solo con la posición, meterle un `false &&`
    // delante pasaba en verde: la línea sigue donde debe y ya no frena a nadie.
    // Se deja abierto QUÉ devuelve — clavar eso es lo que rompió la versión
    // anterior de esta regla el día que los respaldos empezaron a anotar su
    // motivo, sin que nada estuviera mal.
    esperar(/if \(!\(await tieneIA\(ctx\)\)\) return /.test(wa)).verdadero(
      "la comprobación del plan está pero ya no corta",
    );
  });

  test("crear una tienda se frena en la ACCIÓN, no solo en la pantalla", () => {
    const t = sinComentarios(
      fs.readFileSync(path.join(SRC, "app/(dashboard)/tienda/actions.ts"), "utf8"),
    );
    const i = t.indexOf("export async function crearTienda");
    const j = t.indexOf("from(\"tiendas\")", i);
    esperar(i >= 0 && j > i).verdadero("cambió la forma del archivo, revisa esta prueba");
    esperar(/puedeUsar\(\s*"tienda"\s*\)/.test(t.slice(i, j))).verdadero(
      "se puede crear una tienda sin tenerla en el plan llamando la acción por debajo",
    );
  });

  test("ante un fallo de la base, la IA sigue contestando", () => {
    // Es al revés que en las pantallas, y es deliberado: dejar mudo al cliente
    // de un negocio que SÍ paga la IA es mucho peor que unos centavos de más.
    const nodo = sinComentarios(fs.readFileSync(path.join(SRC, "lib/ai/answer.ts"), "utf8"));
    const i = nodo.indexOf("async function orgConIA");
    esperar(i > 0).verdadero("cambió la forma del archivo, revisa esta prueba");
    const cuerpo = nodo.slice(i, i + 400);
    esperar(/if \(error\) return true/.test(cuerpo)).verdadero(
      "un error de la base apaga la IA de quien sí la paga",
    );
    esperar(/catch[\s\S]{0,40}return true/.test(cuerpo)).verdadero(
      "una excepción apaga la IA de quien sí la paga",
    );
  });

  test("nadie puede preguntar qué tiene contratado OTRO cliente", () => {
    // `org_features(org_id)` y `org_puede(org_id, ...)` reciben el id como
    // parámetro: con una sesión cualquiera se podría consultar el negocio del
    // vecino. Las pantallas usan las que sacan el id de la sesión.
    const dir = path.join(RAIZ, "supabase/migrations");
    const sql = fs
      .readdirSync(dir)
      .filter((f) => f.endsWith(".sql"))
      .map((f) => fs.readFileSync(path.join(dir, f), "utf8"))
      // `sinComentarios` NO quita los `--` de SQL, y ya nos ha colado pruebas
      // que encontraban la frase dentro de un comentario.
      .map((t) => t.split("\n").filter((l) => !l.trim().startsWith("--")).join("\n"))
      .join("\n");

    esperar(/revoke execute on function public\.org_features\(uuid\) from authenticated/.test(sql))
      .verdadero("cualquiera con sesión puede leer las capacidades de otra cuenta");
    esperar(/revoke execute on function public\.org_puede\(uuid, text\) from authenticated/.test(sql))
      .verdadero("cualquiera con sesión puede preguntar qué tiene contratado otro");
  });

  test("los clientes de antes conservan lo que ya usaban", () => {
    // El día que un plan deja de incluir algo, a quien ya lo usaba NO se le
    // puede apagar: cambiaría su producto sin que él hiciera nada.
    const dir = path.join(RAIZ, "supabase/migrations");
    const sql = fs
      .readdirSync(dir)
      .filter((f) => f.endsWith(".sql"))
      .map((f) => fs.readFileSync(path.join(dir, f), "utf8"))
      .map((t) => t.split("\n").filter((l) => !l.trim().startsWith("--")).join("\n"))
      .join("\n");

    esperar(/features_extra/.test(sql)).verdadero("no existe la vía para conservar capacidades");
    // Y los dos respaldos: quien usaba IA y quien ya tiene tienda montada.
    esperar(/kind = 'ai_message'[\s\S]{0,400}features_extra|features_extra[\s\S]{0,400}kind = 'ai_message'/.test(sql))
      .verdadero("no se salvó a quien ya usaba la IA");
    esperar(/from tiendas t where t\.org_id = o\.id/.test(sql)).verdadero(
      "no se salvó a quien ya tiene una tienda montada",
    );
  });
});


// ─── Los tratos con un cliente ───────────────────────────────────────────────
//
// «Regálale un mes» significa DOS COSAS DISTINTAS y elegir mal cuesta dinero:
// a quien todavía no paga se le alarga la prueba —una fecha nuestra—, y a quien
// ya paga hay que darle un cupón en Stripe, porque alargarle la prueba no hace
// absolutamente nada: se le cobra igual el día que toca.
describe("Los tratos con un cliente", () => {
  const REG = sinComentarios(
    fs.readFileSync(path.join(SRC, "app/superadmin/clientes/regalos.ts"), "utf8"),
  );
  const DES = sinComentarios(fs.readFileSync(path.join(SRC, "lib/billing/descuentos.ts"), "utf8"));

  test("a quien YA PAGA no se le alarga la prueba en silencio", () => {
    // Sería un regalo que no regala nada: el cliente cree que tiene un mes
    // gratis y le llega el cobro igual.
    const i = REG.indexOf("export async function regalarDias");
    esperar(i > 0).verdadero("cambió la forma del archivo, revisa esta prueba");
    const cuerpo = REG.slice(i, REG.indexOf("export async function regalarFuncion"));
    esperar(/estado_cobro === "activa"[\s\S]{0,80}stripe_subscription_id/.test(cuerpo)).verdadero(
      "no se avisa de que ese cliente ya paga: el regalo no le ahorraría nada",
    );
  });

  test("los descuentos van a STRIPE, no a nuestra base", () => {
    // Un descuento apuntado solo de nuestro lado haría que la pantalla dijera
    // «-30%» mientras la tarjeta del cliente cobra el precio entero.
    esperar(/\/coupons/.test(DES)).verdadero("no se crea el cupón en Stripe");
    esperar(/subscriptions\/\$\{subscriptionId\}/.test(DES)).verdadero(
      "el cupón no se pega a la suscripción del cliente",
    );
    const i = REG.indexOf("export async function darDescuento");
    const cuerpo = REG.slice(i, REG.indexOf("export async function quitarSuDescuento"));
    esperar(/stripe_subscription_id/.test(cuerpo)).verdadero(
      "se aplica un descuento sin comprobar que el cliente tenga suscripción",
    );
  });

  test("un regalo SIEMPRE lleva fecha", () => {
    // Sin fecha, el «te lo dejo un mes a ver si te sirve» se convierte en
    // gratis de por vida en cuanto a alguien se le olvida quitarlo.
    const dir = path.join(RAIZ, "supabase/migrations");
    const sql = fs
      .readdirSync(dir)
      .filter((f) => f.endsWith(".sql"))
      .map((f) => fs.readFileSync(path.join(dir, f), "utf8"))
      .map((t) => t.split("\n").filter((l) => !l.trim().startsWith("--")).join("\n"))
      .join("\n");

    esperar(/create table if not exists public\.org_regalos[\s\S]{0,600}hasta\s+timestamptz not null/.test(sql))
      .verdadero("la fecha del regalo dejó de ser obligatoria: habría regalos eternos");

    // Y la caducidad se calcula al preguntar, no con una tarea programada que
    // un día no corre y deja regalos vivos para siempre.
    esperar(/r\.hasta > now\(\)/.test(sql)).verdadero(
      "los regalos vencidos ya no se descartan al leer las capacidades",
    );
  });

  test("«para siempre» no se cuela por descuido", () => {
    // Con `forever` puesto sin querer en un mes gratis, ese cliente no vuelve
    // a pagar nunca y nadie lo nota hasta que alguien mira los ingresos.
    const i = DES.indexOf('if (d.tipo === "mes_gratis")');
    esperar(i > 0).verdadero("cambió la forma del archivo, revisa esta prueba");
    const cuerpo = DES.slice(i, DES.indexOf("} else {", i));
    esperar(/forever/.test(cuerpo)).falso("un mes gratis se está aplicando para siempre");
  });

  test("cada trato queda en la bitácora", () => {
    // Dentro de tres meses alguien va a preguntar por qué este cliente tiene la
    // tienda gratis, y la respuesta no puede ser «ni idea».
    const cuantos = (REG.match(/anotarComoYo\(/g) ?? []).length;
    esperar(cuantos >= 5).verdadero(`solo ${cuantos} acciones dejan rastro; deberían ser todas`);
  });
});


// ─── EL BLOQUE «AGENDAR CITA» ────────────────────────────────────────────────
//
// Todo lo de aquí abajo sale de una conversación real del 5 de septiembre en la
// que un cliente quiso agendar una demo. Recibió tres medias horas seguidas de
// la misma mañana, escribió «necesito que sea en la tarde», y el bot le
// contestó «Falta la fecha y hora de la cita.» — el mensaje de error de una
// función interna. La cita acabó creándose sin invitado, porque el bloque tenía
// configurado de dónde sacar el correo y nadie lo preguntaba nunca.
//
// Las reglas puras viven en `src/lib/agendaHorarios.ts` y se prueban en
// `logica.mjs`. Lo de aquí es que los DOS motores las usen: el de WhatsApp
// corre en Deno y no puede importar de `src/`, así que lleva una copia, y estas
// reglas son lo único que impide que las dos se separen sin que nadie se entere.
describe("Agendar una cita, en los dos motores", () => {
  const WA = sinComentarios(fs.readFileSync(path.join(RAIZ, "supabase/functions/whatsapp/index.ts"), "utf8"));
  const WEB = sinComentarios(fs.readFileSync(path.join(SRC, "lib/flow/webRuntime.ts"), "utf8"));
  const PURO = sinComentarios(fs.readFileSync(path.join(SRC, "lib/agendaHorarios.ts"), "utf8"));

  test("el motor de WhatsApp lleva su copia de las cuatro reglas", () => {
    for (const f of ["esHorarioElegido", "correoValido", "quiereOmitir", "mensajeParaElCliente"]) {
      esperar(new RegExp(`function ${f}\\(`).test(WA)).verdadero(
        `el motor de WhatsApp perdió su copia de ${f}`,
      );
      esperar(new RegExp(`export function ${f}\\(`).test(PURO)).verdadero(
        `desapareció ${f} del archivo puro; la copia de Deno se quedó sola`,
      );
    }
  });

  test("y las copias dicen LO MISMO, carácter por carácter", () => {
    // Dos versiones de «esto es un correo» es garantizar que un día una cuenta
    // acepte por WhatsApp lo que rechaza por la web, y al revés.
    const cuerpo = (texto, nombre) => {
      const i = texto.indexOf(`function ${nombre}(`);
      if (i < 0) return null;
      const abre = texto.indexOf("{", i);
      let n = 0;
      for (let j = abre; j < texto.length; j++) {
        if (texto[j] === "{") n++;
        else if (texto[j] === "}" && --n === 0) return texto.slice(abre, j + 1).replace(/\s+/g, " ").trim();
      }
      return null;
    };

    for (const f of ["esHorarioElegido", "correoValido", "quiereOmitir"]) {
      const a = cuerpo(PURO, f);
      const b = cuerpo(WA, f);
      esperar(a && b).verdadero(`no pude leer ${f} en los dos sitios`);
      esperar(b).igual(a);
    }
  });

  test("el motor web usa las reglas de verdad, no una copia suya", () => {
    // Node SÍ puede importar el archivo puro, así que aquí copiar no tiene
    // ninguna excusa.
    esperar(/from "@\/lib\/agendaHorarios"/.test(WEB)).verdadero(
      "el motor web ya no importa las reglas de agendar",
    );
    for (const f of ["esHorarioElegido", "correoValido", "quiereOmitir", "mensajeParaElCliente"]) {
      esperar(new RegExp(`function ${f}\\(`).test(WEB)).falso(
        `el motor web se hizo su propia copia de ${f}`,
      );
    }
  });

  test("EL FALLO EXACTO: el error interno ya no viaja al chat", () => {
    // Así estaba escrito, en los dos motores: lo que devolviera la plataforma,
    // directo al cliente. Por eso alguien leyó «Falta la fecha y hora de la
    // cita.» por escribir «necesito que sea en la tarde».
    esperar(/say\(ctx,\s*r\?\.error\s*\|\|/.test(WA)).falso(
      "el motor de WhatsApp vuelve a enseñar el error interno al cliente",
    );
    esperar(/push\(ctx,\s*r\?\.error\s*\|\|/.test(WEB)).falso(
      "el motor web vuelve a enseñar el error interno al cliente",
    );
    for (const [nombre, texto] of [["WhatsApp", WA], ["web", WEB]]) {
      esperar(/mensajeParaElCliente\(r/.test(texto)).verdadero(
        `el motor de ${nombre} no filtra el error antes de enseñarlo`,
      );
    }
  });

  test("nadie decide por el motivo lo que se le enseña a la persona", () => {
    // Fue el primer intento de arreglarlo y estaba mal: «ese horario acaba de
    // ocuparse» y «falta la fecha y hora» comparten `motivo: "sin_datos"` y son
    // casos opuestos. Lo decide la marca `paraElCliente`, y solo ella.
    esperar(/paraElCliente/.test(sinComentarios(fs.readFileSync(path.join(SRC, "lib/agenda.ts"), "utf8"))))
      .verdadero("la plataforma dejó de marcar qué error puede leer un cliente");
    esperar(/motivo\s*===\s*"sin_datos"/.test(WA + WEB)).falso(
      "un motor volvió a decidir por el motivo qué error enseñar",
    );
  });

  test("EL FALLO EXACTO: no se ofrecen tres horas y ya", () => {
    // `slice(0, 3)` era el motivo de que solo salieran 09:00, 09:30 y 10:00.
    // En WhatsApp una lista admite diez; en la web y en Instagram no hay tope.
    for (const [nombre, texto] of [["WhatsApp", WA], ["web", WEB]]) {
      esperar(/slots\.slice\(0,\s*3\)/.test(texto)).falso(
        `el motor de ${nombre} volvió a recortar los horarios a tres`,
      );
      esperar(/slots\.slice\(0,\s*10\)/.test(texto)).verdadero(
        `el motor de ${nombre} ya no ofrece hasta diez horarios`,
      );
    }
  });

  test("y la plataforma los reparte antes de devolverlos", () => {
    // Sin el reparto, pedir diez de una agenda vacía son las cinco primeras
    // horas del primer día. Diez opciones de la misma mañana no son diez
    // opciones.
    const agenda = sinComentarios(fs.readFileSync(path.join(SRC, "lib/agenda.ts"), "utf8"));
    esperar(/repartirHorarios\(/.test(agenda)).verdadero(
      "`agenda.ts` devuelve los primeros huecos otra vez, sin repartir",
    );
    // Las DOS agendas, no solo Google: un negocio con Calendly tiene el mismo
    // problema y sería el que nadie prueba.
    esperar((agenda.match(/repartirHorarios\(/g) ?? []).length >= 2).verdadero(
      "una de las dos agendas se quedó sin repartir sus horarios",
    );
  });

  test("EL FALLO EXACTO: el bloque pide el correo que tiene configurado", () => {
    // El bloque decía «el correo sácalo de la variable email» y no había en el
    // flujo ningún sitio donde preguntarlo. La cita se creaba sin invitado, sin
    // invitación y SIN QUE FALLARA NADA. Ese es el problema de repartir esto en
    // bloques sueltos: cuando falta uno, no se rompe — sale peor, en silencio.
    for (const [nombre, texto] of [["WhatsApp", WA], ["web", WEB]]) {
      esperar(/attendeeAttr/.test(texto) && /pedirCorreo/.test(texto)).verdadero(
        `el motor de ${nombre} vuelve a agendar sin preguntar el correo`,
      );
      esperar(/nameAttr/.test(texto) && /pedirNombre/.test(texto)).verdadero(
        `el motor de ${nombre} vuelve a agendar sin preguntar el nombre`,
      );
      // Encendidos por omisión: los bloques que ya existen no tienen el campo.
      esperar(/pedirCorreo\s*!==\s*false/.test(texto)).verdadero(
        `en el motor de ${nombre} el correo dejó de pedirse en los bloques de siempre`,
      );
      esperar(/pedirNombre\s*!==\s*false/.test(texto)).verdadero(
        `en el motor de ${nombre} el nombre dejó de pedirse en los bloques de siempre`,
      );
    }
  });

  test("los dos motores saben esperar el nombre y el correo", () => {
    // Una espera que un motor PONE y no sabe ATENDER deja la conversación
    // colgada: el cliente contesta y no pasa nada, escriba lo que escriba. Ya
    // pasó con el formulario de WhatsApp y está contado en el propio motor.
    //
    // Se comprueban los dos extremos por separado y con el nombre exacto. No
    // vale contar apariciones: `cita_correo_reintento` contiene la subcadena y
    // dejaría pasar un motor que pone la espera y nunca la atiende.
    for (const [nombre, texto] of [["WhatsApp", WA], ["web", WEB]]) {
      for (const espera of ["cita_nombre", "cita_correo"]) {
        esperar(new RegExp(`(esperar|type):\\s*"${espera}"`).test(texto)).verdadero(
          `el motor de ${nombre} no llega a pedir "${espera}"`,
        );
        esperar(new RegExp(`esperando === "${espera}"`).test(texto)).verdadero(
          `el motor de ${nombre} pone la espera "${espera}" y no sabe atenderla`,
        );
        esperar(new RegExp(`awaiting\\.type === "${espera}"`).test(texto)).verdadero(
          `el motor de ${nombre} nunca reparte el turno hacia "${espera}"`,
        );
      }
    }
  });

  test("después de un fallo NUNCA se sale por la salida de éxito", () => {
    // La salida normal del bloque suele ser «tu cita quedó agendada». Seguir
    // por ahí sin cita es confirmarle a alguien algo que no existe, que ya pasó
    // una vez y está contado en el propio motor.
    for (const [nombre, texto] of [["WhatsApp", WA], ["web", WEB]]) {
      esperar(/agendada\s*(&&\s*node\s*)?\?\s*defaultNext/.test(texto)).verdadero(
        `el motor de ${nombre} puede seguir a la confirmación sin haber agendado`,
      );
    }
  });

  test("si hubo invitación o no, queda dicho", () => {
    // `sinInvitacion` nace en Google —que puede rechazar al invitado— y tiene
    // que llegar hasta el flujo. Si se corta a medias, el mensaje de
    // confirmación promete un correo que no va a llegar y nadie se entera.
    esperar(/sinInvitacion/.test(sinComentarios(fs.readFileSync(path.join(SRC, "lib/integrations/google.ts"), "utf8"))))
      .verdadero("Google dejó de contar si pudo invitar");
    // Tiene que LEER lo que devolvió Google, no solo declarar el campo: con el
    // campo declarado y sin leerlo, la cita se confirma como si la invitación
    // hubiera salido siempre — que es justo el fallo.
    esperar(/ev\.sinInvitacion/.test(sinComentarios(fs.readFileSync(path.join(SRC, "lib/agenda.ts"), "utf8"))))
      .verdadero("la plataforma se come el aviso de que no hubo invitación");
    for (const [nombre, texto] of [["WhatsApp", WA], ["web", WEB]]) {
      esperar(/cita_invitacion/.test(texto)).verdadero(
        `el motor de ${nombre} no deja dicho si salió la invitación`,
      );
    }
  });

  test("el error de la vuelta anterior no sobrevive a una cita buena", () => {
    // Pasó: `cita_error` se quedó con «Falta la fecha y hora de la cita.»
    // mientras `cita_ok` decía «true». Quien lo use en una condición o lo pegue
    // en un mensaje ve una cita agendada con un error al lado.
    for (const [nombre, texto] of [["WhatsApp", WA], ["web", WEB]]) {
      esperar(/cita_error\s*=\s*""/.test(texto)).verdadero(
        `el motor de ${nombre} deja el error viejo pegado a una cita que sí salió`,
      );
    }
  });

  test("el constructor deja configurar lo que el motor lee", () => {
    // Un campo que el motor usa y el constructor no enseña es un campo que solo
    // existe para quien sepa editar la base a mano.
    const insp = fs.readFileSync(path.join(SRC, "components/builder/Inspector.tsx"), "utf8");
    for (const campo of ["pedirNombre", "pedirCorreo", "textoPideNombre", "textoPideCorreo", "textoNoEntendi", "cuantosHorarios"]) {
      // Con `includes` bastaba renombrarlo a `pedirCorreoZZ` para que siguiera
      // pasando: la subcadena está ahí y el campo ya no existe.
      esperar(new RegExp(`\\b${campo}\\b`).test(insp)).verdadero(`el constructor no deja tocar «${campo}»`);
    }
    // Y lo que promete tiene que ser verdad: decía «se enviará invitación al
    // correo» en un bloque que podía crear la cita sin invitar a nadie.
    esperar(/se enviará invitación al correo/.test(insp)).falso(
      "el constructor vuelve a prometer una invitación que puede no salir",
    );
  });
});


// ─── POR QUÉ SALIÓ EL MENSAJE DE RESPALDO ────────────────────────────────────
//
// «Esa no me la sé todavía 🙈» se devuelve por OCHO motivos distintos y solo uno
// es de verdad «no lo sé». Los otros siete son averías: la IA apagada, la llave
// que falta, el plan que no la incluye, la API que responde un error, el modelo
// que no escribe nada, las vueltas agotadas porque una herramienta falla en
// bucle, y la red caída.
//
// Mientras los ocho se vieran iguales desde fuera, NADA de esto era depurable:
// una agenda rota y una pregunta fuera de temario producían el mismo mensaje.
describe("Cuando la IA no puede responder, se sabe por qué", () => {
  const WA = sinComentarios(fs.readFileSync(path.join(RAIZ, "supabase/functions/whatsapp/index.ts"), "utf8"));
  const ANSWER = sinComentarios(fs.readFileSync(path.join(SRC, "lib/ai/answer.ts"), "utf8"));
  const WEB = sinComentarios(fs.readFileSync(path.join(SRC, "lib/flow/webRuntime.ts"), "utf8"));

  test("ningún camino devuelve el respaldo a secas", () => {
    // `return ai.fallback` sin pasar por `caida()` es un motivo que se pierde,
    // y se pierde justo el día que alguien pregunta «¿por qué contestó eso?».
    //
    // SE CUENTA LA CADENA LITERAL, sin expresiones. El primer intento montaba
    // la expresión escapando el punto, la escapaba de más, y no encontraba
    // nada NUNCA: la regla pasaba en verde con los ocho respaldos sueltos
    // delante. Una regla que no puede fallar no está probando nada.
    // El ÚNICO `return ai.fallback;` que vale es el que está dentro de
    // `caida()`. Se quita ese trozo del texto y después no puede quedar
    // ninguno: cualquiera que sobreviva es un motivo que se pierde.
    for (const [nombre, texto] of [["WhatsApp", WA], ["web", ANSWER]]) {
      const i = texto.indexOf("const caida = ");
      esperar(i > 0).verdadero(`el motor de ${nombre} ya no tiene un sitio único para los respaldos`);
      const sinCaida = texto.slice(0, i) + texto.slice(texto.indexOf("};", i) + 2);
      const sueltos = sinCaida.split("return ai.fallback;").length - 1;
      esperar(sueltos).igual(0);
    }
  });

  test("los dos motores apuntan el motivo, con el mismo nombre", () => {
    for (const [nombre, texto] of [["WhatsApp", WA], ["web", ANSWER]]) {
      esperar(/motivoDelRespaldo/.test(texto)).verdadero(
        `el motor de ${nombre} dejó de apuntar por qué cayó al respaldo`,
      );
      esperar(/const caida = /.test(texto)).verdadero(
        `el motor de ${nombre} perdió el único sitio por el que pasan todos los respaldos`,
      );
    }
  });

  test("el motivo LLEGA AL MENSAJE, no solo al registro", () => {
    // Quien necesita saberlo es el negocio mirando su Bandeja, no nosotros
    // mirando los registros del servidor. La misma clave en los dos motores,
    // para que la Bandeja no tenga que mirar en dos sitios.
    esperar(/payload\.fallo_ia = /.test(WA)).verdadero(
      "el motor de WhatsApp ya no pega el motivo al mensaje",
    );
    esperar(/fallo_ia/.test(WEB)).verdadero("el motor web ya no pega el motivo al mensaje");
    // Con la PALABRA ENTERA: `fallo_ia_x` contiene `fallo_ia`, y sin el borde
    // la regla dejaría pasar una Bandeja que lee una clave que nadie escribe.
    esperar(/payload\?\.fallo_ia\b/.test(fs.readFileSync(path.join(SRC, "components/inbox/InboxClient.tsx"), "utf8")))
      .verdadero("la Bandeja dejó de avisar de que la IA no pudo responder");
  });

  test("el motivo se borra al escribirlo", () => {
    // Si se quedara puesto, el mensaje siguiente del mismo turno saldría
    // marcado como fallo sin serlo — y un aviso que miente deja de mirarse.
    const i = WA.indexOf("payload.fallo_ia = ");
    esperar(i > 0).verdadero("cambió la forma de registrar, revisa esta prueba");
    esperar(/motivoDelRespaldo = null/.test(WA.slice(i, i + 200))).verdadero(
      "el motivo se queda pegado y marca de fallo lo que venga después",
    );
  });

  test("el motivo de las vueltas agotadas dice qué mirar", () => {
    // Es el que más importa: casi siempre significa que una herramienta está
    // fallando y el modelo la reintenta hasta quedarse sin turnos. Un motivo
    // que solo diga «se agotaron los intentos» no le sirve a nadie.
    for (const [nombre, texto] of [["WhatsApp", WA], ["web", ANSWER]]) {
      esperar(/herramienta está fallando/.test(texto)).verdadero(
        `el motor de ${nombre} no dice que el problema puede ser una herramienta`,
      );
    }
  });
});


// ─── EL FORMULARIO NATIVO DE WHATSAPP, COMO AGENDA ───────────────────────────
//
// `agenda.ts` lleva tiempo prometiendo tres puertas para agendar, y la segunda
// —«Flujo de WhatsApp + agenda»— no estaba terminada: `sayFlujo` mandaba el
// nombre de la pantalla y nada más, así que dentro del formulario no se podía
// enseñar ni una hora libre.
//
// Ahora el motor consulta la agenda ANTES de mandarlo y le mete los huecos en
// `flow_action_payload.data`. Estas reglas son lo que impide que ese camino se
// vuelva a quedar a medias sin que nadie se entere.
describe("Agendar desde el formulario nativo de WhatsApp", () => {
  const WA = sinComentarios(fs.readFileSync(path.join(RAIZ, "supabase/functions/whatsapp/index.ts"), "utf8"));
  const PURO = sinComentarios(fs.readFileSync(path.join(SRC, "lib/agendaHorarios.ts"), "utf8"));

  // ── CÓMO SE COMPARAN DOS COPIAS ────────────────────────────────────────
  //
  // Se recorta desde `function NOMBRE(` hasta la primera llave de cierre a
  // principio de línea, que en este proyecto es siempre el final de una
  // función de primer nivel.
  //
  // La primera versión contaba llaves desde la primera que encontraba, y esa
  // no era la del cuerpo: era la del TIPO. Con
  // `opcionesDeHorario(slots: { startISO?… })` comparaba las dos firmas y
  // fallaba diciendo que las copias se habían separado, con las copias
  // idénticas. Una regla que acusa en falso se acaba borrando.
  const declaracion = (texto, nombre) => {
    const m = new RegExp(`function ${nombre}\\([\\s\\S]*?\\n\\}`).exec(texto);
    return m ? m[0].replace(/\s+/g, " ").trim() : null;
  };

  test("las cuatro reglas del formulario están en los dos sitios y dicen lo mismo", () => {
    for (const f of ["opcionesDeHorario", "valoresDelFormulario", "horaDelFormulario", "correoDelFormulario", "nombreDelFormulario"]) {
      const a = declaracion(PURO, f);
      const b = declaracion(WA, f);
      esperar(a && b).verdadero(`falta ${f} en uno de los dos motores`);
      esperar(b).igual(a);
    }
  });

  test("el motor consulta la agenda ANTES de mandar el formulario", () => {
    // Sin esto el formulario sale con el desplegable vacío: una pantalla en la
    // que la persona no puede hacer nada ni entender por qué.
    const i = WA.indexOf("async function sayFlujo");
    esperar(i > 0).verdadero("cambió la forma del motor, revisa esta prueba");
    const trozo = WA.slice(i, WA.indexOf("\nasync function", i + 10));
    esperar(/waFlowAgenda/.test(trozo)).verdadero("`sayFlujo` ya no sabe que un formulario puede ser de agenda");
    esperar(/accion: "horarios"/.test(trozo)).verdadero("`sayFlujo` no pide los horarios a la plataforma");
    esperar(/opcionesDeHorario\(/.test(trozo)).verdadero("`sayFlujo` no convierte los huecos en opciones");
  });

  test("los datos viajan DENTRO del payload, junto a la pantalla", () => {
    // Meta exige que se manden todas las propiedades que la pantalla declare
    // en su `data`. Mandar la pantalla sin ellas hace que rechace el mensaje
    // entero — no solo el dato.
    esperar(/flow_action_payload = datosDeAgenda \? \{ screen, data: datosDeAgenda \} : \{ screen \}/.test(WA))
      .verdadero("los horarios ya no llegan al formulario");
  });

  test("SIN HORARIOS NO SE MANDA EL FORMULARIO", () => {
    // Un desplegable vacío es peor que no mandar nada: la persona abre, no
    // puede elegir, y se queda pensando que la culpa es suya.
    const i = WA.indexOf("async function sayFlujo");
    const trozo = WA.slice(i, WA.indexOf("\nasync function", i + 10));
    esperar(/if \(!opciones\.length\)/.test(trozo)).verdadero(
      "el formulario se manda aunque no haya ni un horario que ofrecer",
    );
    // Y si la agenda tiene enlace —los Calendly del plan gratis— se manda ese,
    // que es una cita que sí se puede hacer.
    esperar(/r\?\.enlace/.test(trozo)).verdadero(
      "se pierde el enlace de agenda cuando no se puede reservar por API",
    );
  });

  test("al volver el formulario se agenda, y solo se sigue si la cita existe", () => {
    // Misma trampa que el bloque «Agendar cita»: la salida de este bloque suele
    // ser «tu cita quedó agendada». Seguir por ahí sin cita es confirmarle a
    // alguien algo que no existe.
    esperar(/agendarDesdeFormulario\(/.test(WA)).verdadero("el formulario vuelve y no agenda nada");
    const i = WA.indexOf('awaiting.type === "wa_flow"');
    esperar(i > 0).verdadero("cambió la forma del motor, revisa esta prueba");
    const trozo = WA.slice(i, i + 3000);
    esperar(/waFlowAgenda/.test(trozo)).verdadero("la respuesta del formulario ya no se agenda");
    esperar(/if \(!r\)/.test(trozo)).verdadero("no se distingue una cita creada de una que falló");
  });

  test("agendar desde el formulario NO reimplementa agendar", () => {
    // Dos formas de crear una cita es garantizar que una de las dos se quede
    // sin el aviso al CRM, sin `cita_invitacion` o sin el título que toca.
    const c = declaracion(WA, "agendarDesdeFormulario");
    esperar(!!c).verdadero("desapareció `agendarDesdeFormulario`");
    esperar(/agendarElegido\(/.test(c)).verdadero(
      "`agendarDesdeFormulario` se hizo su propia forma de crear la cita",
    );
    esperar(/pedirAgenda\(/.test(c)).falso(
      "`agendarDesdeFormulario` llama a la agenda por su cuenta en vez de reusar el camino de siempre",
    );
  });

  test("el formulario se reintenta UNA vez, no en bucle", () => {
    // El caso normal es que el hueco se ocupara entre que se mandó y que lo
    // contestó. Reintentar sin tope es hacerle rellenar sus datos una y otra
    // vez, que cansa más que hablar con una persona.
    const i = WA.indexOf('awaiting.type === "wa_flow"');
    const trozo = WA.slice(i, i + 3000);
    esperar(/cita_form_reintento !== "si"/.test(trozo)).verdadero(
      "el formulario de agenda se puede reintentar sin tope",
    );
    esperar(/cita_form_reintento = "si"/.test(trozo)).verdadero(
      "el reintento no se apunta, así que no cuenta como tal",
    );
  });

  test("un formulario sin hora reconocible NO se le echa en cara al cliente", () => {
    // Significa que su desplegable devuelve el texto de la opción en vez del
    // id: un fallo de configuración que la persona no provocó ni puede
    // arreglar. Se le pasa con alguien y el motivo queda en el registro.
    esperar(/=== "sin_hora"/.test(WA)).verdadero("ya no se distingue un formulario mal armado");
    const i = WA.indexOf('=== "sin_hora"');
    esperar(/handoff_reason/.test(WA.slice(i, i + 800))).verdadero(
      "un formulario mal armado deja la conversación colgada en vez de pasar con una persona",
    );
  });

  test("el constructor deja encender y configurar todo esto", () => {
    const insp = fs.readFileSync(path.join(SRC, "components/builder/Inspector.tsx"), "utf8");
    for (const campo of ["waFlowAgenda", "waFlowCampoHorarios", "waFlowCampoNombre", "waFlowCampoHora", "waFlowCampoCorreo"]) {
      esperar(new RegExp(`\\b${campo}\\b`).test(insp)).verdadero(`el constructor no deja tocar «${campo}»`);
    }
  });
});


// ─── CONECTAR ES ENCENDER ────────────────────────────────────────────────────
//
// La persona para la que está hecha esta plataforma tiene una clínica, no una
// empresa de software. Conecta su Google Calendar porque se lo pide la pantalla
// de citas, y hasta hoy su asistente seguía sin poder agendar por una casilla
// en OTRA pantalla que nadie le dijo que existía.
//
// Desde su lado eso no es un fallo que reportar. Es «la IA no sirve para eso».
describe("Lo que el negocio conecta enciende su IA", () => {
  const WA = sinComentarios(fs.readFileSync(path.join(RAIZ, "supabase/functions/whatsapp/index.ts"), "utf8"));
  const PURO = sinComentarios(fs.readFileSync(path.join(SRC, "lib/ai/capacidades.ts"), "utf8"));
  const HERR = sinComentarios(fs.readFileSync(path.join(SRC, "lib/ai/herramientas.ts"), "utf8"));

  const declaracion = (texto, nombre) => {
    const m = new RegExp(`function ${nombre}\\([\\s\\S]*?\\n\\}`).exec(texto);
    return m ? m[0].replace(/\s+/g, " ").trim() : null;
  };

  test("las dos reglas están en los dos motores y dicen lo mismo", () => {
    // Dos ideas distintas de «qué puede hacer la IA» significaría que el mismo
    // negocio tiene una asistente por WhatsApp y otra por la web.
    for (const f of ["herramientasAutomaticas", "herramientasQueManda"]) {
      const a = declaracion(PURO, f);
      const b = declaracion(WA, f);
      esperar(a && b).verdadero(`falta ${f} en uno de los dos motores`);
      esperar(b).igual(a);
    }
    // Y las listas, que son el contenido de la regla.
    for (const lista of ["POR_LA_AGENDA", "POR_LA_TIENDA"]) {
      const trozo = (t) => {
        const i = t.indexOf(`${lista} = [`);
        return t.slice(i, t.indexOf("]", i)).replace(/\s+/g, " ");
      };
      esperar(trozo(WA)).igual(trozo(PURO));
    }
  });

  test("los dos motores miran lo que hay conectado antes de armar herramientas", () => {
    // SE MIRA DENTRO DE `armarHerramientas`, no en el archivo entero: buscando
    // en todo el archivo, las propias definiciones de estas funciones hacen
    // pasar la regla aunque nadie las llame.
    for (const [nombre, texto] of [["WhatsApp", WA], ["web", HERR]]) {
      const i = texto.indexOf("function armarHerramientas");
      esperar(i > 0).verdadero(`cambió la forma del motor de ${nombre}, revisa esta prueba`);
      const cuerpo = texto.slice(i, i + 2500);
      esperar(/herramientasAutomaticas\(await loQueTieneEsteNegocio\(ctx\)\)/.test(cuerpo)).verdadero(
        `el motor de ${nombre} no enciende nada con lo que el negocio tiene conectado`,
      );
      esperar(/herramientasQueManda\(/.test(cuerpo)).verdadero(
        `el motor de ${nombre} volvió a juntar las herramientas a su manera`,
      );
      esperar(/apagadas: Array\.isArray\(ai\.herramientas_apagadas\)/.test(cuerpo)).verdadero(
        `el motor de ${nombre} ignora lo que el negocio apagó a propósito`,
      );
    }
  });

  test("SE PREGUNTA CADA VEZ, no se guarda en ningún sitio", () => {
    // El día que alguien desconecte su Google, su asistente tiene que dejar de
    // prometer citas EN ESE MOMENTO, no cuando alguien se acuerde de ir a
    // desmarcar una casilla. Una IA que ofrece horarios de una agenda que ya no
    // existe es peor que una IA que no agenda.
    for (const [nombre, texto] of [["WhatsApp", WA], ["web", HERR]]) {
      const c = declaracion(texto, "loQueTieneEsteNegocio");
      esperar(!!c).verdadero(`falta la consulta en el motor de ${nombre}`);
      esperar(/integrations/.test(c)).verdadero(`el motor de ${nombre} no comprueba la agenda`);
      esperar(/tiendas/.test(c)).verdadero(`el motor de ${nombre} no comprueba la tienda`);
      esperar(/activa/.test(c)).verdadero(
        `el motor de ${nombre} enciende la tienda aunque esté apagada`,
      );
    }
  });

  test("ANTE LA DUDA, NADA AUTOMÁTICO", () => {
    // Encender herramientas porque la base no contestó sería que el bot promete
    // citas sin poder crearlas. Lo peor de los dos errores posibles.
    for (const [nombre, texto] of [["WhatsApp", WA], ["web", HERR]]) {
      const c = declaracion(texto, "loQueTieneEsteNegocio");
      esperar(/catch[\s\S]*agenda: false, tienda: false/.test(c)).verdadero(
        `el motor de ${nombre} enciende herramientas cuando la base falla`,
      );
    }
  });

  test("las herramientas apagadas llegan hasta el motor", () => {
    // Un negocio que dijo «no quiero que el bot toque mis citas» no puede
    // encontrárselo agendando otra vez porque la columna no se leyó.
    for (const [nombre, texto] of [["WhatsApp", WA], ["web", HERR]]) {
      esperar(/herramientas_apagadas/.test(texto)).verdadero(
        `el motor de ${nombre} ignora lo que el negocio apagó a propósito`,
      );
    }
    esperar(/herramientas_apagadas/.test(sinComentarios(fs.readFileSync(path.join(SRC, "lib/ai/agenteAjustes.ts"), "utf8"))))
      .verdadero("el agente ya no trae las herramientas apagadas");
  });

  test("guardar la pantalla no puede dejar una casilla marcada y apagada", () => {
    // El caso que se escapa siempre es VOLVER a encender: si al marcarla no se
    // quita de las apagadas, el negocio la marca, guarda, y sigue apagada.
    const acciones = fs.readFileSync(path.join(SRC, "app/(dashboard)/bots/[id]/ai/actions.ts"), "utf8");
    esperar(/apagadasDespuesDeGuardar\(/.test(acciones)).verdadero(
      "la pantalla guarda las apagadas a su manera, sin la regla probada",
    );
    esperar(/herramientas_apagadas: ai\.herramientas_apagadas/.test(acciones)).verdadero(
      "lo que el negocio apaga no llega a la base",
    );
  });

  test("conectar una agenda crea los datos que hacen falta para agendar", () => {
    // Sin `correo` la cita se crea sin invitación y NADIE se entera. Era el
    // tercer paso de un recorrido de tres pantallas que nadie completaba.
    for (const cual of ["google", "calendly"]) {
      const cb = fs.readFileSync(path.join(SRC, `app/api/integrations/${cual}/callback/route.ts`), "utf8");
      esperar(/asegurarAtributosDeAgenda\(/.test(cb)).verdadero(
        `conectar ${cual} no deja creados los datos del lead`,
      );
    }
    const at = sinComentarios(fs.readFileSync(path.join(SRC, "lib/agendaAtributos.ts"), "utf8"));
    esperar(/"correo"/.test(at)).verdadero("ya no se crea el correo, que es el que hace falta");
    // Y NO se toca lo que el negocio ya tiene.
    // La condición entera, no la palabra: renombrar la variable dejaba pasar la
    // regla con el filtro quitado.
    esperar(/ATRIBUTOS_DE_AGENDA\.filter\(\(a\) => !tiene\.has\(a\.key\)\)/.test(at)).verdadero(
      "se insertan los atributos sin mirar cuáles ya existen: reordenaría la pantalla del negocio",
    );
  });

  test("se puede conectar la agenda desde la pantalla de la IA", () => {
    // Antes: Ajustes → Integraciones, volver, y marcar dos casillas. Tres
    // pantallas, y saltarse cualquiera no fallaba nada visible.
    const pag = fs.readFileSync(path.join(SRC, "app/(dashboard)/bots/[id]/ai/page.tsx"), "utf8");
    esperar(/integrations\/google\/start\?volver=/.test(pag)).verdadero(
      "la pantalla de la IA ya no deja conectar el calendario",
    );
    esperar(/deDondeSale\(/.test(pag)).verdadero(
      "las casillas ya no explican por qué están encendidas",
    );
  });

  test("volver después de conectar solo va a rutas de esta plataforma", () => {
    // Sin la comprobación, cualquiera podría mandar a alguien a
    // `...start?volver=https://…` y usarnos de trampolín justo después de un
    // login de Google.
    for (const ruta of ["start", "callback"]) {
      const r = sinComentarios(fs.readFileSync(path.join(SRC, `app/api/integrations/google/${ruta}/route.ts`), "utf8"));
      esperar(/startsWith\("\/"\) && !\w*\.startsWith\("\/\/"\)/.test(r)).verdadero(
        `la ruta ${ruta} acepta una vuelta a cualquier sitio`,
      );
    }
  });
});

// ─── MOVER Y CANCELAR UNA CITA ───────────────────────────────────────────────
describe("La IA puede mover y cancelar la cita de una persona", () => {
  const WA = sinComentarios(fs.readFileSync(path.join(RAIZ, "supabase/functions/whatsapp/index.ts"), "utf8"));
  const HERR = sinComentarios(fs.readFileSync(path.join(SRC, "lib/ai/herramientas.ts"), "utf8"));
  const AG = sinComentarios(fs.readFileSync(path.join(SRC, "lib/agenda.ts"), "utf8"));

  test("EL MODELO NUNCA DICE QUÉ CITA, solo qué hacer", () => {
    // No tiene forma de saber el id de un evento de Google, así que si se lo
    // pidiéramos se lo inventaría — y un id inventado que casualmente exista
    // borra la cita de OTRA persona. La cita la busca la plataforma por el
    // contacto que está escribiendo.
    for (const [nombre, texto] of [["WhatsApp", WA], ["web", HERR]]) {
      const i = texto.indexOf('name: "cancelar_cita"');
      esperar(i > 0).verdadero(`el motor de ${nombre} no ofrece cancelar`);
      const esquema = texto.slice(i, i + 700);
      esperar(/cita_id|evento_id|event_id/.test(esquema)).falso(
        `el motor de ${nombre} le pide al modelo que identifique la cita`,
      );
    }
  });

  test("cada cita queda apuntada, y desde un solo sitio", () => {
    // Hay cuatro caminos que agendan. Si cada uno tuviera que acordarse de
    // guardar la cita, el que se añada mañana no se acordaría y sus citas
    // serían las únicas que no se pueden mover.
    // DOS EXACTAS: una por agenda. Con «al menos una», borrar la de Calendly
    // pasaba en verde y sus citas quedaban huérfanas — que es justo el tipo de
    // fallo que no se ve hasta que un cliente pide moverla.
    esperar((AG.match(/await apuntarCita\(/g) ?? []).length).igual(2);
    const i = AG.indexOf("export async function agendar(");
    const j = AG.indexOf("export async function apuntarCita");
    esperar(i > 0 && j > i).verdadero("cambió la forma del archivo, revisa esta prueba");
    esperar(/apuntarCita\(/.test(AG.slice(i, j))).verdadero(
      "`agendar` dejó de apuntar la cita: quien llame tendrá que acordarse, y alguien no se acordará",
    );
  });

  test("el aviso de cita agendada sale de UN solo sitio", () => {
    // Ahora lo emite el disparador de la base al apuntar la cita. Si además se
    // emitiera desde el código, cada cita contaría DOS veces: al CRM del
    // cliente y al embudo.
    for (const [nombre, texto] of [["WhatsApp", WA], ["web", HERR]]) {
      esperar(/"cita\.agendada"/.test(texto)).falso(
        `el motor de ${nombre} vuelve a emitir el aviso a mano: cada cita contaría dos veces`,
      );
    }
    const wh = sinComentarios(fs.readFileSync(path.join(SRC, "app/api/webhooks/calendly/[org]/route.ts"), "utf8"));
    esperar(/"cita\.agendada"/.test(wh)).falso("el aviso de Calendly se emite dos veces");
    esperar(/apuntarCita\(/.test(wh)).verdadero(
      "una cita reservada desde el enlace de Calendly no se puede mover después por chat",
    );
  });

  test("la propia cita no cuenta como hora ocupada al moverla", () => {
    // Sin esto, mover una cita media hora hacia adelante chocaría CONSIGO
    // MISMA —su hueco viejo sigue reservado— y se rechazaría siempre.
    const c = new RegExp("function moverCita\\([\\s\\S]*?\\n\\}").exec(AG)?.[0] ?? "";
    // El filtro entero. Con solo el nombre de la variable, quitar el filtro y
    // usar `ocupado` directamente pasaba en verde.
    esperar(/const ajenos = ocupado\.filter\(/.test(c)).verdadero(
      "mover una cita choca con ella misma y no se puede mover nunca",
    );
    esperar(/if \(ajenos\.length\)/.test(c)).verdadero(
      "se mira `ocupado` en vez de `ajenos`: la propia cita cuenta como hora ocupada",
    );
  });

  test("cancelar marca la fila DESPUÉS de que Google lo confirme", () => {
    // Al revés, el negocio se queda con el hueco bloqueado en su calendario y
    // con la plataforma diciéndole que está libre.
    const c = new RegExp("function cancelarCita\\([\\s\\S]*?\\n\\}").exec(AG)?.[0] ?? "";
    const borra = c.indexOf("deleteCalendarEvent");
    const marca = c.indexOf('estado: "cancelada"');
    esperar(borra > 0 && marca > borra).verdadero(
      "se marca la cita cancelada antes de que Google confirme el borrado",
    );
  });

  test("una cita cancelada NO se borra de la plataforma", () => {
    // La fila se queda: es lo que permite que el bot sepa después «esta persona
    // canceló» en vez de «esta persona nunca agendó».
    esperar(/\.delete\(\)/.test(AG)).falso("se está borrando una cita de la tabla en vez de marcarla");
  });
});


// ─── INSTAGRAM: LOS CAMPOS DEL DISPARADOR SE USAN ────────────────────────────
//
// La 0033 añadió `origen`, `publicacion`, `respuesta_publica` y
// `una_por_persona` a los flujos, y el constructor lleva semanas dejando
// configurarlos. El webhook no leía NINGUNO de los cuatro: el negocio elegía
// «comentario en un reel», lo veía guardado, y su flujo se activaba igual desde
// un mensaje directo.
//
// Mismo patrón que las tres herramientas de la tienda que no tenía nadie: no
// falla nada, simplemente no hace lo que dice. Estas reglas son lo que impide
// que un campo vuelva a guardarse sin que nadie lo lea.
describe("Instagram contesta según de dónde venga", () => {
  const WH = sinComentarios(fs.readFileSync(path.join(SRC, "app/api/webhooks/instagram/route.ts"), "utf8"));
  const REGLAS = sinComentarios(fs.readFileSync(path.join(SRC, "lib/canales/instagramReglas.ts"), "utf8"));

  test("LOS CUATRO CAMPOS LLEGAN AL WEBHOOK", () => {
    // La consulta no los pedía, así que el webhook no podía usarlos aunque
    // hubiera querido.
    const i = WH.indexOf("function flujosDelBot");
    esperar(i > 0).verdadero("cambió la forma del webhook, revisa esta prueba");
    const consulta = WH.slice(i, i + 700);
    for (const campo of ["origen", "publicacion", "respuesta_publica", "una_por_persona"]) {
      esperar(new RegExp(`\\b${campo}\\b`).test(consulta)).verdadero(
        `la consulta de flujos no trae «${campo}»: se guarda y no se puede usar`,
      );
    }
  });

  test("y los cuatro se USAN de verdad", () => {
    // Traerlos y no mirarlos sería el mismo fallo con un paso más.
    esperar(/reglaQueAplica\(/.test(WH)).verdadero("el webhook elige el flujo a ciegas otra vez");
    esperar(/responderComentario\(/.test(WH)).verdadero(
      "`respuesta_publica` vuelve a guardarse sin mandarse nunca",
    );
    esperar(/puedeEscribirEnPrivado\(/.test(WH)).verdadero(
      "`una_por_persona` vuelve a ignorarse: tres comentarios, tres privados",
    );
  });

  test("MANDA LA REGLA, y lo de antes queda de respaldo", () => {
    // Quitar el respaldo dejaría sin contestar a todos los flujos que ya
    // existen, que tienen `origen = 'dm'` y nunca se pensaron como reglas.
    esperar(/porRegla \?\? chooseWebFlow\(/.test(WH)).verdadero(
      "o mandan las reglas y nada más, o manda la búsqueda a ciegas: falta el respaldo",
    );
  });

  test("la respuesta pública va ANTES que la privada", () => {
    // La privada tiene el límite de una por comentario y puede perderse.
    // Quedarse sin la pública además sería quedarse sin nada — y la pública es
    // la que ven los demás, la que hace que comenten los siguientes.
    const publica = WH.indexOf("responderComentario(");
    const privada = WH.indexOf("responderEnPrivado(");
    esperar(publica > 0 && privada > publica).verdadero(
      "la respuesta pública se manda después de la privada, o no se manda",
    );
  });

  test("el saliente guarda de qué publicación salió", () => {
    // Es lo ÚNICO que después permite saber «a esta persona ya le escribimos
    // por esta publicación». Sin él, `una_por_persona` no tiene dónde mirar y
    // la comprobación pasa a ser decorativa.
    const i = WH.indexOf('tipo: "respuesta_privada"');
    esperar(i > 0).verdadero("cambió la forma del webhook, revisa esta prueba");
    esperar(/media_id/.test(WH.slice(i, i + 200))).verdadero(
      "el privado no guarda la publicación: «una vez por persona» no puede funcionar",
    );
  });

  test("el catálogo de superficies y la regla hablan el mismo idioma", () => {
    // Si la regla devolviera «historia» y el catálogo guardara «story_reply»,
    // ninguna regla encajaría NUNCA y no habría ningún síntoma: el bot
    // simplemente no contestaría.
    esperar(/from "@\/lib\/flow\/origenes"/.test(REGLAS)).verdadero(
      "las reglas se inventaron su propia lista de superficies",
    );
    const cat = sinComentarios(fs.readFileSync(path.join(SRC, "lib/flow/origenes.ts"), "utf8"));
    const enCatalogo = [...cat.matchAll(/valor: "(\w+)"/g)].map((m) => m[1]).sort();
    const enLaRegla = [...REGLAS.matchAll(/return "(\w+)";/g)].map((m) => m[1]);
    for (const s of enLaRegla) {
      esperar(enCatalogo.includes(s)).verdadero(
        `la regla devuelve «${s}» y el catálogo no lo conoce: nunca encajaría nada`,
      );
    }
  });

  test("el constructor pide los campos según el catálogo, no a mano", () => {
    // Escrito a mano como «post o reel», los directos —que también tienen
    // comentarios públicos— no ofrecían dónde escribir la respuesta pública, y
    // al guardar se borraba sin decir nada.
    for (const f of ["components/builder/DisparadorSocial.tsx", "app/(dashboard)/bots/actions.ts"]) {
      const t = sinComentarios(fs.readFileSync(path.join(SRC, f), "utf8"));
      esperar(/origen === "post" \|\| origen === "reel"|valor === "post" \|\| valor === "reel"/.test(t)).falso(
        `${f} vuelve a tener la lista de superficies escrita a mano`,
      );
      esperar(/admitePublica/.test(t)).verdadero(`${f} ya no sale del catálogo de orígenes`);
    }
  });
});


// ─── LA ZONA HORARIA NO SE ADIVINA EN SILENCIO ───────────────────────────────
//
// `timezone` era `not null default 'America/Mexico_City'` y ese mismo valor
// estaba escrito a mano como respaldo en DIEZ sitios. La base no podía
// representar «no sé dónde está este negocio».
//
// El 5 de septiembre de 2026 un negocio de Panamá ofreció todas sus citas una
// hora corridas. Nadie lo vio: la pantalla enseñaba una zona plausible y el
// síntoma no se parecía a la causa.
describe("La zona horaria del negocio", () => {
  const AG = sinComentarios(fs.readFileSync(path.join(SRC, "lib/agenda.ts"), "utf8"));

  test("SE ACABÓ EL RESPALDO A CIUDAD DE MÉXICO donde se agenda", () => {
    // Cada uno de esos respaldos convertía «no lo sabemos» en una respuesta que
    // parecía correcta.
    esperar(/America\/Mexico_City/.test(AG)).falso(
      "`agenda.ts` vuelve a inventarse la zona horaria cuando no la sabe",
    );
    const acciones = sinComentarios(fs.readFileSync(path.join(SRC, "app/(dashboard)/settings/actions.ts"), "utf8"));
    esperar(/America\/Mexico_City/.test(acciones)).falso(
      "guardar el horario laboral vuelve a re-imponer México a quien no lo tocó",
    );
    const motor = sinComentarios(fs.readFileSync(path.join(SRC, "app/api/motor/agenda/route.ts"), "utf8"));
    esperar(/America\/Mexico_City/.test(motor)).falso(
      "el motor vuelve a inventarse la zona al escribir una fecha",
    );
  });

  test("sin zona NO se ofrecen horarios ni se agenda", () => {
    // Etiquetar los huecos con un huso inventado es ofrecer horas que no son
    // las del negocio — peor que no ofrecer ninguna.
    // LA GUARDA ENTERA, no la cadena suelta: metiéndole un `if (false)`
    // delante, contar apariciones de `sinZona: true` seguía pasando en verde.
    esperar(/if \(!zona\) \{[\s\S]{0,200}sinZona: true/.test(AG)).verdadero(
      "la agenda de Calendly ofrece horarios sin saber en qué huso está",
    );
    esperar(/if \(!timeZone\) \{[\s\S]{0,200}sinZona: true/.test(AG)).verdadero(
      "la agenda de Google ofrece horarios sin saber en qué huso está",
    );
    esperar((AG.match(/return SIN_ZONA;/g) ?? []).length >= 3).verdadero(
      "agendar o mover una cita sigue funcionando sin zona horaria",
    );
  });

  test("«sin zona» NO se le enseña al cliente", () => {
    // A quien escribe no le dice nada y no lo puede arreglar. El aviso que sí
    // se ve está en la pantalla del negocio.
    const i = AG.indexOf("const SIN_ZONA");
    esperar(i > 0).verdadero("desapareció el fallo de zona horaria");
    esperar(/paraElCliente/.test(AG.slice(i, i + 300))).falso(
      "el error interno de la zona horaria se le enseña a quien está agendando",
    );
  });

  test("PUESTA NO ES MIRADA: se pide confirmar una vez", () => {
    // La zona de México parecía perfectamente correcta y corrió todas las citas
    // de una cuenta una hora.
    const iaAgenda = sinComentarios(fs.readFileSync(path.join(SRC, "lib/ai/agenda.ts"), "utf8"));
    // La CONDICIÓN, no el nombre: el parámetro sigue declarado aunque nadie lo
    // mire, y la regla pasaba en verde con el aviso desactivado.
    esperar(/v\.zonaConfirmada === false/.test(iaAgenda)).verdadero(
      "la pantalla no distingue una zona confirmada de una que nadie miró",
    );
    const pag = fs.readFileSync(path.join(SRC, "app/(dashboard)/bots/[id]/ai/page.tsx"), "utf8");
    // Con el borde: `<ConfirmarZonaX` contiene `<ConfirmarZona`.
    esperar(/<ConfirmarZona\b/.test(pag)).verdadero("el aviso de la zona ya no sale en la pantalla de la IA");
    esperar(/zona_confirmada/.test(pag)).verdadero("la pantalla no lee si la zona está confirmada");
  });

  test("confirmar guarda la zona Y la confirmación, juntas", () => {
    // Guardar solo la confirmación dejaría al negocio marcado como «ya lo miró»
    // con la zona vieja puesta: el fallo original con un sello de aprobado.
    const acc = sinComentarios(fs.readFileSync(path.join(SRC, "app/(dashboard)/settings/zonaActions.ts"), "utf8"));
    esperar(/timezone: z, zona_confirmada: true/.test(acc)).verdadero(
      "confirmar no guarda las dos cosas a la vez",
    );
    esperar(/zonaValida\(z\)/.test(acc)).verdadero(
      "se guarda lo que mande el navegador sin comprobar que esa zona exista",
    );
  });

  test("el selector de zonas sale del mapa, y ya no se deja fuera a nadie", () => {
    // La lista escrita a mano tenía ocho zonas y NO incluía Panamá, ni Costa
    // Rica, ni Guatemala, ni El Salvador, ni Honduras, ni Nicaragua: en una
    // plataforma para Latinoamérica, media Centroamérica no podía elegir su
    // propia hora aunque supiera que la tenía mal.
    const hours = fs.readFileSync(path.join(SRC, "app/(dashboard)/settings/hours/page.tsx"), "utf8");
    // Que se VUELQUE en la lista, no que esté importado: quitando el spread, el
    // import se queda y la regla pasaba en verde con la lista a mano de vuelta.
    esperar(/\.\.\.Object\.values\(ZONA_POR_PREFIJO\)/.test(hours)).verdadero(
      "el selector de zonas volvió a ser una lista escrita a mano",
    );
    const zonas = sinComentarios(fs.readFileSync(path.join(SRC, "lib/zonaHoraria.ts"), "utf8"));
    for (const z of ["America/Panama", "America/Costa_Rica", "America/Guatemala", "America/Bogota"]) {
      esperar(zonas.includes(z)).verdadero(`falta ${z} en el mapa de zonas`);
    }
  });

  test("Estados Unidos NO se deduce de su prefijo", () => {
    // Seis husos y ninguno mayoritario: adivinar sería tirar una moneda, y una
    // moneda con cara de certeza es lo que causó todo esto. Elegirlo a mano sí
    // se puede.
    const zonas = sinComentarios(fs.readFileSync(path.join(SRC, "lib/zonaHoraria.ts"), "utf8"));
    const i = zonas.indexOf("ZONA_POR_PREFIJO");
    const mapa = zonas.slice(i, zonas.indexOf("};", i));
    esperar(/"1":/.test(mapa)).falso("se está adivinando la zona de un número de Estados Unidos");
    const hours = fs.readFileSync(path.join(SRC, "app/(dashboard)/settings/hours/page.tsx"), "utf8");
    esperar(/America\/New_York/.test(hours)).verdadero(
      "un negocio de Estados Unidos no puede elegir su zona a mano",
    );
  });
});


// ─── «LUNES A LAS 9 AM» TIENE QUE PODER AGENDARSE ────────────────────────────
//
// 6 de septiembre. Lana ofreció horarios, el cliente contestó «lunes a las 9
// am», y la cita nunca se creó. Le pedíamos al modelo que cargara un
// identificador exacto entre turnos después de haber reescrito la lista con sus
// palabras — y eso no es fiable ni tiene por qué serlo.
describe("La plataforma recuerda los horarios que ofreció", () => {
  const WA = sinComentarios(fs.readFileSync(path.join(RAIZ, "supabase/functions/whatsapp/index.ts"), "utf8"));
  const HERR = sinComentarios(fs.readFileSync(path.join(SRC, "lib/ai/herramientas.ts"), "utf8"));
  const PURO = sinComentarios(fs.readFileSync(path.join(SRC, "lib/agendaHorarios.ts"), "utf8"));

  const declaracion = (texto, nombre) => {
    const m = new RegExp(`function ${nombre}\\([\\s\\S]*?\\n\\}`).exec(texto);
    return m ? m[0].replace(/\s+/g, " ").trim() : null;
  };

  test("las reglas de traducir la hora están en los dos motores y dicen lo mismo", () => {
    // Dos formas de entender «lunes a las 9» significaría que el mismo cliente
    // agenda por la web y no por WhatsApp.
    for (const f of ["sinTildes", "diaQueDijo", "horasQueDijo", "horaDeLaEtiqueta", "horarioQuePidio", "comoRecordarLosHorarios"]) {
      const a = declaracion(PURO, f);
      const b = declaracion(WA, f);
      esperar(a && b).verdadero(`falta ${f} en uno de los dos motores`);
      esperar(b).igual(a);
    }

    // Y EL MAPA DE DÍAS, que es contenido de la regla y no una función:
    // añadirle una entrada a una de las copias no rompía nada visible y hacía
    // que «lunes» se entendiera en un motor y en el otro no.
    const mapa = (t) => {
      const i = t.indexOf("DIAS_DE_LA_SEMANA");
      return t.slice(i, t.indexOf("};", i)).replace(/\s+/g, " ");
    };
    esperar(mapa(WA)).igual(mapa(PURO));
  });

  test("UN SOLO QUITADOR DE TILDES por archivo", () => {
    // Dos formas de quitar tildes en el mismo sitio garantiza que un día
    // «PROMOCIÓN» coincida en una función y no en la de al lado.
    esperar((PURO.match(/normalize\("NFD"\)/g) ?? []).length).igual(1);
  });

  test("ver_horarios GUARDA lo que ofreció, en los dos motores", () => {
    for (const [nombre, texto] of [["WhatsApp", WA], ["web", HERR]]) {
      esperar(/vars\.horarios_ofrecidos = JSON\.stringify\(/.test(texto)).verdadero(
        `el motor de ${nombre} vuelve a confiar en que el modelo cargue el identificador`,
      );
    }
  });

  test("agendar y mover TRADUCEN contra lo ofrecido", () => {
    for (const [nombre, texto] of [["WhatsApp", WA], ["web", HERR]]) {
      esperar((texto.match(/horarioQuePidio\(/g) ?? []).length >= 2).verdadero(
        `el motor de ${nombre} traduce al agendar pero no al mover, o al revés`,
      );
      esperar((texto.match(/comoRecordarLosHorarios\(/g) ?? []).length >= 2).verdadero(
        `el motor de ${nombre} deja al modelo sin salida en uno de los dos casos`,
      );
    }
  });

  test("NO se le manda el texto suelto al calendario", () => {
    // Era el fallo: `inicio` iba tal cual, `Date.parse` lo rechazaba, y volvía
    // «Falta la fecha y hora de la cita» — un error con el que el modelo se
    // rindió y pasó la conversación con una persona.
    const i = WA.indexOf('case "agendar_cita"');
    esperar(i > 0).verdadero("cambió la forma del motor, revisa esta prueba");
    const trozo = WA.slice(i, i + 900);
    esperar(/const inicio = horarioQuePidio\(pedido, ofrecidos\)/.test(trozo)).verdadero(
      "el motor de WhatsApp vuelve a mandar al calendario lo que diga el modelo",
    );
    esperar(/if \(!inicio\) return comoRecordarLosHorarios\(ofrecidos\)/.test(trozo)).verdadero(
      "sin reconocer la hora, el modelo se queda otra vez sin saber qué hacer",
    );
  });
});


// ─── UN FORMULARIO SIN SINCRONIZAR TAMBIÉN SE MANDA ──────────────────────────
//
// Meta rechaza un formulario en BORRADOR mandado como publicado, con
// «(#131009) Parameter value is not valid» — un error que no dice nada. Y todo
// formulario recién hecho está en borrador: nadie publica antes de probar.
//
// El motor lo esquivaba preguntándole a `whatsapp_forms`, que se llena al
// SINCRONIZAR. Quien creó su formulario directo en Meta y solo pegó el id no
// tiene fila ahí — y a su cliente le salía «No pude abrirte el formulario» al
// final de cada demo agendada. Pasó con la encuesta el 6 de septiembre.
describe("El estado de un formulario sale de Meta", () => {
  const WA = sinComentarios(fs.readFileSync(path.join(RAIZ, "supabase/functions/whatsapp/index.ts"), "utf8"));

  test("se le pregunta a Meta, no solo a la tabla de sincronizados", () => {
    esperar(/fields=status/.test(WA)).verdadero(
      "el motor volvió a fiarse solo de `whatsapp_forms`: un formulario sin sincronizar se manda como publicado",
    );
    // Y QUE EL ESTADO SE USE, no solo que se pida: pedirlo y no mirarlo deja el
    // fallo exactamente igual, con una llamada de más.
    esperar(/let enBorrador = String\(estado \?\? ""\)\.toUpperCase\(\) === "DRAFT";/.test(WA)).verdadero(
      "se le pregunta el estado a Meta y después no se mira",
    );
    const i = WA.indexOf("function fichaDelFlujo");
    esperar(i > 0).verdadero("desapareció la ficha del formulario");
  });

  test("una caché vieja SIN estado se vuelve a preguntar", () => {
    // Las cachés de antes tienen la pantalla y no el estado. Darlas por buenas
    // dejaría el fallo igual justo para los formularios que ya se usaban.
    const c = new RegExp("function fichaDelFlujo\\([\\s\\S]*?\\n\\}").exec(WA)?.[0] ?? "";
    esperar(/if \(cache\?\.screen && cache\?\.estado\)/.test(c)).verdadero(
      "una caché a medias se da por buena y el estado nunca se llega a leer",
    );
  });

  test("lo sincronizado manda sobre lo de Meta, si existe", () => {
    // La pantalla de Formularios es la fuente que el negocio controla; lo de
    // Meta es el respaldo para cuando no ha pasado por ahí.
    esperar(/if \(sincronizado\) enBorrador = sincronizado === "DRAFT";/.test(WA)).verdadero(
      "o manda uno o manda el otro, pero no hay orden definido",
    );
  });

  test("el estado queda apuntado en el mensaje", () => {
    // Para poder entender un «no pude abrirte el formulario» sin mirar unos
    // registros de servidor que no lee nadie — que es por lo que este fallo
    // duró semanas.
    esperar(/estado_en_meta: estado/.test(WA)).verdadero(
      "el mensaje no dice en qué estado estaba el formulario que Meta rechazó",
    );
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// EL REPO TIENE QUE PODER LEVANTAR LA PLATAFORMA ENTERA
//
// El 6 de septiembre se le preguntó a producción qué tablas y funciones tiene
// y se buscó cada una en `supabase/migrations/`. Faltaban DIECINUEVE TABLAS y
// ONCE FUNCIONES: `plans`, `addons`, `platform_admins`, `whatsapp_forms`,
// `usage_events`, `quick_replies`, `contact_notes`… todas creadas a mano en el
// panel de Supabase, ninguna escrita en ningún sitio.
//
// No se notó NUNCA, porque producción sí las tenía. El repo se fue quedando
// atrás en silencio durante meses, y el día que se hubiera notado —levantando
// la base desde cero— habría sido el peor día posible para notarlo.
//
// Esta regla convierte ese silencio en un fallo de prueba: si el código lee una
// tabla o llama a una función que ninguna migración crea, aquí se ve. Es la
// única defensa posible contra crear cosas a mano, porque el hábito no se
// arregla con buenas intenciones.
// ─────────────────────────────────────────────────────────────────────────────
describe("El repo levanta la plataforma entera", () => {
  const DIR_MIG = path.join(RAIZ, "supabase/migrations");
  const MIGRACIONES = fs
    .readdirSync(DIR_MIG)
    .filter((f) => f.endsWith(".sql"))
    .map((f) => fs.readFileSync(path.join(DIR_MIG, f), "utf8"))
    .join("\n");

  // El motor de WhatsApp es Deno y vive fuera de `src`, pero lee las mismas
  // tablas: dejarlo fuera sería tener la regla a medias.
  const MOTOR = fs.readFileSync(path.join(RAIZ, "supabase/functions/whatsapp/index.ts"), "utf8");
  const TODO = [...ARCHIVOS.map((a) => a.texto), MOTOR].map(sinComentarios);

  // Lo que NO es una tabla de `public`: los cubos de Storage y las tablas del
  // esquema `auth`, que las crea Supabase.
  const NO_SON_TABLAS = new Set(["media", "adjuntos", "conocimiento", "users", "objects"]);

  function tablasQueUsaElCodigo() {
    const nombres = new Set();
    for (const texto of TODO) {
      // `.storage.from("cubo")` es un cubo, no una tabla. Se descarta mirando
      // lo que hay JUSTO ANTES del `.from`, no el nombre — un cubo y una tabla
      // se pueden llamar igual y esa coincidencia no puede decidir nada.
      for (const m of texto.matchAll(/(\.storage)?\s*\.from\(\s*["']([a-z][a-z0-9_]*)["']/g)) {
        if (m[1]) continue;
        if (!NO_SON_TABLAS.has(m[2])) nombres.add(m[2]);
      }
    }
    return [...nombres].sort();
  }

  function funcionesQueLlamaElCodigo() {
    const nombres = new Set();
    for (const texto of TODO) {
      for (const m of texto.matchAll(/\.rpc\(\s*["']([a-z][a-z0-9_]*)["']/g)) nombres.add(m[1]);
    }
    return [...nombres].sort();
  }

  test("toda tabla que el código lee la crea una migración", () => {
    const usadas = tablasQueUsaElCodigo();
    // Que la regla tenga de qué tirar. Si un cambio de sintaxis deja el
    // buscador sin encontrar nada, la regla pasaría vacía para siempre.
    esperar(usadas.length > 30).verdadero(
      `solo se encontraron ${usadas.length} tablas en el código: el buscador dejó de reconocer las consultas`,
    );

    // Una vista sirve igual que una tabla para quien la consulta: `.from()` no
    // distingue, y `actividad_del_equipo` (la 0061) es una. Lo que importa es
    // que ALGUNA migración la cree, no de qué tipo sea.
    const huerfanas = usadas.filter(
      (t) =>
        !new RegExp(`create\\s+table\\s+(if\\s+not\\s+exists\\s+)?(public\\.)?${t}\\b`, "i").test(MIGRACIONES) &&
        !new RegExp(`create\\s+(or\\s+replace\\s+)?(materialized\\s+)?view\\s+(if\\s+not\\s+exists\\s+)?(public\\.)?${t}\\b`, "i").test(MIGRACIONES),
    );
    esperar(huerfanas).igual(
      [],
      "el código lee tablas que ninguna migración crea: levantar la base desde cero da una plataforma rota",
    );
  });

  test("toda función que el código llama la crea una migración", () => {
    const usadas = funcionesQueLlamaElCodigo();
    esperar(usadas.length > 10).verdadero(
      `solo se encontraron ${usadas.length} funciones en el código: el buscador dejó de reconocer los .rpc()`,
    );

    const huerfanas = usadas.filter(
      (f) => !new RegExp(`create\\s+(or\\s+replace\\s+)?function\\s+(public\\.)?${f}\\b`, "i").test(MIGRACIONES),
    );
    esperar(huerfanas).igual([], "el código llama funciones de base que ninguna migración crea");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// UNA CUENTA NUEVA NACE FUNCIONANDO
//
// «Hauta Clinic» se registró y nació con cero atributos, cero etiquetas, cero
// agentes y la prueba vencida. Los cuatro atributos base los creaba la 0006 y
// la 0011 se los dejó fuera al redefinir `handle_new_user`; cinco
// redefiniciones después nadie lo había notado.
//
// La regla mira la ÚLTIMA definición del disparador, que es la que manda.
// Comprobarlo sobre todo el archivo dejaría pasar exactamente el fallo
// original: la 0006 seguiría teniendo el `insert`, y la última no.
// ─────────────────────────────────────────────────────────────────────────────
describe("El alta de una cuenta no vuelve a perder piezas", () => {
  const DIR_MIG = path.join(RAIZ, "supabase/migrations");
  const ARCHIVOS_MIG = fs.readdirSync(DIR_MIG).filter((f) => f.endsWith(".sql")).sort();

  /** La ÚLTIMA definición de una función en todas las migraciones: la que manda. */
  function ultimaDefinicion(nombre) {
    let ultima = "";
    const re = new RegExp(
      `create\\s+or\\s+replace\\s+function\\s+(public\\.)?${nombre}\\b[\\s\\S]*?\\n(end \\$\\$;|\\$\\$;)`,
      "g",
    );
    for (const f of ARCHIVOS_MIG) {
      const texto = fs.readFileSync(path.join(DIR_MIG, f), "utf8");
      const trozos = [...texto.matchAll(re)];
      if (trozos.length) ultima = trozos[trozos.length - 1][0];
    }
    return sinComentarios(ultima);
  }

  /* ── EL ALTA VIVE EN UN SOLO SITIO ────────────────────────────────────────
   *
   * Desde la 0107, las ocho inserciones del alta están en `provisionar_negocio`
   * y las llaman DOS puertas: el disparador de `auth.users` y la pantalla de
   * bienvenida de quien se quedó sin negocio.
   *
   * Por eso hay dos reglas y no una: que la función tenga las piezas, Y que el
   * disparador la llame. Comprobar solo lo primero dejaría pasar un alta que no
   * provisiona nada; comprobar solo lo segundo, una llamada a una función
   * vaciada. */
  const P = ultimaDefinicion("provisionar_negocio");
  const H = ultimaDefinicion("handle_new_user");

  test("hay un alta de negocio que mirar", () => {
    esperar(P.length > 500).verdadero("no se encontró provisionar_negocio en las migraciones");
    esperar(H.length > 300).verdadero("no se encontró handle_new_user en las migraciones");
  });

  test("EL DISPARADOR DE ALTA LA LLAMA", () => {
    esperar(/provisionar_negocio\(/.test(H)).verdadero(
      "handle_new_user dejó de llamar a provisionar_negocio: quien se registre nace sin nada",
    );
    // Y que NO se haya vuelto a copiar el alta dentro del disparador: dos
    // copias es exactamente cómo se perdieron los atributos en la 0011.
    esperar(/insert into custom_attributes/.test(H)).falso(
      "el alta se volvió a copiar dentro de handle_new_user: vuelve a haber dos definiciones",
    );
  });

  test("crea los cuatro atributos del lead", () => {
    esperar(/insert into custom_attributes/.test(P)).verdadero(
      "el alta volvió a quedarse sin crear los atributos: «Datos del lead» nace vacío y agendar no encuentra el correo",
    );
    for (const clave of ["'nombre'", "'correo'", "'telefono'", "'ciudad'"]) {
      esperar(P.includes(clave)).verdadero(`falta el atributo ${clave} en el alta`);
    }
  });

  test("la prueba nace con fecha", () => {
    // Un nulo aquí lo lee `org_puede_enviar` como «venció»: la cuenta nace muda.
    esperar(/prueba_termina_at/.test(P) && /interval '14 days'/.test(P)).verdadero(
      "la prueba vuelve a nacer sin fecha, que el código lee como vencida",
    );
  });

  test("el dueño existe como agente y hay ajustes de reparto", () => {
    /* Se mira el `values`, no solo el `insert`: en el disparador había OTRO
     * `insert into team_members` —el de la rama de invitaciones— y con él,
     * borrar entero el del dueño dejaba la regla en verde. El mutante lo
     * destapó. Aquí el del dueño es el que mete `new_org`. */
    esperar(/insert into team_members[\s\S]{0,200}?values \(new_org/.test(P)).verdadero(
      "el dueño no queda como agente: `crm_elegir_agente` no tiene a quién asignar y el pase a humano no llega a nadie",
    );
    esperar(/insert into assignment_settings/.test(P)).verdadero(
      "sin fila de reparto, `crm_elegir_agente` sale con null y la pantalla no tiene nada que enseñar",
    );
  });

  test("hay etiquetas con las que calificar", () => {
    esperar(/insert into tags/.test(P)).verdadero(
      "sin etiquetas, la herramienta `etiquetar` de la IA no hace nada y no lo dice",
    );
  });

  /* ── LA PUERTA DE QUIEN SE QUEDÓ SIN NEGOCIO ──────────────────────────────
   *
   * `crear_mi_negocio` es SECURITY DEFINER y escribe en ocho tablas. Lo único
   * que impide que cualquiera con sesión se fabrique organizaciones a voluntad
   * es que compruebe que NO tiene ninguna. Sin esa comprobación, la función
   * pasa de arreglo a agujero. */
  test("crear un negocio SOLO vale para quien no tiene ninguno", () => {
    const C = ultimaDefinicion("crear_mi_negocio");
    esperar(C.length > 200).verdadero("no se encontró crear_mi_negocio en las migraciones");
    esperar(/security definer/i.test(C)).verdadero("crear_mi_negocio dejó de poder escribir");
    esperar(/exists\s*\(\s*select 1 from memberships/i.test(C)).verdadero(
      "crear_mi_negocio ya no comprueba si la persona tiene negocio: cualquiera puede fabricarse organizaciones",
    );
    esperar(/auth\.uid\(\)/.test(C)).verdadero("crear_mi_negocio ya no mira quién está pidiendo");
    esperar(/equipo_demandu/.test(C)).verdadero(
      "el equipo de Demandu puede acabar con negocio propio y ensuciar la lista de clientes",
    );
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// LA ZONA HORARIA NO SE ADIVINA EN NINGÚN SITIO
//
// Eran once respaldos a «America/Mexico_City». El último vivía dentro de la
// base, en `org_en_horario`, y es el que decide si un negocio está ABIERTO
// para el reparto: uno de Panamá salía cerrado hasta las 9 de la mañana.
// ─────────────────────────────────────────────────────────────────────────────
describe("Nadie vuelve a adivinar la zona horaria", () => {
  const DIR_MIG = path.join(RAIZ, "supabase/migrations");
  const ARCHIVOS_MIG = fs.readdirSync(DIR_MIG).filter((f) => f.endsWith(".sql")).sort();

  test("la última `org_en_horario` no tiene respaldo de zona", () => {
    let ultima = "";
    for (const f of ARCHIVOS_MIG) {
      const texto = fs.readFileSync(path.join(DIR_MIG, f), "utf8");
      const trozos = [...texto.matchAll(/create\s+or\s+replace\s+function\s+(public\.)?org_en_horario[\s\S]*?end \$\$;/g)];
      if (trozos.length) ultima = trozos[trozos.length - 1][0];
    }
    esperar(ultima.length > 200).verdadero("no se encontró org_en_horario en las migraciones");
    const cuerpo = sinComentarios(ultima);
    esperar(/coalesce\s*\(\s*timezone/i.test(cuerpo)).falso(
      "org_en_horario volvió a rellenar la zona: un negocio de Panamá vuelve a salir cerrado una hora de más",
    );
    esperar(/America\/Mexico_City/.test(cuerpo)).falso("org_en_horario vuelve a nombrar una zona por defecto");
  });

  test("la pantalla de Horario no preselecciona ninguna zona", () => {
    const p = ARCHIVOS.find((a) => a.ruta.endsWith("settings/hours/page.tsx"));
    esperar(!!p).verdadero("desapareció la pantalla de Horario laboral");
    const t = sinComentarios(p.texto);
    // ERA LA TRAMPA MÁS FINA: el selector salía marcado en México y guardar el
    // horario firmaba esa zona como elegida por una persona.
    esperar(/timezone[^\n]*\?\?\s*"America\/Mexico_City"/.test(t)).falso(
      "el selector vuelve a preseleccionar México: guardar el horario firma una zona que nadie eligió",
    );
    esperar(/required/.test(t)).verdadero("el selector de zona dejó de ser obligatorio");
  });

  test("las rutas del calendario no calculan con una zona inventada", () => {
    for (const cual of ["api/calendar/slots/route.ts", "api/calendar/book/route.ts"]) {
      const p = ARCHIVOS.find((a) => a.ruta.endsWith(cual));
      esperar(!!p).verdadero(`desapareció ${cual}`);
      esperar(/America\/Mexico_City/.test(sinComentarios(p.texto))).falso(
        `${cual} vuelve a inventarse la zona en vez de avisar`,
      );
    }
  });
});

/* ═══════════════════════════════════════════════════════════════════════════
 * LA HORA SE DICE EN EL RELOJ DE QUIEN LA ESCUCHA
 *
 * Demandu tiene número de Panamá y clientes en México. El bot hablaba SIEMPRE
 * en la zona del negocio, así que a un cliente mexicano le decía una hora que
 * en su teléfono era otra — y el cliente apuntaba la que oyó.
 * ═══════════════════════════════════════════════════════════════════════════ */
describe("Cada quien oye la hora en su reloj", () => {
  const WA = sinComentarios(fs.readFileSync(path.join(RAIZ, "supabase/functions/whatsapp/index.ts"), "utf8"));
  const HERR = sinComentarios(fs.readFileSync(path.join(SRC, "lib/ai/herramientas.ts"), "utf8"));
  const PURO = sinComentarios(fs.readFileSync(path.join(SRC, "lib/agendaHorarios.ts"), "utf8"));
  const ZONA = sinComentarios(fs.readFileSync(path.join(SRC, "lib/zonaHoraria.ts"), "utf8"));

  // `[^(]*` deja pasar los genéricos: `enLaZonaDelCliente<T extends …>(…)`.
  // Sin eso la regla no encontraba la función y se caía diciendo que faltaba —
  // que es un fallo honesto, pero por el motivo equivocado.
  const declaracion = (texto, nombre) => {
    const m = new RegExp(`function ${nombre}\\b[^(]*\\([\\s\\S]*?\\n\\}`).exec(texto);
    return m ? m[0].replace(/\s+/g, " ").trim() : null;
  };

  test("las reglas del reloj están en los dos motores y dicen lo mismo", () => {
    for (const f of ["etiquetaEnZona", "comoSeLoDigo", "enLaZonaDelCliente", "zonaUsable"]) {
      const aqui = declaracion(PURO, f);
      const alla = declaracion(WA, f);
      esperar(!!aqui).verdadero(`falta ${f} en agendaHorarios.ts`);
      esperar(!!alla).verdadero(`falta ${f} en el motor de WhatsApp`);
      esperar(alla).igual(aqui, `${f} dice cosas distintas en cada motor`);
    }
    // `zonaDelTelefono` vive en zonaHoraria.ts y el motor lleva su copia.
    const aqui = declaracion(ZONA, "zonaDelTelefono");
    const alla = declaracion(WA, "zonaDelTelefono");
    esperar(!!aqui).verdadero("falta zonaDelTelefono en zonaHoraria.ts");
    esperar(alla).igual(aqui, "zonaDelTelefono dice cosas distintas en cada motor");
    // Y el mapa de prefijos, que es de donde sale todo.
    const mapa = (t) => (/ZONA_POR_PREFIJO[^=]*=\s*\{[\s\S]*?\n\};/.exec(t)?.[0] ?? "").replace(/\s+/g, " ");
    esperar(mapa(WA)).igual(mapa(ZONA), "los dos motores tienen prefijos distintos");
    esperar(mapa(ZONA).length > 100).verdadero("el mapa de prefijos se quedó vacío");
  });

  test("los horarios se ofrecen traducidos, en los dos motores", () => {
    for (const [quien, texto] of [["motor de WhatsApp", WA], ["motor web", HERR]]) {
      esperar(/enLaZonaDelCliente\(/.test(texto)).verdadero(
        `${quien}: los horarios vuelven a ofrecerse siempre en la hora del negocio`,
      );
    }
  });

  test("SE GUARDA LO QUE SE ENSEÑÓ, no lo que se calculó", () => {
    /* La trampa fina de todo esto: si se traduce la lista para enseñarla pero
     * se guardan las etiquetas del negocio, alguien que repita la hora que
     * acaba de leer NO se reconoce — y vuelve el bucle de Instagram. Se
     * comprueba que lo guardado sale de la lista ya traducida. */
    const guardaLoTraducido = (texto, variable) =>
      new RegExp(`horarios_ofrecidos = JSON.stringify\\(\\s*${variable}\\.`).test(texto);
    esperar(guardaLoTraducido(HERR, "slots")).verdadero(
      "el motor web guarda los horarios sin traducir: repetir la hora leída dejaría de reconocerse",
    );
    esperar(guardaLoTraducido(WA, "slots")).verdadero(
      "el motor de WhatsApp guarda los horarios sin traducir",
    );
    // Y que `slots` sea DE VERDAD el traducido y no el crudo de la agenda.
    esperar(/const slots = enLaZonaDelCliente\(/.test(WA)).verdadero(
      "en el motor de WhatsApp `slots` volvió a ser la lista sin traducir",
    );
    esperar(/const slots = enLaZonaDelCliente\(/.test(HERR)).verdadero(
      "en el motor web `slots` volvió a ser la lista sin traducir",
    );
  });

  test("la confirmación se dice en el mismo reloj en que se ofreció", () => {
    /* Ofrecer en la hora del cliente y confirmar en la del negocio es peor que
     * no traducir nada: la persona ve dos horas distintas para la misma cita. */
    for (const [quien, texto] of [["motor de WhatsApp", WA], ["motor web", HERR]]) {
      esperar(/comoSeLoDigo\(/.test(texto)).verdadero(`${quien}: la confirmación no se traduce`);
      esperar(/Cita confirmada para el \$\{r\.dia/.test(texto)).falso(
        `${quien}: confirma con la hora del negocio después de ofrecer la del cliente`,
      );
      esperar(/Cita movida al \$\{r\.dia/.test(texto)).falso(
        `${quien}: al mover confirma con la hora del negocio`,
      );
    }
  });

  test("nunca se formatea una hora en la zona del SERVIDOR", () => {
    /* `toLocaleString("es-MX")` sin `timeZone` usa la zona de la máquina, que
     * en producción es UTC: contaba una hora que no era ni del cliente ni del
     * negocio. Estaba en `reagendar_cita`. */
    for (const [quien, texto] of [["motor web", HERR], ["motor de WhatsApp", WA]]) {
      esperar(/toLocaleString\(\s*["']es-MX["']\s*\)/.test(texto)).falso(
        `${quien}: vuelve a escribir una hora en el huso del servidor`,
      );
    }
  });
});

/* ═══════════════════════════════════════════════════════════════════════════
 * LA MISMA PERSONA EN DOS CANALES TIENE UNA SOLA AGENDA
 *
 * 6 de septiembre. Agendó por Instagram y preguntó por WhatsApp si su cita
 * había quedado bien. Lana le contestó con OTRA cita y, al insistir, se inventó
 * una explicación entera: «no puedo ver las citas hechas por Instagram desde mi
 * sistema». Nadie le enseñó eso — lo dedujo de no tener con qué mirar.
 * ═══════════════════════════════════════════════════════════════════════════ */
describe("Las citas de una persona no dependen del canal", () => {
  const AGENDA = sinComentarios(fs.readFileSync(path.join(SRC, "lib/agenda.ts"), "utf8"));
  const WA = sinComentarios(fs.readFileSync(path.join(RAIZ, "supabase/functions/whatsapp/index.ts"), "utf8"));
  const HERR = sinComentarios(fs.readFileSync(path.join(SRC, "lib/ai/herramientas.ts"), "utf8"));
  const RUTA = sinComentarios(fs.readFileSync(path.join(SRC, "app/api/motor/agenda/route.ts"), "utf8"));

  const declaracion = (texto, nombre) => {
    const m = new RegExp(`function ${nombre}\\([\\s\\S]*?\\n\\}`).exec(texto);
    return m ? m[0] : null;
  };

  test("la próxima cita se busca en TODOS sus contactos", () => {
    const d = declaracion(AGENDA, "proximaCita");
    esperar(!!d).verdadero("desapareció proximaCita");
    esperar(/citasDePersona\(/.test(d)).verdadero(
      "proximaCita volvió a mirar un solo contacto: la cita del otro canal deja de existir para el bot",
    );
    esperar(/\.eq\("contact_id"/.test(d)).falso(
      "proximaCita vuelve a filtrar por un contacto suelto",
    );
  });

  test("se unen por lo que YA está guardado, nunca por lo que teclean", () => {
    /* Si se buscara por un correo escrito en el chat, «revisa la cita de
     * fulano@correo.com» sería una forma de ver —y cancelar— la cita de otra
     * persona. El dato tiene que haber llegado por ese canal, de esa persona. */
    const d = declaracion(AGENDA, "contactosDeLaMismaPersona");
    esperar(!!d).verdadero("desapareció contactosDeLaMismaPersona");
    const firma = /contactosDeLaMismaPersona\(([\s\S]*?)\)\s*:/.exec(d)?.[1] ?? "";
    esperar(/correo|email|telefono|phone/i.test(firma)).falso(
      "se le puede pasar un correo o un teléfono desde fuera: eso deja ver la cita de otra persona",
    );
    esperar(/from\("contacts"\)[\s\S]*?\.eq\("id", contactoId\)/.test(d)).verdadero(
      "las señas ya no salen de la ficha del que escribe",
    );
  });

  test("leer la agenda es una herramienta propia, en los dos motores", () => {
    for (const [quien, texto] of [["motor de WhatsApp", WA], ["motor web", HERR]]) {
      /* ── SE MIRA EL INTERRUPTOR ENTERO, NO QUE EL NOMBRE APAREZCA ────────
       *
       * Buscar solo `"ver_mis_citas"` era vacuo y el mutante lo demostró:
       * `if (false && quiere.includes("ver_mis_citas"))` deja la herramienta
       * MUERTA y el nombre sigue ahí, así que la regla pasaba en verde.
       * Se exige la condición tal cual, y el `case` que la ejecuta. */
      esperar(/if \(quiere\.includes\("ver_mis_citas"\)\) \{/.test(texto)).verdadero(
        `${quien}: la herramienta ver_mis_citas no se arma — el modelo vuelve a contestar de memoria`,
      );
      esperar(/name: "ver_mis_citas"/.test(texto)).verdadero(`${quien}: falta el esquema de ver_mis_citas`);
      esperar(/case "ver_mis_citas":/.test(texto)).verdadero(
        `${quien}: la herramienta se ofrece y nadie la ejecuta`,
      );
    }
    esperar(/accion === "mis_citas"/.test(RUTA)).verdadero(
      "la ruta del motor no sabe contestar qué citas tiene una persona",
    );
    esperar(/citasDePersona\(/.test(RUTA)).verdadero(
      "la ruta del motor busca las citas de un solo contacto",
    );
  });

  test("la herramienta le PROHÍBE al modelo adivinar", () => {
    /* El fallo no fue no encontrar la cita: fue inventarse por qué. La
     * descripción tiene que cerrarle esa puerta con todas las letras. */
    for (const [quien, texto] of [["motor de WhatsApp", WA], ["motor web", HERR]]) {
      const i = texto.indexOf('name: "ver_mis_citas"');
      esperar(i > 0).verdadero(`${quien}: no se encuentra la herramienta ver_mis_citas`);
      const trozo = texto.slice(i, i + 700);
      esperar(/NO adivines/.test(trozo)).verdadero(
        `${quien}: la descripción no le prohíbe adivinar, que es lo que hizo`,
      );
    }
  });
});

/* ═══════════════════════════════════════════════════════════════════════════
 * NADIE SE QUEDA EN UNA PANTALLA QUE NO ES DE NADIE
 *
 * 6 de septiembre. Se eliminó la cuenta de un cliente desde superadmin —una
 * decisión legítima— y su USUARIO sobrevivió con cero membresías. Al volver a
 * entrar aterrizaba en un panel vacío: sin chatbots, sin conversaciones, sin
 * poder crear nada y sin una frase que lo explicara.
 *
 * Es la MISMA pantalla que veía el equipo de Demandu antes de la 0060, y por el
 * mismo motivo: se preguntaba «¿es de los nuestros?» y, si no, se le dejaba
 * pasar a un sitio que no es de nadie.
 * ═══════════════════════════════════════════════════════════════════════════ */
describe("Nadie se queda sin sitio a donde ir", () => {
  const MARCO = sinComentarios(fs.readFileSync(path.join(SRC, "app/(dashboard)/layout.tsx"), "utf8"));
  const BIENVENIDA = sinComentarios(fs.readFileSync(path.join(SRC, "app/bienvenida/page.tsx"), "utf8"));
  const ACC = sinComentarios(fs.readFileSync(path.join(SRC, "app/bienvenida/actions.ts"), "utf8"));

  test("sin organización, el panel te saca de ahí", () => {
    const i = MARCO.indexOf("getCurrentOrgId())");
    esperar(i > 0).verdadero("el marco del panel dejó de comprobar si hay organización");
    /* ── EL TROZO TERMINA ANTES DE `faltaNombreDelNegocio` ──────────────────
     *
     * Y no es un detalle: unas líneas más abajo hay OTRO `redirect("/bienvenida")`
     * —el de quien entró con Apple y no puso nombre— que no tiene nada que ver
     * con este caso. Cogiendo 700 caracteres a bulto, la regla lo encontraba y
     * pasaba en verde aunque el desvío de «sin organización» ya no existiera.
     * El mutante lo destapó. */
    const fin = MARCO.indexOf("faltaNombreDelNegocio()", i);
    esperar(fin > i).verdadero("cambió el orden del marco: la regla ya no sabe dónde mirar");
    const trozo = MARCO.slice(i, fin);
    esperar(/redirect\("\/panel"\)/.test(trozo)).verdadero(
      "el equipo de Demandu vuelve a caer en el panel de un cliente vacío",
    );
    esperar(/redirect\("\/bienvenida"\)/.test(trozo)).verdadero(
      "quien no tiene ningún negocio vuelve a quedarse en un panel vacío sin explicación",
    );
  });

  test("«bienvenida» NO devuelve al login a quien no tiene negocio", () => {
    /* Era lo que hacía antes, y por eso el cliente rebotaba: iba al login,
     * entraba bien, y volvía al mismo panel vacío. Ahora es la pantalla que le
     * deja crear su negocio. */
    esperar(/crearMiNegocio/.test(BIENVENIDA)).verdadero(
      "la pantalla de bienvenida ya no ofrece crear un negocio a quien no tiene",
    );
    esperar(/equipo_demandu/.test(BIENVENIDA)).verdadero(
      "el equipo de Demandu puede acabar creándose un negocio desde esta pantalla",
    );
  });

  test("el alta NO se reescribe en TypeScript", () => {
    /* La regla que sostiene todo lo demás. Las ocho inserciones viven en
     * `provisionar_negocio` y esta pantalla la llama por RPC. Copiarlas aquí
     * sería tener dos altas distintas — exactamente cómo se perdieron los
     * cuatro atributos base en la 0011. */
    esperar(/rpc\("crear_mi_negocio"/.test(ACC)).verdadero(
      "la pantalla de bienvenida dejó de usar la función de la base para crear el negocio",
    );
    for (const tabla of ["organizations", "pipelines", "conversation_states", "custom_attributes"]) {
      esperar(new RegExp(`from\\("${tabla}"\\)\\s*\\n?\\s*\\.insert`).test(ACC)).falso(
        `el alta se está reescribiendo en TypeScript (${tabla}): vuelve a haber dos definiciones`,
      );
    }
  });
});

/* ═══════════════════════════════════════════════════════════════════════════
 * NO SE DICE «LISTO» SI NO ESTÁ CONECTADO
 *
 * Un cliente nuevo creó su chatbot de Instagram, le dio a conectar, Meta no le
 * dejó —los permisos de Instagram siguen sin revisar— y aun así el asistente
 * terminó con «¡Y listo!». Salió convencido de que funcionaba. No iba a recibir
 * un solo mensaje, y no había una sola pantalla que se lo dijera.
 * ═══════════════════════════════════════════════════════════════════════════ */
describe("Un chatbot sin conectar lo dice", () => {
  const WIZ = sinComentarios(fs.readFileSync(path.join(SRC, "components/bots/NewBotWizard.tsx"), "utf8"));
  const ACC = sinComentarios(fs.readFileSync(path.join(SRC, "app/(dashboard)/bots/actions.ts"), "utf8"));
  const CONEXION = sinComentarios(
    fs.readFileSync(path.join(SRC, "app/(dashboard)/bots/[id]/install/page.tsx"), "utf8"),
  );

  test("el asistente PREGUNTA si quedó conectado", () => {
    /* No lo puede saber solo: conectar es salir a Meta y volver por otra ruta,
     * así que el asistente no ve nada de lo que pasó por el camino. */
    esperar(/canalConectado/.test(WIZ)).verdadero(
      "el asistente volvió a dar por buena la conexión sin preguntar",
    );
    // CON EL PARÉNTESIS. Sin él, renombrarla a `canalConectadoZZ` dejaba la
    // regla en verde: la vieja trampa de comprobar un trozo de palabra.
    esperar(/export async function canalConectado\(/.test(ACC)).verdadero(
      "desapareció la comprobación de si el canal está conectado",
    );
  });

  test("ante la duda se asume que NO está conectado", () => {
    /* El valor inicial es `null` y el fallo cae en `false`. Si el estado
     * arrancara en `true`, el caso bueno sería el que se enseña mientras no se
     * sabe — que es justo la mentira que se está quitando. */
    esperar(/useState<boolean \| null>\(null\)/.test(WIZ)).verdadero(
      "el asistente arranca dando por conectado lo que todavía no ha comprobado",
    );
    esperar(/catch \{\s*setConectado\(false\);/.test(WIZ)).verdadero(
      "si la comprobación falla, el asistente vuelve a decir que está conectado",
    );
  });

  test("el último paso avisa, y el botón lleva a conectar", () => {
    esperar(/conectado === false/.test(WIZ)).verdadero(
      "el asistente ya no distingue el caso «sin conectar»",
    );
    esperar(/todavía NO está conectado|no está conectado/.test(WIZ)).verdadero(
      "el asistente volvió a terminar sin avisar de que el canal está sin conectar",
    );
    esperar(/\/install`/.test(WIZ)).verdadero(
      "al terminar sin conectar ya no se lleva al cliente a la pantalla de Conexión",
    );
  });

  test("la pantalla de Conexión no se calla", () => {
    /* Un botón sin pulsar no es un aviso. */
    esperar(/todavía no está conectado/.test(CONEXION)).verdadero(
      "la pantalla de Conexión vuelve a enseñar solo un botón, sin decir que no está conectado",
    );
  });
});

/* ═══════════════════════════════════════════════════════════════════════════
 * BORRAR UNA CUENTA DICE A QUIÉN DEJA SIN NEGOCIO
 * ═══════════════════════════════════════════════════════════════════════════ */
describe("Borrar una cuenta no deja gente en el aire en silencio", () => {
  const SA = sinComentarios(fs.readFileSync(path.join(SRC, "app/superadmin/clientes/acciones.ts"), "utf8"));

  test("se cuenta a quién se deja sin negocio, ANTES de borrar", () => {
    const i = SA.indexOf("export async function eliminarCliente");
    esperar(i > 0).verdadero("desapareció eliminarCliente");
    const f = SA.slice(i, SA.indexOf("\n}", SA.indexOf("redirect(\"/superadmin/clientes?aviso=", i)));

    /* SE MIDE LA LECTURA DE `memberships`, no cualquier mención de la palabra.
     * Buscar «huerfanos» a secas era vacuo: la bitácora la nombra unas líneas
     * más arriba (`sin_negocio: huerfanos`), así que la primera aparición caía
     * antes del borrado aunque el cálculo entero se hubiera movido detrás. El
     * mutante lo destapó. */
    const iLee = f.indexOf("const { data: suyos }");
    const iBorra = f.indexOf('.delete().eq("id", org)');
    esperar(iLee > 0).verdadero("ya no se leen las membresías para saber a quién se deja sin negocio");
    esperar(iBorra > 0).verdadero("desapareció el borrado");
    esperar(iLee < iBorra).verdadero(
      "se cuenta DESPUÉS de borrar: la cascada ya se llevó las membresías y el número siempre saldría cero",
    );
  });

  test("queda apuntado y se le dice a quien borra", () => {
    esperar(/sin_negocio: huerfanos/.test(SA)).verdadero(
      "la bitácora ya no apunta a cuánta gente dejó sin negocio",
    );
    esperar(/sin negocio/.test(SA)).verdadero(
      "el aviso ya no le dice a quien borra que dejó gente sin negocio",
    );
  });
});

process.exit(await correrPruebas());
