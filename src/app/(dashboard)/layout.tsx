import { Sidebar } from "@/components/Sidebar";
import { Shell } from "@/components/Shell";

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  return <Shell sidebar={<Sidebar />}>{children}</Shell>;
}
