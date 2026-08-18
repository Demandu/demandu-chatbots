"use client";

import { createContext, useContext, useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import { Menu, X } from "lucide-react";
import { NotificationsWatcher } from "./notifications/NotificationsWatcher";
import { Toasts } from "./notifications/Toasts";

/**
 * Marco de la aplicación, adaptable a cualquier pantalla.
 *
 * - Escritorio (lg y más): la barra lateral siempre visible.
 * - Tablet y móvil: la barra se oculta y se abre como cajón con el botón ☰
 *   que vive dentro de la barra superior. Se cierra sola al navegar y con Escape.
 */
const ShellCtx = createContext<{ openMenu: () => void }>({ openMenu: () => {} });

/** Botón ☰ para abrir el menú. Solo aparece cuando la barra lateral está oculta. */
export function MenuButton({ className = "" }: { className?: string }) {
  const { openMenu } = useContext(ShellCtx);
  return (
    <button
      type="button"
      onClick={openMenu}
      aria-label="Abrir menú"
      className={`-ml-1 grid h-9 w-9 flex-none place-items-center rounded-xl border border-surface-border bg-surface-raised text-muted transition hover:text-white lg:hidden ${className}`}
    >
      <Menu className="h-5 w-5" />
    </button>
  );
}

export function Shell({ sidebar, children }: { sidebar: React.ReactNode; children: React.ReactNode }) {
  const [open, setOpen] = useState(false);
  const pathname = usePathname();

  // Al cambiar de pantalla, cierra el cajón
  useEffect(() => setOpen(false), [pathname]);

  // Escape cierra; con el cajón abierto no se scrollea el fondo
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    window.addEventListener("keydown", onKey);
    document.body.style.overflow = open ? "hidden" : "";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = "";
    };
  }, [open]);

  return (
    <ShellCtx.Provider value={{ openMenu: () => setOpen(true) }}>
      <div className="flex h-[100dvh] overflow-hidden">
        {/* Barra lateral fija en escritorio */}
        <div className="hidden lg:flex">{sidebar}</div>

        {/* Cajón en móvil y tablet */}
        {open && (
          <div className="fixed inset-0 z-50 lg:hidden">
            <button
              aria-label="Cerrar menú"
              onClick={() => setOpen(false)}
              className="absolute inset-0 bg-black/50 backdrop-blur-sm"
            />
            <div className="absolute inset-y-0 left-0 flex max-w-[85vw] animate-[slideIn_.18s_ease-out] shadow-2xl">
              {sidebar}
              <button
                onClick={() => setOpen(false)}
                aria-label="Cerrar menú"
                className="absolute right-2 top-3 grid h-9 w-9 place-items-center rounded-xl text-muted transition hover:text-white"
              >
                <X className="h-5 w-5" />
              </button>
            </div>
          </div>
        )}

        <div className="flex min-w-0 flex-1 flex-col">{children}</div>

        {/* Vigila mensajes nuevos en toda la app, no solo en la Bandeja */}
        <NotificationsWatcher />
        <Toasts />

        <style jsx global>{`
          @keyframes slideIn {
            from {
              transform: translateX(-100%);
            }
            to {
              transform: translateX(0);
            }
          }
        `}</style>
      </div>
    </ShellCtx.Provider>
  );
}
