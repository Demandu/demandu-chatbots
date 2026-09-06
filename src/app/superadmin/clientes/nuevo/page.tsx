import Link from "next/link";
import { crear } from "../acciones";
import { ArrowLeft, TriangleAlert } from "lucide-react";

export const dynamic = "force-dynamic";

/**
 * Alta manual de un cliente.
 *
 * El caso real: se cerró la venta por teléfono y hay que dejarle la cuenta
 * lista ahí mismo, mientras la persona sigue en la línea. Por eso el
 * formulario es corto — todo lo demás (plan, canales, complementos) se puede
 * ajustar después, y pedirlo aquí solo alarga la llamada.
 */
export default function NuevoClientePage({ searchParams }: { searchParams: { error?: string } }) {
  return (
    <div className="max-w-2xl">
      <Link
        href="/superadmin/clientes"
        className="mb-4 inline-flex items-center gap-1.5 text-xs font-semibold text-ink-3 hover:text-ink"
      >
        <ArrowLeft className="h-3.5 w-3.5" /> Todos los clientes
      </Link>

      <h2 className="font-display text-2xl font-bold text-ink">Dar de alta un cliente</h2>
      <p className="mb-5 mt-1 text-sm text-ink-2">
        Se crea su cuenta y una <b className="text-ink">contraseña temporal</b> que tendrás que dictarle. Él la
        cambia al entrar por primera vez.
      </p>

      {searchParams?.error && (
        <div className="mb-4 flex items-start gap-2 rounded-xl border border-danger/40 bg-danger/10 px-4 py-2.5 text-sm text-danger">
          <TriangleAlert className="mt-0.5 h-4 w-4 flex-none" />
          <span>{searchParams.error}</span>
        </div>
      )}

      <form action={crear} className="card-l space-y-4 p-5">
        <div>
          <label className="mb-1.5 block text-xs font-semibold text-ink-2">Empresa *</label>
          <input name="empresa" required className="input-l w-full" placeholder="Panadería La Espiga" />
          <p className="mt-1 text-[11px] text-ink-3">
            Es el nombre que verá dentro de la plataforma. Se puede cambiar después.
          </p>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label className="mb-1.5 block text-xs font-semibold text-ink-2">Nombre del contacto</label>
            <input name="contacto" className="input-l w-full" placeholder="María Pérez" />
          </div>
          <div>
            <label className="mb-1.5 block text-xs font-semibold text-ink-2">Teléfono</label>
            <input name="telefono" className="input-l w-full" placeholder="+507 6000-0000" />
          </div>
        </div>

        <div>
          <label className="mb-1.5 block text-xs font-semibold text-ink-2">Correo *</label>
          <input name="email" type="email" required className="input-l w-full" placeholder="maria@laespiga.com" />
          {/* Merece un aviso: cambiarlo después significa tocar su usuario de
              acceso, no solo un dato de la ficha. */}
          <p className="mt-1 text-[11px] text-ink-3">
            Con este correo entra a la plataforma. Confírmalo con el cliente antes de crear la cuenta.
          </p>
        </div>

        <div>
          <label className="mb-1.5 block text-xs font-semibold text-ink-2">Notas internas</label>
          <textarea
            name="notas"
            rows={3}
            className="input-l w-full"
            placeholder="De dónde salió, qué necesita, qué se le prometió…"
          />
          <p className="mt-1 text-[11px] text-ink-3">Esto no lo ve el cliente.</p>
        </div>

        <div className="flex items-center gap-3 pt-1">
          <button className="btn-primary px-5">Crear cuenta</button>
          <Link href="/superadmin/clientes" className="text-xs font-semibold text-ink-3 hover:text-ink">
            Cancelar
          </Link>
        </div>
      </form>

      <div className="card-l mt-5 p-5 text-sm leading-relaxed text-ink-2">
        <h3 className="mb-2 font-display text-base font-semibold text-ink">Sobre la contraseña</h3>
        <p>
          La contraseña que sale al crear la cuenta <b className="text-ink">se ve una sola vez</b> y no queda
          guardada en ninguna parte. Dictarla y que el cliente la cambie es todo el trámite.
        </p>
        <p className="mt-2">
          No es un descuido que no puedas consultarla después: el día que Demandu conozca la clave con la que
          un cliente entra, <b className="text-ink">nada de lo que pase dentro de esa cuenta es
          demostrablemente suyo</b> — y ahí dentro están las conversaciones de sus propios clientes. Si se le
          olvida, se genera otra desde su ficha.
        </p>
      </div>
    </div>
  );
}
