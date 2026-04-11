"use client";

import { memo } from "react";
import { SocketStatus } from "@/lib/types";

// ── Status colour map — white design system ───────────────────────────────────
// All colours use opaque values that are readable on white backgrounds.
// No neon / dark-mode colours.
const STATUS_STYLE: Record<
  SocketStatus,
  { label: string; dot: string; text: string; border: string; background: string }
> = {
  connecting: {
    label:      "Connecting",
    dot:        "#F59E0B",   // amber-400
    text:       "#92400E",   // amber-800
    border:     "#FDE68A",   // amber-200
    background: "#FFFBEB",   // amber-50
  },
  connected: {
    label:      "Connected",
    dot:        "#10B981",   // emerald-500
    text:       "#065F46",   // emerald-800
    border:     "#A7F3D0",   // emerald-200
    background: "#ECFDF5",   // emerald-50
  },
  running: {
    label:      "Running",
    dot:        "#3B82F6",   // blue-500
    text:       "#1E3A8A",   // blue-900
    border:     "#BFDBFE",   // blue-200
    background: "#EFF6FF",   // blue-50
  },
  disconnected: {
    label:      "Disconnected",
    dot:        "#9CA3AF",   // gray-400
    text:       "#374151",   // gray-700
    border:     "#E5E7EB",   // gray-200
    background: "#F9FAFB",   // gray-50
  },
  error: {
    label:      "Error",
    dot:        "#EF4444",   // red-500
    text:       "#7F1D1D",   // red-900
    border:     "#FECACA",   // red-200
    background: "#FEF2F2",   // red-50
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
          animation: status === "running"
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