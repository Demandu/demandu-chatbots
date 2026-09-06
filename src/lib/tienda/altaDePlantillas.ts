import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { PLANTILLAS, NOMBRES_DE_PEDIDO, type PlantillaDePedido } from "./plantillasDePedido";
import { DOMINIO_TIENDAS } from "./direccion";
import { GRAPH, aPlantillaDeMeta, motivoPlantilla, BORRADOR_VACIO } from "@/lib/whatsapp/plantillas";

/**
 * Crear las plantillas de pedido en el WhatsApp del cliente.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * LO QUE MÁS SORPRENDE DE TODO ESTO: LAS PLANTILLAS NO SON NUESTRAS. Meta las
 * aprueba por cuenta de WhatsApp, así que las siete que existen en el WABA de
 * Demandu NO existen en el de Paws at Home ni en el de nadie más. Cablear los
 * avisos «por nombre» y ya, habría funcionado en nuestras pruebas y en cero
 * cuentas de clientes.
 *
 * Así que cada negocio que encienda la tienda necesita SUS siete, creadas en su
 * cuenta y aprobadas por Meta. Esto es lo que las crea.
 *
 * ── POR QUÉ NO SE HACE SOLO Y EN SILENCIO ─────────────────────────────────
 *
 * Porque Meta tarda: de minutos a un día. Una tienda que se enciende y empieza
 * a vender YA va a mandar avisos antes de que aprueben nada, y el negocio tiene
 * que poder ver en qué va eso. Un proceso invisible que a veces funciona y a
 * veces no es peor que uno manual.
 *
 * Mientras no estén aprobadas no se rompe nada: dentro de las 24 h los avisos
 * salen como texto libre igual que siempre. Lo único que falta es el aviso a
 * quien lleva un día sin escribir.
 *
 * ── LA REGLA DE LOS REINTENTOS ────────────────────────────────────────────
 *
 * UNA QUE YA EXISTE NO ES UN ERROR. Meta contesta «already exists» y eso es
 * exactamente lo que queremos: significa que ya está. Tratarlo como fallo haría
 * que el botón «crear» pareciera roto para siempre en cuanto se pulse dos veces.
 * ─────────────────────────────────────────────────────────────────────────────
 */

export type ResultadoAlta = {
  nombre: string;
  etiqueta: string;
  ok: boolean;
  /** Ya existía en Meta. Cuenta como bien. */
  yaEstaba?: boolean;
  error?: string;
};

/** El borrador de Meta para una de las siete. */
export function borradorDe(p: PlantillaDePedido) {
  // LOS EJEMPLOS SON OBLIGATORIOS. Meta rechaza la plantilla sin ellos, y son
  // lo que miran sus revisores: con ejemplos creíbles se aprueba en minutos, y
  // con «xxx» se queda días o la rechazan.
  const ejemploDe = (v: PlantillaDePedido["variables"][number]) =>
    v === "numero" ? "1042" : v === "total" ? "$19.50" : "Paws at Home";

  return {
    ...BORRADOR_VACIO,
    nombre: p.nombre,
    idioma: "es",
    // UTILITY Y NO MARKETING. Un aviso de pedido es una utilidad —el cliente
    // pidió y está esperando— y Meta las cobra más barato y las aprueba antes.
    // Si Meta cree otra cosa la recoloca sola (`allow_category_change`).
    categoria: "UTILITY" as const,
    cuerpo: p.cuerpo,
    ejemplos: p.variables.map(ejemploDe),
    botones: p.boton
      ? [
          {
            tipo: "URL" as const,
            texto: p.boton.texto,
            // LA VARIABLE VA AL FINAL DE LA DIRECCIÓN, que es lo único que Meta
            // permite. Y el dominio sale de la constante, nunca escrito a mano:
            // ya cambió una vez y estas plantillas quedan aprobadas para
            // siempre con la dirección que se les puso.
            url:
              p.boton.a === "pago"
                ? `https://${DOMINIO_TIENDAS}/r/{{1}}`
                : `https://${DOMINIO_TIENDAS}/{{1}}`,
            ejemploUrl: p.boton.a === "pago" ? "PAWS-1042" : "paws-at-home",
          },
        ]
      : [],
  };
}

/**
 * Crea las que falten en la cuenta de este chatbot.
 *
 * NUNCA LANZA. Devuelve una fila por plantilla con lo que pasó, para poder
 * pintarlo. Si Meta se cae a la mitad, las que sí salieron quedan hechas y las
 * demás se reintentan pulsando otra vez.
 */
export async function crearPlantillasDePedido(
  sb: SupabaseClient,
  botId: string,
): Promise<{ ok: boolean; error?: string; resultados: ResultadoAlta[] }> {
  const { data: canal } = await sb
    .from("whatsapp_channels")
    .select("waba_id, access_token, org_id")
    .eq("bot_id", botId)
    .maybeSingle();

  if (!canal?.waba_id || !canal?.access_token) {
    return {
      ok: false,
      error: "Este chatbot todavía no tiene WhatsApp conectado, así que no hay dónde crearlas.",
      resultados: [],
    };
  }

  const resultados: ResultadoAlta[] = [];

  for (const p of Object.values(PLANTILLAS)) {
    // DE UNA EN UNA Y NO EN PARALELO. Meta limita cuántas plantillas se crean
    // seguidas (error 80008) y siete de golpe entra de lleno en ese límite:
    // saldrían dos y cinco fallarían por «demasiado rápido».
    try {
      const res = await fetch(`${GRAPH}/${canal.waba_id}/message_templates`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${canal.access_token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(aPlantillaDeMeta(borradorDe(p) as any)),
      });
      const j: any = await res.json().catch(() => ({}));

      if (res.ok && j?.id) {
        resultados.push({ nombre: p.nombre, etiqueta: p.etiqueta, ok: true });
        await guardar(sb, canal, botId, p, j);
        continue;
      }

      const mensaje = String(j?.error?.error_user_msg ?? j?.error?.message ?? "");
      // YA EXISTE ES BUENA NOTICIA, no un fallo.
      if (/already exists|duplicate/i.test(mensaje)) {
        resultados.push({ nombre: p.nombre, etiqueta: p.etiqueta, ok: true, yaEstaba: true });
        continue;
      }

      resultados.push({
        nombre: p.nombre,
        etiqueta: p.etiqueta,
        ok: false,
        error: motivoPlantilla(j?.error?.code ?? res.status, mensaje),
      });
    } catch {
      resultados.push({
        nombre: p.nombre,
        etiqueta: p.etiqueta,
        ok: false,
        error: "No se pudo hablar con Meta. Inténtalo otra vez.",
      });
    }
  }

  return { ok: resultados.some((r) => r.ok), resultados };
}

/** La deja apuntada aquí para que la pantalla de plantillas la vea sin esperar al reloj. */
async function guardar(
  sb: SupabaseClient,
  canal: { waba_id: string | null; org_id: string },
  botId: string,
  p: PlantillaDePedido,
  j: any,
) {
  await sb.from("whatsapp_templates").upsert(
    {
      org_id: canal.org_id,
      waba_id: canal.waba_id,
      bot_id: botId,
      meta_id: String(j?.id ?? ""),
      name: p.nombre,
      language: "es",
      category: String(j?.category ?? "UTILITY"),
      // LA QUE DIGA META, no la que pedimos: desde 2025 recoloca por su cuenta,
      // y guardar la nuestra le enseñaría al cliente «Utilidad» en algo que le
      // están cobrando como promoción.
      status: String(j?.status ?? "PENDING"),
      body: p.cuerpo,
      variables: p.variables.length,
      creada_aqui: true,
      updated_at: new Date().toISOString(),
    },
    // EL ÚNICO ÍNDICE ÚNICO ES (bot_id, name, language) — comprobado contra la
    // base. Con otro `onConflict` el upsert falla y la plantilla se crea en
    // Meta pero no se apunta aquí: la pantalla diría «no existe» de algo que sí
    // existe, y el negocio pulsaría «crear» una y otra vez.
    { onConflict: "bot_id,name,language" },
  );
}

/**
 * En qué va cada una, para pintarlo.
 *
 * SE LEE DE NUESTRA TABLA, no de Meta. La pantalla se abre muchas veces y
 * preguntarle a Meta en cada carga es lento y gasta cuota; la tabla la
 * refresca la pantalla de Plantillas, que es donde vive esa sincronización.
 */
export async function estadoDeLasPlantillas(
  sb: SupabaseClient,
  orgId: string,
): Promise<{ nombre: string; etiqueta: string; estado: string }[]> {
  const { data } = await sb
    .from("whatsapp_templates")
    .select("name, status")
    .eq("org_id", orgId)
    .in("name", NOMBRES_DE_PEDIDO);

  const porNombre = new Map((data ?? []).map((t: any) => [t.name, String(t.status ?? "")]));

  return Object.values(PLANTILLAS).map((p) => ({
    nombre: p.nombre,
    etiqueta: p.etiqueta,
    // SIN FILA NO ES «APROBADA», ES «no existe». Es la misma regla del tablero
    // de estado: no poder medir algo nunca se pinta en verde.
    estado: porNombre.get(p.nombre) || "NO_EXISTE",
  }));
}
