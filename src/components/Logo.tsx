import { cn } from "@/lib/utils";

/** Isotipo oficial de Demandu (chat-bubble robot, degradado rosa). */
export function LogoMark({ className }: { className?: string }) {
  // eslint-disable-next-line @next/next/no-img-element
  return <img src="/demandu-mark.png" alt="Demandu" className={cn("object-contain", className)} />;
}

/** Logotipo horizontal oficial (isotipo + wordmark), versión clara para fondos oscuros. */
export function Logo({ className }: { className?: string }) {
  // eslint-disable-next-line @next/next/no-img-element
  return (
    <img
      src="/demandu-logo-color.png"
      alt="demandu"
      className={cn("h-8 w-auto object-contain", className)}
    />
  );
}
