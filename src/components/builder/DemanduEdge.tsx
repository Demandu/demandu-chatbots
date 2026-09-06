"use client";

import { useState } from "react";
import {
  BaseEdge,
  EdgeLabelRenderer,
  getBezierPath,
  useReactFlow,
  type EdgeProps,
} from "@xyflow/react";

/**
 * Arista del constructor: animada + botón ✕ al pasar el cursor para desconectar.
 * También es re-conectable (arrastra un extremo a otro nodo) desde FlowBuilder.
 */
export function DemanduEdge({
  id,
  sourceX,
  sourceY,
  targetX,
  targetY,
  sourcePosition,
  targetPosition,
  markerEnd,
  style,
  label,
}: EdgeProps) {
  const { setEdges } = useReactFlow();
  const [hover, setHover] = useState(false);

  const [edgePath, labelX, labelY] = getBezierPath({
    sourceX,
    sourceY,
    sourcePosition,
    targetX,
    targetY,
    targetPosition,
  });

  const remove = () => setEdges((eds) => eds.filter((e) => e.id !== id));

  return (
    <>
      <BaseEdge id={id} path={edgePath} markerEnd={markerEnd} style={style} />
      {/* Banda invisible ancha para capturar el hover con facilidad */}
      <path
        d={edgePath}
        fill="none"
        stroke="transparent"
        strokeWidth={22}
        style={{ cursor: "pointer" }}
        onMouseEnter={() => setHover(true)}
        onMouseLeave={() => setHover(false)}
      />
      <EdgeLabelRenderer>
        <div
          style={{
            position: "absolute",
            transform: `translate(-50%, -50%) translate(${labelX}px, ${labelY}px)`,
            pointerEvents: "all",
          }}
          onMouseEnter={() => setHover(true)}
          onMouseLeave={() => setHover(false)}
        >
          <div className="flex items-center gap-1">
            {label ? (
              <span className="rounded-md border border-surface-border bg-surface-card px-1.5 py-0.5 text-[10px] font-semibold text-muted">
                {label as any}
              </span>
            ) : null}
            {hover && (
              <button
                onClick={remove}
                title="Desconectar"
                className="grid h-5 w-5 place-items-center rounded-full bg-danger text-[10px] text-white shadow-card transition hover:scale-110"
              >
                ✕
              </button>
            )}
          </div>
        </div>
      </EdgeLabelRenderer>
    </>
  );
}
