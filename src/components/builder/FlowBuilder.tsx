"use client";

import { useCallback, useMemo, useRef, useState } from "react";
import {
  ReactFlow,
  ReactFlowProvider,
  Background,
  Controls,
  MiniMap,
  addEdge,
  useNodesState,
  useEdgesState,
  useReactFlow,
  type Node,
  type Edge,
  type Connection,
  type NodeTypes,
} from "@xyflow/react";
import { DemanduNodeCard } from "./DemanduNodeCard";
import { Palette } from "./Palette";
import { Inspector } from "./Inspector";
import { Webchat } from "@/components/Webchat";
import {
  NODE_META, PALETTE_ORDER, type Flow, type DemanduNodeData, type NodeType,
} from "@/lib/flow/types";

/** Registra el mismo componente para todos los tipos de nodo. */
const nodeTypes: NodeTypes = Object.fromEntries(
  (Object.keys(NODE_META) as NodeType[]).map((t) => [t, DemanduNodeCard])
) as NodeTypes;

function BuilderInner({ flow }: { flow: Flow }) {
  const [nodes, setNodes, onNodesChange] = useNodesState<Node>(flow.nodes as unknown as Node[]);
  const [edges, setEdges, onEdgesChange] = useEdgesState<Edge>(flow.edges as unknown as Edge[]);
  const [selectedId, setSelectedId] = useState<string | null>("welcome");
  const [showPreview, setShowPreview] = useState(false);
  const wrapper = useRef<HTMLDivElement>(null);
  const { screenToFlowPosition } = useReactFlow();

  const selected = useMemo(
    () => (nodes.find((n) => n.id === selectedId) as unknown as (typeof flow.nodes)[number]) ?? null,
    [nodes, selectedId]
  );

  const onConnect = useCallback(
    (c: Connection) => setEdges((eds) => addEdge({ ...c, id: `e-${Date.now()}` }, eds)),
    [setEdges]
  );

  const onDrop = useCallback(
    (event: React.DragEvent) => {
      event.preventDefault();
      const type = event.dataTransfer.getData("application/demandu-node") as NodeType;
      if (!type) return;
      const position = screenToFlowPosition({ x: event.clientX, y: event.clientY });
      const meta = NODE_META[type];
      const id = `${type}-${Date.now()}`;
      const data: DemanduNodeData =
        type === "buttons"
          ? { label: meta.label, text: "Elige una opción:", buttons: [{ id: `b1-${Date.now()}`, label: "Opción 1" }] }
          : { label: meta.label, text: meta.description };
      setNodes((nds) => nds.concat({ id, type, position, data } as unknown as Node));
      setSelectedId(id);
    },
    [screenToFlowPosition, setNodes]
  );

  const patchSelected = useCallback(
    (patch: Partial<DemanduNodeData>) => {
      if (!selectedId) return;
      setNodes((nds) =>
        nds.map((n) => (n.id === selectedId ? { ...n, data: { ...n.data, ...patch } } : n))
      );
    },
    [selectedId, setNodes]
  );

  const liveFlow: Flow = useMemo(
    () => ({ ...flow, nodes: nodes as unknown as Flow["nodes"], edges: edges as unknown as Flow["edges"] }),
    [flow, nodes, edges]
  );

  return (
    <div className="flex flex-1 overflow-hidden">
      <Palette />

      <div ref={wrapper} className="relative flex-1">
        {/* Toolbar */}
        <div className="absolute left-4 top-4 z-10 flex gap-2">
          <button onClick={() => setShowPreview((s) => !s)} className="btn-primary !px-3 !py-2 text-xs">
            ▶ Probar flujo
          </button>
          <button className="btn-ghost !px-3 !py-2 text-xs">⟳ Publicar</button>
        </div>

        <ReactFlow
          nodes={nodes}
          edges={edges}
          onNodesChange={onNodesChange}
          onEdgesChange={onEdgesChange}
          onConnect={onConnect}
          onDrop={onDrop}
          onDragOver={(e) => { e.preventDefault(); e.dataTransfer.dropEffect = "move"; }}
          onNodeClick={(_, n) => setSelectedId(n.id)}
          onPaneClick={() => setSelectedId(null)}
          nodeTypes={nodeTypes}
          fitView
          proOptions={{ hideAttribution: true }}
          defaultEdgeOptions={{ style: { stroke: "#6E42FF", strokeWidth: 2 } }}
        >
          <svg style={{ position: "absolute", width: 0, height: 0 }}>
            <defs>
              <linearGradient id="demandu-edge" x1="0" y1="0" x2="1" y2="0">
                <stop offset="0" stopColor="#F64A97" />
                <stop offset="1" stopColor="#6E42FF" />
              </linearGradient>
            </defs>
          </svg>
          <Background color="#ffffff14" gap={26} />
          <Controls />
          <MiniMap
            pannable
            zoomable
            maskColor="rgba(10,10,40,0.7)"
            nodeColor={(n) => NODE_META[n.type as NodeType]?.color ?? "#6E42FF"}
            style={{ background: "#0f1030", border: "1px solid #2a2c55", borderRadius: 10 }}
          />
        </ReactFlow>

        {/* Preview drawer */}
        {showPreview && (
          <div className="absolute inset-y-0 right-0 z-20 flex w-[420px] flex-col items-center justify-center border-l border-surface-border bg-surface/95 p-6 backdrop-blur">
            <Webchat flow={liveFlow} autostart />
          </div>
        )}
      </div>

      <Inspector node={selected} onChange={patchSelected} />
    </div>
  );
}

export function FlowBuilder({ flow }: { flow: Flow }) {
  return (
    <ReactFlowProvider>
      <BuilderInner flow={flow} />
    </ReactFlowProvider>
  );
}
