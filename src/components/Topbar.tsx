import Link from "next/link";
import { Plus } from "lucide-react";
import { UserMenu } from "./UserMenu";
import { MenuButton } from "./Shell";
import { NotificationBell } from "./notifications/NotificationBell";

export function Topbar({ crumb, actions }: { crumb?: React.ReactNode; actions?: React.ReactNode }) {
  return (
    <header className="flex h-[60px] flex-none items-center gap-3 border-b border-surface-border bg-surface/60 px-4 backdrop-blur sm:gap-4 sm:px-6">
      <MenuButton />
      <div className="min-w-0 truncate text-sm text-muted">{crumb}</div>
      <div className="ml-auto flex flex-none items-center gap-2 sm:gap-3.5">
        {actions}
        <NotificationBell />
        {/* Crear chatbot: se oculta en pantallas chicas para dejar aire */}
        <Link
          href="/bots/new"
          aria-label="Crear chatbot"
          title="Crear chatbot"
          className="hidden h-9 w-9 place-items-center rounded-xl border border-surface-border bg-surface-raised text-muted transition hover:text-white sm:grid"
        >
          <Plus className="h-4 w-4" />
        </Link>
        <UserMenu />
      </div>
    </header>
  );
}
