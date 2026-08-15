"use client";

import { useRef, useState } from "react";
import { createClient } from "@/lib/supabase/client";

type MediaKind = "image" | "video" | "file";

interface Props {
  orgId: string | null;
  value?: string;
  fileName?: string;
  kind: MediaKind;
  onUploaded: (patch: { mediaUrl: string; mediaName?: string; mediaType?: MediaKind }) => void;
}

const ACCEPT: Record<MediaKind, string> = {
  image: "image/*",
  video: "video/*",
  file: "*/*",
};

function detectKind(file: File): MediaKind {
  if (file.type.startsWith("image/")) return "image";
  if (file.type.startsWith("video/")) return "video";
  return "file";
}

/** Zona de arrastre para subir un archivo a Supabase Storage (bucket "media"). */
export function MediaUpload({ orgId, value, fileName, kind, onUploaded }: Props) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [drag, setDrag] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [progressName, setProgressName] = useState<string | null>(null);

  const upload = async (file: File) => {
    setError(null);
    if (!orgId) {
      setError("No se pudo identificar tu organización. Recarga la página e intenta de nuevo.");
      return;
    }
    if (file.size > 25 * 1024 * 1024) {
      setError("El archivo supera el límite de 25 MB.");
      return;
    }
    setBusy(true);
    setProgressName(file.name);
    try {
      const supabase = createClient();
      const clean = file.name.replace(/[^a-zA-Z0-9._-]/g, "_");
      const path = `${orgId}/${Date.now()}-${clean}`;
      const { error: upErr } = await supabase.storage
        .from("media")
        .upload(path, file, { cacheControl: "3600", upsert: false });
      if (upErr) throw upErr;
      const { data } = supabase.storage.from("media").getPublicUrl(path);
      onUploaded({ mediaUrl: data.publicUrl, mediaName: file.name, mediaType: detectKind(file) });
    } catch (e: any) {
      setError(e?.message ?? "No se pudo subir el archivo.");
    } finally {
      setBusy(false);
      setProgressName(null);
    }
  };

  const onDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDrag(false);
    const file = e.dataTransfer.files?.[0];
    if (file) upload(file);
  };

  return (
    <div>
      <div
        onClick={() => !busy && inputRef.current?.click()}
        onDragOver={(e) => { e.preventDefault(); setDrag(true); }}
        onDragLeave={() => setDrag(false)}
        onDrop={onDrop}
        className={`flex cursor-pointer flex-col items-center justify-center gap-1 rounded-xl border-2 border-dashed px-4 py-6 text-center transition ${
          drag ? "border-pink bg-pink/5" : "border-surface-border hover:border-violet"
        } ${busy ? "opacity-60" : ""}`}
      >
        <input
          ref={inputRef}
          type="file"
          accept={ACCEPT[kind]}
          className="hidden"
          onChange={(e) => { const f = e.target.files?.[0]; if (f) upload(f); e.target.value = ""; }}
        />
        {busy ? (
          <>
            <span className="text-lg animate-pulse">⬆️</span>
            <span className="text-xs text-muted">Subiendo {progressName}…</span>
          </>
        ) : (
          <>
            <span className="text-2xl">📎</span>
            <span className="text-xs font-medium text-white">Arrastra un archivo aquí</span>
            <span className="text-[11px] text-muted-2">o haz clic para elegirlo · máx. 25 MB</span>
          </>
        )}
      </div>

      {error && <p className="mt-2 text-[11px] text-danger">{error}</p>}

      {value && !busy && (
        <div className="mt-3">
          {kind === "image" ? (
            /* eslint-disable-next-line @next/next/no-img-element */
            <img src={value} alt="preview" className="max-h-44 w-full rounded-xl border border-surface-border object-cover" />
          ) : kind === "video" ? (
            <video src={value} controls className="max-h-44 w-full rounded-xl border border-surface-border" />
          ) : (
            <a
              href={value}
              target="_blank"
              rel="noreferrer"
              className="flex items-center gap-2 rounded-xl border border-surface-border bg-surface-raised px-3 py-2.5 text-xs text-white hover:border-pink"
            >
              <span className="text-base">📄</span>
              <span className="truncate">{fileName ?? "Ver archivo subido"}</span>
            </a>
          )}
          <div className="mt-1.5 flex items-center justify-between">
            <span className="truncate text-[11px] text-muted-2">{fileName ?? value}</span>
            <button
              onClick={(e) => { e.stopPropagation(); onUploaded({ mediaUrl: "", mediaName: "", mediaType: kind }); }}
              className="flex-none text-[11px] text-muted-2 hover:text-danger"
            >
              Quitar
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
