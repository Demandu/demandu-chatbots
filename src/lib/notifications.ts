/**
 * Avisos de mensajes nuevos.
 *
 * Las preferencias viven en ESTE navegador (localStorage), no en la cuenta:
 * cada persona del equipo decide cómo quiere que le avisen en su computadora,
 * sin afectar a los demás. Los tonos se generan con Web Audio, así que no hay
 * archivos de sonido que descargar ni que puedan fallar.
 */

export type Tono = "campana" | "burbuja" | "toc" | "trino" | "suave";

export type PrefsAviso = {
  /** Interruptor maestro */
  activo: boolean;
  /** Reproducir un tono */
  sonido: boolean;
  tono: Tono;
  /** 0 a 100 */
  volumen: number;
  /** Aviso del sistema operativo (fuera del navegador) */
  escritorio: boolean;
  /** Contador en el título de la pestaña */
  titulo: boolean;
  /** Solo avisar de las conversaciones asignadas a mí */
  soloMias: boolean;
  /** Silencio por horario */
  silencioActivo: boolean;
  silencioDesde: string; // "20:00"
  silencioHasta: string; // "08:00"
  /** Silenciado hasta esta hora (epoch ms). 0 = no silenciado */
  silenciarHasta: number;
};

export const PREFS_DEFAULT: PrefsAviso = {
  activo: true,
  sonido: true,
  tono: "campana",
  volumen: 60,
  escritorio: false,
  titulo: true,
  soloMias: false,
  silencioActivo: false,
  silencioDesde: "20:00",
  silencioHasta: "08:00",
  silenciarHasta: 0,
};

const CLAVE = "demandu.avisos";
/** Evento propio para que todas las pantallas abiertas se enteren del cambio. */
export const EVENTO_PREFS = "demandu:avisos-cambiaron";

export function leerPrefs(): PrefsAviso {
  if (typeof window === "undefined") return PREFS_DEFAULT;
  try {
    const raw = window.localStorage.getItem(CLAVE);
    return raw ? { ...PREFS_DEFAULT, ...(JSON.parse(raw) as Partial<PrefsAviso>) } : PREFS_DEFAULT;
  } catch {
    return PREFS_DEFAULT;
  }
}

export function guardarPrefs(p: PrefsAviso) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(CLAVE, JSON.stringify(p));
    window.dispatchEvent(new CustomEvent(EVENTO_PREFS));
  } catch {
    /* si el navegador no deja guardar, seguimos con los valores por defecto */
  }
}

/** ¿Estamos dentro del horario de silencio, o silenciado a mano? */
export function enSilencio(p: PrefsAviso, ahora = new Date()): boolean {
  if (p.silenciarHasta && Date.now() < p.silenciarHasta) return true;
  if (!p.silencioActivo) return false;
  const min = (t: string) => {
    const [h, m] = String(t ?? "").split(":").map(Number);
    return (Number.isFinite(h) ? h : 0) * 60 + (Number.isFinite(m) ? m : 0);
  };
  const ahoraMin = ahora.getHours() * 60 + ahora.getMinutes();
  const desde = min(p.silencioDesde);
  const hasta = min(p.silencioHasta);
  // Si cruza la medianoche (ej. 20:00 → 08:00), el rango es "fuera del medio".
  return desde <= hasta ? ahoraMin >= desde && ahoraMin < hasta : ahoraMin >= desde || ahoraMin < hasta;
}

/** ¿Debe avisar ahora mismo? */
export function debeAvisar(p: PrefsAviso): boolean {
  return p.activo && !enSilencio(p);
}

// ── Tonos ────────────────────────────────────────────────────────────────────
// Cada tono es una secuencia de notas: [frecuencia Hz, inicio s, duración s].
const TONOS: Record<Tono, { notas: [number, number, number][]; onda: OscillatorType }> = {
  campana: { onda: "sine", notas: [[880, 0, 0.16], [1174.7, 0.1, 0.28]] },
  burbuja: { onda: "sine", notas: [[523.3, 0, 0.09], [784, 0.07, 0.16]] },
  toc: { onda: "triangle", notas: [[300, 0, 0.06], [220, 0.07, 0.09]] },
  trino: { onda: "sine", notas: [[1046.5, 0, 0.08], [1318.5, 0.07, 0.08], [1568, 0.14, 0.2]] },
  suave: { onda: "sine", notas: [[440, 0, 0.5]] },
};

export const TONOS_DISPONIBLES: { id: Tono; nombre: string }[] = [
  { id: "campana", nombre: "Campana" },
  { id: "burbuja", nombre: "Burbuja" },
  { id: "toc", nombre: "Toc toc" },
  { id: "trino", nombre: "Trino" },
  { id: "suave", nombre: "Suave" },
];

let ctxAudio: AudioContext | null = null;

/**
 * Reproduce el tono elegido. No lanza excepción nunca: si el navegador
 * bloquea el audio (porque la persona aún no interactuó con la página),
 * simplemente no suena.
 */
export function reproducirTono(tono: Tono, volumen = 60) {
  if (typeof window === "undefined") return;
  try {
    const AC = window.AudioContext ?? (window as any).webkitAudioContext;
    if (!AC) return;
    ctxAudio = ctxAudio ?? new AC();
    if (ctxAudio.state === "suspended") void ctxAudio.resume();

    const cfg = TONOS[tono] ?? TONOS.campana;
    const vol = Math.max(0, Math.min(100, volumen)) / 100;
    const t0 = ctxAudio.currentTime;

    for (const [hz, inicio, dur] of cfg.notas) {
      const osc = ctxAudio.createOscillator();
      const gan = ctxAudio.createGain();
      osc.type = cfg.onda;
      osc.frequency.value = hz;
      // Entrada y salida suaves: sin clics ni chasquidos.
      gan.gain.setValueAtTime(0.0001, t0 + inicio);
      gan.gain.exponentialRampToValueAtTime(Math.max(0.0002, vol * 0.28), t0 + inicio + 0.015);
      gan.gain.exponentialRampToValueAtTime(0.0001, t0 + inicio + dur);
      osc.connect(gan).connect(ctxAudio.destination);
      osc.start(t0 + inicio);
      osc.stop(t0 + inicio + dur + 0.02);
    }
  } catch {
    /* sin sonido, pero la app sigue igual */
  }
}

/** Pide permiso al navegador para avisos de escritorio. Devuelve si quedó concedido. */
export async function pedirPermisoEscritorio(): Promise<boolean> {
  if (typeof window === "undefined" || !("Notification" in window)) return false;
  try {
    if (Notification.permission === "granted") return true;
    if (Notification.permission === "denied") return false;
    return (await Notification.requestPermission()) === "granted";
  } catch {
    return false;
  }
}

export function permisoEscritorio(): "granted" | "denied" | "default" | "no-soportado" {
  if (typeof window === "undefined" || !("Notification" in window)) return "no-soportado";
  return Notification.permission;
}

/** Muestra el aviso del sistema operativo. Silencioso si no hay permiso. */
export function avisoEscritorio(titulo: string, cuerpo: string, onClick?: () => void) {
  if (typeof window === "undefined" || !("Notification" in window)) return;
  try {
    if (Notification.permission !== "granted") return;
    const n = new Notification(titulo, { body: cuerpo, icon: "/favicon.ico", tag: "demandu-mensaje" });
    if (onClick) n.onclick = () => { window.focus(); onClick(); n.close(); };
  } catch {
    /* algunos navegadores lo bloquean en ciertos contextos */
  }
}
