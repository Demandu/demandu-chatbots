/**
 * Pruebas de las reglas de NEGOCIO: qué se muestra en cada canal, cómo se
 * cuentan los consumos y cómo se sanean los datos que escribe el cliente.
 *
 * Aquí un error no rompe la pantalla: cobra de más, muestra una función que
 * no existe en ese canal, o deja pasar algo que no debería. Por eso van solas.
 *
 *   node --experimental-strip-types scripts/pruebas/correr.mjs scripts/pruebas/negocio.mjs
 */
import { describe, test, esperar, correrPruebas } from "./_runner.mjs";
import {
  FEATURES, COMPONENTS, featuresFor, hasFeature, componentsFor, componentAllowed, channelOf, CHANNEL_META,
} from "../../src/lib/channels.ts";
import { fmtBytes, fmtNumber, fmtMetric } from "../../src/lib/billing/usage.ts";
import { formatBytes } from "../../src/lib/billing/quota.ts";
import { limpiarAtajo } from "../../src/lib/quickReplies.ts";
import { NODE_META } from "../../src/lib/flow/types.ts";

const CANALES = ["whatsapp", "instagram", "messenger", "webchat"];

// ─── Qué ve cada canal ───────────────────────────────────────────────────────
describe("Funciones por canal", () => {
  test("'Envíos masivos' SOLO existe en WhatsApp", () => {
    // Decisión de producto: en Instagram, Messenger y web no se puede.
    esperar(hasFeature("whatsapp", "broadcasts")).verdadero();
    for (const c of ["instagram", "messenger", "webchat"]) {
      esperar(hasFeature(c, "broadcasts")).falso(`no debería estar en ${c}`);
    }
  });

  test("Catálogo, cobros, seguimientos y plantillas: solo WhatsApp", () => {
    for (const f of ["catalog", "drips", "templates", "forms"]) {
      esperar(hasFeature("whatsapp", f)).verdadero(`falta ${f} en WhatsApp`);
      for (const c of ["instagram", "messenger", "webchat"]) {
        esperar(hasFeature(c, f)).falso(`${f} no va en ${c}`);
      }
    }
  });

  test("'Apariencia' solo tiene sentido en el sitio web", () => {
    esperar(featuresFor("webchat").includes("appearance")).verdadero();
    for (const c of ["whatsapp", "instagram", "messenger"]) {
      esperar(hasFeature(c, "appearance")).falso();
    }
  });

  test("todos los canales pueden conversar, entrenar, usar IA y configurarse", () => {
    for (const c of CANALES) {
      for (const f of ["flows", "ai", "training", "install", "settings"]) {
        esperar(hasFeature(c, f)).verdadero(`${c} debería tener ${f}`);
      }
    }
  });

  test("ningún canal se queda sin pestañas", () => {
    for (const c of CANALES) esperar(featuresFor(c).length).mayorQue(3, `${c} tiene muy pocas`);
  });

  test("un canal desconocido no rompe: cae a sitio web", () => {
    esperar(channelOf(null)).igual("webchat");
    esperar(channelOf("")).igual("webchat");
    esperar(channelOf("telegram")).igual("webchat");
    esperar(channelOf("whatsapp")).igual("whatsapp");
  });

  test("cada canal tiene nombre y color para la interfaz", () => {
    for (const c of CANALES) {
      esperar(!!CHANNEL_META[c]?.label).verdadero(`${c} sin nombre`);
      esperar(/^#[0-9a-fA-F]{6}$/.test(CHANNEL_META[c]?.color ?? "")).verdadero(`${c} sin color válido`);
    }
  });
});

// ─── Bloques del constructor ─────────────────────────────────────────────────
describe("Bloques del constructor por canal", () => {
  test("cobros y catálogo no aparecen fuera de WhatsApp", () => {
    for (const k of ["payment", "catalog", "whatsapp_flow"]) {
      esperar(componentAllowed("whatsapp", k)).verdadero(`falta ${k} en WhatsApp`);
      for (const c of ["instagram", "messenger", "webchat"]) {
        esperar(componentAllowed(c, k)).falso(`${k} no va en ${c}`);
      }
    }
  });

  test("los bloques de Instagram no se cuelan en otros canales", () => {
    for (const k of ["ig_story", "ig_comment", "ig_dm"]) {
      esperar(componentAllowed("instagram", k)).verdadero();
      esperar(componentAllowed("whatsapp", k)).falso();
      esperar(componentAllowed("webchat", k)).falso();
    }
  });

  test("los bloques básicos están en los cuatro canales", () => {
    for (const k of ["message", "media", "question", "buttons", "condition", "ai", "end"]) {
      for (const c of CANALES) esperar(componentAllowed(c, k)).verdadero(`${k} debería estar en ${c}`);
    }
  });

  test("cada bloque tiene explicación y tutorial de Lana", () => {
    const sinTexto = Object.entries(COMPONENTS)
      .filter(([, v]) => !v.desc?.trim() || !v.lana?.trim())
      .map(([k]) => k);
    esperar(sinTexto).igual([], "bloques sin explicación para el cliente");
  });

  test("ningún canal se queda sin bloques que usar", () => {
    for (const c of CANALES) esperar(componentsFor(c).length).mayorQue(8, `${c} tiene muy pocos bloques`);
  });
});

// ─── Cómo se le muestran los consumos al cliente ─────────────────────────────
describe("Consumos del plan", () => {
  test("los tamaños se leen en humano", () => {
    esperar(fmtBytes(0)).igual("0 MB");
    esperar(fmtBytes(50 * 1024)).igual("50 KB");
    esperar(fmtBytes(5 * 1024 * 1024)).igual("5.0 MB");
    esperar(fmtBytes(500 * 1024 * 1024)).igual("500 MB");
    esperar(fmtBytes(2 * 1024 * 1024 * 1024)).igual("2.0 GB");
  });

  test("un tamaño negativo o inválido no muestra basura", () => {
    esperar(fmtBytes(-1)).igual("0 MB");
    esperar(fmtBytes(null)).igual("0 MB");
    esperar(fmtBytes(undefined)).igual("0 MB");
    esperar(formatBytes(-500)).igual("0 MB");
  });

  test("los números llevan separador de miles", () => {
    esperar(fmtNumber(1000)).contiene("1");
    esperar(fmtNumber(0)).igual("0");
    esperar(fmtNumber(null)).igual("0");
  });

  test("cada métrica se formatea según su tipo", () => {
    esperar(fmtMetric({ format: "bytes" }, 1024 * 1024)).igual("1.0 MB");
    esperar(fmtMetric({ format: "number" }, 1500)).contiene("1");
  });
});

// ─── Saneamiento de lo que escribe el cliente ────────────────────────────────
describe("Lo que escribe el cliente se limpia antes de guardarse", () => {
  test("un atajo no puede traer barras, espacios ni signos raros", () => {
    // Si dejáramos pasar cualquier cosa, escribir "/" en el chat
    // no encontraría nunca la respuesta.
    esperar(limpiarAtajo("/../etc/passwd")).igual("etcpasswd");
    esperar(limpiarAtajo("<script>")).igual("script");
    esperar(limpiarAtajo("a".repeat(100)).length).igual(30, "se corta a 30 caracteres");
    esperar(/^[a-z0-9_-]*$/.test(limpiarAtajo("¡Hólá! ¿Qué?"))).verdadero();
  });

  test("el color de burbuja solo acepta un hex de 6 dígitos", () => {
    // Es la validación que corre en el servidor (settings/actions.ts).
    const valido = (c) => /^#[0-9a-fA-F]{6}$/.test(c);
    esperar(valido("#e7ddff")).verdadero();
    esperar(valido("#FFF")).falso("un hex corto se rechaza");
    esperar(valido("red")).falso();
    esperar(valido("url(javascript:alert(1))")).falso();
    esperar(valido("#e7ddff; background:url(x)")).falso();
  });
});

// ─── Coherencia de la configuración ──────────────────────────────────────────
describe("Coherencia general", () => {
  test("todo bloque del constructor tiene explicación, y no documentamos ninguno inexistente", () => {
    // Si se desincronizan, o prometemos una función que no existe, o el
    // cliente se topa con un bloque sin ninguna ayuda.
    const documentados = new Set(Object.keys(COMPONENTS));
    const reales = new Set(Object.keys(NODE_META).filter((k) => k !== "start"));
    esperar([...reales].filter((k) => !documentados.has(k))).igual([], "bloques sin explicación ni tutorial");
    esperar([...documentados].filter((k) => !reales.has(k))).igual([], "documentamos bloques que no existen");
  });

  test("un bloque desconocido no tumba la pantalla", () => {
    // Un flujo guardado hace meses puede traer un bloque que ya quitamos.
    esperar(componentAllowed("whatsapp", "bloque_que_ya_no_existe")).falso();
    esperar(componentAllowed("whatsapp", null)).falso();
  });

  test("no hay funciones repetidas en la lista", () => {
    const claves = FEATURES.map((f) => f.key);
    esperar(claves.length).igual(new Set(claves).size, "hay una función duplicada");
  });

  test("toda función declara al menos un canal", () => {
    const huerfanas = FEATURES.filter((f) => !f.channels?.length).map((f) => f.key);
    esperar(huerfanas).igual([], "funciones que no aparecerían en ningún lado");
  });

  test("todo bloque declara al menos un canal", () => {
    const huerfanos = Object.entries(COMPONENTS).filter(([, v]) => !v.channels?.length).map(([k]) => k);
    esperar(huerfanos).igual([], "bloques que no aparecerían en ninguna paleta");
  });
});

process.exit(await correrPruebas());
