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

  test("la marca de lectura solo avanza", () => {
    // Dos respuestas desordenadas podrían hacerla retroceder, y el sondeo
    // repetiría mensajes ya pintados.
    esperar(wid.includes("function avanzar")).verdadero("la marca podría retroceder y duplicar mensajes");
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
    esperar(wa.includes("diagnostico")).falso("el motor de WhatsApp no debe pedir diagnóstico");
  });
});

process.exit(await correrPruebas());
