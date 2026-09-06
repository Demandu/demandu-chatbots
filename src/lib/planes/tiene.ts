import "server-only";
import { cache } from "react";
import { createClient } from "@/lib/supabase/server";
import { tiene, type ClaveFeature } from "./features";

/**
 * Qué puede esta cuenta, preguntado al único que lo sabe.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * LA RESPUESTA SALE DE LA BASE (`org_features`), no de leer el plan aquí. El
 * cálculo real junta tres cosas —lo que trae el plan, lo que desbloquean los
 * complementos contratados y lo que la cuenta conserva por encima de su plan— y
 * tenerlo escrito dos veces es cómo se acaba con la pantalla diciendo una cosa
 * y el motor haciendo otra.
 *
 * VA EN `cache()`: la barra lateral, el marco y la propia página lo preguntan
 * en el mismo render. Sin esto serían tres viajes por navegación.
 *
 * ── LO QUE ESTO NO ES ─────────────────────────────────────────────────────
 *
 * NO ES EL FRENO. Esto sirve para PINTAR: enseñar la función apagada con su
 * mensaje. El freno de verdad va donde se gasta el dinero —antes de llamar al
 * modelo— porque una pantalla apagada no impide llamar la acción por debajo.
 * ─────────────────────────────────────────────────────────────────────────────
 */
export const misFeatures = cache(async function misFeatures(): Promise<string[]> {
  try {
    const sb = createClient();
    const { data: { user } } = await sb.auth.getUser();
    if (!user) return [];

    const { data } = await sb.rpc("org_features_mias");
    return Array.isArray(data) ? (data as string[]) : [];
  } catch {
    // ANTE LA DUDA, NADA. Un fallo de la base no puede convertirse en barra
    // libre; que la función salga apagada es molesto y se arregla escribiendo.
    return [];
  }
});

/** ¿Puede esta cuenta usar esto? */
export async function puedeUsar(clave: ClaveFeature): Promise<boolean> {
  return tiene(await misFeatures(), clave);
}
