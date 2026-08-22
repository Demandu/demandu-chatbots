"use client";

import { FileText, Download } from "lucide-react";

export type Adjunto = {
  url: string;
  nombre: string;
  tipo: string;
  bytes: number;
};

export function pesoLegible(b: number): string {
  if (!b || b < 0) return "";
  const mb = b / (1024 * 1024);
  if (mb < 1) return `${Math.max(1, Math.round(b / 1024))} KB`;
  return `${mb.toFixed(mb < 10 ? 1 : 0)} MB`;
}

export const TOPE_BYTES = 25 * 1024 * 1024;

/**
 * Un archivo dentro de una burbuja.
 *
 * LAS IMÁGENES SE VEN, EL RESTO SE DESCARGA. Enseñar un PDF como un rectángulo
 * gris con su nombre no ayuda a nadie; enseñar una foto sí, y en atención a
 * clientes la mayoría de lo que se manda son fotos —del producto, del recibo,
 * del problema—. Obligar a abrir una pestaña para ver cada una haría la bandeja
 * inservible.
 */
export function VistaAdjunto({ adjunto, oscuro }: { adjunto: Adjunto; oscuro?: boolean }) {
  const esImagen = adjunto.tipo?.startsWith("image/");

  if (esImagen) {
    return (
      <a href={adjunto.url} target="_blank" rel="noopener noreferrer" className="mt-1 block">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={adjunto.url}
          alt={adjunto.nombre}
          className="max-h-64 w-auto max-w-full rounded-lg object-contain"
        />
      </a>
    );
  }

  return (
    <a
      href={adjunto.url}
      target="_blank"
      rel="noopener noreferrer"
      className={`mt-1 flex items-center gap-2.5 rounded-lg border px-2.5 py-2 transition hover:opacity-80 ${
        oscuro ? "border-white/20 bg-white/10" : "border-black/10 bg-black/5"
      }`}
    >
      <FileText className="h-5 w-5 flex-none opacity-70" />
      <span className="min-w-0 flex-1">
        <span className="block truncate text-[13px] font-medium">{adjunto.nombre}</span>
        <span className="block text-[11px] opacity-60">{pesoLegible(adjunto.bytes)}</span>
      </span>
      <Download className="h-4 w-4 flex-none opacity-60" />
    </a>
  );
}
