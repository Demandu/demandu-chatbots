import { createClient } from "@/lib/supabase/server";
import { AttributeForm } from "@/components/AttributeForm";
import { toggleAttributeVisibility, deleteAttribute } from "../actions";

export const dynamic = "force-dynamic";

const TYPE_LABEL: Record<string, string> = {
  string: "Texto",
  number: "Número entero",
  float: "Decimal",
  email: "Correo",
  phone: "Teléfono",
  date: "Fecha",
  boolean: "Sí / No",
  list: "Lista",
};

const PURPOSE_LABEL: Record<string, string> = {
  chatbot: "Respuesta del bot",
  api: "Respuesta de API",
  agent: "Respuesta del agente",
};

export default async function AttributesPage() {
  const { data } = await createClient()
    .from("custom_attributes")
    .select("*")
    .order("sort")
    .order("created_at");
  const attrs = (data ?? []) as any[];

  return (
    <div>
      <div className="mb-5">
        <h2 className="font-display text-lg font-semibold text-ink">Atributos personalizados</h2>
        <p className="text-xs text-ink-3">
          Define los campos donde el chatbot guarda las respuestas de tus contactos. Luego los eliges en el bloque <b className="text-ink-2">Pregunta</b>.
        </p>
      </div>

      <AttributeForm />

      {attrs.length === 0 ? (
        <p className="rounded-xl border border-dashed border-[#d7d9e8] px-4 py-6 text-center text-sm text-ink-3">
          Aún no tienes atributos. Crea el primero arriba.
        </p>
      ) : (
        <div className="overflow-x-auto rounded-2xl border border-[#e6e8f2]">
          <table className="min-w-[560px] w-full text-sm">
            <thead className="bg-[#f4f5fb] text-left text-[11px] font-bold uppercase tracking-wide text-ink-3">
              <tr>
                <th className="px-4 py-3">Nombre</th>
                <th className="px-4 py-3">Clave</th>
                <th className="px-4 py-3">Tipo</th>
                <th className="px-4 py-3">Origen</th>
                <th className="px-4 py-3 text-center">Visible</th>
                <th className="px-4 py-3 text-right">Acción</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#e6e8f2]">
              {attrs.map((a) => (
                <tr key={a.id} className="bg-white">
                  <td className="px-4 py-3 font-medium text-ink">{a.name}</td>
                  <td className="px-4 py-3 font-mono text-xs text-ink-2">{a.key}</td>
                  <td className="px-4 py-3 text-ink-2">{TYPE_LABEL[a.type] ?? a.type}</td>
                  <td className="px-4 py-3">
                    <span className="rounded-md bg-[#f1f2f9] px-2 py-0.5 text-[11px] text-ink-2">
                      {PURPOSE_LABEL[a.purpose] ?? a.purpose}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-center">
                    <form action={toggleAttributeVisibility}>
                      <input type="hidden" name="id" value={a.id} />
                      <input type="hidden" name="visible" value={String(a.visible)} />
                      <button
                        title={a.visible ? "Visible en el perfil del contacto" : "Oculto"}
                        className={`h-5 w-9 rounded-full p-0.5 transition ${a.visible ? "bg-gradient-to-r from-pink to-violet" : "bg-[#d5d8e8]"}`}
                      >
                        <span className={`block h-4 w-4 rounded-full bg-white shadow transition-all ${a.visible ? "translate-x-4" : ""}`} />
                      </button>
                    </form>
                  </td>
                  <td className="px-4 py-3 text-right">
                    <form action={deleteAttribute} className="inline">
                      <input type="hidden" name="id" value={a.id} />
                      <button className="px-1 text-ink-3 transition hover:text-danger" title="Eliminar">✕</button>
                    </form>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
