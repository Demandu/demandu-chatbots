import { Bell, Plus } from "lucide-react";
import { UserMenu } from "./UserMenu";

export function Topbar({ crumb }: { crumb?: React.ReactNode }) {
  return (
    <header className="flex h-[60px] items-center gap-4 border-b border-surface-border bg-surface/60 px-6 backdrop-blur">
      <div className="text-sm text-muted">{crumb}</div>
      <div className="ml-auto flex items-center gap-3.5">
        <button className="grid h-9 w-9 place-items-center rounded-xl border border-surface-border bg-surface-raised text-muted">
          <Bell className="h-4 w-4" />
        </button>
        <button className="grid h-9 w-9 place-items-center rounded-xl border border-surface-border bg-surface-raised text-muted">
          <Plus className="h-4 w-4" />
        </button>
        <UserMenu />
      </div>
    </header>
  );
}
