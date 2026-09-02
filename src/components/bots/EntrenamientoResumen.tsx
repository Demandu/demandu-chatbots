import Link from "next/link";
import { Globe, FileText, MessageCircleQuestion, Table, Braces, HelpCircle } from "lucide-react";

/**
 * El resumen del entrenamiento: por dónde puede entrar la información.
 *
 * POR QUÉ UNA PANTALLA SOLO PARA ESTO. El entrenamiento es lo que decide si el
 * chatbot contesta con datos reales o con evasivas, y hasta ahora la única
 * puerta visible era un cuadro de texto. Quien abría la pantalla no sabía que
 * podía darle su sitio web, y mucho menos por dónde empezar.
 *
 * LA RECOMENDACIÓN DE ABAJO NO ES DECORACIÓN: el sitio web del cliente suele
 * cubrir la mayoría de las preguntas de una sola pasada, y es lo único que ya
 * está escrito. Decirlo ahorra la pregunta «¿y ahora qué pongo?».
 */

type Tarjeta = {
  clave: string;
  titulo: string;
  texto: string;
  accion: string;
  icono: React.ReactNode;
  color: string;
  pronto?: boolean;
  popular?: boolean;
};

export function EntrenamientoResumen({ botId }: { botId: string }) {
  const tarjetas: Tarjeta[] = [
    {
      clave: "web",
      titulo: "Sitio web",
      texto: "Lee las páginas de tu sitio para que el chatbot conteste con lo que ya tienes escrito.",
      accion: "Añadir una dirección",
      icono: <Globe className="h-4 w-4" />,
      color: "bg-sky-500/15 text-sky-600",
      popular: true,
    },
    {
      clave: "archivos",
      titulo: "Archivos",
      texto: "Sube tus PDF, documentos de Word y textos: catálogos, listas de precios, políticas.",
      accion: "Subir archivos",
      icono: <FileText className="h-4 w-4" />,
      color: "bg-violet-500/15 text-violet-600",
      pronto: true,
    },
    {
      clave: "faqs",
      titulo: "Preguntas frecuentes",
      texto: "Escribe pregunta y respuesta para lo que más te preguntan y quieres contestar palabra por palabra.",
      accion: "Añadir una pregunta",
      icono: <MessageCircleQuestion className="h-4 w-4" />,
      color: "bg-amber-500/15 text-amber-600",
      pronto: true,
    },
    {
      clave: "sheets",
      titulo: "Google Sheets",
      texto: "Conecta una hoja de cálculo y trae sus filas cada cierto tiempo, sin volver a tocarla.",
      accion: "Conectar una hoja",
      icono: <Table className="h-4 w-4" />,
      color: "bg-emerald-500/15 text-emerald-600",
      pronto: true,
    },
    {
      clave: "fragmentos",
      titulo: "Fragmentos",
      texto: "Textos cortos escritos por ti: horarios, formas de pago, tono con el que quieres que hable.",
      accion: "Escribir un fragmento",
      icono: <Braces className="h-4 w-4" />,
      color: "bg-pink-500/15 text-pink-600",
    },
    {
      clave: "sin-respuesta",
      titulo: "Preguntas sin responder",
      texto: "Lo que tus clientes preguntaron y el chatbot no supo. Cada una es algo que le falta aprender.",
      accion: "Ver preguntas",
      icono: <HelpCircle className="h-4 w-4" />,
      color: "bg-slate-500/15 text-slate-600",
    },
  ];

  return (
    <>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {tarjetas.map((t) => (
          <div key={t.clave} className={`card-l relative p-5 ${t.pronto ? "opacity-70" : ""}`}>
            <div className="mb-3 flex items-start justify-between">
              <span className={`grid h-9 w-9 place-items-center rounded-xl ${t.color}`}>{t.icono}</span>
              {t.popular && (
                <span className="rounded-md bg-pink/10 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-pink">
                  Lo más usado
                </span>
              )}
              {t.pronto && (
                <span className="rounded-md bg-suave px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-ink-3">
                  Muy pronto
                </span>
              )}
            </div>
            <h3 className="mb-1 font-display text-base font-semibold text-ink">{t.titulo}</h3>
            <p className="mb-3 text-xs leading-relaxed text-ink-2">{t.texto}</p>
            {t.pronto ? (
              <span className="text-xs font-semibold text-ink-3">Disponible muy pronto</span>
            ) : (
              <Link
                href={`/bots/${botId}/training?t=${t.clave}`}
                className="text-xs font-semibold text-pink hover:underline"
              >
                {t.accion} →
              </Link>
            )}
          </div>
        ))}
      </div>

      <div className="card-l mt-5 flex flex-wrap items-center justify-between gap-3 p-5">
        <div className="min-w-[260px] flex-1">
          <p className="font-semibold text-ink">¿No sabes por dónde empezar?</p>
          <p className="text-xs text-ink-2">
            Darle tu sitio web suele cubrir la mayoría de las preguntas de tus clientes de una sola pasada — y
            es lo único que ya tienes escrito.
          </p>
        </div>
        <Link href={`/bots/${botId}/training?t=web`} className="btn-primary flex-none">
          <Globe className="h-4 w-4" /> Empezar por mi sitio web
        </Link>
      </div>
    </>
  );
}
