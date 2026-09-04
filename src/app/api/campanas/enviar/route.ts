import { createAdminClient } from "@/lib/supabase/admin";
import { llamadaDeTareaProgramada } from "@/lib/cron";
import { enviarPlantilla } from "@/lib/canales/whatsappEnviar";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * La tanda que va vaciando la cola de difusiones.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * LA LLAMA EL RELOJ DE LA BASE cada minuto, con un ticket de un solo uso. Nadie
 * espera al otro lado, y eso es exactamente lo que arregla el problema: antes
 * esto pasaba dentro de la petición del navegador y con mil contactos la
 * función se cortaba a mitad — unos recibían, otros no, y nadie sabía quiénes.
 *
 * ── POR QUÉ EN OLAS Y NO DE UN SOLO TIRÓN ─────────────────────────────────
 *
 * Se toma un puñado, se manda, se apunta, y se vuelve a tomar otro. Tomar mil
 * de golpe y quedarse sin tiempo a la mitad dejaría quinientas filas marcadas
 * como «enviando» que nunca salieron: habría que rescatarlas, y rescatar un
 * envío del que no se sabe nada es arriesgarse a mandarlo dos veces.
 *
 * Tomando de a poco, lo que queda en el aire cuando se acaba el tiempo es como
 * mucho una ola.
 *
 * ── EN PARALELO, PERO POCOS A LA VEZ ──────────────────────────────────────
 *
 * De uno en uno, mil mensajes son mil viajes a Meta esperando uno detrás de
 * otro: veinte minutos largos. De ocho en ocho salen en un par de minutos. Más
 * de ocho no aporta —el cuello es Meta, no nosotros— y sí arriesga que su
 * limitador nos empiece a rechazar envíos buenos.
 *
 * ── EL PRESUPUESTO DE TIEMPO ──────────────────────────────────────────────
 *
 * Se para sola antes de que la corten. Una función cortada a mitad es
 * justamente el fallo del que venimos: mejor terminar la ola que está en curso,
 * dejar el resto en «pendiente» y que la siguiente tanda —dentro de un minuto—
 * siga por donde iba.
 * ─────────────────────────────────────────────────────────────────────────────
 */

/** Cuántos se toman de una vez. Lo que puede quedar en el aire si se corta. */
const OLA = 40;
/** Cuántos viajan a Meta a la vez. */
const A_LA_VEZ = 8;
/** Cuánto dura la tanda antes de dejarlo para la siguiente. */
const PRESUPUESTO_MS = 45_000;

type Destinatario = {
  id: string;
  campaign_id: string;
  org_id: string;
  contact_id: string | null;
  phone: string | null;
  nombre: string | null;
  plantilla: string | null;
  idioma: string | null;
  variables: number | null;
  pnid: string | null;
  token: string | null;
};

export async function POST(req: Request) {
  if (!(await llamadaDeTareaProgramada(req, "difusiones"))) {
    return Response.json({ error: "no autorizado" }, { status: 401 });
  }

  const admin = createAdminClient();
  const arranque = Date.now();

  let enviados = 0;
  let fallidos = 0;
  let olas = 0;

  while (Date.now() - arranque < PRESUPUESTO_MS) {
    const { data, error } = await admin.rpc("campanas_tomar_lote", { p_limite: OLA });
    if (error) {
      console.error("[difusiones] no pude tomar el lote:", error.message);
      break;
    }

    const lote = (data ?? []) as Destinatario[];
    if (!lote.length) break;
    olas++;

    // La campaña pasa a «enviando» en cuanto sale el primero: así la pantalla
    // deja de decir «encolada» mientras ya están saliendo mensajes.
    const campañas = [...new Set(lote.map((d) => d.campaign_id))];
    await admin.from("campaigns").update({ status: "enviando" }).in("id", campañas).eq("status", "encolada");

    for (let i = 0; i < lote.length; i += A_LA_VEZ) {
      const trozo = lote.slice(i, i + A_LA_VEZ);
      const resultados = await Promise.all(trozo.map((d) => mandarUno(d)));
      for (const r of resultados) {
        if (r.ok) enviados++;
        else fallidos++;
      }
      // CADA RESULTADO SE APUNTA EN CUANTO SE SABE, no al final de la tanda. Si
      // la función muere, lo ya enviado queda escrito como enviado y no se
      // vuelve a mandar.
      await Promise.all(
        resultados.map((r) =>
          admin
            .from("campaign_recipients")
            .update({
              status: r.ok ? "sent" : "failed",
              wa_message_id: r.wamid ?? null,
              error: r.error ?? null,
              sent_at: r.ok ? new Date().toISOString() : null,
            })
            .eq("id", r.id),
        ),
      );
    }
  }

  // Las que ya no tienen a nadie esperando se cierran solas.
  await admin.rpc("campanas_cerrar_terminadas");

  return Response.json({ enviados, fallidos, olas });
}

/**
 * Un envío, con su resultado.
 *
 * NUNCA LANZA. Si esta función tirara una excepción, `Promise.all` cortaría el
 * trozo entero y los demás quedarían marcados como «enviando» sin haberse
 * intentado — y esos son justo los que después hay que rescatar a ciegas.
 */
async function mandarUno(
  d: Destinatario,
): Promise<{ id: string; ok: boolean; wamid?: string; error?: string }> {
  const para = String(d.phone ?? "").replace(/\D+/g, "");

  // Lo que no se puede arreglar reintentando se marca fallido y se explica. Un
  // destinatario sin teléfono o una campaña cuyo bot perdió el canal no mejoran
  // por insistir, y dejarlos en la cola la atasca para todos los demás.
  if (!para) return { id: d.id, ok: false, error: "Este contacto no tiene número de WhatsApp." };
  if (!d.plantilla) return { id: d.id, ok: false, error: "La campaña no tiene plantilla." };
  if (!d.pnid || !d.token) {
    return { id: d.id, ok: false, error: "El chatbot de esta campaña ya no tiene número conectado." };
  }

  // El nombre va en el primer hueco, como hacía el envío de antes. Los demás
  // huecos van vacíos: Meta exige tantos valores como variables tenga el
  // cuerpo, y de menos rechaza el envío entero.
  const cuantas = Math.max(0, Number(d.variables ?? 0));
  const valores = Array.from({ length: cuantas }, (_, i) => (i === 0 ? d.nombre || "" : ""));

  try {
    const r = await enviarPlantilla(d.pnid, d.token, para, d.plantilla, d.idioma || "es", valores);
    return r.ok
      ? { id: d.id, ok: true, wamid: r.wamid }
      : { id: d.id, ok: false, error: r.error ?? "WhatsApp no aceptó el mensaje." };
  } catch (e) {
    return { id: d.id, ok: false, error: (e as Error)?.message ?? "Falló la conexión con WhatsApp." };
  }
}
