"use client";

import { useEffect, useState } from "react";
import { Sun, Moon, Monitor } from "lucide-react";
import { aplicarTema, leerTema, CLAVE_TEMA, type Tema } from "@/lib/tema";

/**
 * El interruptor Claro / Oscuro / Automático.
 *
 * "Automático" sigue al sistema: si el Mac o el teléfono están en oscuro, la
 * plataforma abre en oscuro. Es lo que la gente espera hoy, y es el valor por
 * defecto — nadie tiene que ir a buscar el ajuste para que se vea bien.
 *
 * La elección se guarda en el navegador, no en la cuenta: es de ESTE aparato.
 * La misma persona puede querer claro en el monitor de la oficina y oscuro en
 * el portátil de noche.
 */

const OPCIONES: { valor: Tema; icono: typeof Sun; titulo: string }[] = [
  { valor: "claro", icono: Sun, titulo: "Claro" },
  { valor: "oscuro", icono: Moon, titulo: "Oscuro" },
  { valor: "auto", icono: Monitor, titulo: "Como mi sistema" },
];

export function SelectorDeTema() {
  // Arranca en "auto" y se corrige tras montar: en el servidor no existe
  // localStorage, y pintar aquí lo guardado rompería la hidratación.
  const [tema, setTema] = useState<Tema>("auto");
  const [listo, setListo] = useState(false);

  useEffect(() => {
    const t = leerTema();
    setTema(t);
    aplicarTema(t);
    setListo(true);
  }, []);

  // En "automático" hay que hacer caso si el sistema cambia solo — por ejemplo
  // los Mac que se oscurecen al anochecer — sin que la persona toque nada.
  useEffect(() => {
    if (tema !== "auto") return;
    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    const alCambiar = () => aplicarTema("auto");
    mq.addEventListener("change", alCambiar);
    return () => mq.removeEventListener("change", alCambiar);
  }, [tema]);

  const elegir = (t: Tema) => {
    setTema(t);
    aplicarTema(t);
    try {
      localStorage.setItem(CLAVE_TEMA, t);
    } catch {
      /* almacenamiento bloqueado: el tema dura lo que dure la pestaña */
    }
  };

  return (
    <div
      role="group"
      aria-label="Tema de la interfaz"
      className="inline-flex items-center gap-0.5 rounded-xl border border-surface-border bg-surface-raised p-0.5"
    >
      {OPCIONES.map(({ valor, icono: Icono, titulo }) => {
        const activo = listo && tema === valor;
        return (
          <button
            key={valor}
            type="button"
            onClick={() => elegir(valor)}
            title={titulo}
            aria-label={titulo}
            aria-pressed={activo}
            className={`grid h-8 w-8 place-items-center rounded-lg transition ${
              activo ? "bg-demandu-gradient text-white" : "text-muted hover:text-white"
            }`}
          >
            <Icono className="h-4 w-4" />
          </button>
        );
      })}
    </div>
  );
}
