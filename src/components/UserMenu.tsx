"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { LogOut, User } from "lucide-react";
import { createClient } from "@/lib/supabase/client";

/** Avatar con menú de usuario y cierre de sesión. */
export function UserMenu() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [email, setEmail] = useState("");
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    createClient()
      .auth.getUser()
      .then(({ data }) => setEmail(data.user?.email ?? ""));
  }, []);

  useEffect(() => {
    const onDoc = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("click", onDoc);
    return () => document.removeEventListener("click", onDoc);
  }, []);

  const initials = email ? email.slice(0, 2).toUpperCase() : "··";

  const logout = async () => {
    await createClient().auth.signOut();
    router.push("/login");
    router.refresh();
  };

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setOpen((o) => !o)}
        className="grid h-9 w-9 place-items-center rounded-full bg-gradient-to-br from-pink to-violet font-display text-sm font-bold text-white"
        title="Cuenta"
      >
        {initials}
      </button>

      {open && (
        <div className="absolute right-0 top-full z-30 mt-2 w-60 rounded-xl border border-surface-border bg-surface-card p-1.5 shadow-card">
          <div className="flex items-center gap-2.5 px-3 py-2">
            <span className="grid h-8 w-8 flex-none place-items-center rounded-full bg-surface-raised">
              <User className="h-4 w-4 text-muted" />
            </span>
            <div className="min-w-0">
              <div className="truncate text-xs font-semibold text-white">{email || "Sesión iniciada"}</div>
              <div className="text-[11px] text-muted-2">Owner</div>
            </div>
          </div>
          <div className="my-1 h-px bg-surface-border" />
          <button
            onClick={logout}
            className="flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-left text-sm text-white transition hover:bg-surface-raised"
          >
            <LogOut className="h-4 w-4 text-danger" /> Cerrar sesión
          </button>
        </div>
      )}
    </div>
  );
}
