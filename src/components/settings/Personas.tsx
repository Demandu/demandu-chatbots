"use client";

import { useState, useTransition } from "react";
import { ShieldCheck, Trash2, TriangleAlert, X } from "lucide-react";
import {
  PERMISOS,
  ROLES,
  resolverPermisos,
  type ClavePermiso,
  type Rol,
} from "@/lib/permisos";
import { guardarAcceso, borrarPersona } from "@/app/(dashboard)/settings/teams/actions";

export type Persona = {
  id: string;
  nombre: string;
  correo: string | null;
  telefono: string | null;
  team_id: string | null;
  disponible: boolean;
  tiene_acceso: boolean;
  rol: Rol | null;
  permisos: Record<string, boolean> | null;
  es_tu_cuenta: boolean;
  es_dueno: boolean;
  conversaciones: number;
  tarjetas: number;
  tareas: number;
};

/**
 * Las personas del equipo: quién es, qué recibe y qué puede.
 *
 * UNA SOLA LISTA A PROPÓSITO. Antes había dos —agentes que reciben chats por
 * un lado, cuentas que pueden entrar por otro— y para el cliente eso no tiene
 * ninguna lógica: para él son "las personas de mi equipo". Se podía crear un
 * agente que recibiera conversaciones y no pudiera entrar a verlas.
 *
 * LAS CASILLAS SE PINTAN, NO SE GUARDAN ENTERAS. Lo que se manda al servidor es
 * solo lo que se aparta del rol; ver `diferenciaConElRol`.
 */
export function Personas({
  personas,
  equipos,
}: {
  personas: Persona[];
  equipos: { id: string; name: string }[];
}) {
  const [aBorrar, setABorrar] = useState<Persona | null>(null);

  return (
    <>
      <div className="space-y-3">
        {personas.map((p) => (
          <FichaDePersona
            key={p.id}
            persona={p}
            equipo={equipos.find((e) => e.id === p.team_id)?.name ?? null}
            onBorrar={() => setABorrar(p)}
          />
        ))}
        {personas.length === 0 && (
          <p className="rounded-2xl border border-linea bg-tarjeta p-6 text-center text-sm text-ink-3">
            Aún no tienes a nadie en el equipo. Agrega a la primera persona arriba 👆
          </p>
        )}
      </div>

      {aBorrar && <AvisoDeBorrado persona={aBorrar} onCerrar={() => setABorrar(null)} />}
    </>
  );
}

/* ────────────────────────────────────────────────────────────────────────── */

function FichaDePersona({
  persona,
  equipo,
  onBorrar,
}: {
  persona: Persona;
  equipo: string | null;
  onBorrar: () => void;
}) {
  const [abierta, setAbierta] = useState(false);

  return (
    <div className="rounded-2xl border border-linea bg-tarjeta">
      <div className="flex flex-wrap items-center gap-3 p-4">
        <div className="min-w-0 flex-1">
          <p className="truncate font-semibold text-ink">{persona.nombre}</p>
          <p className="truncate text-xs text-ink-3">
            {persona.correo || "sin correo"}
            {equipo && <> · {equipo}</>}
            {persona.telefono && <> · {persona.telefono}</>}
          </p>
        </div>

        <Etiqueta persona={persona} />

        {/* El dueño no se puede quitar: es la única cuenta que garantiza que
            alguien puede volver a entrar. */}
        {!persona.es_dueno && !persona.es_tu_cuenta && (
          <button
            onClick={onBorrar}
            title="Quitar del equipo"
            className="rounded-lg p-2 text-ink-3 transition hover:bg-danger/10 hover:text-danger"
          >
            <Trash2 className="h-4 w-4" />
          </button>
        )}

        {persona.tiene_acceso && !persona.es_dueno && !persona.es_tu_cuenta && (
          <button
            onClick={() => setAbierta((v) => !v)}
            className="rounded-lg border border-linea px-3 py-1.5 text-xs font-semibold text-ink-2 transition hover:bg-suave-2"
          >
            {abierta ? "Cerrar" : "Permisos"}
          </button>
        )}
      </div>

      {abierta && persona.tiene_acceso && <EditorDePermisos persona={persona} />}
    </div>
  );
}

function Etiqueta({ persona }: { persona: Persona }) {
  if (persona.es_dueno) {
    return (
      <span className="inline-flex items-center gap-1.5 rounded-full border border-pink/35 bg-pink/10 px-3 py-1 text-xs font-semibold text-pink">
        <ShieldCheck className="h-3.5 w-3.5" /> Dueño · acceso total
      </span>
    );
  }
  if (!persona.tiene_acceso) {
    return (
      <span className="rounded-full border border-linea px-3 py-1 text-xs font-medium text-ink-3">
        Recibe chats · no entra a la plataforma
      </span>
    );
  }
  const nombre = ROLES.find((r) => r.valor === persona.rol)?.nombre ?? persona.rol;
  return (
    <span className="rounded-full border border-linea bg-suave px-3 py-1 text-xs font-semibold text-ink-2">
      {nombre}
      {persona.es_tu_cuenta && " · eres tú"}
    </span>
  );
}

/* ────────────────────────────────────────────────────────────────────────── */

function EditorDePermisos({ persona }: { persona: Persona }) {
  const [rol, setRol] = useState<Rol>((persona.rol as Rol) ?? "viewer");
  const [marcados, setMarcados] = useState<Set<ClavePermiso>>(
    () => resolverPermisos(persona.rol, persona.permisos),
  );
  const [guardando, empezar] = useTransition();
  const [aviso, setAviso] = useState<{ ok: boolean; texto: string } | null>(null);

  /**
   * Cambiar el rol REINICIA las casillas a lo que ese rol trae de fábrica.
   * Es lo que espera cualquiera al mover un desplegable de rol, y además evita
   * el estado confuso de "dice Atención al cliente pero tiene marcado Plan y
   * facturación" sin que nadie recuerde por qué.
   */
  const cambiarRol = (nuevo: Rol) => {
    setRol(nuevo);
    setMarcados(resolverPermisos(nuevo, null));
    setAviso(null);
  };

  const alternar = (clave: ClavePermiso) => {
    setMarcados((antes) => {
      const copia = new Set(antes);
      copia.has(clave) ? copia.delete(clave) : copia.add(clave);
      return copia;
    });
    setAviso(null);
  };

  const guardar = () =>
    empezar(async () => {
      const r = await guardarAcceso({ persona: persona.id, rol, permisos: [...marcados] });
      setAviso(
        r.ok
          ? { ok: true, texto: "Guardado. Lo verá en su siguiente pantalla." }
          : { ok: false, texto: r.error ?? "No se pudo guardar." },
      );
    });

  return (
    <div className="border-t border-linea p-4">
      <div className="mb-4 max-w-sm">
        <label className="mb-1.5 block text-xs font-semibold text-ink-2">Rol</label>
        <select value={rol} onChange={(e) => cambiarRol(e.target.value as Rol)} className="input-l">
          {ROLES.filter((r) => r.valor !== "owner").map((r) => (
            <option key={r.valor} value={r.valor}>
              {r.nombre}
            </option>
          ))}
        </select>
        <p className="mt-1.5 text-[11px] text-ink-3">
          {ROLES.find((r) => r.valor === rol)?.descripcion} Cambiar el rol vuelve a marcar sus
          permisos de fábrica.
        </p>
      </div>

      <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-ink-3">
        Qué puede hacer
      </p>
      <div className="grid gap-1.5 sm:grid-cols-2">
        {PERMISOS.map((p) => {
          const activo = marcados.has(p.clave);
          return (
            <label
              key={p.clave}
              className={`flex cursor-pointer items-start gap-2.5 rounded-xl border p-2.5 transition ${
                activo ? "border-pink/35 bg-pink/5" : "border-linea hover:bg-suave-2"
              }`}
            >
              <input
                type="checkbox"
                checked={activo}
                onChange={() => alternar(p.clave)}
                className="mt-0.5 h-4 w-4 flex-none accent-pink"
              />
              <span className="min-w-0">
                <span className="block text-sm font-medium text-ink">
                  {p.nombre}
                  {p.riesgo && (
                    <span className="ml-1.5 align-middle text-[10px] font-bold uppercase text-warning">
                      delicado
                    </span>
                  )}
                </span>
                <span className="block text-[11px] leading-snug text-ink-3">{p.descripcion}</span>
              </span>
            </label>
          );
        })}
      </div>

      <div className="mt-4 flex flex-wrap items-center gap-3">
        <button onClick={guardar} disabled={guardando} className="btn-primary">
          {guardando ? "Guardando…" : "Guardar permisos"}
        </button>
        {aviso && (
          <span className={`text-sm ${aviso.ok ? "text-success" : "text-danger"}`}>{aviso.texto}</span>
        )}
      </div>
    </div>
  );
}

/* ────────────────────────────────────────────────────────────────────────── */

/**
 * El aviso antes de quitar a alguien.
 *
 * DICE CUÁNTO TRABAJO ABIERTO TIENE, y esa es toda la gracia. Un "¿estás
 * seguro?" a secas no informa de nada y se contesta que sí por reflejo; "tiene
 * 40 conversaciones abiertas" hace que la persona se lo piense de verdad.
 *
 * Es una ventana propia y no un `confirm()` del navegador: los diálogos nativos
 * no se pueden explicar ni maquetar, y aquí hay algo que explicar.
 */
function AvisoDeBorrado({ persona, onCerrar }: { persona: Persona; onCerrar: () => void }) {
  const [borrando, empezar] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const pendiente = [
    persona.conversaciones && `${persona.conversaciones} conversaciones abiertas`,
    persona.tarjetas && `${persona.tarjetas} tarjetas en el embudo`,
    persona.tareas && `${persona.tareas} tareas pendientes`,
  ].filter(Boolean) as string[];

  const confirmar = () =>
    empezar(async () => {
      const r = await borrarPersona(persona.id);
      if (r.ok) onCerrar();
      else setError(r.error ?? "No se pudo quitar.");
    });

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"
      onClick={onCerrar}
    >
      <div
        className="w-full max-w-md rounded-2xl border border-linea bg-tarjeta p-5 shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-3 flex items-start gap-3">
          <span className="rounded-xl bg-danger/10 p-2 text-danger">
            <TriangleAlert className="h-5 w-5" />
          </span>
          <div className="min-w-0 flex-1">
            <h3 className="font-display text-lg font-bold text-ink">
              ¿Quitar a {persona.nombre}?
            </h3>
            <p className="text-xs text-ink-3">{persona.correo}</p>
          </div>
          <button onClick={onCerrar} className="rounded-lg p-1 text-ink-3 hover:text-ink">
            <X className="h-4 w-4" />
          </button>
        </div>

        {pendiente.length > 0 ? (
          <div className="rounded-xl border border-warning/40 bg-warning/10 p-3.5 text-sm text-ink">
            <p className="font-semibold">Tiene trabajo sin terminar:</p>
            <ul className="mt-1.5 list-disc space-y-0.5 pl-5 text-ink-2">
              {pendiente.map((t) => (
                <li key={t}>{t}</li>
              ))}
            </ul>
            <p className="mt-2.5 text-ink-2">
              Nada de eso se borra: <b className="text-ink">queda sin asignar</b> y vuelve a la
              bandeja para que alguien lo tome. Pero si no lo reparte nadie, ahí se queda.
            </p>
          </div>
        ) : (
          <p className="rounded-xl border border-linea bg-suave p-3.5 text-sm text-ink-2">
            No tiene conversaciones ni tarjetas abiertas. Se puede quitar sin dejar nada colgando.
          </p>
        )}

        {persona.tiene_acceso && (
          <p className="mt-3 text-sm text-ink-2">
            También perderá el acceso a la plataforma y no podrá volver a entrar.
          </p>
        )}

        {error && <p className="mt-3 text-sm text-danger">{error}</p>}

        <div className="mt-5 flex justify-end gap-2">
          <button
            onClick={onCerrar}
            className="rounded-xl border border-linea px-4 py-2 text-sm font-semibold text-ink-2 transition hover:bg-suave-2"
          >
            Cancelar
          </button>
          <button
            onClick={confirmar}
            disabled={borrando}
            className="rounded-xl bg-danger px-4 py-2 text-sm font-semibold text-white transition hover:opacity-90 disabled:opacity-60"
          >
            {borrando ? "Quitando…" : "Sí, quitar"}
          </button>
        </div>
      </div>
    </div>
  );
}
