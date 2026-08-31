import { createClient } from "@/lib/supabase/server";
import { getCurrentOrgId } from "@/lib/org";
import { guardarReparto } from "../actions";
import { ReglasDeReparto } from "@/components/ReglasDeReparto";
import { Users, Clock, Circle, Info } from "lucide-react";

export const dynamic = "force-dynamic";

/**
 * Reparto automático de conversaciones.
 *
 * Lo que hace que esto sirva en la vida real no es la rotación —eso lo tiene
 * cualquiera— sino los tres modificadores: solo a quien está en línea, al que
 * menos carga trae, y con un tope por persona. Sin ellos el chat le cae al que
 * se fue a comer, o al que ya trae quince abiertos.
 */
export default async function RepartoPage() {
  const sb = createClient();
  const orgId = await getCurrentOrgId();

  const [{ data: cfg }, { data: equipos }, { data: miembros }, { data: org }, { data: etiquetas }, { data: reglasRaw }] =
    await Promise.all([
      sb.from("assignment_settings").select("*").maybeSingle(),
      sb.from("teams").select("id, name").order("name"),
      sb.from("team_members").select("id, name, available, last_seen_at, team_id").order("name"),
      sb.from("organizations").select("timezone").limit(1).maybeSingle(),
      sb.from("tags").select("id, name, color, grupo").order("name"),
      sb
        .from("reglas_de_reparto")
        .select("id, prioridad, tag:tags(name, color), member:team_members(name), team:teams(name)")
        .eq("activa", true)
        .order("prioridad", { ascending: false }),
    ]);

  // Se aplana aquí para que el componente no tenga que saber si el destino era
  // una persona o un equipo: solo pinta un nombre.
  const reglas = ((reglasRaw ?? []) as any[]).map((r) => ({
    id: r.id as string,
    prioridad: r.prioridad as number,
    tag: (r.tag ?? null) as { name: string; color: string | null } | null,
    destino: r.member?.name ?? (r.team?.name ? `Equipo ${r.team.name}` : "—"),
  }));

  const s = (cfg ?? {}) as any;
  const gente = (miembros ?? []) as any[];
  const enLinea = (m: any) =>
    m.available && m.last_seen_at && Date.now() - new Date(m.last_seen_at).getTime() < 5 * 60_000;
  const disponiblesAhora = gente.filter(enLinea).length;

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h3 className="font-display text-lg font-semibold text-ink">Reparto automático</h3>
        <p className="mt-1 max-w-2xl text-sm text-ink-2">
          Cuando un cliente pide hablar con una persona —porque escribió el atajo o porque el
          chatbot lo mandó— la conversación se le asigna sola a alguien de tu equipo.
        </p>
      </div>

      {/* Quién está ahora */}
      <div className="flex flex-wrap items-center gap-3 rounded-xl border border-linea bg-tarjeta p-4">
        <Users className="h-4 w-4 flex-none text-violet" />
        <span className="text-sm text-ink-2">
          <b className="text-ink">{disponiblesAhora}</b> de {gente.length} en línea ahora mismo
        </span>
        <div className="ml-auto flex flex-wrap gap-2">
          {gente.map((m) => (
            <span
              key={m.id}
              className="inline-flex items-center gap-1.5 rounded-lg border border-linea px-2 py-1 text-xs"
              title={
                enLinea(m) ? "En línea" : m.available ? "Disponible, pero sin la app abierta" : "Marcado como ausente"
              }
            >
              <Circle
                className={`h-2 w-2 ${
                  enLinea(m) ? "fill-success text-success"
                  : m.available ? "fill-warning text-warning"
                  : "fill-[#c9cce0] text-[#c9cce0]"
                }`}
              />
              <span className="text-ink">{m.name}</span>
            </span>
          ))}
          {!gente.length && <span className="text-xs text-ink-3">Todavía no tienes miembros en tu equipo.</span>}
        </div>
      </div>

      <form action={guardarReparto} className="flex flex-col gap-5 rounded-2xl border border-linea bg-tarjeta p-5">
        <label className="flex items-start gap-3">
          <input
            type="checkbox"
            name="enabled"
            defaultChecked={!!s.enabled}
            className="mt-1 h-4 w-4 flex-none accent-violet"
          />
          <span>
            <b className="text-ink">Repartir las conversaciones solo</b>
            <span className="block text-sm text-ink-2">
              Apagado, las conversaciones se quedan sin dueño hasta que alguien las tome a mano.
            </span>
          </span>
        </label>

        <div className="border-t border-linea pt-5">
          <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-ink-3">¿A quién le toca?</p>
          <div className="flex flex-col gap-2">
            <label className="flex items-start gap-3 rounded-xl border border-linea p-3">
              <input
                type="radio" name="strategy" value="menos_carga"
                defaultChecked={(s.strategy ?? "menos_carga") === "menos_carga"}
                className="mt-1 h-4 w-4 flex-none accent-violet"
              />
              <span>
                <b className="text-ink">Al que menos conversaciones abiertas tenga</b>
                <span className="block text-sm text-ink-2">
                  Lo recomendado. Reparte según quién está más libre de verdad, no según a quién le toca.
                </span>
              </span>
            </label>
            <label className="flex items-start gap-3 rounded-xl border border-linea p-3">
              <input
                type="radio" name="strategy" value="rueda"
                defaultChecked={s.strategy === "rueda"}
                className="mt-1 h-4 w-4 flex-none accent-violet"
              />
              <span>
                <b className="text-ink">Por turnos, en orden</b>
                <span className="block text-sm text-ink-2">
                  Uno a cada quien, en rueda. Útil cuando todas las conversaciones pesan lo mismo.
                </span>
              </span>
            </label>
          </div>
        </div>

        <div className="flex flex-col gap-4 border-t border-linea pt-5">
          <p className="text-xs font-semibold uppercase tracking-wide text-ink-3">Con quién sí</p>

          <label className="flex items-start gap-3">
            <input
              type="checkbox" name="solo_en_linea"
              defaultChecked={s.solo_en_linea ?? true}
              className="mt-1 h-4 w-4 flex-none accent-violet"
            />
            <span>
              <b className="text-ink">Solo a quien esté en línea</b>
              <span className="block text-sm text-ink-2">
                Sin esto, el chat puede caerle a alguien que ya se fue y el cliente espera horas. Una
                persona cuenta como en línea mientras tenga la plataforma abierta y no se haya
                marcado como ausente.
              </span>
            </span>
          </label>

          <div className="grid gap-4 sm:grid-cols-2">
            <label className="block">
              <span className="mb-1.5 block text-xs font-semibold text-ink-2">
                Máximo de conversaciones abiertas por persona
              </span>
              <input
                type="number" name="max_abiertas" min={1} max={500}
                defaultValue={s.max_abiertas ?? ""}
                placeholder="Sin tope"
                className="input-l"
              />
              <span className="mt-1 block text-xs text-ink-3">
                Al llegar al tope deja de recibir hasta que cierre alguna. Vacío = sin tope.
              </span>
            </label>

            <label className="block">
              <span className="mb-1.5 block text-xs font-semibold text-ink-2">Solo este equipo</span>
              <select name="team_id" defaultValue={s.team_id ?? ""} className="input-l">
                <option value="">Todo el equipo</option>
                {(equipos ?? []).map((t: any) => (
                  <option key={t.id} value={t.id}>{t.name}</option>
                ))}
              </select>
              <span className="mt-1 block text-xs text-ink-3">
                Útil si solo Ventas debe atender los chats entrantes.
              </span>
            </label>
          </div>
        </div>

        <div className="flex flex-col gap-4 border-t border-linea pt-5">
          <p className="text-xs font-semibold uppercase tracking-wide text-ink-3">Cuándo</p>

          <label className="flex items-start gap-3">
            <input
              type="checkbox" name="solo_horario"
              defaultChecked={!!s.solo_horario}
              className="mt-1 h-4 w-4 flex-none accent-violet"
            />
            <span>
              <b className="text-ink">Solo dentro del horario laboral</b>
              <span className="block text-sm text-ink-2">
                Fuera de horario las conversaciones esperan en la cola y se reparten al abrir. Tu
                horario y zona ({org?.timezone ?? "America/Mexico_City"}) se configuran en{" "}
                <b className="text-ink-2">Horario laboral</b>.
              </span>
            </span>
          </label>

          <label className="block max-w-xs">
            <span className="mb-1.5 block text-xs font-semibold text-ink-2">
              Cuánto espera en la cola antes de rendirse
            </span>
            <div className="flex items-center gap-2">
              <input
                type="number" name="espera_horas" min={1} max={168}
                defaultValue={s.espera_horas ?? 24}
                className="input-l"
              />
              <span className="flex-none text-sm text-ink-2">horas</span>
            </div>
            <span className="mt-1 block text-xs text-ink-3">
              Pasado ese tiempo deja de intentarlo. La conversación sigue en la Bandeja para que
              alguien la tome a mano — nunca se pierde.
            </span>
          </label>
        </div>

        <div className="flex items-center gap-3 border-t border-linea pt-5">
          <button className="btn-primary">Guardar</button>
          <span className="text-xs text-ink-3">
            <Clock className="mr-1 inline h-3 w-3" />
            La cola se reintenta sola cada 2 minutos.
          </span>
        </div>
      </form>

      <ReglasDeReparto
        reglas={reglas}
        etiquetas={(etiquetas ?? []) as any[]}
        miembros={(miembros ?? []) as any[]}
        equipos={(equipos ?? []) as any[]}
      />

      <div className="flex gap-3 rounded-xl border border-linea-2 bg-tarjeta-2 p-4 text-sm leading-relaxed text-ink-2">
        <Info className="mt-0.5 h-4 w-4 flex-none text-violet" />
        <div>
          <b className="text-ink">Si nadie cumple, no se asigna a la fuerza.</b> La conversación
          espera en la cola y se reparte en cuanto alguien vuelva a estar disponible. Es preferible
          a dejarla en el buzón de alguien que no la va a ver.
        </div>
      </div>
    </div>
  );
}
