"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { BlochSphere } from "@/components/BlochSphere";
import { useWebSocket } from "@/hooks/useWebSocket";
import { serializeCircuit } from "@/lib/circuit";
import { webSocketUrl } from "@/lib/env";
import { getBlochVectors } from "@/lib/quantum";
import { StepSimulationRequest } from "@/lib/types";
import { useCircuitStore } from "@/store/useCircuitStore";
import { useVisualizationStore } from "@/store/useVisualizationStore";
import {
  GATE_COLOR,
  formatTheta,
  isMeasureGate,
  isParametricGate,
  isTwoQubitGate,
} from "@/lib/gates";
import type { GateOperation } from "@/lib/types";

// ─── Mini circuit SVG constants ───────────────────────────────────────────────
const COL_W    = 68;
const LANE_H   = 72;
const LEFT_PAD = 72;
const TOP_PAD  = 18;
const BOT_PAD  = 28;
const GATE_W   = 38;
const GATE_H   = 30;
const GATE_R   = 6;
const TWO_Q_R  = 13;
const DOT_R    = 6;

function wireY(q: number)  { return TOP_PAD + q * LANE_H + LANE_H / 2; }
function colX(c: number)   { return LEFT_PAD + c * COL_W + COL_W / 2; }
function gateCol(g: GateOperation) { return Math.max(0, Math.round(g.position.x / COL_W)); }

// ─── Mini circuit (read-only, highlights active gate) ─────────────────────────
/**
 * FIX: The scroll container is now `overflow: "auto"` on both axes.
 * The qubit labels are part of the SVG (LEFT_PAD=72 leaves room),
 * so they always scroll with the canvas and are never clipped.
 * A horizontal scrollbar appears only when the circuit is wider than
 * the panel — no more invisible gates on the right.
 */
function MiniCircuitSVG({
  gates,
  qubits,
  activeGateIndex,
}: {
  gates: GateOperation[];
  qubits: number;
  activeGateIndex: number;
}) {
  const sorted   = [...gates].sort((a, b) => a.position.x - b.position.x);
  const maxCol   = sorted.reduce((m, g) => Math.max(m, gateCol(g)), -1);
  const numCols  = Math.max(8, maxCol + 3);
  const svgW     = LEFT_PAD + numCols * COL_W + 18;
  const svgH     = TOP_PAD + qubits * LANE_H + BOT_PAD;
  const activeGate = activeGateIndex >= 0 ? sorted[activeGateIndex] : null;

  return (
    <div style={{
      overflowX: "auto",
      overflowY: "hidden",
      /* Reserve explicit height so the panel doesn't collapse */
      minHeight: svgH,
    }}>
      <svg width={svgW} height={svgH} style={{ display: "block" }}>
        <defs>
          <pattern id="mgrid" x="0" y="0" width="16" height="16" patternUnits="userSpaceOnUse">
            <circle cx="8" cy="8" r="0.6" fill="rgba(0,212,255,0.06)" />
          </pattern>
        </defs>
        <rect width={svgW} height={svgH} fill="url(#mgrid)" />

        {/* Wires + qubit labels */}
        {Array.from({ length: qubits }, (_, q) => {
          const y = wireY(q);
          return (
            <g key={`w${q}`}>
              <line x1={LEFT_PAD - 4} y1={y} x2={svgW - 8} y2={y} stroke="rgba(0,212,255,0.07)" strokeWidth="4" />
              <line x1={LEFT_PAD - 4} y1={y} x2={svgW - 8} y2={y} stroke="rgba(0,212,255,0.2)"  strokeWidth="1.2" />
              <text
                x={LEFT_PAD - 10} y={y + 1}
                textAnchor="end" dominantBaseline="middle"
                fontFamily="JetBrains Mono, monospace" fontSize="11"
                fill="rgba(0,212,255,0.5)" style={{ userSelect: "none" }}>
                q[{q}]
              </text>
            </g>
          );
        })}

        {/* Active column highlight */}
        {activeGate && (() => {
          const col = gateCol(activeGate);
          return (
            <rect
              x={LEFT_PAD + col * COL_W + 4} y={TOP_PAD}
              width={COL_W - 8} height={qubits * LANE_H}
              rx={6} fill="rgba(0,212,255,0.07)"
              stroke="rgba(0,212,255,0.18)" strokeWidth="1"
            />
          );
        })()}

        {/* Gates */}
        {sorted.map((gate, idx) => {
          const lit   = idx === activeGateIndex;
          const color = GATE_COLOR[gate.type];
          const x     = colX(gateCol(gate));
          const ty    = wireY(gate.target);
          const glow  = lit
            ? `drop-shadow(0 0 12px ${color}cc)`
            : `drop-shadow(0 0 4px ${color}44)`;

          const connector =
            isTwoQubitGate(gate.type) && gate.control !== undefined ? (() => {
              const cy = wireY(gate.control);
              return (
                <line
                  x1={x} y1={Math.min(cy, ty)} x2={x} y2={Math.max(cy, ty)}
                  stroke={color}
                  strokeWidth={lit ? "2" : "1.5"}
                  opacity={lit ? 1 : 0.65}
                  style={{ filter: `drop-shadow(0 0 ${lit ? 6 : 3}px ${color}55)` }}
                />
              );
            })()
            : null;

          const controlDot =
            gate.control !== undefined && gate.type !== "SWAP" ? (
              <circle
                cx={x} cy={wireY(gate.control)} r={DOT_R}
                fill={color}
                style={{ filter: `drop-shadow(0 0 ${lit ? 10 : 6}px ${color}88)` }}
              />
            ) : null;

          let targetShape: React.ReactNode;

          if (gate.type === "CNOT") {
            targetShape = (
              <>
                <circle
                  cx={x} cy={ty} r={TWO_Q_R}
                  fill={lit ? `${color}30` : `${color}12`}
                  stroke={color} strokeWidth={lit ? "2" : "1.5"}
                  style={{ filter: glow }}
                />
                <line x1={x - TWO_Q_R + 4} y1={ty} x2={x + TWO_Q_R - 4} y2={ty} stroke={color} strokeWidth="1.5" />
                <line x1={x} y1={ty - TWO_Q_R + 4} x2={x} y2={ty + TWO_Q_R - 4} stroke={color} strokeWidth="1.5" />
              </>
            );
          } else if (gate.type === "CZ") {
            targetShape = <circle cx={x} cy={ty} r={DOT_R} fill={color} style={{ filter: glow }} />;
          } else if (gate.type === "SWAP") {
            const cy2 = gate.control !== undefined ? wireY(gate.control) : ty;
            const r = 7;
            targetShape = (
              <g style={{ filter: glow }}>
                {[ty, cy2].map((wy, i) => (
                  <g key={i}>
                    <line x1={x - r} y1={wy - r} x2={x + r} y2={wy + r} stroke={color} strokeWidth="2" strokeLinecap="round" />
                    <line x1={x + r} y1={wy - r} x2={x - r} y2={wy + r} stroke={color} strokeWidth="2" strokeLinecap="round" />
                  </g>
                ))}
              </g>
            );
          } else {
            const lbl = isMeasureGate(gate.type) ? "" : gate.type.slice(0, 3);
            targetShape = (
              <>
                <rect
                  x={x - GATE_W / 2} y={ty - GATE_H / 2}
                  width={GATE_W} height={GATE_H} rx={GATE_R}
                  fill={lit ? `${color}30` : `${color}12`}
                  stroke={color} strokeWidth={lit ? "2" : "1.5"}
                  style={{ filter: glow }}
                />
                {isMeasureGate(gate.type) ? (
                  <>
                    <path d={`M ${x - 9} ${ty + 3} A 9 9 0 0 1 ${x + 9} ${ty + 3}`}
                      stroke={color} strokeWidth="1.4" fill="none" />
                    <line x1={x} y1={ty + 3} x2={x + 8} y2={ty - 4} stroke={color} strokeWidth="1.4" strokeLinecap="round" />
                  </>
                ) : (
                  <text
                    x={x} y={ty + 1}
                    textAnchor="middle" dominantBaseline="middle"
                    fontFamily="Syne, sans-serif" fontWeight="700"
                    fontSize={lbl.length > 2 ? "9" : "11"}
                    fill={color} style={{ userSelect: "none" }}>
                    {lbl}
                    {isParametricGate(gate.type) && gate.theta !== undefined && (
                      <tspan x={x} dy="9" fontSize="7" opacity="0.6">{formatTheta(gate.theta)}</tspan>
                    )}
                  </text>
                )}
              </>
            );
          }

          return (
            <g key={gate.id}>
              {connector}
              {controlDot}
              {targetShape}
              {lit && (
                <circle
                  cx={x} cy={ty} r={GATE_W / 2 + 6}
                  fill="none" stroke={color} strokeWidth="1" opacity="0.3"
                  style={{ filter: `drop-shadow(0 0 8px ${color})` }}
                />
              )}
            </g>
          );
        })}

        {/* Time axis */}
        <line
          x1={LEFT_PAD} y1={TOP_PAD + qubits * LANE_H + 6}
          x2={LEFT_PAD + numCols * COL_W} y2={TOP_PAD + qubits * LANE_H + 6}
          stroke="rgba(40,64,90,0.35)" strokeWidth="1"
        />
        {sorted.map((gate, idx) => {
          const col = gateCol(gate);
          return (
            <text
              key={`tick-${idx}`}
              x={colX(col)} y={TOP_PAD + qubits * LANE_H + 18}
              textAnchor="middle"
              fontFamily="JetBrains Mono, monospace" fontSize="9"
              fill={idx === activeGateIndex ? "rgba(0,212,255,0.9)" : "rgba(40,64,90,0.5)"}
            >
              {idx + 1}
            </text>
          );
        })}
      </svg>
    </div>
  );
}

// ─── Visualization modal (full-screen overlay) ────────────────────────────────
// (no changes to logic — only small style tweaks for consistency)
function VisualizationModal(props: {
  circuit: { qubits: number; gates: GateOperation[] };
  blochVectors: ReturnType<typeof getBlochVectors>;
  steps: Array<{ statevector: unknown; gate: GateOperation }>;
  currentStep: number;
  isPlaying: boolean;
  isVisualizing: boolean;
  speedMs: number;
  onPlay: () => void;
  onPause: () => void;
  onClose: () => void;
  onSpeedChange: (ms: number) => void;
  onStepChange: (i: number) => void;
}) {
  const {
    circuit, blochVectors, steps, currentStep, isPlaying, isVisualizing,
    speedMs, onPlay, onPause, onClose, onSpeedChange, onStepChange,
  } = props;

  const activeGateIndex = currentStep >= 0 ? currentStep : -1;

  return createPortal(
    <div
      onClick={onClose}
      style={{
        position: "fixed", inset: 0, zIndex: 9999,
        background: "rgba(15,23,42,0.72)",
        backdropFilter: "blur(6px)",
        display: "flex", alignItems: "center", justifyContent: "center",
        padding: 24,
      }}>
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          background: "rgba(6,13,26,0.96)",
          border: "1px solid rgba(255,255,255,0.1)",
          borderRadius: 20,
          padding: 28,
          width: "100%",
          maxWidth: 1060,
          maxHeight: "90vh",
          overflowY: "auto",
          display: "grid",
          gap: 20,
        }}>

        {/* Modal header */}
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <div>
            <span style={{ fontFamily: "Syne, sans-serif", fontWeight: 700, fontSize: 20, color: "#c8dff2" }}>
              Step Visualization
            </span>
            <span style={{ marginLeft: 10, fontFamily: "JetBrains Mono, monospace", fontSize: 11, color: "#00d4ff" }}>
              {isVisualizing ? `step ${Math.max(currentStep + 1, 0)} / ${steps.length}` : "idle"}
            </span>
          </div>
          <button type="button" onClick={onClose}
            style={{ background: "transparent", border: "1px solid rgba(255,255,255,0.15)", borderRadius: 8, color: "#c8dff2", padding: "6px 14px", cursor: "pointer", fontFamily: "JetBrains Mono, monospace", fontSize: 11 }}>
            ✕ Close
          </button>
        </div>

        {/* Playback controls */}
        <div style={{
          display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap",
          padding: "12px 16px", borderRadius: 12,
          border: "1px solid rgba(255,255,255,0.07)", background: "rgba(2,6,15,0.5)",
        }}>
          <button type="button" onClick={onPlay} disabled={steps.length === 0}
            style={{ borderRadius: 8, padding: "7px 14px", fontFamily: "JetBrains Mono, monospace", fontSize: 11, cursor: "pointer", border: "1px solid rgba(0,212,255,0.35)", color: "#00d4ff", background: "rgba(0,212,255,0.1)", opacity: steps.length === 0 ? 0.4 : 1 }}>
            ▶ Play
          </button>
          <button type="button" onClick={onPause} disabled={steps.length === 0}
            style={{ borderRadius: 8, padding: "7px 14px", fontFamily: "JetBrains Mono, monospace", fontSize: 11, cursor: "pointer", border: "1px solid rgba(255,179,64,0.35)", color: "#ffb340", background: "rgba(255,179,64,0.08)", opacity: steps.length === 0 ? 0.4 : 1 }}>
            ⏸ Pause
          </button>

          {/* Step slider */}
          <input type="range" min={0} max={Math.max(steps.length - 1, 0)} value={Math.max(currentStep, 0)}
            onChange={(e) => onStepChange(Number(e.target.value))}
            disabled={steps.length === 0}
            style={{ flex: 1, minWidth: 80, accentColor: "#00d4ff" }}
          />

          <span style={{ fontFamily: "JetBrains Mono, monospace", fontSize: 10, color: "rgba(200,223,242,0.6)", whiteSpace: "nowrap" }}>
            Speed
          </span>
          <input type="range" min={200} max={1500} step={100} value={speedMs}
            onChange={(e) => onSpeedChange(Number(e.target.value))}
            style={{ width: 90, accentColor: "#00d4ff" }}
          />
          <span style={{ fontFamily: "JetBrains Mono, monospace", fontSize: 10, color: "rgba(200,223,242,0.5)", minWidth: 44 }}>
            {speedMs}ms
          </span>
        </div>

        {/* Mini circuit */}
        <div style={{
          borderRadius: 14,
          border: "1px solid rgba(255,255,255,0.07)",
          background: "rgba(2,6,15,0.6)",
          padding: 12,
          /* Prevent the circuit from overflowing the modal vertically */
          overflow: "hidden",
        }}>
          <MiniCircuitSVG
            gates={circuit.gates}
            qubits={circuit.qubits}
            activeGateIndex={activeGateIndex}
          />
        </div>

        {/* Bloch spheres — horizontal scrollable row */}
        <div>
          <div style={{ fontFamily: "JetBrains Mono, monospace", fontSize: 10, color: "rgba(40,64,90,0.8)", letterSpacing: "0.06em", textTransform: "uppercase", marginBottom: 10 }}>
            Qubit States
          </div>
          {blochVectors.length === 0 ? (
            <div style={{ textAlign: "center", padding: "28px 0", fontFamily: "JetBrains Mono, monospace", fontSize: 11, color: "rgba(200,223,242,0.4)" }}>
              Run "Visualize" to see live qubit states
            </div>
          ) : (
            <div style={{ display: "flex", gap: 14, overflowX: "auto", paddingBottom: 6 }}>
              {blochVectors.map((vector, i) => (
                <div key={i} style={{ minWidth: 210, flexShrink: 0 }}>
                  <div style={{ fontFamily: "JetBrains Mono, monospace", fontSize: 9, color: "rgba(200,223,242,0.5)", textAlign: "center", marginBottom: 6, letterSpacing: "0.04em", textTransform: "uppercase" }}>
                    q[{i}]
                  </div>
                  <BlochSphere label={`q[${i}]`} vector={vector} active={isPlaying} />
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>,
    document.body
  );
}

// ─── Exported panel ───────────────────────────────────────────────────────────
export function VisualizationPanel() {
  const activeCircuit = useCircuitStore((s) => s.activeCircuit);
  const circuit       = useCircuitStore((s) => s.circuits[s.activeCircuit]);

  const {
    currentStep, isPlaying, isVisualizing, speedMs, modalOpen,
    visualizationResult,
    setCurrentStep, setIsPlaying, setIsVisualizing, setSpeedMs, setModalOpen,
    setVisualizationResult, resetVisualization,
  } = useVisualizationStore();

  const [collapsed, setCollapsed] = useState(false);
  const { simulateCircuit } = useWebSocket(webSocketUrl);

  const playingRef = useRef(isPlaying);
  const speedRef   = useRef(speedMs);
  const tokenRef   = useRef(0);

  useEffect(() => { playingRef.current = isPlaying; }, [isPlaying]);
  useEffect(() => { speedRef.current   = speedMs;   }, [speedMs]);

  useEffect(() => {
    resetVisualization();
  }, [activeCircuit, circuit.gates, circuit.qubits, resetVisualization]);

  const steps              = visualizationResult?.steps ?? [];
  const activeStep         = currentStep >= 0 ? steps[currentStep] : null;
  const displayStatevector = activeStep?.statevector ?? visualizationResult?.statevector ?? null;
  const blochVectors       = getBlochVectors(displayStatevector, circuit.qubits);

  const play  = useCallback(() => setIsPlaying(true),  [setIsPlaying]);
  const pause = useCallback(() => setIsPlaying(false), [setIsPlaying]);

  const startVisualization = useCallback(async () => {
    const payload: StepSimulationRequest = { mode: "step_simulation", ...serializeCircuit(circuit) };
    const result = await simulateCircuit(payload);
    setVisualizationResult(result);
    setCurrentStep(0);
    setIsVisualizing(true);
    setIsPlaying(true);
    setModalOpen(true);
  }, [circuit, setCurrentStep, setIsPlaying, setIsVisualizing, setVisualizationResult, simulateCircuit]);

  const closeModal = useCallback(() => {
    setModalOpen(false);
    setIsPlaying(false);
  }, [setIsPlaying]);

  // Auto-play loop
  useEffect(() => {
    if (!isPlaying || steps.length === 0) return;
    tokenRef.current += 1;
    const token = tokenRef.current;
    const run = async () => {
      let index = currentStep < 0 ? 0 : currentStep;
      while (playingRef.current && index < steps.length) {
        setCurrentStep(index);
        await new Promise((r) => window.setTimeout(r, speedRef.current));
        index += 1;
        if (tokenRef.current !== token) return;
      }
      if (index >= steps.length) {
        setIsPlaying(false);
        setIsVisualizing(false);
      }
    };
    run();
    return () => { tokenRef.current += 1; };
  }, [currentStep, isPlaying, setCurrentStep, setIsPlaying, setIsVisualizing, steps.length]);

  return (
    <>
      {modalOpen && (
        <VisualizationModal
          circuit={circuit}
          blochVectors={blochVectors}
          steps={steps as never}
          currentStep={currentStep}
          isPlaying={isPlaying}
          isVisualizing={isVisualizing}
          speedMs={speedMs}
          onPlay={play}
          onPause={pause}
          onClose={closeModal}
          onSpeedChange={setSpeedMs}
          onStepChange={setCurrentStep}
        />
      )}

      {/* ── Inline panel ── */}
      <div style={{
        background: "#FFFFFF",
        border: "1px solid #E5E7EB",
        borderRadius: 12,
        overflow: "hidden",
        boxShadow: "0 4px 24px rgba(15,23,42,0.06)",
      }}>
        {/* Panel header */}
        <div style={{
          display: "flex", justifyContent: "space-between", alignItems: "center",
          padding: "16px 20px",
          borderBottom: collapsed ? "none" : "1px solid #E5E7EB",
        }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <span style={{ fontFamily: "Syne, sans-serif", fontWeight: 700, fontSize: 16, color: "#1F2937" }}>
              Visualization
            </span>
            <span style={{ fontFamily: "JetBrains Mono, monospace", fontSize: 10, color: isVisualizing ? "#3B82F6" : "#9CA3AF" }}>
              {isVisualizing ? `step ${Math.max(currentStep + 1, 0)}/${steps.length}` : "idle"}
            </span>
          </div>
          <div style={{ display: "flex", gap: 6 }}>
            <button type="button" onClick={startVisualization}
              style={{ borderRadius: 8, padding: "7px 14px", fontFamily: "JetBrains Mono, monospace", fontSize: 10, cursor: "pointer", border: "1px solid #DBEAFE", background: "#EFF6FF", color: "#3B82F6" }}>
              Visualize
            </button>
            <button type="button" onClick={() => setCollapsed((v) => !v)}
              style={{ borderRadius: 8, padding: "7px 12px", fontFamily: "JetBrains Mono, monospace", fontSize: 10, cursor: "pointer", border: "1px solid #E5E7EB", color: "#4B5563", background: "#FFFFFF" }}>
              {collapsed ? "Expand ▾" : "Collapse ▴"}
            </button>
          </div>
        </div>

        {!collapsed && (
          <>
            {/* Playback controls */}
            <div style={{
              display: "flex", gap: 8, padding: "12px 20px", alignItems: "center",
              borderBottom: "1px solid #E5E7EB", background: "#F9FAFB", flexWrap: "wrap",
            }}>
              <button type="button" onClick={play} disabled={steps.length === 0}
                style={{ borderRadius: 8, padding: "6px 12px", fontFamily: "JetBrains Mono, monospace", fontSize: 10, cursor: "pointer", border: "1px solid #DBEAFE", color: "#3B82F6", background: "#EFF6FF", opacity: steps.length === 0 ? 0.4 : 1 }}>
                ▶ Play
              </button>
              <button type="button" onClick={pause} disabled={steps.length === 0}
                style={{ borderRadius: 8, padding: "6px 12px", fontFamily: "JetBrains Mono, monospace", fontSize: 10, cursor: "pointer", border: "1px solid #FDE68A", color: "#B45309", background: "#FFFBEB", opacity: steps.length === 0 ? 0.4 : 1 }}>
                ⏸ Pause
              </button>
              <span style={{ fontFamily: "JetBrains Mono, monospace", fontSize: 10, color: "#6B7280" }}>Speed</span>
              <input type="range" min="200" max="1500" step="100" value={speedMs}
                onChange={(e) => setSpeedMs(Number(e.target.value))}
                style={{ accentColor: "#3B82F6", width: 90 }} />
              <span style={{ fontFamily: "JetBrains Mono, monospace", fontSize: 10, color: "#6B7280" }}>
                {speedMs}ms
              </span>
            </div>

            {/* Bloch sphere horizontal strip */}
            <div style={{ padding: 20 }}>
              {blochVectors.length === 0 ? (
                <div style={{ textAlign: "center", padding: "24px 0", fontFamily: "JetBrains Mono, monospace", fontSize: 10, color: "#6B7280" }}>
                  Run "Visualize" to see live qubit states
                </div>
              ) : (
                <div style={{ display: "flex", gap: 14, overflowX: "auto", paddingBottom: 6 }}>
                  {blochVectors.map((vector, i) => (
                    <div key={i} style={{ minWidth: 210, flexShrink: 0 }}>
                      <div style={{ fontFamily: "JetBrains Mono, monospace", fontSize: 9, color: "#6B7280", textAlign: "center", marginBottom: 4, letterSpacing: "0.04em", textTransform: "uppercase" }}>
                        Qubit {i}
                      </div>
                      <BlochSphere label={`q[${i}]`} vector={vector} active={isPlaying} />
                    </div>
                  ))}
                </div>
              )}
            </div>
          </>
        )}
      </div>
    </>
  );
}

export default VisualizationPanel;
