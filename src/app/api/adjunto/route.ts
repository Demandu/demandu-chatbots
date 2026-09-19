import { NextResponse } from "next/server";
import { getCurrentOrgId } from "@/lib/org";
import { createAdminClient } from "@/lib/supabase/admin";
import { partesDeAdjunto } from "@/lib/adjuntos";

export const dynamic = "force-dynamic";

/**
 * Un adjunto de una conversación, servido con permiso.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * POR QUÉ EXISTE.
 *
 * El almacén guardaba los adjuntos en un bucket PÚBLICO y en la base quedaba la
 * URL pública. Ahí dentro hay lo que los clientes de nuestros clientes mandan
 * por WhatsApp: fotos, comprobantes, documentos. Cualquiera con esa URL se lo
 * bajaba — sin sesión, sin caducidad y para siempre. Lo único que lo tapaba era
 * que las rutas llevan un identificador difícil de adivinar, y eso no sobrevive
 * a que una URL se pegue en un chat, viaje a un CRM ajeno o quede en un registro.
 *
 * Ahora el navegador pide el archivo AQUÍ. Esta ruta comprueba quién eres, de
 * qué cuenta eres, y solo entonces pide al almacén una dirección firmada que
 * caduca en minutos.
 *
 * ── LA COMPROBACIÓN QUE DE VERDAD IMPORTA ───────────────────────────────────
 *
 * La primera carpeta de la ruta ES la organización dueña del archivo. Es la
 * misma regla que ya usa la política del almacén
 * (`foldername(name)[1]::uuid IN (auth_org_ids())`), dicha aquí otra vez a
 * propósito: esta ruta firma CON LA LLAVE DE SERVICIO, que se salta el RLS. Si
 * no se comprobara aquí, un agente de un negocio podría firmar el adjunto de
 * otro con solo cambiar la dirección — habríamos cambiado una puerta abierta
 * por otra peor, porque esta sí sabe a quién le pertenece cada archivo.
 *
 * ── LOS ADJUNTOS VIEJOS SIGUEN FUNCIONANDO ──────────────────────────────────
 *
 * En los mensajes ya guardados hay URLs públicas enteras. `rutaDeAdjunto` les
 * saca la ruta y se firma igual. Sin eso, cerrar el bucket habría borrado de la
 * pantalla todos los adjuntos anteriores a hoy.
 * ─────────────────────────────────────────────────────────────────────────────
 */
export async function GET(req: Request) {
  const orgId = await getCurrentOrgId();
  if (!orgId) return NextResponse.json({ error: "sin sesión" }, { status: 401 });

  const pedida = new URL(req.url).searchParams.get("r") ?? "";
  const partes = partesDeAdjunto(pedida);
  if (!partes) return NextResponse.json({ error: "ruta inválida" }, { status: 400 });

  // La primera carpeta es la cuenta dueña. Sin esto, la llave de servicio
  // firmaría el archivo de cualquiera.
  if (partes.ruta.split("/")[0] !== orgId) {
    return NextResponse.json({ error: "no es de tu cuenta" }, { status: 403 });
  }

  // CINCO MINUTOS: lo que tarda un navegador en pintarlo o alguien en pulsar
  // «descargar». Más tiempo es una URL pública con pasos extra.
  const { data, error } = await createAdminClient()
    .storage.from(partes.almacen).createSignedUrl(partes.ruta, 300);

  if (error || !data?.signedUrl) {
    // Se apunta el motivo: un adjunto que no se ve y no dice por qué es el tipo
    // de fallo que acaba en «la plataforma va mal».
    console.error("[adjunto] no pude firmar", partes.almacen, partes.ruta, error?.message);
    return NextResponse.json({ error: "no se pudo abrir el archivo" }, { status: 404 });
  }

  return NextResponse.redirect(data.signedUrl, 307);
}
