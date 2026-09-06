import type { Metadata } from "next";
import { RecuperarForm } from "@/components/RecuperarForm";

export const dynamic = "force-dynamic";

export const metadata: Metadata = { title: "Recuperar tu contraseña · Demandu" };

export default function RecuperarPage() {
  return <RecuperarForm />;
}
