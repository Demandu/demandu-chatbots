import type { Metadata } from "next";
import Link from "next/link";
import { Logo } from "@/components/Logo";

/**
 * Cómo pedir que borremos tus datos.
 *
 * POR QUÉ EXISTE ESTA PÁGINA: Meta no deja publicar una app con Facebook
 * Login sin una dirección donde el usuario pueda pedir la eliminación de sus
 * datos. Pero no es solo un trámite: quien entra a la plataforma con su cuenta
 * de Facebook nos está entregando su nombre y su correo, y tiene derecho a
 * saber qué guardamos y a que lo borremos.
 *
 * ES PÚBLICA A PROPÓSITO: nadie debería tener que iniciar sesión para pedir
 * que borren sus datos. Si estuviera dentro del panel, alguien que ya se fue
 * no podría llegar.
 *
 * REGLA AL EDITAR: aquí solo puede decir cosas que de verdad hacemos. Si algún
 * día se agrega un botón de borrado dentro de la plataforma, se añade aquí. No
 * se prometen plazos ni mecanismos que no existan.
 */
export const metadata: Metadata = {
  title: "Eliminación de datos · Demandu",
  description:
    "Cómo pedir que Demandu elimine los datos de tu cuenta, qué se borra y en cuánto tiempo.",
};

const CORREO = "contacto@demandu.tech";

export default function EliminacionDeDatos() {
  return (
    <main className="min-h-[100dvh] bg-navy">
      <div className="absolute inset-0 bg-demandu-radial" />

      <div className="relative mx-auto max-w-2xl px-6 py-12 sm:py-16">
        <Link href="/login" className="inline-block">
          <Logo />
        </Link>

        <h1 className="mt-10 font-display text-3xl font-extrabold leading-tight text-white sm:text-4xl">
          Eliminación de datos
        </h1>
        <p className="mt-3 text-muted">
          Si tienes una cuenta en Demandu y quieres que borremos tu información, aquí está cómo
          pedirlo y qué pasa después.
        </p>

        <section className="mt-10">
          <h2 className="font-display text-xl font-bold text-white">Qué guardamos</h2>
          <p className="mt-3 text-sm leading-relaxed text-muted">
            Cuando creas tu cuenta —con correo, con Apple o con Facebook— guardamos tu nombre, tu
            correo electrónico y el nombre de tu negocio. Si entraste con Facebook o Apple, el
            proveedor solo nos comparte esos datos: nunca tu contraseña, y no publicamos nada en tu
            nombre.
          </p>
          <p className="mt-3 text-sm leading-relaxed text-muted">
            Además, mientras usas la plataforma se guardan las conversaciones de tus chatbots, tus
            contactos y la configuración de tu cuenta. Todo eso es tuyo y también se borra cuando lo
            pides.
          </p>
        </section>

        <section className="mt-10">
          <h2 className="font-display text-xl font-bold text-white">Cómo pedir que lo borremos</h2>
          <p className="mt-3 text-sm leading-relaxed text-muted">
            Escríbenos desde <b className="text-white">el mismo correo con el que creaste tu cuenta</b>{" "}
            a:
          </p>
          <a
            href={`mailto:${CORREO}?subject=${encodeURIComponent("Eliminar mis datos")}`}
            className="mt-4 inline-flex items-center rounded-xl border border-pink/35 bg-gradient-to-r from-pink/20 to-violet/20 px-4 py-2.5 text-sm font-semibold text-white transition hover:opacity-90"
          >
            {CORREO}
          </a>
          <p className="mt-4 text-sm leading-relaxed text-muted">
            Pon <b className="text-white">«Eliminar mis datos»</b> en el asunto. Pedimos que sea
            desde ese correo porque es la forma de comprobar que la cuenta es tuya: si aceptáramos la
            solicitud desde cualquier dirección, cualquiera podría borrar la cuenta de otro.
          </p>
        </section>

        <section className="mt-10">
          <h2 className="font-display text-xl font-bold text-white">Qué pasa después</h2>
          <ul className="mt-3 space-y-2.5 text-sm leading-relaxed text-muted">
            <li className="flex gap-3">
              <span className="mt-2 h-1.5 w-1.5 flex-none rounded-full bg-pink" />
              <span>Te confirmamos por correo que recibimos la solicitud.</span>
            </li>
            <li className="flex gap-3">
              <span className="mt-2 h-1.5 w-1.5 flex-none rounded-full bg-pink" />
              <span>
                Borramos tu cuenta y todo lo asociado a ella{" "}
                <b className="text-white">dentro de los 30 días siguientes</b>, y te avisamos cuando
                esté hecho.
              </span>
            </li>
            <li className="flex gap-3">
              <span className="mt-2 h-1.5 w-1.5 flex-none rounded-full bg-pink" />
              <span>
                El borrado es definitivo: no hay forma de recuperarlo después. Si tienes
                conversaciones o contactos que quieras conservar, descárgalos antes.
              </span>
            </li>
          </ul>
          <p className="mt-4 text-sm leading-relaxed text-muted">
            Solo conservamos lo que la ley nos obliga a guardar, como los comprobantes fiscales de
            los pagos que hayas hecho. Nada de eso se usa para contactarte.
          </p>
        </section>

        <p className="mt-12 border-t border-surface-border pt-6 text-xs text-muted-2">
          ¿Buscas cómo tratamos tus datos en general? Está en nuestra{" "}
          <a
            href="https://www.demandu.tech/politicadatospersonales"
            className="font-semibold text-pink hover:underline"
            target="_blank"
            rel="noopener noreferrer"
          >
            política de datos personales
          </a>
          .
        </p>
      </div>
    </main>
  );
}
