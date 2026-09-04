#!/usr/bin/env node
/**
 * Genera el «secreto de cliente» que pide Supabase para Entrar con Apple.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * APPLE NO DA UN SECRETO: DA UNA LLAVE, Y EL SECRETO HAY QUE FIRMARLO. Es la
 * diferencia con Facebook y la razón de que este archivo exista. Lo que se pega
 * en Supabase es un JWT firmado con la llave `.p8` que Apple deja descargar UNA
 * SOLA VEZ.
 *
 * SE CORRE EN TU COMPUTADORA Y LA LLAVE NO SALE DE AHÍ. No la subas al
 * repositorio, no la pegues en un chat y no la mandes por correo: quien tenga
 * ese archivo puede firmar accesos a nombre de Demandu.
 *
 * ── LA TRAMPA QUE ROMPE ESTO A LOS SEIS MESES ──────────────────────────────
 *
 * Apple NO permite que el secreto dure más de seis meses. Cuando caduca, el
 * botón «Continuar con Apple» sigue apareciendo, la pantalla de Apple sigue
 * saliendo, y el acceso falla al final — sin ningún aviso y sin que nada en la
 * plataforma haya cambiado. Es de los fallos más difíciles de diagnosticar
 * porque parece que se rompió otra cosa.
 *
 * Por eso este programa te dice EN QUÉ FECHA caduca y te recuerda apuntar esa
 * fecha en la variable `APPLE_SECRETO_EXPIRA` de Netlify: la pantalla de Estado
 * avisa con un mes de antelación.
 *
 * ── CÓMO SE USA ────────────────────────────────────────────────────────────
 *
 *   node scripts/apple-secreto.mjs \
 *     --p8 ~/Downloads/AuthKey_ABC1234567.p8 \
 *     --equipo TU_TEAM_ID \
 *     --llave ABC1234567 \
 *     --servicio tech.demandu.plataforma
 *
 * Los cuatro datos salen de developer.apple.com:
 *   · equipo   → arriba a la derecha, junto a tu nombre (10 caracteres).
 *   · llave    → el Key ID de la llave «Sign in with Apple» que creaste.
 *   · servicio → el identificador del Services ID (NO el del App ID).
 *   · p8       → el archivo que Apple te dejó descargar al crear la llave.
 * ─────────────────────────────────────────────────────────────────────────────
 */

import crypto from "node:crypto";
import fs from "node:fs";

/** Seis meses menos un día: Apple rechaza exactamente seis meses por redondeo. */
const DURACION_SEG = 180 * 24 * 60 * 60;

function leerArgumentos(argv) {
  const out = {};
  for (let i = 2; i < argv.length; i += 2) {
    const k = String(argv[i] ?? "").replace(/^--/, "");
    out[k] = argv[i + 1];
  }
  return out;
}

/** base64url, que es lo que usan los JWT: sin +, sin / y sin relleno. */
const b64 = (buf) =>
  Buffer.from(buf).toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");

function main() {
  const a = leerArgumentos(process.argv);
  const faltan = ["p8", "equipo", "llave", "servicio"].filter((k) => !a[k]);

  if (faltan.length) {
    console.error(`\nFalta: ${faltan.join(", ")}\n`);
    console.error("Ejemplo:");
    console.error("  node scripts/apple-secreto.mjs \\");
    console.error("    --p8 ~/Downloads/AuthKey_ABC1234567.p8 \\");
    console.error("    --equipo TU_TEAM_ID --llave ABC1234567 \\");
    console.error("    --servicio tech.demandu.plataforma\n");
    process.exit(1);
  }

  let llave;
  try {
    llave = fs.readFileSync(a.p8.replace(/^~/, process.env.HOME ?? "~"), "utf8");
  } catch {
    console.error(`\nNo pude leer la llave en ${a.p8}\n`);
    process.exit(1);
  }

  // Se comprueba la forma ANTES de firmar: si se le pasa el archivo equivocado
  // —el certificado, o un .p8 de otro servicio de Apple— el error de la
  // librería no dice cuál es el problema y se pierde media hora.
  if (!llave.includes("BEGIN PRIVATE KEY")) {
    console.error("\nEse archivo no parece la llave de Apple: debería empezar por «-----BEGIN PRIVATE KEY-----».\n");
    process.exit(1);
  }

  const ahora = Math.floor(Date.now() / 1000);
  const expira = ahora + DURACION_SEG;

  const cabecera = { alg: "ES256", kid: a.llave };
  const cuerpo = {
    iss: a.equipo,
    iat: ahora,
    exp: expira,
    aud: "https://appleid.apple.com",
    sub: a.servicio,
  };

  const sinFirma = `${b64(JSON.stringify(cabecera))}.${b64(JSON.stringify(cuerpo))}`;

  // `ieee-p1363` NO ES OPCIONAL. Node firma en DER por defecto, y un JWT ES256
  // necesita la firma cruda (R||S). Con DER, Apple contesta «invalid_client» —
  // un mensaje que hace pensar que el Services ID está mal cuando lo que está
  // mal es el formato de la firma.
  const firma = crypto.sign("SHA256", Buffer.from(sinFirma), {
    key: llave,
    dsaEncoding: "ieee-p1363",
  });

  const jwt = `${sinFirma}.${b64(firma)}`;
  const cuando = new Date(expira * 1000);
  const fecha = cuando.toISOString().slice(0, 10);

  console.log("\n─── SECRETO DE CLIENTE (pégalo en Supabase → Auth → Providers → Apple) ───\n");
  console.log(jwt);
  console.log("\n─── Y LO QUE NO HAY QUE OLVIDAR ─────────────────────────────────────────\n");
  console.log(`  Services ID (va en «Client IDs»):  ${a.servicio}`);
  console.log(`  CADUCA EL:                         ${fecha}`);
  console.log("");
  console.log("  Pon esa fecha en Netlify como  APPLE_SECRETO_EXPIRA=" + fecha);
  console.log("  La pantalla de Estado avisa un mes antes. Sin eso, el día que");
  console.log("  caduque el botón de Apple deja de funcionar sin ningún aviso.\n");
}

main();
