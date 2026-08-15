"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

export function AuthForm({ mode }: { mode: "login" | "register" }) {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);
    const supabase = createClient();
    const { error } =
      mode === "login"
        ? await supabase.auth.signInWithPassword({ email, password })
        : await supabase.auth.signUp({ email, password });
    setLoading(false);
    if (error) return setError(error.message);
    router.push("/dashboard");
    router.refresh();
  };

  return (
    <div>
      <h2 className="font-display text-2xl font-bold text-white">
        {mode === "login" ? "Bienvenido de vuelta" : "Crea tu cuenta"}
      </h2>
      <p className="mb-6 mt-1 text-sm text-muted">
        {mode === "login" ? "Ingresa para gestionar tus conversaciones." : "En minutos tu negocio conversa, automatiza y convierte."}
      </p>

      <form onSubmit={submit} className="space-y-3.5">
        <div>
          <label className="mb-1.5 block text-xs font-semibold text-muted">Correo</label>
          <input type="email" required className="input" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="tu@empresa.com" />
        </div>
        <div>
          <label className="mb-1.5 block text-xs font-semibold text-muted">Contraseña</label>
          <input type="password" required className="input" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="••••••••" />
        </div>
        {error && <p className="text-sm text-danger">{error}</p>}
        <button type="submit" disabled={loading} className="btn-primary w-full">
          {loading ? "Un momento…" : mode === "login" ? "Ingresar" : "Crear cuenta"}
        </button>
      </form>

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
