import { Bell, Plus } from "lucide-react";
import { UserMenu } from "./UserMenu";
import { MenuButton } from "./Shell";

export function Topbar({ crumb, actions }: { crumb?: React.ReactNode; actions?: React.ReactNode }) {
  return (
    <header className="flex h-[60px] flex-none items-center gap-3 border-b border-surface-border bg-surface/60 px-4 backdrop-blur sm:gap-4 sm:px-6">
      <MenuButton />
      <div className="min-w-0 truncate text-sm text-muted">{crumb}</div>
      <div className="ml-auto flex flex-none items-center gap-2 sm:gap-3.5">
        {actions}
        {/* Accesos rápidos: se ocultan en pantallas chicas para dejar aire */}
        <button className="hidden h-9 w-9 place-items-center rounded-xl border border-surface-border bg-surface-raised text-muted sm:grid">
          <Bell className="h-4 w-4" />
        </button>
        <button className="hidden h-9 w-9 place-items-center rounded-xl border border-surface-border bg-surface-raised text-muted sm:grid">
          <Plus className="h-4 w-4" />
        </button>
        <UserMenu />
      </div>
    </header>
  );
}
