"use client";

import { useState } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";

/**
 * Recuperar la contraseña.
 *
 * POR QUÉ EXISTE ESTA PANTALLA. Hasta ahora no había ninguna: quien olvidaba su
 * contraseña se quedaba fuera de su cuenta PARA SIEMPRE, sin más salida que
 * escribirle a alguien de Demandu para que le tocara la base a mano. Con
 * clientes de pago eso no es un inconveniente, es una llamada enfadada.
 *
 * NO CONFIRMA NI DESMIENTE SI EL CORREO EXISTE. El mensaje de "revisa tu
 * correo" sale igual haya cuenta o no. Si dijera "ese correo no está
 * registrado", cualquiera podría ir probando direcciones para averiguar quién
 * es cliente de Demandu — y quién no. Por eso tampoco se mira el error de
 * Supabase para decidir el texto: solo para dejarlo en la consola.
 *
 * NO PONE NINGUNA CONTRASEÑA. Solo manda el enlace. La contraseña la elige la
 * persona en `/crear-contrasena`, que ya existía para las invitaciones y hace
 * exactamente esto mismo: llega con sesión creada por el enlace del correo y
 * hace `updateUser`. Reutilizarla no es pereza — es que solo haya UN sitio en
 * todo el producto donde se escribe una contraseña.
 */
export function RecuperarForm() {
  const [email, setEmail] = useState("");
  const [enviado, setEnviado] = useState(false);
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const enviar = async (e: React.FormEvent) => {
    e.preventDefault();
    setEnviando(true);
    setError(null);

    const { error } = await createClient().auth.resetPasswordForEmail(email.trim(), {
      // El enlace del correo trae un código de un solo uso. Pasa primero por
      // `/auth/callback`, que lo canjea por una sesión y escribe la cookie; sin
      // ese paso la persona llegaría a elegir contraseña sin sesión y no podría
      // guardarla. `next` solo admite rutas de esta misma app (lo comprueba el
      // callback), así que no se puede usar para mandar a nadie a otro sitio.
      redirectTo: `${window.location.origin}/auth/callback?next=${encodeURIComponent("/crear-contrasena?motivo=recuperar")}`,
    });

    setEnviando(false);

    if (error) {
      // Solo se cuenta lo que le sirve a la persona sin decirle a un extraño si
      // el correo existe. El límite de intentos sí se dice: es un "espera", no
      // un dato de nadie.
      console.error("[recuperar]", error.message);
      if (/rate limit|too many/i.test(error.message)) {
        setError("Demasiados intentos seguidos. Espera un minuto y vuelve a probar.");
        return;
      }
    }

    setEnviado(true);
  };

  if (enviado) {
    return (
      <div>
        <h2 className="font-display text-2xl font-bold text-white">Revisa tu correo</h2>
        <p className="mb-6 mt-3 text-sm leading-relaxed text-muted">
          Si <b className="text-white">{email.trim()}</b> tiene una cuenta en Demandu, le acaba de llegar
          un enlace para elegir una contraseña nueva. Caduca en una hora.
        </p>
        <p className="text-sm leading-relaxed text-muted">
          ¿No lo ves? Mira en spam o promociones. Y si entraste en su día con Apple o Facebook, no
          necesitas contraseña: vuelve a{" "}
          <Link href="/login" className="font-semibold text-pink">entrar</Link> con ese botón.
        </p>
      </div>
    );
  }

  return (
    <div>
      <h2 className="font-display text-2xl font-bold text-white">¿Olvidaste tu contraseña?</h2>
      <p className="mb-6 mt-1 text-sm text-muted">
        Escribe tu correo y te mandamos un enlace para elegir una nueva.
      </p>

      <form onSubmit={enviar} className="space-y-3.5">
        <div>
          <label className="mb-1.5 block text-xs font-semibold text-muted">Correo</label>
          <input
            type="email"
            required
            autoFocus
            className="input"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="tu@empresa.com"
          />
        </div>

        {error && <p className="text-sm text-danger">{error}</p>}

        <button type="submit" disabled={enviando} className="btn-primary w-full">
          {enviando ? "Enviando…" : "Mandarme el enlace"}
        </button>
      </form>

      <p className="mt-5 text-center text-sm text-muted">
        ¿Te acordaste? <Link href="/login" className="font-semibold text-pink">Ingresa</Link>
      </p>
    </div>
  );
}
