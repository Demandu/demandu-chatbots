import {
  API_LUGARES,
  CAMPOS_DEL_PUNTO,
  cuerpoDeSugerencias,
  leerSugerencias,
  leerPunto,
  valeLaPenaBuscar,
  PAIS_POR_DEFECTO,
} from "@/lib/lugares/google";

export const dynamic = "force-dynamic";

/**
 * BUSCAR DIRECCIONES SIN QUE LA LLAVE SALGA DE AQUÍ.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * POR QUÉ NO SE PONE LA LLAVE EN EL NAVEGADOR, QUE ES LO NORMAL.
 *
 * Lo normal es meterla en la página y restringirla por dominio. Para una web
 * corporativa vale. Aquí no: la tienda es PÚBLICA y su código lo ve cualquiera.
 * Sacar la llave es abrir el inspector, y la restricción por dominio se salta
 * mandando una cabecera `Referer` a mano — cosa de un minuto.
 *
 * Y la factura no la pagaría quien la robó: la paga Demandu. Una llave de
 * Google suelta en una página pública es una tarjeta de crédito con el número
 * escrito por fuera.
 *
 * Pasando por aquí, la llave vive en una variable de entorno del servidor y
 * nunca viaja. Y de paso se puede poner un tope, que es lo que convierte un
 * incidente en una molestia.
 *
 * ── EL TOPE ES POR NAVEGADOR Y EN MEMORIA, Y SÉ LO QUE ESO NO ES ──────────
 *
 * No es una defensa contra alguien decidido: se reinicia con el servidor y no
 * se comparte entre instancias. Es una defensa contra lo que de verdad pasa —
 * un componente con un bucle, una pestaña olvidada, un `useEffect` mal puesto—
 * que es lo que genera facturas raras. Contra un atacante hace falta otra cosa,
 * y se dice aquí para que nadie confunda esto con aquello.
 * ─────────────────────────────────────────────────────────────────────────────
 */

/** Cuántas búsquedas por navegador y por hora. Generoso para una persona real. */
const TOPE_POR_HORA = 300;
const VENTANA_MS = 60 * 60 * 1000;

const contador = new Map<string, { hasta: number; n: number }>();

function pasaElTope(quien: string): boolean {
  const ahora = Date.now();
  const v = contador.get(quien);
  if (!v || v.hasta < ahora) {
    contador.set(quien, { hasta: ahora + VENTANA_MS, n: 1 });
    // LIMPIEZA BARATA. Sin esto el mapa crece para siempre en un servidor que
    // no se reinicia — una fuga de memoria lenta, de las que se descubren un
    // domingo.
    if (contador.size > 5000) {
      for (const [k, val] of contador) if (val.hasta < ahora) contador.delete(k);
    }
    return true;
  }
  v.n += 1;
  return v.n <= TOPE_POR_HORA;
}

function deQuien(req: Request): string {
  const h = req.headers;
  return (
    h.get("x-nf-client-connection-ip") ||
    (h.get("x-forwarded-for") ?? "").split(",")[0].trim() ||
    "desconocido"
  );
}

export async function POST(req: Request) {
  const llave = (process.env.GOOGLE_LUGARES_API_KEY ?? "").trim();
  // SIN LLAVE SE CONTESTA «no hay», NO SE REVIENTA. El campo tiene que seguir
  // dejando escribir a mano: quedarse sin sugerencias es una molestia, un
  // formulario roto es una venta perdida.
  if (!llave) return Response.json({ ok: false, motivo: "sin_llave", sugerencias: [] });

  if (!pasaElTope(deQuien(req))) {
    return Response.json({ ok: false, motivo: "demasiadas", sugerencias: [] }, { status: 429 });
  }

  const cuerpo = (await req.json().catch(() => null)) as {
    que?: string;
    texto?: string;
    busqueda?: string;
    id?: string;
    pais?: string;
  } | null;

  if (!cuerpo) return Response.json({ ok: false, motivo: "peticion_ilegible" }, { status: 400 });

  try {
    /* ── Sugerencias mientras escribe ──────────────────────────────────────── */
    if (cuerpo.que === "sugerencias") {
      // EL TOPE DE LETRAS SE COMPRUEBA AQUÍ TAMBIÉN. El componente ya lo hace,
      // pero el componente es una comodidad: esto es la puerta, y cada llamada
      // que pare es una que no se paga.
      if (!valeLaPenaBuscar(cuerpo.texto)) {
        return Response.json({ ok: true, sugerencias: [] });
      }

      const r = await fetch(`${API_LUGARES}/places:autocomplete`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Goog-Api-Key": llave,
        },
        body: JSON.stringify(
          cuerpoDeSugerencias({
            texto: String(cuerpo.texto ?? ""),
            busqueda: String(cuerpo.busqueda ?? ""),
            pais: cuerpo.pais ?? PAIS_POR_DEFECTO,
          }),
        ),
        signal: AbortSignal.timeout(8000),
        cache: "no-store",
      });

      const datos = await r.json().catch(() => null);
      if (!r.ok) {
        console.error("[lugares] Google dijo que no:", r.status, JSON.stringify(datos)?.slice(0, 300));
        return Response.json({ ok: false, motivo: "google", sugerencias: [] });
      }
      return Response.json({ ok: true, sugerencias: leerSugerencias(datos) });
    }

    /* ── Las coordenadas del elegido ───────────────────────────────────────── */
    if (cuerpo.que === "punto") {
      const id = String(cuerpo.id ?? "").trim();
      if (!id) return Response.json({ ok: false, motivo: "sin_id" }, { status: 400 });

      const url = new URL(`${API_LUGARES}/places/${encodeURIComponent(id)}`);
      // El identificador de búsqueda CIERRA la sesión aquí. Sin esto, todas las
      // llamadas de sugerencia de esa búsqueda se cobran sueltas.
      if (cuerpo.busqueda) url.searchParams.set("sessionToken", String(cuerpo.busqueda));
      url.searchParams.set("languageCode", "es");

      const r = await fetch(url, {
        headers: {
          "X-Goog-Api-Key": llave,
          // SOLO TRES CAMPOS. Pedir horarios, fotos o reseñas —que no usamos—
          // salta a una tarifa tres veces mayor por la misma llamada.
          "X-Goog-FieldMask": CAMPOS_DEL_PUNTO,
        },
        signal: AbortSignal.timeout(8000),
        cache: "no-store",
      });

      const datos = await r.json().catch(() => null);
      if (!r.ok) {
        console.error("[lugares] Google dijo que no:", r.status, JSON.stringify(datos)?.slice(0, 300));
        return Response.json({ ok: false, motivo: "google" });
      }

      const punto = leerPunto(datos);
      if (!punto) return Response.json({ ok: false, motivo: "sin_punto" });
      return Response.json({ ok: true, punto });
    }

    return Response.json({ ok: false, motivo: "no_se_que_pides" }, { status: 400 });
  } catch (e) {
    console.error("[lugares] no se pudo hablar con Google:", e);
    return Response.json({ ok: false, motivo: "sin_respuesta", sugerencias: [] });
  }
}
