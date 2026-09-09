import "server-only";
import { GRAPH, aPlantillaDeMeta, revisar, hayGraves, type Borrador } from "./plantillas";

/**
 * MANDAR A META LAS PLANTILLAS QUE UNA FUNCIÓN NECESITA, SIN QUE EL CLIENTE SE
 * ENTERE DE QUE EXISTEN LAS PLANTILLAS.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * EL PROBLEMA QUE RESUELVE.
 *
 * El recordatorio de una cita solo puede salir con una plantilla aprobada en la
 * cuenta de Meta DEL NEGOCIO — no de Demandu. Y aprobarla tarda de minutos a un
 * día.
 *
 * Pedirle a un dentista que entre al Administrador de WhatsApp, elija la
 * categoría «Utilidad», escriba tres variables con sus ejemplos y dos botones
 * con el texto exacto es pedirle que no use la función. Lo hará mal, o no lo
 * hará, y en los dos casos el recordatorio no sale y la culpa se la lleva la
 * plataforma.
 *
 * Así que se manda sola en cuanto conecta su agenda. Cuando quiera usar el
 * recordatorio, ya estará aprobada.
 *
 * ── ES «MEJOR SI SALE», NUNCA UN BLOQUEO ──────────────────────────────────
 *
 * Esto corre DENTRO de conectar la agenda. Si Meta no contesta, si el negocio
 * todavía no tiene WhatsApp, si el token no sirve — la agenda se conecta igual.
 * Un cliente que no puede conectar su Google porque una plantilla no se pudo
 * mandar tendría un fallo incomprensible en el sitio equivocado.
 *
 * Por eso devuelve un resumen y no lanza nunca.
 *
 * ── LA DUPLICADA NO ES UN ERROR ───────────────────────────────────────────
 *
 * Reconectar la agenda es normal —cambiar de cuenta de Google, arreglar un
 * token— y cada vez se vuelve a intentar. Meta responde que ese nombre ya
 * existe, y eso significa que está hecho. Tratarlo como fallo llenaría los
 * registros de un error que no lo es y escondería los de verdad.
 * ─────────────────────────────────────────────────────────────────────────────
 */

export type Resultado = {
  plantilla: string;
  estado: "creada" | "ya_estaba" | "sin_whatsapp" | "rechazada" | "no_se_pudo";
  detalle?: string;
};

/** Meta: «ya existe una plantilla con ese nombre e idioma». */
const YA_EXISTE = 2388023;

export async function asegurarPlantillas(
  admin: any,
  orgId: string,
  borradores: Borrador[],
): Promise<Resultado[]> {
  const salida: Resultado[] = [];

  // El canal se lee con el cliente admin: el token de WhatsApp es un secreto y
  // no está al alcance de la sesión del usuario, con razón.
  const { data: canales, error } = await admin
    .from("whatsapp_channels")
    .select("waba_id, access_token")
    .eq("org_id", orgId);

  if (error) {
    return borradores.map((b) => ({
      plantilla: b.nombre, estado: "no_se_pudo" as const,
      detalle: "no se pudo leer el canal de WhatsApp",
    }));
  }

  const canal = (canales ?? []).find((c: any) => c?.waba_id && c?.access_token);
  if (!canal) {
    // Sin WhatsApp conectado no hay dónde crearla. NO es un fallo: mucha gente
    // conecta la agenda antes que el número.
    return borradores.map((b) => ({ plantilla: b.nombre, estado: "sin_whatsapp" as const }));
  }

  for (const b of borradores) {
    // SE VALIDA ANTES DE MANDAR, con el mismo validador que la pantalla. Un
    // rechazo de Meta cuesta 24 horas y casi nunca dice por qué; esto lo dice
    // ahora y en el registro, con el campo exacto.
    const avisos = revisar(b);
    if (hayGraves(avisos)) {
      const porque = avisos.filter((a) => a.grave).map((a) => `${a.campo}: ${a.texto}`).join(" · ");
      console.error(`[plantillas de la casa] «${b.nombre}» no pasa nuestra propia revisión:`, porque);
      salida.push({ plantilla: b.nombre, estado: "rechazada", detalle: porque });
      continue;
    }

    try {
      const res = await fetch(`${GRAPH}/${canal.waba_id}/message_templates`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${canal.access_token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(aPlantillaDeMeta(b)),
      });
      const j: any = await res.json().catch(() => ({}));

      if (res.ok && j?.id) {
        salida.push({ plantilla: b.nombre, estado: "creada" });
        continue;
      }
      if (j?.error?.code === YA_EXISTE) {
        salida.push({ plantilla: b.nombre, estado: "ya_estaba" });
        continue;
      }

      const detalle = String(j?.error?.error_user_msg ?? j?.error?.message ?? res.status);
      console.error(`[plantillas de la casa] Meta rechazó «${b.nombre}»:`, detalle);
      salida.push({ plantilla: b.nombre, estado: "rechazada", detalle });
    } catch (e: any) {
      console.error(`[plantillas de la casa] no se pudo mandar «${b.nombre}»:`, e?.message ?? e);
      salida.push({ plantilla: b.nombre, estado: "no_se_pudo", detalle: String(e?.message ?? e) });
    }
  }

  return salida;
}
