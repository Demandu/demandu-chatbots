import { salirDeSoporte } from "@/app/(dashboard)/soporte";
import { LifeBuoy, LogOut } from "lucide-react";

/**
 * El aviso de «estás dentro de la cuenta de otro».
 *
 * VA ARRIBA DEL TODO, EN ROJO Y SIN FORMA DE CERRARLO. No es un estilo
 * agresivo por gusto: quien da soporte entra y sale de cuentas ajenas todo el
 * día, y el error que hay que hacer imposible es escribirle a los clientes de
 * un negocio creyendo que estás en otro. Un avisito discreto que se puede
 * cerrar deja de verse a los diez minutos; este no.
 *
 * Dice también hasta qué hora: el acceso caduca solo, y enterarse de eso
 * cuando la pantalla deja de funcionar es peor que saberlo desde el principio.
 */
export function AvisoDeSoporte({ negocio, hasta }: { negocio: string; hasta: string }) {
  let hora = "";
  try {
    hora = new Date(hasta).toLocaleTimeString("es-MX", { hour: "2-digit", minute: "2-digit" });
  } catch {
    hora = "";
  }

  return (
    <div className="flex flex-wrap items-center justify-between gap-2 bg-danger px-4 py-2 text-white">
      <p className="flex items-center gap-2 text-sm font-semibold">
        <LifeBuoy className="h-4 w-4 flex-none" />
        Estás dentro de la cuenta de <b className="underline">{negocio}</b> como soporte.
        <span className="font-normal opacity-80">
          Todo lo que hagas aquí le pasa a este cliente{hora && ` · el acceso se cierra a las ${hora}`}.
        </span>
      </p>
      <form action={salirDeSoporte}>
        <button className="inline-flex items-center gap-1.5 rounded-lg bg-white/20 px-3 py-1 text-xs font-bold transition hover:bg-white/30">
          <LogOut className="h-3.5 w-3.5" /> Salir de esta cuenta
        </button>
      </form>
    </div>
  );
}
