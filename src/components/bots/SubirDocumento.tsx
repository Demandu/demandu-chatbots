"use client";

import { useRef, useState } from "react";
import { FileUp, Loader2 } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { porQueNoSeAcepta, FORMATOS } from "@/lib/ai/extraerTexto";

/**
 * Subir un documento para entrenar al chatbot.
 *
 * ── EL ARCHIVO VA DEL NAVEGADOR AL ALMACÉN, NO POR EL FORMULARIO ────────────
 *
 * Las acciones de servidor de Next traen un tope de **1 MB** y `next.config` no
 * lo sube: mandar el PDF dentro del formulario se rompería con cualquier
 * documento de verdad, y con un error del framework que el negocio leería como
 * «la plataforma no sirve». Así que se sube aquí —igual que los adjuntos de la
 * Bandeja— y al servidor solo le viaja la dirección.
 *
 * ── SE COMPRUEBA ANTES DE SUBIR ─────────────────────────────────────────────
 *
 * El tipo y el peso se miran ANTES de gastar la subida. Dejar que suba 20 MB
 * para después decirle que no se acepta ese formato es hacerle perder el tiempo
 * y los datos del celular. La MISMA regla (`porQueNoSeAcepta`) la vuelve a
 * aplicar el servidor, porque esto es el navegador y el navegador se puede
 * saltar.
 *
 * ── LA PRIMERA CARPETA ES LA CUENTA ─────────────────────────────────────────
 *
 * La regla del almacén hace `foldername(name)[1]::uuid IN (auth_org_ids())`.
 * Con cualquier otra cosa delante, la subida se rechaza entera — ya pasó con la
 * ruta `inbox/<org>/…` de la Bandeja, y el único síntoma era un «no se pudo».
 */
export function SubirDocumento({
  botId,
  orgId,
  accion,
}: {
  botId: string;
  orgId: string | null;
  /** `importFromFile`, que vive en el servidor y llega como propiedad. */
  accion: (formData: FormData) => void | Promise<void>;
}) {
  const [subiendo, setSubiendo] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const formRef = useRef<HTMLFormElement>(null);
  const campoUrl = useRef<HTMLInputElement>(null);
  const campoNombre = useRef<HTMLInputElement>(null);
  const campoBytes = useRef<HTMLInputElement>(null);

  const elegir = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;

    setError(null);
    const noSirve = porQueNoSeAcepta(file.name, file.size);
    if (noSirve) return setError(noSirve);
    if (!orgId) return setError("No pude identificar tu cuenta. Recarga la página.");

    setSubiendo(true);
    try {
      const sb = createClient();
      const limpio = file.name.replace(/[^\w.\-]+/g, "_").slice(-80);
      const ruta = `${orgId}/entrenamiento/${botId}/${Date.now()}-${limpio}`;

      const { error: errSubida } = await sb.storage
        .from("media")
        .upload(ruta, file, { cacheControl: "3600", upsert: false });
      if (errSubida) throw new Error(errSubida.message);

      const { data: pub } = sb.storage.from("media").getPublicUrl(ruta);

      campoUrl.current!.value = pub.publicUrl;
      campoNombre.current!.value = file.name;
      campoBytes.current!.value = String(file.size);
      // Se envía el formulario para que el trabajo pesado —leer el PDF,
      // trocear, vectorizar— ocurra en el servidor y la página vuelva con el
      // documento ya en la lista.
      formRef.current?.requestSubmit();
    } catch (err: any) {
      console.error("[entrenamiento] no se pudo subir:", err?.message);
      setError("No se pudo subir el archivo. Revisa tu conexión e inténtalo otra vez.");
      setSubiendo(false);
    }
  };

  const extensiones = Object.keys(FORMATOS).map((e) => `.${e}`).join(",");

  return (
    <div>
      <label
        className={`flex cursor-pointer items-center justify-center gap-2.5 rounded-xl border-2 border-dashed px-4 py-6 text-sm transition ${
          subiendo
            ? "pointer-events-none border-linea text-ink-3"
            : "border-linea-2 text-ink-2 hover:border-pink hover:text-ink"
        }`}
      >
        {subiendo ? (
          <>
            <Loader2 className="h-4 w-4 animate-spin" />
            Leyendo el documento… esto puede tardar un momento.
          </>
        ) : (
          <>
            <FileUp className="h-4 w-4" />
            <span className="font-semibold">Elegir un documento</span>
            <span className="text-ink-3">PDF, Word, texto o CSV</span>
          </>
        )}
        <input type="file" accept={extensiones} onChange={elegir} className="sr-only" disabled={subiendo} />
      </label>

      {error && <p className="mt-2 rounded-lg bg-danger/10 px-3 py-2 text-xs text-danger">{error}</p>}

      {/* Lo que de verdad se manda al servidor: la dirección, no el archivo. */}
      <form ref={formRef} action={accion} className="hidden">
        <input type="hidden" name="bot_id" value={botId} />
        <input ref={campoUrl} type="hidden" name="url" />
        <input ref={campoNombre} type="hidden" name="nombre" />
        <input ref={campoBytes} type="hidden" name="bytes" />
      </form>
    </div>
  );
}
