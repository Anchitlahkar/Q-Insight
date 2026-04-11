"use client";

import { useCallback, useMemo, useState } from "react";
import { CircuitJsonEditor } from "./CircuitJsonEditor";
import { CircuitExplainer } from "./CircuitExplainer";
import { GatePalette } from "./GatePalette";
import { WebSocketStatusBadge } from "./WebSocketStatusBadge";
import { useWebSocket } from "@/hooks/useWebSocket";
import {
  calculateMetrics,
  expandCircuit,
  getClassicalBitProbabilities,
  getMeasurementMap,
  getOperationQubits,
  serializeCircuit,
} from "@/lib/circuit";
import { webSocketUrl } from "@/lib/env";
import {
  GATE_COLOR,
  GateType,
  formatTheta,
  getDefaultTheta,
  isComponentType,
  isMeasureGate,
  isParametricGate,
  isTwoQubitGate,
} from "@/lib/gates";
import { AlgorithmDefinition, CircuitKey, GateOperation } from "@/lib/types";
import { useCircuitStore } from "@/store/useCircuitStore";
import { useVisualizationStore } from "@/store/useVisualizationStore";

// ─── Design tokens ─────────────────────────────────────────────────────────────
const T = {
  bg: "#f0f4ff",
  surface: "#ffffff",
  canvasBg: "#fafbff",
  labelBg: "#f5f7ff",
  border: "#dde3f5",
  borderMid: "#c7d2fe",
  text: "#1e293b",
  textMid: "#475569",
  textMuted: "#94a3b8",
  indigo: "#4f46e5",
  indigoBg: "#eef2ff",
  violet: "#7c3aed",
  violetBg: "#f5f3ff",
  emerald: "#059669",
  emeraldBg: "#ecfdf5",
  amber: "#d97706",
  amberBg: "#fffbeb",
  rose: "#e11d48",
  roseBg: "#fff1f2",
  teal: "#0d9488",
  tealBg: "#f0fdfa",
  sky: "#0284c7",
  wire: "#6366f1",
  fontMono: "JetBrains Mono, ui-monospace, monospace",
  fontDisplay: "Syne, ui-sans-serif, sans-serif",
};

// ─── Layout constants ─────────────────────────────────────────────────────────
const COL_W = 72;
const LANE_H = 72;
const TOP_PAD = 28;
const BOT_PAD = 110;
const GATE_W = 48;
const GATE_H = 38;
const PIVOT_R = 7;
const MIN_COLS = 10;
const MAX_QUBITS = 6;
const LABEL_COL_W = 72;

const wireY = (q: number) => TOP_PAD + q * LANE_H + LANE_H / 2;
const colX = (c: number) => c * COL_W + COL_W / 2;
const gateColumn = (g: GateOperation) => Math.max(0, Math.round(g.position.x / COL_W));

type PreviewItem =
  | { kind: "gate"; gateType: GateType }
  | { kind: "component"; algorithm: AlgorithmDefinition }
  | null;

function parseDropPayload(raw: string | null) {
  if (!raw) return null;
  try { return JSON.parse(raw) as { entity: "gate"; gateType: GateType } | { entity: "component"; algorithm: AlgorithmDefinition }; }
  catch { return null; }
}

function createGateOperation(input: {
  type: GateType; qubit: number; column: number; control?: number; theta?: number;
}): GateOperation {
  return {
    id: `${input.type.toLowerCase()}-${Date.now()}-${Math.floor(Math.random() * 10000)}`,
    type: input.type, target: input.qubit,
    ...(input.control !== undefined ? { control: input.control } : {}),
    ...(input.theta !== undefined ? { theta: input.theta } : {}),
    ...(input.type === "M" ? { classicalTarget: input.qubit } : {}),
    position: { x: input.column * COL_W, y: input.qubit * LANE_H },
  };
}

function createComponentOperation(alg: AlgorithmDefinition, startQubit: number, column: number): GateOperation {
  return {
    id: `component-${alg.id}-${Date.now()}`,
    type: "COMPONENT", target: startQubit,
    qubits: Array.from({ length: alg.qubits }, (_, i) => startQubit + i),
    label: alg.name, category: alg.category, internalCircuit: alg.gates,
    position: { x: column * COL_W, y: startQubit * LANE_H },
  };
}

// ─── Metric card ──────────────────────────────────────────────────────────────
function MetricCard({ label, value, color }: { label: string; value: string | number; color: string }) {
  return (
    <div style={{
      borderRadius: 10, border: `1.5px solid ${T.border}`,
      background: T.surface, padding: "12px 14px",
      position: "relative" as const, overflow: "hidden",
    }}>
      <div style={{
        position: "absolute" as const, top: 0, left: 0, right: 0,
        height: 3, background: color, borderRadius: "10px 10px 0 0",
      }} />
      <div style={{ fontFamily: T.fontMono, fontSize: 9, color: T.textMuted, textTransform: "uppercase" as const, letterSpacing: "0.16em", marginBottom: 5, marginTop: 3 }}>
        {label}
      </div>
      <div style={{ fontFamily: T.fontDisplay, fontSize: 26, fontWeight: 800, color, lineHeight: 1 }}>
        {value}
      </div>
    </div>
  );
}

// ─── Probability meter ────────────────────────────────────────────────────────
function ProbabilityMeter({ circuit, counts }: {
  circuit: { qubits: number; gates: GateOperation[] };
  counts: Record<string, number> | null;
}) {
  const measurementMap = useMemo(() => getMeasurementMap(circuit), [circuit]);
  const orderedBits = useMemo(() => Array.from(measurementMap.values()).sort((a, b) => a.classicalBit - b.classicalBit), [measurementMap]);
  const probabilities = useMemo(
    () => counts ? getClassicalBitProbabilities(counts, orderedBits.length ? Math.max(...orderedBits.map((e) => e.classicalBit)) + 1 : 0) : [],
    [counts, orderedBits],
  );

  if (!orderedBits.length) {
    return (
      <div style={{
        border: `1.5px dashed ${T.border}`, borderRadius: 10, background: T.surface,
        padding: "12px 14px", fontFamily: T.fontMono, fontSize: 10, color: T.textMuted,
      }}>
        Add measurement gates to reveal classical registers.
      </div>
    );
  }

  const cols = [T.indigo, T.violet, T.emerald, T.amber, T.rose, T.teal];
  return (
    <div style={{ border: `1.5px solid ${T.border}`, borderRadius: 10, background: T.surface, padding: "12px 14px", display: "grid", gap: 8 }}>
      <div style={{ fontFamily: T.fontMono, fontSize: 9, color: T.indigo, textTransform: "uppercase" as const, letterSpacing: "0.16em", fontWeight: 700 }}>
        Probability Meter
      </div>
      {orderedBits.map(({ classicalBit }) => {
        const p = probabilities.find((e) => e.classicalBit === classicalBit)?.oneProbability ?? 0;
        const c = cols[classicalBit % cols.length];
        return (
          <div key={classicalBit} style={{ display: "grid", gridTemplateColumns: "36px 1fr 44px", gap: 8, alignItems: "center" }}>
            <span style={{ fontFamily: T.fontMono, fontSize: 11, fontWeight: 700, color: c }}>C{classicalBit}</span>
            <div style={{ height: 8, borderRadius: 999, background: T.bg, overflow: "hidden", border: `1px solid ${T.border}` }}>
              <div style={{ width: `${p * 100}%`, height: "100%", background: c, transition: "width 0.4s", borderRadius: 999 }} />
            </div>
            <span style={{ fontFamily: T.fontMono, fontSize: 11, fontWeight: 700, color: c, textAlign: "right" as const }}>{p.toFixed(2)}</span>
          </div>
        );
      })}
    </div>
  );
}

// ─── Gate renderer ────────────────────────────────────────────────────────────
function OperationRenderer({ gate, active }: { gate: GateOperation; active: boolean }) {
  const x = colX(gateColumn(gate));
  const color = GATE_COLOR[gate.type];

  if (isComponentType(gate.type)) {
    const qubits = gate.qubits ?? [gate.target];
    const top = wireY(Math.min(...qubits)) - GATE_H / 2;
    const bottom = wireY(Math.max(...qubits)) + GATE_H / 2;
    return (
      <g>
        <rect x={x - GATE_W / 2} y={top} width={GATE_W} height={bottom - top} rx={12}
          fill={active ? T.indigoBg : "#f8f9ff"} stroke={T.indigo} strokeWidth={active ? 2.5 : 1.5} />
        <text x={x} y={(top + bottom) / 2} textAnchor="middle" dominantBaseline="middle"
          fontFamily={T.fontMono} fontSize="10" fontWeight="700" fill={T.indigo}>
          [{(gate.label ?? "COMP").toUpperCase()}]
        </text>
      </g>
    );
  }

  const ty = wireY(gate.target);
  if (["CNOT", "CZ", "SWAP", "CRX", "CRY", "CRZ"].includes(gate.type)) {
    const cy = wireY(gate.control ?? gate.target);
    return (
      <g>
        <line x1={x} y1={Math.min(cy, ty)} x2={x} y2={Math.max(cy, ty)} stroke={color} strokeWidth={active ? 2.5 : 1.5} />
        {gate.type === "SWAP" ? (
          <>{[cy, ty].map((y) => (<g key={y}><line x1={x - 9} y1={y - 9} x2={x + 9} y2={y + 9} stroke={color} strokeWidth={2} /><line x1={x + 9} y1={y - 9} x2={x - 9} y2={y + 9} stroke={color} strokeWidth={2} /></g>))}</>
        ) : (
          <>
            <circle cx={x} cy={cy} r={6} fill={color} />
            {gate.type === "CNOT" ? (
              <>
                <circle cx={x} cy={ty} r={16} fill={T.surface} stroke={color} strokeWidth={2} />
                <line x1={x - 11} y1={ty} x2={x + 11} y2={ty} stroke={color} strokeWidth={2} />
                <line x1={x} y1={ty - 11} x2={x} y2={ty + 11} stroke={color} strokeWidth={2} />
              </>
            ) : gate.type === "CZ" ? (
              <circle cx={x} cy={ty} r={6} fill={color} />
            ) : (
              <>
                <rect x={x - GATE_W / 2} y={ty - GATE_H / 2} width={GATE_W} height={GATE_H} rx={10} fill={T.surface} stroke={color} strokeWidth={2} />
                <text x={x} y={ty} textAnchor="middle" dominantBaseline="middle" fontFamily={T.fontDisplay} fontSize="12" fontWeight="700" fill={color}>{gate.type}</text>
              </>
            )}
          </>
        )}
      </g>
    );
  }

  return (
    <g>
      <rect x={x - GATE_W / 2} y={ty - GATE_H / 2} width={GATE_W} height={GATE_H} rx={10}
        fill={active ? T.indigoBg : T.surface} stroke={color} strokeWidth={active ? 2.5 : 1.5} />
      {isMeasureGate(gate.type) ? (
        <>
          <path d={`M ${x - 10} ${ty + 5} A 10 10 0 0 1 ${x + 10} ${ty + 5}`} stroke={color} strokeWidth="2" fill="none" />
          <line x1={x} y1={ty + 5} x2={x + 10} y2={ty - 6} stroke={color} strokeWidth="2" />
        </>
      ) : (
        <>
          <text x={x} y={ty - (isParametricGate(gate.type) ? 5 : 0)} textAnchor="middle" dominantBaseline="middle"
            fontFamily={T.fontDisplay} fontSize="13" fontWeight="800" fill={color}>{gate.type}</text>
          {isParametricGate(gate.type) && gate.theta !== undefined && (
            <text x={x} y={ty + 11} textAnchor="middle" dominantBaseline="middle"
              fontFamily={T.fontMono} fontSize="8" fill={T.textMuted}>{formatTheta(gate.theta)}</text>
          )}
        </>
      )}
    </g>
  );
}

// ─── Ghost preview ────────────────────────────────────────────────────────────
function GhostPreview({ preview, qubit, column }: { preview: PreviewItem; qubit: number; column: number }) {
  if (!preview) return null;
  const x = colX(column);
  if (preview.kind === "component") {
    const top = wireY(qubit) - GATE_H / 2;
    const bottom = wireY(qubit + preview.algorithm.qubits - 1) + GATE_H / 2;
    return (
      <g opacity="0.5" style={{ pointerEvents: "none" }}>
        <rect x={x - GATE_W / 2} y={top} width={GATE_W} height={bottom - top} rx={14}
          fill={T.indigoBg} stroke={T.indigo} strokeWidth={2} strokeDasharray="6 4" />
        <text x={x} y={(top + bottom) / 2} textAnchor="middle" dominantBaseline="middle"
          fontFamily={T.fontMono} fontSize="10" fill={T.indigo}>
          [{preview.algorithm.name.slice(0, 8).toUpperCase()}]
        </text>
      </g>
    );
  }
  const color = GATE_COLOR[preview.gateType];
  const y = wireY(qubit);
  return (
    <g opacity="0.55" style={{ pointerEvents: "none" }}>
      <rect x={x - GATE_W / 2} y={y - GATE_H / 2} width={GATE_W} height={GATE_H}
        rx={10} fill={T.surface} stroke={color} strokeWidth={2} strokeDasharray="6 4" />
      <text x={x} y={y} textAnchor="middle" dominantBaseline="middle"
        fontFamily={T.fontDisplay} fontSize="12" fontWeight="700" fill={color}>
        {preview.gateType === "CNOT" ? "CX" : preview.gateType}
      </text>
    </g>
  );
}

// ─── Sticky qubit labels ──────────────────────────────────────────────────────
function StickyLabelColumn({ qubits, svgHeight }: { qubits: number; svgHeight: number }) {
  return (
    <svg width={LABEL_COL_W} height={svgHeight}
      style={{ display: "block", flexShrink: 0, borderRight: `1.5px solid ${T.border}` }}>
      <rect width={LABEL_COL_W} height={svgHeight} fill={T.labelBg} />
      {Array.from({ length: qubits }, (_, q) => {
        const y = wireY(q);
        return (
          <g key={`lq${q}`}>
            <line x1={LABEL_COL_W - 6} y1={y} x2={LABEL_COL_W} y2={y} stroke={T.wire} strokeWidth="2" />
            <rect x={6} y={y - 13} width={52} height={26} rx={7} fill={T.indigoBg} stroke={T.borderMid} strokeWidth="1.5" />
            <text x={32} y={y} textAnchor="middle" dominantBaseline="middle"
              fontFamily={T.fontMono} fontSize="12" fontWeight="700" fill={T.indigo}>
              q[{q}]
            </text>
          </g>
        );
      })}
      {Array.from({ length: qubits }, (_, q) => {
        const y = TOP_PAD + qubits * LANE_H + 34 + q * 18;
        return (
          <text key={`lc${q}`} x={LABEL_COL_W - 10} y={y} textAnchor="end" dominantBaseline="middle"
            fontFamily={T.fontMono} fontSize="10" fill={T.textMuted}>c[{q}]</text>
        );
      })}
    </svg>
  );
}

// ─── Circuit SVG canvas ───────────────────────────────────────────────────────
function CircuitSVG(props: {
  circuit: { qubits: number; gates: GateOperation[] };
  selectedGate: GateType | null;
  previewItem: PreviewItem;
  activeOperationId: string | null;
  dragOverKey: string | null;
  connectionDraft: { gateType: GateType; controlQubit: number; column: number; previewQubit: number } | null;
  zoom: number;
  onPivotHover: (qubit: number, column: number, payloadRaw?: string | null) => void;
  onPivotLeave: () => void;
  onPivotClick: (qubit: number, column: number) => void;
  onPivotDrop: (qubit: number, column: number, payload: string | null) => void;
  onDeleteOperation: (id: string) => void;
}) {
  const { circuit, selectedGate, previewItem, activeOperationId, dragOverKey, connectionDraft, zoom,
    onPivotHover, onPivotLeave, onPivotClick, onPivotDrop, onDeleteOperation } = props;

  const maxUsedCol = useMemo(() => circuit.gates.reduce((m, g) => Math.max(m, gateColumn(g)), -1), [circuit.gates]);
  const numCols = Math.max(MIN_COLS, maxUsedCol + 4);
  const svgWidth = numCols * COL_W + 48;
  const svgHeight = TOP_PAD + circuit.qubits * LANE_H + BOT_PAD;

  const measurementMap = useMemo(() => getMeasurementMap(circuit), [circuit]);
  const occupied = useMemo(() => {
    const map = new Map<string, string>();
    circuit.gates.forEach((g) => { const col = gateColumn(g); getOperationQubits(g).forEach((q) => map.set(`${q}-${col}`, g.id)); });
    return map;
  }, [circuit.gates]);

  return (
    <div style={{
      display: "flex", alignItems: "stretch", overflow: "hidden",
      borderRadius: 12, border: `1.5px solid ${T.border}`,
      background: T.surface, boxShadow: "0 2px 12px rgba(99,102,241,0.07)",
    }}>
      <StickyLabelColumn qubits={circuit.qubits} svgHeight={svgHeight} />
      <div style={{ overflowX: "auto", overflowY: "hidden", flex: 1 }}>
        <div style={{ transform: `scale(${zoom})`, transformOrigin: "top left", width: svgWidth * zoom, height: svgHeight * zoom }}>
          <svg width={svgWidth} height={svgHeight} style={{ display: "block" }}>
            <rect width={svgWidth} height={svgHeight} fill={T.canvasBg} />

            {/* Alternating column bands */}
            {Array.from({ length: numCols }, (_, col) => (
              <rect key={`band-${col}`} x={col * COL_W} y={0} width={COL_W}
                height={TOP_PAD + circuit.qubits * LANE_H + 22}
                fill={col % 2 === 0 ? "#fafbff" : "#f5f7ff"} />
            ))}

            {/* Column lines */}
            {Array.from({ length: numCols }, (_, col) => (
              <line key={`col-${col}`} x1={col * COL_W} y1={TOP_PAD - 10}
                x2={col * COL_W} y2={TOP_PAD + circuit.qubits * LANE_H + 22}
                stroke={T.border} strokeWidth="1" />
            ))}

            {/* Quantum wires */}
            {Array.from({ length: circuit.qubits }, (_, q) => {
              const y = wireY(q);
              const meas = measurementMap.get(q);
              const endX = colX(meas ? meas.column : numCols - 1) + COL_W / 2;
              return <line key={`wire-${q}`} x1={0} y1={y} x2={endX} y2={y} stroke={T.wire} strokeWidth="2" />;
            })}

            {/* Classical wires */}
            {Array.from({ length: circuit.qubits }, (_, q) => {
              const y = TOP_PAD + circuit.qubits * LANE_H + 34 + q * 18;
              return <line key={`cw-${q}`} x1={0} y1={y} x2={svgWidth - 24} y2={y} stroke={T.borderMid} strokeDasharray="5 4" strokeWidth="1.5" />;
            })}

            {/* Pivot dots */}
            {Array.from({ length: circuit.qubits }, (_, q) =>
              Array.from({ length: numCols }, (_, col) => {
                const key = `${q}-${col}`;
                const over = dragOverKey === key;
                return (
                  <circle key={`pv-${key}`} cx={colX(col)} cy={wireY(q)} r={PIVOT_R}
                    fill={over ? T.indigoBg : selectedGate ? "#eef2ff" : T.surface}
                    stroke={over ? T.indigo : T.borderMid} strokeWidth={over ? 2 : 1.5}
                    style={{ cursor: "pointer" }}
                    onMouseEnter={() => onPivotHover(q, col)}
                    onMouseLeave={onPivotLeave}
                    onClick={() => onPivotClick(q, col)}
                    onDragOver={(e) => { e.preventDefault(); onPivotHover(q, col, e.dataTransfer.getData("application/x-qhack-operation")); }}
                    onDrop={(e) => { e.preventDefault(); onPivotDrop(q, col, e.dataTransfer.getData("application/x-qhack-operation")); }}
                  />
                );
              })
            )}

            {/* Ghost */}
            {dragOverKey ? (() => { const [pq, pc] = dragOverKey.split("-").map(Number); return <GhostPreview preview={previewItem} qubit={pq} column={pc} />; })() : null}

            {/* Draft connection line */}
            {connectionDraft && (
              <line x1={colX(connectionDraft.column)} y1={wireY(connectionDraft.controlQubit)}
                x2={colX(connectionDraft.column)} y2={wireY(connectionDraft.previewQubit)}
                stroke={GATE_COLOR[connectionDraft.gateType]} strokeWidth="2.5" strokeDasharray="5 4" />
            )}

            {/* Gates */}
            {circuit.gates.map((gate) => {
              const meas = isMeasureGate(gate.type) ? measurementMap.get(gate.target) : null;
              return (
                <g key={gate.id}>
                  <g onClick={() => onDeleteOperation(gate.id)} style={{ cursor: "pointer" }}>
                    <OperationRenderer gate={gate} active={activeOperationId === gate.id} />
                  </g>
                  {meas && (
                    <line x1={colX(meas.column)} y1={wireY(gate.target) + GATE_H / 2}
                      x2={colX(meas.column)} y2={TOP_PAD + circuit.qubits * LANE_H + 34 + meas.classicalBit * 18}
                      stroke={T.textMuted} strokeWidth="1.5" strokeDasharray="5 4" />
                  )}
                </g>
              );
            })}

            {/* Ticks */}
            {Array.from({ length: numCols }, (_, col) => (
              <text key={`tick-${col}`} x={colX(col)} y={TOP_PAD + circuit.qubits * LANE_H + 16}
                textAnchor="middle" fontFamily={T.fontMono} fontSize="10" fill={T.textMuted}>{col + 1}</text>
            ))}
          </svg>
        </div>
      </div>
    </div>
  );
}

// ─── Zoom bar ─────────────────────────────────────────────────────────────────
function ZoomBar({ zoom, onChange }: { zoom: number; onChange: (z: number) => void }) {
  const levels = [0.5, 0.75, 1, 1.25, 1.5];
  const base: React.CSSProperties = {
    borderRadius: 6, border: `1.5px solid ${T.border}`, background: T.surface,
    color: T.text, fontFamily: T.fontMono, fontSize: 11, cursor: "pointer", padding: "4px 10px",
  };
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 5 }}>
      <button type="button" onClick={() => onChange(Math.max(0.5, zoom - 0.25))} style={base}>−</button>
      <span style={{ fontFamily: T.fontMono, fontSize: 10, color: T.textMuted, minWidth: 36, textAlign: "center" as const }}>{Math.round(zoom * 100)}%</span>
      <button type="button" onClick={() => onChange(Math.min(1.5, zoom + 0.25))} style={base}>+</button>
      <div style={{ display: "flex", gap: 3 }}>
        {levels.map((l) => (
          <button key={l} type="button" onClick={() => onChange(l)} style={{
            ...base, fontSize: 9, padding: "3px 7px",
            background: zoom === l ? T.indigoBg : T.surface,
            color: zoom === l ? T.indigo : T.textMuted,
            border: `1.5px solid ${zoom === l ? T.indigo : T.border}`,
            fontWeight: zoom === l ? 700 : 400,
          }}>{Math.round(l * 100)}%</button>
        ))}
      </div>
    </div>
  );
}

// ─── Toolbar button ───────────────────────────────────────────────────────────
function TopBtn({ children, onClick, color, bg, border }: {
  children: React.ReactNode; onClick?: () => void;
  color: string; bg: string; border: string;
}) {
  return (
    <button type="button" onClick={onClick} style={{
      borderRadius: 8, border: `1.5px solid ${border}`, background: bg, color,
      padding: "7px 18px", fontFamily: T.fontMono, fontSize: 11, fontWeight: 700,
      cursor: "pointer", letterSpacing: "0.04em", transition: "all 0.15s",
      whiteSpace: "nowrap" as const,
    }}>{children}</button>
  );
}

// ─── Main export ──────────────────────────────────────────────────────────────
export default function CircuitBuilder() {
  const [selectedGate, setSelectedGate] = useState<GateType | null>(null);
  const [controlQubit, setControlQubit] = useState(0);
  const [targetQubit, setTargetQubit] = useState(1);
  const [theta, setTheta] = useState(Math.PI / 2);
  const [dragOverKey, setDragOverKey] = useState<string | null>(null);
  const [previewItem, setPreviewItem] = useState<PreviewItem>(null);
  const [connectionDraft, setConnectionDraft] = useState<{ gateType: GateType; controlQubit: number; column: number; previewQubit: number } | null>(null);
  const [zoom, setZoom] = useState(1);
  const [explainerCollapsed, setExplainerCollapsed] = useState(false);
  const [highlightedGateIdx, setHighlightedGateIdx] = useState<number | null>(null);

  const activeCircuit = useCircuitStore((s) => s.activeCircuit);
  const circuit = useCircuitStore((s) => s.circuits[s.activeCircuit]);
  const results = useCircuitStore((s) => s.results);
  const setActiveCircuit = useCircuitStore((s) => s.setActiveCircuit);
  const setQubitCount = useCircuitStore((s) => s.setQubitCount);
  const addGate = useCircuitStore((s) => s.addGate);
  const removeGate = useCircuitStore((s) => s.removeGate);
  const setResult = useCircuitStore((s) => s.setResult);
  const setSocketError = useCircuitStore((s) => s.setSocketError);
  const setIsRunning = useCircuitStore((s) => s.setIsRunning);
  const loadMockData = useCircuitStore((s) => s.loadMockData);

  const currentStep = useVisualizationStore((s) => s.currentStep);
  const { status, error, reconnect, simulateCircuit } = useWebSocket(webSocketUrl);

  const expandedGates = useMemo(() => expandCircuit(circuit), [circuit]);
  const activeOperationId = currentStep >= 0
    ? expandedGates[currentStep]?.sourceOperationId ?? null
    : highlightedGateIdx !== null ? expandedGates[highlightedGateIdx]?.sourceOperationId ?? null : null;
  const metrics = useMemo(() => calculateMetrics(circuit), [circuit]);
  const measurementMap = useMemo(() => getMeasurementMap(circuit), [circuit]);

  const canOccupy = useCallback((qubits: number[], column: number) =>
    qubits.every((q) => {
      const meas = measurementMap.get(q);
      return !(meas && column > meas.column) && !circuit.gates.some((g) => gateColumn(g) === column && getOperationQubits(g).includes(q));
    }), [circuit.gates, measurementMap]);

  const placeOperation = useCallback((op:
    | { kind: "gate"; type: GateType; qubit: number; column: number; control?: number; theta?: number }
    | { kind: "component"; algorithm: AlgorithmDefinition; startQubit: number; column: number }
  ) => {
    if (op.kind === "component") {
      const req = op.startQubit + op.algorithm.qubits;
      if (req > MAX_QUBITS) return;
      if (req > circuit.qubits) setQubitCount(activeCircuit, req);
      if (!canOccupy(Array.from({ length: op.algorithm.qubits }, (_, i) => op.startQubit + i), op.column)) return;
      addGate(activeCircuit, createComponentOperation(op.algorithm, op.startQubit, op.column));
      return;
    }
    const touched = [op.qubit, ...(op.control !== undefined ? [op.control] : [])];
    if (!canOccupy(touched, op.column)) return;
    addGate(activeCircuit, createGateOperation(op));
  }, [activeCircuit, addGate, canOccupy, circuit.qubits, setQubitCount]);

  const handleSelectGate = useCallback((type: GateType | null) => {
    setSelectedGate(type);
    if (type && isParametricGate(type)) setTheta(getDefaultTheta(type));
    setConnectionDraft(null);
    setPreviewItem(type ? { kind: "gate", gateType: type } : null);
  }, []);

  const handlePivotClick = useCallback((qubit: number, column: number) => {
    if (!selectedGate) return;
    if (isTwoQubitGate(selectedGate)) {
      if (!connectionDraft) { setConnectionDraft({ gateType: selectedGate, controlQubit: qubit, column, previewQubit: qubit }); return; }
      if (connectionDraft.controlQubit !== qubit) {
        placeOperation({ kind: "gate", type: connectionDraft.gateType, qubit, column: connectionDraft.column, control: connectionDraft.controlQubit, theta: isParametricGate(connectionDraft.gateType) ? theta : undefined });
      }
      setConnectionDraft(null); return;
    }
    placeOperation({ kind: "gate", type: selectedGate, qubit, column, theta: isParametricGate(selectedGate) ? theta : undefined });
  }, [connectionDraft, placeOperation, selectedGate, theta]);

  const handlePivotDrop = useCallback((qubit: number, column: number, payloadRaw: string | null) => {
    setDragOverKey(null);
    const payload = parseDropPayload(payloadRaw);
    if (!payload) return;
    if (payload.entity === "gate") {
      if (isTwoQubitGate(payload.gateType)) {
        const control = controlQubit === qubit ? targetQubit : controlQubit;
        placeOperation({ kind: "gate", type: payload.gateType, qubit: control === qubit ? targetQubit : qubit, column, control, theta: isParametricGate(payload.gateType) ? theta : undefined });
      } else {
        placeOperation({ kind: "gate", type: payload.gateType, qubit, column, theta: isParametricGate(payload.gateType) ? theta : undefined });
      }
      setSelectedGate(payload.gateType);
      setPreviewItem({ kind: "gate", gateType: payload.gateType });
      return;
    }
    setPreviewItem(null);
    placeOperation({ kind: "component", algorithm: payload.algorithm, startQubit: qubit, column });
  }, [controlQubit, placeOperation, targetQubit, theta]);

  const runSingleCircuit = useCallback(async (key: CircuitKey) => {
    const cur = useCircuitStore.getState().circuits[key];
    const compareKey: CircuitKey = key === "A" ? "B" : "A";
    try {
      setSocketError(null); setIsRunning(true); setHighlightedGateIdx(null);
      setResult(key, await simulateCircuit({ ...serializeCircuit(cur), compare_to: serializeCircuit(useCircuitStore.getState().circuits[compareKey]) }));
    } catch (err) {
      setSocketError(err instanceof Error ? err.message : "Simulation failed.");
    } finally { setIsRunning(false); }
  }, [setIsRunning, setResult, setSocketError, simulateCircuit]);

  return (
    <section style={{
      background: T.bg, borderRadius: 16, border: `1.5px solid ${T.border}`,
      boxShadow: "0 4px 32px rgba(99,102,241,0.10)", overflow: "hidden",
      display: "flex", flexDirection: "column" as const,
      minHeight: "100vh",
    }}>

      {/* ── Top toolbar ── */}
      <div style={{
        display: "flex", alignItems: "center", padding: "12px 20px",
        background: T.surface, borderBottom: `1.5px solid ${T.border}`,
        gap: 10, flexWrap: "wrap" as const,
      }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <h2 style={{ margin: 0, fontFamily: T.fontDisplay, fontSize: 20, fontWeight: 800, color: T.text, letterSpacing: "-0.02em" }}>
            Circuit Builder
          </h2>
          <p style={{ margin: 0, fontFamily: T.fontMono, fontSize: 10, color: T.textMuted, marginTop: 2 }}>
            {selectedGate
              ? isTwoQubitGate(selectedGate) ? `${selectedGate} · connect two pivots` : `${selectedGate} selected · click or drop onto a pivot`
              : "Select a gate, click a wire to place, and click a gate to delete"}
          </p>
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" as const }}>
          {(["A", "B"] as CircuitKey[]).map((key) => (
            <TopBtn key={key} onClick={() => setActiveCircuit(key)}
              color={activeCircuit === key ? T.indigo : T.textMid}
              bg={activeCircuit === key ? T.indigoBg : T.surface}
              border={activeCircuit === key ? T.indigo : T.border}>
              Circuit {key}
            </TopBtn>
          ))}
          <div style={{ width: 1, height: 22, background: T.border }} />
          <TopBtn onClick={() => void runSingleCircuit(activeCircuit)} color="#fff" bg={T.indigo} border={T.indigo}>
            ▶ Run {activeCircuit}
          </TopBtn>
          <TopBtn onClick={() => { void runSingleCircuit("A"); void runSingleCircuit("B"); }}
            color={T.violet} bg={T.violetBg} border={T.violet}>A vs B</TopBtn>
          <TopBtn onClick={loadMockData} color={T.textMid} bg={T.surface} border={T.border}>Load Mock</TopBtn>
          <div style={{ width: 1, height: 22, background: T.border }} />
          <label style={{ display: "flex", alignItems: "center", gap: 6, fontFamily: T.fontMono, fontSize: 10, color: T.textMuted, textTransform: "uppercase" as const, letterSpacing: "0.1em" }}>
            Qubits
            <select value={circuit.qubits} onChange={(e) => setQubitCount(activeCircuit, Number(e.target.value))}
              style={{ borderRadius: 7, border: `1.5px solid ${T.border}`, background: T.surface, color: T.text, padding: "5px 8px", fontFamily: T.fontMono, fontSize: 11, fontWeight: 700 }}>
              {Array.from({ length: MAX_QUBITS - 1 }, (_, i) => i + 2).map((n) => <option key={n} value={n}>{n}</option>)}
            </select>
          </label>
          <WebSocketStatusBadge status={status as never} message={error ?? null} latencyMs={null} />
          <button type="button" onClick={reconnect} style={{ borderRadius: 7, border: `1.5px solid ${T.border}`, background: T.surface, color: T.textMid, padding: "6px 12px", fontFamily: T.fontMono, fontSize: 10, cursor: "pointer" }}>
            reconnect
          </button>
        </div>
      </div>

      {/* ── Body: three columns ── */}
      <div style={{ display: "flex", flex: 1, minHeight: 0, overflow: "hidden" }}>

        {/* Left: Gate Palette — fixed width, scrollable */}
        <div style={{ width: 252, flexShrink: 0, borderRight: `1.5px solid ${T.border}`, background: T.surface, overflowY: "auto" as const }}>
          <GatePalette
            selected={selectedGate}
            controlQubit={controlQubit}
            targetQubit={targetQubit}
            theta={theta}
            qubits={circuit.qubits}
            onSelect={handleSelectGate}
            onControlChange={setControlQubit}
            onTargetChange={setTargetQubit}
            onThetaChange={setTheta}
            onDragPreviewChange={(preview) =>
              setPreviewItem(preview ? { kind: "gate", gateType: preview.gateType } : selectedGate ? { kind: "gate", gateType: selectedGate } : null)
            }
          />
        </div>

        {/* Center: Circuit canvas — grows */}
        <div style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column" as const, background: T.bg }}>
          {/* Sub-toolbar */}
          <div style={{ display: "flex", alignItems: "center", justifyContent: "flex-end", padding: "8px 14px", borderBottom: `1.5px solid ${T.border}`, background: T.surface, gap: 10 }}>
            <ZoomBar zoom={zoom} onChange={setZoom} />
          </div>
          {/* Canvas + probability meter */}
          <div style={{ flex: 1, overflowY: "auto" as const, padding: 16, display: "grid", gap: 12, alignContent: "start" }}>
            <CircuitSVG
              circuit={circuit}
              selectedGate={selectedGate}
              previewItem={previewItem}
              activeOperationId={activeOperationId}
              dragOverKey={dragOverKey}
              connectionDraft={connectionDraft}
              zoom={zoom}
              onPivotHover={(q, col, raw) => {
                setDragOverKey(`${q}-${col}`);
                setConnectionDraft((cur) => cur ? { ...cur, previewQubit: q } : cur);
                if (!raw) return;
                const payload = parseDropPayload(raw);
                if (!payload) return;
                setPreviewItem(payload.entity === "gate" ? { kind: "gate", gateType: payload.gateType } : { kind: "component", algorithm: payload.algorithm });
              }}
              onPivotLeave={() => setDragOverKey(null)}
              onPivotClick={handlePivotClick}
              onPivotDrop={handlePivotDrop}
              onDeleteOperation={(id) => removeGate(activeCircuit, id)}
            />
            <ProbabilityMeter circuit={circuit} counts={results[activeCircuit]?.counts ?? null} />

            <div style={{ padding: "0 16px 16px" }}>
              <CircuitExplainer
                collapsed={explainerCollapsed}
                onToggleCollapsed={() => setExplainerCollapsed((c) => !c)}
                highlightedGateIndex={highlightedGateIdx}
                onSelectGateExplanation={setHighlightedGateIdx}
              />
            </div>
          </div>
        </div>

        {/* Right: Inspector — fixed width, scrollable */}
        <div style={{ width: 300, flexShrink: 0, borderLeft: `1.5px solid ${T.border}`, background: T.surface, overflowY: "auto" as const, display: "flex", flexDirection: "column" as const }}>

          {/* Circuit JSON */}
          <div style={{ padding: 16, borderBottom: `1.5px solid ${T.border}` }}>
            <CircuitJsonEditor circuitKey={activeCircuit} />
          </div>

          {/* Live Summary */}
          <div style={{ padding: 16 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 14 }}>
              <div style={{ width: 4, height: 18, borderRadius: 3, background: T.indigo }} />
              <span style={{ fontFamily: T.fontDisplay, fontSize: 14, fontWeight: 700, color: T.text }}>Live Summary</span>
            </div>

            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
              <MetricCard label="Gate Count" value={metrics.gateCount} color={T.indigo} />
              <MetricCard label="Depth" value={metrics.depth} color={T.violet} />
              <MetricCard label="States · A" value={results["A"] ? Object.keys(results["A"]!.counts).length : "—"} color={T.emerald} />
              <MetricCard label="States · B" value={results["B"] ? Object.keys(results["B"]!.counts).length : "—"} color={T.amber} />
            </div>

            <div style={{ marginTop: 8, borderRadius: 10, border: `1.5px solid ${T.border}`, background: T.bg, padding: "10px 14px", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
              <span style={{ fontFamily: T.fontMono, fontSize: 9, color: T.textMuted, textTransform: "uppercase" as const, letterSpacing: "0.14em" }}>Components</span>
              <span style={{ fontFamily: T.fontDisplay, fontSize: 22, fontWeight: 800, color: T.teal }}>
                {circuit.gates.filter((g) => isComponentType(g.type)).length}
              </span>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
