import { createClient } from "@/lib/supabase/server";
import { createTag, deleteTag, agruparTag } from "../actions";
import { ReglasDeCalificacion } from "@/components/ReglasDeCalificacion";
import { Info } from "lucide-react";

export const dynamic = "force-dynamic";

/**
 * Etiquetas, y a qué GRUPO pertenece cada una.
 *
 * POR QUÉ EXISTEN LOS GRUPOS. Un lead de prueba acabó marcado como «lead-alto»
 * Y «lead-medio» a la vez: la IA lo calificó dos veces según iba sabiendo más y
 * las dos etiquetas se quedaron puestas. Para el sistema eran dos etiquetas
 * independientes, como «vip» o «moroso» — nada decía que son la misma pregunta
 * con tres respuestas. Un embudo donde alguien está en dos niveles a la vez no
 * sirve para decidir nada.
 *
 * Un grupo es eso: una pregunta. Poner una etiqueta del grupo quita a sus
 * hermanas. Las etiquetas sin grupo se siguen acumulando, que es lo correcto
 * para «vip» o «habla inglés».
 *
 * El nombre del grupo lo escribe el cliente, no nosotros: una clínica dental y
 * una inmobiliaria no califican igual.
 */
export default async function TagsPage() {
  const sb = createClient();
  const [{ data }, { data: campos }, { data: reglasRaw }] = await Promise.all([
    sb.from("tags").select("*").order("created_at"),
    sb.from("custom_attributes").select("key, name").order("sort"),
    sb
      .from("reglas_de_calificacion")
      .select("id, campo, operador, valor, etiqueta:tags(name, color)")
      .eq("activa", true)
      .order("prioridad", { ascending: false }),
  ]);
  const tags = (data ?? []) as any[];
  const reglas = ((reglasRaw ?? []) as any[]).map((r) => ({
    id: r.id as string,
    campo: r.campo as string,
    operador: r.operador as string,
    valor: (r.valor ?? null) as string | null,
    etiqueta: (r.etiqueta ?? null) as { name: string; color: string | null } | null,
  }));

  // Los grupos que ya usa este cliente, para ofrecérselos y que no acabe con
  // «Calificacion», «calificación» y «Calificación » como tres grupos distintos.
  const grupos = [...new Set(tags.map((t) => t.grupo).filter(Boolean))] as string[];

  const sueltas = tags.filter((t) => !t.grupo);
  const porGrupo = grupos.map((g) => [g, tags.filter((t) => t.grupo === g)] as const);

  const chip = (t: any) => (
    <div key={t.id} className="flex items-center gap-2 rounded-full border border-linea bg-tarjeta px-3 py-1.5">
      <span className="h-2.5 w-2.5 flex-none rounded-full" style={{ background: t.color }} />
      <span className="text-sm text-ink">{t.name}</span>

      {/* Cambiar de grupo sin salir de aquí: se descubre que dos etiquetas eran
          la misma pregunta cuando ya existen, no al crearlas. */}
      <form action={agruparTag} className="flex items-center">
        <input type="hidden" name="id" value={t.id} />
        <input
          name="grupo"
          defaultValue={t.grupo ?? ""}
          list="grupos-de-etiquetas"
          placeholder="sin grupo"
          className="w-28 rounded-md border border-linea-2 bg-suave/40 px-1.5 py-0.5 text-[11px] text-ink-2 focus:outline-none"
          title="Etiquetas del mismo grupo son excluyentes: poner una quita las demás"
        />
        <button className="ml-1 text-[11px] font-semibold text-violet hover:underline">Guardar</button>
      </form>

      <form action={deleteTag}>
        <input type="hidden" name="id" value={t.id} />
        <button className="text-ink-3 transition hover:text-danger" title="Eliminar">✕</button>
      </form>
    </div>
  );

  return (
    <div>
      <datalist id="grupos-de-etiquetas">
        {grupos.map((g) => <option key={g} value={g} />)}
      </datalist>

      <form action={createTag} className="mb-4 flex flex-wrap items-end gap-3 rounded-2xl border border-linea bg-tarjeta p-4">
        <div className="min-w-[180px] flex-1">
          <label className="mb-1.5 block text-xs font-semibold text-ink-2">Nombre de la etiqueta</label>
          <input name="name" required placeholder="lead-caliente" className="input-l w-full" />
        </div>
        <div className="min-w-[160px]">
          <label className="mb-1.5 block text-xs font-semibold text-ink-2">Grupo (opcional)</label>
          <input
            name="grupo"
            list="grupos-de-etiquetas"
            placeholder="Calificación"
            className="input-l w-full"
          />
        </div>
        <div>
          <label className="mb-1.5 block text-xs font-semibold text-ink-2">Color</label>
          <input type="color" name="color" defaultValue="#F64A97" className="h-11 w-14 cursor-pointer rounded-lg border border-linea-2 bg-tarjeta" />
        </div>
        <button className="btn-primary">Crear etiqueta</button>
      </form>

      <div className="mb-6 flex items-start gap-2 rounded-xl border border-linea bg-suave/40 p-3 text-xs leading-relaxed text-ink-2">
        <Info className="mt-0.5 h-4 w-4 flex-none text-violet" />
        <span>
          Las etiquetas de un <b className="text-ink">mismo grupo son excluyentes</b>: al poner una, se
          quita la anterior. Úsalo para lo que es <i>una sola respuesta</i> — la calificación de un lead,
          por ejemplo. Sin grupo, las etiquetas se acumulan, que es lo que quieres para «vip» o «cliente
          antiguo».
        </span>
      </div>

      {porGrupo.map(([g, lista]) => (
        <div key={g} className="mb-5">
          <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-ink-3">
            {g} <span className="font-normal normal-case tracking-normal">· solo una a la vez</span>
          </p>
          <div className="flex flex-wrap gap-2">{lista.map(chip)}</div>
        </div>
      ))}

      {sueltas.length > 0 && (
        <div>
          <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-ink-3">
            Sin grupo <span className="font-normal normal-case tracking-normal">· se acumulan</span>
          </p>
          <div className="flex flex-wrap gap-2">{sueltas.map(chip)}</div>
        </div>
      )}

      {tags.length === 0 && (
        <p className="text-sm text-ink-3">Aún no tienes etiquetas. Crea la primera arriba 👆</p>
      )}

      {/* Va DEBAJO de las etiquetas y no en otra pantalla: una regla solo se
          entiende viendo las etiquetas que va a poner, y quien acaba de crear
          «lead-bajo» está a un palmo de querer decir cuándo se pone. */}
      {tags.length > 0 && (
        <ReglasDeCalificacion
          reglas={reglas}
          campos={(campos ?? []) as any[]}
          etiquetas={tags.map((t) => ({ id: t.id, name: t.name, grupo: t.grupo ?? null }))}
        />
      )}
    </div>
  );
}
