"use client";

import { useState } from "react";
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
export function FormularioDeContrasena() {
  const router = useRouter();
  const [clave, setClave] = useState("");
  const [repetida, setRepetida] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [guardando, setGuardando] = useState(false);

  const enviar = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (clave.length < 8) return setError("Usa al menos 8 caracteres.");
    if (clave !== repetida) return setError("Las dos contraseñas no coinciden.");

    setGuardando(true);
    const { error } = await createClient().auth.updateUser({ password: clave });
    setGuardando(false);

    if (error) {
      // El enlace del correo caduca. Sin este mensaje, la persona se quedaría
      // reintentando sin entender por qué no la deja.
      return setError(
        error.message.toLowerCase().includes("session")
          ? "El enlace de la invitación ya caducó. Pídele a quien te invitó que te lo mande otra vez."
          : error.message,
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
          Ponle una contraseña a tu cuenta
        </h1>
        <p className="mt-3 text-sm leading-relaxed text-muted">
          Te invitaron a Demandu. Elige tu contraseña — <b className="text-white">solo tú la vas a
          saber</b>, ni siquiera quien te invitó.
        </p>

        <form onSubmit={enviar} className="mt-8 space-y-3.5">
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
