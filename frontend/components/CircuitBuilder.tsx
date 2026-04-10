"use client";

import { useCallback, useMemo, useRef, useState } from "react";
import { CircuitJsonEditor } from "./CircuitJsonEditor";
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

// ─── Layout constants ─────────────────────────────────────────────────────────
const COL_W     = 72;
const LANE_H    = 72;
const LEFT_PAD  = 86;   // space for qubit labels
const TOP_PAD   = 28;
const BOT_PAD   = 110;
const GATE_W    = 48;
const GATE_H    = 38;
const PIVOT_R   = 7;
const MIN_COLS  = 10;
const MAX_QUBITS = 6;

// Width of the sticky label column rendered separately (not inside SVG scroll)
const LABEL_COL_W = 64;

const wireY     = (qubit: number)  => TOP_PAD + qubit * LANE_H + LANE_H / 2;
const colX      = (column: number) => column * COL_W + COL_W / 2;  // no LEFT_PAD — labels are outside
const gateColumn = (gate: GateOperation) => Math.max(0, Math.round(gate.position.x / COL_W));

type PreviewItem =
  | { kind: "gate"; gateType: GateType }
  | { kind: "component"; algorithm: AlgorithmDefinition }
  | null;

function parseDropPayload(raw: string | null) {
  if (!raw) return null;
  try {
    return JSON.parse(raw) as
      | { entity: "gate"; gateType: GateType }
      | { entity: "component"; algorithm: AlgorithmDefinition };
  } catch {
    return null;
  }
}

function createGateOperation(input: {
  type: GateType;
  qubit: number;
  column: number;
  control?: number;
  theta?: number;
}): GateOperation {
  return {
    id: `${input.type.toLowerCase()}-${Date.now()}-${Math.floor(Math.random() * 10000)}`,
    type: input.type,
    target: input.qubit,
    ...(input.control !== undefined ? { control: input.control } : {}),
    ...(input.theta !== undefined ? { theta: input.theta } : {}),
    ...(input.type === "M" ? { classicalTarget: input.qubit } : {}),
    position: { x: input.column * COL_W, y: input.qubit * LANE_H },
  };
}

function createComponentOperation(
  algorithm: AlgorithmDefinition,
  startQubit: number,
  column: number
): GateOperation {
  return {
    id: `component-${algorithm.id}-${Date.now()}`,
    type: "COMPONENT",
    target: startQubit,
    qubits: Array.from({ length: algorithm.qubits }, (_, i) => startQubit + i),
    label: algorithm.name,
    category: algorithm.category,
    internalCircuit: algorithm.gates,
    position: { x: column * COL_W, y: startQubit * LANE_H },
  };
}

// ─── Metric card ──────────────────────────────────────────────────────────────
function MetricCard({ label, value }: { label: string; value: string | number }) {
  return (
    <div style={{
      border: "1px solid #E5E7EB",
      borderRadius: 12,
      background: "#FFFFFF",
      padding: "12px 14px",
    }}>
      <div style={{ fontFamily: "JetBrains Mono, monospace", fontSize: 9, color: "#6B7280", textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 4 }}>{label}</div>
      <div style={{ fontFamily: "Syne, sans-serif", fontSize: 22, fontWeight: 700, color: "#0f172a" }}>{value}</div>
    </div>
  );
}

// ─── Probability meter ────────────────────────────────────────────────────────
function ProbabilityMeter({
  circuit,
  counts,
}: {
  circuit: { qubits: number; gates: GateOperation[] };
  counts: Record<string, number> | null;
}) {
  const measurementMap = useMemo(() => getMeasurementMap(circuit), [circuit]);
  const orderedBits = useMemo(
    () => Array.from(measurementMap.values()).sort((a, b) => a.classicalBit - b.classicalBit),
    [measurementMap]
  );
  const probabilities = useMemo(
    () =>
      counts
        ? getClassicalBitProbabilities(
            counts,
            orderedBits.length ? Math.max(...orderedBits.map((e) => e.classicalBit)) + 1 : 0
          )
        : [],
    [counts, orderedBits]
  );

  if (!orderedBits.length) {
    return (
      <div style={{
        border: "1px dashed #E5E7EB",
        borderRadius: 12,
        background: "#FFFFFF",
        padding: 14,
        fontFamily: "JetBrains Mono, monospace",
        fontSize: 10,
        color: "#94a3b8",
      }}>
        Add measurement gates to reveal classical registers and probability bars.
      </div>
    );
  }

  return (
    <div style={{ border: "1px solid #E5E7EB", borderRadius: 12, background: "#FFFFFF", padding: 14, display: "grid", gap: 8 }}>
      <div style={{ fontFamily: "JetBrains Mono, monospace", fontSize: 9, color: "#3B82F6", textTransform: "uppercase", letterSpacing: "0.08em", fontWeight: 600 }}>
        Probability Meter
      </div>
      {orderedBits.map(({ classicalBit }) => {
        const probability = probabilities.find((e) => e.classicalBit === classicalBit);
        const p = probability?.oneProbability ?? 0;
        return (
          <div key={classicalBit} style={{ display: "grid", gridTemplateColumns: "36px 1fr 44px", gap: 8, alignItems: "center" }}>
            <span style={{ fontFamily: "JetBrains Mono, monospace", fontSize: 11, color: "#0f172a" }}>C{classicalBit}</span>
            <div style={{ height: 10, borderRadius: 999, background: "#F1F5F9", overflow: "hidden" }}>
              <div style={{ width: `${p * 100}%`, height: "100%", background: "linear-gradient(90deg,#2563eb,#60a5fa)", transition: "width 0.4s" }} />
            </div>
            <span style={{ fontFamily: "JetBrains Mono, monospace", fontSize: 11, color: "#1d4ed8", textAlign: "right" }}>{p.toFixed(2)}</span>
          </div>
        );
      })}
    </div>
  );
}

// ─── Gate renderer (inside SVG) ───────────────────────────────────────────────
function OperationRenderer({ gate, active }: { gate: GateOperation; active: boolean }) {
  const x = colX(gateColumn(gate));
  const color = GATE_COLOR[gate.type];

  if (isComponentType(gate.type)) {
    const qubits = gate.qubits ?? [gate.target];
    const top    = wireY(Math.min(...qubits)) - GATE_H / 2;
    const bottom = wireY(Math.max(...qubits)) + GATE_H / 2;
    return (
      <g>
        <rect
          x={x - GATE_W / 2} y={top}
          width={GATE_W} height={bottom - top}
          rx={14}
          fill={active ? "#dbeafe" : "#eff6ff"}
          stroke="#2563eb"
          strokeWidth={active ? 2.5 : 1.5}
        />
        <text x={x} y={(top + bottom) / 2} textAnchor="middle" dominantBaseline="middle"
          fontFamily="JetBrains Mono, monospace" fontSize="10" fontWeight="600" fill="#1d4ed8">
          [{(gate.label ?? "COMP").toUpperCase()}]
        </text>
      </g>
    );
  }

  const targetY = wireY(gate.target);

  if (["CNOT","CZ","SWAP","CRX","CRY","CRZ"].includes(gate.type)) {
    const controlY = wireY(gate.control ?? gate.target);
    return (
      <g>
        <line x1={x} y1={Math.min(controlY, targetY)} x2={x} y2={Math.max(controlY, targetY)} stroke={color} strokeWidth={active ? 2.5 : 1.5} />
        {gate.type === "SWAP" ? (
          <>
            {[controlY, targetY].map((y) => (
              <g key={y}>
                <line x1={x - 9} y1={y - 9} x2={x + 9} y2={y + 9} stroke={color} strokeWidth={2} />
                <line x1={x + 9} y1={y - 9} x2={x - 9} y2={y + 9} stroke={color} strokeWidth={2} />
              </g>
            ))}
          </>
        ) : (
          <>
            <circle cx={x} cy={controlY} r={6} fill={color} />
            {gate.type === "CNOT" ? (
              <>
                <circle cx={x} cy={targetY} r={16} fill="#fff" stroke={color} strokeWidth={2} />
                <line x1={x - 11} y1={targetY} x2={x + 11} y2={targetY} stroke={color} strokeWidth={2} />
                <line x1={x} y1={targetY - 11} x2={x} y2={targetY + 11} stroke={color} strokeWidth={2} />
              </>
            ) : gate.type === "CZ" ? (
              <circle cx={x} cy={targetY} r={6} fill={color} />
            ) : (
              <>
                <rect x={x - GATE_W / 2} y={targetY - GATE_H / 2} width={GATE_W} height={GATE_H} rx={10} fill="#fff" stroke={color} strokeWidth={2} />
                <text x={x} y={targetY} textAnchor="middle" dominantBaseline="middle"
                  fontFamily="Syne, sans-serif" fontSize="12" fontWeight="700" fill={color}>
                  {gate.type}
                </text>
              </>
            )}
          </>
        )}
      </g>
    );
  }

  return (
    <g>
      <rect
        x={x - GATE_W / 2} y={targetY - GATE_H / 2}
        width={GATE_W} height={GATE_H}
        rx={10}
        fill={active ? "#dbeafe" : "#fff"}
        stroke={color}
        strokeWidth={active ? 2.5 : 1.5}
      />
      {isMeasureGate(gate.type) ? (
        <>
          <path d={`M ${x - 10} ${targetY + 5} A 10 10 0 0 1 ${x + 10} ${targetY + 5}`} stroke={color} strokeWidth="2" fill="none" />
          <line x1={x} y1={targetY + 5} x2={x + 10} y2={targetY - 6} stroke={color} strokeWidth="2" />
        </>
      ) : (
        <>
          <text
            x={x} y={targetY - (isParametricGate(gate.type) ? 5 : 0)}
            textAnchor="middle" dominantBaseline="middle"
            fontFamily="Syne, sans-serif" fontSize="13" fontWeight="700" fill={color}>
            {gate.type}
          </text>
          {isParametricGate(gate.type) && gate.theta !== undefined && (
            <text x={x} y={targetY + 11} textAnchor="middle" dominantBaseline="middle"
              fontFamily="JetBrains Mono, monospace" fontSize="8" fill="#64748b">
              {formatTheta(gate.theta)}
            </text>
          )}
        </>
      )}
    </g>
  );
}

// ─── Ghost drag preview ───────────────────────────────────────────────────────
function GhostPreview({ preview, qubit, column }: { preview: PreviewItem; qubit: number; column: number }) {
  if (!preview) return null;
  const x = colX(column);

  if (preview.kind === "component") {
    const top    = wireY(qubit) - GATE_H / 2;
    const bottom = wireY(qubit + preview.algorithm.qubits - 1) + GATE_H / 2;
    return (
      <g opacity="0.45" style={{ pointerEvents: "none" }}>
        <rect x={x - GATE_W / 2} y={top} width={GATE_W} height={bottom - top} rx={14}
          fill="#DBEAFE" stroke="#3B82F6" strokeWidth={2} strokeDasharray="6 4" />
        <text x={x} y={(top + bottom) / 2} textAnchor="middle" dominantBaseline="middle"
          fontFamily="JetBrains Mono, monospace" fontSize="10" fill="#1D4ED8">
          [{preview.algorithm.name.slice(0, 8).toUpperCase()}]
        </text>
      </g>
    );
  }

  const color = GATE_COLOR[preview.gateType];
  const y     = wireY(qubit);
  return (
    <g opacity="0.5" style={{ pointerEvents: "none" }}>
      <rect x={x - GATE_W / 2} y={y - GATE_H / 2} width={GATE_W} height={GATE_H}
        rx={10} fill="#FFFFFF" stroke={color} strokeWidth={2} strokeDasharray="6 4" />
      <text x={x} y={y} textAnchor="middle" dominantBaseline="middle"
        fontFamily="Syne, sans-serif" fontSize="12" fontWeight="700" fill={color}>
        {preview.gateType === "CNOT" ? "CX" : preview.gateType}
      </text>
    </g>
  );
}

// ─── Sticky qubit label column ─────────────────────────────────────────────────
/**
 * This renders qubit (and classical) labels as a SEPARATE fixed-width element
 * that sits to the left of the scrollable SVG canvas. Because it's outside the
 * scroll container it never scrolls away horizontally, solving the "can't see
 * qubit labels" problem from the screenshots.
 */
function StickyLabelColumn({
  qubits,
  svgHeight,
}: {
  qubits: number;
  svgHeight: number;
}) {
  return (
    <svg
      width={LABEL_COL_W}
      height={svgHeight}
      style={{ display: "block", flexShrink: 0, borderRight: "1px solid #E5E7EB" }}
    >
      <rect width={LABEL_COL_W} height={svgHeight} fill="#F9FAFB" />
      {Array.from({ length: qubits }, (_, q) => {
        const y = wireY(q);
        return (
          <g key={`label-q${q}`}>
            {/* wire start stub */}
            <line x1={LABEL_COL_W - 6} y1={y} x2={LABEL_COL_W} y2={y} stroke="#2563eb" strokeWidth="2" />
            <text
              x={LABEL_COL_W - 10} y={y}
              textAnchor="end" dominantBaseline="middle"
              fontFamily="JetBrains Mono, monospace" fontSize="12" fill="#334155">
              q{q}
            </text>
          </g>
        );
      })}
      {Array.from({ length: qubits }, (_, q) => {
        const y = TOP_PAD + qubits * LANE_H + 34 + q * 18;
        return (
          <g key={`label-c${q}`}>
            <text
              x={LABEL_COL_W - 10} y={y}
              textAnchor="end" dominantBaseline="middle"
              fontFamily="JetBrains Mono, monospace" fontSize="11" fill="#475569">
              C{q}
            </text>
          </g>
        );
      })}
    </svg>
  );
}

// ─── Main scrollable circuit SVG ──────────────────────────────────────────────
/**
 * Key changes vs original:
 * 1. Labels are REMOVED from this SVG — they live in StickyLabelColumn above.
 * 2. colX() no longer adds LEFT_PAD — the label column provides that offset.
 * 3. The outer div uses overflowX: "auto" so the canvas scrolls independently.
 * 4. Zoom: the SVG is scaled via a CSS transform on a wrapper div so the entire
 *    canvas shrinks/grows while the sticky labels stay fixed size.
 */
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
  const {
    circuit, selectedGate, previewItem, activeOperationId, dragOverKey, connectionDraft, zoom,
    onPivotHover, onPivotLeave, onPivotClick, onPivotDrop, onDeleteOperation,
  } = props;

  const maxUsedCol = useMemo(
    () => circuit.gates.reduce((m, g) => Math.max(m, gateColumn(g)), -1),
    [circuit.gates]
  );
  const numCols  = Math.max(MIN_COLS, maxUsedCol + 4);
  const svgWidth = numCols * COL_W + 48;
  const svgHeight = TOP_PAD + circuit.qubits * LANE_H + BOT_PAD;

  const measurementMap = useMemo(() => getMeasurementMap(circuit), [circuit]);
  const occupied = useMemo(() => {
    const map = new Map<string, string>();
    circuit.gates.forEach((gate) => {
      const col = gateColumn(gate);
      getOperationQubits(gate).forEach((q) => map.set(`${q}-${col}`, gate.id));
    });
    return map;
  }, [circuit.gates]);

  return (
    <div style={{ display: "flex", alignItems: "stretch", overflow: "hidden", borderRadius: 16, border: "1px solid #E5E7EB", background: "#fff" }}>
      {/* Sticky label column — never scrolls */}
      <StickyLabelColumn qubits={circuit.qubits} svgHeight={svgHeight} />

      {/* Scrollable canvas */}
      <div style={{ overflowX: "auto", overflowY: "hidden", flex: 1 }}>
        <div style={{ transform: `scale(${zoom})`, transformOrigin: "top left", width: svgWidth * zoom, height: svgHeight * zoom }}>
          <svg width={svgWidth} height={svgHeight} style={{ display: "block" }}>
            <rect width={svgWidth} height={svgHeight} fill="#fff" />

            {/* Column guide lines */}
            {Array.from({ length: numCols }, (_, col) => (
              <line key={`col-${col}`}
                x1={col * COL_W} y1={TOP_PAD - 10}
                x2={col * COL_W} y2={TOP_PAD + circuit.qubits * LANE_H + 22}
                stroke="#F1F5F9" strokeWidth="1" />
            ))}

            {/* Quantum wires */}
            {Array.from({ length: circuit.qubits }, (_, q) => {
              const y = wireY(q);
              const measurement = measurementMap.get(q);
              const endX = colX(measurement ? measurement.column : numCols - 1) + COL_W / 2;
              return (
                <line key={`wire-${q}`} x1={0} y1={y} x2={endX} y2={y} stroke="#2563eb" strokeWidth="2" />
              );
            })}

            {/* Classical bit wires */}
            {Array.from({ length: circuit.qubits }, (_, q) => {
              const y = TOP_PAD + circuit.qubits * LANE_H + 34 + q * 18;
              return (
                <line key={`classical-${q}`}
                  x1={0} y1={y} x2={svgWidth - 24} y2={y}
                  stroke="#94a3b8" strokeDasharray="5 4" />
              );
            })}

            {/* Pivot interaction dots */}
            {Array.from({ length: circuit.qubits }, (_, q) =>
              Array.from({ length: numCols }, (_, col) => {
                const key = `${q}-${col}`;
                return (
                  <circle
                    key={`pivot-${key}`}
                    cx={colX(col)} cy={wireY(q)}
                    r={PIVOT_R}
                    fill={dragOverKey === key ? "#bfdbfe" : selectedGate ? "#dbeafe" : "#f8fafc"}
                    stroke={occupied.get(key) ? "#cbd5e1" : "#93c5fd"}
                    strokeWidth={dragOverKey === key ? 2 : 1.5}
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

            {/* Drag ghost preview */}
            {dragOverKey ? (() => {
              const [pq, pc] = dragOverKey.split("-").map(Number);
              return <GhostPreview preview={previewItem} qubit={pq} column={pc} />;
            })() : null}

            {/* Multi-qubit draft line */}
            {connectionDraft && (
              <line
                x1={colX(connectionDraft.column)} y1={wireY(connectionDraft.controlQubit)}
                x2={colX(connectionDraft.column)} y2={wireY(connectionDraft.previewQubit)}
                stroke={GATE_COLOR[connectionDraft.gateType]}
                strokeWidth="2.5" strokeDasharray="5 4" />
            )}

            {/* Placed gates */}
            {circuit.gates.map((gate) => {
              const measurement = isMeasureGate(gate.type) ? measurementMap.get(gate.target) : null;
              return (
                <g key={gate.id}>
                  <g onClick={() => onDeleteOperation(gate.id)} style={{ cursor: "pointer" }}>
                    <OperationRenderer gate={gate} active={activeOperationId === gate.id} />
                  </g>
                  {measurement && (
                    <line
                      x1={colX(measurement.column)} y1={wireY(gate.target) + GATE_H / 2}
                      x2={colX(measurement.column)} y2={TOP_PAD + circuit.qubits * LANE_H + 34 + measurement.classicalBit * 18}
                      stroke="#64748b" strokeWidth="1.5" strokeDasharray="5 4" />
                  )}
                </g>
              );
            })}

            {/* Column tick numbers */}
            {Array.from({ length: numCols }, (_, col) => (
              <text key={`tick-${col}`}
                x={colX(col)} y={TOP_PAD + circuit.qubits * LANE_H + 16}
                textAnchor="middle"
                fontFamily="JetBrains Mono, monospace" fontSize="10" fill="#94a3b8">
                {col + 1}
              </text>
            ))}
          </svg>
        </div>
      </div>
    </div>
  );
}

// ─── Zoom control bar ─────────────────────────────────────────────────────────
function ZoomBar({ zoom, onChange }: { zoom: number; onChange: (z: number) => void }) {
  const levels = [0.5, 0.75, 1, 1.25, 1.5];
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
      <button
        type="button"
        onClick={() => onChange(Math.max(0.5, zoom - 0.25))}
        style={{ borderRadius: 8, border: "1px solid #E5E7EB", background: "#fff", color: "#374151", padding: "4px 10px", fontFamily: "JetBrains Mono, monospace", fontSize: 13, cursor: "pointer", lineHeight: 1 }}>
        −
      </button>
      <span style={{ fontFamily: "JetBrains Mono, monospace", fontSize: 10, color: "#6B7280", minWidth: 36, textAlign: "center" }}>
        {Math.round(zoom * 100)}%
      </span>
      <button
        type="button"
        onClick={() => onChange(Math.min(1.5, zoom + 0.25))}
        style={{ borderRadius: 8, border: "1px solid #E5E7EB", background: "#fff", color: "#374151", padding: "4px 10px", fontFamily: "JetBrains Mono, monospace", fontSize: 13, cursor: "pointer", lineHeight: 1 }}>
        +
      </button>
      <div style={{ display: "flex", gap: 3, marginLeft: 4 }}>
        {levels.map((l) => (
          <button
            key={l}
            type="button"
            onClick={() => onChange(l)}
            style={{
              borderRadius: 6, border: "1px solid #E5E7EB",
              background: zoom === l ? "#EFF6FF" : "#fff",
              color: zoom === l ? "#3B82F6" : "#6B7280",
              padding: "3px 7px",
              fontFamily: "JetBrains Mono, monospace", fontSize: 9,
              cursor: "pointer",
            }}>
            {Math.round(l * 100)}%
          </button>
        ))}
      </div>
      <button
        type="button"
        onClick={() => onChange(1)}
        style={{ borderRadius: 8, border: "1px solid #E5E7EB", background: "#fff", color: "#6B7280", padding: "4px 10px", fontFamily: "JetBrains Mono, monospace", fontSize: 10, cursor: "pointer" }}>
        Reset
      </button>
    </div>
  );
}

// ─── Main exported component ──────────────────────────────────────────────────
export default function CircuitBuilder() {
  const [selectedGate, setSelectedGate]       = useState<GateType | null>(null);
  const [controlQubit, setControlQubit]       = useState(0);
  const [targetQubit,  setTargetQubit]        = useState(1);
  const [theta,        setTheta]              = useState(Math.PI / 2);
  const [dragOverKey,  setDragOverKey]        = useState<string | null>(null);
  const [previewItem,  setPreviewItem]        = useState<PreviewItem>(null);
  const [connectionDraft, setConnectionDraft] = useState<{
    gateType: GateType; controlQubit: number; column: number; previewQubit: number;
  } | null>(null);
  const [zoom, setZoom]                       = useState(1);

  const activeCircuit = useCircuitStore((s) => s.activeCircuit);
  const circuit       = useCircuitStore((s) => s.circuits[s.activeCircuit]);
  const results       = useCircuitStore((s) => s.results);
  const setActiveCircuit = useCircuitStore((s) => s.setActiveCircuit);
  const setQubitCount    = useCircuitStore((s) => s.setQubitCount);
  const addGate          = useCircuitStore((s) => s.addGate);
  const removeGate       = useCircuitStore((s) => s.removeGate);
  const setResult        = useCircuitStore((s) => s.setResult);
  const setSocketError   = useCircuitStore((s) => s.setSocketError);
  const setIsRunning     = useCircuitStore((s) => s.setIsRunning);
  const loadMockData     = useCircuitStore((s) => s.loadMockData);

  const currentStep   = useVisualizationStore((s) => s.currentStep);
  const { status, error, isLoading, reconnect, simulateCircuit } = useWebSocket(webSocketUrl);

  const expandedGates      = useMemo(() => expandCircuit(circuit), [circuit]);
  const activeOperationId  = currentStep >= 0 ? expandedGates[currentStep]?.sourceOperationId ?? null : null;
  const metrics            = useMemo(() => calculateMetrics(circuit), [circuit]);
  const measurementMap     = useMemo(() => getMeasurementMap(circuit), [circuit]);

  const canOccupy = useCallback((qubits: number[], column: number) =>
    qubits.every((q) => {
      const measurement   = measurementMap.get(q);
      const blockedByMeas = measurement ? column > measurement.column : false;
      const collides      = circuit.gates.some((g) => gateColumn(g) === column && getOperationQubits(g).includes(q));
      return !blockedByMeas && !collides;
    }), [circuit.gates, measurementMap]);

  const placeOperation = useCallback((operation:
    | { kind: "gate"; type: GateType; qubit: number; column: number; control?: number; theta?: number }
    | { kind: "component"; algorithm: AlgorithmDefinition; startQubit: number; column: number }
  ) => {
    if (operation.kind === "component") {
      const requiredQubits = operation.startQubit + operation.algorithm.qubits;
      if (requiredQubits > MAX_QUBITS) return;
      if (requiredQubits > circuit.qubits) setQubitCount(activeCircuit, requiredQubits);
      const qubits = Array.from({ length: operation.algorithm.qubits }, (_, i) => operation.startQubit + i);
      if (!canOccupy(qubits, operation.column)) return;
      addGate(activeCircuit, createComponentOperation(operation.algorithm, operation.startQubit, operation.column));
      return;
    }
    const touchedQubits = [operation.qubit, ...(operation.control !== undefined ? [operation.control] : [])];
    if (!canOccupy(touchedQubits, operation.column)) return;
    addGate(activeCircuit, createGateOperation(operation));
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
      if (!connectionDraft) {
        setConnectionDraft({ gateType: selectedGate, controlQubit: qubit, column, previewQubit: qubit });
        return;
      }
      if (connectionDraft.controlQubit !== qubit) {
        placeOperation({ kind: "gate", type: connectionDraft.gateType, qubit, column: connectionDraft.column, control: connectionDraft.controlQubit, theta: isParametricGate(connectionDraft.gateType) ? theta : undefined });
      }
      setConnectionDraft(null);
      return;
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
        const target  = control === qubit ? targetQubit : qubit;
        placeOperation({ kind: "gate", type: payload.gateType, qubit: target, column, control, theta: isParametricGate(payload.gateType) ? theta : undefined });
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
    const currentCircuit = useCircuitStore.getState().circuits[key];
    try {
      setSocketError(null);
      setIsRunning(true);
      setResult(key, await simulateCircuit(serializeCircuit(currentCircuit)));
    } catch (err) {
      setSocketError(err instanceof Error ? err.message : "Simulation failed.");
    } finally {
      setIsRunning(false);
    }
  }, [setIsRunning, setResult, setSocketError, simulateCircuit]);

  return (
    <section style={{ background: "#FFFFFF", border: "1px solid #E5E7EB", borderRadius: 12, padding: 20, boxShadow: "0 4px 24px rgba(15,23,42,0.06)", display: "flex", flexDirection: "column", gap: 16 }}>

      {/* ── Top toolbar ── */}
      <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
        <h2 style={{ margin: 0, fontFamily: "Syne, sans-serif", fontSize: 20, fontWeight: 700, color: "#0f172a", marginRight: 8 }}>
          Circuit Builder
        </h2>

        {/* Circuit selector */}
        <div style={{ display: "flex", gap: 4 }}>
          {(["A", "B"] as CircuitKey[]).map((key) => (
            <button key={key} type="button" onClick={() => setActiveCircuit(key)}
              style={{
                borderRadius: 10, border: `1px solid ${activeCircuit === key ? "#93c5fd" : "#E5E7EB"}`,
                background: activeCircuit === key ? "#EFF6FF" : "#fff",
                color: activeCircuit === key ? "#1d4ed8" : "#374151",
                padding: "7px 16px", fontFamily: "JetBrains Mono, monospace", fontSize: 11, cursor: "pointer",
              }}>
              Circuit {key}
            </button>
          ))}
        </div>

        <div style={{ width: 1, height: 20, background: "#E5E7EB" }} />

        {/* Run buttons */}
        <button type="button" onClick={() => void runSingleCircuit(activeCircuit)}
          style={{ borderRadius: 10, border: "1px solid #93c5fd", background: "#EFF6FF", color: "#1d4ed8", padding: "7px 16px", fontFamily: "JetBrains Mono, monospace", fontSize: 11, cursor: "pointer" }}>
          ▶ Run {activeCircuit}
        </button>
        <button type="button" onClick={() => { void runSingleCircuit("A"); void runSingleCircuit("B"); }}
          style={{ borderRadius: 10, border: "1px solid #E5E7EB", background: "#fff", color: "#374151", padding: "7px 16px", fontFamily: "JetBrains Mono, monospace", fontSize: 11, cursor: "pointer" }}>
          A vs B
        </button>
        <button type="button" onClick={loadMockData}
          style={{ borderRadius: 10, border: "1px solid #E5E7EB", background: "#fff", color: "#6B7280", padding: "7px 16px", fontFamily: "JetBrains Mono, monospace", fontSize: 11, cursor: "pointer" }}>
          Load Mock
        </button>

        {/* Status badge pushed right */}
        <div style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: 10 }}>
          <WebSocketStatusBadge
            status={status as never}
            message={error ?? null}
            latencyMs={null}
          />
          <label style={{ display: "flex", alignItems: "center", gap: 6, fontFamily: "JetBrains Mono, monospace", fontSize: 11, color: "#475569" }}>
            Qubits
            <select
              value={circuit.qubits}
              onChange={(e) => setQubitCount(activeCircuit, Number(e.target.value))}
              style={{ borderRadius: 8, border: "1px solid #E5E7EB", background: "#F9FAFB", padding: "6px 8px", fontFamily: "JetBrains Mono, monospace", fontSize: 11, color: "#0f172a" }}>
              {Array.from({ length: MAX_QUBITS - 1 }, (_, i) => i + 2).map((n) => (
                <option key={n} value={n}>{n}</option>
              ))}
            </select>
          </label>
          <button type="button" onClick={reconnect}
            style={{ borderRadius: 8, border: "1px solid #E5E7EB", background: "#fff", color: "#475569", padding: "6px 12px", fontFamily: "JetBrains Mono, monospace", fontSize: 11, cursor: "pointer" }}>
            Reconnect
          </button>
        </div>
      </div>

      {/* ── Three-column layout ── */}
      <div style={{ display: "grid", gridTemplateColumns: "280px minmax(0,1fr) 300px", gap: 16, alignItems: "start" }}>

        {/* Left: Gate Palette */}
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
            setPreviewItem(
              preview
                ? { kind: "gate", gateType: preview.gateType }
                : selectedGate
                  ? { kind: "gate", gateType: selectedGate }
                  : null
            )
          }
        />

        {/* Center: Circuit canvas + meter */}
        <div style={{ display: "grid", gap: 12 }}>
          {/* Gate hint + zoom controls */}
          <div style={{
            display: "flex", alignItems: "center", justifyContent: "space-between",
            padding: "8px 12px",
            borderRadius: 10, border: "1px solid #E5E7EB", background: "#F9FAFB",
            gap: 12, flexWrap: "wrap",
          }}>
            <span style={{ fontFamily: "JetBrains Mono, monospace", fontSize: 10, color: "#6B7280" }}>
              {selectedGate
                ? isTwoQubitGate(selectedGate)
                  ? `${selectedGate} — connect two pivots`
                  : `${selectedGate} selected — click or drop on a pivot`
                : "Select a gate from the palette or drag onto a pivot"}
            </span>
            <ZoomBar zoom={zoom} onChange={setZoom} />
          </div>

          {/* The circuit canvas — sticky labels + scrollable SVG */}
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
              setPreviewItem(
                payload.entity === "gate"
                  ? { kind: "gate", gateType: payload.gateType }
                  : { kind: "component", algorithm: payload.algorithm }
              );
            }}
            onPivotLeave={() => setDragOverKey(null)}
            onPivotClick={handlePivotClick}
            onPivotDrop={handlePivotDrop}
            onDeleteOperation={(id) => removeGate(activeCircuit, id)}
          />

          <ProbabilityMeter circuit={circuit} counts={results[activeCircuit]?.counts ?? null} />
        </div>

        {/* Right: Inspector */}
        <div style={{ display: "grid", gap: 12 }}>
          <CircuitJsonEditor circuitKey={activeCircuit} />
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
            <MetricCard label="Gate Count" value={metrics.gateCount} />
            <MetricCard label="Depth" value={metrics.depth} />
            <MetricCard label="Measured" value={results[activeCircuit] ? Object.keys(results[activeCircuit]!.counts).length : "—"} />
            <MetricCard label="Components" value={circuit.gates.filter((g) => isComponentType(g.type)).length} />
          </div>
        </div>
      </div>
    </section>
  );
}
