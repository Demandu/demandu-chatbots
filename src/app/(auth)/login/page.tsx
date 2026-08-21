import { AuthForm } from "@/components/AuthForm";

// `useSearchParams` (el error que vuelve de Apple/Facebook) obliga a que la
// pantalla sea dinámica; si no, Next falla al compilar pidiendo un <Suspense>.
export const dynamic = "force-dynamic";

export default function LoginPage() {
  return <AuthForm mode="login" />;
}
