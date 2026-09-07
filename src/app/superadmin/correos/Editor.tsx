"use client";

import { useState } from "react";
import { correoDeBienvenida, BIENVENIDA_POR_DEFECTO, HUECOS, type PlantillaBienvenida } from "@/lib/correo/plantillas";
import { guardarPlantilla, mandarmePrueba } from "./acciones";
import { Save, Send, Eye } from "lucide-react";

/**
 * EL EDITOR, CON LA VISTA PREVIA AL LADO.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * LA VISTA PREVIA LA PINTA EL MISMO CÓDIGO QUE MANDA EL CORREO.
 *
 * Es toda la razón de que esta pantalla exista. Una vista previa dibujada
 * aparte —«más o menos así se verá»— es peor que no tener ninguna: da permiso
 * para publicar sin mirar, y el día que se despeguen, la que miente es la que
 * alguien estaba mirando. Aquí se llama a `correoDeBienvenida`, la misma
 * función que llama la tarea programada, con los mismos huecos rellenos.
 *
 * Por eso `plantillas.ts` no puede tocar la base ni el servidor: si lo hiciera,
 * esto no podría importarlo y habría que dibujar el correo dos veces.
 *
 * ── DENTRO DE UN `iframe`, Y NO ES UN CAPRICHO ────────────────────────────
 *
 * El correo trae sus propios estilos y su propio fondo oscuro. Metido en la
 * página del panel, el CSS de la página lo pisa y se ve distinto a como llega.
 * Un `iframe` es una hoja en blanco: lo que se ve ahí es lo que se ve en Gmail.
 * ─────────────────────────────────────────────────────────────────────────────
 */

/** La misma caja de texto que el resto del área de contenido. Ver `input-l`. */
const CAJA = "input-l";

export default function Editor({ guardada }: { guardada: Partial<PlantillaBienvenida> | null }) {
  // Lo GUARDADO, no lo de por defecto: un campo vacío tiene que verse vacío,
  // porque vacío es lo que significa «usa el del código». Enseñar el texto por
  // defecto dentro del campo haría que al guardar quedara copiado en la base,
  // y a partir de ahí ya nunca se actualizaría solo.
  const [asunto, setAsunto] = useState(guardada?.asunto ?? "");
  const [titulo, setTitulo] = useState(guardada?.titulo ?? "");
  const [cuerpo, setCuerpo] = useState(guardada?.cuerpo ?? "");
  const [boton, setBoton] = useState(guardada?.boton ?? "");

  // El caso difícil es el del cliente SIN nombre —el que entra por Facebook o
  // por Apple sin compartirlo—, porque es donde una plantilla deja «Hola, .».
  // Se puede ver aquí antes de mandarlo, no después.
  const [conNombre, setConNombre] = useState(true);

  const ejemplo = conNombre
    ? { nombre: "Darwin Bracho", negocio: "Ventas de zapatos" }
    : { nombre: null, negocio: "Ventas de zapatos" };

  const correo = correoDeBienvenida({
    ...ejemplo,
    panel: "https://platform.demandu.tech/dashboard",
    plantilla: { asunto, titulo, cuerpo, boton },
  });

  const campos = (
    <>
      <input type="hidden" name="asunto" value={asunto} />
      <input type="hidden" name="titulo" value={titulo} />
      <input type="hidden" name="cuerpo" value={cuerpo} />
      <input type="hidden" name="boton" value={boton} />
    </>
  );

  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,420px)]">
      {/* ── Lo que se escribe ─────────────────────────────────────────────── */}
      <div className="space-y-4">
        <Campo
          etiqueta="Asunto"
          ayuda="Lo único que se lee antes de abrirlo. Corto y que diga algo."
          porDefecto={BIENVENIDA_POR_DEFECTO.asunto}
        >
          <input className={CAJA} value={asunto} onChange={(e) => setAsunto(e.target.value)} placeholder={BIENVENIDA_POR_DEFECTO.asunto} />
        </Campo>

        <Campo
          etiqueta="Título"
          ayuda="El titular grande dentro del correo."
          porDefecto={BIENVENIDA_POR_DEFECTO.titulo}
        >
          <input className={CAJA} value={titulo} onChange={(e) => setTitulo(e.target.value)} placeholder={BIENVENIDA_POR_DEFECTO.titulo} />
        </Campo>

        <Campo
          etiqueta="Mensaje"
          ayuda="Una línea en blanco separa párrafos. Poner *así* pone la palabra en negrita."
          porDefecto={BIENVENIDA_POR_DEFECTO.cuerpo}
        >
          <textarea
            className={`${CAJA} min-h-[180px] leading-relaxed`}
            value={cuerpo}
            onChange={(e) => setCuerpo(e.target.value)}
            placeholder={BIENVENIDA_POR_DEFECTO.cuerpo}
          />
        </Campo>

        <Campo
          etiqueta="Texto del botón"
          ayuda="El botón siempre lleva al panel. Aquí solo se cambia lo que dice."
          porDefecto={BIENVENIDA_POR_DEFECTO.boton}
        >
          <input className={CAJA} value={boton} onChange={(e) => setBoton(e.target.value)} placeholder={BIENVENIDA_POR_DEFECTO.boton} />
        </Campo>

        <div className="card-l p-4">
          <p className="mb-2 text-xs font-bold uppercase tracking-wide text-ink-2">Huecos que puedes usar</p>
          <ul className="space-y-1.5 text-sm text-ink-2">
            {HUECOS.map((h) => (
              <li key={h.clave}>
                <code className="rounded bg-canvas px-1.5 py-0.5 font-mono text-[13px] text-pink">{h.clave}</code>{" "}
                {h.explica}
              </li>
            ))}
          </ul>
          <p className="mt-3 text-xs text-ink-3">
            Un campo que dejes en blanco usa el texto original. Es la forma de deshacer un cambio sin tener que
            acordarte de cómo estaba.
          </p>
        </div>

        <div className="flex flex-wrap gap-2">
          <form action={guardarPlantilla}>
            {campos}
            <button className="btn-primary">
              <Save className="h-4 w-4" /> Guardar
            </button>
          </form>

          <form action={mandarmePrueba}>
            {campos}
            <button className="btn-soft font-semibold">
              <Send className="h-4 w-4" /> Mandármelo a mí
            </button>
          </form>
        </div>
        <p className="text-xs text-ink-3">
          «Mandármelo a mí» va a tu propio correo y manda lo que hay en pantalla, esté guardado o no. No hay forma de
          escribir otra dirección aquí: así no se le puede escapar un borrador a un cliente.
        </p>
      </div>

      {/* ── Cómo queda ────────────────────────────────────────────────────── */}
      <div className="lg:sticky lg:top-4 lg:self-start">
        <div className="mb-2 flex items-center justify-between gap-2">
          <p className="inline-flex items-center gap-1.5 text-xs font-bold uppercase tracking-wide text-ink-2">
            <Eye className="h-3.5 w-3.5" /> Cómo queda
          </p>
          <button
            type="button"
            onClick={() => setConNombre((v) => !v)}
            className="btn-soft px-2.5 py-1 text-xs font-semibold"
          >
            {conNombre ? "Ver sin nombre" : "Ver con nombre"}
          </button>
        </div>

        <div className="overflow-hidden rounded-xl border border-linea">
          <div className="border-b border-linea bg-suave-2 px-3 py-2">
            <p className="text-[11px] uppercase tracking-wide text-ink-3">Asunto</p>
            <p className="truncate text-sm font-semibold text-ink">{correo.asunto}</p>
          </div>
          <iframe
            title="Vista previa del correo"
            srcDoc={correo.html}
            className="h-[520px] w-full bg-[#0b0d1a]"
            // Sin permisos: es HTML nuestro, pero el cuerpo lo escribe una
            // persona y no hay ninguna razón para que esto pueda ejecutar nada.
            sandbox=""
          />
        </div>

        <p className="mt-2 text-xs text-ink-3">
          El logo se ve así cuando el correo carga imágenes. Si el cliente las bloquea —Outlook lo hace por defecto—
          en su lugar aparece la palabra «Demandu» con la misma tipografía.
        </p>
      </div>
    </div>
  );
}

function Campo({
  etiqueta,
  ayuda,
  porDefecto,
  children,
}: {
  etiqueta: string;
  ayuda: string;
  porDefecto: string;
  children: React.ReactNode;
}) {
  return (
    <label className="block">
      <span className="mb-1 block text-sm font-semibold text-ink">{etiqueta}</span>
      {children}
      <span className="mt-1 block text-xs text-ink-3">{ayuda}</span>
      <span className="sr-only">Texto original: {porDefecto}</span>
    </label>
  );
}
