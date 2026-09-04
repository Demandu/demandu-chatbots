"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getCurrentOrgId } from "@/lib/org";
import {
  GRAPH,
  aPlantillaDeMeta,
  motivoPlantilla,
  renumerar,
  variablesDe,
  type Borrador,
} from "@/lib/whatsapp/plantillas";

/** El canal de WhatsApp de ese chatbot. Sin él no hay a quién pedirle nada. */
async function canalDe(botId: string) {
  const sb = createClient();
  const { data } = await sb
    .from("whatsapp_channels")
    .select("waba_id, phone_number_id, display_number")
    .eq("bot_id", botId)
    .maybeSingle();
  if (!data) return null;

  // ── EL TOKEN VIENE POR SU PROPIA PUERTA ────────────────────────────────
  // La columna ya no es legible para una sesión normal. `token_de_whatsapp`
  // comprueba el permiso de conexiones y devuelve nulo a quien no lo tenga;
  // las funciones de abajo ya saben decir «este chatbot no tiene WhatsApp
  // conectado», que es el mensaje correcto para un agente que no debería
  // estar manejando plantillas.
  const { data: token } = await sb.rpc("token_de_whatsapp", { p_bot_id: botId });

  return { ...(data as any), access_token: (token as string | null) ?? null } as
    | { waba_id: string | null; phone_number_id: string | null; access_token: string | null; display_number: string | null }
    | null;
}

/**
 * Sube el archivo de ejemplo del encabezado y devuelve el «handle» de Meta.
 *
 * ESTO NO ES LO MISMO QUE SUBIR UNA IMAGEN PARA ENVIARLA, y confundirlos es el
 * error clásico:
 *
 *   · Para MANDAR una imagen se usa `POST /{numero}/media` y sale un `id`.
 *   · Para CREAR una plantilla con imagen, Meta quiere un archivo de MUESTRA
 *     que sus revisores puedan mirar, y ese se sube por otro camino
 *     (`POST /{app}/uploads`) del que sale un `handle`.
 *
 * El camino de la muestra va en dos pasos —abrir la sesión, mandar los bytes—
 * y en el segundo la cabecera es `Authorization: OAuth`, no `Bearer`. No es un
 * despiste: la API de subida reanudable de Meta es así.
 */
export async function subirEjemploEncabezado(
  botId: string,
  datos: FormData,
): Promise<{ ok: boolean; handle?: string; nombre?: string; error?: string }> {
  const orgId = await getCurrentOrgId();
  if (!orgId) return { ok: false, error: "No encuentro tu cuenta." };

  const appId = process.env.NEXT_PUBLIC_META_APP_ID;
  if (!appId) return { ok: false, error: "La creación de plantillas no está disponible ahora mismo. Escríbenos." };

  const canal = await canalDe(botId);
  if (!canal?.access_token) return { ok: false, error: "Este chatbot todavía no tiene WhatsApp conectado." };

  const archivo = datos.get("archivo");
  if (!(archivo instanceof File) || archivo.size === 0) return { ok: false, error: "Elige un archivo." };

  // Los topes son de Meta. Avisamos aquí para no hacerle esperar una subida
  // que iba a fallar al final.
  const TOPES: Record<string, number> = { image: 5, video: 16, application: 100 };
  const familia = archivo.type.split("/")[0];
  const topeMB = TOPES[familia] ?? 100;
  if (archivo.size > topeMB * 1024 * 1024) {
    return { ok: false, error: `El archivo pasa de ${topeMB} MB, que es el máximo que acepta Meta.` };
  }

  try {
    // 1) Abrir la sesión de subida.
    const inicio = new URL(`${GRAPH}/${appId}/uploads`);
    inicio.searchParams.set("file_name", archivo.name);
    inicio.searchParams.set("file_length", String(archivo.size));
    inicio.searchParams.set("file_type", archivo.type || "application/octet-stream");
    inicio.searchParams.set("access_token", canal.access_token);

    const rInicio = await fetch(inicio, { method: "POST" });
    const jInicio = await rInicio.json().catch(() => ({}));
    const sesion = jInicio?.id as string | undefined;
    if (!rInicio.ok || !sesion) {
      console.error("[plantillas] abrir subida:", rInicio.status, JSON.stringify(jInicio).slice(0, 300));
      return { ok: false, error: motivoPlantilla(jInicio?.error?.code, jInicio?.error?.message ?? "") };
    }

    // 2) Mandar los bytes. Aquí «OAuth», no «Bearer».
    const rBytes = await fetch(`${GRAPH}/${sesion}`, {
      method: "POST",
      headers: {
        Authorization: `OAuth ${canal.access_token}`,
        file_offset: "0",
        "Content-Type": "application/octet-stream",
      },
      body: Buffer.from(await archivo.arrayBuffer()),
    });
    const jBytes = await rBytes.json().catch(() => ({}));
    const handle = jBytes?.h as string | undefined;
    if (!rBytes.ok || !handle) {
      console.error("[plantillas] subir bytes:", rBytes.status, JSON.stringify(jBytes).slice(0, 300));
      return { ok: false, error: motivoPlantilla(jBytes?.error?.code, jBytes?.error?.message ?? "") };
    }

    return { ok: true, handle, nombre: archivo.name };
  } catch (e) {
    console.error("[plantillas] subida red:", e);
    return { ok: false, error: "No se pudo subir el archivo. Inténtalo otra vez." };
  }
}

/**
 * Manda la plantilla a Meta y la guarda.
 *
 * NO GUARDAMOS LA CATEGORÍA QUE PIDIÓ EL CLIENTE, sino la que Meta contesta:
 * desde 2025 Meta recoloca las plantillas por su cuenta, y si guardáramos la
 * nuestra el cliente vería «Seguimiento» en una plantilla que le están
 * cobrando como promoción.
 */
export async function crearPlantilla(
  botId: string,
  borrador: Borrador,
): Promise<{ ok: boolean; error?: string; estado?: string; categoria?: string }> {
  const orgId = await getCurrentOrgId();
  if (!orgId) return { ok: false, error: "No encuentro tu cuenta." };

  const sb = createClient();
  const canal = await canalDe(botId);
  if (!canal?.waba_id || !canal?.access_token) {
    return { ok: false, error: "Este chatbot todavía no tiene WhatsApp conectado." };
  }

  const cuerpo = aPlantillaDeMeta(borrador);

  let j: any = {};
  try {
    const res = await fetch(`${GRAPH}/${canal.waba_id}/message_templates`, {
      method: "POST",
      headers: { Authorization: `Bearer ${canal.access_token}`, "Content-Type": "application/json" },
      body: JSON.stringify(cuerpo),
    });
    j = await res.json().catch(() => ({}));
    if (!res.ok || !j?.id) {
      console.error("[plantillas] crear:", res.status, JSON.stringify(j).slice(0, 500));
      return { ok: false, error: motivoPlantilla(j?.error?.code ?? res.status, j?.error?.error_user_msg ?? j?.error?.message ?? "") };
    }
  } catch (e) {
    console.error("[plantillas] crear red:", e);
    return { ok: false, error: "No se pudo hablar con Meta. Inténtalo otra vez." };
  }

  const textoCuerpo = renumerar(borrador.cuerpo);
  const { error } = await sb.from("whatsapp_templates").upsert(
    {
      org_id: orgId,
      bot_id: botId,
      waba_id: canal.waba_id,
      meta_id: String(j.id),
      name: borrador.nombre,
      language: borrador.idioma,
      // La de Meta manda sobre la que pidió el cliente.
      category: j.category ?? borrador.categoria,
      status: j.status ?? "PENDING",
      body: borrador.categoria === "AUTHENTICATION" ? "Código de verificación" : textoCuerpo,
      components: cuerpo.components,
      variables: variablesDe(textoCuerpo).length,
      creada_aqui: true,
      rejected_reason: null,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "bot_id,name,language" },
  );
  if (error) console.error("[plantillas] guardar:", error.message);

  revalidatePath(`/bots/${botId}/templates`);
  return { ok: true, estado: j.status ?? "PENDING", categoria: j.category ?? borrador.categoria };
}

/**
 * Borra una plantilla en Meta y aquí.
 *
 * Meta EXIGE el nombre aunque le pases el identificador; sin nombre contesta
 * que falta un parámetro. Y sin identificador borra TODOS los idiomas de esa
 * plantilla, así que lo mandamos siempre.
 */
export async function borrarPlantilla(
  botId: string,
  nombre: string,
  metaId: string | null,
): Promise<{ ok: boolean; error?: string }> {
  const orgId = await getCurrentOrgId();
  if (!orgId) return { ok: false, error: "No encuentro tu cuenta." };

  const sb = createClient();
  const canal = await canalDe(botId);
  if (!canal?.waba_id || !canal?.access_token) return { ok: false, error: "Este chatbot no tiene WhatsApp conectado." };

  try {
    const url = new URL(`${GRAPH}/${canal.waba_id}/message_templates`);
    url.searchParams.set("name", nombre);
    if (metaId) url.searchParams.set("hsm_id", metaId);
    const res = await fetch(url, {
      method: "DELETE",
      headers: { Authorization: `Bearer ${canal.access_token}` },
    });
    const j = await res.json().catch(() => ({}));
    if (!res.ok) {
      console.error("[plantillas] borrar:", res.status, JSON.stringify(j).slice(0, 300));
      return { ok: false, error: motivoPlantilla(j?.error?.code ?? res.status, j?.error?.message ?? "") };
    }
  } catch (e) {
    console.error("[plantillas] borrar red:", e);
    return { ok: false, error: "No se pudo hablar con Meta." };
  }

  let q = sb.from("whatsapp_templates").delete().eq("bot_id", botId).eq("name", nombre);
  if (metaId) q = q.eq("meta_id", metaId);
  await q;

  revalidatePath(`/bots/${botId}/templates`);
  return { ok: true };
}
