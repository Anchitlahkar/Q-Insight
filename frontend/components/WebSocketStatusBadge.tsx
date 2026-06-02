"use client";

import { memo } from "react";
import { SocketStatus } from "@/lib/types";

// ── Status colour map — white design system ───────────────────────────────────
const STATUS_STYLE: Record<
  SocketStatus,
  { label: string; dot: string; text: string; border: string; background: string }
> = {
  connecting: {
    label:      "Connecting",
    dot:        "var(--color-warning)",
    text:       "var(--color-warning)",
    border:     "rgba(245,158,11,0.34)",
    background: "rgba(245,158,11,0.10)",
  },
  connected: {
    label:      "Connected",
    dot:        "var(--color-success)",
    text:       "var(--color-success)",
    border:     "rgba(52,211,153,0.34)",
    background: "rgba(52,211,153,0.10)",
  },
  running: {
    label:      "Running",
    dot:        "var(--color-primary)",
    text:       "var(--color-primary)",
    border:     "rgba(34,211,238,0.34)",
    background: "rgba(34,211,238,0.10)",
  },
  disconnected: {
    label:      "Disconnected",
    dot:        "var(--color-danger)",
    text:       "var(--color-danger)",
    border:     "rgba(248,113,113,0.32)",
    background: "rgba(248,113,113,0.10)",
  },
  error: {
    label:      "Error",
    dot:        "var(--color-danger)",
    text:       "var(--color-danger)",
    border:     "rgba(248,113,113,0.34)",
    background: "rgba(248,113,113,0.12)",
  },
};

interface WebSocketStatusBadgeProps {
  status: SocketStatus;
  message?: string | null;
  latencyMs?: number | null;
}

export const WebSocketStatusBadge = memo(function WebSocketStatusBadge({
  status,
  message,
  latencyMs,
}: WebSocketStatusBadgeProps) {
  const s = STATUS_STYLE[status];

  return (
    <div
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 7,
        padding: "5px 12px",
        borderRadius: 999,
        border: `1px solid ${s.border}`,
        background: s.background,
        boxShadow: status === "connected" ? "0 0 18px rgba(52,211,153,0.16)" : status === "running" ? "0 0 18px rgba(34,211,238,0.18)" : "none",
        backdropFilter: "blur(10px)",
      }}
    >
      {/* Animated dot for running, static for others */}
      <span
        style={{
          width: 7,
          height: 7,
          borderRadius: "50%",
          background: s.dot,
          flexShrink: 0,
          boxShadow: `0 0 12px ${s.dot}`,
          animation: status === "running" || status === "connected"
            ? "ws-pulse 1.1s ease-in-out infinite"
            : "none",
        }}
      />

      {/* Status label */}
      <span
        style={{
          fontFamily: "JetBrains Mono, monospace",
          fontSize: 10,
          fontWeight: 600,
          color: s.text,
          letterSpacing: "0.08em",
          textTransform: "uppercase",
        }}
      >
        {s.label}
      </span>

      {/* Optional message / latency */}
      {(message || latencyMs != null) && (
        <span
          style={{
            fontFamily: "JetBrains Mono, monospace",
            fontSize: 9,
            color: s.text,
            opacity: 0.65,
          }}
        >
          {[message, latencyMs != null ? `${latencyMs}ms` : null]
            .filter(Boolean)
            .join(" · ")}
        </span>
      )}

      {/* Pulse keyframe injected once */}
      <style>{`
        @keyframes ws-pulse {
          0%, 100% { opacity: 1; }
          50%       { opacity: 0.35; }
        }
      `}</style>
    </div>
  );
});

export default WebSocketStatusBadge;
