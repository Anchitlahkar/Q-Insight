"use client";

import { memo, useEffect, useMemo, useState } from "react";
import type { DragEvent } from "react";
import { AnimatePresence, motion } from "framer-motion";
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
  { title: "Single Qubit", color: "#22D3EE", gates: ["H", "X", "Y", "Z", "S", "SDG", "T", "TDG"] },
  { title: "Rotation",     color: "#A78BFA", gates: ["RX", "RY", "RZ"] },
  { title: "Multi-Qubit",  color: "#F59E0B", gates: ["CNOT", "CZ", "SWAP"] },
  { title: "Ctrl Rotation",color: "#A78BFA", gates: ["CRX", "CRY", "CRZ"] },
  { title: "Utility",      color: "#34D399", gates: ["M", "I"] },
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

  const bgSelected   = `linear-gradient(180deg, ${gateColor}26, rgba(15,23,42,0.82))`;
  const bgUnselected = "rgba(15,23,42,0.72)";
  const borderSel    = gateColor;
  const borderUns    = "rgba(148,163,184,0.16)";

  return (
    <motion.button
      type="button"
      draggable
      title={isParametricGate(gate) ? `${LABELS[gate]} · θ=${formatTheta(theta)}` : LABELS[gate]}
      onClick={() => onSelect(gate)}
      onDragStartCapture={(e) => {
        const dragEvent = e as unknown as DragEvent<HTMLButtonElement>;
        dragEvent.dataTransfer.effectAllowed = "copy";
        dragEvent.dataTransfer.setData("application/x-qhack-operation", gateDragPayload(gate));
        onDragPreviewChange?.({ gateType: gate });
      }}
      onDragEnd={() => onDragPreviewChange?.(null)}
      style={{
        height: 44,
        borderRadius: 12,
        border: `1px solid ${selected ? borderSel : borderUns}`,
        background: selected ? bgSelected : bgUnselected,
        color: gateColor,
        fontFamily: "JetBrains Mono, monospace",
        fontSize: gate.length > 3 ? 9 : 11,
        fontWeight: 700,
        cursor: "grab",
        boxShadow: selected ? `0 0 0 3px ${gateColor}18, 0 0 22px ${gateColor}30` : "0 8px 18px rgba(0,0,0,0.16)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
      }}
      whileHover={{ y: -2, scale: 1.03 }}
      whileTap={{ scale: 0.97 }}
    >
      {LABELS[gate]}
    </motion.button>
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
    <div style={{ borderTop: "1px solid rgba(148,163,184,0.16)", marginTop: 2, paddingTop: 12, display: "grid", gap: 8 }}>
      <div style={{ fontFamily: "JetBrains Mono, monospace", fontSize: 9, color: "#9CA3AF", textTransform: "uppercase", letterSpacing: "0.08em" }}>
        θ Parameter
      </div>
      <input
        value={raw}
        onChange={(e) => { setRaw(e.target.value); setError(false); }}
        onBlur={commit}
        onKeyDown={(e) => { if (e.key === "Enter") commit(); }}
        style={{
          width: "100%",
          borderRadius: 10, border: `1px solid ${error ? "rgba(248,113,113,0.58)" : "rgba(148,163,184,0.18)"}`,
          background: "rgba(2,6,23,0.62)", color: error ? "#F87171" : "#E5E7EB",
          padding: "8px 10px", fontFamily: "JetBrains Mono, monospace", fontSize: 11, outline: "none",
        }}
      />
      <div style={{ display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: 5 }}>
        {[Math.PI / 4, Math.PI / 2, Math.PI, 2 * Math.PI].map((v) => (
          <button key={v} type="button" onClick={() => onChange(v)}
            style={{
              borderRadius: 9, border: "1px solid rgba(34,211,238,0.22)",
              background: Math.abs(theta - v) < 0.001 ? "rgba(34,211,238,0.18)" : "rgba(15,23,42,0.72)",
              color: "#67E8F9", padding: "5px 0",
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
    <div style={{ borderTop: "1px solid rgba(148,163,184,0.16)", marginTop: 2, paddingTop: 12, display: "grid", gap: 8 }}>
      <div style={{ fontFamily: "JetBrains Mono, monospace", fontSize: 9, color: "#9CA3AF", textTransform: "uppercase", letterSpacing: "0.08em" }}>
        Connection Defaults
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 6 }}>
        {labels.map(([label, value, onChange]) => (
          <label key={label} style={{ display: "grid", gap: 4 }}>
            <span style={{ fontFamily: "JetBrains Mono, monospace", fontSize: 9, color: "#9CA3AF" }}>{label}</span>
            <select
              value={value}
              onChange={(e) => onChange(Number(e.target.value))}
              style={{ borderRadius: 9, border: "1px solid rgba(148,163,184,0.18)", background: "rgba(2,6,23,0.62)", color: "#E5E7EB", padding: "7px 8px", fontFamily: "JetBrains Mono, monospace", fontSize: 10 }}>
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
  const [collapsedSections, setCollapsedSections] = useState<Record<string, boolean>>({});

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
    <motion.aside
      initial={{ opacity: 0, x: -12 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{ duration: 0.35, ease: "easeOut" }}
      style={{
      width: 280, minWidth: 280, maxWidth: 280,
      borderRadius: 16, border: "1px solid rgba(148,163,184,0.16)",
      background: "linear-gradient(180deg, rgba(15,23,42,0.82), rgba(8,13,27,0.82))", padding: 16,
      display: "flex", flexDirection: "column", gap: 14,
      /* Cap height and allow internal scroll so palette never pushes layout */
      maxHeight: "calc(100vh - 160px)",
      overflowY: "auto",
      boxShadow: "inset 0 1px 0 rgba(255,255,255,0.04), 0 22px 54px rgba(0,0,0,0.28)",
    }}>
      {/* Header */}
      <div>
        <h3 style={{ margin: 0, fontFamily: "Syne, sans-serif", fontSize: 16, fontWeight: 700, color: "#E5E7EB" }}>Gate Palette</h3>
        <p style={{ margin: "4px 0 0", fontFamily: "JetBrains Mono, monospace", fontSize: 9, color: "#9CA3AF", lineHeight: 1.5 }}>
          Drag to circuit or click to select, then click a pivot.
        </p>
      </div>

      {/* Status hint */}
      <div style={{
        borderRadius: 12, border: "1px solid rgba(34,211,238,0.18)", background: "rgba(34,211,238,0.08)",
        padding: "8px 10px", fontFamily: "JetBrains Mono, monospace", fontSize: 9, color: "#BAE6FD", lineHeight: 1.5,
      }}>
        {selectedSummary}
      </div>

      {/* Gate sections */}
      <div style={{ display: "grid", gap: 14 }}>
        {PALETTE_SECTIONS.map((section) => (
          <section key={section.title} style={{ display: "grid", gap: 6 }}>
            {/* Category label with colour accent */}
            <button
              type="button"
              onClick={() => setCollapsedSections((cur) => ({ ...cur, [section.title]: !cur[section.title] }))}
              style={{
                display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8,
                fontFamily: "JetBrains Mono, monospace", fontSize: 9,
                color: "#9CA3AF", textTransform: "uppercase", letterSpacing: "0.08em",
                background: "transparent", border: "none", padding: 0, cursor: "pointer",
              }}>
              <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
                <span style={{ width: 7, height: 7, borderRadius: "50%", background: section.color, flexShrink: 0, boxShadow: `0 0 14px ${section.color}` }} />
                {section.title}
              </span>
              <span style={{ color: section.color }}>{collapsedSections[section.title] ? "+" : "-"}</span>
            </button>

            {/* 4-column gate grid */}
            <AnimatePresence initial={false}>
              {!collapsedSections[section.title] && (
                <motion.div
                  initial={{ height: 0, opacity: 0 }}
                  animate={{ height: "auto", opacity: 1 }}
                  exit={{ height: 0, opacity: 0 }}
                  transition={{ duration: 0.2, ease: "easeOut" }}
                  style={{ overflow: "hidden" }}
                >
                  <div style={{ display: "grid", gridTemplateColumns: "repeat(4, minmax(0,1fr))", gap: 5, paddingTop: 1 }}>
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
                </motion.div>
              )}
            </AnimatePresence>
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
    </motion.aside>
  );
});

export default GatePalette;
