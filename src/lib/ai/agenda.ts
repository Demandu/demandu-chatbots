/**
 * ¿Puede este asistente agendar de verdad?
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * MARCAR LA CASILLA NO ES TENER AGENDA. Hoy se puede encender «Agendar citas»,
 * guardar, y quedarse tranquilo — mientras Google Calendar no está conectado,
 * o no hay ni un día abierto, o la zona horaria es la de otro país. El bot no
 * avisa: le dice al cliente una hora, o no le dice ninguna, y el negocio se
 * entera cuando alguien llama preguntando por qué nadie lo atendió.
 *
 * ES EL MISMO FALLO QUE YA TUVIMOS CON EL COBRO: una pantalla que dice que algo
 * está encendido no es lo mismo que ese algo funcionando. Aquí se comprueba y
 * se dice qué falta.
 *
 * LA ZONA HORARIA NO SE ADIVINA, SE ENSEÑA. No hay forma fiable de saber desde
 * el servidor en qué país está un negocio, pero sí de ponerle delante la que
 * tiene puesta: casi todo el que la ve mal la corrige en el momento. El valor
 * por defecto es de Ciudad de México, y una agenda panameña con esa zona ofrece
 * todas las horas con una hora de diferencia.
 * ─────────────────────────────────────────────────────────────────────────────
 */

export type DiaLaboral = { enabled?: boolean; open?: string; close?: string };

export type EstadoAgenda = {
  /** ¿El asistente tiene encendida alguna acción de agenda? */
  usaAgenda: boolean;
  /** Puede reservar. */
  puedeAgendar: boolean;
  /** Puede mirar huecos. */
  puedeVerHorarios: boolean;
  /** Lo que impide que funcione, lo más grave primero. */
  problemas: string[];
  /** Lo que conviene revisar aunque no impida funcionar. */
  avisos: string[];
  lista: boolean;
};

export function loQueFaltaParaAgendar(v: {
  herramientas: string[];
  conectado: boolean;
  timezone: string;
  horas: Record<string, DiaLaboral>;
}): EstadoAgenda {
  const h = Array.isArray(v.herramientas) ? v.herramientas : [];
  const puedeVerHorarios = h.includes("ver_horarios");
  const puedeAgendar = h.includes("agendar_cita");
  const usaAgenda = puedeVerHorarios || puedeAgendar;

  const problemas: string[] = [];
  const avisos: string[] = [];

  if (usaAgenda) {
    if (!v.conectado) {
      problemas.push("Google Calendar no está conectado: el asistente no puede ver ni reservar nada.");
    }

    const abiertos = Object.values(v.horas ?? {}).filter((d) => d?.enabled).length;
    if (abiertos === 0) {
      // Sin un solo día abierto no hay hueco posible, y el bot contesta que no
      // hay disponibilidad — para siempre, sin que nadie sospeche por qué.
      problemas.push("No hay ningún día abierto en tu horario: nunca va a encontrar un hueco libre.");
    }

    if (!String(v.timezone ?? "").trim()) {
      problemas.push("Falta la zona horaria: las horas que ofrezca pueden no ser las tuyas.");
    }

    // AGENDAR SIN MIRAR ANTES ES CÓMO SE PISAN DOS CITAS. La acción de reservar
    // no consulta disponibilidad por su cuenta: si no puede ver los huecos,
    // reserva sobre lo que ya haya.
    if (puedeAgendar && !puedeVerHorarios) {
      problemas.push(
        "Puede reservar pero no consultar tu agenda: acabará poniendo citas encima de las que ya tienes.",
      );
    }

    if (v.conectado && abiertos > 0) {
      avisos.push(
        "Las horas que ofrezca salen de tu horario y de tu zona horaria, no de Google Calendar.",
      );
    }
  }

  return {
    usaAgenda,
    puedeAgendar,
    puedeVerHorarios,
    problemas,
    avisos,
    lista: usaAgenda && problemas.length === 0,
  };
}
