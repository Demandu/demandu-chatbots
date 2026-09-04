/**
 * En cuál de tus cuentas estás.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * ESTE ARCHIVO EXISTE POR UN FALLO REAL. El dueño entró como soporte a la cuenta
 * de un cliente y la plataforma le enseñó SU PROPIA cuenta. Su usuario tenía dos
 * filas en `memberships` —dueño de la suya, soporte temporal en la del cliente—
 * y el código elegía así:
 *
 *     .from("memberships").select("org_id").eq("user_id", user.id).limit(1)
 *
 * `limit(1)` SIN ORDEN no es «la primera»: es la que Postgres devuelva. Y lo que
 * de verdad asustaba no era eso: los permisos se preguntaban en OTRA consulta
 * igual de suelta. Dos sorteos independientes sobre las mismas dos filas, con lo
 * cual podía tocar organización del cliente + rol de dueño de la propia — y el
 * rol de dueño da por bueno cualquier permiso.
 *
 * ── POR QUÉ ES UNA FUNCIÓN PURA Y NO UNA CONSULTA ─────────────────────────
 *
 * Porque es la regla, no el viaje a la base. Un `order by` metido en una consulta
 * no se puede probar sin base de datos, y esto es exactamente lo que hay que
 * poder probar: qué pasa con dos filas, con soporte caducado, con empates. Aquí
 * se traen las membresías (son una o dos) y se decide en memoria, con pruebas.
 *
 * ── LA REGLA ──────────────────────────────────────────────────────────────
 *
 * 1. El soporte caducado no cuenta. No es «la más nueva»: es que no existe.
 * 2. Si hay soporte vigente, MANDA ESE. Entrar a la cuenta de un cliente
 *    significa entrar; mientras dure, la propia no se ve.
 * 3. Si no, la propia más antigua. Estable, nunca al azar.
 *
 * La misma precedencia está en `auth_org_ids()` y `auth_puede()` (migración
 * 0084). Si se cambia una, hay que cambiar las dos: la base es la que manda de
 * verdad, esto es lo que hace que la pantalla enseñe lo mismo que la base deja.
 * ─────────────────────────────────────────────────────────────────────────────
 */

export type Membresia = {
  org_id: string;
  role?: string | null;
  permisos?: unknown;
  soporte_hasta?: string | null;
  created_at?: string | null;
};

/** Milisegundos de una fecha, o `null` si no se puede leer. */
function cuando(v: string | null | undefined): number | null {
  if (!v) return null;
  const t = new Date(String(v)).getTime();
  return Number.isNaN(t) ? null : t;
}

/**
 * ¿Esta fila es un acceso de soporte que sigue vivo?
 *
 * UNA FECHA ILEGIBLE NO CUENTA COMO VIGENTE. Si la columna trae basura, tratarla
 * como soporte abierto sería dar acceso a una cuenta ajena por un dato roto.
 */
export function soporteVigente(m: Membresia, ahora: Date = new Date()): boolean {
  const t = cuando(m.soporte_hasta);
  return t !== null && t > ahora.getTime();
}

/** ¿Es una membresía propia, de las de siempre? */
function esPropia(m: Membresia): boolean {
  return m.soporte_hasta === null || m.soporte_hasta === undefined;
}

/**
 * La membresía activa: en qué cuenta estás y con qué rol.
 *
 * Devuelve la fila ENTERA a propósito. Que la organización y los permisos salgan
 * del mismo objeto es justamente lo que impide el cruce de antes.
 */
export function membresiaActiva(
  filas: Membresia[] | null | undefined,
  ahora: Date = new Date(),
): Membresia | null {
  const todas = Array.isArray(filas) ? filas.filter((m) => m && m.org_id) : [];
  if (!todas.length) return null;

  const soportes = todas.filter((m) => soporteVigente(m, ahora));
  if (soportes.length) {
    // Con varios (no debería haberlos: la base lo impide con un índice único),
    // el que caduca más tarde es el que se abrió último.
    return [...soportes].sort((a, b) => {
      const d = (cuando(b.soporte_hasta) ?? 0) - (cuando(a.soporte_hasta) ?? 0);
      return d !== 0 ? d : a.org_id.localeCompare(b.org_id);
    })[0];
  }

  // Ni una sola propia: solo quedaban accesos de soporte caducados. No estás
  // en ninguna cuenta, y decirlo así es lo correcto — antes se devolvía la
  // caducada y la pantalla se pintaba con datos que la base ya no dejaba leer.
  const propias = todas.filter(esPropia);
  if (!propias.length) return null;

  return [...propias].sort((a, b) => {
    const d = (cuando(a.created_at) ?? 0) - (cuando(b.created_at) ?? 0);
    return d !== 0 ? d : a.org_id.localeCompare(b.org_id);
  })[0];
}
