"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

/**
 * Entrar y crear cuenta.
 *
 * AL REGISTRARSE SE PIDE EL NOMBRE DEL NEGOCIO. Antes no, y la organización
 * acababa llamándose como la primera parte del correo: de
 * `the_alexmolina@icloud.com` salía un negocio llamado "the_alexmolina". Es lo
 * primero que ve el cliente al entrar, así que daba la sensación de que la
 * plataforma no sabe con quién está hablando.
 *
 * El nombre viaja en los metadatos del usuario y lo recoge `handle_new_user`
 * en la base, que es quien crea la organización, el embudo y las etapas de una
 * sola vez. Si se hiciera desde aquí, una pestaña cerrada a medias dejaría
 * cuentas a medio construir.
 */

/** Mensajes de Supabase traducidos a algo que se pueda leer sin ser técnico. */
function enHumano(mensaje: string): string {
  const m = mensaje.toLowerCase();
  if (m.includes("invalid login credentials")) return "El correo o la contraseña no coinciden.";
  if (m.includes("email not confirmed")) return "Te enviamos un correo para confirmar tu cuenta. Ábrelo y vuelve aquí.";
  if (m.includes("user already registered") || m.includes("already been registered")) {
    return "Ese correo ya tiene cuenta. Ingresa en vez de registrarte.";
  }
  if (m.includes("password should be at least")) return "La contraseña necesita al menos 6 caracteres.";
  if (m.includes("unable to validate email") || m.includes("invalid email")) return "Revisa el correo: parece que le falta algo.";
  if (m.includes("rate limit") || m.includes("too many")) return "Demasiados intentos seguidos. Espera un minuto y vuelve a probar.";
  if (m.includes("provider is not enabled")) return "Esa forma de entrar todavía no está disponible. Usa tu correo por ahora.";
  return mensaje;
}

export function AuthForm({ mode }: { mode: "login" | "register" }) {
  const router = useRouter();
  // Si el cliente vuelve de Apple o Facebook con un problema, la ruta de
  // retorno lo manda aquí con el motivo. Sin esto vería la pantalla de entrar
  // otra vez, sin ninguna explicación.
  const params = useSearchParams();
  const errorDelProveedor = params.get("error");
  const [negocio, setNegocio] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [social, setSocial] = useState<"apple" | "facebook" | null>(null);

  /**
   * Entrar con Apple o Facebook.
   *
   * El nombre del negocio NO se puede pedir aquí: el cliente sale a la pantalla
   * del proveedor y vuelve por otra ruta. Se resuelve al volver — la
   * organización nace con un nombre provisional y la plataforma se lo pregunta
   * en cuanto entra.
   */
  const entrarCon = async (provider: "apple" | "facebook") => {
    setSocial(provider);
    setError(null);
    const supabase = createClient();
    const { error } = await supabase.auth.signInWithOAuth({
      provider,
      options: { redirectTo: `${window.location.origin}/auth/callback` },
    });
    if (error) {
      setSocial(null);
      setError(enHumano(error.message));
    }
    // Si todo va bien el navegador ya se fue a Apple/Facebook: no hay nada más
    // que hacer aquí, y por eso no se apaga el "cargando".
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);
    setAviso(null);
    const supabase = createClient();

    if (mode === "login") {
      const { error } = await supabase.auth.signInWithPassword({ email, password });
      setLoading(false);
      if (error) return setError(enHumano(error.message));
      router.push("/dashboard");
      router.refresh();
      return;
    }

    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: { data: { negocio: negocio.trim() } },
    });
    setLoading(false);
    if (error) return setError(enHumano(error.message));

    // Si el proyecto exige confirmar el correo, no hay sesión todavía: mandar
    // al panel dejaría al cliente en una pantalla de "inicia sesión" sin
    // entender por qué, justo después de haberse registrado.
    if (!data.session) {
      setAviso("Listo. Te enviamos un correo para confirmar tu cuenta — ábrelo y ya podrás entrar.");
      return;
    }
    router.push("/dashboard");
    router.refresh();
  };

  return (
    <div>
      <h2 className="font-display text-2xl font-bold text-white">
        {mode === "login" ? "Bienvenido de vuelta" : "Crea tu cuenta"}
      </h2>
      <p className="mb-6 mt-1 text-sm text-muted">
        {mode === "login"
          ? "Ingresa para gestionar tus conversaciones."
          : "En minutos tu negocio conversa, automatiza y convierte."}
      </p>

      {/* Apple y Facebook van ARRIBA: quien tiene esas cuentas entra en un clic
          y no debería tener que pasar por encima de un formulario para verlo. */}
      {!aviso && (
        <div className="mb-5">
          <div className="grid gap-2 sm:grid-cols-2">
            <button
              type="button"
              onClick={() => entrarCon("apple")}
              disabled={!!social}
              className="flex items-center justify-center gap-2 rounded-xl border border-surface-border bg-white px-4 py-2.5 text-sm font-semibold text-[#111] transition hover:opacity-90 disabled:opacity-60"
            >
              <svg viewBox="0 0 384 512" className="h-4 w-4" fill="currentColor" aria-hidden="true">
                <path d="M318.7 268.7c-.2-36.7 16.4-64.4 50-84.8-18.8-26.9-47.2-41.7-84.7-44.6-35.5-2.8-74.3 20.7-88.5 20.7-15 0-49.4-19.7-76.4-19.7C63.3 141.2 4 184.8 4 273.5q0 39.3 14.4 81.2c12.8 36.7 59 126.7 107.2 125.2 25.2-.6 43-17.9 75.8-17.9 31.8 0 48.3 17.9 76.4 17.9 48.6-.7 90.4-82.5 102.6-119.3-65.2-30.7-61.7-90-61.7-91.9zm-56.6-164.2c27.3-32.4 24.8-61.9 24-72.5-24.1 1.4-52 16.4-67.9 34.9-17.5 19.8-27.8 44.3-25.6 71.9 26.1 2 49.9-11.4 69.5-34.3z" />
              </svg>
              {social === "apple" ? "Abriendo…" : "Continuar con Apple"}
            </button>
            <button
              type="button"
              onClick={() => entrarCon("facebook")}
              disabled={!!social}
              className="flex items-center justify-center gap-2 rounded-xl border border-surface-border bg-[#1877F2] px-4 py-2.5 text-sm font-semibold text-white transition hover:opacity-90 disabled:opacity-60"
            >
              <svg viewBox="0 0 320 512" className="h-4 w-4" fill="currentColor" aria-hidden="true">
                <path d="M279.14 288l14.22-92.66h-88.91v-60.13c0-25.35 12.42-50.06 52.24-50.06h40.42V6.26S260.43 0 225.36 0c-73.22 0-121.08 44.38-121.08 124.72v70.62H22.89V288h81.39v224h100.17V288z" />
              </svg>
              {social === "facebook" ? "Abriendo…" : "Continuar con Facebook"}
            </button>
          </div>
          <div className="mt-5 flex items-center gap-3">
            <span className="h-px flex-1 bg-surface-border" />
            <span className="text-[11px] font-semibold uppercase tracking-wider text-muted-2">o con tu correo</span>
            <span className="h-px flex-1 bg-surface-border" />
          </div>
        </div>
      )}

      {errorDelProveedor && !error && (
        <p className="mb-4 rounded-xl border border-danger/40 bg-danger/10 px-3.5 py-2.5 text-sm text-danger">
          {enHumano(errorDelProveedor)}
        </p>
      )}

      {aviso ? (
        <div className="rounded-xl border border-success/40 bg-success/10 p-4 text-sm text-white">{aviso}</div>
      ) : (
        <form onSubmit={submit} className="space-y-3.5">
          {mode === "register" && (
            <div>
              <label className="mb-1.5 block text-xs font-semibold text-muted">¿Cómo se llama tu negocio?</label>
              <input
                required
                className="input"
                value={negocio}
                onChange={(e) => setNegocio(e.target.value)}
                placeholder="Pastelería La Dulce"
                maxLength={80}
              />
              <p className="mt-1 text-[11px] text-muted-2">Así aparecerá en tu plataforma. Lo puedes cambiar después.</p>
            </div>
          )}
          <div>
            <label className="mb-1.5 block text-xs font-semibold text-muted">Correo</label>
            <input type="email" required className="input" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="tu@empresa.com" />
          </div>
          <div>
            <label className="mb-1.5 block text-xs font-semibold text-muted">Contraseña</label>
            <input
              type="password"
              required
              minLength={6}
              className="input"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••"
            />
            {mode === "register" && <p className="mt-1 text-[11px] text-muted-2">Mínimo 6 caracteres.</p>}
          </div>
          {error && <p className="text-sm text-danger">{error}</p>}
          <button type="submit" disabled={loading} className="btn-primary w-full">
            {loading ? "Un momento…" : mode === "login" ? "Ingresar" : "Crear cuenta"}
          </button>
        </form>
      )}

      <p className="mt-5 text-center text-sm text-muted">
        {mode === "login" ? (
          <>¿No tienes cuenta? <Link href="/register" className="font-semibold text-pink">Regístrate</Link></>
        ) : (
          <>¿Ya tienes cuenta? <Link href="/login" className="font-semibold text-pink">Ingresa</Link></>
        )}
      </p>
    </div>
  );
}
