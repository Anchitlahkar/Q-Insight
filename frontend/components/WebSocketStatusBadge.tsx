"use client";

import { memo } from "react";
import { SocketStatus } from "@/lib/types";

const STATUS_STYLE: Record<
  SocketStatus,
  { label: string; color: string; border: string; background: string }
> = {
  connecting: {
    label: "Connecting",
    color: "#ffb340",
    border: "rgba(255,179,64,0.28)",
    background: "rgba(255,179,64,0.08)"
  },
  connected: {
    label: "Connected",
    color: "#00e5a0",
    border: "rgba(0,229,160,0.28)",
    background: "rgba(0,229,160,0.08)"
  },
  running: {
    label: "Running",
    color: "#00d4ff",
    border: "rgba(0,212,255,0.28)",
    background: "rgba(0,212,255,0.08)"
  },
  disconnected: {
    label: "Disconnected",
    color: "rgba(200,223,242,0.55)",
    border: "rgba(255,255,255,0.08)",
    background: "rgba(255,255,255,0.04)"
  },
  error: {
    label: "Error",
    color: "#ff3860",
    border: "rgba(255,56,96,0.28)",
    background: "rgba(255,56,96,0.08)"
  }
};

interface WebSocketStatusBadgeProps {
  status: SocketStatus;
  message?: string | null;
  latencyMs?: number | null;
}

export const WebSocketStatusBadge = memo(function WebSocketStatusBadge({
  status,
  message,
  latencyMs
}: WebSocketStatusBadgeProps) {
  const style = STATUS_STYLE[status];

  return (
    <div
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 10,
        padding: "7px 11px",
        borderRadius: 999,
        border: `1px solid ${style.border}`,
        background: style.background
      }}
    >
      <span
        style={{
          width: 8,
          height: 8,
          borderRadius: "50%",
          background: style.color,
          boxShadow: `0 0 10px ${style.color}`,
          animation: status === "running" ? "pulse-dot 1s ease-in-out infinite" : "none"
        }}
      />
      <span
        style={{
          fontFamily: "JetBrains Mono, monospace",
          fontSize: 10,
          color: style.color,
          letterSpacing: "0.08em",
          textTransform: "uppercase"
        }}
      >
        {style.label}
      </span>
      {(message || latencyMs !== null) && (
        <span
          style={{
            fontFamily: "JetBrains Mono, monospace",
            fontSize: 10,
            color: "rgba(200,223,242,0.5)"
          }}
        >
          {[message, latencyMs !== null ? `${latencyMs} ms` : null].filter(Boolean).join(" · ")}
        </span>
      )}
    </div>
  );
});

export default WebSocketStatusBadge;

