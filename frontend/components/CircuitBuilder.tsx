"use client";

import { memo, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { GatePalette } from "./GatePalette";
import { CircuitJsonEditor } from "./CircuitJsonEditor";
import WebSocketStatusBadge from "./WebSocketStatusBadge";
import { useWebSocket } from "@/hooks/useWebSocket";
import { calculateMetrics, serializeCircuit } from "@/lib/circuit";
import {
  GATE_COLOR,
  GateType,
  formatTheta,
  getDefaultTheta,
  isMeasureGate,
  isParametricGate,
  isTwoQubitGate
} from "@/lib/gates";
import { CircuitKey, GateOperation } from "@/lib/types";
import { useCircuitStore } from "@/store/useCircuitStore";

const WS_URL = "ws://localhost:8000/ws";
const COL_W = 68;
const LANE_H = 84;
const LEFT_PAD = 82;
const TOP_PAD = 22;
const BOT_PAD = 44;
const GATE_W = 44;
const GATE_H = 36;
const GATE_R = 7;
const TWO_Q_R = 16;
const DOT_R = 7;
const MIN_COLS = 8;
const MAX_QUBITS = 6;

function wireY(q: number) {
  return TOP_PAD + q * LANE_H + LANE_H / 2;
}

function colX(c: number) {
  return LEFT_PAD + c * COL_W + COL_W / 2;
}

function gateCol(g: GateOperation) {
  return Math.max(0, Math.round(g.position.x / COL_W));
}

const MeasureSymbol = memo(function MeasureSymbol({
  cx,
  cy,
  color
}: {
  cx: number;
  cy: number;
  color: string;
}) {
  const r = 10;
  const arc = `M ${cx - r} ${cy + 4} A ${r} ${r} 0 0 1 ${cx + r} ${cy + 4}`;
  const ax = cx + r * Math.cos(Math.PI / 6);
  const ay = cy + 4 - r * Math.sin(Math.PI / 6);
  return (
    <g>
      <path d={arc} stroke={color} strokeWidth="1.5" fill="none" />
      <line x1={cx} y1={cy + 4} x2={ax} y2={ay} stroke={color} strokeWidth="1.5" strokeLinecap="round" />
      <circle cx={ax} cy={ay} r={1.5} fill={color} />
    </g>
  );
});

const GateLabel = memo(function GateLabel({
  type,
  x,
  y,
  color
}: {
  type: GateType;
  x: number;
  y: number;
  color: string;
}) {
  if (type === "SDG" || type === "TDG") {
    const base = type === "SDG" ? "S" : "T";
    return (
      <text x={x} y={y + 1} textAnchor="middle" dominantBaseline="middle" fontFamily="Syne, sans-serif" fontWeight="700" fontSize="13" fill={color}>
        {base}
        <tspan fontSize="9" dy="-5">†</tspan>
      </text>
    );
  }

  if (isParametricGate(type)) {
    return (
      <text textAnchor="middle" fontFamily="Syne, sans-serif" fontWeight="700" fill={color}>
        <tspan x={x} y={y - 3} fontSize="12">
          {type.slice(0, 1).toUpperCase()}
          {type.slice(1).toLowerCase()}
        </tspan>
      </text>
    );
  }

  if (type === "M") return null;

  return (
    <text x={x} y={y + 1} textAnchor="middle" dominantBaseline="middle" fontFamily="Syne, sans-serif" fontWeight="700" fontSize={type.length > 2 ? "10" : "13"} fill={color}>
      {type}
    </text>
  );
});

const SingleGate = memo(function SingleGate({
  gate,
  hovered,
  executing,
  recent,
  onClick
}: {
  gate: GateOperation;
  hovered: boolean;
  executing: boolean;
  recent: boolean;
  onClick: (e: React.MouseEvent) => void;
}) {
  const color = GATE_COLOR[gate.type];
  const x = colX(gateCol(gate));
  const y = wireY(gate.target);
  const isHot = hovered || executing || recent;

  return (
    <g onClick={onClick} style={{ cursor: "pointer" }}>
      <rect
        x={x - GATE_W / 2}
        y={y - GATE_H / 2}
        width={GATE_W}
        height={GATE_H}
        rx={GATE_R}
        fill={executing ? `${color}32` : hovered ? `${color}28` : recent ? `${color}22` : `${color}14`}
        stroke={color}
        strokeWidth={isHot ? "2" : "1.5"}
        style={{ filter: `drop-shadow(0 0 ${executing ? 14 : hovered ? 9 : recent ? 10 : 5}px ${color}66)` }}
      />
      {isMeasureGate(gate.type) ? (
        <MeasureSymbol cx={x} cy={y - 1} color={color} />
      ) : (
        <>
          <GateLabel type={gate.type} x={x} y={y} color={color} />
          {isParametricGate(gate.type) && gate.theta !== undefined && (
            <text x={x} y={y + 9} textAnchor="middle" dominantBaseline="middle" fontFamily="JetBrains Mono, monospace" fontSize="8" fill={color} opacity="0.75">
              {formatTheta(gate.theta)}
            </text>
          )}
        </>
      )}
    </g>
  );
});

const CnotGate = memo(function CnotGate({
  gate,
  hovered,
  executing,
  recent,
  onClick
}: {
  gate: GateOperation;
  hovered: boolean;
  executing: boolean;
  recent: boolean;
  onClick: (e: React.MouseEvent) => void;
}) {
  const color = GATE_COLOR.CNOT;
  const x = colX(gateCol(gate));
  const cy = wireY(gate.control ?? 0);
  const ty = wireY(gate.target);
  const isHot = hovered || executing || recent;
  return (
    <g onClick={onClick} style={{ cursor: "pointer" }}>
      <line x1={x} y1={Math.min(cy, ty)} x2={x} y2={Math.max(cy, ty)} stroke={color} strokeWidth="1.5" opacity="0.7" style={{ filter: `drop-shadow(0 0 4px ${color}44)` }} />
      <circle cx={x} cy={cy} r={DOT_R} fill={color} style={{ filter: `drop-shadow(0 0 ${executing ? 12 : 7}px ${color}88)` }} />
      <circle cx={x} cy={ty} r={TWO_Q_R} fill={executing ? `${color}32` : hovered ? `${color}28` : recent ? `${color}22` : `${color}14`} stroke={color} strokeWidth={isHot ? "2" : "1.5"} style={{ filter: `drop-shadow(0 0 ${executing ? 14 : hovered ? 10 : recent ? 10 : 6}px ${color}55)` }} />
      <line x1={x - TWO_Q_R + 5} y1={ty} x2={x + TWO_Q_R - 5} y2={ty} stroke={color} strokeWidth="1.5" />
      <line x1={x} y1={ty - TWO_Q_R + 5} x2={x} y2={ty + TWO_Q_R - 5} stroke={color} strokeWidth="1.5" />
    </g>
  );
});

const CzGate = memo(function CzGate({
  gate,
  hovered,
  executing,
  recent,
  onClick
}: {
  gate: GateOperation;
  hovered: boolean;
  executing: boolean;
  recent: boolean;
  onClick: (e: React.MouseEvent) => void;
}) {
  const color = GATE_COLOR.CZ;
  const x = colX(gateCol(gate));
  const cy = wireY(gate.control ?? 0);
  const ty = wireY(gate.target);
  const r = hovered || executing || recent ? DOT_R + 1 : DOT_R;
  return (
    <g onClick={onClick} style={{ cursor: "pointer" }}>
      <line x1={x} y1={Math.min(cy, ty)} x2={x} y2={Math.max(cy, ty)} stroke={color} strokeWidth="1.5" opacity="0.7" style={{ filter: `drop-shadow(0 0 4px ${color}44)` }} />
      <circle cx={x} cy={cy} r={r} fill={color} style={{ filter: `drop-shadow(0 0 ${executing ? 12 : 8}px ${color}88)` }} />
      <circle cx={x} cy={ty} r={r} fill={color} style={{ filter: `drop-shadow(0 0 ${executing ? 12 : 8}px ${color}88)` }} />
      <text x={x + 9} y={(cy + ty) / 2 + 1} textAnchor="start" dominantBaseline="middle" fontFamily="JetBrains Mono, monospace" fontSize="9" fill={color} opacity="0.55">
        CZ
      </text>
    </g>
  );
});

function SwapX({ x, y, color, r = 8 }: { x: number; y: number; color: string; r?: number }) {
  return (
    <>
      <line x1={x - r} y1={y - r} x2={x + r} y2={y + r} stroke={color} strokeWidth="2" strokeLinecap="round" />
      <line x1={x + r} y1={y - r} x2={x - r} y2={y + r} stroke={color} strokeWidth="2" strokeLinecap="round" />
    </>
  );
}

const SwapGate = memo(function SwapGate({
  gate,
  hovered,
  executing,
  recent,
  onClick
}: {
  gate: GateOperation;
  hovered: boolean;
  executing: boolean;
  recent: boolean;
  onClick: (e: React.MouseEvent) => void;
}) {
  const color = GATE_COLOR.SWAP;
  const x = colX(gateCol(gate));
  const ay = wireY(gate.control ?? 0);
  const by = wireY(gate.target);
  const r = executing ? 10 : hovered || recent ? 9 : 7;
  return (
    <g onClick={onClick} style={{ cursor: "pointer" }}>
      <line x1={x} y1={Math.min(ay, by)} x2={x} y2={Math.max(ay, by)} stroke={color} strokeWidth="1.5" opacity="0.7" style={{ filter: `drop-shadow(0 0 4px ${color}44)` }} />
      <g style={{ filter: `drop-shadow(0 0 ${executing ? 14 : hovered || recent ? 9 : 5}px ${color}66)` }}>
        <SwapX x={x} y={ay} color={color} r={r} />
        <SwapX x={x} y={by} color={color} r={r} />
      </g>
    </g>
  );
});

const GhostGate = memo(function GhostGate({
  col,
  qubit,
  gateType,
  controlQubit,
  theta
}: {
  col: number;
  qubit: number;
  gateType: GateType;
  controlQubit: number;
  theta: number;
}) {
  const color = GATE_COLOR[gateType];
  const x = colX(col);
  const y = wireY(qubit);

  if (gateType === "CNOT" || gateType === "CZ" || gateType === "SWAP") {
    const cy = wireY(controlQubit);
    return (
      <g opacity="0.38" style={{ pointerEvents: "none" }}>
        <line x1={x} y1={Math.min(cy, y)} x2={x} y2={Math.max(cy, y)} stroke={color} strokeWidth="1.5" strokeDasharray="4 3" />
        {gateType === "CNOT" && (
          <>
            <circle cx={x} cy={cy} r={DOT_R} fill={color} />
            <circle cx={x} cy={y} r={TWO_Q_R} fill={`${color}18`} stroke={color} strokeWidth="1.5" strokeDasharray="4 3" />
            <line x1={x - TWO_Q_R + 5} y1={y} x2={x + TWO_Q_R - 5} y2={y} stroke={color} strokeWidth="1.5" />
            <line x1={x} y1={y - TWO_Q_R + 5} x2={x} y2={y + TWO_Q_R - 5} stroke={color} strokeWidth="1.5" />
          </>
        )}
        {gateType === "CZ" && (
          <>
            <circle cx={x} cy={cy} r={DOT_R} fill={color} />
            <circle cx={x} cy={y} r={DOT_R} fill={color} />
          </>
        )}
        {gateType === "SWAP" && (
          <>
            <SwapX x={x} y={cy} color={color} />
            <SwapX x={x} y={y} color={color} />
          </>
        )}
      </g>
    );
  }

  return (
    <g opacity="0.38" style={{ pointerEvents: "none" }}>
      <rect x={x - GATE_W / 2} y={y - GATE_H / 2} width={GATE_W} height={GATE_H} rx={GATE_R} fill={`${color}18`} stroke={color} strokeWidth="1.5" strokeDasharray="5 3" />
      {isMeasureGate(gateType) ? <MeasureSymbol cx={x} cy={y - 1} color={color} /> : <GateLabel type={gateType} x={x} y={y} color={color} />}
      {isParametricGate(gateType) && (
        <text x={x} y={y + 9} textAnchor="middle" dominantBaseline="middle" fontFamily="JetBrains Mono, monospace" fontSize="8" fill={color} opacity="0.75">
          {formatTheta(theta)}
        </text>
      )}
    </g>
  );
});

const PlacedGate = memo(function PlacedGate({
  gate,
  hovered,
  executing,
  recent,
  onDelete
}: {
  gate: GateOperation;
  hovered: boolean;
  executing: boolean;
  recent: boolean;
  onDelete: (id: string) => void;
}) {
  const onClick = useCallback((event: React.MouseEvent) => {
    event.stopPropagation();
    onDelete(gate.id);
  }, [gate.id, onDelete]);

  if (gate.type === "CNOT") return <CnotGate gate={gate} hovered={hovered} executing={executing} recent={recent} onClick={onClick} />;
  if (gate.type === "CZ") return <CzGate gate={gate} hovered={hovered} executing={executing} recent={recent} onClick={onClick} />;
  if (gate.type === "SWAP") return <SwapGate gate={gate} hovered={hovered} executing={executing} recent={recent} onClick={onClick} />;
  return <SingleGate gate={gate} hovered={hovered} executing={executing} recent={recent} onClick={onClick} />;
});

function CircuitSVG({
  gates,
  qubits,
  numCols,
  selectedGate,
  controlQubit,
  theta,
  executionProgress,
  recentPlacedGateId,
  onPlaceGate,
  onDeleteGate
}: {
  gates: GateOperation[];
  qubits: number;
  numCols: number;
  selectedGate: GateType | null;
  controlQubit: number;
  theta: number;
  executionProgress: number | null;
  recentPlacedGateId: string | null;
  onPlaceGate: (qubit: number, col: number) => void;
  onDeleteGate: (id: string) => void;
}) {
  const svgRef = useRef<SVGSVGElement>(null);
  const [hovered, setHovered] = useState<{ col: number; row: number } | null>(null);
  const [hoveredGateId, setHoveredGateId] = useState<string | null>(null);

  const svgW = LEFT_PAD + numCols * COL_W + 22;
  const svgH = TOP_PAD + qubits * LANE_H + BOT_PAD;
  const activeExecutionCol = executionProgress !== null ? Math.max(0, Math.min(numCols - 1, Math.floor(executionProgress))) : null;
  const executionLineX = executionProgress !== null ? LEFT_PAD + executionProgress * COL_W + COL_W / 2 : null;

  const occupied = useMemo(() => {
    const map = new Map<string, string>();
    for (const gate of gates) {
      const col = gateCol(gate);
      map.set(`${gate.target}-${col}`, gate.id);
      if (isTwoQubitGate(gate.type) && gate.control !== undefined) {
        map.set(`${gate.control}-${col}`, gate.id);
      }
    }
    return map;
  }, [gates]);

  const hitCell = useCallback((event: React.MouseEvent<SVGSVGElement>) => {
    const rect = svgRef.current?.getBoundingClientRect();
    if (!rect) return null;
    const rx = event.clientX - rect.left - LEFT_PAD;
    const ry = event.clientY - rect.top - TOP_PAD;
    if (rx < 0 || ry < 0) return null;
    const col = Math.floor(rx / COL_W);
    const row = Math.round((ry - LANE_H / 2) / LANE_H);
    if (col < 0 || col >= numCols || row < 0 || row >= qubits) return null;
    if (Math.abs(ry - (row * LANE_H + LANE_H / 2)) > LANE_H * 0.46) return null;
    return { col, row };
  }, [numCols, qubits]);

  const onSvgClick = useCallback((event: React.MouseEvent<SVGSVGElement>) => {
    const cell = hitCell(event);
    if (!cell || !selectedGate) return;
    const key = `${cell.row}-${cell.col}`;
    if (occupied.has(key)) onDeleteGate(occupied.get(key)!);
    else onPlaceGate(cell.row, cell.col);
  }, [hitCell, occupied, onDeleteGate, onPlaceGate, selectedGate]);

  return (
    <div style={{ overflowX: "auto", overflowY: "hidden", borderRadius: 14, border: "1px solid rgba(255,255,255,0.06)", background: "#02060f" }}>
      <svg ref={svgRef} width={svgW} height={svgH} style={{ display: "block", cursor: selectedGate ? "crosshair" : "default" }} onMouseMove={(event) => setHovered(hitCell(event))} onMouseLeave={() => setHovered(null)} onClick={onSvgClick}>
        <defs>
          <pattern id="qgrid" x="0" y="0" width="16" height="16" patternUnits="userSpaceOnUse">
            <circle cx="8" cy="8" r="0.75" fill="rgba(0,212,255,0.05)" />
          </pattern>
          <linearGradient id="colhi" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="rgba(0,212,255,0.03)" />
            <stop offset="50%" stopColor="rgba(0,212,255,0.06)" />
            <stop offset="100%" stopColor="rgba(0,212,255,0.03)" />
          </linearGradient>
          <linearGradient id="execCol" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="rgba(0,212,255,0.06)" />
            <stop offset="50%" stopColor="rgba(0,212,255,0.14)" />
            <stop offset="100%" stopColor="rgba(0,212,255,0.06)" />
          </linearGradient>
        </defs>

        <rect width={svgW} height={svgH} fill="url(#qgrid)" />

        {hovered && (
          <rect x={LEFT_PAD + hovered.col * COL_W + 5} y={TOP_PAD} width={COL_W - 10} height={qubits * LANE_H} rx={6} fill="url(#colhi)" />
        )}

        {activeExecutionCol !== null && (
          <rect x={LEFT_PAD + activeExecutionCol * COL_W + 4} y={TOP_PAD} width={COL_W - 8} height={qubits * LANE_H} rx={8} fill="url(#execCol)" />
        )}

        {executionLineX !== null && (
          <line x1={executionLineX} y1={TOP_PAD - 2} x2={executionLineX} y2={TOP_PAD + qubits * LANE_H + 14} stroke="rgba(0,212,255,0.55)" strokeWidth="1.5" strokeDasharray="5 4" style={{ filter: "drop-shadow(0 0 10px rgba(0,212,255,0.35))" }} />
        )}

        {Array.from({ length: numCols + 1 }, (_, col) => (
          <line key={`sep-${col}`} x1={LEFT_PAD + col * COL_W} y1={TOP_PAD} x2={LEFT_PAD + col * COL_W} y2={TOP_PAD + qubits * LANE_H} stroke="rgba(255,255,255,0.028)" strokeWidth="1" />
        ))}

        {Array.from({ length: qubits }, (_, q) => {
          const y = wireY(q);
          return (
            <g key={`wire-${q}`}>
              <line x1={LEFT_PAD - 6} y1={y} x2={svgW - 10} y2={y} stroke="rgba(0,212,255,0.06)" strokeWidth="4" />
              <line x1={LEFT_PAD - 6} y1={y} x2={svgW - 10} y2={y} stroke="rgba(0,212,255,0.18)" strokeWidth="1.25" />
              <text x={LEFT_PAD - 14} y={y + 1} textAnchor="end" dominantBaseline="middle" fontFamily="JetBrains Mono, monospace" fontSize="12" fill="rgba(0,212,255,0.5)">
                q[{q}]
              </text>
            </g>
          );
        })}

        <line x1={LEFT_PAD} y1={TOP_PAD + qubits * LANE_H + 7} x2={LEFT_PAD + numCols * COL_W} y2={TOP_PAD + qubits * LANE_H + 7} stroke="rgba(40,64,90,0.4)" strokeWidth="1" />
        {Array.from({ length: numCols }, (_, col) => (
          <g key={`tick-${col}`}>
            <line x1={colX(col)} y1={TOP_PAD + qubits * LANE_H + 7} x2={colX(col)} y2={TOP_PAD + qubits * LANE_H + 14} stroke="rgba(40,64,90,0.4)" strokeWidth="1" />
            <text x={colX(col)} y={TOP_PAD + qubits * LANE_H + 27} textAnchor="middle" fontFamily="JetBrains Mono, monospace" fontSize="10" fill="rgba(40,64,90,0.6)">
              {col + 1}
            </text>
          </g>
        ))}

        {hovered && selectedGate && !occupied.has(`${hovered.row}-${hovered.col}`) && (
          <GhostGate col={hovered.col} qubit={hovered.row} gateType={selectedGate} controlQubit={controlQubit} theta={theta} />
        )}

        {gates.map((gate) => (
          <g key={gate.id} onMouseEnter={() => setHoveredGateId(gate.id)} onMouseLeave={() => setHoveredGateId(null)}>
            <PlacedGate gate={gate} hovered={hoveredGateId === gate.id} executing={activeExecutionCol === gateCol(gate)} recent={recentPlacedGateId === gate.id} onDelete={onDeleteGate} />
          </g>
        ))}
      </svg>
    </div>
  );
}

function MetricCard({ label, value, accent }: { label: string; value: number | string; accent?: string }) {
  return (
    <div style={{ background: "rgba(2,6,15,0.7)", border: "1px solid rgba(255,255,255,0.06)", borderRadius: 12, padding: "10px 13px" }}>
      <div style={{ fontFamily: "JetBrains Mono, monospace", fontSize: 9, color: "rgba(40,64,90,0.85)", letterSpacing: "0.1em", textTransform: "uppercase", marginBottom: 5 }}>{label}</div>
      <div style={{ fontFamily: "Syne, sans-serif", fontWeight: 700, fontSize: 20, color: accent ?? "#c8dff2", lineHeight: 1, textShadow: accent ? `0 0 14px ${accent}55` : "none" }}>{value}</div>
    </div>
  );
}

export default function CircuitBuilder() {
  const [selectedGate, setSelectedGate] = useState<GateType | null>(null);
  const [controlQubit, setControlQubit] = useState(0);
  const [targetQubit, setTargetQubit] = useState(1);
  const [theta, setTheta] = useState<number>(() => Math.PI / 2);
  const [recentPlacedGateId, setRecentPlacedGateId] = useState<string | null>(null);
  const [executionProgress, setExecutionProgress] = useState<number | null>(null);

  const handleSelectGate = useCallback((type: GateType | null) => {
    setSelectedGate(type);
    if (type && isParametricGate(type)) {
      setTheta(getDefaultTheta(type));
    }
  }, []);

  const activeCircuit = useCircuitStore((state) => state.activeCircuit);
  const circuit = useCircuitStore((state) => state.circuits[state.activeCircuit]);
  const results = useCircuitStore((state) => state.results);
  const setActiveCircuit = useCircuitStore((state) => state.setActiveCircuit);
  const setQubitCount = useCircuitStore((state) => state.setQubitCount);
  const addGate = useCircuitStore((state) => state.addGate);
  const removeGate = useCircuitStore((state) => state.removeGate);
  const setResult = useCircuitStore((state) => state.setResult);
  const setSocketStatus = useCircuitStore((state) => state.setSocketStatus);
  const setSocketError = useCircuitStore((state) => state.setSocketError);
  const setIsRunning = useCircuitStore((state) => state.setIsRunning);
  const loadMockData = useCircuitStore((state) => state.loadMockData);

  const { status, error, isLoading, statusMessage, latencyMs, lastCompletedAt, reconnect, simulateCircuit } = useWebSocket(WS_URL);

  useEffect(() => {
    setSocketStatus(status);
  }, [setSocketStatus, status]);

  useEffect(() => {
    setSocketError(error);
  }, [error, setSocketError]);

  useEffect(() => {
    setIsRunning(isLoading);
  }, [isLoading, setIsRunning]);

  useEffect(() => {
    if (!recentPlacedGateId) return;
    const timeout = window.setTimeout(() => setRecentPlacedGateId(null), 700);
    return () => window.clearTimeout(timeout);
  }, [recentPlacedGateId]);

  const numCols = useMemo(() => {
    const maxUsed = circuit.gates.reduce((max, gate) => Math.max(max, gateCol(gate)), -1);
    return Math.max(MIN_COLS, maxUsed + 4);
  }, [circuit.gates]);

  useEffect(() => {
    if (!isLoading) {
      setExecutionProgress(null);
      return;
    }

    const maxColumn = Math.max(1, numCols - 1);
    const duration = Math.max(1200, maxColumn * 220);
    let frame = 0;
    let startTime = 0;

    const tick = (time: number) => {
      if (!startTime) startTime = time;
      const elapsed = time - startTime;
      const progress = Math.min(elapsed / duration, 1);
      setExecutionProgress(progress * maxColumn);
      frame = window.requestAnimationFrame(tick);
    };

    frame = window.requestAnimationFrame(tick);
    return () => window.cancelAnimationFrame(frame);
  }, [isLoading, numCols]);

  const metrics = useMemo(() => calculateMetrics(circuit), [circuit]);
  const activeRunLabel = isLoading ? "Running" : lastCompletedAt && Date.now() - lastCompletedAt < 2500 ? "Completed" : `Run ${activeCircuit}`;

  const handlePlaceGate = useCallback((qubit: number, col: number) => {
    if (!selectedGate) return;

    const nextGate: GateOperation = {
      id: `${selectedGate.toLowerCase()}-${Date.now()}-${Math.floor(Math.random() * 9999)}`,
      type: selectedGate,
      target: qubit,
      ...(isTwoQubitGate(selectedGate)
        ? {
            control: controlQubit === qubit ? (controlQubit + 1) % circuit.qubits : controlQubit
          }
        : {}),
      ...(isParametricGate(selectedGate) ? { theta } : {}),
      position: { x: col * COL_W, y: qubit * LANE_H }
    };

    addGate(activeCircuit, nextGate);
    setRecentPlacedGateId(nextGate.id);
  }, [activeCircuit, addGate, circuit.qubits, controlQubit, selectedGate, theta]);

  const handleDeleteGate = useCallback((id: string) => removeGate(activeCircuit, id), [activeCircuit, removeGate]);

  const runSingleCircuit = useCallback(async (key: CircuitKey) => {
    const currentCircuit = useCircuitStore.getState().circuits[key];
    try {
      setSocketError(null);
      setIsRunning(true);
      const result = await simulateCircuit(serializeCircuit(currentCircuit));
      setResult(key, result);
    } catch (caughtError) {
      setSocketError(caughtError instanceof Error ? caughtError.message : "Simulation failed.");
    } finally {
      setIsRunning(false);
    }
  }, [setIsRunning, setResult, setSocketError, simulateCircuit]);

  const runBothCircuits = useCallback(async () => {
    await runSingleCircuit("A");
    await runSingleCircuit("B");
  }, [runSingleCircuit]);

  return (
    <section style={{ background: "rgba(6,13,26,0.85)", border: "1px solid rgba(255,255,255,0.07)", borderRadius: 24, padding: 20, boxShadow: "0 0 0 1px rgba(0,212,255,0.04), 0 24px 64px rgba(0,0,0,0.75)", backdropFilter: "blur(12px)" }}>
      <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", justifyContent: "space-between", gap: 14, marginBottom: 18 }}>
        <div>
          <h2 style={{ fontFamily: "Syne, sans-serif", fontWeight: 700, fontSize: 16, color: "#c8dff2", letterSpacing: "-0.01em" }}>Circuit Builder</h2>
          <p style={{ fontFamily: "JetBrains Mono, monospace", fontSize: 10, color: "rgba(40,64,90,0.85)", marginTop: 3 }}>
            Select gate ? click wire to place · click gate to delete
          </p>
        </div>

        <div style={{ display: "flex", flexWrap: "wrap", gap: 8, alignItems: "center" }}>
          {(["A", "B"] as CircuitKey[]).map((key) => (
            <button key={key} type="button" onClick={() => setActiveCircuit(key)} style={{ borderRadius: 12, padding: "7px 16px", fontFamily: "Syne, sans-serif", fontWeight: 600, fontSize: 12, letterSpacing: "0.05em", cursor: "pointer", transition: "all 0.16s", border: activeCircuit === key ? "1px solid rgba(0,212,255,0.45)" : "1px solid rgba(255,255,255,0.07)", background: activeCircuit === key ? "rgba(0,212,255,0.1)" : "transparent", color: activeCircuit === key ? "#00d4ff" : "#c8dff2", boxShadow: activeCircuit === key ? "0 0 14px rgba(0,212,255,0.12)" : "none" }}>
              Circuit {key}
            </button>
          ))}

          <button type="button" onClick={() => runSingleCircuit(activeCircuit)} disabled={isLoading} style={{ borderRadius: 12, padding: "7px 18px", fontFamily: "Syne, sans-serif", fontWeight: 700, fontSize: 12, letterSpacing: "0.04em", cursor: isLoading ? "wait" : "pointer", border: "1px solid rgba(0,212,255,0.4)", background: isLoading ? "linear-gradient(135deg,rgba(0,212,255,0.22),rgba(0,212,255,0.1))" : lastCompletedAt && Date.now() - lastCompletedAt < 2500 ? "linear-gradient(135deg,rgba(0,229,160,0.18),rgba(0,229,160,0.08))" : "linear-gradient(135deg,rgba(0,212,255,0.18),rgba(0,212,255,0.08))", color: isLoading ? "#9feeff" : lastCompletedAt && Date.now() - lastCompletedAt < 2500 ? "#00e5a0" : "#00d4ff", boxShadow: isLoading ? "0 0 22px rgba(0,212,255,0.18)" : "0 0 18px rgba(0,212,255,0.14)", opacity: isLoading ? 0.9 : 1 }}>
            {activeRunLabel}
          </button>

          <button type="button" onClick={runBothCircuits} disabled={isLoading} style={{ borderRadius: 12, padding: "7px 18px", fontFamily: "Syne, sans-serif", fontWeight: 700, fontSize: 12, letterSpacing: "0.04em", cursor: isLoading ? "wait" : "pointer", border: "1px solid rgba(162,89,255,0.4)", background: "linear-gradient(135deg,rgba(162,89,255,0.16),rgba(162,89,255,0.07))", color: "#a259ff", boxShadow: "0 0 18px rgba(162,89,255,0.12)", opacity: isLoading ? 0.6 : 1 }}>
            A vs B
          </button>

          <button type="button" onClick={loadMockData} style={{ borderRadius: 12, padding: "7px 14px", fontFamily: "Syne, sans-serif", fontWeight: 600, fontSize: 12, cursor: "pointer", border: "1px solid rgba(255,255,255,0.07)", background: "transparent", color: "rgba(200,223,242,0.45)" }}>
            Load Mock
          </button>
        </div>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "240px minmax(0,1fr) 276px", gap: 14 }}>
        <GatePalette selected={selectedGate} controlQubit={controlQubit} targetQubit={targetQubit} theta={theta} qubits={circuit.qubits} onSelect={handleSelectGate} onControlChange={setControlQubit} onTargetChange={setTargetQubit} onThetaChange={setTheta} />

        <div style={{ background: "rgba(2,6,15,0.7)", border: "1px solid rgba(255,255,255,0.07)", borderRadius: 20, padding: 14, display: "flex", flexDirection: "column", gap: 12 }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 10 }}>
            <WebSocketStatusBadge status={status} message={statusMessage ?? error} latencyMs={latencyMs} />

            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <label style={{ display: "flex", alignItems: "center", gap: 7, fontFamily: "JetBrains Mono, monospace", fontSize: 10, color: "rgba(40,64,90,0.85)", letterSpacing: "0.06em", textTransform: "uppercase" }}>
                Qubits
                <select value={circuit.qubits} onChange={(event) => setQubitCount(activeCircuit, Number(event.target.value))} style={{ background: "rgba(6,13,26,0.9)", border: "1px solid rgba(255,255,255,0.08)", borderRadius: 8, padding: "5px 9px", color: "#c8dff2", fontFamily: "JetBrains Mono, monospace", fontSize: 12, outline: "none", cursor: "pointer" }}>
                  {Array.from({ length: MAX_QUBITS - 1 }, (_, index) => index + 2).map((q) => (
                    <option key={q} value={q}>{q}</option>
                  ))}
                </select>
              </label>

              <button type="button" onClick={reconnect} style={{ borderRadius: 8, padding: "5px 11px", fontFamily: "JetBrains Mono, monospace", fontSize: 10, cursor: "pointer", border: "1px solid rgba(255,255,255,0.07)", background: "transparent", color: "rgba(200,223,242,0.4)", letterSpacing: "0.04em" }}>
                reconnect
              </button>
            </div>
          </div>

          <CircuitSVG gates={circuit.gates} qubits={circuit.qubits} numCols={numCols} selectedGate={selectedGate} controlQubit={controlQubit} theta={theta} executionProgress={executionProgress} recentPlacedGateId={recentPlacedGateId} onPlaceGate={handlePlaceGate} onDeleteGate={handleDeleteGate} />
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          <CircuitJsonEditor circuitKey={activeCircuit} />

          <div style={{ background: "rgba(2,6,15,0.7)", border: "1px solid rgba(255,255,255,0.07)", borderRadius: 18, padding: 15 }}>
            <h3 style={{ fontFamily: "Syne, sans-serif", fontWeight: 700, fontSize: 12, color: "#c8dff2", letterSpacing: "0.04em", marginBottom: 12 }}>Live Summary</h3>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 9 }}>
              <MetricCard label="Gate Count" value={metrics.gateCount} accent="#00d4ff" />
              <MetricCard label="Depth" value={metrics.depth} accent="#a259ff" />
              <MetricCard label="Latency" value={latencyMs !== null ? `${latencyMs} ms` : "—"} />
              <MetricCard label="Run State" value={isLoading ? "Live" : lastCompletedAt ? "Ready" : "Idle"} />
              <MetricCard label="States A" value={results.A ? Object.keys(results.A.counts).length : "—"} />
              <MetricCard label="States B" value={results.B ? Object.keys(results.B.counts).length : "—"} />
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

