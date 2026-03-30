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

// ─────────────────────────────────────────────────────────────────────────────
// Mini circuit SVG constants
// ─────────────────────────────────────────────────────────────────────────────
const COL_W   = 68;
const LANE_H  = 72;
const LEFT_PAD = 72;
const TOP_PAD  = 18;
const BOT_PAD  = 28;
const GATE_W   = 38;
const GATE_H   = 30;
const GATE_R   = 6;
const TWO_Q_R  = 13;
const DOT_R    = 6;

function wireY(q: number) { return TOP_PAD + q * LANE_H + LANE_H / 2; }
function colX(c: number)  { return LEFT_PAD + c * COL_W + COL_W / 2; }
function gateCol(g: GateOperation) { return Math.max(0, Math.round(g.position.x / COL_W)); }

// ─────────────────────────────────────────────────────────────────────────────
// Mini circuit (read-only, highlights active gate)
// ─────────────────────────────────────────────────────────────────────────────
function MiniCircuitSVG({
  gates,
  qubits,
  activeGateIndex,
}: {
  gates: GateOperation[];
  qubits: number;
  activeGateIndex: number;
}) {
  const sorted  = [...gates].sort((a, b) => a.position.x - b.position.x);
  const maxCol  = sorted.reduce((m, g) => Math.max(m, gateCol(g)), -1);
  const numCols = Math.max(8, maxCol + 3);
  const svgW    = LEFT_PAD + numCols * COL_W + 18;
  const svgH    = TOP_PAD + qubits * LANE_H + BOT_PAD;
  const activeGate = activeGateIndex >= 0 ? sorted[activeGateIndex] : null;

  return (
    <div style={{ overflowX: "auto", overflowY: "hidden" }}>
      <svg width={svgW} height={svgH} style={{ display: "block" }}>
        <defs>
          <pattern id="mgrid" x="0" y="0" width="16" height="16" patternUnits="userSpaceOnUse">
            <circle cx="8" cy="8" r="0.6" fill="rgba(0,212,255,0.06)" />
          </pattern>
        </defs>
        <rect width={svgW} height={svgH} fill="url(#mgrid)" />

        {/* Wires */}
        {Array.from({ length: qubits }, (_, q) => {
          const y = wireY(q);
          return (
            <g key={`w${q}`}>
              <line x1={LEFT_PAD - 4} y1={y} x2={svgW - 8} y2={y} stroke="rgba(0,212,255,0.07)" strokeWidth="4" />
              <line x1={LEFT_PAD - 4} y1={y} x2={svgW - 8} y2={y} stroke="rgba(0,212,255,0.2)"  strokeWidth="1.2" />
              <text x={LEFT_PAD - 10} y={y + 1} textAnchor="end" dominantBaseline="middle"
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
          const glow  = lit ? `drop-shadow(0 0 12px ${color}cc)` : `drop-shadow(0 0 4px ${color}44)`;

          const connector = isTwoQubitGate(gate.type) && gate.control !== undefined ? (
            (() => {
              const cy = wireY(gate.control);
              return (
                <line x1={x} y1={Math.min(cy, ty)} x2={x} y2={Math.max(cy, ty)}
                  stroke={color} strokeWidth={lit ? "2" : "1.5"} opacity={lit ? 1 : 0.65}
                  style={{ filter: `drop-shadow(0 0 ${lit ? 6 : 3}px ${color}55)` }} />
              );
            })()
          ) : null;

          const controlDot = gate.control !== undefined && gate.type !== "SWAP" ? (
            <circle cx={x} cy={wireY(gate.control)} r={DOT_R} fill={color}
              style={{ filter: `drop-shadow(0 0 ${lit ? 10 : 6}px ${color}88)` }} />
          ) : null;

          let targetShape;
          if (gate.type === "CNOT") {
            targetShape = (
              <>
                <circle cx={x} cy={ty} r={TWO_Q_R}
                  fill={lit ? `${color}30` : `${color}12`}
                  stroke={color} strokeWidth={lit ? "2" : "1.5"} style={{ filter: glow }} />
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
                <rect x={x - GATE_W / 2} y={ty - GATE_H / 2} width={GATE_W} height={GATE_H} rx={GATE_R}
                  fill={lit ? `${color}30` : `${color}12`} stroke={color}
                  strokeWidth={lit ? "2" : "1.5"} style={{ filter: glow }} />
                {isMeasureGate(gate.type) ? (
                  <>
                    <path d={`M ${x - 9} ${ty + 3} A 9 9 0 0 1 ${x + 9} ${ty + 3}`}
                      stroke={color} strokeWidth="1.4" fill="none" />
                    <line x1={x} y1={ty + 3} x2={x + 8} y2={ty - 4} stroke={color} strokeWidth="1.4" strokeLinecap="round" />
                  </>
                ) : (
                  <text x={x} y={ty + 1} textAnchor="middle" dominantBaseline="middle"
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
                <circle cx={x} cy={ty} r={GATE_W / 2 + 6}
                  fill="none" stroke={color} strokeWidth="1" opacity="0.3"
                  style={{ filter: `drop-shadow(0 0 8px ${color})` }} />
              )}
            </g>
          );
        })}

        {/* Time axis */}
        <line x1={LEFT_PAD} y1={TOP_PAD + qubits * LANE_H + 6}
          x2={LEFT_PAD + numCols * COL_W} y2={TOP_PAD + qubits * LANE_H + 6}
          stroke="rgba(40,64,90,0.35)" strokeWidth="1" />
        {Array.from({ length: numCols }, (_, c) => (
          <text key={`t${c}`} x={colX(c)} y={TOP_PAD + qubits * LANE_H + 20}
            textAnchor="middle" fontFamily="JetBrains Mono, monospace" fontSize="9"
            fill="rgba(40,64,90,0.5)" style={{ userSelect: "none" }}>
            {c + 1}
          </text>
        ))}
      </svg>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Visualization modal (fullscreen overlay)
// ─────────────────────────────────────────────────────────────────────────────
function VisualizationModal({
  circuit,
  blochVectors,
  steps,
  currentStep,
  isPlaying,
  isVisualizing,
  speedMs,
  onPlay,
  onPause,
  onClose,
  onSpeedChange,
  onStepChange,
}: {
  circuit: { qubits: number; gates: GateOperation[] };
  blochVectors: ReturnType<typeof getBlochVectors>;
  steps: { gate_index: number; gate_type: string; statevector: unknown }[];
  currentStep: number;
  isPlaying: boolean;
  isVisualizing: boolean;
  speedMs: number;
  onPlay: () => void;
  onPause: () => void;
  onClose: () => void;
  onSpeedChange: (ms: number) => void;
  onStepChange: (step: number) => void;
}) {
  const sorted     = [...circuit.gates].sort((a, b) => a.position.x - b.position.x);
  const activeGate = currentStep >= 0 ? sorted[currentStep] : null;
  const gateLabel  = activeGate
    ? `${activeGate.type}${activeGate.theta !== undefined ? ` (${formatTheta(activeGate.theta)})` : ""} → q[${activeGate.target}]${activeGate.control !== undefined ? ` ctrl q[${activeGate.control}]` : ""}`
    : null;

  const progress = steps.length > 0 ? ((currentStep + 1) / steps.length) * 100 : 0;

  useEffect(() => {
    const h = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, [onClose]);

  return createPortal(
    <div
      style={{
        position: "fixed", inset: 0, zIndex: 9999,
        display: "flex", alignItems: "center", justifyContent: "center",
        background: "rgba(2,6,15,0.88)",
        backdropFilter: "blur(18px)", WebkitBackdropFilter: "blur(18px)",
        animation: "vizIn 0.2s ease",
      }}
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <style>{`
        @keyframes vizIn { from { opacity: 0 } to { opacity: 1 } }
      `}</style>

      <div style={{
        width: "min(96vw, 1340px)",
        height: "min(92vh, 860px)",
        background: "rgba(6,13,26,0.97)",
        border: "1px solid rgba(0,212,255,0.16)",
        borderRadius: 22,
        boxShadow: "0 0 0 1px rgba(0,212,255,0.06), 0 40px 120px rgba(0,0,0,0.9)",
        display: "flex", flexDirection: "column", overflow: "hidden",
      }}>

        {/* Header */}
        <div style={{
          flexShrink: 0, display: "flex", alignItems: "center",
          justifyContent: "space-between",
          padding: "12px 18px",
          borderBottom: "1px solid rgba(255,255,255,0.06)",
          background: "rgba(4,9,18,0.9)",
        }}>
          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            <div style={{
              width: 9, height: 9, borderRadius: "50%",
              background: isPlaying ? "#00d4ff" : "#28405a",
              boxShadow: isPlaying ? "0 0 10px #00d4ff" : "none",
              transition: "all 0.3s",
            }} />
            <span style={{ fontFamily: "Syne, sans-serif", fontWeight: 700, fontSize: 14, color: "#c8dff2" }}>
              Circuit Visualization
            </span>
            <span style={{
              fontFamily: "JetBrains Mono, monospace", fontSize: 10,
              color: "rgba(40,64,90,0.8)", padding: "2px 8px",
              borderRadius: 6, border: "1px solid rgba(255,255,255,0.06)",
              background: "rgba(2,6,15,0.6)",
            }}>
              {circuit.qubits}q · {circuit.gates.length} gates
            </span>
            {gateLabel && (
              <span style={{
                fontFamily: "JetBrains Mono, monospace", fontSize: 10,
                color: "#00d4ff", padding: "2px 10px", borderRadius: 6,
                border: "1px solid rgba(0,212,255,0.2)", background: "rgba(0,212,255,0.08)",
              }}>
                ▶ {gateLabel}
              </span>
            )}
          </div>

          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <span style={{ fontFamily: "JetBrains Mono, monospace", fontSize: 10, color: "rgba(40,64,90,0.7)" }}>
              {isVisualizing ? `step ${Math.max(currentStep + 1, 0)} / ${steps.length}` : "idle"}
            </span>
            <button
              type="button" onClick={onClose}
              style={{
                width: 30, height: 30, borderRadius: 7,
                border: "1px solid rgba(255,255,255,0.1)",
                background: "rgba(255,255,255,0.04)",
                color: "rgba(200,223,242,0.6)",
                cursor: "pointer", fontSize: 14,
                display: "flex", alignItems: "center", justifyContent: "center",
              }}
              onMouseEnter={e => {
                e.currentTarget.style.background = "rgba(255,56,96,0.12)";
                e.currentTarget.style.color = "#ff3860";
              }}
              onMouseLeave={e => {
                e.currentTarget.style.background = "rgba(255,255,255,0.04)";
                e.currentTarget.style.color = "rgba(200,223,242,0.6)";
              }}
            >
              ✕
            </button>
          </div>
        </div>

        {/* Progress bar */}
        <div style={{ flexShrink: 0, height: 2, background: "rgba(255,255,255,0.04)" }}>
          <div style={{
            height: "100%", width: `${progress}%`,
            background: "linear-gradient(90deg, #00d4ff, rgba(162,89,255,0.8))",
            transition: "width 0.3s ease",
            boxShadow: "0 0 8px rgba(0,212,255,0.5)",
          }} />
        </div>

        {/* Controls */}
        <div style={{
          flexShrink: 0, display: "flex", alignItems: "center", gap: 10,
          padding: "9px 18px",
          borderBottom: "1px solid rgba(255,255,255,0.05)",
          background: "rgba(4,9,18,0.7)",
        }}>
          <button
            type="button" onClick={isPlaying ? onPause : onPlay}
            disabled={steps.length === 0}
            style={{
              borderRadius: 8, padding: "5px 14px",
              fontFamily: "JetBrains Mono, monospace", fontSize: 11,
              cursor: steps.length === 0 ? "not-allowed" : "pointer",
              border: isPlaying ? "1px solid rgba(255,179,64,0.35)" : "1px solid rgba(0,212,255,0.35)",
              color: isPlaying ? "#ffcf7a" : "#00d4ff",
              background: isPlaying ? "rgba(255,179,64,0.1)" : "rgba(0,212,255,0.1)",
              opacity: steps.length === 0 ? 0.5 : 1, transition: "all 0.15s",
            }}
          >
            {isPlaying ? "⏸ Pause" : "▶ Play"}
          </button>

          <input type="range" min="0" max={Math.max(0, steps.length - 1)} step="1"
            value={Math.max(0, currentStep)}
            onChange={e => { onPause(); onStepChange(Number(e.target.value)); }}
            disabled={steps.length === 0}
            style={{ flex: 1, accentColor: "#00d4ff", cursor: "pointer" }} />

          <label style={{
            display: "flex", alignItems: "center", gap: 7,
            fontFamily: "JetBrains Mono, monospace", fontSize: 11,
            color: "rgba(200,223,242,0.55)",
          }}>
            Speed
            <input type="range" min="100" max="1500" step="100" value={speedMs}
              onChange={e => onSpeedChange(Number(e.target.value))}
              style={{ width: 72, accentColor: "#a259ff" }} />
            <span style={{ minWidth: 38 }}>{speedMs}ms</span>
          </label>

          <span style={{ fontFamily: "JetBrains Mono, monospace", fontSize: 10, color: "rgba(40,64,90,0.6)", marginLeft: "auto" }}>
            ESC to close
          </span>
        </div>

        {/* Split: circuit top, spheres bottom */}
        <div style={{ flex: 1, display: "flex", flexDirection: "column", minHeight: 0 }}>
          {/* Circuit */}
          <div style={{
            flex: "0 0 42%", maxHeight: "42%",
            borderBottom: "1px solid rgba(255,255,255,0.05)",
            background: "rgba(2,6,15,0.7)",
            overflow: "auto", padding: "10px 16px",
          }}>
            <div style={{
              fontFamily: "JetBrains Mono, monospace", fontSize: 9,
              color: "rgba(40,64,90,0.6)", letterSpacing: "0.08em",
              textTransform: "uppercase", marginBottom: 6,
            }}>
              Circuit · step {currentStep >= 0 ? currentStep + 1 : "—"} highlighted
            </div>
            <MiniCircuitSVG gates={circuit.gates} qubits={circuit.qubits} activeGateIndex={currentStep} />
          </div>

          {/* Bloch spheres */}
          <div style={{
            flex: 1, overflow: "auto", padding: "14px 18px",
          }}>
            <div style={{
              fontFamily: "JetBrains Mono, monospace", fontSize: 9,
              color: "rgba(40,64,90,0.6)", letterSpacing: "0.08em",
              textTransform: "uppercase", marginBottom: 10,
            }}>
              Qubit state vectors · live
            </div>
            <div style={{
              display: "grid",
              gridTemplateColumns: `repeat(${Math.min(circuit.qubits, 6)}, 1fr)`,
              gap: 12,
            }}>
              {blochVectors.map((vector, i) => (
                <div key={i}>
                  <div style={{
                    fontFamily: "JetBrains Mono, monospace", fontSize: 10,
                    color: "rgba(200,223,242,0.45)", textAlign: "center", marginBottom: 6,
                  }}>
                    Qubit {i}
                  </div>
                  <BlochSphere label={`q[${i}]`} vector={vector} active={isPlaying} />
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>,
    document.body
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Main VisualizationPanel
// ─────────────────────────────────────────────────────────────────────────────
export default function VisualizationPanel() {
  const activeCircuit = useCircuitStore((s) => s.activeCircuit);
  const circuit       = useCircuitStore((s) => s.circuits[s.activeCircuit]);

  const {
    currentStep, visualizationResult, isVisualizing, isPlaying, speedMs,
    setCurrentStep, setVisualizationResult, setIsVisualizing,
    setIsPlaying, setSpeedMs, resetVisualization,
  } = useVisualizationStore();

  const [modalOpen, setModalOpen] = useState(false);
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
      <div
        style={{
          background: "rgba(6,13,26,0.85)",
          border: "1px solid rgba(255,255,255,0.07)",
          borderRadius: 22,
          overflow: "hidden",
          boxShadow: "0 0 0 1px rgba(0,212,255,0.04), 0 16px 48px rgba(0,0,0,0.55)",
        }}
      >
        {/* Panel header */}
        <div style={{
          display: "flex", justifyContent: "space-between", alignItems: "center",
          padding: "12px 18px",
          background: "rgba(4,9,18,0.7)",
          borderBottom: collapsed ? "none" : "1px solid rgba(255,255,255,0.06)",
        }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <span style={{ fontFamily: "Syne, sans-serif", fontWeight: 700, fontSize: 14, color: "#c8dff2" }}>
              Visualization
            </span>
            <span style={{
              fontFamily: "JetBrains Mono, monospace", fontSize: 10,
              color: isVisualizing ? "#00d4ff" : "rgba(40,64,90,0.7)",
            }}>
              {isVisualizing ? `step ${Math.max(currentStep + 1, 0)}/${steps.length}` : "idle"}
            </span>
          </div>

          <div style={{ display: "flex", gap: 8 }}>
            <button type="button" onClick={startVisualization} style={{
              borderRadius: 10, padding: "6px 14px",
              fontFamily: "JetBrains Mono, monospace", fontSize: 11, cursor: "pointer",
              border: "1px solid rgba(0,229,160,0.34)",
              background: "linear-gradient(135deg,rgba(0,229,160,0.18),rgba(0,229,160,0.07))",
              color: "#00e5a0",
            }}>
              Visualize
            </button>
            <button type="button" onClick={() => setCollapsed(v => !v)} style={{
              borderRadius: 10, padding: "6px 12px",
              fontFamily: "JetBrains Mono, monospace", fontSize: 11, cursor: "pointer",
              border: "1px solid rgba(255,255,255,0.1)",
              color: "rgba(200,223,242,0.7)", background: "rgba(255,255,255,0.04)",
            }}>
              {collapsed ? "Expand" : "Collapse"}
            </button>
          </div>
        </div>

        {!collapsed && (
          <>
            {/* Playback controls */}
            <div style={{
              display: "flex", gap: 10, padding: "10px 18px", alignItems: "center",
              borderBottom: "1px solid rgba(255,255,255,0.05)",
              background: "rgba(4,9,18,0.5)",
            }}>
              <button type="button" onClick={play} disabled={steps.length === 0} style={{
                borderRadius: 8, padding: "5px 10px",
                fontFamily: "JetBrains Mono, monospace", fontSize: 11, cursor: "pointer",
                border: "1px solid rgba(0,212,255,0.35)", color: "#c8dff2",
                background: "rgba(0,212,255,0.1)",
                opacity: steps.length === 0 ? 0.4 : 1,
              }}>Play</button>
              <button type="button" onClick={pause} disabled={steps.length === 0} style={{
                borderRadius: 8, padding: "5px 10px",
                fontFamily: "JetBrains Mono, monospace", fontSize: 11, cursor: "pointer",
                border: "1px solid rgba(255,179,64,0.35)", color: "#ffcf7a",
                background: "rgba(255,179,64,0.1)",
                opacity: steps.length === 0 ? 0.4 : 1,
              }}>Pause</button>
              <span style={{ fontFamily: "JetBrains Mono, monospace", fontSize: 11, color: "rgba(200,223,242,0.55)" }}>Speed</span>
              <input type="range" min="200" max="1500" step="100" value={speedMs}
                onChange={e => setSpeedMs(Number(e.target.value))}
                style={{ accentColor: "#00d4ff", width: 90 }} />
              <span style={{ fontFamily: "JetBrains Mono, monospace", fontSize: 11, color: "rgba(200,223,242,0.55)" }}>
                {speedMs}ms
              </span>
            </div>

            {/* Bloch sphere grid */}
            <div style={{ padding: "16px 18px" }}>
              {blochVectors.length === 0 ? (
                <div style={{
                  textAlign: "center", padding: "32px 0",
                  fontFamily: "JetBrains Mono, monospace", fontSize: 11,
                  color: "rgba(40,64,90,0.6)",
                }}>
                  Run "Visualize" to see live qubit states
                </div>
              ) : (
                <div style={{
                  display: "grid",
                  gridTemplateColumns: `repeat(${Math.min(circuit.qubits, 6)}, minmax(0, 1fr))`,
                  gap: 12,
                }}>
                  {blochVectors.map((vector, i) => (
                    <div key={i}>
                      <div style={{
                        fontFamily: "JetBrains Mono, monospace", fontSize: 10,
                        color: "rgba(200,223,242,0.4)", textAlign: "center",
                        marginBottom: 6, letterSpacing: "0.04em",
                      }}>
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