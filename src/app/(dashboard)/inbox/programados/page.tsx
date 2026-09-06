import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { getCurrentOrgId } from "@/lib/org";
import { exigir } from "@/lib/permisos-server";
import { cancelarEspera } from "./actions";

export const dynamic = "force-dynamic";

/**
 * MENSAJES EN ESPERA.
 *
 * Cuando un flujo lleva un bloque «Espera» de minutos u horas, la conversación
 * se queda dormida y el bot vuelve a escribir más tarde. Eso, sin esta
 * pantalla, es invisible: el dueño del negocio ve una conversación que se calló
 * y no tiene forma de saber que el bot va a retomarla esta tarde — ni de
 * impedirlo si ya no viene a cuento.
 *
 * Aquí se ve qué va a salir, para quién y cuándo. Y se puede cancelar, que es
 * lo que de verdad hace falta cuando el cliente ya llamó por teléfono y el
 * recordatorio automático sobra.
 */

const ESTADOS: Record<string, { texto: string; color: string; fondo: string }> = {
  pendiente: { texto: "Programado", color: "#8B66FF", fondo: "rgba(139,102,255,.14)" },
  enviada: { texto: "Saliendo ahora", color: "#8B66FF", fondo: "rgba(139,102,255,.14)" },
  hecha: { texto: "Enviado", color: "#3DBE8B", fondo: "rgba(61,190,139,.14)" },
  cancelada: { texto: "Cancelado", color: "#8A8FA8", fondo: "rgba(138,143,168,.14)" },
  caducada: { texto: "Fuera de las 24 h", color: "#E8A33D", fondo: "rgba(232,163,61,.14)" },
  fallida: { texto: "Falló", color: "#FF6FB0", fondo: "rgba(255,111,176,.14)" },
};

/** «en 2 h», «en 35 min», «hace 10 min». Sin librerías, sin dependencias. */
function cuando(iso: string): string {
  const min = Math.round((Date.parse(iso) - Date.now()) / 60000);
  const abs = Math.abs(min);
  const cuerpo =
    abs < 1 ? "menos de un minuto"
    : abs < 60 ? `${abs} min`
    : abs < 60 * 24 ? `${Math.round(abs / 60)} h`
    : `${Math.round(abs / (60 * 24))} días`;
  return min >= 0 ? `en ${cuerpo}` : `hace ${cuerpo}`;
}

export default async function ProgramadosPage() {
  await exigir("conversaciones");

  const orgId = await getCurrentOrgId();
  if (!orgId) return null;

  const { data } = await createClient()
    .from("esperas_pendientes")
    .select("id, estado, ejecutar_at, detalle, updated_at, conversation_id, conversations(contact:contacts(name, wa_name, phone))")
    .eq("org_id", orgId)
    .order("ejecutar_at", { ascending: false })
    .limit(100);

  const filas = (data ?? []) as any[];
  const pendientes = filas.filter((f) => f.estado === "pendiente" || f.estado === "enviada");
  const pasadas = filas.filter((f) => !["pendiente", "enviada"].includes(f.estado));

  const Fila = ({ f, futura }: { f: any; futura: boolean }) => {
    const c = f.conversations?.contact;
    const quien = c?.name || c?.wa_name || c?.phone || "Contacto";
    const e = ESTADOS[f.estado] ?? ESTADOS.pendiente;
    return (
      <div className="flex items-center gap-3 rounded-xl border border-linea bg-tarjeta p-3.5">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <Link href={`/inbox?c=${f.conversation_id}`} className="truncate text-sm font-semibold text-ink hover:underline">
              {quien}
            </Link>
            <span className="flex-none rounded-full px-2 py-0.5 text-[11px] font-semibold"
                  style={{ background: e.fondo, color: e.color }}>
              {e.texto}
            </span>
          </div>
          <div className="mt-0.5 text-xs text-ink-3">
            {futura ? "El bot le escribe " : "Estaba previsto "}
            <b className="text-ink-2">{cuando(f.ejecutar_at)}</b>
            {f.detalle && <> · {f.detalle}</>}
          </div>
        </div>
        {futura && (
          <form action={cancelarEspera}>
            <input type="hidden" name="id" value={f.id} />
            <button className="flex-none rounded-lg border border-linea-2 px-2.5 py-1.5 text-xs text-ink-2 transition hover:border-danger/50 hover:text-danger">
              Cancelar
            </button>
          </form>
        )}
      </div>
    );
  };

  return (
    <div>
      <div className="mb-5">
        <h1 className="text-lg font-semibold text-ink">Mensajes en espera</h1>
        <p className="mt-1 text-sm text-ink-3">
          Conversaciones que tu chatbot va a retomar solo, porque su flujo tiene un bloque de espera.
        </p>
      </div>

      {pendientes.length > 0 ? (
        <div className="mb-7 grid gap-2.5">{pendientes.map((f) => <Fila key={f.id} f={f} futura />)}</div>
      ) : (
        <div className="mb-7 rounded-xl border border-linea bg-tarjeta p-5 text-sm text-ink-3">
          No hay nada programado ahora mismo. Aquí aparecerán las conversaciones que tu chatbot vaya a
          retomar más tarde.
        </div>
      )}

      {pasadas.length > 0 && (
        <>
          <h2 className="mb-2.5 text-sm font-semibold text-ink-2">Ya pasaron</h2>
          <div className="grid gap-2.5">{pasadas.slice(0, 30).map((f) => <Fila key={f.id} f={f} futura={false} />)}</div>
          <p className="mt-3 text-[11px] text-ink-3">
            «Fuera de las 24 h» significa que cuando llegó el momento ya no se le podía escribir por
            WhatsApp: pasó más de un día desde su último mensaje y Meta solo permite plantillas. No se
            envió nada.
          </p>
        </>
      )}
    </div>
  );
}
