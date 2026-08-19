/**
 * Pruebas del EMBUDO: cómo se lee una tarjeta y qué pasa al arrastrarla.
 *
 * Arrastrar es lo más fácil de romper de toda la plataforma: la tarjeta se
 * mueve en pantalla ANTES de que la base conteste, así que si el cálculo de
 * posición está mal, el cliente ve una cosa y la base guarda otra.
 *
 *   node --experimental-strip-types scripts/pruebas/correr.mjs scripts/pruebas/crm.mjs
 */
import { describe, test, esperar, correrPruebas } from "./_runner.mjs";
import {
  dinero, hace, vencimiento, alerta, nombreTarjeta, iniciales,
  vecinos, moverEnMemoria, fechaDeAtajo, tableroVacio,
} from "../../src/lib/crm.ts";

// ─── Un tablero de mentira, como el que devuelve la base ────────────────────
const tarjeta = (id, extra = {}) => ({
  id, titulo: `Lead ${id}`, importe: null, moneda: "MXN", sort: Number(id.slice(1)) * 10,
  status: "abierta", canal: "whatsapp", created_at: "", updated_at: "",
  contacto: null, wa_name: null, telefono: null, email: null, pais: null,
  responsable: null, assignee_member_id: null, tarea: null, tarea_para: null, tarea_id: null,
  sin_proximo_paso: true, tarea_vencida: false, dias_quieta: 0,
  conversation_id: null, unread: 0, contact_id: null, ...extra,
});

const tableroDePrueba = () => ({
  ...tableroVacio(),
  columnas: [
    { id: "nuevo", nombre: "Nuevo", color: "#00f", tipo: "abierto", orden: 1, total: 3, importe: 0,
      tarjetas: [tarjeta("a3"), tarjeta("a2"), tarjeta("a1")] },   // de mayor a menor sort
    { id: "ganada", nombre: "Ganada", color: "#0f0", tipo: "ganado", orden: 9, total: 0, importe: 0,
      tarjetas: [] },
  ],
});

// ─── Cómo se lee una tarjeta ────────────────────────────────────────────────
describe("Embudo: cómo se lee una tarjeta", () => {
  test("el dinero se ve como dinero, y sin valor NO se inventa un $0", () => {
    // Pintar "$0" en una tarjeta sin importe hace creer que la venta vale cero.
    esperar(dinero(null)).igual("");
    esperar(dinero(undefined)).igual("");
    esperar(dinero(0)).contiene("0");
    esperar(dinero(28000).replace(/\s|,/g, "")).contiene("28000");
    esperar(dinero(1500, "MONEDA_QUE_NO_EXISTE").length).mayorQue(0, "una moneda rara no debe reventar");
  });

  test("el tiempo se dice en palabras", () => {
    esperar(hace(0)).igual("hoy");
    esperar(hace(1)).igual("ayer");
    esperar(hace(5)).igual("hace 5 días");
    esperar(hace(45)).igual("hace 1 mes");
    esperar(hace(200)).igual("hace 6 meses");
    esperar(hace(null)).igual("hoy");
  });

  test("una tarea 'para hoy' NO aparece vencida a media tarde", () => {
    // Se compara por DÍA, no por instante. Si no, una tarea de las 9:00 saldría
    // en rojo a las 9:01 y el vendedor deja de creerle a la alerta.
    const hoy = new Date(2026, 7, 18, 15, 0);
    esperar(vencimiento(new Date(2026, 7, 18, 9, 0).toISOString(), hoy).estado).igual("hoy");
    esperar(vencimiento(new Date(2026, 7, 17, 9, 0).toISOString(), hoy).estado).igual("vencida");
    esperar(vencimiento(new Date(2026, 7, 19, 9, 0).toISOString(), hoy).texto).igual("mañana");
    esperar(vencimiento(null, hoy).estado).igual("sin_fecha");
    esperar(vencimiento("no es una fecha", hoy).estado).igual("sin_fecha");
  });

  test("la alerta prioriza lo urgente y calla en las ventas cerradas", () => {
    esperar(alerta(tarjeta("a1", { tarea_vencida: true }))?.texto).igual("Tarea vencida");
    esperar(alerta(tarjeta("a1", { sin_proximo_paso: true }))?.texto).igual("Sin próximo paso");
    // Vencida manda sobre sin-próximo-paso
    esperar(alerta(tarjeta("a1", { tarea_vencida: true, sin_proximo_paso: true }))?.texto)
      .igual("Tarea vencida");
    // Una venta ya ganada no tiene por qué pedir un próximo paso
    esperar(alerta(tarjeta("a1", { status: "ganada", sin_proximo_paso: true }))).igual(null);
    esperar(alerta(tarjeta("a1", { sin_proximo_paso: false }))).igual(null);
  });

  test("siempre hay un nombre que mostrar", () => {
    esperar(nombreTarjeta({ titulo: "Cotización oficina" })).igual("Cotización oficina");
    esperar(nombreTarjeta({ titulo: "  ", contacto: "Ana" })).igual("Ana");
    esperar(nombreTarjeta({ titulo: "", contacto: "", wa_name: "", telefono: "5210000000" })).igual("5210000000");
    esperar(nombreTarjeta({})).igual("Sin nombre");
  });

  test("las iniciales no revientan con nombres raros", () => {
    esperar(iniciales("Ana López")).igual("AL");
    esperar(iniciales("Ana")).igual("A");
    esperar(iniciales("  ")).igual("?");
    esperar(iniciales("")).igual("?");
  });
});

// ─── Arrastrar ──────────────────────────────────────────────────────────────
describe("Embudo: arrastrar una tarjeta", () => {
  test("los vecinos salen de la columna DESTINO, sin contarse a sí misma", () => {
    const lista = [{ id: "a3" }, { id: "a2" }, { id: "a1" }];
    // Al tope
    esperar(vecinos(lista, 0, "zzz")).igual({ antes: null, despues: "a3" });
    // En medio
    esperar(vecinos(lista, 2, "zzz")).igual({ antes: "a2", despues: "a1" });
    // Al fondo
    esperar(vecinos(lista, 3, "zzz")).igual({ antes: "a1", despues: null });
  });

  test("una tarjeta no se toma a sí misma como vecina", () => {
    // Si se contara, la base calcularía el punto medio entre ella y ella misma
    // y la tarjeta se quedaría clavada donde estaba.
    const lista = [{ id: "a3" }, { id: "a2" }, { id: "a1" }];
    esperar(vecinos(lista, 1, "a2")).igual({ antes: "a3", despues: "a1" });
  });

  test("un índice fuera de rango no rompe nada", () => {
    const lista = [{ id: "a1" }];
    esperar(vecinos(lista, 99, "zzz")).igual({ antes: "a1", despues: null });
    esperar(vecinos(lista, -5, "zzz")).igual({ antes: null, despues: "a1" });
    esperar(vecinos([], 0, "zzz")).igual({ antes: null, despues: null });
  });

  test("mover a la columna 'Ganada' marca la tarjeta como ganada al instante", () => {
    // El cliente tiene que ver el cambio antes de que conteste la base.
    const t = moverEnMemoria(tableroDePrueba(), "a2", "ganada", 0);
    const ganadas = t.columnas.find((c) => c.id === "ganada");
    esperar(ganadas.tarjetas.length).igual(1);
    esperar(ganadas.tarjetas[0].status).igual("ganada");
    esperar(t.columnas.find((c) => c.id === "nuevo").tarjetas.length).igual(2);
  });

  test("los contadores de cada columna se ajustan solos", () => {
    const t = moverEnMemoria(tableroDePrueba(), "a2", "ganada", 0);
    esperar(t.columnas.find((c) => c.id === "nuevo").total).igual(2);
    esperar(t.columnas.find((c) => c.id === "ganada").total).igual(1);
    esperar(t.resumen.ganadas).igual(1);
    esperar(t.resumen.abiertas).igual(2);
  });

  test("una columna con más tarjetas de las que caben no pierde la cuenta", () => {
    // El servidor manda 50 por columna. Si el contador se calculara con el
    // largo de la lista visible, mover una tarjeta borraría 300 de un plumazo.
    const base = tableroDePrueba();
    base.columnas[0].total = 320;             // hay 320, se ven 3
    const t = moverEnMemoria(base, "a2", "ganada", 0);
    esperar(t.columnas.find((c) => c.id === "nuevo").total).igual(319);
  });

  test("mover una tarjeta que no existe deja el tablero igual", () => {
    const base = tableroDePrueba();
    esperar(moverEnMemoria(base, "no-existe", "ganada", 0)).igual(base);
  });

  test("mover NO modifica el tablero original", () => {
    // Se devuelve uno nuevo: si se mutara el que está en pantalla, React no
    // repintaría y el arrastre se vería congelado.
    const base = tableroDePrueba();
    const antes = base.columnas[0].tarjetas.length;
    moverEnMemoria(base, "a2", "ganada", 0);
    esperar(base.columnas[0].tarjetas.length).igual(antes, "se mutó el tablero original");
  });

  test("el importe en juego se recalcula al mover", () => {
    const base = tableroDePrueba();
    base.columnas[0].tarjetas = [tarjeta("a1", { importe: 1000 }), tarjeta("a2", { importe: 500 })];
    base.columnas[0].total = 2;
    const t = moverEnMemoria(base, "a1", "ganada", 0);
    esperar(t.resumen.importe_ganado).igual(1000);
    esperar(t.resumen.importe_abierto).igual(500);
  });
});

// ─── Agendar el próximo paso ────────────────────────────────────────────────
describe("Embudo: agendar el próximo paso", () => {
  const AHORA = new Date(2026, 7, 18, 15, 30);

  test("los atajos caen en el día correcto y a una hora laboral", () => {
    esperar(fechaDeAtajo("hoy", AHORA).getDate()).igual(18);
    esperar(fechaDeAtajo("hoy", AHORA).getHours()).igual(18, "hoy queda para el final del día");
    esperar(fechaDeAtajo("manana", AHORA).getDate()).igual(19);
    esperar(fechaDeAtajo("manana", AHORA).getHours()).igual(9, "no se agenda a medianoche");
    esperar(fechaDeAtajo("3d", AHORA).getDate()).igual(21);
    esperar(fechaDeAtajo("semana", AHORA).getDate()).igual(25);
  });

  test("un atajo desconocido cae en mañana, no en una fecha inválida", () => {
    const d = fechaDeAtajo("cualquier-cosa", AHORA);
    esperar(Number.isNaN(d.getTime())).falso();
    esperar(d.getDate()).igual(19);
  });

  test("cruzar el fin de mes funciona", () => {
    const finDeMes = new Date(2026, 7, 30, 10, 0);   // 30 de agosto
    esperar(fechaDeAtajo("3d", finDeMes).getMonth()).igual(8, "debe pasar a septiembre");
    esperar(fechaDeAtajo("3d", finDeMes).getDate()).igual(2);
  });
});

process.exit(await correrPruebas());
