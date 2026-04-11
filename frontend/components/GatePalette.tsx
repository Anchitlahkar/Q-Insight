"use client";

import { memo, useEffect, useMemo, useState } from "react";
import {
  GATE_COLOR,
  GateType,
  formatTheta,
  getDefaultTheta,
  isParametricGate,
  isTwoQubitGate,
  parseTheta,
} from "@/lib/gates";

export interface GatePaletteProps {
  selected: GateType | null;
  controlQubit: number;
  targetQubit: number;
  theta: number;
  qubits: number;
  onSelect: (type: GateType | null) => void;
  onControlChange: (value: number) => void;
  onTargetChange: (value: number) => void;
  onThetaChange: (value: number) => void;
  onDragPreviewChange?: (preview: { gateType: GateType } | null) => void;
}

const STORAGE_KEY = "qhack:last-selected-gate";

// ─── Palette layout — 4-column compact grid ───────────────────────────────────
const PALETTE_SECTIONS: Array<{
  title: string;
  color: string;
  gates: GateType[];
}> = [
  { title: "Single Qubit", color: "#3B82F6", gates: ["H", "X", "Y", "Z", "S", "SDG", "T", "TDG"] },
  { title: "Rotation",     color: "#8B5CF6", gates: ["RX", "RY", "RZ"] },
  { title: "Multi-Qubit",  color: "#F59E0B", gates: ["CNOT", "CZ", "SWAP"] },
  { title: "Ctrl Rotation",color: "#8B5CF6", gates: ["CRX", "CRY", "CRZ"] },
  { title: "Utility",      color: "#10B981", gates: ["M", "I"] },
];

const LABELS: Record<GateType, string> = {
  H: "H", X: "X", Y: "Y", Z: "Z",
  S: "S", SDG: "S†", T: "T", TDG: "T†",
  RX: "RX", RY: "RY", RZ: "RZ",
  CNOT: "CX", CZ: "CZ", SWAP: "SW",
  CRX: "CRX", CRY: "CRY", CRZ: "CRZ",
  M: "M", I: "I", COMPONENT: "[]",
};

function gateDragPayload(type: GateType) {
  return JSON.stringify({ entity: "gate", gateType: type });
}

// ─── Individual gate button ───────────────────────────────────────────────────
function GateButton({
  gate, selected, theta, sectionColor, onSelect, onDragPreviewChange,
}: {
  gate: GateType;
  selected: boolean;
  theta: number;
  sectionColor: string;
  onSelect: (type: GateType) => void;
  onDragPreviewChange?: (preview: { gateType: GateType } | null) => void;
}) {
  const gateColor = GATE_COLOR[gate] ?? sectionColor;

  const bgSelected   = `${gateColor}18`;
  const bgUnselected = "#FFFFFF";
  const borderSel    = gateColor;
  const borderUns    = "#E5E7EB";

  return (
    <button
      type="button"
      draggable
      title={isParametricGate(gate) ? `${LABELS[gate]} · θ=${formatTheta(theta)}` : LABELS[gate]}
      onClick={() => onSelect(gate)}
      onDragStart={(e) => {
        e.dataTransfer.effectAllowed = "copy";
        e.dataTransfer.setData("application/x-qhack-operation", gateDragPayload(gate));
        onDragPreviewChange?.({ gateType: gate });
      }}
      onDragEnd={() => onDragPreviewChange?.(null)}
      style={{
        height: 44,
        borderRadius: 10,
        border: `1.5px solid ${selected ? borderSel : borderUns}`,
        background: selected ? bgSelected : bgUnselected,
        color: gateColor,
        fontFamily: "JetBrains Mono, monospace",
        fontSize: gate.length > 3 ? 9 : 11,
        fontWeight: 700,
        cursor: "grab",
        transition: "all 0.13s ease",
        boxShadow: selected ? `0 0 0 3px ${gateColor}18` : "none",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
      }}
    >
      {LABELS[gate]}
    </button>
  );
}

// ─── θ parameter panel ────────────────────────────────────────────────────────
function ThetaPanel({ theta, onChange }: { theta: number; onChange: (v: number) => void }) {
  const [raw, setRaw] = useState(() => formatTheta(theta));
  const [error, setError] = useState(false);

  useEffect(() => { setRaw(formatTheta(theta)); }, [theta]);

  const commit = () => {
    const next = parseTheta(raw);
    if (Number.isNaN(next)) { setError(true); return; }
    setError(false);
    onChange(next);
  };

  return (
    <div style={{ borderTop: "1px solid #E5E7EB", marginTop: 2, paddingTop: 12, display: "grid", gap: 8 }}>
      <div style={{ fontFamily: "JetBrains Mono, monospace", fontSize: 9, color: "#6B7280", textTransform: "uppercase", letterSpacing: "0.08em" }}>
        θ Parameter
      </div>
      <input
        value={raw}
        onChange={(e) => { setRaw(e.target.value); setError(false); }}
        onBlur={commit}
        onKeyDown={(e) => { if (e.key === "Enter") commit(); }}
        style={{
          width: "100%",
          borderRadius: 9, border: `1px solid ${error ? "#FCA5A5" : "#E5E7EB"}`,
          background: "#FFFFFF", color: error ? "#DC2626" : "#1F2937",
          padding: "8px 10px", fontFamily: "JetBrains Mono, monospace", fontSize: 11, outline: "none",
        }}
      />
      <div style={{ display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: 5 }}>
        {[Math.PI / 4, Math.PI / 2, Math.PI, 2 * Math.PI].map((v) => (
          <button key={v} type="button" onClick={() => onChange(v)}
            style={{
              borderRadius: 8, border: "1px solid #DBEAFE",
              background: Math.abs(theta - v) < 0.001 ? "#DBEAFE" : "#EFF6FF",
              color: "#3B82F6", padding: "5px 0",
              fontFamily: "JetBrains Mono, monospace", fontSize: 9, cursor: "pointer",
            }}>
            {formatTheta(v)}
          </button>
        ))}
      </div>
    </div>
  );
}

// ─── Multi-qubit connection defaults ─────────────────────────────────────────
function MultiQubitPanel({
  gateType, controlQubit, targetQubit, qubits, onControlChange, onTargetChange,
}: {
  gateType: GateType; controlQubit: number; targetQubit: number; qubits: number;
  onControlChange: (v: number) => void; onTargetChange: (v: number) => void;
}) {
  const labels: Array<[string, number, (v: number) => void]> =
    gateType === "SWAP"
      ? [["Qubit A", controlQubit, onControlChange], ["Qubit B", targetQubit, onTargetChange]]
      : [["Control", controlQubit, onControlChange], ["Target",  targetQubit, onTargetChange]];

  return (
    <div style={{ borderTop: "1px solid #E5E7EB", marginTop: 2, paddingTop: 12, display: "grid", gap: 8 }}>
      <div style={{ fontFamily: "JetBrains Mono, monospace", fontSize: 9, color: "#6B7280", textTransform: "uppercase", letterSpacing: "0.08em" }}>
        Connection Defaults
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 6 }}>
        {labels.map(([label, value, onChange]) => (
          <label key={label} style={{ display: "grid", gap: 4 }}>
            <span style={{ fontFamily: "JetBrains Mono, monospace", fontSize: 9, color: "#6B7280" }}>{label}</span>
            <select
              value={value}
              onChange={(e) => onChange(Number(e.target.value))}
              style={{ borderRadius: 8, border: "1px solid #E5E7EB", background: "#fff", color: "#1F2937", padding: "7px 8px", fontFamily: "JetBrains Mono, monospace", fontSize: 10 }}>
              {Array.from({ length: qubits }, (_, i) => (
                <option key={i} value={i}>q[{i}]</option>
              ))}
            </select>
          </label>
        ))}
      </div>
    </div>
  );
}

// ─── Exported component ───────────────────────────────────────────────────────
export const GatePalette = memo(function GatePalette({
  selected, controlQubit, targetQubit, theta, qubits,
  onSelect, onControlChange, onTargetChange, onThetaChange, onDragPreviewChange,
}: GatePaletteProps) {
  // Restore last-selected gate on mount
  useEffect(() => {
    if (!selected) {
      const saved = window.localStorage.getItem(STORAGE_KEY) as GateType | null;
      if (saved) onSelect(saved);
    }
  }, [onSelect, selected]);

  useEffect(() => {
    if (selected) window.localStorage.setItem(STORAGE_KEY, selected);
  }, [selected]);

  const selectedSummary = useMemo(() => {
    if (!selected) return "Drag a gate or click a pivot to place it.";
    if (isTwoQubitGate(selected)) return `${LABELS[selected]} — click two pivots to connect.`;
    if (isParametricGate(selected)) return `${LABELS[selected]} · θ = ${formatTheta(theta)}`;
    return `${LABELS[selected]} — click any pivot to place.`;
  }, [selected, theta]);

  return (
    <aside style={{
      width: 280, minWidth: 280, maxWidth: 280,
      borderRadius: 12, border: "1px solid #E5E7EB",
      background: "#FFFFFF", padding: 16,
      display: "flex", flexDirection: "column", gap: 14,
      /* Cap height and allow internal scroll so palette never pushes layout */
      maxHeight: "calc(100vh - 160px)",
      overflowY: "auto",
    }}>
      {/* Header */}
      <div>
        <h3 style={{ margin: 0, fontFamily: "Syne, sans-serif", fontSize: 16, fontWeight: 700, color: "#1F2937" }}>Gate Palette</h3>
        <p style={{ margin: "4px 0 0", fontFamily: "JetBrains Mono, monospace", fontSize: 9, color: "#6B7280", lineHeight: 1.5 }}>
          Drag to circuit or click to select, then click a pivot.
        </p>
      </div>

      {/* Status hint */}
      <div style={{
        borderRadius: 9, border: "1px solid #E5E7EB", background: "#F9FAFB",
        padding: "8px 10px", fontFamily: "JetBrains Mono, monospace", fontSize: 9, color: "#6B7280", lineHeight: 1.5,
      }}>
        {selectedSummary}
      </div>

      {/* Gate sections */}
      <div style={{ display: "grid", gap: 14 }}>
        {PALETTE_SECTIONS.map((section) => (
          <section key={section.title} style={{ display: "grid", gap: 6 }}>
            {/* Category label with colour accent */}
            <div style={{
              display: "flex", alignItems: "center", gap: 6,
              fontFamily: "JetBrains Mono, monospace", fontSize: 9,
              color: "#6B7280", textTransform: "uppercase", letterSpacing: "0.08em",
            }}>
              <span style={{ width: 6, height: 6, borderRadius: "50%", background: section.color, flexShrink: 0 }} />
              {section.title}
            </div>

            {/* 4-column gate grid */}
            <div style={{ display: "grid", gridTemplateColumns: "repeat(4, minmax(0,1fr))", gap: 5 }}>
              {section.gates.map((gate) => (
                <GateButton
                  key={gate}
                  gate={gate}
                  selected={selected === gate}
                  theta={theta}
                  sectionColor={section.color}
                  onSelect={(type) => {
                    onSelect(type);
                    if (isParametricGate(type)) onThetaChange(getDefaultTheta(type));
                  }}
                  onDragPreviewChange={onDragPreviewChange}
                />
              ))}
            </div>
          </section>
        ))}
      </div>

      {/* Parametric θ panel — only when a rotation gate is selected */}
      {selected && isParametricGate(selected) && (
        <ThetaPanel theta={theta} onChange={onThetaChange} />
      )}

      {/* Two-qubit connection defaults */}
      {selected && isTwoQubitGate(selected) && (
        <MultiQubitPanel
          gateType={selected}
          controlQubit={controlQubit}
          targetQubit={targetQubit}
          qubits={qubits}
          onControlChange={onControlChange}
          onTargetChange={onTargetChange}
        />
      )}
    </aside>
  );
});

export default GatePalette;