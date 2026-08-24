import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";

/**
 * Comisiones de vendedores y partners.
 *
 * TRES REGLAS QUE ORDENAN TODO ESTE ARCHIVO. Las tres salen de la misma idea:
 * lo peor que le puede pasar a un programa de comisiones es que el número
 * cambie después de que alguien lo vio.
 *
 * 1. **Se comisiona lo COBRADO, no lo facturado.** La fuente es la factura
 *    pagada de Stripe. Pagar sobre un cobro que rebotó es dinero que no
 *    vuelve, y pasa más de lo que parece: tarjetas vencidas, saldo, fraude.
 *
 * 2. **Solo la parte de PLAN.** Los complementos y los pagos únicos —taller,
 *    configuración de Meta, bolsitas de mensajes— no pagan comisión. Se
 *    reconoce la línea del plan porque su precio de Stripe está en la tabla
 *    `plans`; lo que no cuadre con ninguno, no comisiona.
 *
 * 3. **Una vez apuntada, no se recalcula.** Cada factura deja UNA fila con el
 *    porcentaje que regía ese día. Si mañana sube la escala, sube de mañana en
 *    adelante. Un reembolso no borra la fila: se anula, y se ve que se anuló.
 */

const API = "https://api.stripe.com/v1";

async function stripe(path: string): Promise<any> {
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) throw new Error("Stripe no está configurado");
  const r = await fetch(`${API}${path}`, {
    headers: { Authorization: `Bearer ${key}` },
    cache: "no-store",
  });
  const j = await r.json();
  if (!r.ok) throw new Error(j?.error?.message ?? `Stripe contestó ${r.status}`);
  return j;
}

/** Día 1 del mes de una fecha, en texto, para agrupar. */
function periodoDe(segundos: number): string {
  const d = new Date(segundos * 1000);
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}-01`;
}

export type Resumen = {
  revisadas: number;
  apuntadas: number;
  saltadas: number;
  /** Por qué no salió nada, en cristiano. Vacío si sí salió algo. */
  porQueNada?: string;
  error?: string;
};

/**
 * Recorre las facturas pagadas recientes y apunta las comisiones que falten.
 *
 * Es idempotente por `stripe_invoice_id`: correrlo dos veces no paga dos
 * veces. Eso importa más de lo que parece — esto lo va a disparar una tarea
 * programada, y las tareas programadas se reintentan solas.
 */
export async function devengarComisiones(desde?: Date): Promise<Resumen> {
  const admin = createAdminClient();

  try {
    // Los precios de plan, para reconocer qué línea de la factura comisiona.
    const { data: planes } = await admin
      .from("plans")
      .select("code, name, price_monthly, stripe_price_id")
      .not("stripe_price_id", "is", null);

    const porPrecio = new Map<string, { precio: number; code: string }>(
      ((planes as any[]) ?? []).map((p) => [
        p.stripe_price_id,
        { precio: Number(p.price_monthly ?? 0), code: p.code },
      ]),
    );

    // Quién atiende a cada cliente, y con qué porcentaje.
    const { data: orgs } = await admin
      .from("organizations")
      .select("id, stripe_customer_id, atendido_por, comision_pct")
      .not("atendido_por", "is", null);

    const porCliente = new Map<string, { orgId: string; miembroId: string; pct: number | null }>();
    for (const o of ((orgs as any[]) ?? [])) {
      if (o.stripe_customer_id) {
        porCliente.set(o.stripe_customer_id, {
          orgId: o.id,
          miembroId: o.atendido_por,
          pct: o.comision_pct,
        });
      }
    }

    // Si nadie tiene cartera asignada no hay nada que devengar, y así nos
    // ahorramos pedirle a Stripe una lista que no vamos a usar.
    if (!porCliente.size) {
      return {
        revisadas: 0, apuntadas: 0, saltadas: 0,
        porQueNada:
          "Ningún cliente tiene vendedor asignado todavía, o los que lo tienen aún no han pagado en Stripe. " +
          "Asigna clientes desde esta misma pantalla y vuelve a calcular.",
      };
    }

    const { data: equipo } = await admin
      .from("equipo_demandu")
      .select("id, comision_pct, activo");
    const porMiembro = new Map<string, { pct: number | null; activo: boolean }>(
      ((equipo as any[]) ?? []).map((m) => [m.id, { pct: m.comision_pct, activo: !!m.activo }]),
    );

    const corte = Math.floor((desde ?? new Date(Date.now() - 45 * 86400_000)).getTime() / 1000);
    const facturas = await stripe(
      `/invoices?status=paid&limit=100&created[gte]=${corte}&expand[]=data.lines`,
    );

    let apuntadas = 0;
    let saltadas = 0;
    const lista: any[] = facturas?.data ?? [];

    for (const f of lista) {
      const rel = porCliente.get(String(f.customer ?? ""));
      if (!rel) { saltadas++; continue; }

      const miembro = porMiembro.get(rel.miembroId);
      if (!miembro?.activo) { saltadas++; continue; }

      // Solo las líneas cuyo precio es un plan nuestro. Los complementos
      // caen aquí y se quedan fuera, que es lo que se decidió.
      let base = 0;
      let precioMensual = 0;
      for (const l of (f.lines?.data ?? [])) {
        const priceId = l?.price?.id ?? l?.pricing?.price_details?.price ?? null;
        const plan = priceId ? porPrecio.get(priceId) : null;
        if (!plan) continue;
        base += Number(l.amount ?? 0) / 100;
        precioMensual = Math.max(precioMensual, plan.precio);
      }

      if (base <= 0) { saltadas++; continue; }

      // Lo más específico gana: primero lo pactado con ESTE cliente, luego lo
      // pactado con ESE vendedor, y si no hay nada, la escala.
      let pct = rel.pct ?? miembro.pct;
      if (pct == null) {
        const { data } = await admin.rpc("comision_de", { p_precio: precioMensual });
        pct = Number(data ?? 0);
      }

      const monto = Math.round(base * Number(pct)) / 100;

      // `upsert` con `ignoreDuplicates` sobre el id de la factura: si ya
      // estaba apuntada, no se toca. NUNCA se pisa una comisión existente —
      // esa fila puede estar ya pagada.
      const { error } = await admin.from("comisiones").upsert(
        {
          miembro_id: rel.miembroId,
          org_id: rel.orgId,
          periodo: periodoDe(Number(f.created ?? 0)),
          stripe_invoice_id: f.id,
          base,
          pct,
          monto,
          estado: "pendiente",
        },
        { onConflict: "stripe_invoice_id", ignoreDuplicates: true },
      );

      if (error) { saltadas++; continue; }
      apuntadas++;
    }

    return {
      revisadas: lista.length,
      apuntadas,
      saltadas,
      porQueNada: apuntadas
        ? undefined
        : lista.length === 0
          ? "Stripe no tiene ninguna factura pagada en los últimos 45 días."
          : `Se revisaron ${lista.length} factura(s) pagada(s), pero ninguna es de un cliente con vendedor asignado, o ya estaban apuntadas.`,
    };
  } catch (e: any) {
    return { revisadas: 0, apuntadas: 0, saltadas: 0, error: e?.message ?? "No se pudo calcular" };
  }
}

export type MiPanel = {
  miembro: any;
  clientes: any[];
  mrr: number;
  comisionMensual: number;
  cobradoEsteMes: number;
  pendienteDePago: number;
};

/**
 * Lo que ve un vendedor o un partner en su panel.
 *
 * SE LEE CON LA LLAVE DE SERVICIO Y EL ALCANCE SE COMPRUEBA AQUÍ, a mano.
 *
 * La alternativa —ensanchar `auth_org_ids()` para que un vendedor «pertenezca»
 * a las cuentas que atiende— habría sido más corta y es una idea pésima: esa
 * función es el cimiento del aislamiento entre clientes de TODA la plataforma.
 * Tocarla para una pantalla de comisiones es la clase de atajo que un día
 * termina con un cliente leyendo las conversaciones de otro.
 */
export async function miPanel(userId: string): Promise<MiPanel | null> {
  const admin = createAdminClient();

  const { data: miembro } = await admin
    .from("equipo_demandu")
    .select("*")
    .eq("user_id", userId)
    .eq("activo", true)
    .maybeSingle();

  if (!miembro) return null;

  let q = admin
    .from("organizations")
    .select("id, name, plan, estado_cobro, created_at, contacto_nombre, atendido_por")
    .is("datos_borrados_at", null);

  // Un partner SIEMPRE va por aquí. Un vendedor solo si su alcance lo dice.
  if (miembro.alcance !== "todas") q = q.eq("atendido_por", miembro.id);

  const [{ data: clientes }, { data: planes }, { data: comisiones }] = await Promise.all([
    q,
    admin.from("plans").select("code, name, price_monthly"),
    admin.from("comisiones").select("periodo, monto, estado").eq("miembro_id", miembro.id),
  ]);

  const precioDe = new Map<string, number>(
    ((planes as any[]) ?? []).map((p) => [p.code, Number(p.price_monthly ?? 0)]),
  );

  const lista = ((clientes as any[]) ?? []).map((c) => ({
    ...c,
    precio: precioDe.get(c.plan) ?? 0,
    // Solo cuenta para el MRR quien está al día. Un MRR que incluye pruebas y
    // pagos fallidos es un número que motiva hoy y decepciona a fin de mes.
    aporta: c.estado_cobro === "activa" ? precioDe.get(c.plan) ?? 0 : 0,
  }));

  const mrr = lista.reduce((s, c) => s + c.aporta, 0);

  const cs = (comisiones as any[]) ?? [];
  const mes = `${new Date().getUTCFullYear()}-${String(new Date().getUTCMonth() + 1).padStart(2, "0")}-01`;

  return {
    miembro,
    clientes: lista.sort((a, b) => b.aporta - a.aporta),
    mrr,
    // Lo que le tocaría si todos siguen pagando igual el mes que viene.
    comisionMensual:
      Math.round(
        lista.reduce((s, c) => {
          const pct = miembro.comision_pct ?? (c.precio > 99 ? 20 : 15);
          return s + (c.aporta * pct) / 100;
        }, 0) * 100,
      ) / 100,
    cobradoEsteMes: cs.filter((c) => c.periodo === mes && c.estado !== "anulada")
      .reduce((s, c) => s + Number(c.monto ?? 0), 0),
    pendienteDePago: cs.filter((c) => c.estado === "pendiente")
      .reduce((s, c) => s + Number(c.monto ?? 0), 0),
  };
}
