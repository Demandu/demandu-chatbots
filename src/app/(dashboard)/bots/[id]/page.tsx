import { Topbar } from "@/components/Topbar";
import { FlowBuilder } from "@/components/builder/FlowBuilder";
import { sampleFlow } from "@/lib/flow/sample";

/**
 * Editor de un bot. En producción se carga el flujo desde Supabase por `id`;
 * aquí usamos el flujo de ejemplo como semilla.
 */
export default function BotBuilderPage({ params }: { params: { id: string } }) {
  const flow = sampleFlow; // TODO: fetch flow where id = params.id

  return (
    <>
      <Topbar
        crumb={
          <span>
            Bots / <span className="font-semibold text-white">{flow.name}</span>
          </span>
        }
      />
      <FlowBuilder flow={flow} />
    </>
  );
}
