import { createAdminClient } from "@/lib/supabase/admin";

/**
 * Trae el tipo de cambio de fuera y lo guarda.
 *
 * Vive aparte de `cambio.ts` a propósito: aquel lo importa una pantalla de
 * cliente y solo LEE; este usa la llave de servicio y ESCRIBE. Mezclarlos
 * sería meter la llave de servicio en el mismo módulo que toca una pantalla
 * de cliente, y esa es exactamente la clase de descuido que un día se cuela
 * al navegador.
 *
 * Lo llaman dos sitios: la tarea programada y el botón del superadmin.
 */

const FUENTES: { nombre: string; url: string; leer: (j: any) => number | null }[] = [
  {
    nombre: "Frankfurter (BCE)",
    // La dirección canónica. `api.frankfurter.app` todavía funciona pero
    // redirige aquí; apuntar directo ahorra un salto y no depende de que
    // sigan manteniendo el redirección.
    url: "https://api.frankfurter.dev/v1/latest?from=USD&to=MXN",
    leer: (j) => Number(j?.rates?.MXN) || null,
  },
  {
    nombre: "open.er-api.com",
    url: "https://open.er-api.com/v6/latest/USD",
    leer: (j) => Number(j?.rates?.MXN) || null,
  },
];

/** Un peso jamás ha valido esto. Fuera de este rango el dato viene mal y se
 *  descarta: escribir un 0.05 o un 900 rompería toda la pantalla de precios. */
const MINIMO = 5;
const MAXIMO = 60;

export type ResultadoCambio =
  | { ok: true; valor: number; fuente: string }
  | { ok: false; intentos: string[] };

export async function refrescarTipoDeCambio(): Promise<ResultadoCambio> {
  const intentos: string[] = [];

  // DOS FUENTES, NO UNA. Un tipo de cambio no es crítico, pero sí de los que
  // se quedan viejos en silencio: la pantalla deja de enseñar pesos a los 7
  // días y nadie se entera hasta que un cliente pregunta.
  for (const f of FUENTES) {
    try {
      const ctl = new AbortController();
      const reloj = setTimeout(() => ctl.abort(), 8000);
      const res = await fetch(f.url, { signal: ctl.signal, cache: "no-store" });
      clearTimeout(reloj);

      if (!res.ok) {
        intentos.push(`${f.nombre}: HTTP ${res.status}`);
        continue;
      }

      const valor = f.leer(await res.json());
      if (!valor || valor < MINIMO || valor > MAXIMO) {
        intentos.push(`${f.nombre}: valor fuera de rango (${valor})`);
        continue;
      }

      const { error } = await createAdminClient()
        .from("tipos_de_cambio")
        .upsert(
          { moneda: "MXN", valor, fuente: f.nombre, actualizado_at: new Date().toISOString() },
          { onConflict: "moneda" },
        );

      if (error) {
        intentos.push(`${f.nombre}: no se pudo guardar (${error.message})`);
        continue;
      }

      return { ok: true, valor, fuente: f.nombre };
    } catch (e: any) {
      intentos.push(`${f.nombre}: ${e?.name === "AbortError" ? "tardó demasiado" : e?.message ?? "falló"}`);
    }
  }

  return { ok: false, intentos };
}
