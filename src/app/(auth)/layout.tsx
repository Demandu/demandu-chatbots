import { Logo } from "@/components/Logo";

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="grid min-h-[100dvh] lg:grid-cols-2">
      {/* Brand panel */}
      <div className="relative hidden overflow-hidden bg-navy lg:block">
        <div className="absolute inset-0 bg-demandu-radial" />
        <div className="relative flex h-full flex-col justify-between p-12">
          <Logo />
          <div>
            <h1 className="max-w-md font-display text-4xl font-extrabold leading-tight text-white">
              Convierte <span className="bg-demandu-gradient bg-clip-text text-transparent">conversaciones</span> en clientes.
            </h1>
            <p className="mt-4 max-w-sm text-muted">
              La plataforma de IA conversacional que ayuda a tu negocio a vender, atender y crecer desde WhatsApp, Instagram y más.
            </p>
          </div>
          <p className="text-xs text-muted-2">Meta Business Partner · WhatsApp Business Platform</p>
        </div>
      </div>

      {/* Form panel */}
      <div className="flex items-center justify-center p-6">
        <div className="w-full max-w-sm">{children}</div>
      </div>
    </div>
  );
}
