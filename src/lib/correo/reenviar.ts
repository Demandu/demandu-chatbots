/**
 * QUÉ CORREO SE LE PUEDE REENVIAR A UNA PERSONA, Y POR QUÉ NO LOS OTROS.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * Cuando alguien dice «no me llegó», el equipo abre Superadmin → Correos, busca
 * su dirección y reenvía. Este módulo decide qué botones salen, y es puro para
 * poder probar cada caso sin mandar nada a nadie.
 *
 * NO SALEN TODOS LOS BOTONES SIEMPRE, y no es estética. Reenviar «confirma tu
 * cuenta» a quien ya la confirmó le manda un enlace que no hace nada; reenviar
 * la invitación a quien ya entró, Supabase lo rechaza. Un botón que existe se
 * pulsa: si no tiene sentido para esa persona, no se pinta — se dice por qué.
 *
 * LA ACCIÓN LO VUELVE A CALCULAR. Que el botón no salga no impide que alguien
 * mande el formulario a mano; por eso el servidor llama a esta misma función
 * con lo que lee de la base, no con lo que llega del navegador.
 * ─────────────────────────────────────────────────────────────────────────────
 */

export type TipoDeReenvio = "confirmar" | "invitacion" | "contrasena" | "bienvenida";

export const TIPOS_DE_REENVIO: TipoDeReenvio[] = ["confirmar", "invitacion", "contrasena", "bienvenida"];

/** Lo que se sabe de la persona, sacado de `auth.users`. */
export type Persona = {
  confirmadoEl: string | null;
  invitadoEl: string | null;
  /** Último «confirma tu cuenta» o invitación que mandó Supabase. */
  confirmacionEnviadaEl: string | null;
  /** Último «cambia tu contraseña» que mandó Supabase. */
  recuperacionEnviadaEl: string | null;
  /** «email», «apple», «facebook»… por dónde puede entrar. */
  proveedores: string[];
};

export type Opcion = {
  tipo: TipoDeReenvio;
  nombre: string;
  /** Si se puede pulsar. */
  vale: boolean;
  /** Por qué no, o qué va a pasar si se pulsa. Siempre dice algo. */
  nota: string;
};

/**
 * Supabase no deja mandar dos correos de autenticación a la misma dirección en
 * menos de un minuto. Se dice antes de pulsar en vez de dejar que conteste
 * «For security purposes, you can only request this after 52 seconds».
 */
export const ESPERA_DE_SUPABASE_S = 60;

export function segundosParaPoderReenviar(ultimo: string | null, ahora: Date): number {
  if (!ultimo) return 0;
  const t = new Date(ultimo).getTime();
  if (!Number.isFinite(t)) return 0;
  const pasados = Math.floor((ahora.getTime() - t) / 1000);
  return Math.max(0, ESPERA_DE_SUPABASE_S - pasados);
}

export const NOMBRES: Record<TipoDeReenvio, string> = {
  confirmar: "Confirmar la cuenta",
  invitacion: "Invitación al equipo",
  contrasena: "Cambiar la contraseña",
  bienvenida: "Bienvenida",
};

/** La etiqueta con la que queda apuntado en `correos_enviados`. */
export function etiquetaDeReenvio(tipo: TipoDeReenvio): string {
  return `reenvio_${tipo}`;
}

export function esTipoDeReenvio(t: unknown): t is TipoDeReenvio {
  return typeof t === "string" && (TIPOS_DE_REENVIO as string[]).includes(t);
}

/**
 * Los tres de Supabase. La bienvenida va aparte porque depende del negocio, no
 * de la persona (ver `opcionDeBienvenida`).
 */
export function opcionesDeSupabase(p: Persona, ahora: Date): Opcion[] {
  const confirmado = !!p.confirmadoEl;
  const invitado = !!p.invitadoEl;
  const conClave = p.proveedores.length === 0 || p.proveedores.includes("email");
  const espera = (ultimo: string | null) => segundosParaPoderReenviar(ultimo, ahora);

  // ── Confirmar la cuenta ────────────────────────────────────────────────
  let confirmar: Opcion;
  if (confirmado) {
    confirmar = { tipo: "confirmar", nombre: NOMBRES.confirmar, vale: false, nota: "Ya confirmó su cuenta." };
  } else if (invitado) {
    // A quien se invitó no le llega «confirma tu cuenta»: le llega la
    // invitación, y aceptarla es lo que confirma.
    confirmar = {
      tipo: "confirmar",
      nombre: NOMBRES.confirmar,
      vale: false,
      nota: "Entró por invitación: lo que hay que reenviarle es la invitación.",
    };
  } else if (espera(p.confirmacionEnviadaEl) > 0) {
    confirmar = {
      tipo: "confirmar",
      nombre: NOMBRES.confirmar,
      vale: false,
      nota: `Se le acaba de mandar uno. Espera ${espera(p.confirmacionEnviadaEl)} segundos.`,
    };
  } else {
    confirmar = {
      tipo: "confirmar",
      nombre: NOMBRES.confirmar,
      vale: true,
      nota: "Le llega el enlace para confirmar. Al abrirlo, ya puede entrar con su contraseña.",
    };
  }

  // ── Invitación ─────────────────────────────────────────────────────────
  let invitacion: Opcion;
  if (!invitado) {
    invitacion = { tipo: "invitacion", nombre: NOMBRES.invitacion, vale: false, nota: "No entró por invitación." };
  } else if (confirmado) {
    invitacion = { tipo: "invitacion", nombre: NOMBRES.invitacion, vale: false, nota: "Ya aceptó la invitación." };
  } else if (espera(p.confirmacionEnviadaEl) > 0) {
    invitacion = {
      tipo: "invitacion",
      nombre: NOMBRES.invitacion,
      vale: false,
      nota: `Se le acaba de mandar una. Espera ${espera(p.confirmacionEnviadaEl)} segundos.`,
    };
  } else {
    invitacion = {
      tipo: "invitacion",
      nombre: NOMBRES.invitacion,
      vale: true,
      nota: "Le llega otra vez el enlace para aceptar y crear su contraseña.",
    };
  }

  // ── Cambiar la contraseña ──────────────────────────────────────────────
  let contrasena: Opcion;
  if (!confirmado) {
    // Un enlace de recuperación a una cuenta sin confirmar la confirma por la
    // puerta de atrás, y el problema real («no me llegó el de confirmar»)
    // queda sin ver. Primero lo primero.
    contrasena = {
      tipo: "contrasena",
      nombre: NOMBRES.contrasena,
      vale: false,
      nota: invitado ? "Primero tiene que aceptar la invitación." : "Primero tiene que confirmar su cuenta.",
    };
  } else if (espera(p.recuperacionEnviadaEl) > 0) {
    contrasena = {
      tipo: "contrasena",
      nombre: NOMBRES.contrasena,
      vale: false,
      nota: `Se le acaba de mandar uno. Espera ${espera(p.recuperacionEnviadaEl)} segundos.`,
    };
  } else {
    contrasena = {
      tipo: "contrasena",
      nombre: NOMBRES.contrasena,
      vale: true,
      nota: conClave
        ? "Le llega el enlace para elegir una contraseña nueva."
        : `Entra con ${p.proveedores.map(nombreDeProveedor).join(" y ")}. Si se lo mandas, podrá entrar también con contraseña.`,
    };
  }

  return [confirmar, invitacion, contrasena];
}

/** La bienvenida de un negocio: siempre se puede, si tiene a quién. */
export function opcionDeBienvenida(negocio: { contacto_email: string | null }): Opcion {
  const para = String(negocio.contacto_email ?? "").trim();
  if (!para) {
    return {
      tipo: "bienvenida",
      nombre: NOMBRES.bienvenida,
      vale: false,
      nota: "Este negocio no tiene correo de contacto.",
    };
  }
  return { tipo: "bienvenida", nombre: NOMBRES.bienvenida, vale: true, nota: `Va a ${para}, el contacto del negocio.` };
}

export function nombreDeProveedor(p: string): string {
  const n: Record<string, string> = { apple: "Apple", facebook: "Facebook", google: "Google", email: "correo" };
  return n[p] ?? p;
}

/**
 * Lo que dice la pantalla cuando salió. Para los de Supabase, «salió» quiere
 * decir que Supabase lo aceptó y se lo pasó a Google — no que esté en la
 * bandeja. Decir más sería mentir.
 */
export function mensajeDeExito(tipo: TipoDeReenvio, para: string): string {
  if (tipo === "bienvenida") return `Bienvenida reenviada a ${para}.`;
  return `${NOMBRES[tipo]}: reenviado a ${para}. Si en unos minutos no lo ve, que mire en spam o promociones.`;
}

/** Los errores de Supabase que más salen, en cristiano. El original va detrás. */
export function falloEnHumano(mensaje: string): string {
  const m = String(mensaje ?? "");
  if (/after \d+ seconds|security purposes/i.test(m)) return "Supabase pide esperar un minuto entre un correo y otro a la misma persona.";
  if (/rate limit/i.test(m)) return "Se llegó al límite de correos por hora de Supabase (Authentication → Rate Limits).";
  if (/already been registered|already registered/i.test(m)) return "Esa persona ya aceptó: no hay invitación que reenviar.";
  if (/smtp|sending/i.test(m)) return `Supabase no pudo entregarlo a Google: ${m}`;
  return m || "No se pudo mandar.";
}
