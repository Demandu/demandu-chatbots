import Image from "next/image";
import { cn } from "@/lib/utils";

/** Avatar de Lana (la mascota guía). */
export function LanaAvatar({ size = 48, className }: { size?: number; className?: string }) {
  return (
    <Image
      src="/lana.png"
      alt="Lana"
      width={size}
      height={size}
      className={cn("flex-none rounded-full", className)}
      priority={false}
    />
  );
}

/**
 * Globo de diálogo de Lana. Se usa para guiar al usuario en lenguaje simple:
 * inicio, wizard, dentro del bot y el constructor.
 */
export function LanaSays({
  children,
  size = 54,
  title = "Lana",
  className,
}: {
  children: React.ReactNode;
  size?: number;
  title?: string;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "flex items-start gap-3 rounded-2xl border border-pink/25 bg-gradient-to-br from-pink/10 to-violet/10 p-4",
        className
      )}
    >
      <LanaAvatar size={size} />
      <div className="min-w-0">
        <div className="mb-0.5 text-[11px] font-bold uppercase tracking-wide text-pink">{title}</div>
        <div className="text-sm text-muted">{children}</div>
      </div>
    </div>
  );
}
