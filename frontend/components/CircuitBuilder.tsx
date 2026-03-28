"use client";

// ─────────────────────────────────────────────────────────────────────────────
// CircuitBuilder.tsx
// IBM-style SVG quantum circuit diagram with full 15-gate support.
// Uses GatePalette, /lib/gates, /lib/types, /store/useCircuitStore.
// ─────────────────────────────────────────────────────────────────────────────

import {
    memo,
    useCallback,
    useEffect,
    useMemo,
    useRef,
    useState,
} from "react";
import { GatePalette } from "./GatePalette";
import { CircuitJsonEditor } from "./CircuitJsonEditor";
import { useWebSocket } from "@/hooks/useWebSocket";
import { calculateMetrics, serializeCircuit } from "@/lib/circuit";
import {
    GATE_COLOR,
    GateType,
    formatTheta,
    getDefaultTheta,
    isMeasureGate,
    isParametricGate,
    isTwoQubitGate,
} from "@/lib/gates";
import { CircuitKey, GateOperation, SimulationResult } from "@/lib/types";
import { useCircuitStore } from "@/store/useCircuitStore";

// ── Layout ───────────────────────────────────────────────────────────────────
const WS_URL = "ws://localhost:8000/ws";
const COL_W = 68;
const LANE_H = 84;
const LEFT_PAD = 82;
const TOP_PAD = 22;
const BOT_PAD = 44;
const GATE_W = 44;
const GATE_H = 36;
const GATE_R = 7;
const TWO_Q_R = 16;   // radius for CNOT ⊕ and SWAP ×
const DOT_R = 7;    // control dot radius
const MIN_COLS = 8;
const MAX_QUBITS = 6;

// ── Helpers ───────────────────────────────────────────────────────────────────
function wireY(q: number) { return TOP_PAD + q * LANE_H + LANE_H / 2; }
function colX(c: number) { return LEFT_PAD + c * COL_W + COL_W / 2; }
function gateCol(g: GateOperation) {
    return Math.max(0, Math.round(g.position.x / COL_W));
}

// ── Measure arc+needle (M gate) ───────────────────────────────────────────────
const MeasureSymbol = memo(function MeasureSymbol({
    cx, cy, color,
}: { cx: number; cy: number; color: string }) {
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

// ── Gate label (handles daggers and superscripts) ─────────────────────────────
const GateLabel = memo(function GateLabel({
    type, x, y, color,
}: { type: GateType; x: number; y: number; color: string }) {
    // For gates with daggers (S†, T†) render the dagger as superscript via tspan
    const DAGGER_TYPES: GateType[] = ["SDG", "TDG"];
    if (DAGGER_TYPES.includes(type)) {
        const base = type === "SDG" ? "S" : "T";
        return (
            <text x={x} y={y + 1} textAnchor="middle" dominantBaseline="middle"
                fontFamily="Syne, sans-serif" fontWeight="700" fontSize="13"
                fill={color} style={{ userSelect: "none" }}
            >
                {base}
                <tspan fontSize="9" dy="-5">†</tspan>
            </text>
        );
    }

    // Rotation gates: show compact label + small θ line below
    if (isParametricGate(type)) {
        return (
            <text textAnchor="middle" fontFamily="Syne, sans-serif"
                fontWeight="700" fill={color} style={{ userSelect: "none" }}
            >
                <tspan x={x} y={y - 3} fontSize="12">{type.slice(0, 1).toUpperCase()}{type.slice(1).toLowerCase()}</tspan>
                {/* θ value shown as a tiny subscript — caller passes theta as data attr via parent */}
            </text>
        );
    }

    const GATE_LABELS: Partial<Record<GateType, string>> = {
        M: "",  // rendered by MeasureSymbol
    };
    const label = GATE_LABELS[type] !== undefined ? GATE_LABELS[type]! : type;

    return (
        <text x={x} y={y + 1} textAnchor="middle" dominantBaseline="middle"
            fontFamily="Syne, sans-serif" fontWeight="700"
            fontSize={label.length > 2 ? "10" : "13"}
            fill={color} style={{ userSelect: "none" }}
        >
            {label}
        </text>
    );
});

// ── Generic gate box (single-qubit) ──────────────────────────────────────────
const SingleGate = memo(function SingleGate({
    gate, hovered, lit, onClick,
}: { gate: GateOperation; hovered: boolean; lit: boolean; onClick: (e: React.MouseEvent) => void }) {
    const color = GATE_COLOR[gate.type];
    const x = colX(gateCol(gate));
    const y = wireY(gate.target);
    const glow = lit ? `drop-shadow(0 0 14px ${color}cc)` : `drop-shadow(0 0 ${hovered ? 9 : 5}px ${color}55)`;

    return (
        <g onClick={onClick} style={{ cursor: "pointer" }}>
            <rect
                x={x - GATE_W / 2} y={y - GATE_H / 2}
                width={GATE_W} height={GATE_H} rx={GATE_R}
                fill={lit ? `${color}38` : hovered ? `${color}28` : `${color}14`}
                stroke={color} strokeWidth={lit || hovered ? "2" : "1.5"}
                style={{ filter: glow }}
            />
            {isMeasureGate(gate.type) ? (
                <MeasureSymbol cx={x} cy={y - 1} color={color} />
            ) : (
                <>
                    <GateLabel type={gate.type} x={x} y={y} color={color} />
                    {/* θ value below gate label for rotation gates */}
                    {isParametricGate(gate.type) && gate.theta !== undefined && (
                        <text
                            x={x} y={y + 9}
                            textAnchor="middle" dominantBaseline="middle"
                            fontFamily="JetBrains Mono, monospace" fontSize="8"
                            fill={color} opacity="0.6" style={{ userSelect: "none" }}
                        >
                            {formatTheta(gate.theta)}
                        </text>
                    )}
                </>
            )}
        </g>
    );
});

// ── CNOT gate  ●──⊕ ──────────────────────────────────────────────────────────
const CnotGate = memo(function CnotGate({
    gate, hovered, lit, onClick,
}: { gate: GateOperation; hovered: boolean; lit: boolean; onClick: (e: React.MouseEvent) => void }) {
    const color = GATE_COLOR.CNOT;
    const x = colX(gateCol(gate));
    const cy = wireY(gate.control ?? 0);
    const ty = wireY(gate.target);
    const min = Math.min(cy, ty);
    const max = Math.max(cy, ty);
    return (
        <g onClick={onClick} style={{ cursor: "pointer" }}>
            <line x1={x} y1={min} x2={x} y2={max}
                stroke={color} strokeWidth={lit ? "2" : "1.5"} opacity={lit ? "1" : "0.7"}
                style={{ filter: `drop-shadow(0 0 ${lit ? 8 : 4}px ${color}${lit ? "99" : "44"})` }}
            />
            {/* Control dot */}
            <circle cx={x} cy={cy} r={DOT_R} fill={color}
                style={{ filter: `drop-shadow(0 0 ${lit ? 14 : 7}px ${color}${lit ? "cc" : "88"})` }}
            />
            {/* Target ⊕ */}
            <circle cx={x} cy={ty} r={TWO_Q_R}
                fill={lit ? `${color}38` : hovered ? `${color}28` : `${color}14`}
                stroke={color} strokeWidth={lit || hovered ? "2" : "1.5"}
                style={{ filter: `drop-shadow(0 0 ${lit ? 14 : hovered ? 10 : 6}px ${color}${lit ? "cc" : "55"})` }}
            />
            <line x1={x - TWO_Q_R + 5} y1={ty} x2={x + TWO_Q_R - 5} y2={ty} stroke={color} strokeWidth="1.5" />
            <line x1={x} y1={ty - TWO_Q_R + 5} x2={x} y2={ty + TWO_Q_R - 5} stroke={color} strokeWidth="1.5" />
        </g>
    );
});

// ── CZ gate  ●──● ────────────────────────────────────────────────────────────
const CzGate = memo(function CzGate({
    gate, hovered, lit, onClick,
}: { gate: GateOperation; hovered: boolean; lit: boolean; onClick: (e: React.MouseEvent) => void }) {
    const color = GATE_COLOR.CZ;
    const x = colX(gateCol(gate));
    const cy = wireY(gate.control ?? 0);
    const ty = wireY(gate.target);
    const min = Math.min(cy, ty);
    const max = Math.max(cy, ty);
    const r = lit ? DOT_R + 2 : hovered ? DOT_R + 1 : DOT_R;
    return (
        <g onClick={onClick} style={{ cursor: "pointer" }}>
            <line x1={x} y1={min} x2={x} y2={max}
                stroke={color} strokeWidth={lit ? "2" : "1.5"} opacity={lit ? "1" : "0.7"}
                style={{ filter: `drop-shadow(0 0 ${lit ? 8 : 4}px ${color}${lit ? "99" : "44"})` }}
            />
            <circle cx={x} cy={cy} r={r} fill={color}
                style={{ filter: `drop-shadow(0 0 ${lit ? 14 : 8}px ${color}${lit ? "cc" : "88"})` }}
            />
            <circle cx={x} cy={ty} r={r} fill={color}
                style={{ filter: `drop-shadow(0 0 ${lit ? 14 : 8}px ${color}${lit ? "cc" : "88"})` }}
            />
            {/* CZ label in center */}
            <text
                x={x + 9} y={(cy + ty) / 2 + 1}
                textAnchor="start" dominantBaseline="middle"
                fontFamily="JetBrains Mono, monospace" fontSize="9"
                fill={color} opacity="0.55" style={{ userSelect: "none" }}
            >
                CZ
            </text>
        </g>
    );
});

// ── SWAP gate  ×──× ──────────────────────────────────────────────────────────
function SwapX({ x, y, color, r = 8 }: { x: number; y: number; color: string; r?: number }) {
    return (
        <>
            <line x1={x - r} y1={y - r} x2={x + r} y2={y + r} stroke={color} strokeWidth="2" strokeLinecap="round" />
            <line x1={x + r} y1={y - r} x2={x - r} y2={y + r} stroke={color} strokeWidth="2" strokeLinecap="round" />
        </>
    );
}

const SwapGate = memo(function SwapGate({
    gate, hovered, lit, onClick,
}: { gate: GateOperation; hovered: boolean; lit: boolean; onClick: (e: React.MouseEvent) => void }) {
    const color = GATE_COLOR.SWAP;
    const x = colX(gateCol(gate));
    const ay = wireY(gate.control ?? 0);
    const by = wireY(gate.target);
    const min = Math.min(ay, by);
    const max = Math.max(ay, by);
    const r = lit ? 10 : hovered ? 9 : 7;
    return (
        <g onClick={onClick} style={{ cursor: "pointer" }}>
            <line x1={x} y1={min} x2={x} y2={max}
                stroke={color} strokeWidth={lit ? "2" : "1.5"} opacity={lit ? "1" : "0.7"}
                style={{ filter: `drop-shadow(0 0 ${lit ? 8 : 4}px ${color}${lit ? "99" : "44"})` }}
            />
            <g style={{ filter: `drop-shadow(0 0 ${lit ? 14 : hovered ? 9 : 5}px ${color}${lit ? "cc" : "66"})` }}>
                <SwapX x={x} y={ay} color={color} r={r} />
                <SwapX x={x} y={by} color={color} r={r} />
            </g>
        </g>
    );
});

const ControlledRotationGate = memo(function ControlledRotationGate({
    gate, hovered, lit, onClick,
}: { gate: GateOperation; hovered: boolean; lit: boolean; onClick: (e: React.MouseEvent) => void }) {
    const color = GATE_COLOR[gate.type];
    const x = colX(gateCol(gate));
    const cy = wireY(gate.control ?? 0);
    const ty = wireY(gate.target);
    const min = Math.min(cy, ty);
    const max = Math.max(cy, ty);
    const glow = lit ? `drop-shadow(0 0 14px ${color}cc)` : `drop-shadow(0 0 ${hovered ? 9 : 5}px ${color}55)`;

    return (
        <g onClick={onClick} style={{ cursor: "pointer" }}>
            <line x1={x} y1={min} x2={x} y2={max}
                stroke={color} strokeWidth={lit ? "2" : "1.5"} opacity={lit ? "1" : "0.7"}
                style={{ filter: `drop-shadow(0 0 ${lit ? 8 : 4}px ${color}${lit ? "99" : "44"})` }}
            />
            <circle cx={x} cy={cy} r={DOT_R} fill={color}
                style={{ filter: `drop-shadow(0 0 ${lit ? 14 : 7}px ${color}${lit ? "cc" : "88"})` }}
            />
            <rect
                x={x - GATE_W / 2} y={ty - GATE_H / 2}
                width={GATE_W} height={GATE_H} rx={GATE_R}
                fill={lit ? `${color}38` : hovered ? `${color}28` : `${color}14`}
                stroke={color} strokeWidth={lit || hovered ? "2" : "1.5"}
                style={{ filter: glow }}
            />
            <GateLabel type={gate.type} x={x} y={ty} color={color} />
            {gate.theta !== undefined && (
                <text
                    x={x} y={ty + 9}
                    textAnchor="middle" dominantBaseline="middle"
                    fontFamily="JetBrains Mono, monospace" fontSize="8"
                    fill={color} opacity="0.6" style={{ userSelect: "none" }}
                >
                    {formatTheta(gate.theta)}
                </text>
            )}
        </g>
    );
});

// ── Ghost preview (all gate types) ───────────────────────────────────────────
const GhostGate = memo(function GhostGate({
    col, qubit, gateType, controlQubit,
}: {
    col: number; qubit: number; gateType: GateType; controlQubit: number;
}) {
    const color = GATE_COLOR[gateType];
    const x = colX(col);
    const y = wireY(qubit);

    if (gateType === "CNOT") {
        const cy = wireY(controlQubit);
        const min = Math.min(cy, y); const max = Math.max(cy, y);
        return (
            <g opacity="0.38" style={{ pointerEvents: "none" }}>
                <line x1={x} y1={min} x2={x} y2={max} stroke={color} strokeWidth="1.5" strokeDasharray="4 3" />
                <circle cx={x} cy={cy} r={DOT_R} fill={color} />
                <circle cx={x} cy={y} r={TWO_Q_R} fill={`${color}18`} stroke={color} strokeWidth="1.5" strokeDasharray="4 3" />
                <line x1={x - TWO_Q_R + 5} y1={y} x2={x + TWO_Q_R - 5} y2={y} stroke={color} strokeWidth="1.5" />
                <line x1={x} y1={y - TWO_Q_R + 5} x2={x} y2={y + TWO_Q_R - 5} stroke={color} strokeWidth="1.5" />
            </g>
        );
    }

    if (gateType === "CZ") {
        const cy = wireY(controlQubit);
        const min = Math.min(cy, y); const max = Math.max(cy, y);
        return (
            <g opacity="0.38" style={{ pointerEvents: "none" }}>
                <line x1={x} y1={min} x2={x} y2={max} stroke={color} strokeWidth="1.5" strokeDasharray="4 3" />
                <circle cx={x} cy={cy} r={DOT_R} fill={color} />
                <circle cx={x} cy={y} r={DOT_R} fill={color} />
            </g>
        );
    }

    if (gateType === "SWAP") {
        const cy = wireY(controlQubit);
        const min = Math.min(cy, y); const max = Math.max(cy, y);
        return (
            <g opacity="0.38" style={{ pointerEvents: "none" }}>
                <line x1={x} y1={min} x2={x} y2={max} stroke={color} strokeWidth="1.5" strokeDasharray="4 3" />
                <SwapX x={x} y={cy} color={color} />
                <SwapX x={x} y={y} color={color} />
            </g>
        );
    }

    if (["CRX", "CRY", "CRZ"].includes(gateType)) {
        const cy = wireY(controlQubit);
        const min = Math.min(cy, y); const max = Math.max(cy, y);
        return (
            <g opacity="0.38" style={{ pointerEvents: "none" }}>
                <line x1={x} y1={min} x2={x} y2={max} stroke={color} strokeWidth="1.5" strokeDasharray="4 3" />
                <circle cx={x} cy={cy} r={DOT_R} fill={color} />
                <rect
                    x={x - GATE_W / 2} y={y - GATE_H / 2}
                    width={GATE_W} height={GATE_H} rx={GATE_R}
                    fill={`${color}18`} stroke={color} strokeWidth="1.5" strokeDasharray="5 3"
                />
                <GateLabel type={gateType} x={x} y={y} color={color} />
            </g>
        );
    }

    return (
        <g opacity="0.38" style={{ pointerEvents: "none" }}>
            <rect
                x={x - GATE_W / 2} y={y - GATE_H / 2}
                width={GATE_W} height={GATE_H} rx={GATE_R}
                fill={`${color}18`} stroke={color} strokeWidth="1.5" strokeDasharray="5 3"
            />
            {isMeasureGate(gateType)
                ? <MeasureSymbol cx={x} cy={y - 1} color={color} />
                : <GateLabel type={gateType} x={x} y={y} color={color} />
            }
        </g>
    );
});

// ── Gate dispatcher ───────────────────────────────────────────────────────────
// Routes each gate to the correct SVG component. Memoized per gate.
const PlacedGate = memo(function PlacedGate({
    gate, hovered, lit, onDelete,
}: {
    gate: GateOperation;
    hovered: boolean;
    lit: boolean;
    onDelete: (id: string) => void;
}) {
    const onClick = useCallback(
        (e: React.MouseEvent) => { e.stopPropagation(); onDelete(gate.id); },
        [gate.id, onDelete]
    );

    if (gate.type === "CNOT") return <CnotGate gate={gate} hovered={hovered} lit={lit} onClick={onClick} />;
    if (gate.type === "CZ") return <CzGate gate={gate} hovered={hovered} lit={lit} onClick={onClick} />;
    if (gate.type === "SWAP") return <SwapGate gate={gate} hovered={hovered} lit={lit} onClick={onClick} />;
    if (["CRX", "CRY", "CRZ"].includes(gate.type)) {
        return <ControlledRotationGate gate={gate} hovered={hovered} lit={lit} onClick={onClick} />;
    }
    return <SingleGate gate={gate} hovered={hovered} lit={lit} onClick={onClick} />;
});

// ── Circuit SVG canvas ────────────────────────────────────────────────────────
function CircuitSVG({
    gates, qubits, numCols, litUpToCol, selectedGate, controlQubit,
    onPlaceGate, onDeleteGate,
}: {
    gates: GateOperation[];
    qubits: number;
    numCols: number;
    /** Column index up to which gates are highlighted. -1 = none. */
    litUpToCol: number;
    selectedGate: GateType | null;
    controlQubit: number;
    onPlaceGate: (qubit: number, col: number) => void;
    onDeleteGate: (id: string) => void;
}) {
    const svgRef = useRef<SVGSVGElement>(null);
    const [hovered, setHovered] = useState<{ col: number; row: number } | null>(null);
    const [hoveredGateId, setHovGateId] = useState<string | null>(null);

    const svgW = LEFT_PAD + numCols * COL_W + 22;
    const svgH = TOP_PAD + qubits * LANE_H + BOT_PAD;

    // Build occupancy map: "qubit-col" → gateId (for collision detection)
    const occupied = useMemo(() => {
        const m = new Map<string, string>();
        for (const g of gates) {
            const c = gateCol(g);
            m.set(`${g.target}-${c}`, g.id);
            if (isTwoQubitGate(g.type) && g.control !== undefined) {
                m.set(`${g.control}-${c}`, g.id);
            }
        }
        return m;
    }, [gates]);

    // Hit-test: mouse event → {col, row} or null
    const hitCell = useCallback((e: React.MouseEvent<SVGSVGElement>) => {
        const rect = svgRef.current?.getBoundingClientRect();
        if (!rect) return null;
        const rx = e.clientX - rect.left - LEFT_PAD;
        const ry = e.clientY - rect.top - TOP_PAD;
        if (rx < 0 || ry < 0) return null;
        const col = Math.floor(rx / COL_W);
        const row = Math.round((ry - LANE_H / 2) / LANE_H);
        if (col < 0 || col >= numCols || row < 0 || row >= qubits) return null;
        if (Math.abs(ry - (row * LANE_H + LANE_H / 2)) > LANE_H * 0.46) return null;
        return { col, row };
    }, [numCols, qubits]);

    const onMouseMove = useCallback((e: React.MouseEvent<SVGSVGElement>) => setHovered(hitCell(e)), [hitCell]);
    const onMouseLeave = useCallback(() => setHovered(null), []);

    const onSvgClick = useCallback((e: React.MouseEvent<SVGSVGElement>) => {
        const cell = hitCell(e);
        if (!cell || !selectedGate) return;
        const key = `${cell.row}-${cell.col}`;
        if (occupied.has(key)) onDeleteGate(occupied.get(key)!);
        else onPlaceGate(cell.row, cell.col);
    }, [hitCell, selectedGate, occupied, onDeleteGate, onPlaceGate]);

    return (
        <div style={{
            overflowX: "auto", overflowY: "hidden",
            borderRadius: 14, border: "1px solid rgba(255,255,255,0.06)",
            background: "#02060f",
        }}>
            <svg
                ref={svgRef}
                width={svgW} height={svgH}
                style={{ display: "block", cursor: selectedGate ? "crosshair" : "default" }}
                onMouseMove={onMouseMove} onMouseLeave={onMouseLeave} onClick={onSvgClick}
            >
                <defs>
                    <pattern id="qgrid" x="0" y="0" width="16" height="16" patternUnits="userSpaceOnUse">
                        <circle cx="8" cy="8" r="0.75" fill="rgba(0,212,255,0.05)" />
                    </pattern>
                    <linearGradient id="colhi" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor="rgba(0,212,255,0.03)" />
                        <stop offset="50%" stopColor="rgba(0,212,255,0.06)" />
                        <stop offset="100%" stopColor="rgba(0,212,255,0.03)" />
                    </linearGradient>
                </defs>

                {/* Background dot grid */}
                <rect width={svgW} height={svgH} fill="url(#qgrid)" />

                {/* Column highlight on hover */}
                {hovered && (
                    <rect
                        x={LEFT_PAD + hovered.col * COL_W + 5} y={TOP_PAD}
                        width={COL_W - 10} height={qubits * LANE_H}
                        rx={6} fill="url(#colhi)"
                    />
                )}

                {/* Column separator lines */}
                {Array.from({ length: numCols + 1 }, (_, c) => (
                    <line key={`sep-${c}`}
                        x1={LEFT_PAD + c * COL_W} y1={TOP_PAD}
                        x2={LEFT_PAD + c * COL_W} y2={TOP_PAD + qubits * LANE_H}
                        stroke="rgba(255,255,255,0.028)" strokeWidth="1"
                    />
                ))}

                {/* Qubit wires + labels */}
                {Array.from({ length: qubits }, (_, q) => {
                    const y = wireY(q);
                    return (
                        <g key={`wire-${q}`}>
                            {/* Subtle wire glow */}
                            <line x1={LEFT_PAD - 6} y1={y} x2={svgW - 10} y2={y}
                                stroke="rgba(0,212,255,0.06)" strokeWidth="4" />
                            {/* Wire */}
                            <line x1={LEFT_PAD - 6} y1={y} x2={svgW - 10} y2={y}
                                stroke="rgba(0,212,255,0.18)" strokeWidth="1.25" />
                            {/* Label */}
                            <text
                                x={LEFT_PAD - 14} y={y + 1}
                                textAnchor="end" dominantBaseline="middle"
                                fontFamily="JetBrains Mono, monospace" fontSize="12"
                                fill="rgba(0,212,255,0.5)" style={{ userSelect: "none" }}
                            >
                                q[{q}]
                            </text>
                        </g>
                    );
                })}

                {/* Time axis */}
                <line
                    x1={LEFT_PAD} y1={TOP_PAD + qubits * LANE_H + 7}
                    x2={LEFT_PAD + numCols * COL_W} y2={TOP_PAD + qubits * LANE_H + 7}
                    stroke="rgba(40,64,90,0.4)" strokeWidth="1"
                />
                {Array.from({ length: numCols }, (_, c) => (
                    <g key={`tick-${c}`}>
                        <line
                            x1={colX(c)} y1={TOP_PAD + qubits * LANE_H + 7}
                            x2={colX(c)} y2={TOP_PAD + qubits * LANE_H + 14}
                            stroke="rgba(40,64,90,0.4)" strokeWidth="1"
                        />
                        <text
                            x={colX(c)} y={TOP_PAD + qubits * LANE_H + 27}
                            textAnchor="middle"
                            fontFamily="JetBrains Mono, monospace" fontSize="10"
                            fill="rgba(40,64,90,0.6)" style={{ userSelect: "none" }}
                        >
                            {c + 1}
                        </text>
                    </g>
                ))}

                {/* Ghost placement preview */}
                {hovered && selectedGate && !occupied.has(`${hovered.row}-${hovered.col}`) && (
                    <GhostGate
                        col={hovered.col} qubit={hovered.row}
                        gateType={selectedGate} controlQubit={controlQubit}
                    />
                )}

                {/* Placed gates — each isolated in its own <g> to avoid hover leaking */}
                {gates.map((gate) => (
                    <g key={gate.id}
                        onMouseEnter={() => setHovGateId(gate.id)}
                        onMouseLeave={() => setHovGateId(null)}
                    >
                        <PlacedGate
                            gate={gate}
                            hovered={hoveredGateId === gate.id}
                            lit={litUpToCol >= 0 && gateCol(gate) <= litUpToCol}
                            onDelete={onDeleteGate}
                        />
                    </g>
                ))}
            </svg>
        </div>
    );
}

// ── Metric card ───────────────────────────────────────────────────────────────
function MetricCard({
    label, value, accent,
}: { label: string; value: number | string; accent?: string }) {
    return (
        <div style={{
            background: "rgba(2,6,15,0.7)", border: "1px solid rgba(255,255,255,0.06)",
            borderRadius: 12, padding: "10px 13px",
        }}>
            <div style={{
                fontFamily: "JetBrains Mono, monospace", fontSize: 9,
                color: "rgba(40,64,90,0.85)", letterSpacing: "0.1em",
                textTransform: "uppercase", marginBottom: 5,
            }}>{label}</div>
            <div style={{
                fontFamily: "Syne, sans-serif", fontWeight: 700, fontSize: 20,
                color: accent ?? "#c8dff2", lineHeight: 1,
                textShadow: accent ? `0 0 14px ${accent}55` : "none",
            }}>{value}</div>
        </div>
    );
}

// ── Root CircuitBuilder ───────────────────────────────────────────────────────
export default function CircuitBuilder() {
    const [selectedGate, setSelectedGate] = useState<GateType | null>(null);
    const [controlQubit, setControlQubit] = useState(0);
    const [targetQubit, setTargetQubit] = useState(1);
    // Global theta state: changing it updates next placement, shown in palette
    const [theta, setTheta] = useState<number>(() => Math.PI / 2);

    // ── Scan animation state ────────────────────────────────────────────────────
    // litUpToCol: which column index is "lit up" (-1 = none, increases during sim)
    const [litUpToCol, setLitUpToCol] = useState(-1);
    const scanIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
    const currentColRef = useRef(-1);   // column the scan is currently on
    const targetColRef = useRef(0);    // last gate column index to reach
    const pendingResultRef = useRef<{ key: CircuitKey; result: SimulationResult } | null>(null);
    const scanDoneRef = useRef(false);

    const activeCircuit = useCircuitStore((s) => s.activeCircuit);
    const circuit = useCircuitStore((s) => s.circuits[s.activeCircuit]);
    const results = useCircuitStore((s) => s.results);

    const setActiveCircuit = useCircuitStore((s) => s.setActiveCircuit);
    const setQubitCount = useCircuitStore((s) => s.setQubitCount);
    const addGate = useCircuitStore((s) => s.addGate);
    const removeGate = useCircuitStore((s) => s.removeGate);
    const setResult = useCircuitStore((s) => s.setResult);
    const setSocketStatus = useCircuitStore((s) => s.setSocketStatus);
    const setSocketError = useCircuitStore((s) => s.setSocketError);
    const setIsRunning = useCircuitStore((s) => s.setIsRunning);
    const loadMockData = useCircuitStore((s) => s.loadMockData);

    /** Stop any running scan interval. */
    const clearScan = useCallback(() => {
        if (scanIntervalRef.current !== null) {
            clearInterval(scanIntervalRef.current);
            scanIntervalRef.current = null;
        }
    }, []);

    /** Called when scan finishes OR result arrives — whichever is last commits. */
    const commitIfReady = useCallback((key: CircuitKey) => {
        if (scanDoneRef.current && pendingResultRef.current?.key === key) {
            setResult(key, pendingResultRef.current.result);
            pendingResultRef.current = null;
            scanDoneRef.current = false;
            setIsRunning(false);
            // Fade lit gates back after a brief moment so the user sees the final state
            setTimeout(() => setLitUpToCol(-1), 600);
        }
    }, [setIsRunning, setResult]);

    /**
     * Advance the scan by one column tick.
     * When it reaches targetColRef, marks scan done and tries to commit.
     */
    const makeTick = useCallback((key: CircuitKey) => () => {
        currentColRef.current += 1;
        setLitUpToCol(currentColRef.current);
        if (currentColRef.current >= targetColRef.current) {
            clearScan();
            scanDoneRef.current = true;
            commitIfReady(key);
        }
    }, [clearScan, commitIfReady]);

    /**
     * Start the column-by-column scan at msPerCol ms interval.
     * If the scan is already running, speed it up instead of resetting.
     */
    const startScan = useCallback((key: CircuitKey, totalGateCols: number, msPerCol: number) => {
        clearScan();
        currentColRef.current = -1;
        targetColRef.current = totalGateCols - 1;
        scanDoneRef.current = false;
        setLitUpToCol(-1);
        scanIntervalRef.current = setInterval(makeTick(key), msPerCol);
    }, [clearScan, makeTick]);

    /** Compress remaining columns into faster ticks (called when result arrives early). */
    const speedUpScan = useCallback((key: CircuitKey, msPerCol: number) => {
        clearScan();
        // If nothing is left, just mark done immediately
        if (currentColRef.current >= targetColRef.current) {
            scanDoneRef.current = true;
            commitIfReady(key);
            return;
        }
        scanIntervalRef.current = setInterval(makeTick(key), msPerCol);
    }, [clearScan, commitIfReady, makeTick]);

    // Sync theta default when gate selection changes
    const handleSelectGate = useCallback((type: GateType | null) => {
        setSelectedGate(type);
        if (type && isParametricGate(type)) {
            setTheta(getDefaultTheta(type));
        }
    }, []);



    const { status, error, isLoading, reconnect, simulateCircuit } = useWebSocket(WS_URL);

    useEffect(() => { setSocketStatus(status); }, [setSocketStatus, status]);
    useEffect(() => { setSocketError(error); }, [error, setSocketError]);
    useEffect(() => { setIsRunning(isLoading); }, [isLoading, setIsRunning]);

    // Dynamic column count: max occupied col + 4 headroom
    const numCols = useMemo(() => {
        const maxUsed = circuit.gates.reduce((m, g) => Math.max(m, gateCol(g)), -1);
        return Math.max(MIN_COLS, maxUsed + 4);
    }, [circuit.gates]);

    const metrics = useMemo(() => calculateMetrics(circuit), [circuit]);

    const handlePlaceGate = useCallback((qubit: number, col: number) => {
        if (!selectedGate) return;

        const isTwoQ = isTwoQubitGate(selectedGate);
        const safeCtrl = isTwoQ
            ? controlQubit === qubit
                ? (controlQubit + 1) % circuit.qubits
                : controlQubit
            : undefined;

        addGate(activeCircuit, {
            id: `${selectedGate.toLowerCase()}-${Date.now()}-${Math.floor(Math.random() * 9999)}`,
            type: selectedGate,
            target: qubit,
            ...(safeCtrl !== undefined ? { control: safeCtrl } : {}),
            ...(isParametricGate(selectedGate) ? { theta } : {}),
            position: { x: col * COL_W, y: qubit * LANE_H },
        });
    }, [activeCircuit, addGate, circuit.qubits, controlQubit, selectedGate, theta]);

    const handleDeleteGate = useCallback(
        (id: string) => removeGate(activeCircuit, id),
        [activeCircuit, removeGate]
    );

    const runSingleCircuit = useCallback(async (key: CircuitKey) => {
        const cur = useCircuitStore.getState().circuits[key];

        // Calculate how many gate columns exist (minimum 1 so the sweep is visible)
        const maxGateCol = cur.gates.reduce((m, g) => Math.max(m, gateCol(g)), 0);
        const totalGateCols = Math.max(1, maxGateCol + 1);

        // Reset stale state from any prior run
        pendingResultRef.current = null;
        scanDoneRef.current = false;

        try {
            setSocketError(null);
            setIsRunning(true);

            // Fire animation and WebSocket request simultaneously.
            // Normal pace: 110 ms per column (e.g. 8 cols ≈ 880 ms minimum visual)
            startScan(key, totalGateCols, 110);

            const result = await simulateCircuit(serializeCircuit(cur));

            // Result arrived — stash it and speed up the remaining columns.
            pendingResultRef.current = { key, result };

            // Speed-up pace: 35 ms per remaining column so it always finishes smoothly
            speedUpScan(key, 35);

        } catch (err) {
            // On error: stop animation immediately, no pending result
            clearScan();
            setLitUpToCol(-1);
            pendingResultRef.current = null;
            scanDoneRef.current = false;
            setSocketError(err instanceof Error ? err.message : "Simulation failed.");
            setIsRunning(false);
        }
        // NOTE: setIsRunning(false) and setResult() are called inside commitIfReady
        // once BOTH the result is ready AND the scan animation has finished.
    }, [clearScan, setIsRunning, setSocketError, simulateCircuit, speedUpScan, startScan]);

    const runBothCircuits = useCallback(async () => {
        await runSingleCircuit("A");
        await runSingleCircuit("B");
    }, [runSingleCircuit]);

    const wsColor = status === "connected" ? "#00e5a0" : status === "error" ? "#ff3860" : "#ffb340";

    return (
        <section style={{
            background: "rgba(6,13,26,0.85)",
            border: "1px solid rgba(255,255,255,0.07)",
            borderRadius: 24, padding: 20,
            boxShadow: "0 0 0 1px rgba(0,212,255,0.04), 0 24px 64px rgba(0,0,0,0.75)",
            backdropFilter: "blur(12px)",
        }}>
            {/* ── Top toolbar ── */}
            <div style={{
                display: "flex", flexWrap: "wrap", alignItems: "center",
                justifyContent: "space-between", gap: 14, marginBottom: 18,
            }}>
                <div>
                    <h2 style={{
                        fontFamily: "Syne, sans-serif", fontWeight: 700, fontSize: 16,
                        color: "#c8dff2", letterSpacing: "-0.01em",
                    }}>Circuit Builder</h2>
                    <p style={{
                        fontFamily: "JetBrains Mono, monospace", fontSize: 10,
                        color: "rgba(40,64,90,0.85)", marginTop: 3,
                    }}>
                        Select gate → click wire to place · click gate to delete
                    </p>
                </div>

                <div style={{ display: "flex", flexWrap: "wrap", gap: 8, alignItems: "center" }}>
                    {/* Circuit A / B tabs */}
                    {(["A", "B"] as CircuitKey[]).map((k) => (
                        <button key={k} type="button" onClick={() => setActiveCircuit(k)} style={{
                            borderRadius: 12, padding: "7px 16px",
                            fontFamily: "Syne, sans-serif", fontWeight: 600, fontSize: 12, letterSpacing: "0.05em",
                            cursor: "pointer", transition: "all 0.16s",
                            border: activeCircuit === k ? "1px solid rgba(0,212,255,0.45)" : "1px solid rgba(255,255,255,0.07)",
                            background: activeCircuit === k ? "rgba(0,212,255,0.1)" : "transparent",
                            color: activeCircuit === k ? "#00d4ff" : "#c8dff2",
                            boxShadow: activeCircuit === k ? "0 0 14px rgba(0,212,255,0.12)" : "none",
                        }}>Circuit {k}</button>
                    ))}

                    <button type="button" onClick={() => runSingleCircuit(activeCircuit)} style={{
                        borderRadius: 12, padding: "7px 18px",
                        fontFamily: "Syne, sans-serif", fontWeight: 700, fontSize: 12, letterSpacing: "0.04em",
                        cursor: "pointer", border: "1px solid rgba(0,212,255,0.4)",
                        background: "linear-gradient(135deg,rgba(0,212,255,0.18),rgba(0,212,255,0.08))",
                        color: "#00d4ff", boxShadow: "0 0 18px rgba(0,212,255,0.14)",
                    }}>▶ Run {activeCircuit}</button>

                    <button type="button" onClick={runBothCircuits} style={{
                        borderRadius: 12, padding: "7px 18px",
                        fontFamily: "Syne, sans-serif", fontWeight: 700, fontSize: 12, letterSpacing: "0.04em",
                        cursor: "pointer", border: "1px solid rgba(162,89,255,0.4)",
                        background: "linear-gradient(135deg,rgba(162,89,255,0.16),rgba(162,89,255,0.07))",
                        color: "#a259ff", boxShadow: "0 0 18px rgba(162,89,255,0.12)",
                    }}>⇌ A vs B</button>

                    <button type="button" onClick={loadMockData} style={{
                        borderRadius: 12, padding: "7px 14px",
                        fontFamily: "Syne, sans-serif", fontWeight: 600, fontSize: 12,
                        cursor: "pointer", border: "1px solid rgba(255,255,255,0.07)",
                        background: "transparent", color: "rgba(200,223,242,0.45)", transition: "all 0.16s",
                    }}
                        onMouseEnter={(e) => { e.currentTarget.style.color = "#c8dff2"; e.currentTarget.style.background = "rgba(255,255,255,0.04)"; }}
                        onMouseLeave={(e) => { e.currentTarget.style.color = "rgba(200,223,242,0.45)"; e.currentTarget.style.background = "transparent"; }}>
                        Load Mock
                    </button>
                </div>
            </div>

            {/* ── 3-column layout: palette | canvas | right panel ── */}
            <div style={{ display: "grid", gridTemplateColumns: "240px minmax(0,1fr) 276px", gap: 14 }}>

                {/* LEFT: categorized gate palette */}
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
                />

                {/* CENTER: circuit canvas */}
                <div style={{
                    background: "rgba(2,6,15,0.7)", border: "1px solid rgba(255,255,255,0.07)",
                    borderRadius: 20, padding: 14, display: "flex", flexDirection: "column", gap: 12,
                }}>
                    {/* Canvas toolbar */}
                    <div style={{
                        display: "flex", alignItems: "center", justifyContent: "space-between",
                        flexWrap: "wrap", gap: 10,
                    }}>
                        {/* WS status */}
                        <div style={{
                            display: "flex", alignItems: "center", gap: 7,
                            fontFamily: "JetBrains Mono, monospace", fontSize: 10,
                            color: "rgba(40,64,90,0.85)", letterSpacing: "0.04em",
                        }}>
                            <span style={{
                                width: 8, height: 8, borderRadius: "50%", display: "inline-block",
                                background: wsColor, boxShadow: `0 0 7px ${wsColor}`,
                                animation: (isLoading || litUpToCol >= 0) ? "pulse-dot 1s ease-in-out infinite" : "none",
                            }} />
                            ws:{status}
                            {error ? ` · ${error}` : ""}
                            {isLoading ? " · running…" : ""}
                        </div>

                        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                            {/* Qubit count */}
                            <label style={{
                                display: "flex", alignItems: "center", gap: 7,
                                fontFamily: "JetBrains Mono, monospace", fontSize: 10,
                                color: "rgba(40,64,90,0.85)", letterSpacing: "0.06em", textTransform: "uppercase",
                            }}>
                                Qubits
                                <select value={circuit.qubits}
                                    onChange={(e) => setQubitCount(activeCircuit, Number(e.target.value))}
                                    style={{
                                        background: "rgba(6,13,26,0.9)", border: "1px solid rgba(255,255,255,0.08)",
                                        borderRadius: 8, padding: "5px 9px", color: "#c8dff2",
                                        fontFamily: "JetBrains Mono, monospace", fontSize: 12, outline: "none", cursor: "pointer",
                                    }}>
                                    {Array.from({ length: MAX_QUBITS - 1 }, (_, i) => i + 2).map((q) => (
                                        <option key={q} value={q}>{q}</option>
                                    ))}
                                </select>
                            </label>

                            <button type="button" onClick={reconnect} style={{
                                borderRadius: 8, padding: "5px 11px",
                                fontFamily: "JetBrains Mono, monospace", fontSize: 10,
                                cursor: "pointer", border: "1px solid rgba(255,255,255,0.07)",
                                background: "transparent", color: "rgba(200,223,242,0.4)",
                                letterSpacing: "0.04em", transition: "all 0.14s",
                            }}
                                onMouseEnter={(e) => { e.currentTarget.style.color = "#c8dff2"; e.currentTarget.style.background = "rgba(255,255,255,0.04)"; }}
                                onMouseLeave={(e) => { e.currentTarget.style.color = "rgba(200,223,242,0.4)"; e.currentTarget.style.background = "transparent"; }}>
                                reconnect
                            </button>
                        </div>
                    </div>

                    <CircuitSVG
                        gates={circuit.gates}
                        qubits={circuit.qubits}
                        numCols={numCols}
                        litUpToCol={litUpToCol}
                        selectedGate={selectedGate}
                        controlQubit={controlQubit}
                        onPlaceGate={handlePlaceGate}
                        onDeleteGate={handleDeleteGate}
                    />
                </div>

                {/* RIGHT: JSON editor + metrics */}
                <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                    {/* Editable Circuit JSON */}
                    <CircuitJsonEditor circuitKey={activeCircuit} />

                    {/* Live metrics */}
                    <div style={{
                        background: "rgba(2,6,15,0.7)", border: "1px solid rgba(255,255,255,0.07)",
                        borderRadius: 18, padding: 15,
                    }}>
                        <h3 style={{
                            fontFamily: "Syne, sans-serif", fontWeight: 700, fontSize: 12,
                            color: "#c8dff2", letterSpacing: "0.04em", marginBottom: 12,
                        }}>Live Summary</h3>
                        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 9 }}>
                            <MetricCard label="Gate Count" value={metrics.gateCount} accent="#00d4ff" />
                            <MetricCard label="Depth" value={metrics.depth} accent="#a259ff" />
                            <MetricCard label="States · A" value={results.A ? Object.keys(results.A.counts).length : "—"} />
                            <MetricCard label="States · B" value={results.B ? Object.keys(results.B.counts).length : "—"} />
                        </div>
                    </div>
                </div>
            </div>
        </section>
    );
}