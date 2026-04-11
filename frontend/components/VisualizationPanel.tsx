"use client";

import { useCallback, useEffect, useRef, useState, useMemo } from "react";
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
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, Cell,
} from "recharts";
import type { ComplexAmplitude, GateOperation, SimulationStep } from "@/lib/types";

// ─── Mini-circuit layout constants ───────────────────────────────────────────
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

function wireY(q: number) { return TOP_PAD + q * LANE_H + LANE_H / 2; }
function colX(c: number)  { return LEFT_PAD + c * COL_W + COL_W / 2; }
function gateCol(g: GateOperation) { return Math.max(0, Math.round(g.position.x / COL_W)); }

// ─────────────────────────────────────────────────────────────────────────────
// MiniCircuitSVG  — read-only, highlights and glows the active gate
// ─────────────────────────────────────────────────────────────────────────────
//
// Three-layer glow system on the active gate:
//   1. Column ambient glow — a blurred ellipse behind the full column, pulsing softly
//   2. Gate shape glow — SVG filter (feGaussianBlur + feMerge) applied to the active shape
//   3. Expanding ring — two <circle> elements animated with @keyframes ring-expand
//      that radiate outward from the gate centre then fade, like a sonar ping
//
function MiniCircuitSVG({
  gates,
  qubits,
  activeGateIndex,
}: {
  gates: GateOperation[];
  qubits: number;
  activeGateIndex: number;
}) {
  const sorted     = [...gates].sort((a, b) => a.position.x - b.position.x);
  const maxCol     = sorted.reduce((m, g) => Math.max(m, gateCol(g)), -1);
  const numCols    = Math.max(8, maxCol + 3);
  const svgW       = LEFT_PAD + numCols * COL_W + 18;
  const svgH       = TOP_PAD + qubits * LANE_H + BOT_PAD;
  const activeGate = activeGateIndex >= 0 ? sorted[activeGateIndex] : null;
  const activeColor = activeGate ? (GATE_COLOR[activeGate.type] ?? "#3B82F6") : "#3B82F6";

  return (
    <div style={{ overflowX: "auto", overflowY: "hidden", minHeight: svgH }}>
      <style>{`
        @keyframes col-glow {
          0%,100% { opacity: 0.10; }
          50%      { opacity: 0.30; }
        }
        @keyframes gate-halo {
          0%,100% { opacity: 0.22; }
          50%      { opacity: 0.50; }
        }
        @keyframes ring-expand {
          0%   { r: 18px; opacity: 0.75; }
          100% { r: 38px; opacity: 0;   }
        }
        @keyframes ring-expand2 {
          0%   { r: 18px; opacity: 0.50; }
          100% { r: 38px; opacity: 0;   }
        }
      `}</style>

      <svg width={svgW} height={svgH} style={{ display: "block" }}>
        <defs>
          <pattern id="mgrid" x="0" y="0" width="16" height="16" patternUnits="userSpaceOnUse">
            <circle cx="8" cy="8" r="0.6" fill="rgba(59,130,246,0.06)" />
          </pattern>

          {/* Gate glow filter — blurs the shape behind itself */}
          <filter id="gate-glow-filter" x="-80%" y="-80%" width="260%" height="260%">
            <feGaussianBlur in="SourceGraphic" stdDeviation="5" result="blur" />
            <feMerge>
              <feMergeNode in="blur" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>

          {/* Ambient column blur */}
          <filter id="col-blur" x="-50%" y="-30%" width="200%" height="160%">
            <feGaussianBlur stdDeviation="12" />
          </filter>
        </defs>

        <rect width={svgW} height={svgH} fill="url(#mgrid)" />

        {/* ── 1. Column ambient glow ── */}
        {activeGate && (() => {
          const col = gateCol(activeGate);
          const cx  = colX(col);
          return (
            <>
              {/* Blurred radial fill */}
              <ellipse
                cx={cx}
                cy={TOP_PAD + (qubits * LANE_H) / 2}
                rx={COL_W * 0.6}
                ry={qubits * LANE_H * 0.52}
                fill={activeColor}
                filter="url(#col-blur)"
                style={{ animation: "col-glow 1.1s ease-in-out infinite" }}
              />
              {/* Subtle column rect border */}
              <rect
                x={LEFT_PAD + col * COL_W + 6} y={TOP_PAD}
                width={COL_W - 12} height={qubits * LANE_H}
                rx={8}
                fill={activeColor}
                fillOpacity={0.06}
                stroke={activeColor}
                strokeWidth="1"
                strokeOpacity={0.25}
              />
            </>
          );
        })()}

        {/* ── Quantum wires ── */}
        {Array.from({ length: qubits }, (_, q) => {
          const y = wireY(q);
          return (
            <g key={`w${q}`}>
              <line x1={LEFT_PAD - 4} y1={y} x2={svgW - 8} y2={y}
                stroke="#3B82F6" strokeWidth="3" opacity="0.07" />
              <line x1={LEFT_PAD - 4} y1={y} x2={svgW - 8} y2={y}
                stroke="#3B82F6" strokeWidth="1.2" opacity="0.22" />
              <text x={LEFT_PAD - 10} y={y + 1}
                textAnchor="end" dominantBaseline="middle"
                fontFamily="JetBrains Mono, monospace" fontSize="11" fill="#6B7280"
                style={{ userSelect: "none" }}>
                q[{q}]
              </text>
            </g>
          );
        })}

        {/* ── Gates ── */}
        {sorted.map((gate, idx) => {
          const lit         = idx === activeGateIndex;
          const color       = GATE_COLOR[gate.type] ?? "#3B82F6";
          const x           = colX(gateCol(gate));
          const ty          = wireY(gate.target);
          const fillOpacity = lit ? 0.30 : 0.11;
          const strokeW     = lit ? "2.5"  : "1.5";
          const glowFilter  = lit ? "url(#gate-glow-filter)" : undefined;

          // Two-qubit connector
          const connector = isTwoQubitGate(gate.type) && gate.control !== undefined ? (() => {
            const cy = wireY(gate.control);
            return (
              <line
                x1={x} y1={Math.min(cy, ty)} x2={x} y2={Math.max(cy, ty)}
                stroke={color} strokeWidth={lit ? "2.5" : "1.5"}
                opacity={lit ? 1 : 0.65}
                style={lit ? { filter: `drop-shadow(0 0 6px ${color})` } : undefined}
              />
            );
          })() : null;

          // Control dot
          const controlDot = gate.control !== undefined && gate.type !== "SWAP" ? (
            <circle cx={x} cy={wireY(gate.control)} r={DOT_R}
              fill={color}
              style={lit ? { filter: `drop-shadow(0 0 10px ${color})` } : undefined}
            />
          ) : null;

          // Target shape
          let targetShape: React.ReactNode;

          if (gate.type === "CNOT") {
            targetShape = (
              <>
                <circle cx={x} cy={ty} r={TWO_Q_R}
                  fill={color} fillOpacity={fillOpacity}
                  stroke={color} strokeWidth={strokeW}
                  style={{ filter: glowFilter }}
                />
                <line x1={x - TWO_Q_R + 4} y1={ty} x2={x + TWO_Q_R - 4} y2={ty}
                  stroke={color} strokeWidth="1.5" />
                <line x1={x} y1={ty - TWO_Q_R + 4} x2={x} y2={ty + TWO_Q_R - 4}
                  stroke={color} strokeWidth="1.5" />
              </>
            );
          } else if (gate.type === "CZ") {
            targetShape = (
              <circle cx={x} cy={ty} r={DOT_R}
                fill={color}
                style={{ filter: glowFilter }}
              />
            );
          } else if (gate.type === "SWAP") {
            const cy2 = gate.control !== undefined ? wireY(gate.control) : ty;
            const r   = 7;
            targetShape = (
              <g style={{ filter: glowFilter }}>
                {[ty, cy2].map((wy, i) => (
                  <g key={i}>
                    <line x1={x - r} y1={wy - r} x2={x + r} y2={wy + r}
                      stroke={color} strokeWidth="2" strokeLinecap="round" />
                    <line x1={x + r} y1={wy - r} x2={x - r} y2={wy + r}
                      stroke={color} strokeWidth="2" strokeLinecap="round" />
                  </g>
                ))}
              </g>
            );
          } else {
            const lbl = isMeasureGate(gate.type) ? "" : gate.type.slice(0, 3);
            targetShape = (
              <>
                <rect x={x - GATE_W / 2} y={ty - GATE_H / 2}
                  width={GATE_W} height={GATE_H} rx={GATE_R}
                  fill={color} fillOpacity={fillOpacity}
                  stroke={color} strokeWidth={strokeW}
                  style={{ filter: glowFilter }}
                />
                {isMeasureGate(gate.type) ? (
                  <>
                    <path d={`M ${x - 9} ${ty + 3} A 9 9 0 0 1 ${x + 9} ${ty + 3}`}
                      stroke={color} strokeWidth="1.4" fill="none" />
                    <line x1={x} y1={ty + 3} x2={x + 8} y2={ty - 4}
                      stroke={color} strokeWidth="1.4" strokeLinecap="round" />
                  </>
                ) : (
                  <text x={x} y={ty + 1}
                    textAnchor="middle" dominantBaseline="middle"
                    fontFamily="Syne, sans-serif" fontWeight="700"
                    fontSize={lbl.length > 2 ? "9" : "11"}
                    fill={color} style={{ userSelect: "none" }}>
                    {lbl}
                    {isParametricGate(gate.type) && gate.theta !== undefined && (
                      <tspan x={x} dy="9" fontSize="7" opacity="0.7">
                        {formatTheta(gate.theta)}
                      </tspan>
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

              {/* ── 2 + 3. Gate glow layers (lit gate only) ── */}
              {lit && (
                <>
                  {/* Pulsing halo disc */}
                  <circle cx={x} cy={ty} r="22"
                    fill={color}
                    style={{ animation: "gate-halo 1s ease-in-out infinite" }}
                  />
                  {/* Expanding ring wave — first ping */}
                  <circle cx={x} cy={ty}
                    fill="none" stroke={color} strokeWidth="1.8"
                    style={{ animation: "ring-expand 1s ease-out infinite" }}
                  />
                  {/* Expanding ring wave — second ping (offset 0.5s) */}
                  <circle cx={x} cy={ty}
                    fill="none" stroke={color} strokeWidth="1.2"
                    style={{ animation: "ring-expand2 1s ease-out 0.5s infinite" }}
                  />
                </>
              )}
            </g>
          );
        })}

        {/* Column tick numbers */}
        {sorted.map((gate, idx) => {
          const col = gateCol(gate);
          return (
            <text key={`tick-${idx}`}
              x={colX(col)} y={TOP_PAD + qubits * LANE_H + 18}
              textAnchor="middle"
              fontFamily="JetBrains Mono, monospace" fontSize="9"
              fill={idx === activeGateIndex ? activeColor : "rgba(107,114,128,0.45)"}>
              {idx + 1}
            </text>
          );
        })}

        {/* Time axis */}
        <line
          x1={LEFT_PAD} y1={TOP_PAD + qubits * LANE_H + 6}
          x2={LEFT_PAD + numCols * COL_W} y2={TOP_PAD + qubits * LANE_H + 6}
          stroke="rgba(107,114,128,0.2)" strokeWidth="1"
        />
      </svg>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// LiveHistogram
// Reads the statevector at the current simulation step and renders
// basis-state probabilities as a bar chart. Updates in real-time as
// the playback advances gate by gate.
// ─────────────────────────────────────────────────────────────────────────────
function LiveHistogram({
  statevector,
  qubits,
  isPlaying,
}: {
  statevector: ComplexAmplitude[] | [number, number][] | null;
  qubits: number;
  isPlaying: boolean;
}) {
  const getProbability = (amp: ComplexAmplitude | [number, number] | number) => {
    if (Array.isArray(amp) && amp.length >= 2) {
      return amp[0] ** 2 + amp[1] ** 2;
    }

    if (typeof amp === "number") {
      return amp ** 2;
    }

    if (amp && typeof amp === "object" && "real" in amp && "imag" in amp) {
      return amp.real ** 2 + amp.imag ** 2;
    }

    return 0;
  };

  // Build probability data from the statevector.
  const data = useMemo(() => {
    if (!Array.isArray(statevector) || statevector.length === 0) return [];
    return statevector.map((amp, i) => {
      const prob = getProbability(amp);
      return {
        state: i.toString(2).padStart(qubits, "0"),
        probability: Math.min(1, Math.max(0, prob)),
      };
    });
  }, [statevector, qubits]);

  if (data.length === 0) {
    return (
      <div style={{
        height: 200,
        display: "flex", alignItems: "center", justifyContent: "center",
        fontFamily: "JetBrains Mono, monospace", fontSize: 10, color: "#9CA3AF",
        border: "1px dashed #DBEAFE", borderRadius: 12, background: "#F8FBFF",
      }}>
        Statevector updates as each gate is applied — press Play or scrub the slider
      </div>
    );
  }

  const maxProb = Math.max(...data.map((d) => d.probability), 0.001);
  // Top states for the summary pill strip
  const topStates = [...data]
    .sort((a, b) => b.probability - a.probability)
    .slice(0, 5)
    .filter((d) => d.probability > 0.001);

  return (
    <div>
      {/* Section label */}
      <div style={{
        display: "flex", alignItems: "center", gap: 8, marginBottom: 10,
        fontFamily: "JetBrains Mono, monospace", fontSize: 9,
        color: "#6B7280", textTransform: "uppercase", letterSpacing: "0.08em",
      }}>
        Basis-state probabilities · live
        {isPlaying && (
          <span style={{
            width: 7, height: 7, borderRadius: "50%",
            background: "#3B82F6", display: "inline-block",
            animation: "live-dot 1s ease-in-out infinite",
          }} />
        )}
      </div>

      {/* Bar chart */}
      <div style={{ height: 200 }}>
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={data} margin={{ top: 4, right: 4, left: -12, bottom: 0 }}>
            <defs>
              {/* Dominant state gradient */}
              <linearGradient id="lh-dominant" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%"   stopColor="#2563EB" stopOpacity={1}    />
                <stop offset="100%" stopColor="#60A5FA" stopOpacity={0.45} />
              </linearGradient>
              {/* Normal state gradient */}
              <linearGradient id="lh-normal" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%"   stopColor="#93C5FD" stopOpacity={0.7} />
                <stop offset="100%" stopColor="#DBEAFE" stopOpacity={0.25} />
              </linearGradient>
            </defs>

            <CartesianGrid stroke="#F1F5F9" horizontal vertical={false} />

            <XAxis
              dataKey="state"
              stroke="#D1D5DB" tickLine={false} axisLine={false}
              tick={{ fontFamily: "JetBrains Mono, monospace", fontSize: 9, fill: "#6B7280" }}
              tickFormatter={(v: string) => `|${v}⟩`}
              interval={0}
              angle={data.length > 8 ? -30 : 0}
              textAnchor={data.length > 8 ? "end" : "middle"}
              height={data.length > 8 ? 48 : 26}
            />

            <YAxis
              stroke="#D1D5DB" tickLine={false} axisLine={false}
              domain={[0, 1]}
              tick={{ fontFamily: "JetBrains Mono, monospace", fontSize: 9, fill: "#9CA3AF" }}
              tickFormatter={(v: number) => `${Math.round(v * 100)}%`}
            />

            <Tooltip
              cursor={{ fill: "rgba(59,130,246,0.04)" }}
              animationDuration={120}
              content={({ active, payload, label }) => {
                if (!active || !payload?.length) return null;
                const prob = (payload[0]?.value as number) ?? 0;
                return (
                  <div style={{
                    background: "#FFFFFF",
                    border: "1px solid #BFDBFE",
                    borderRadius: 10,
                    padding: "8px 14px",
                    boxShadow: "0 4px 16px rgba(59,130,246,0.12)",
                  }}>
                    <div style={{ fontFamily: "JetBrains Mono, monospace", fontSize: 10, color: "#3B82F6", marginBottom: 3 }}>
                      |{label}⟩
                    </div>
                    <div style={{ fontFamily: "Syne, sans-serif", fontWeight: 700, fontSize: 20, color: "#1F2937" }}>
                      {(prob * 100).toFixed(2)}%
                    </div>
                    <div style={{ fontFamily: "JetBrains Mono, monospace", fontSize: 9, color: "#6B7280", marginTop: 2 }}>
                      amplitude² = {prob.toFixed(4)}
                    </div>
                  </div>
                );
              }}
            />

            <Bar
              dataKey="probability"
              radius={[5, 5, 0, 0]}
              maxBarSize={44}
              animationDuration={250}
              animationEasing="ease-out"
            >
              {data.map((entry) => (
                <Cell
                  key={entry.state}
                  fill={
                    entry.probability >= maxProb * 0.95
                      ? "url(#lh-dominant)"
                      : "url(#lh-normal)"
                  }
                  stroke={
                    entry.probability >= maxProb * 0.95
                      ? "#2563EB"
                      : "transparent"
                  }
                  strokeWidth={entry.probability >= maxProb * 0.95 ? 1.5 : 0}
                />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>

      {/* Top states summary pills */}
      {topStates.length > 0 && (
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginTop: 10 }}>
          {topStates.map((d) => (
            <div key={d.state} style={{
              background: d.probability >= maxProb * 0.95 ? "#EFF6FF" : "#F9FAFB",
              border: `1px solid ${d.probability >= maxProb * 0.95 ? "#BFDBFE" : "#E5E7EB"}`,
              borderRadius: 999,
              padding: "3px 10px",
              fontFamily: "JetBrains Mono, monospace",
              fontSize: 9,
              color: d.probability >= maxProb * 0.95 ? "#1D4ED8" : "#6B7280",
            }}>
              |{d.state}⟩ {(d.probability * 100).toFixed(1)}%
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// VisualizationModal
// Full-screen overlay with:
//   • MiniCircuitSVG (with gate glow)
//   • Tab strip: "Bloch Spheres" | "Histogram"
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
  steps: SimulationStep[];
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
  const [vizTab, setVizTab] = useState<"bloch" | "histogram">("bloch");

  const sorted      = [...circuit.gates].sort((a, b) => a.position.x - b.position.x);
  const activeGate  = currentStep >= 0 ? sorted[currentStep] : null;
  const gateColor   = activeGate ? (GATE_COLOR[activeGate.type] ?? "#3B82F6") : "#3B82F6";
  const gateLabel   = activeGate
    ? `${activeGate.type}${activeGate.theta !== undefined ? ` (${formatTheta(activeGate.theta)})` : ""} → q[${activeGate.target}]${activeGate.control !== undefined ? ` ctrl q[${activeGate.control}]` : ""}`
    : null;

  const progress           = steps.length > 0 ? ((currentStep + 1) / steps.length) * 100 : 0;
  const activeStatevector  = currentStep >= 0 ? steps[currentStep]?.statevector : null;

  // Escape to close
  useEffect(() => {
    const h = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, [onClose]);

  return createPortal(
    <div
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
      style={{
        position: "fixed", inset: 0, zIndex: 9999,
        display: "flex", alignItems: "center", justifyContent: "center",
        background: "rgba(15,23,42,0.72)",
        backdropFilter: "blur(12px)",
        animation: "vizIn 0.18s ease",
      }}
    >
      <style>{`
        @keyframes vizIn    { from { opacity:0; transform:scale(0.97) } to { opacity:1; transform:scale(1) } }
        @keyframes live-dot { 0%,100%{opacity:1} 50%{opacity:0.25} }
      `}</style>

      {/* Modal shell */}
      <div style={{
        width: "min(96vw, 1340px)",
        height: "min(94vh, 920px)",
        background: "#FFFFFF",
        border: "1px solid #E5E7EB",
        borderRadius: 20,
        boxShadow: "0 32px 80px rgba(15,23,42,0.22)",
        display: "flex", flexDirection: "column",
        overflow: "hidden",
      }}>

        {/* ── Header ── */}
        <div style={{
          flexShrink: 0, display: "flex", alignItems: "center",
          justifyContent: "space-between",
          padding: "12px 18px",
          borderBottom: "1px solid #E5E7EB",
          background: "#F9FAFB",
        }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
            {/* Live indicator dot */}
            <span style={{
              width: 9, height: 9, borderRadius: "50%", flexShrink: 0,
              background: isPlaying ? "#3B82F6" : "#D1D5DB",
              display: "inline-block",
              boxShadow: isPlaying ? "0 0 0 3px rgba(59,130,246,0.2)" : "none",
              animation: isPlaying ? "live-dot 1.1s ease-in-out infinite" : "none",
              transition: "all 0.3s",
            }} />
            <span style={{ fontFamily: "Syne, sans-serif", fontWeight: 700, fontSize: 15, color: "#1F2937" }}>
              Circuit Visualization
            </span>
            <span style={{
              fontFamily: "JetBrains Mono, monospace", fontSize: 9,
              color: "#6B7280", padding: "2px 8px",
              borderRadius: 6, border: "1px solid #E5E7EB",
            }}>
              {circuit.qubits}q · {circuit.gates.length} gates
            </span>
            {/* Active gate label */}
            {gateLabel && (
              <span style={{
                fontFamily: "JetBrains Mono, monospace", fontSize: 10,
                color: gateColor, padding: "3px 10px", borderRadius: 6,
                border: `1px solid ${gateColor}40`,
                background: `${gateColor}12`,
              }}>
                ▶ {gateLabel}
              </span>
            )}
          </div>

          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <span style={{ fontFamily: "JetBrains Mono, monospace", fontSize: 10, color: "#9CA3AF" }}>
              {isVisualizing
                ? `step ${Math.max(currentStep + 1, 0)} / ${steps.length}`
                : "idle"} · ESC to close
            </span>
            <button
              type="button" onClick={onClose}
              style={{
                width: 30, height: 30, borderRadius: 7,
                border: "1px solid #E5E7EB",
                background: "#FFFFFF", color: "#6B7280",
                cursor: "pointer", fontSize: 15,
                display: "flex", alignItems: "center", justifyContent: "center",
                transition: "all 0.12s",
              }}
              onMouseEnter={(e) => { e.currentTarget.style.background = "#FEF2F2"; e.currentTarget.style.color = "#EF4444"; }}
              onMouseLeave={(e) => { e.currentTarget.style.background = "#FFFFFF"; e.currentTarget.style.color = "#6B7280"; }}
            >✕</button>
          </div>
        </div>

        {/* ── Progress bar ── */}
        <div style={{ flexShrink: 0, height: 3, background: "#F1F5F9" }}>
          <div style={{
            height: "100%",
            width: `${progress}%`,
            background: `linear-gradient(90deg, ${gateColor}, ${gateColor}80)`,
            transition: "width 0.3s ease, background 0.4s",
            boxShadow: `0 0 8px ${gateColor}50`,
          }} />
        </div>

        {/* ── Playback controls ── */}
        <div style={{
          flexShrink: 0, display: "flex", alignItems: "center", gap: 10,
          padding: "9px 18px", borderBottom: "1px solid #E5E7EB",
          background: "#F9FAFB", flexWrap: "wrap",
        }}>
          <button
            type="button"
            onClick={isPlaying ? onPause : onPlay}
            disabled={steps.length === 0}
            style={{
              borderRadius: 8, padding: "6px 16px",
              fontFamily: "JetBrains Mono, monospace", fontSize: 11, fontWeight: 600,
              cursor: steps.length === 0 ? "not-allowed" : "pointer",
              border: isPlaying ? "1px solid #FDE68A" : "1px solid #BFDBFE",
              color: isPlaying ? "#92400E" : "#1D4ED8",
              background: isPlaying ? "#FFFBEB" : "#EFF6FF",
              opacity: steps.length === 0 ? 0.5 : 1, transition: "all 0.15s",
            }}
          >
            {isPlaying ? "⏸ Pause" : "▶ Play"}
          </button>

          {/* Step scrubber */}
          <input
            type="range" min="0" max={Math.max(0, steps.length - 1)} step="1"
            value={Math.max(0, currentStep)}
            onChange={(e) => { onPause(); onStepChange(Number(e.target.value)); }}
            disabled={steps.length === 0}
            style={{ flex: 1, accentColor: "#3B82F6", cursor: "pointer" }}
          />

          {/* Speed */}
          <label style={{
            display: "flex", alignItems: "center", gap: 7,
            fontFamily: "JetBrains Mono, monospace", fontSize: 10, color: "#6B7280",
          }}>
            Speed
            <input
              type="range" min="100" max="1500" step="100" value={speedMs}
              onChange={(e) => onSpeedChange(Number(e.target.value))}
              style={{ width: 72, accentColor: "#3B82F6" }}
            />
            <span style={{ minWidth: 42, color: "#374151" }}>{speedMs}ms</span>
          </label>
        </div>

        {/* ── Body ── */}
        <div style={{ flex: 1, display: "flex", flexDirection: "column", minHeight: 0, overflow: "hidden" }}>

          {/* Circuit strip */}
          <div style={{
            flexShrink: 0,
            borderBottom: "1px solid #E5E7EB",
            background: "#FAFAFA",
            overflow: "auto",
            padding: "10px 16px",
            maxHeight: "44%",
          }}>
            <div style={{
              fontFamily: "JetBrains Mono, monospace", fontSize: 9,
              color: "#9CA3AF", letterSpacing: "0.08em",
              textTransform: "uppercase", marginBottom: 6,
            }}>
              Circuit · step {currentStep >= 0 ? currentStep + 1 : "—"} highlighted
            </div>
            <MiniCircuitSVG
              gates={circuit.gates}
              qubits={circuit.qubits}
              activeGateIndex={currentStep}
            />
          </div>

          {/* Visualization panel */}
          <div style={{ flex: 1, overflow: "auto", padding: "14px 18px" }}>

            {/* ── Tab strip ── */}
            <div style={{
              display: "flex", gap: 4, marginBottom: 14,
              borderBottom: "1px solid #E5E7EB", paddingBottom: 10,
              alignItems: "center", justifyContent: "space-between",
            }}>
              <div style={{ display: "flex", gap: 4 }}>
                {(["bloch", "histogram"] as const).map((tab) => {
                  const active = vizTab === tab;
                  return (
                    <button
                      key={tab}
                      type="button"
                      onClick={() => setVizTab(tab)}
                      style={{
                        borderRadius: 8,
                        border: `1px solid ${active ? "#BFDBFE" : "#E5E7EB"}`,
                        background: active ? "#EFF6FF" : "#FFFFFF",
                        color: active ? "#1D4ED8" : "#6B7280",
                        padding: "5px 16px",
                        fontFamily: "JetBrains Mono, monospace",
                        fontSize: 10, fontWeight: active ? 600 : 400,
                        cursor: "pointer", transition: "all 0.13s",
                        letterSpacing: "0.04em",
                      }}
                    >
                      {tab === "bloch" ? "⊙  Bloch Spheres" : "▦  Histogram"}
                    </button>
                  );
                })}
              </div>

              {/* Gate context pill */}
              {activeGate && (
                <div style={{
                  display: "flex", alignItems: "center", gap: 6,
                  fontFamily: "JetBrains Mono, monospace", fontSize: 9, color: "#6B7280",
                }}>
                  <span style={{
                    width: 7, height: 7, borderRadius: "50%",
                    background: gateColor, display: "inline-block",
                    animation: isPlaying ? "live-dot 1s ease-in-out infinite" : "none",
                  }} />
                  Applying{" "}
                  <strong style={{ color: gateColor }}>{activeGate.type}</strong>
                  {" "}on q[{activeGate.target}]
                  {activeGate.control !== undefined && (
                    <> ctrl q[{activeGate.control}]</>
                  )}
                </div>
              )}
            </div>

            {/* ── Bloch Spheres ── */}
            {vizTab === "bloch" && (
              blochVectors.length === 0 ? (
                <div style={{
                  height: 160, display: "flex", alignItems: "center", justifyContent: "center",
                  fontFamily: "JetBrains Mono, monospace", fontSize: 10, color: "#9CA3AF",
                  border: "1px dashed #E5E7EB", borderRadius: 12,
                }}>
                  Run "Visualize" to see live qubit states
                </div>
              ) : (
                <div style={{
                  display: "grid",
                  gridTemplateColumns: `repeat(${Math.min(circuit.qubits, 6)}, 1fr)`,
                  gap: 12,
                }}>
                  {blochVectors.map((vector, i) => (
                    <div key={i}>
                      <div style={{
                        fontFamily: "JetBrains Mono, monospace", fontSize: 9,
                        color: "#6B7280", textAlign: "center",
                        marginBottom: 5, textTransform: "uppercase", letterSpacing: "0.04em",
                      }}>
                        q[{i}]
                      </div>
                      <BlochSphere label={`q[${i}]`} vector={vector} active={isPlaying} />
                    </div>
                  ))}
                </div>
              )
            )}

            {/* ── Histogram ── */}
            {vizTab === "histogram" && (
              <LiveHistogram
                statevector={activeStatevector}
                qubits={circuit.qubits}
                isPlaying={isPlaying}
              />
            )}
          </div>
        </div>
      </div>
    </div>,
    document.body
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Main VisualizationPanel (inline, collapsed by default)
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
  useEffect(() => { resetVisualization(); }, [activeCircuit, circuit.gates, circuit.qubits, resetVisualization]);

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
      let i = currentStep < 0 ? 0 : currentStep;
      while (playingRef.current && i < steps.length) {
        setCurrentStep(i);
        await new Promise((r) => window.setTimeout(r, speedRef.current));
        i += 1;
        if (tokenRef.current !== token) return;
      }
      if (i >= steps.length) { setIsPlaying(false); setIsVisualizing(false); }
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

      {/* ── Inline panel (compact) ── */}
      <div style={{
        background: "#FFFFFF",
        border: "1px solid #E5E7EB",
        borderRadius: 12,
        overflow: "hidden",
        boxShadow: "0 4px 24px rgba(15,23,42,0.06)",
      }}>
        <div style={{
          display: "flex", justifyContent: "space-between", alignItems: "center",
          padding: "14px 18px",
          borderBottom: collapsed ? "none" : "1px solid #E5E7EB",
          background: "#F9FAFB",
        }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <span style={{ fontFamily: "Syne, sans-serif", fontWeight: 700, fontSize: 15, color: "#1F2937" }}>
              Visualization
            </span>
            <span style={{ fontFamily: "JetBrains Mono, monospace", fontSize: 10, color: isVisualizing ? "#3B82F6" : "#9CA3AF" }}>
              {isVisualizing ? `step ${Math.max(currentStep + 1, 0)}/${steps.length}` : "idle"}
            </span>
          </div>
          <div style={{ display: "flex", gap: 6 }}>
            <button
              type="button"
              onClick={startVisualization}
              style={{
                borderRadius: 8, padding: "6px 14px",
                fontFamily: "JetBrains Mono, monospace", fontSize: 10, fontWeight: 600,
                cursor: "pointer", border: "1px solid #BFDBFE",
                background: "#EFF6FF", color: "#1D4ED8",
              }}
            >
              ▶ Visualize
            </button>
            <button
              type="button"
              onClick={() => setCollapsed((v) => !v)}
              style={{
                borderRadius: 8, padding: "6px 12px",
                fontFamily: "JetBrains Mono, monospace", fontSize: 10,
                cursor: "pointer", border: "1px solid #E5E7EB",
                color: "#6B7280", background: "#FFFFFF",
              }}
            >
              {collapsed ? "Expand ▾" : "Collapse ▴"}
            </button>
          </div>
        </div>

        {!collapsed && (
          <div style={{ padding: 16 }}>
            {blochVectors.length === 0 ? (
              <div style={{
                textAlign: "center", padding: "20px 0",
                fontFamily: "JetBrains Mono, monospace", fontSize: 10, color: "#9CA3AF",
              }}>
                Click "Visualize" to open the step-by-step visualizer with gate glow and histogram
              </div>
            ) : (
              <div style={{ display: "flex", gap: 12, overflowX: "auto", paddingBottom: 4 }}>
                {blochVectors.map((vector, i) => (
                  <div key={i} style={{ minWidth: 200, flexShrink: 0 }}>
                    <div style={{
                      fontFamily: "JetBrains Mono, monospace", fontSize: 9,
                      color: "#6B7280", textAlign: "center",
                      marginBottom: 4, textTransform: "uppercase",
                    }}>
                      q[{i}]
                    </div>
                    <BlochSphere label={`q[${i}]`} vector={vector} active={isPlaying} />
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </>
  );
}
