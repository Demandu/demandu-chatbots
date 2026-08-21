/**
 * Claro / Oscuro / Automático — la parte que no es interfaz.
 *
 * Vive aparte del componente porque el guión anti-parpadeo lo necesita el
 * layout, que es un componente de SERVIDOR. Importar un valor desde un archivo
 * marcado "use client" funciona a veces y falla en otras según cómo empaquete
 * Next; teniéndolo aquí no hay nada que adivinar.
 */

export type Tema = "claro" | "oscuro" | "auto";

export const CLAVE_TEMA = "demandu:tema";

/**
 * Se ejecuta ANTES de que se pinte nada, desde el <head>.
 *
 * Sin esto habría un fogonazo blanco en cada carga: el navegador pintaría con
 * el tema claro y milisegundos después React lo pondría oscuro. En pantalla se
 * ve como un flash, y de noche molesta de verdad.
 *
 * Va envuelto en try/catch porque hay navegadores con el almacenamiento
 * bloqueado, y un error aquí dejaría la página en blanco: este guión corre
 * antes que todo lo demás.
 */
export const GUION_ANTI_PARPADEO = `
(function(){try{
  var t = localStorage.getItem('${CLAVE_TEMA}');
  var oscuro = t === 'oscuro' || (t !== 'claro' && window.matchMedia('(prefers-color-scheme: dark)').matches);
  if (oscuro) document.documentElement.classList.add('dark');
}catch(e){}})();
`.trim();

/** Lo que eligió esta persona en ESTE aparato. Por defecto, seguir al sistema. */
export function leerTema(): Tema {
  try {
    const v = localStorage.getItem(CLAVE_TEMA);
    return v === "claro" || v === "oscuro" ? v : "auto";
  } catch {
    return "auto";
  }
}

/** Marca (o desmarca) el <html>, que es de donde cuelgan todos los colores. */
export function aplicarTema(tema: Tema) {
  const oscuro =
    tema === "oscuro" ||
    (tema === "auto" && window.matchMedia("(prefers-color-scheme: dark)").matches);
  document.documentElement.classList.toggle("dark", oscuro);
}
