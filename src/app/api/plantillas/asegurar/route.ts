import { createAdminClient } from "@/lib/supabase/admin";
import { llamadaDeTareaProgramada } from "@/lib/cron";
import { sincronizarPlantillas } from "@/lib/whatsapp/sincronizarPlantillas";
import { asegurarPlantillas, lasQueFaltan } from "@/lib/whatsapp/mandarDeLaCasa";
import { PARA_LA_AGENDA } from "@/lib/whatsapp/plantillasDeLaCasa";

export const dynamic = "force-dynamic";

/**
 * QUE LAS PLANTILLAS DE LA CASA ESTÉN, MIRE QUIEN MIRE Y HAGA LO QUE HAGA EL CLIENTE.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * ESTA TAREA MIRA EL ESTADO, NO EL EVENTO. Y esa es toda la idea.
 *
 * Hasta hoy la plantilla del recordatorio se mandaba a Meta en UN momento
 * concreto: al terminar de conectar Google o Calendly. Eso deja tres huecos que
 * nadie ve:
 *
 *   · Quien conecta la agenda ANTES que WhatsApp recibe un «sin WhatsApp» y
 *     NADIE lo reintenta nunca. Se queda sin recordatorios para siempre.
 *   · La agenda propia que viene no tiene vuelta de OAuth donde engancharse:
 *     el día que llegue, el disparador desaparece sin que nadie lo note.
 *   · Y si Meta rechaza, el motivo se escribe en un registro que nadie lee.
 *
 * Es el mismo razonamiento que ya está escrito en `/api/correos/bienvenida`:
 * enganchar en el momento de la acción obliga a que CADA puerta nueva se
 * acuerde de enganchar también, y un día una no se acuerda. Preguntar «¿quién
 * tiene WhatsApp y le falta su plantilla?» los coge a todos, vengan por donde
 * vengan, hoy y con las puertas que se añadan mañana.
 *
 * ── LA CONDICIÓN ES «TIENE WHATSAPP», NO «TIENE AGENDA» ───────────────────
 *
 * Podría pedirse además que tenga la agenda encendida. No se hace a propósito:
 * es una plantilla, se aprueba gratis, y el tope de Meta son 6.000. Atarla a
 * «tiene agenda» es volver a acoplarla a un estado que cambia de forma —hoy es
 * Google, mañana la agenda propia— y ése es exactamente el acoplamiento que
 * dejó a media plataforma sin plantilla.
 *
 * ── LO RECHAZADO NO SE REINTENTA ──────────────────────────────────────────
 *
 * `lasQueFaltan` solo devuelve las que NO están. Una rechazada está: se ve en
 * pantalla con su motivo y se arregla a mano. Reintentarla cada cuarto de hora
 * sería pedirle a Meta lo mismo cien veces al día para que conteste lo mismo.
 * ─────────────────────────────────────────────────────────────────────────────
 */

/** Cuántas cuentas por vuelta. Cada una son dos llamadas a Meta como mucho. */
const POR_VUELTA = 25;

export async function POST(req: Request) {
  if (!(await llamadaDeTareaProgramada(req, "plantillas_de_la_casa"))) {
    return Response.json({ error: "no autorizado" }, { status: 401 });
  }

  const admin = createAdminClient();

  const { data: canales, error } = await admin
    .from("whatsapp_channels")
    .select("org_id, bot_id, waba_id, access_token")
    .not("waba_id", "is", null)
    .not("access_token", "is", null)
    .order("updated_at", { ascending: true })
    .limit(POR_VUELTA);

  if (error) {
    console.error("[plantillas] no pude leer los canales:", error.message);
    return Response.json({ error: "no se pudo leer" }, { status: 500 });
  }

  let sincronizadas = 0;
  let mandadas = 0;
  let cuentas = 0;
  const problemas: string[] = [];

  for (const c of (canales ?? []) as any[]) {
    if (!c.waba_id || !c.access_token || !c.bot_id || !c.org_id) continue;
    cuentas++;

    // 1) Traerse la verdad de Meta. Esto solo arregla lo que ya sabemos que
    //    existe; sirve también de red por si se perdió un aviso del motor.
    const r = await sincronizarPlantillas(admin, {
      orgId: String(c.org_id),
      botId: String(c.bot_id),
      wabaId: String(c.waba_id),
      token: String(c.access_token),
    });
    if (r.error) problemas.push(`${c.org_id}: ${r.error}`);
    sincronizadas += r.guardadas;

    /* 2) Y MANDAR LO QUE FALTE. Va DESPUÉS de sincronizar a propósito: si se
     *    preguntara antes, una plantilla que ya está en Meta pero todavía no
     *    en nuestra tabla se mandaría otra vez — Meta contestaría «ya existe»
     *    y no rompería nada, pero es una llamada por cuenta y por vuelta para
     *    no enterarse de nada. */
    const faltan = await lasQueFaltan(admin, String(c.org_id), PARA_LA_AGENDA);
    if (!faltan.length) continue;

    const salida = await asegurarPlantillas(admin, String(c.org_id), faltan);
    for (const s of salida) {
      if (s.estado === "creada") mandadas++;
      else if (s.estado === "rechazada" || s.estado === "no_se_pudo") {
        problemas.push(`${c.org_id}/${s.plantilla}: ${s.detalle ?? s.estado}`);
      }
    }
  }

  // Los problemas van en la respuesta además de en el registro: la respuesta
  // de la tarea queda guardada en `net._http_response` y se puede consultar sin
  // entrar a Netlify a leer bitácoras.
  return Response.json({
    ok: true,
    cuentas,
    sincronizadas,
    mandadas,
    ...(problemas.length ? { problemas: problemas.slice(0, 10) } : {}),
  });
}
