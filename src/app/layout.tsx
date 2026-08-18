import type { Metadata, Viewport } from "next";
import { Sora, Inter } from "next/font/google";
import "@xyflow/react/dist/style.css";
import "./globals.css";

const sora = Sora({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700", "800"],
  variable: "--font-sora",
  display: "swap",
});

const inter = Inter({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  variable: "--font-inter",
  display: "swap",
});

export const metadata: Metadata = {
  title: "Demandu · Plataforma Conversacional",
  description:
    "Convierte conversaciones en clientes. La plataforma de IA conversacional de Demandu.",
};

/** La app se adapta al ancho real del dispositivo, desde monitores hasta celulares. */
export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="es" className={`${sora.variable} ${inter.variable}`}>
      <body>{children}</body>
    </html>
  );
}
