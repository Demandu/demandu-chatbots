import Link from "next/link";
import { origenPara, infoOrigen } from "@/lib/flow/origenes";
import { MODOS_PUBLICOS, modoDeRespuestaPublica } from "@/lib/canales/comentarioPublico";

/**
 * DÓNDE ESCUCHA ESTE FLUJO — AHORA SOLO SE CUENTA, NO SE CONFIGURA AQUÍ.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * POR QUÉ DEJÓ DE SER UN FORMULARIO.
 *
 * Esta barra era el único sitio donde se podía decir si un flujo escuchaba
 * comentarios o mensajes directos, y qué se contestaba en público. Estaba
 * escondida arriba del lienzo, en gris, entre «Nombre del flujo» y «Palabras
 * clave» — y para llegar había que entender qué es un flujo, un disparador y un
 * lienzo. El dueño de una pastelería no quiere eso: quiere decir «que conteste
 * los comentarios» y que conteste.
 *
 * Eso ya vive en **Respuestas automáticas**, con un interruptor por sitio. Y dos
 * pantallas para lo mismo es peor que una mala: se cambia en una, no se ve en la
 * otra, y nadie sabe cuál manda.
 *
 * ── LOS CAMPOS SIGUEN VIAJANDO, Y ESO NO ES OPCIONAL ──────────────────────
 *
 * `setFlowTrigger` lee estos cuatro valores del formulario y guarda lo que
 * encuentre. Si desaparecieran del todo, pulsar «Guardar disparador» —para
 * cambiar el nombre, por ejemplo— dejaría el flujo escuchando mensajes directos
 * y sin respuesta pública: el negocio perdería su regla de comentarios sin
 * tocarla y sin que nada se lo dijera.
 *
 * Por eso van como campos ocultos con lo que ya tenían. Se enseña en una línea
 * lo que hacen y un enlace a donde SÍ se cambian.
 * ─────────────────────────────────────────────────────────────────────────────
 */
export function DisparadorSocial({
  canal,
  botId,
  origen,
  publicacion,
  respuestaPublica,
  respuestaPublicaModo,
  unaPorPersona,
}: {
  canal: string;
  botId: string;
  origen: string | null;
  publicacion: string | null;
  respuestaPublica: string | null;
  respuestaPublicaModo: string | null;
  unaPorPersona: boolean;
}) {
  // En un chatbot de WhatsApp o de web no hay nada de esto: solo existe el
  // mensaje directo, que es el valor por defecto de la columna.
  if (origenPara(canal).length <= 1) return <input type="hidden" name="origen" value="dm" />;

  const info = infoOrigen(origen);
  const modo = modoDeRespuestaPublica({ respuesta_publica_modo: respuestaPublicaModo });
  const comoLoDice = MODOS_PUBLICOS.find((m) => m.valor === modo)?.label ?? "";

  return (
    <>
      <input type="hidden" name="origen" value={origen ?? "dm"} />
      <input type="hidden" name="publicacion" value={publicacion ?? ""} />
      <input type="hidden" name="respuesta_publica" value={respuestaPublica ?? ""} />
      <input type="hidden" name="respuesta_publica_modo" value={modo} />
      {unaPorPersona && <input type="hidden" name="una_por_persona" value="si" />}

      <p className="basis-full text-[11px] leading-relaxed text-muted-2">
        Escucha en <b className="text-muted">{info.label}</b>
        {info.admitePublica && <> · en el comentario: <b className="text-muted">{comoLoDice}</b></>}
        {" · "}
        <Link href={`/bots/${botId}/respuestas`} className="font-semibold text-pink hover:underline">
          Cambiar en Respuestas automáticas
        </Link>
      </p>
    </>
  );
}
