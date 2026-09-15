import { getTranslations } from "next-intl/server";
import { NotificationsSettings } from "@/components/notifications/NotificationsSettings";

export const dynamic = "force-dynamic";

export default async function NotificacionesPage() {
  const t = await getTranslations("avisos");
  return (
    <div>
      <div className="mb-5">
        <h2 className="font-display text-lg font-semibold text-ink">{t("titulo")}</h2>
        <p className="text-xs text-ink-3">{t("intro")}</p>
      </div>

      <NotificationsSettings />
    </div>
  );
}
