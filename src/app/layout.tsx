import type { Metadata } from "next";
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

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="es" className={`${sora.variable} ${inter.variable}`}>
      <body>{children}</body>
    </html>
  );
}
