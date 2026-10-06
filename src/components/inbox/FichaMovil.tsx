"use client";

/**
 * LA FICHA DEL CONTACTO, EN EL TELÉFONO.
 *
 * Hasta hoy la columna de la derecha era `hidden … xl:flex`: **por debajo de
 * 1280 px no existía**. En un teléfono, en una tablet y en un portátil de 13"
 * el agente no veía el teléfono del lead, ni sus etiquetas, ni sus notas, ni de
 * qué anuncio llegó — y eso último se pidió explícitamente «para todos los
 * usuarios». No estaba escondido por diseño: estaba escondido y nadie lo había
 * medido.
 *
 * Aquí no se duplica la ficha. Se pinta **el mismo** `<ContactPanel>` que la
 * columna grande, pasado como hijo: dos copias habrían divergido a la primera
 * vez que alguien añadiera un dato, y hay una prueba estática que lo vigila.
 *
 * Vive aparte de `InboxClient.tsx` por el trinquete del idioma: en cuanto un
 * archivo pide traducciones deja de contarse su español, y meter
 * `useTranslations` en la Bandeja habría escondido de la cuenta sus otros cien
 * textos.
 */

import { useEffect } from "react";
import { useTranslations } from "next-intl";
import { Info, X } from "lucide-react";

/**
 * El nombre y la foto del contacto, convertidos en el botón que abre la ficha.
 *
 * Se usa lo que YA está en la cabecera en vez de añadir un botón nuevo: en una
 * pantalla de 390 px la cabecera ya va apretada, y un icono más al lado de los
 * otros cuatro se pulsa sin querer. Por encima de `xl` la columna de la derecha
 * está a la vista, así que el botón deja de responder (`pointer-events-none`)
 * para no abrir una hoja que taparía lo que ya se ve.
 */
export function BotonDeLaFicha({
  onAbrir,
  children,
}: {
  onAbrir: () => void;
  children: React.ReactNode;
}) {
  const t = useTranslations("ficha");
  return (
    <button
      type="button"
      onClick={onAbrir}
      aria-label={t("abrir")}
      className="flex min-w-0 items-center gap-3 rounded-xl text-left transition xl:pointer-events-none"
    >
      {children}
      <Info className="h-4 w-4 flex-none text-muted-2 xl:hidden" aria-hidden="true" />
    </button>
  );
}

/**
 * La hoja que se abre encima del chat.
 *
 * `xl:hidden` para que no pueda salir cuando la columna ya está puesta, y
 * `pb-[env(safe-area-inset-bottom)]` porque en un iPhone la barra de abajo se
 * come el último dato de la ficha.
 */
export function HojaDeLaFicha({
  abierta,
  onCerrar,
  children,
}: {
  abierta: boolean;
  onCerrar: () => void;
  children: React.ReactNode;
}) {
  const t = useTranslations("ficha");

  useEffect(() => {
    if (!abierta) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onCerrar();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [abierta, onCerrar]);

  if (!abierta) return null;

  return (
    <div className="fixed inset-0 z-[60] flex xl:hidden">
      <button
        type="button"
        aria-label={t("cerrar")}
        onClick={onCerrar}
        className="flex-1 bg-black/50 backdrop-blur-sm"
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-label={t("titulo")}
        className="flex w-full max-w-[380px] flex-col overflow-auto border-l border-surface-border bg-surface p-4 pb-[env(safe-area-inset-bottom)]"
      >
        <div className="mb-3 flex flex-none items-center justify-between">
          <span className="text-sm font-semibold text-white">{t("titulo")}</span>
          <button
            type="button"
            onClick={onCerrar}
            aria-label={t("cerrar")}
            className="grid h-9 w-9 place-items-center rounded-xl text-muted transition hover:text-white"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}
