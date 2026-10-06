"use client";

/**
 * EL AVISO DE «NO SE ENTREGÓ», CON LA CAUSA Y EL ARREGLO — Y EL BOTÓN DE QUITARLO.
 *
 * Vive aparte de `InboxClient.tsx` a propósito, por la misma razón que
 * `ControlesSeleccion`: el trinquete del idioma (`medirEspanol.mjs`) deja de
 * contar un archivo en cuanto ese archivo pide traducciones. Un
 * `useTranslations` dentro de `InboxClient` habría escondido de la cuenta sus
 * otros cien textos en español y el total habría bajado sin que nadie
 * tradujera nada.
 *
 * Tres cosas que no son casualidad:
 *
 * 1. **El texto de Meta sigue a la vista**, abajo y en pequeño. Es la única
 *    pista cuando no reconocemos el código, y taparlo para que el aviso quede
 *    bonito dejaría al agente sin nada que buscar ni que reenviar a soporte.
 * 2. **«Quitar» pregunta antes.** Quita la fila para siempre y no hay papelera.
 * 3. **Si el borrado falla, se dice.** Sin eso el mensaje desaparecería de la
 *    pantalla y volvería al recargar, y nadie sabría por qué.
 */

import { useState } from "react";
import { useTranslations } from "next-intl";
import { AlertTriangle, Trash2 } from "lucide-react";
import { Confirm } from "@/components/ui/Confirm";
import { explicacionDeFallo, type FalloDeEnvio } from "@/lib/porQueNoSalio";

export function PorQueNoSalio({
  fallo,
  plantilla,
  onQuitar,
}: {
  fallo: FalloDeEnvio;
  plantilla?: string | null;
  /** Devuelve `true` si la fila se fue de verdad. */
  onQuitar?: () => Promise<boolean>;
}) {
  const t = useTranslations("noSalio");
  const [preguntando, setPreguntando] = useState(false);
  const [ocupado, setOcupado] = useState(false);
  const [noSePudo, setNoSePudo] = useState(false);

  const e = explicacionDeFallo(fallo, plantilla);
  if (!e) return null;

  const nombre = e.plantilla ? `«${e.plantilla}»` : t("esaPlantilla");

  const quitar = async () => {
    if (!onQuitar) return;
    setOcupado(true);
    setNoSePudo(false);
    try {
      const fue = await onQuitar();
      if (!fue) setNoSePudo(true);
    } finally {
      setOcupado(false);
      setPreguntando(false);
    }
  };

  return (
    <span className="mt-1 flex flex-col gap-0.5 text-[10.5px] font-semibold" style={{ color: "#c02b31" }}>
      <span className="flex items-center gap-1">
        <AlertTriangle className="h-3 w-3" /> {t("titulo")}
      </span>

      <span className="font-normal leading-snug opacity-90">
        {t(`que.${e.clave}`, { plantilla: nombre })}
      </span>

      {e.hayArreglo && (
        <span className="font-normal leading-snug opacity-90">{t(`arreglo.${e.clave}`)}</span>
      )}

      {e.textoDeMeta !== "" && (
        <span className="font-normal leading-snug opacity-60">
          {e.codigo === null
            ? t("metaDijo", { texto: e.textoDeMeta })
            : t("metaDijoConCodigo", { texto: e.textoDeMeta, codigo: e.codigo })}
        </span>
      )}

      {onQuitar && (
        <span className="mt-0.5 flex items-center gap-2">
          <button
            type="button"
            onClick={() => setPreguntando(true)}
            className="inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[10.5px] font-semibold underline-offset-2 transition hover:underline"
          >
            <Trash2 className="h-3 w-3" /> {t("quitar")}
          </button>
          {noSePudo && <span className="font-normal opacity-90">{t("noSePudoQuitar")}</span>}
        </span>
      )}

      <Confirm
        abierto={preguntando}
        titulo={t("confirmarTitulo")}
        detalle={t("confirmarDetalle")}
        confirmar={t("confirmarSi")}
        cancelar={t("cancelar")}
        ocupado={ocupado}
        onConfirmar={() => void quitar()}
        onCancelar={() => setPreguntando(false)}
      />
    </span>
  );
}

/**
 * LA BANDA DE ARRIBA DEL HILO.
 *
 * Es el aviso que Alex leyó el 3 de octubre: «WhatsApp no está entregando tus
 * mensajes. (#132012) Parameter format does not match format in the created
 * template». La primera mitad era clara y la segunda, en inglés y sin arreglo,
 * no servía para nada — y lo que de verdad había que hacer (subir una imagen
 * en otra pantalla) no se mencionaba.
 *
 * El nombre del canal sale de la conversación y se pasa de fuera: decía
 * «WhatsApp» siempre, también en conversaciones de Instagram.
 */
export function BandaNoSalio({
  canal,
  fallo,
  plantilla,
}: {
  canal: string;
  fallo: FalloDeEnvio;
  plantilla?: string | null;
}) {
  const t = useTranslations("noSalio");
  const e = explicacionDeFallo(fallo, plantilla);
  if (!e) return null;

  const nombre = e.plantilla ? `«${e.plantilla}»` : t("esaPlantilla");

  return (
    <div className="flex flex-none items-start gap-2 border-b border-danger/40 bg-danger/10 px-4 py-2.5 text-xs text-ink-2">
      <AlertTriangle className="mt-0.5 h-4 w-4 flex-none text-danger" />
      <span>
        <b className="text-danger">{t("banda", { canal })}</b>{" "}
        {t(`que.${e.clave}`, { plantilla: nombre })}
        {e.hayArreglo && <span className="mt-0.5 block">{t(`arreglo.${e.clave}`)}</span>}
        {e.textoDeMeta !== "" && (
          <span className="mt-0.5 block opacity-60">
            {e.codigo === null
              ? t("metaDijo", { texto: e.textoDeMeta })
              : t("metaDijoConCodigo", { texto: e.textoDeMeta, codigo: e.codigo })}
          </span>
        )}
      </span>
    </div>
  );
}
