import { createAdminClient } from "@/lib/supabase/admin";
import { identificar, sinPermiso } from "@/lib/api/llave";

export const dynamic = "force-dynamic";

/**
 * "¿Quién soy?" — el extremo de comprobación.
 *
 * Zapier y Make piden uno así para verificar la llave cuando el cliente conecta
 * su cuenta, y enseñarle el nombre de su negocio en vez de un identificador.
 * Sin esto, el cliente pega la llave y lo único que sabe es si dio error o no.
 *
 * NO DEVUELVE NADA SENSIBLE a propósito: el nombre y el plan bastan para
 * confirmar que la llave es la correcta.
 */
export async function GET(req: Request) {
  const quien = await identificar(req);
  if (!quien) return sinPermiso();

  const admin = createAdminClient();
  const { data: org } = await admin
    .from("organizations")
    .select("name, plan")
    .eq("id", quien.orgId)
    .maybeSingle();

  return Response.json({
    ok: true,
    organizacion: { id: quien.orgId, nombre: org?.name ?? null, plan: org?.plan ?? null },
  });
}
