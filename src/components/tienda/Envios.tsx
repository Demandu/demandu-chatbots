"use client";

import { useState } from "react";
import { useFormState, useFormStatus } from "react-dom";
import { Bike, MapPin, ExternalLink } from "lucide-react";
import { VEHICULOS } from "@/lib/tienda/asap";
import { BuscarDireccion } from "@/components/BuscarDireccion";
import type { Estado } from "@/app/(dashboard)/tienda/[id]/actions";

function Guardar() {
  const { pending } = useFormStatus();
  return (
    <button className="btn-primary" disabled={pending}>
      {pending ? "Guardando…" : "Guardar envíos"}
    </button>
  );
}

/**
 * Los envíos de una tienda, con ASAP.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * CADA NEGOCIO USA SU PROPIA CUENTA DE ASAP, igual que con Yappy. ASAP le cobra
 * el envío a él, con su tarifa y su contrato. Demandu no factura el reparto de
 * nadie ni se mete en medio.
 *
 * LOS SECRETOS NO SE ENSEÑAN NUNCA, ni al dueño. Solo se dice si hay uno
 * guardado. Y dejar el campo en blanco NO lo borra: si lo borrara, guardar
 * cualquier otro cambio dejaría al negocio sin repartos, sin aviso y sin pista
 * de por qué. Es la misma regla que aprendimos en Cobros.
 *
 * ── LAS COORDENADAS DEL LOCAL SON LO QUE MÁS SE VA A EQUIVOCAR ────────────
 *
 * ASAP no acepta «PH Pijao, apto 12B»: exige cuatro números. Y no se pueden
 * adivinar de la dirección — en Panamá media ciudad no tiene nomenclatura y los
 * mapas inventan. Una coordenada adivinada manda la moto a otro barrio sin
 * error y sin aviso, con el negocio pagando el viaje.
 *
 * Por eso aquí se explica cómo sacarlas de Google Maps, paso a paso, en vez de
 * poner un campo «lat» y otro «long» y confiar. Y hay un enlace para verlas en
 * el mapa: es la única forma de que alguien descubra que se equivocó ANTES de
 * que salga la primera moto.
 * ─────────────────────────────────────────────────────────────────────────────
 */
export function Envios({
  tiendaId,
  config,
  tieneLlave,
  tieneToken,
  tieneSecreto,
  accion,
}: {
  tiendaId: string;
  config: {
    activo: boolean;
    ambiente: "prueba" | "produccion";
    telefono: string;
    origen_direccion: string;
    origen_lat: string;
    origen_long: string;
    origen_nombre: string;
    origen_telefono: string;
    origen_nota: string;
    vehiculo: string;
  };
  tieneLlave: boolean;
  tieneToken: boolean;
  tieneSecreto: boolean;
  accion: (e: Estado, fd: FormData) => Promise<Estado>;
}) {
  const [estado, enviar] = useFormState(accion, { ok: false, mensaje: "" });
  const [lat, setLat] = useState(config.origen_lat);
  const [long, setLong] = useState(config.origen_long);
  const [direccion, setDireccion] = useState(config.origen_direccion);

  const hayPunto = lat.trim() !== "" && long.trim() !== "";

  return (
    <form action={enviar} className="max-w-2xl space-y-6">
      <input type="hidden" name="tienda_id" value={tiendaId} />

      <div className="card-l p-5">
        <div className="mb-1 flex items-center gap-2">
          <Bike className="h-4 w-4 text-pink" />
          <h3 className="font-display text-base font-bold text-ink">Reparto con ASAP</h3>
        </div>
        <p className="mb-4 text-sm text-ink-2">
          Cuando un pedido esté listo, lo mandas a un mensajero desde el tablero. El envío te lo cobra ASAP a ti, con
          tu tarifa y tu contrato: Demandu no cobra nada por esto.
        </p>

        <label className="flex items-start gap-2.5">
          <input type="checkbox" name="activo" defaultChecked={config.activo} className="mt-0.5 h-4 w-4" />
          <span className="text-sm text-ink">
            <b>Activar los envíos con ASAP</b>
            <span className="block text-xs text-ink-3">
              Desactivado, el botón de enviar no aparece en los pedidos. Nada más cambia.
            </span>
          </span>
        </label>
      </div>

      {/* ── Las credenciales ────────────────────────────────────────────────── */}
      <div className="card-l p-5">
        <h3 className="mb-1 font-display text-base font-bold text-ink">Tu cuenta de ASAP</h3>
        <p className="mb-4 text-sm text-ink-2">
          El <b className="text-ink">user token</b> lo generas tú desde{" "}
          <a
            href="https://business.goasap.app/manage/corporate-users"
            target="_blank"
            rel="noreferrer"
            className="text-pink underline-offset-2 hover:underline"
          >
            ASAP Business <ExternalLink className="inline h-3 w-3" />
          </a>{" "}
          → Usuarios corporativos → ⋮ → Generar Token. La <b className="text-ink">API key</b> y el{" "}
          <b className="text-ink">shared secret</b> te los da su equipo de integraciones: no están en el panel.
        </p>

        <div className="grid gap-4">
          <Secreto
            nombre="api_key"
            etiqueta="API key"
            guardado={tieneLlave}
            ayuda="Te la da el equipo de integraciones de ASAP."
          />
          <Secreto
            nombre="user_token"
            etiqueta="User token"
            guardado={tieneToken}
            ayuda="ASAP Business → Usuarios corporativos → ⋮ → Generar Token."
          />
          <Secreto
            nombre="shared_secret"
            etiqueta="Shared secret"
            guardado={tieneSecreto}
            ayuda="Te lo da el equipo de integraciones de ASAP."
          />

          <label className="block">
            <span className="mb-1 block text-sm font-semibold text-ink">Teléfono de la cuenta</span>
            <input
              name="telefono"
              defaultValue={config.telefono}
              placeholder="50769983815"
              className="input-l"
            />
            <span className="mt-1 block text-xs text-ink-3">
              El del usuario corporativo con el que generaste el token. Con código de país y sin signos.
            </span>
          </label>

          <label className="block">
            <span className="mb-1 block text-sm font-semibold text-ink">Entorno</span>
            <select name="ambiente" defaultValue={config.ambiente} className="input-l">
              <option value="prueba">Pruebas — no sale ninguna moto</option>
              <option value="produccion">Producción — los envíos son reales</option>
            </select>
            <span className="mt-1 block text-xs text-ink-3">
              Las credenciales de pruebas y las de producción NO son las mismas. Si pones unas de producción en
              «Pruebas», ASAP responderá que no te conoce.
            </span>
          </label>
        </div>
      </div>

      {/* ── El punto de recogida ────────────────────────────────────────────── */}
      <div className="card-l p-5">
        <div className="mb-1 flex items-center gap-2">
          <MapPin className="h-4 w-4 text-pink" />
          <h3 className="font-display text-base font-bold text-ink">De dónde recoge el mensajero</h3>
        </div>
        <p className="mb-4 text-sm text-ink-2">
          Tu local. Se manda igual en todos los pedidos, así que se pone una vez.
        </p>

        <div className="grid gap-4">
          {/* ── ESCRIBIR Y ELEGIR RELLENA LAS COORDENADAS SOLO ─────────────
              Es la parte que de verdad importa: nadie tiene que enterarse de
              que existe una latitud. Los dos campos de abajo siguen ahí, para
              corregir a mano y para ver qué se guardó. */}
          <label className="block">
            <span className="mb-1 block text-sm font-semibold text-ink">Dirección del local</span>
            <BuscarDireccion
              valor={direccion}
              onCambio={setDireccion}
              onPunto={(p) => {
                setDireccion(p.direccion);
                setLat(String(p.lat));
                setLong(String(p.long));
              }}
              placeholder="PH Pijao, Calle 50, Ciudad de Panamá"
            />
            <input type="hidden" name="origen_direccion" value={direccion} />
          </label>

          {/* ── LAS COORDENADAS, CON LAS INSTRUCCIONES DELANTE ─────────────────
              Un campo «lat» y otro «long» sin explicación es un campo que se
              rellena mal. Y mal aquí significa una moto en otro barrio. */}
          <div className="rounded-xl border border-linea bg-suave p-4">
            <p className="mb-2 text-sm font-semibold text-ink">Tu local en el mapa</p>
            <p className="mb-3 text-xs leading-relaxed text-ink-2">
              Si elegiste tu local de la lista de arriba, esto ya está puesto y no hay que tocarlo. Si tu local no
              aparece en Google, sácalo a mano: abre{" "}
              <a
                href="https://maps.google.com"
                target="_blank"
                rel="noreferrer"
                className="text-pink underline-offset-2 hover:underline"
              >
                Google Maps
              </a>
              , mantén pulsado sobre la puerta de tu local, y copia los dos números que aparecen arriba.
            </p>

            <div className="grid gap-3 sm:grid-cols-2">
              <label className="block">
                <span className="mb-1 block text-xs font-semibold text-ink-2">Latitud</span>
                <input
                  name="origen_lat"
                  value={lat}
                  onChange={(e) => setLat(e.target.value)}
                  placeholder="9.0136814"
                  className="input-l"
                />
              </label>
              <label className="block">
                <span className="mb-1 block text-xs font-semibold text-ink-2">Longitud</span>
                <input
                  name="origen_long"
                  value={long}
                  onChange={(e) => setLong(e.target.value)}
                  placeholder="-79.4796534"
                  className="input-l"
                />
              </label>
            </div>

            {/* COMPROBARLO ES LA PARTE QUE IMPORTA. Un número mal copiado no se
                nota leyéndolo; se nota viéndolo en el mapa. */}
            {hayPunto && (
              <a
                href={`https://www.google.com/maps?q=${encodeURIComponent(lat.trim())},${encodeURIComponent(long.trim())}`}
                target="_blank"
                rel="noreferrer"
                className="mt-3 inline-flex items-center gap-1.5 text-sm font-semibold text-pink underline-offset-2 hover:underline"
              >
                <MapPin className="h-3.5 w-3.5" /> Ver ese punto en el mapa
                <ExternalLink className="h-3 w-3" />
              </a>
            )}
            <p className="mt-2 text-xs text-ink-3">
              Compruébalo antes de guardar. Un número mal copiado no se ve leyéndolo, y manda la moto a otro sitio sin
              dar ningún error.
            </p>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <label className="block">
              <span className="mb-1 block text-sm font-semibold text-ink">A quién pregunta al llegar</span>
              <input
                name="origen_nombre"
                defaultValue={config.origen_nombre}
                placeholder="Ana, en el mostrador"
                className="input-l"
              />
            </label>
            <label className="block">
              <span className="mb-1 block text-sm font-semibold text-ink">Teléfono del local</span>
              <input
                name="origen_telefono"
                defaultValue={config.origen_telefono}
                placeholder="50769983815"
                className="input-l"
              />
            </label>
          </div>

          <label className="block">
            <span className="mb-1 block text-sm font-semibold text-ink">Instrucciones para recoger</span>
            <input
              name="origen_nota"
              defaultValue={config.origen_nota}
              placeholder="Entrada por el parking, timbre 3"
              className="input-l"
            />
            <span className="mt-1 block text-xs text-ink-3">
              Va en todos los envíos. Lo que le dirías por teléfono a alguien que nunca ha venido.
            </span>
          </label>

          <label className="block">
            <span className="mb-1 block text-sm font-semibold text-ink">Vehículo</span>
            <select name="vehiculo" defaultValue={config.vehiculo || "bike"} className="input-l">
              {VEHICULOS.map((v) => (
                <option key={v.valor} value={v.valor}>
                  {v.label}
                </option>
              ))}
            </select>
          </label>
        </div>
      </div>

      {estado.mensaje && (
        <p className={`text-sm ${estado.ok ? "text-exito" : estado.tono === "aviso" ? "text-aviso" : "text-alerta"}`}>
          {estado.mensaje}
        </p>
      )}

      <Guardar />
    </form>
  );
}

/**
 * Un campo de secreto.
 *
 * NO SE ENSEÑA LO GUARDADO, ni con puntitos que se puedan seleccionar. Solo se
 * dice si hay algo. Y dejarlo en blanco no borra: quien viene a cambiar el
 * teléfono del local no puede quedarse sin repartos por no haber vuelto a pegar
 * tres llaves que no tenía a mano.
 */
function Secreto({
  nombre,
  etiqueta,
  guardado,
  ayuda,
}: {
  nombre: string;
  etiqueta: string;
  guardado: boolean;
  ayuda: string;
}) {
  return (
    <label className="block">
      <span className="mb-1 block text-sm font-semibold text-ink">
        {etiqueta}{" "}
        {guardado && <span className="ml-1 text-xs font-normal text-exito">· guardado</span>}
      </span>
      <input
        name={nombre}
        type="password"
        autoComplete="off"
        placeholder={guardado ? "Déjalo en blanco para no cambiarlo" : "Pégalo aquí"}
        className="input-l"
      />
      <span className="mt-1 block text-xs text-ink-3">{ayuda}</span>
    </label>
  );
}
