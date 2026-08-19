/**
 * Mini corredor de pruebas, sin dependencias (no podemos instalar paquetes aquí).
 *
 * Las pruebas se REGISTRAN primero y se ejecutan al final, una por una y
 * esperando cada una. Es la parte importante: un corredor que no espera a las
 * pruebas asíncronas reporta "todo bien" aunque estén fallando.
 */
const pendientes = [];
const fallos = [];

export function describe(nombre, fn) {
  const antes = pendientes.length;
  fn();
  // Marca a qué grupo pertenece cada prueba registrada dentro de este describe
  for (let i = antes; i < pendientes.length; i++) pendientes[i].grupo = nombre;
}

export function test(nombre, fn) {
  pendientes.push({ nombre, fn, grupo: "" });
}
/** Igual que `test`: el corredor espera siempre, sea síncrona o no. */
export const testAsync = test;

export function esperar(real) {
  return {
    igual(esperado, msg = "") {
      const a = JSON.stringify(real);
      const b = JSON.stringify(esperado);
      if (a !== b) throw new Error(`${msg}\n      esperaba: ${b}\n      recibió:  ${a}`);
    },
    verdadero(msg = "") {
      if (!real) throw new Error(msg || `esperaba algo verdadero, recibió ${JSON.stringify(real)}`);
    },
    falso(msg = "") {
      if (real) throw new Error(msg || `esperaba algo falso, recibió ${JSON.stringify(real)}`);
    },
    contiene(txt, msg = "") {
      if (!String(real ?? "").includes(txt)) throw new Error(`${msg}\n      "${real}" no contiene "${txt}"`);
    },
    noContiene(txt, msg = "") {
      if (String(real ?? "").includes(txt)) throw new Error(`${msg}\n      "${real}" NO debía contener "${txt}"`);
    },
    mayorQue(n, msg = "") {
      if (!(real > n)) throw new Error(`${msg}\n      ${real} no es mayor que ${n}`);
    },
  };
}

/** Ejecuta todo lo registrado y devuelve el código de salida. */
export async function correrPruebas() {
  let grupoActual = null;
  for (const p of pendientes) {
    if (p.grupo !== grupoActual) {
      grupoActual = p.grupo;
      console.log(`\n\x1b[1m${grupoActual}\x1b[0m`);
    }
    try {
      await p.fn();
      console.log(`  \x1b[32m✓\x1b[0m ${p.nombre}`);
    } catch (e) {
      fallos.push({ grupo: p.grupo, nombre: p.nombre });
      console.log(`  \x1b[31m✗\x1b[0m ${p.nombre}`);
      console.log(`    \x1b[31m${e?.message ?? e}\x1b[0m`);
    }
  }

  console.log("");
  if (fallos.length === 0) {
    console.log(`\x1b[42m\x1b[30m  ${pendientes.length} pruebas, todas pasaron  \x1b[0m`);
    return 0;
  }
  console.log(`\x1b[41m\x1b[37m  ${fallos.length} de ${pendientes.length} pruebas fallaron  \x1b[0m`);
  for (const f of fallos) console.log(`  · ${f.grupo} → ${f.nombre}`);
  return 1;
}

/** Compatibilidad con los archivos que terminan en `process.exit(resumen())`. */
export function resumen() {
  throw new Error("Usa `process.exit(await correrPruebas())` al final del archivo.");
}
