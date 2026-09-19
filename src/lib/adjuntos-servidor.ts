import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import { partesDeAdjunto } from "@/lib/adjuntos";

/**
 * La dirección de un adjunto para dársela a Meta.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * AQUÍ NO VALE `/api/adjunto`, Y ESA ES TODA LA DIFERENCIA.
 *
 * Esa ruta la usa el NAVEGADOR de un agente con sesión iniciada. Cuando el
 * archivo va para WhatsApp o Instagram, quien lo va a buscar es Meta desde sus
 * propios servidores: sin sesión, sin cookies y sin manera de tenerlas. Una
 * dirección que pida permiso le devolvería un 401 y el cliente se quedaría sin
 * su archivo, sin un solo error en ningún sitio.
 *
 * Por eso aquí se firma de verdad: una dirección con caducidad que Meta puede
 * traerse ya mismo y que no sirve mañana.
 *
 * UNA HORA, y no cinco minutos como en la pantalla: el envío puede entrar en
 * cola, reintentarse o esperar a que Meta se digne. Cinco minutos convertiría
 * un reintento normal en un adjunto perdido.
 *
 * Lo que no es nuestro se devuelve tal cual: si el negocio enlazó una imagen de
 * su propia web, no hay nada que firmar.
 * ─────────────────────────────────────────────────────────────────────────────
 */
export async function urlParaMandar(guardado: string | null | undefined): Promise<string> {
  const original = String(guardado ?? "");
  const partes = partesDeAdjunto(original);
  if (!partes) return original;

  const { data, error } = await createAdminClient()
    .storage.from(partes.almacen).createSignedUrl(partes.ruta, 3600);

  if (error || !data?.signedUrl) {
    // SE DEVUELVE LO QUE HABÍA. Si el bucket todavía es público, eso funciona;
    // y si ya no lo es, el envío fallará con el error de Meta, que es una
    // pista, en vez de con un `undefined` que no dice nada.
    console.error("[adjunto] no pude firmar para mandar", partes.almacen, partes.ruta, error?.message);
    return original;
  }
  return data.signedUrl;
}
