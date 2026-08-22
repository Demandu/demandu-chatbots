import { redirect } from "next/navigation";
import { Logo } from "@/components/Logo";
import { getCurrentOrgId, faltaNombreDelNegocio } from "@/lib/org";
import { confirmarNombre } from "./actions";

export const dynamic = "force-dynamic";

/**
 * La primera pantalla de quien entró con Apple o Facebook.
 *
 * Una sola pregunta, y la que de verdad hace falta. Se resistió la tentación de
 * aprovechar el momento para pedir teléfono, sector y tamaño de la empresa: es
 * el primer segundo del cliente dentro de la plataforma y cada campo de más es
 * una razón para cerrar la pestaña. Lo demás se pregunta cuando haga falta.
 *
 * NO ESTÁ DENTRO DE (dashboard) A PROPÓSITO: el marco del panel es justo quien
 * redirige hasta aquí. Si esta pantalla viviera ahí dentro, se redirigiría a sí
 * misma para siempre.
 */
export default async function Bienvenida() {
  const orgId = await getCurrentOrgId();
  if (!orgId) redirect("/login");

  // Quien ya lo contestó no tiene por qué volver a ver esto, ni aunque escriba
  // la dirección a mano.
  if (!(await faltaNombreDelNegocio())) redirect("/dashboard");

  return (
    <main className="relative flex min-h-[100dvh] items-center justify-center bg-navy p-6">
      <div className="absolute inset-0 bg-demandu-radial" />

      <div className="relative w-full max-w-md">
        <Logo />

        <h1 className="mt-10 font-display text-3xl font-extrabold leading-tight text-white">
          Una cosa antes de empezar
        </h1>
        <p className="mt-3 text-sm leading-relaxed text-muted">
          Entraste con tu cuenta, así que no llegamos a preguntarte lo más importante:{" "}
          <b className="text-white">¿cómo se llama tu negocio?</b>
        </p>

        <form action={confirmarNombre} className="mt-8 space-y-4">
          <div>
            <input
              name="negocio"
              required
              autoFocus
              maxLength={80}
              className="input"
              placeholder="Pastelería La Dulce"
            />
            <p className="mt-2 text-[11px] text-muted-2">
              Así aparecerá en tu plataforma y en tus chats. Lo puedes cambiar cuando quieras desde
              Configuración.
            </p>
          </div>

          <button type="submit" className="btn-primary w-full">
            Entrar a Demandu
          </button>
        </form>
      </div>
    </main>
  );
}
