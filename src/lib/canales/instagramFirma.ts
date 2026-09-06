import { createHmac, timingSafeEqual } from "crypto";

/**
 * La firma de Meta.
 *
 * ESTO ES LO ÚNICO QUE PROTEGE EL WEBHOOK. El endpoint es público y sin
 * sesión: Meta llama desde sus servidores, así que no hay cookie, ni usuario,
 * ni RLS. Si esta comprobación se cae, cualquiera que averigüe la dirección
 * puede inventarse mensajes de clientes, meter conversaciones falsas en la
 * Bandeja de un negocio y gastarle la cuota de IA.
 *
 * VIVE EN SU PROPIO ARCHIVO Y NO DENTRO DE `route.ts` para poder probarla de
 * verdad — firmando de mentira y comprobando que se rechaza. Una barrera de
 * seguridad que no se puede probar es una barrera que nadie sabe si funciona.
 */
export function firmaValida(crudo: string, cabecera: string | null | undefined, secreto: string): boolean {
  // Sin secreto no se valida NADA. Devolver `true` aquí «para que funcione en
  // pruebas» convertiría un despliegue mal configurado en un endpoint abierto,
  // y nadie se enteraría porque todo seguiría pareciendo correcto.
  if (!secreto) return false;
  if (typeof cabecera !== "string" || !cabecera.startsWith("sha256=")) return false;

  const hex = cabecera.slice(7);
  // ESTAS DOS COMPROBACIONES SON REDUNDANTES, Y SE SABE. Al mutarlas a
  // propósito, las pruebas siguieron pasando: `Buffer.from` devuelve un búfer
  // más corto ante un hex inválido, y la comparación de longitudes de abajo ya
  // lo rechaza. Se quedan porque dicen la intención al leer el código, no
  // porque estén sosteniendo nada. Quien las borre no romperá la seguridad —
  // pero tampoco la mejora, así que mejor que sigan.
  if (!/^[0-9a-f]+$/i.test(hex) || hex.length % 2 !== 0) return false;

  try {
    const mio = createHmac("sha256", secreto).update(crudo, "utf8").digest();
    const suyo = Buffer.from(hex, "hex");
    if (mio.length !== suyo.length) return false;

    // COMPARACIÓN EN TIEMPO CONSTANTE. Un `===` corta en cuanto encuentra el
    // primer byte distinto, y esa diferencia de microsegundos deja adivinar la
    // firma byte a byte pidiendo muchas veces. Es un ataque conocido y la
    // defensa cuesta una línea.
    //
    // NINGUNA PRUEBA FUNCIONAL PUEDE VIGILAR ESTO. Se comprobó: cambiando
    // `timingSafeEqual` por `===` las 98 pruebas siguen pasando, porque el
    // resultado es el mismo y lo único que cambia es CUÁNTO TARDA en darlo. Por
    // eso hay una prueba estática en `estatico.mjs` que lee este archivo y
    // exige que siga usando `timingSafeEqual` — es la única forma de que
    // alguien no lo «simplifique» dentro de dos años sin que salte nada.
    return timingSafeEqual(mio, suyo);
  } catch {
    return false;
  }
}

/** La firma que Meta mandaría para este cuerpo. Solo para pruebas. */
export function firmarComoMeta(crudo: string, secreto: string): string {
  return "sha256=" + createHmac("sha256", secreto).update(crudo, "utf8").digest("hex");
}
