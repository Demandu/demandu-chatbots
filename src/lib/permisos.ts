/**
 * Qué puede hacer cada persona del equipo.
 *
 * DOS IDEAS, Y ES IMPORTANTE NO MEZCLARLAS:
 *
 *   · El ROL es un atajo: "esta persona es de atención al cliente". Trae unos
 *     permisos por defecto sensatos para que dar de alta a alguien sea marcar
 *     una opción y no trece.
 *   · Los PERMISOS son la verdad. El dueño puede encender o apagar cualquiera
 *     de ellos uno por uno, y eso manda sobre el rol.
 *
 * El dueño (`owner`) es intocable: SIEMPRE tiene todo, nadie puede degradarlo
 * y él tampoco a sí mismo. Sin esa regla existe el caso clásico de quedarte
 * fuera de tu propia cuenta sin manera de volver a entrar.
 *
 * Aquí solo vive la DECISIÓN, sin base de datos ni React, para poder probarla
 * de verdad. Quién eres lo resuelve `permisos-server.ts`; esconder lo que no
 * te toca, la barra lateral; y prohibirlo de verdad, cada pantalla.
 */

export type Rol = "owner" | "admin" | "coordinador" | "developer" | "agent" | "viewer";

export type ClavePermiso =
  | "chatbots"
  | "conversaciones"
  | "embudo"
  | "contactos"
  | "resultados"
  | "ia"
  | "config"
  | "equipo"
  | "plan"
  | "conexiones"
  | "envios"
  | "borrar";

/**
 * La lista que ve el dueño como casillas. El orden es el de la pantalla.
 * `riesgo` marca los que conviene pensar dos veces antes de conceder.
 */
export const PERMISOS: {
  clave: ClavePermiso;
  nombre: string;
  descripcion: string;
  riesgo?: boolean;
}[] = [
  { clave: "conversaciones", nombre: "Conversaciones", descripcion: "Atender la bandeja y responder a los clientes." },
  { clave: "embudo", nombre: "Embudo", descripcion: "Ver el embudo y mover tarjetas entre etapas." },
  { clave: "contactos", nombre: "Contactos", descripcion: "Ver y editar la ficha de los contactos." },
  { clave: "chatbots", nombre: "Chatbots", descripcion: "Crear y editar chatbots y sus conversaciones automáticas." },
  { clave: "ia", nombre: "Lana IA y Entrenamiento", descripcion: "Cambiar la personalidad de la IA y lo que sabe del negocio." },
  { clave: "resultados", nombre: "Resultados", descripcion: "Ver la analítica: conversaciones, tiempos de respuesta y cierre." },
  { clave: "config", nombre: "Configuración", descripcion: "Etiquetas, atributos, etapas, horario y respuestas rápidas." },
  { clave: "envios", nombre: "Envíos masivos", descripcion: "Crear y lanzar campañas.", riesgo: true },
  { clave: "conexiones", nombre: "Conexiones e integraciones", descripcion: "Conectar canales y servicios externos.", riesgo: true },
  { clave: "equipo", nombre: "Equipo y permisos", descripcion: "Dar de alta personas y decidir qué puede hacer cada una.", riesgo: true },
  { clave: "plan", nombre: "Plan y facturación", descripcion: "Ver el consumo, cambiar de plan y contratar complementos.", riesgo: true },
  { clave: "borrar", nombre: "Eliminar información", descripcion: "Borrar conversaciones y contactos. No se puede deshacer.", riesgo: true },
];

export const TODAS: ClavePermiso[] = PERMISOS.map((p) => p.clave);

export const ROLES: { valor: Rol; nombre: string; descripcion: string }[] = [
  { valor: "owner", nombre: "Dueño", descripcion: "Acceso total. Solo puede haber uno y no se le pueden quitar permisos." },
  { valor: "admin", nombre: "Administrador", descripcion: "Puede con todo salvo tocar al dueño." },
  { valor: "coordinador", nombre: "Coordinador", descripcion: "Lleva la operación del día a día. No arma chatbots ni toca la IA, y no entra a la facturación." },
  { valor: "agent", nombre: "Atención al cliente", descripcion: "Atiende conversaciones, mueve el embudo y edita contactos. Nada más." },
  { valor: "developer", nombre: "Desarrollo", descripcion: "Arma chatbots, entrena a Lana y conecta las APIs. No atiende clientes." },
  { valor: "viewer", nombre: "Solo lectura", descripcion: "Mira y no toca." },
];

/**
 * Lo que trae cada rol de fábrica. El dueño no aparece: siempre tiene todo, y
 * ponerlo aquí invitaría a que alguien "editara" esa lista algún día.
 */
const DE_DESARROLLO: ClavePermiso[] = ["chatbots", "ia", "conexiones"];

/**
 * Lo que el coordinador NO trae de fábrica aunque sea «todo menos desarrollo».
 *
 * Decidido con el dueño: un coordinador lleva la operación del día a día, no
 * la caja. «Plan y facturación» deja cambiar el plan y contratar complementos;
 * «Eliminar información» borra conversaciones y contactos sin vuelta atrás.
 * Ninguna de las dos es coordinar.
 *
 * No es una prohibición: el dueño puede dárselas a una persona concreta
 * marcando la casilla. Lo que cambia aquí es con qué nace el rol.
 */
const FUERA_DEL_COORDINADOR: ClavePermiso[] = ["plan", "borrar"];

const POR_ROL: Record<Exclude<Rol, "owner">, ClavePermiso[]> = {
  admin: [...TODAS],
  // «Todo menos lo de desarrollo». Se calcula restando en vez de escribir la
  // lista a mano: así, el día que nazca un permiso nuevo, el coordinador lo
  // hereda solo — y no se queda fuera de algo por un olvido al añadirlo.
  coordinador: TODAS.filter(
    (c) => !DE_DESARROLLO.includes(c) && !FUERA_DEL_COORDINADOR.includes(c),
  ),
  agent: ["conversaciones", "embudo", "contactos"],
  developer: [...DE_DESARROLLO],
  viewer: ["embudo", "contactos", "resultados"],
};

/**
 * ⚠️ ESTA TABLA ESTÁ REPETIDA EN POSTGRES, en `auth_puede(text)`.
 *
 * No es descuido: la base tiene que poder decidir igual que la interfaz para
 * sostener las políticas de RLS sin reescribir el criterio en dos idiomas.
 * SI SE CAMBIA AQUÍ, HAY QUE CAMBIARLA ALLÁ (migración 0049).
 */

/** Lo guardado en `memberships.permisos`: solo lo que se cambió a mano. */
export type Ajustes = Partial<Record<ClavePermiso, boolean>> | null | undefined;

/**
 * Los permisos EFECTIVOS de una persona.
 *
 * Se parte del rol y encima se aplica lo que el dueño haya tocado a mano. Se
 * guarda solo la diferencia, no la lista entera: así, si mañana cambiamos qué
 * trae "Atención al cliente" de fábrica, todo el mundo lo hereda sin tener que
 * migrar nada — salvo quien tenga una excepción puesta a propósito.
 */
export function resolverPermisos(rol: Rol | string | null | undefined, ajustes?: Ajustes): Set<ClavePermiso> {
  // El dueño lo tiene todo, pase lo que pase y diga lo que diga `ajustes`.
  if (rol === "owner") return new Set(TODAS);

  const base = POR_ROL[(rol as Exclude<Rol, "owner">)] ?? POR_ROL.viewer;
  const set = new Set<ClavePermiso>(base);

  for (const [clave, valor] of Object.entries(ajustes ?? {})) {
    if (!TODAS.includes(clave as ClavePermiso)) continue; // clave vieja o basura
    if (valor === true) set.add(clave as ClavePermiso);
    if (valor === false) set.delete(clave as ClavePermiso);
  }
  return set;
}

/** ¿Puede? Se pregunta así en todas partes, para que no haya dos formas. */
export function puede(permisos: Set<ClavePermiso> | null | undefined, clave: ClavePermiso): boolean {
  return !!permisos?.has(clave);
}

/**
 * Qué guardar cuando el dueño marca las casillas.
 *
 * Solo se apunta lo que se APARTA del rol. Si alguien de "Atención al cliente"
 * queda exactamente con lo de su rol, no se guarda nada y basta con cambiarle
 * el rol para moverlo entero.
 */
export function diferenciaConElRol(rol: Rol | string, elegidos: ClavePermiso[]): Record<string, boolean> {
  if (rol === "owner") return {};
  const base = new Set(POR_ROL[(rol as Exclude<Rol, "owner">)] ?? POR_ROL.viewer);
  const marcados = new Set(elegidos);
  const out: Record<string, boolean> = {};
  for (const c of TODAS) {
    const antes = base.has(c);
    const ahora = marcados.has(c);
    if (antes !== ahora) out[c] = ahora;
  }
  return out;
}

/** A dónde mandar a alguien que no puede ver la pantalla que pidió. */
export const RUTA_POR_PERMISO: Record<ClavePermiso, string> = {
  conversaciones: "/inbox",
  embudo: "/crm",
  contactos: "/contacts",
  chatbots: "/bots",
  ia: "/settings/ai",
  resultados: "/analytics",
  config: "/settings",
  envios: "/campaigns",
  conexiones: "/settings/integrations",
  equipo: "/settings/teams",
  plan: "/settings/plan",
  borrar: "/inbox",
};
