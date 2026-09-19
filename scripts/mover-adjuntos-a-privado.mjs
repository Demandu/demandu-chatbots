/**
 * MUDANZA DE LOS ADJUNTOS QUE NUNCA DEBIERON SER PÚBLICOS.
 *
 *   node scripts/mover-adjuntos-a-privado.mjs            → dice qué haría
 *   node scripts/mover-adjuntos-a-privado.mjs --aplicar  → lo hace
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * EL CÓDIGO YA NO CREA ADJUNTOS PÚBLICOS. ESTO ES PARA LOS DE ANTES.
 *
 * Lo que sube un cliente a una conversación y lo que sube un negocio como
 * material de entrenamiento vivían en el almacén `media`, que es público: con
 * la dirección en la mano los abría cualquiera, sin sesión, sin caducidad y sin
 * dejar rastro. Cambiar el código arregla los que vengan; estos hay que
 * moverlos a mano.
 *
 * QUÉ SE MUEVE Y QUÉ NO. Solo las carpetas de personas:
 *
 *   <cuenta>/inbox/…          lo que adjunta el agente en la Bandeja
 *   <cuenta>/whatsapp/…       lo que manda el cliente por WhatsApp
 *   <cuenta>/instagram/…      lo mismo por Instagram
 *   <cuenta>/entrenamiento/…  los documentos con que se entrena el bot
 *
 * Lo del constructor —`<cuenta>/<archivo>`, sin carpeta— SE QUEDA PÚBLICO a
 * propósito: esa dirección está escrita dentro de los flujos guardados de todos
 * los clientes y la pide el widget web sin sesión ninguna. Ver la cabecera de
 * `src/lib/adjuntos.ts`.
 *
 * SE MUEVE, NO SE COPIA. Copiar dejaría el original público donde está, que es
 * justo el agujero. `move` del almacén lo hace de un golpe, del lado del
 * servidor. Es IRREVERSIBLE: la dirección pública de ese archivo deja de
 * funcionar para siempre, también para quien la tuviera guardada.
 *
 * Y SE ARREGLA LO QUE APUNTABA AL ARCHIVO. Si se moviera el archivo sin tocar
 * la base de datos, la pantalla buscaría en `media` algo que ya está en
 * `privado` y el adjunto desaparecería de la vista. Por eso, en la misma
 * pasada, `bot_knowledge.source_url` pasa a la forma nueva `privado/<ruta>`.
 *
 * SE PUEDE CORRER DOS VECES. Lo que ya está en `privado` no aparece en la lista
 * de `media`, así que la segunda pasada no encuentra nada que mover.
 * ─────────────────────────────────────────────────────────────────────────────
 */
import fs from "node:fs";
import path from "node:path";

const RAIZ = path.resolve(import.meta.dirname, "..");
const APLICAR = process.argv.includes("--aplicar");

/** Las carpetas que guardan cosas de personas, no contenido del negocio. */
const CARPETAS = ["inbox", "whatsapp", "instagram", "entrenamiento"];

// ─── Las llaves, del entorno y nunca de un argumento ─────────────────────────
//
// Escribirlas en la línea de comandos las dejaría en el historial del terminal.
function delEntorno(nombre) {
  if (process.env[nombre]) return process.env[nombre];
  const archivo = path.join(RAIZ, ".env.local");
  if (!fs.existsSync(archivo)) return "";
  for (const linea of fs.readFileSync(archivo, "utf8").split("\n")) {
    const i = linea.indexOf("=");
    if (i > 0 && linea.slice(0, i).trim() === nombre) {
      return linea.slice(i + 1).trim().replace(/^["']|["']$/g, "");
    }
  }
  return "";
}

const URL_BASE = delEntorno("NEXT_PUBLIC_SUPABASE_URL").replace(/\/+$/, "");
const LLAVE = delEntorno("SUPABASE_SERVICE_ROLE_KEY");

if (!URL_BASE || !LLAVE) {
  console.error(
    "Faltan NEXT_PUBLIC_SUPABASE_URL o SUPABASE_SERVICE_ROLE_KEY. Se leen de " +
      ".env.local o del entorno; no se pasan por argumento.",
  );
  process.exit(1);
}

const cabeceras = {
  apikey: LLAVE,
  Authorization: `Bearer ${LLAVE}`,
  "Content-Type": "application/json",
};

async function almacen(ruta, cuerpo) {
  const r = await fetch(`${URL_BASE}/storage/v1${ruta}`, {
    method: "POST",
    headers: cabeceras,
    body: JSON.stringify(cuerpo),
  });
  const texto = await r.text();
  if (!r.ok) throw new Error(`${r.status} ${texto.slice(0, 200)}`);
  return texto ? JSON.parse(texto) : null;
}

/** Todo lo que hay dentro de una carpeta del almacén, recorriéndola entera. */
async function listarHasta(bucket, prefijo, hondo = 0) {
  if (hondo > 6) return [];
  const hijos = await almacen(`/object/list/${bucket}`, {
    prefix: prefijo,
    limit: 1000,
    offset: 0,
    sortBy: { column: "name", order: "asc" },
  });
  const salida = [];
  for (const h of hijos ?? []) {
    const nombre = prefijo ? `${prefijo}/${h.name}` : h.name;
    // Sin `id` es una carpeta, no un archivo.
    if (h.id) salida.push({ nombre, bytes: h.metadata?.size ?? 0 });
    else salida.push(...(await listarHasta(bucket, nombre, hondo + 1)));
  }
  return salida;
}

const esDePersonas = (nombre) => {
  const trozos = nombre.split("/");
  return trozos.length >= 3 && CARPETAS.includes(trozos[1]);
};

async function principal() {
  const todos = await listarHasta("media", "");
  const mudarse = todos.filter((a) => esDePersonas(a.nombre));

  console.log(`\nEn 'media' hay ${todos.length} archivos; ${mudarse.length} son de personas.\n`);
  if (!mudarse.length) {
    console.log("No queda nada que mover.");
    return;
  }

  for (const a of mudarse) console.log(`  ${a.nombre}  (${Math.round(a.bytes / 1024)} kB)`);

  if (!APLICAR) {
    console.log(
      "\nEsto es un ensayo: no se ha tocado nada.\n" +
        "Para hacerlo de verdad: node scripts/mover-adjuntos-a-privado.mjs --aplicar\n" +
        "Es irreversible —la dirección pública de cada uno deja de funcionar— y eso " +
        "es exactamente lo que se busca.",
    );
    return;
  }

  let movidos = 0;
  const hechos = [];
  for (const a of mudarse) {
    try {
      await almacen("/object/move", {
        bucketId: "media",
        sourceKey: a.nombre,
        destinationBucket: "privado",
        destinationKey: a.nombre,
      });
      movidos++;
      hechos.push(a.nombre);
      console.log(`  ✓ ${a.nombre}`);
    } catch (e) {
      console.error(`  ✗ ${a.nombre}: ${e.message}`);
    }
  }

  // ─── Y lo que apuntaba al archivo apunta a donde está ahora ────────────────
  let arreglados = 0;
  for (const ruta of hechos) {
    const vieja = `${URL_BASE}/storage/v1/object/public/media/${ruta}`;
    const r = await fetch(
      `${URL_BASE}/rest/v1/bot_knowledge?source_url=eq.${encodeURIComponent(vieja)}`,
      {
        method: "PATCH",
        headers: { ...cabeceras, Prefer: "return=representation" },
        body: JSON.stringify({ source_url: `privado/${ruta}` }),
      },
    );
    if (r.ok) arreglados += ((await r.json()) ?? []).length;
    else console.error(`  ! no pude arreglar bot_knowledge de ${ruta}: ${r.status}`);
  }

  console.log(
    `\nMovidos ${movidos} de ${mudarse.length}. Arregladas ${arreglados} filas de bot_knowledge.`,
  );
}

principal().catch((e) => {
  console.error(e);
  process.exit(1);
});
