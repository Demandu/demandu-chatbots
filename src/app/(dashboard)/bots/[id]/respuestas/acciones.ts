"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getCurrentOrgId } from "@/lib/org";
import { channelOf } from "@/lib/channels";
import {
  superficiesDe, nombreDeLana, nombreDePromo, limpiarPalabra,
  grafoDeLana, grafoDePromo, origenesDePromo,
} from "@/lib/canales/respuestasAutomaticas";

/**
 * A DÓNDE SE VUELVE DESPUÉS DE GUARDAR, CON EL AVISO PUESTO.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * PASÓ EN ESTA MISMA PANTALLA, EL DÍA QUE SE ESTRENÓ. El dueño pulsó «Guardar»,
 * la pantalla se quedó igual, y no hubo forma de saber si había pasado algo. Se
 * había guardado —las cuatro reglas estaban en la base— pero él no lo sabía.
 *
 * Es exactamente el vicio que más rabia da de la consola de Meta: guardas, no
 * sale nada, y tienes que recargar para ver si te hizo caso. Un guardado sin
 * confirmación es indistinguible de uno que falló.
 * ─────────────────────────────────────────────────────────────────────────────
 */
function volverCon(botId: string, aviso: string): never {
  redirect(`/bots/${botId}/respuestas?ok=${aviso}`);
}

/**
 * Guardar la pantalla simple de respuestas automáticas.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * APAGAR NO ES BORRAR, y esto importa más de lo que parece. Quien apaga «los
 * comentarios» un martes y los vuelve a encender el jueves espera encontrarse
 * lo suyo: si al apagar se borrara el flujo, perdería los cambios que le haya
 * hecho en el editor —botones, preguntas, lo que sea— sin un solo aviso. Se
 * marca `enabled = false` y ya.
 *
 * SE BUSCA POR NOMBRE, y es a propósito. El nombre lo pone esta pantalla
 * (`Lana · Mensajes directos`) y es lo que permite volver a encontrar SU regla
 * sin tocar los flujos que el negocio haya creado a mano para ese mismo sitio.
 * Sin eso, encender el interruptor pisaría el flujo que alguien construyó.
 * ─────────────────────────────────────────────────────────────────────────────
 */
export async function guardarDondeContesta(formData: FormData) {
  const botId = String(formData.get("bot_id") ?? "");
  if (!botId) return;

  const orgId = await getCurrentOrgId();
  if (!orgId) return;

  const sb = createClient();
  const { data: bot } = await sb.from("bots").select("id, channel").eq("id", botId).maybeSingle();
  if (!bot) return;

  const { data: existentes } = await sb
    .from("flows")
    .select("id, name, origen")
    .eq("bot_id", botId);

  for (const sitio of superficiesDe(channelOf((bot as any).channel))) {
    const nombre = nombreDeLana(sitio.valor);
    const encendido = formData.get(`on_${sitio.valor}`) === "si";
    // Solo tiene sentido donde hay comentario público; en un privado no hay
    // «público» al que contestar.
    const enPublico = !!sitio.admitePublica && formData.get(`pub_${sitio.valor}`) === "si";
    const modo = enPublico ? "ia" : "no";

    const ya = (existentes ?? []).find((f: any) => f.name === nombre);

    if (ya) {
      await sb
        .from("flows")
        .update({ enabled: encendido, respuesta_publica_modo: modo, origen: sitio.valor })
        .eq("id", (ya as any).id);
      continue;
    }

    // NO SE CREA LO QUE ESTÁ APAGADO. Crear filas desactivadas para los cinco
    // sitios llenaría la lista de flujos de cosas que nadie pidió.
    if (!encendido) continue;

    await sb.from("flows").insert({
      bot_id: botId,
      org_id: orgId,
      name: nombre,
      graph: grafoDeLana(),
      is_live: true,
      version: 1,
      trigger_type: "welcome",
      keywords: [],
      enabled: true,
      origen: sitio.valor,
      respuesta_publica_modo: modo,
      una_por_persona: true,
    });
  }

  revalidatePath(`/bots/${botId}/respuestas`);
  revalidatePath(`/bots/${botId}`);
  volverCon(botId, "guardado");
}

/**
 * Crear o rehacer una promoción de palabra clave.
 *
 * SE REHACE ENTERA (se borra y se vuelve a crear) porque «en los dos sitios»
 * son dos reglas y editar a mano el paso de una a dos —o de dos a una— es
 * justo el tipo de código que se equivoca en silencio y deja media promoción
 * viva. Son filas nuevas cada vez; no hay nada que conservar.
 */
export async function guardarPromo(formData: FormData) {
  const botId = String(formData.get("bot_id") ?? "");
  const palabra = limpiarPalabra(String(formData.get("palabra") ?? ""));
  const mensaje = String(formData.get("mensaje") ?? "").trim().slice(0, 900);
  if (!botId || !palabra || !mensaje) return;

  const orgId = await getCurrentOrgId();
  if (!orgId) return;

  const enlace = String(formData.get("enlace") ?? "").trim().slice(0, 500);
  const archivo = String(formData.get("archivo") ?? "").trim().slice(0, 500);
  const tipo = String(formData.get("tipo_archivo") ?? "file");
  const donde = String(formData.get("donde") ?? "comentarios");
  const publica = formData.get("publica") === "si" ? "ia" : "no";

  const sb = createClient();
  const nombre = nombrePromoSeguro(palabra);

  await sb.from("flows").delete().eq("bot_id", botId).eq("name", nombre);

  const grafo = grafoDePromo({ mensaje, enlace, archivo, tipoDeArchivo: tipo });

  for (const origen of origenesDePromo(donde)) {
    await sb.from("flows").insert({
      bot_id: botId,
      org_id: orgId,
      name: nombre,
      graph: grafo,
      is_live: true,
      version: 1,
      trigger_type: "keyword",
      keywords: [palabra],
      enabled: true,
      origen,
      // En un mensaje directo no hay comentario donde contestar; guardarlo como
      // «ia» daría a entender en la pantalla algo que no puede pasar.
      respuesta_publica_modo: origen === "dm" ? "no" : publica,
      una_por_persona: true,
    });
  }

  revalidatePath(`/bots/${botId}/respuestas`);
  revalidatePath(`/bots/${botId}`);
  volverCon(botId, "promo");
}

export async function borrarPromo(formData: FormData) {
  const botId = String(formData.get("bot_id") ?? "");
  const palabra = limpiarPalabra(String(formData.get("palabra") ?? ""));
  if (!botId || !palabra) return;

  await createClient().from("flows").delete().eq("bot_id", botId).eq("name", nombrePromoSeguro(palabra));

  revalidatePath(`/bots/${botId}/respuestas`);
  revalidatePath(`/bots/${botId}`);
  volverCon(botId, "borrada");
}

/**
 * El nombre con el que se guarda una promoción.
 *
 * Se calcula SIEMPRE aquí, nunca llega del formulario: es lo que usa el borrado
 * para elegir qué filas se van. Aceptarlo del navegador sería dejar que alguien
 * escribiera «Lana · Mensajes directos» y borrara con ello otra cosa.
 */
function nombrePromoSeguro(palabra: string): string {
  return nombreDePromo(limpiarPalabra(palabra));
}
