import { createClient } from "@/lib/supabase/server";
import { getCurrentOrgId } from "@/lib/org";
import { disconnectIntegration, disconnectWhatsapp, elegirAgenda } from "../actions";
import { agendaQueManda, hayQueElegir, leerPreferida } from "@/lib/agendaElegida";
import { ChannelIcon } from "@/components/inbox/ChannelBadge";
import { WhatsAppConnect } from "@/components/integrations/WhatsAppConnect";
import { GoogleCalendarLogo, CalendlyLogo } from "@/components/integrations/Logos";
import { Catalogo } from "@/components/integrations/Catalogo";
import { LlavesApi, type LlaveFila } from "@/components/integrations/LlavesApi";
import { SheetsConfig, type ConfigSheets } from "@/components/integrations/SheetsConfig";
import { SalidasCrm, type SalidaFila } from "@/components/integrations/SalidasCrm";

export const dynamic = "force-dynamic";

export default async function IntegrationsPage({
  searchParams,
}: {
  searchParams: { connected?: string; ok?: string; error?: string };
}) {
  const orgId = await getCurrentOrgId();
  const sb = createClient();
  const [{ data }, { data: cal }, { data: wa }, { data: orgAgenda }, { data: bots }, { data: intereses }, { data: llaves }, { data: sheets }, { data: salidas }] = await Promise.all([
    sb.from("integrations").select("provider, account_email, data, created_at").eq("org_id", orgId ?? "").eq("provider", "google_calendar").maybeSingle(),
    // NI `access_token` NI `refresh_token`: esta pantalla no los usa para nada
    // y pedirlos con la sesión del usuario los pondría al alcance de una
    // consulta suelta desde la consola del navegador.
    //
    // `data` sí, y ahí vive `firma` —la clave con la que se comprueban los
    // avisos—, así que abajo se pinta SOLO lo que hace falta y nunca el objeto
    // entero.
    sb.from("integrations").select("provider, account_email, data, created_at").eq("org_id", orgId ?? "").eq("provider", "calendly").maybeSingle(),
    // COLUMNAS EXPLÍCITAS, NO `*`. El token dejó de ser legible para una sesión
    // normal, y `*` lo pediría igual: la consulta entera fallaría y esta
    // pantalla se quedaría diciendo «WhatsApp no conectado» a todo el mundo.
    sb.from("whatsapp_channels")
      .select("id, org_id, bot_id, phone_number_id, waba_id, display_number, catalog_id, llamadas, created_at")
      .eq("org_id", orgId ?? "")
      .maybeSingle(),
    sb.from("organizations").select("agenda_preferida").eq("id", orgId ?? "").maybeSingle(),
    sb.from("bots").select("id,name,channel").order("created_at", { ascending: false }),
    sb.from("interes_integraciones").select("proveedor").eq("org_id", orgId ?? ""),
    sb.from("api_keys").select("id, nombre, prefijo, created_at, ultimo_uso, revocada_at")
      .eq("org_id", orgId ?? "").order("created_at", { ascending: false }),
    sb.from("sheets_config").select("hoja_id, hoja_nombre, activo, ultimo_error")
      .eq("org_id", orgId ?? "").maybeSingle(),
    // EL SECRETO NO VIENE EN LA LISTA. La columna dejó de ser legible para una
    // sesión normal —cualquier miembro la leía desde la consola— y se pide
    // abajo, una por una, por una puerta que comprueba el permiso.
    sb.from("salidas")
      .select("id, org_id, nombre, url, eventos, activa, ultimo_intento_at, ultimo_estado, ultimo_error, created_at")
      .eq("org_id", orgId ?? "")
      .order("created_at", { ascending: false }),
  ]);

  // ── EL SECRETO DE FIRMA, UNO POR UNO Y POR LA PUERTA ────────────────────
  //
  // El cliente lo necesita de verdad: es con lo que su sistema comprueba que un
  // aviso viene de Demandu, y la pantalla tiene un botón para copiarlo. Pero
  // pedirlo en la lista lo ponía al alcance de cualquier miembro con una
  // consulta suelta desde el navegador.
  //
  // `secreto_de_salida` comprueba el permiso de conexiones y devuelve nulo a
  // quien no lo tenga: un agente ve sus webhooks y no ve el secreto, que es
  // exactamente lo que debe pasar.
  const filasSalidas = ((salidas as any[]) ?? []);
  const secretos = await Promise.all(
    filasSalidas.map((f) => sb.rpc("secreto_de_salida", { p_id: f.id })),
  );
  const salidasConSecreto = filasSalidas.map((f, i) => ({
    ...f,
    secreto: (secretos[i]?.data as string | null) ?? "",
  }));

  const google = data as any | null;
  const calendars = (google?.data?.calendars as any[]) ?? [];
  const calendly = cal as any | null;

  // La regla de quién manda vive en `agendaElegida.ts`, que es puro y lo usa
  // también el motor. Repetirla aquí es como acaban la pantalla y el bot
  // diciendo cosas distintas.
  const conectadas = { google: !!google, calendly: !!calendly };
  const preferida = leerPreferida((orgAgenda as any)?.agenda_preferida);
  const manda = agendaQueManda(preferida, conectadas);

  const err = searchParams?.error;
  const connected = searchParams?.connected === "1";
  const calOk = searchParams?.ok === "calendly";

  const waBots = ((bots as any[]) ?? []).filter((b) => b.channel === "whatsapp");

  return (
    <div>
      <div className="mb-5">
        <h2 className="font-display text-lg font-semibold text-ink">Integraciones</h2>
        <p className="text-xs text-ink-3">
          Conecta servicios externos para potenciar tus conversaciones. La conexión la inicias tú y puedes revocarla cuando quieras.
        </p>
      </div>

      {connected && (
        <div className="mb-4 rounded-xl border border-success/40 bg-success/10 px-4 py-2.5 text-sm text-exito">
          ✅ Google Calendar se conectó correctamente.
        </div>
      )}
      {calOk && (
        <div className="mb-4 rounded-xl border border-success/40 bg-success/10 px-4 py-2.5 text-sm text-exito">
          ✅ Calendly se conectó correctamente.
        </div>
      )}
      {err && (
        <div className="mb-4 rounded-xl border border-danger/40 bg-danger/10 px-4 py-2.5 text-sm text-danger">
          {/* CADA MOTIVO DICE QUÉ HACER. «No se pudo completar la conexión» deja
              al cliente sin saber si el problema es suyo, nuestro, o de esperar
              demasiado en la pantalla de Calendly — y llama a soporte por las
              tres cosas. */}
          {err === "missing_credentials"
            ? "La conexión con Google no está disponible en este momento. Escríbenos a soporte y lo habilitamos."
            : err === "calendly_sin_credenciales"
            ? "La conexión con Calendly no está disponible en este momento. Escríbenos a soporte y lo habilitamos."
            : err === "calendly_state"
            ? "La conexión tardó demasiado y se cerró por seguridad. Vuelve a pulsar «Conectar Calendly»."
            : err === "sin_permiso"
            ? "Tu usuario no tiene permiso para conectar servicios. Pídeselo a quien administra la cuenta."
            : err === "calendly_fallo"
            ? "Calendly no completó la conexión. Inténtalo de nuevo; si vuelve a pasar, escríbenos."
            : "No se pudo completar la conexión. Inténtalo de nuevo o contacta a soporte."}
        </div>
      )}

      {/* El catálogo primero: es a lo que el cliente entra a esta pantalla.
          Lo que ya está conectado se configura debajo. */}
      <div className="mb-8">
        <Catalogo pedidas={((intereses as any[]) ?? []).map((i) => i.proveedor)} />
      </div>

      <h3 className="mb-3 font-display text-base font-semibold text-ink">Lo que ya puedes conectar</h3>

      {/* Tarjeta Google Calendar */}
      <div className="rounded-2xl border border-linea bg-tarjeta p-5">
        <div className="flex items-start gap-4">
          <span className="grid h-12 w-12 flex-none place-items-center rounded-xl border border-linea bg-tarjeta p-2">
            <GoogleCalendarLogo className="h-full w-full" />
          </span>
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <h3 className="font-display text-base font-semibold text-ink">Google Calendar</h3>
              {google ? (
                <span className="rounded-full bg-success/15 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-exito">Conectado</span>
              ) : (
                <span className="rounded-full bg-suave px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-ink-3">Sin conectar</span>
              )}
            </div>
            <p className="mt-1 text-xs text-ink-3">
              Permite que el bloque <b className="text-ink-2">Agendar cita</b> cree eventos y revise disponibilidad en tu calendario.
            </p>

            {google ? (
              <div className="mt-3">
                <p className="text-xs text-ink-2">
                  Cuenta: <b className="text-ink">{google.account_email ?? "—"}</b>
                  {calendars.length > 0 && <> · {calendars.length} calendario(s) disponibles</>}
                </p>
                <form action={disconnectIntegration} className="mt-3">
                  <input type="hidden" name="provider" value="google_calendar" />
                  <button className="rounded-xl border border-danger/40 bg-danger/10 px-4 py-2 text-xs font-semibold text-danger transition hover:bg-danger/20">
                    Desconectar
                  </button>
                </form>
              </div>
            ) : (
              <a
                href="/api/integrations/google/start"
                className="mt-3 inline-flex items-center gap-2 rounded-xl bg-demandu-gradient px-4 py-2 text-sm font-semibold text-white"
              >
                Conectar Google Calendar
              </a>
            )}
          </div>
        </div>
      </div>

      {/* Tarjeta Calendly */}
      <div className="mt-4 rounded-2xl border border-linea bg-tarjeta p-5">
        <div className="flex items-start gap-4">
          <span className="grid h-12 w-12 flex-none place-items-center rounded-xl border border-linea bg-tarjeta p-2">
            <CalendlyLogo className="h-full w-full" />
          </span>
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <h3 className="font-display text-base font-semibold text-ink">Calendly</h3>
              {calendly ? (
                <span className="rounded-full bg-success/15 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-exito">Conectado</span>
              ) : (
                <span className="rounded-full bg-suave px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-ink-3">Sin conectar</span>
              )}
            </div>
            <p className="mt-1 text-xs text-ink-3">
              El bloque <b className="text-ink-2">Agendar cita</b> ofrece tus horarios reales de Calendly y reserva sin que la persona salga del chat.
            </p>

            {calendly ? (
              <div className="mt-3">
                <p className="text-xs text-ink-2">
                  Cuenta: <b className="text-ink">{calendly.account_email ?? calendly.data?.nombre ?? "—"}</b>
                </p>

                {/* ── SI LOS AVISOS NO QUEDARON SUSCRITOS, SE DICE ───────────
                    La conexión se guarda igual —agendar desde el chat funciona
                    sin avisos— pero entonces las citas que la persona agende
                    desde el enlace de Instagram NO entran a la Bandeja. Eso no
                    se puede quedar en un `console.error` que nadie mira: el
                    cliente creería que la integración está entera. */}
                {calendly.data?.avisos === false && (
                  <p className="mt-2 rounded-xl border border-warning/40 bg-warning/10 px-3 py-2 text-xs text-ink-2">
                    ⚠️ Las citas que se agenden <b>fuera del chat</b> no están entrando a tu Bandeja.
                    Desconecta y vuelve a conectar para arreglarlo.
                  </p>
                )}

                {/* ── EL PLAN GRATIS TAMBIÉN SE DICE, Y AQUÍ ────────────────
                    Calendly solo deja reservar por su API a las cuentas de
                    pago. El bloque ya resuelve solo —manda el enlace de la
                    agenda en vez de los horarios— pero el cliente tiene que
                    saber POR QUÉ ve un enlace donde esperaba horarios, y este
                    es el sitio donde va a venir a mirar. */}
                {calendly.data?.plan_gratis && (
                  <p className="mt-2 rounded-xl border border-linea bg-suave px-3 py-2 text-xs text-ink-2">
                    Tu plan de Calendly no permite reservar desde otra aplicación, así que el
                    chatbot manda tu enlace de agenda en lugar de los horarios. Para que reserve
                    dentro del chat necesitas un plan de pago de Calendly.
                  </p>
                )}

                <form action={disconnectIntegration} className="mt-3">
                  <input type="hidden" name="provider" value="calendly" />
                  <button className="rounded-xl border border-danger/40 bg-danger/10 px-4 py-2 text-xs font-semibold text-danger transition hover:bg-danger/20">
                    Desconectar
                  </button>
                </form>
              </div>
            ) : (
              <a
                href="/api/integrations/calendly/start"
                className="mt-3 inline-flex items-center gap-2 rounded-xl bg-demandu-gradient px-4 py-2 text-sm font-semibold text-white"
              >
                Conectar Calendly
              </a>
            )}
          </div>
        </div>
      </div>

      {/* ── ¿CUÁL DE LAS DOS USA EL CHATBOT? ─────────────────────────────────
          SOLO APARECE CON LAS DOS CONECTADAS. Con una sola no hay decisión que
          tomar, y sacar el selector igual sería inventarle al cliente una
          pregunta que no tiene.

          Existe porque antes ganaba Calendly en silencio: al negocio que usa
          Google para lo interno y conecta Calendly para probarlo le cambiábamos
          la agenda del bot sin avisar, con un clic dado en otra pantalla. */}
      {hayQueElegir(conectadas) && (
        <div className="mt-4 rounded-2xl border border-linea bg-tarjeta p-5">
          <h3 className="font-display text-base font-semibold text-ink">
            ¿Qué agenda usa tu chatbot?
          </h3>
          <p className="mt-1 text-xs text-ink-3">
            Tienes las dos conectadas. Elige en cuál quieres que el bloque{" "}
            <b className="text-ink-2">Agendar cita</b> ofrezca horarios y reserve.
            Las dos siguen conectadas: esto solo decide dónde acaban las citas del chat.
          </p>

          <form action={elegirAgenda} className="mt-4 flex flex-wrap items-center gap-2">
            {[
              { valor: "calendly", texto: "Calendly" },
              { valor: "google", texto: "Google Calendar" },
            ].map((o) => (
              <button
                key={o.valor}
                name="agenda"
                value={o.valor}
                aria-pressed={manda === o.valor}
                className={
                  manda === o.valor
                    ? "rounded-xl bg-demandu-gradient px-4 py-2 text-sm font-semibold text-white"
                    : "rounded-xl border border-linea px-4 py-2 text-sm font-semibold text-ink-2 transition hover:bg-suave-2"
                }
              >
                {o.texto}
              </button>
            ))}
          </form>

          {/* Se dice cuál manda AHORA MISMO, con o sin elección hecha. Quien no
              ha elegido nada tiene que poder saber qué está pasando sin
              adivinarlo, y quien eligió tiene que ver que se guardó. */}
          <p className="mt-3 text-xs text-ink-3">
            {preferida === null ? (
              <>
                No has elegido, así que el bot sigue usando{" "}
                <b className="text-ink-2">Google Calendar</b> — el que ya estabas usando. Conectar
                Calendly no cambia por sí solo dónde agenda tu chatbot: eso lo decides tú con los
                botones de arriba.
              </>
            ) : (
              <>
                Ahora mismo el bot agenda en{" "}
                <b className="text-ink-2">{manda === "calendly" ? "Calendly" : "Google Calendar"}</b>.
              </>
            )}
          </p>
        </div>
      )}

      <div className="mt-4">
        <SheetsConfig config={(sheets as ConfigSheets) ?? null} googleConectado={!!google} />
      </div>

      <div className="mt-4">
        <SalidasCrm salidas={salidasConSecreto as SalidaFila[]} />
      </div>

      <div className="mt-4">
        <LlavesApi llaves={((llaves as any[]) ?? []) as LlaveFila[]} />
      </div>

      {/* ── WhatsApp Cloud API ── */}
      <div className="mt-4 rounded-2xl border border-linea bg-tarjeta p-5">
        <div className="flex items-start gap-4">
          <span className="grid h-12 w-12 flex-none place-items-center rounded-xl border border-linea bg-tarjeta">
            <ChannelIcon channel="whatsapp" className="h-7 w-7" />
          </span>
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <h3 className="font-display text-base font-semibold text-ink">WhatsApp Cloud API</h3>
              {wa ? (
                <span className="rounded-full bg-success/15 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-exito">Conectado</span>
              ) : (
                <span className="rounded-full bg-suave px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-ink-3">Sin conectar</span>
              )}
            </div>
            <p className="mt-1 text-xs text-ink-3">Recibe y responde mensajes de WhatsApp en vivo con tu chatbot y tu Bandeja. Conéctalo con un clic — nosotros configuramos todo lo demás por ti.</p>

            {wa ? (
              <div className="mt-3">
                <p className="text-xs text-ink-2">
                  Número: <b className="text-ink">{(wa as any).display_number ?? "Conectado"}</b>
                  {waBots.length > 0 && (wa as any).bot_id && (
                    <> · Bot: <b className="text-ink">{waBots.find((b) => b.id === (wa as any).bot_id)?.name ?? "—"}</b></>
                  )}
                </p>
                <form action={disconnectWhatsapp} className="mt-3">
                  <button className="rounded-xl border border-danger/40 bg-danger/10 px-4 py-2 text-xs font-semibold text-danger transition hover:bg-danger/20">
                    Desconectar
                  </button>
                </form>
              </div>
            ) : (
              <WhatsAppConnect
                appId={process.env.NEXT_PUBLIC_META_APP_ID}
                configId={process.env.NEXT_PUBLIC_META_CONFIG_ID}
                bots={waBots.map((b) => ({ id: b.id, name: b.name }))}
              />
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
