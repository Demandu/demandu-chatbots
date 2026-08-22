"use client";

import { useState } from "react";
import { origenPara, infoOrigen, AVISO_RESPUESTA_PRIVADA, type Origen } from "@/lib/flow/origenes";

/**
 * De dónde escucha este flujo, dentro de la barra del disparador.
 *
 * ES UN COMPONENTE DE CLIENTE porque los campos cambian según lo elegido: pedir
 * la publicación cuando el flujo escucha mensajes directos sería pedir un dato
 * que no significa nada, y esos campos huérfanos son los que hacen que la gente
 * rellene cosas al azar.
 *
 * Solo se ofrece lo que el canal admite. En un bot de WhatsApp no aparece nada
 * de esto: no hay comentarios ni historias donde escuchar.
 */
export function DisparadorSocial({
  canal,
  origen,
  publicacion,
  respuestaPublica,
  unaPorPersona,
}: {
  canal: string;
  origen: string | null;
  publicacion: string | null;
  respuestaPublica: string | null;
  unaPorPersona: boolean;
}) {
  const opciones = origenPara(canal);
  const [valor, setValor] = useState<Origen>((origen as Origen) ?? "dm");

  // Con una sola opción no hay nada que elegir; el campo oculto mantiene el
  // valor para que guardar no lo borre.
  if (opciones.length <= 1) return <input type="hidden" name="origen" value="dm" />;

  const info = infoOrigen(valor);
  const enComentario = valor === "post" || valor === "reel";

  return (
    <>
      <div>
        <label className="mb-0.5 block text-[10px] font-semibold uppercase tracking-wide text-muted-2">
          ¿Dónde escucha?
        </label>
        <select
          name="origen"
          value={valor}
          onChange={(e) => setValor(e.target.value as Origen)}
          className="input h-8 py-1 text-sm"
        >
          {opciones.map((o) => (
            <option key={o.valor} value={o.valor}>{o.label}</option>
          ))}
        </select>
      </div>

      {enComentario && (
        <>
          <div className="min-w-[180px]">
            <label className="mb-0.5 block text-[10px] font-semibold uppercase tracking-wide text-muted-2">
              Publicación (vacío = todas)
            </label>
            <input
              name="publicacion"
              defaultValue={publicacion ?? ""}
              placeholder="ID o enlace de la publicación"
              className="input h-8 py-1 text-sm"
            />
          </div>

          <div className="min-w-[220px] flex-1">
            <label className="mb-0.5 block text-[10px] font-semibold uppercase tracking-wide text-muted-2">
              Respuesta pública en el comentario (opcional)
            </label>
            <input
              name="respuesta_publica"
              defaultValue={respuestaPublica ?? ""}
              placeholder="¡Te lo mandé por privado! 💌"
              className="input h-8 py-1 text-sm"
            />
          </div>

          {/* Evita el bochorno de mandarle el mismo privado dos veces a alguien
              que comentó dos veces en el mismo post. */}
          <label className="flex items-center gap-1.5 pb-1.5 text-xs text-muted">
            <input
              type="checkbox"
              name="una_por_persona"
              value="si"
              defaultChecked={unaPorPersona}
              className="h-3.5 w-3.5 accent-pink"
            />
            Una vez por persona
          </label>
        </>
      )}

      <p className="basis-full text-[11px] text-muted-2">
        {info.desc}
        {enComentario && <> · {AVISO_RESPUESTA_PRIVADA}</>}
      </p>
    </>
  );
}
