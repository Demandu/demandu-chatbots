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

process.exit(await correrPruebas());
