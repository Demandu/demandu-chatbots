"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ReactFlow,
  ReactFlowProvider,
  Background,
  Controls,
  MiniMap,
  MarkerType,
  addEdge,
  reconnectEdge,
  useNodesState,
  useEdgesState,
  useReactFlow,
  type Node,
  type Edge,
  type Connection,
  type NodeTypes,
  type EdgeTypes,
  type Viewport,
} from "@xyflow/react";
import { DemanduNodeCard } from "./DemanduNodeCard";
import { DemanduEdge } from "./DemanduEdge";
import { ConnectButton } from "./ConnectButton";
import { Palette } from "./Palette";
import { Inspector } from "./Inspector";
import { Webchat } from "@/components/Webchat";
import { useCatalogs } from "@/lib/catalogs";
import { createClient } from "@/lib/supabase/client";
import {
  NODE_META, type Flow, type DemanduNodeData, type NodeType, type BotChannel,
} from "@/lib/flow/types";

const nodeTypes: NodeTypes = Object.fromEntries(
  (Object.keys(NODE_META) as NodeType[]).map((t) => [t, DemanduNodeCard])
) as NodeTypes;

const edgeTypes: EdgeTypes = { demandu: DemanduEdge };

const EDGE_STYLE = {
  type: "demandu",
  animated: true,
  reconnectable: true,
  markerEnd: { type: MarkerType.ArrowClosed, color: "#6E42FF", width: 18, height: 18 },
  style: { stroke: "#6E42FF", strokeWidth: 2.5 },
};

type SaveState = "idle" | "saving" | "saved" | "error";

function BuilderInner({
  flow,
  flowId,
  initialViewport,
  channel = "webchat",
  botId = "",
  connected = false,
  number = null,
}: {
  flow: Flow;
  flowId?: string | null;
  initialViewport?: Viewport | null;
  channel?: BotChannel;
  botId?: string;
  connected?: boolean;
  number?: string | null;
}) {
  const [nodes, setNodes, onNodesChange] = useNodesState<Node>(flow.nodes as unknown as Node[]);
  const [edges, setEdges, onEdgesChange] = useEdgesState<Edge>(
    (flow.edges as unknown as Edge[]).map((e) => ({ ...e, ...EDGE_STYLE }))
  );
  const [selectedId, setSelectedId] = useState<string | null>(flow.nodes[0]?.id ?? null);
  const [showPreview, setShowPreview] = useState(false);
  const [save, setSave] = useState<SaveState>("saved");
  const { screenToFlowPosition } = useReactFlow();
  const { catalogs, orgId } = useCatalogs();

  // Refs con el estado más reciente (para el guardado diferido)
  const nodesRef = useRef(nodes); nodesRef.current = nodes;
  const edgesRef = useRef(edges); edgesRef.current = edges;
  const viewportRef = useRef<Viewport | null>(initialViewport ?? null);

  const selected = useMemo(
    () => (nodes.find((n) => n.id === selectedId) as unknown as (typeof flow.nodes)[number]) ?? null,
    [nodes, selectedId]
  );

  const onConnect = useCallback(
    (c: Connection) => setEdges((eds) => addEdge({ ...c, id: `e-${Date.now()}`, ...EDGE_STYLE }, eds)),
    [setEdges]
  );

  // Re-conectar: arrastra un extremo de la flecha hacia otro nodo.
  const reconnectDone = useRef(true);
  const onReconnectStart = useCallback(() => { reconnectDone.current = false; }, []);
  const onReconnect = useCallback(
    (oldEdge: Edge, newConnection: Connection) => {
      reconnectDone.current = true;
      setEdges((eds) => reconnectEdge(oldEdge, newConnection, eds));
    },
    [setEdges]
  );
  // Si sueltas el extremo en el vacío, se desconecta (se elimina la arista).
  const onReconnectEnd = useCallback(
    (_: unknown, edge: Edge) => {
      if (!reconnectDone.current) {
        setEdges((eds) => eds.filter((e) => e.id !== edge.id));
      }
      reconnectDone.current = true;
    },
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
      const now = Date.now();
      let data: DemanduNodeData;
      if (type === "buttons") {
        data = { label: meta.label, text: "Elige una opción:", buttons: [{ id: `b1-${now}`, label: "Opción 1" }] };
      } else if (type === "api") {
        data = {
          label: meta.label,
          text: "Llama una API y ramifica por respuesta",
          apiMethod: "GET",
          buttons: [
            { id: `ok-${now}`, label: "✅ Éxito (2xx)" },
            { id: `err-${now}`, label: "⚠️ Error (4xx/5xx)" },
            { id: `other-${now}`, label: "Otros" },
          ],
        };
      } else if (type === "payment") {
        data = { label: meta.label, text: "Cobro con pasarela", currency: "MXN", gateway: "stripe" };
      } else if (type === "condition") {
        data = {
          label: meta.label,
          text: "Ramifica según los datos del contacto",
          conditions: [
            {
              id: `c1-${now}`,
              label: "Condición 1",
              match: "all",
              rules: [{ id: `r1-${now}`, operator: "equals" }],
            },
          ],
        };
      } else if (["ig_story", "ig_comment", "ig_dm", "fb_comment", "web_form"].includes(type)) {
        data = { label: meta.label, text: "" };
      } else {
        data = { label: meta.label, text: meta.description };
      }
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

  const deleteNode = useCallback(
    (id: string) => {
      setNodes((nds) => nds.filter((n) => n.id !== id));
      setEdges((eds) => eds.filter((e) => e.source !== id && e.target !== id));
      setSelectedId((cur) => (cur === id ? null : cur));
    },
    [setNodes, setEdges]
  );

  // Marca un nodo como arranque de la conversación (único en el flujo).
  const setStartNode = useCallback(
    (id: string) => {
      setNodes((nds) =>
        nds.map((n) => ({ ...n, data: { ...n.data, isStart: n.id === id } }))
      );
    },
    [setNodes]
  );

  const liveFlow: Flow = useMemo(
    () => ({ ...flow, nodes: nodes as unknown as Flow["nodes"], edges: edges as unknown as Flow["edges"] }),
    [flow, nodes, edges]
  );

  // ── Autoguardado (debounce) — persiste nodos, aristas y la vista ─────────────
  const timer = useRef<ReturnType<typeof setTimeout>>();
  const scheduleSave = useCallback(() => {
    if (!flowId) return;
    setSave("saving");
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(async () => {
      const graph = {
        nodes: nodesRef.current.map((n) => ({ id: n.id, type: n.type, position: n.position, data: n.data })),
        edges: edgesRef.current.map((e) => ({
          id: e.id, source: e.source, target: e.target,
          sourceHandle: e.sourceHandle ?? null, label: (e as any).label ?? null,
        })),
        viewport: viewportRef.current ?? undefined,
      };
      const { error } = await createClient().from("flows").update({ graph }).eq("id", flowId);
      setSave(error ? "error" : "saved");
    }, 700);
  }, [flowId]);

  const skipFirst = useRef(true);
  useEffect(() => {
    if (skipFirst.current) { skipFirst.current = false; return; }
    scheduleSave();
    return () => { if (timer.current) clearTimeout(timer.current); };
  }, [nodes, edges, scheduleSave]);

  const status =
    save === "saving"
      ? { dot: "bg-warning animate-pulse", text: "Guardando…" }
      : save === "error"
      ? { dot: "bg-danger", text: "Error al guardar" }
      : { dot: "bg-success", text: "Guardado automáticamente" };

  const viewportProps = initialViewport
    ? { defaultViewport: initialViewport }
    : { fitView: true };

  return (
    <div className="flex flex-1 overflow-hidden">
      <Palette channel={channel} />

      <div className="relative flex-1">
        {/* Toolbar */}
        <div className="absolute left-4 top-4 z-10 flex items-center gap-1 rounded-2xl border border-[#e6e8f2] bg-white/85 p-1.5 shadow-sm backdrop-blur">
          <button
            onClick={() => setShowPreview((s) => !s)}
            className="rounded-xl px-3 py-2 text-xs font-medium text-muted transition hover:bg-surface-raised hover:text-white"
          >
            ▶ Probar flujo
          </button>
          <div className="flex items-center gap-1.5 px-3 py-1.5 text-xs text-muted">
            <span className={`h-2 w-2 rounded-full ${status.dot}`} />
            {status.text}
          </div>
          <div className="ml-1 border-l border-surface-border pl-1.5">
            <ConnectButton channel={channel} botId={botId} connected={connected} number={number} />
          </div>
        </div>

        <ReactFlow
          nodes={nodes}
          edges={edges}
          onNodesChange={onNodesChange}
          onEdgesChange={onEdgesChange}
          onConnect={onConnect}
          onReconnect={onReconnect}
          onReconnectStart={onReconnectStart}
          onReconnectEnd={onReconnectEnd}
          onDrop={onDrop}
          onDragOver={(e) => { e.preventDefault(); e.dataTransfer.dropEffect = "move"; }}
          onNodeClick={(_, n) => setSelectedId(n.id)}
          onPaneClick={() => setSelectedId(null)}
          onMoveEnd={(_, vp) => { viewportRef.current = vp; scheduleSave(); }}
          onNodesDelete={(deleted) => {
            const del = new Set(deleted.map((n) => n.id));
            setEdges((eds) => eds.filter((e) => !del.has(e.source) && !del.has(e.target)));
            setSelectedId((cur) => (cur && del.has(cur) ? null : cur));
          }}
          deleteKeyCode={["Backspace", "Delete"]}
          nodeTypes={nodeTypes}
          edgeTypes={edgeTypes}
          proOptions={{ hideAttribution: true }}
          {...viewportProps}
        >
          <Background color="#c4c9d8" gap={26} />
          <Controls />
          <MiniMap
            pannable
            zoomable
            maskColor="rgba(20,22,50,0.08)"
            nodeColor={(n) => NODE_META[n.type as NodeType]?.color ?? "#6E42FF"}
            style={{ background: "#f5f6fb", border: "1px solid #d9dcea", borderRadius: 10 }}
          />
        </ReactFlow>

        {showPreview && (
          <div className="absolute inset-y-0 right-0 z-20 flex w-[420px] flex-col items-center justify-center border-l border-[#e6e8f2] bg-white/95 p-6 backdrop-blur">
            <Webchat flow={liveFlow} autostart />
          </div>
        )}
      </div>

      <Inspector node={selected} onChange={patchSelected} onDelete={deleteNode} onSetStart={setStartNode} catalogs={catalogs} orgId={orgId} />
    </div>
  );
}

export function FlowBuilder({
  flow,
  flowId,
  initialViewport,
  channel = "webchat",
  botId = "",
  connected = false,
  number = null,
}: {
  flow: Flow;
  flowId?: string | null;
  initialViewport?: Viewport | null;
  channel?: BotChannel;
  botId?: string;
  connected?: boolean;
  number?: string | null;
}) {
  return (
    <ReactFlowProvider>
      <BuilderInner
        flow={flow}
        flowId={flowId}
        initialViewport={initialViewport}
        channel={channel}
        botId={botId}
        connected={connected}
        number={number}
      />
    </ReactFlowProvider>
  );
}
