import Link from "next/link";
import { Topbar } from "@/components/Topbar";
import { NewBotWizard } from "@/components/bots/NewBotWizard";
import { ArrowLeft } from "lucide-react";

export const dynamic = "force-dynamic";

export default function NewBotPage({ searchParams }: { searchParams: { channel?: string } }) {
  return (
    <>
      <Topbar
        crumb={
          <span className="inline-flex items-center gap-2">
            <Link href="/bots" className="inline-flex items-center gap-1 text-muted hover:text-white">
              <ArrowLeft className="h-3.5 w-3.5" /> Chatbots
            </Link>
            <span className="text-muted-2">/</span>
            <span className="font-semibold text-white">Nuevo chatbot</span>
          </span>
        }
      />
      <div className="min-h-full flex-1 overflow-auto bg-canvas p-4 sm:p-6 lg:p-8 text-ink">
        <NewBotWizard initialChannel={searchParams?.channel} />
      </div>
    </>
  );
}
