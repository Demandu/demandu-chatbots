/**
 * CÓMO SE LE CUENTA AL NEGOCIO QUE SUS RECORDATORIOS ESTÁN LISTOS.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * La palabra «plantilla» no aparece por ningún lado, y es a propósito. Un
 * dentista no tiene por qué saber que Meta exige aprobar un texto antes de
 * poder mandarlo: eso es problema nuestro. Lo que necesita saber es si sus
 * pacientes van a recibir el recordatorio o no.
 *
 * ── PERO TAMPOCO SE LE MIENTE ─────────────────────────────────────────────
 *
 * Cuando Meta rechaza, se dice. Esconderlo detrás de un «preparando» eterno es
 * peor: el negocio confía, nadie recibe nada, y se entera el día que un
 * paciente no llega. Se dice qué pasa y de quién es arreglarlo — nuestro.
 *
 * ── SIN IMPORTS, PARA PODER PROBARLO ──────────────────────────────────────
 *
 * Decide qué lee un cliente en su pantalla. Eso se prueba con estados
 * inventados, sin base de datos.
 * ─────────────────────────────────────────────────────────────────────────────
 */

export type Como = "listo" | "revisando" | "rechazado" | "sin_whatsapp" | "preparando";

export type Recordatorios = {
  como: Como;
  titulo: string;
  detalle: string;
  /** Si hay algo que el negocio pueda hacer, esto lo dice. Si no, va vacío. */
  queHacer: string;
};

export type FilaDePlantilla = {
  status?: string | null;
  rejected_reason?: string | null;
} | null | undefined;

export function comoVanLosRecordatorios(
  fila: FilaDePlantilla,
  tieneWhatsApp: boolean,
): Recordatorios {
  if (!tieneWhatsApp) {
    return {
      como: "sin_whatsapp",
      titulo: "Conecta WhatsApp para los recordatorios",
      detalle:
        "Los recordatorios de cita salen por WhatsApp, así que hace falta tener el número conectado.",
      queHacer: "Conectar WhatsApp",
    };
  }

  const estado = String(fila?.status ?? "").trim().toUpperCase();

  if (estado === "APPROVED") {
    return {
      como: "listo",
      titulo: "Tus recordatorios están listos",
      detalle:
        "A cada persona se le avisa de su cita el día antes, con dos botones para confirmar o pedir otro día.",
      queHacer: "",
    };
  }

  if (estado === "REJECTED" || estado === "DISABLED" || estado === "PAUSED") {
    /* «NONE» ES LO QUE MANDA META CUANDO NO HAY MOTIVO, y hay filas en
     * producción que ya lo tienen guardado así. Se filtra también aquí, no
     * solo al guardarlo: esta función decide lo que LEE una persona, y
     * «WhatsApp dijo: NONE» no le dice nada a nadie. */
    const crudo = String(fila?.rejected_reason ?? "").trim();
    const motivo = crudo.toUpperCase() === "NONE" ? "" : crudo;
    return {
      como: "rechazado",
      titulo: "WhatsApp no aprobó el aviso de recordatorio",
      detalle:
        (motivo ? `WhatsApp dijo: «${motivo}». ` : "") +
        "Mientras tanto, a quien te haya escrito en las últimas 24 horas sí le llega.",
      // NO se le pide al cliente que lo arregle: el texto lo escribimos
      // nosotros y es nuestro trabajo pasarlo por Meta.
      queHacer: "Lo estamos arreglando. Si corre prisa, escríbenos.",
    };
  }

  // PENDING, o una fila que todavía no existe: para el negocio es lo mismo.
  // Ha pedido la función y está en camino; distinguir «pedida» de «en revisión»
  // no le cambia nada de lo que puede hacer.
  if (estado === "PENDING") {
    return {
      como: "revisando",
      titulo: "WhatsApp está revisando tus recordatorios",
      detalle:
        "Suele tardar unas horas. No tienes que hacer nada: en cuanto lo aprueben, empiezan a salir solos.",
      queHacer: "",
    };
  }

  return {
    como: "preparando",
    titulo: "Estamos preparando tus recordatorios",
    detalle:
      "Los dejamos listos con WhatsApp en tu nombre. Suele tardar unas horas y no tienes que hacer nada.",
    queHacer: "",
  };
}

/* EL NOMBRE Y EL IDIOMA DE LA PLANTILLA NO SE ESCRIBEN AQUÍ. Quien llama a esto
 * los saca de `RECORDATORIO_CITA` en `plantillasDeLaCasa.ts`, que es donde está
 * definida la plantilla de verdad. Repetirlos aquí para no tener que importar
 * nada sería una segunda copia que se desincroniza el día que cambie el idioma
 * — y entonces esta pantalla buscaría una fila que no existe y diría
 * «preparando» para siempre sobre una plantilla ya aprobada. */
