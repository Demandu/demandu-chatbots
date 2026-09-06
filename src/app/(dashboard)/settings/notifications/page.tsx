import { NotificationsSettings } from "@/components/notifications/NotificationsSettings";

export const dynamic = "force-dynamic";

export default function NotificacionesPage() {
  return (
    <div>
      <div className="mb-5">
        <h2 className="font-display text-lg font-semibold text-ink">Notificaciones</h2>
        <p className="text-xs text-ink-3">
          Decide cómo quieres enterarte cuando un cliente escriba: con sonido, con un aviso de tu computadora, o
          en silencio.
        </p>
      </div>

      <NotificationsSettings />
    </div>
  );
}
