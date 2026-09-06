"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Logo } from "@/components/Logo";
import { createClient } from "@/lib/supabase/client";

/**
 * Donde la persona invitada se pone SU contraseña.
 *
 * NADIE MÁS LA VE, NI SIQUIERA QUIEN LA INVITÓ. Esa es toda la razón de que
 * esta pantalla exista en vez de que el administrador teclee una contraseña por
 * su empleado: si el jefe la conociera, cualquier cosa que hiciera el empleado
 * dentro de la plataforma sería discutible, porque no habría forma de saber
 * quién estaba sentado al teclado.
 *
 * SE LLEGA AQUÍ YA CON SESIÓN. El enlace del correo pasa antes por
 * `/auth/callback`, que canjea el código por una sesión; por eso basta con
 * `updateUser` y no hace falta ningún token en esta pantalla.
 */
export function FormularioDeContrasena({
  temporal = false,
  recuperando = false,
}: {
  temporal?: boolean;
  /** Llegó por "olvidé mi contraseña", no por una invitación. */
  recuperando?: boolean;
}) {
  const router = useRouter();
  const [clave, setClave] = useState("");
  const [repetida, setRepetida] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [guardando, setGuardando] = useState(false);
  /** "mirando" hasta saber si esta persona tiene sesión para poder guardar. */
  const [sesion, setSesion] = useState<"mirando" | "lista" | "sin">("mirando");

  /**
   * RECOGER LA SESIÓN DEL ENLACE DEL CORREO.
   *
   * El enlace de "olvidé mi contraseña" llega con la sesión en el TROZO de la
   * dirección (`#access_token=…&refresh_token=…`). El navegador no manda esa
   * parte al servidor, así que la página nace sin sesión y `updateUser` fallaba
   * — que es exactamente lo que pasaba: el enlace del correo devolvía al login
   * con un error en inglés y no había forma de cambiar la contraseña.
   *
   * Aquí se canjea por una sesión de verdad (queda en la cookie) y se LIMPIA el
   * trozo de la barra de direcciones, para que nadie copie ese enlace con la
   * sesión dentro y se lo mande a otro por WhatsApp sin darse cuenta.
   *
   * Quien llega por una invitación ya trae sesión de `/auth/callback`: no hay
   * trozo, no se hace nada, y el camino de siempre no cambia.
   */
  useEffect(() => {
    const supabase = createClient();

    const arrancar = async () => {
      const trozo = new URLSearchParams(window.location.hash.replace(/^#/, ""));
      const access_token = trozo.get("access_token");
      const refresh_token = trozo.get("refresh_token");

      if (access_token && refresh_token) {
        const { error } = await supabase.auth.setSession({ access_token, refresh_token });
        history.replaceState(null, "", window.location.pathname + window.location.search);
        if (!error) return setSesion("lista");
      }

      const { data } = await supabase.auth.getSession();
      setSesion(data.session ? "lista" : "sin");
    };

    arrancar().catch(() => setSesion("sin"));
  }, []);

  const enviar = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (clave.length < 8) return setError("Usa al menos 8 caracteres.");
    if (clave !== repetida) return setError("Las dos contraseñas no coinciden.");

    setGuardando(true);
    const supabase = createClient();
    const { error } = await supabase.auth.updateUser({ password: clave });

    if (!error) {
      // Se apaga la bandera de «entró con clave temporal». Va DESPUÉS de que
      // el cambio de contraseña haya salido bien: si se apagara antes y el
      // cambio fallara, la persona se quedaría dentro con la clave que le
      // dictaron por teléfono y sin nada que la obligue a cambiarla.
      //
      // Si esta línea falla, no se le corta el paso: como mucho se le volverá
      // a pedir que elija contraseña la próxima vez. Molesto, no grave.
      const { data: { user } } = await supabase.auth.getUser();
      if (user) {
        await supabase
          .from("memberships")
          .update({ debe_cambiar_contrasena: false })
          .eq("user_id", user.id);
      }
    }

    setGuardando(false);

    if (error) {
      // El enlace del correo caduca. Sin este mensaje, la persona se quedaría
      // reintentando sin entender por qué no la deja.
      if (!error.message.toLowerCase().includes("session")) return setError(error.message);
      return setError(
        recuperando
          ? "El enlace ya caducó. Vuelve a pedir uno nuevo desde «¿Olvidaste tu contraseña?»."
          : "El enlace de la invitación ya caducó. Pídele a quien te invitó que te lo mande otra vez.",
      );
    }

    router.push("/dashboard");
    router.refresh();
  };

  return (
    <main className="relative flex min-h-[100dvh] items-center justify-center bg-navy p-6">
      <div className="absolute inset-0 bg-demandu-radial" />

      <div className="relative w-full max-w-sm">
        <Logo />

        <h1 className="mt-10 font-display text-3xl font-extrabold leading-tight text-white">
          {recuperando
            ? "Elige tu contraseña nueva"
            : temporal
              ? "Elige tu contraseña"
              : "Ponle una contraseña a tu cuenta"}
        </h1>
        {/* Tres textos porque son tres situaciones distintas y la persona sabe
            en cuál está. A quien le dictaron una clave por teléfono, o a quien
            viene de "olvidé mi contraseña", leer «te invitaron» le hace dudar
            de si está en el sitio correcto. */}
        <p className="mt-3 text-sm leading-relaxed text-muted">
          {recuperando ? (
            <>
              Ya comprobamos que el correo es tuyo. Escribe la contraseña nueva —{" "}
              <b className="text-white">solo tú la vas a saber</b>, ni siquiera nosotros.
            </>
          ) : temporal ? (
            <>
              Entraste con una contraseña temporal que te dio el equipo. Elige ahora la tuya —{" "}
              <b className="text-white">a partir de aquí solo tú la vas a saber</b>, ni siquiera nosotros.
            </>
          ) : (
            <>
              Te invitaron a Demandu. Elige tu contraseña — <b className="text-white">solo tú la vas a
              saber</b>, ni siquiera quien te invitó.
            </>
          )}
        </p>

        {/* SIN SESIÓN NO SE ENSEÑA EL FORMULARIO. Enseñarlo sería dejar que la
            persona escriba su contraseña nueva dos veces, le dé a guardar, y
            recibir un error — el peor momento posible para enterarse de que el
            enlace ya no vale. */}
        {sesion === "sin" && (
          <div className="mt-8 rounded-xl border border-danger/40 bg-danger/10 p-4 text-sm leading-relaxed text-white">
            Este enlace ya caducó o se usó.{" "}
            <a href="/recuperar" className="font-semibold text-pink">Pide uno nuevo</a> — llega en un
            minuto y sirve una sola vez.
          </div>
        )}

        {sesion === "mirando" && (
          <p className="mt-8 text-sm text-muted">Comprobando el enlace…</p>
        )}

        <form
          onSubmit={enviar}
          className="mt-8 space-y-3.5"
          hidden={sesion !== "lista"}
        >
          <div>
            <label className="mb-1.5 block text-xs font-semibold text-muted">Contraseña</label>
            <input
              type="password"
              required
              autoFocus
              minLength={8}
              className="input"
              value={clave}
              onChange={(e) => setClave(e.target.value)}
              placeholder="••••••••"
            />
            <p className="mt-1 text-[11px] text-muted-2">Mínimo 8 caracteres.</p>
          </div>

          <div>
            <label className="mb-1.5 block text-xs font-semibold text-muted">Repítela</label>
            <input
              type="password"
              required
              className="input"
              value={repetida}
              onChange={(e) => setRepetida(e.target.value)}
              placeholder="••••••••"
            />
          </div>

          {error && <p className="text-sm text-danger">{error}</p>}

          <button type="submit" disabled={guardando} className="btn-primary w-full">
            {guardando ? "Guardando…" : "Entrar a Demandu"}
          </button>
        </form>
      </div>
    </main>
  );
}
