import { horariosLibres, agendar } from "@/lib/agenda";

export const dynamic = "force-dynamic";

/**
 * La misma agenda, pero para el MOTOR de WhatsApp.
 *
 * POR QUÉ NO REUSA `/api/v1/agenda`: aquella pide la llave de API del cliente,
 * y el motor no la tiene ni debe tenerla — atiende a todos los clientes y
 * guardar la llave de cada uno sería crear un llavero que no hace falta.
 *
 * POR QUÉ NO LLAMA A LA BASE DIRECTAMENTE: porque el cálculo de horarios vive
 * en la web (`computeSlots`, con el horario laboral y las zonas horarias) y
 * copiarlo al motor en Deno sería tener dos versiones que se separan.
 *
 * Se autentica con la llave de servicio de Supabase, que el motor y la web YA
 * comparten. No hay un secreto nuevo que configurar — y un secreto que hay que
 * acordarse de poner es un secreto que un día falta.
 */

/**
 * POR QUÉ NO BASTA CON COMPARAR LA LLAVE CON LA DE ESTE LADO.
 *
 * Esto empezó siendo un `===` contra `SUPABASE_SERVICE_ROLE_KEY` y se cayó en
 * producción sin decir por qué: el motor mandaba una llave de servicio VÁLIDA
 * y aquí se rechazaba, porque Supabase convive con dos formatos de llave de
 * servicio —la antigua (un JWT, que es la que las Edge Functions reciben ya
 * puesta) y la nueva (`sb_secret_…`, que es la que uno copia hoy del panel al
 * configurar Netlify)—. Las dos mandan igual en el proyecto; como texto no se
 * parecen en nada.
 *
 * Comparar dos copias de un secreto que se configuran por separado es apostar
 * a que nadie las rote nunca por separado. Así que se comprueba lo que de
 * verdad importa: **¿esta llave manda en ESTE proyecto?** Se le pide algo que
 * solo `service_role` puede hacer. Si puede, es de los nuestros.
 *
 * Esto no abre nada: quien tenga una llave de servicio de este proyecto ya
 * tiene la base entera; pedirle además que adivine cuál de las dos guardamos
 * aquí no protegía de nadie, solo rompía el calendario.
 */
const YA_VERIFICADAS = new Map<string, number>();
const VALE_POR = 10 * 60_000;

async function autorizado(req: Request): Promise<boolean> {
  const dado = (req.headers.get("x-demandu-motor") ?? "").trim();
  if (dado.length < 20) return false;

  const esperado = (process.env.SUPABASE_SERVICE_ROLE_KEY ?? "").trim();
  if (esperado && dado.length === esperado.length && dado === esperado) return true;

  const visto = YA_VERIFICADAS.get(dado);
  if (visto && visto > Date.now()) return true;

  // Un endpoint de administración: el `anon` no lo toca ni con permiso.
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
  if (!url) return false;
  try {
    const r = await fetch(`${url}/auth/v1/admin/users?page=1&per_page=1`, {
      headers: { apikey: dado, Authorization: `Bearer ${dado}` },
    });
    if (!r.ok) return false;
    YA_VERIFICADAS.set(dado, Date.now() + VALE_POR);
    return true;
  } catch {
    return false;
  }
}

export async function POST(req: Request) {
  if (!(await autorizado(req))) return Response.json({ error: "no autorizado" }, { status: 401 });

  const b = await req.json().catch(() => ({} as any));
  const orgId = String(b.org_id ?? "");
  if (!orgId) return Response.json({ error: "falta org_id" }, { status: 400 });

  if (b.accion === "horarios") {
    const r = await horariosLibres(orgId, {
      calendarId: b.calendario,
      durationMin: b.duracion,
      days: b.dias,
      maxSlots: b.cuantos,
    });
    return Response.json(r);
  }

  if (b.accion === "agendar") {
    const r = await agendar(orgId, {
      inicioISO: String(b.inicio ?? ""),
      durationMin: b.duracion,
      calendarId: b.calendario,
      titulo: b.titulo,
      descripcion: b.descripcion,
      correoInvitado: b.correo,
    });
    return Response.json(r, { status: r.ok ? 200 : 200 });
  }

  return Response.json({ error: "acción desconocida" }, { status: 400 });
}
