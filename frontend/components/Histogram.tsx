"use client";

import { memo, useMemo, useState } from "react";
import { Bar, BarChart, CartesianGrid, Cell, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { CircuitKey } from "@/lib/types";
import { useCircuitStore } from "@/store/useCircuitStore";

type HistogramProps = {
  circuitKey: CircuitKey;
  title: string;
};

type ChartMode = "probability" | "counts";

const ACCENT: Record<CircuitKey, { primary: string; secondary: string; glow: string }> = {
  A: {
    primary: "#00d4ff",
    secondary: "rgba(0,212,255,0.25)",
    glow: "rgba(0,212,255,0.18)"
  },
  B: {
    primary: "#a259ff",
    secondary: "rgba(162,89,255,0.25)",
    glow: "rgba(162,89,255,0.18)"
  }
};

const buildBasisStates = (qubits: number) =>
  Array.from({ length: 2 ** qubits }, (_, index) => index.toString(2).padStart(qubits, "0"));

function HistogramSkeleton({ accent }: { accent: (typeof ACCENT)[CircuitKey] }) {
  return (
    <div style={{ height: 260, display: "flex", alignItems: "flex-end", gap: 10, padding: "14px 8px 0" }}>
      {Array.from({ length: 8 }, (_, index) => (
        <div key={index} style={{ flex: 1, height: `${35 + (index % 4) * 12}%`, borderRadius: "10px 10px 0 0", background: `linear-gradient(180deg, ${accent.primary}30 0%, rgba(255,255,255,0.03) 100%)`, animation: `fade-in-up ${0.25 + index * 0.05}s ease forwards` }} />
      ))}
    </div>
  );
}

function EmptyState({ accent }: { accent: (typeof ACCENT)[CircuitKey] }) {
  return (
    <div style={{ height: 260, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 12, border: "1px dashed rgba(255,255,255,0.07)", borderRadius: 16, background: "rgba(2,6,15,0.4)" }}>
      <svg width="40" height="40" viewBox="0 0 40 40" fill="none" opacity={0.34}>
        <circle cx="20" cy="20" r="7" stroke={accent.primary} strokeWidth="1.4" />
        <ellipse cx="20" cy="20" rx="17" ry="7.5" stroke={accent.primary} strokeWidth="1" />
        <ellipse cx="20" cy="20" rx="17" ry="7.5" stroke={accent.primary} strokeWidth="1" transform="rotate(60 20 20)" />
        <ellipse cx="20" cy="20" rx="17" ry="7.5" stroke={accent.primary} strokeWidth="1" transform="rotate(120 20 20)" />
        <circle cx="20" cy="20" r="2.2" fill={accent.primary} />
      </svg>
      <div style={{ fontFamily: "JetBrains Mono, monospace", fontSize: 11, color: "rgba(40,64,90,0.7)", letterSpacing: "0.06em", textAlign: "center", lineHeight: 1.6 }}>
        Run a simulation to reveal<br />all basis-state outcomes
      </div>
    </div>
  );
}

function CustomTooltip({
  active,
  payload,
  label,
  accent,
  mode
}: {
  active?: boolean;
  payload?: ReadonlyArray<{ payload: { count: number; probability: number } }>;
  label?: string;
  accent: (typeof ACCENT)[CircuitKey];
  mode: ChartMode;
}) {
  if (!active || !payload?.length) return null;
  const entry = payload[0].payload;
  return (
    <div style={{ background: "rgba(6,13,26,0.97)", border: `1px solid ${accent.primary}40`, borderRadius: 10, padding: "8px 14px", boxShadow: `0 0 20px ${accent.glow}` }}>
      <div style={{ fontFamily: "JetBrains Mono, monospace", fontSize: 11, color: accent.primary, letterSpacing: "0.06em", marginBottom: 4 }}>
        |{label}&gt;
      </div>
      <div style={{ fontFamily: "Syne, sans-serif", fontWeight: 700, fontSize: 18, color: "#c8dff2" }}>
        {mode === "counts" ? `${entry.count} counts` : `${(entry.probability * 100).toFixed(2)}%`}
      </div>
      <div style={{ fontFamily: "JetBrains Mono, monospace", fontSize: 10, color: "rgba(200,223,242,0.52)", marginTop: 4 }}>
        {(entry.probability * 100).toFixed(2)}% · {entry.count} raw counts
      </div>
    </div>
  );
}

function HistogramComponent({ circuitKey, title }: HistogramProps) {
  const [mode, setMode] = useState<ChartMode>("probability");
  const result = useCircuitStore((state) => state.results[circuitKey]);
  const qubits = useCircuitStore((state) => state.circuits[circuitKey].qubits);
  const isRunning = useCircuitStore((state) => state.isRunning);
  const accent = ACCENT[circuitKey];

  const data = useMemo(() => {
    const counts = result?.counts ?? {};
    const basisStates = buildBasisStates(qubits);
    const total = Math.max(1, Object.values(counts).reduce((sum, count) => sum + count, 0));

    return basisStates.map((state) => {
      const count = counts[state] ?? 0;
      return {
        state,
        count,
        probability: count / total,
        value: mode === "counts" ? count : count / total
      };
    });
  }, [mode, qubits, result?.counts]);

  const dominantState = useMemo(() => data.reduce((best, entry) => (entry.count > best.count ? entry : best), data[0] ?? { state: "—", count: 0, probability: 0, value: 0 }), [data]);
  const hasData = data.some((entry) => entry.count > 0);

  return (
    <section style={{ background: "rgba(6,13,26,0.85)", border: "1px solid rgba(255,255,255,0.07)", borderRadius: 24, padding: 20, boxShadow: "0 0 0 1px rgba(0,212,255,0.04), 0 16px 48px rgba(0,0,0,0.6)", backdropFilter: "blur(12px)" }}>
      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", marginBottom: 20, gap: 12 }}>
        <div>
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 5 }}>
            <div style={{ width: 10, height: 10, borderRadius: "50%", background: accent.primary, boxShadow: `0 0 10px ${accent.primary}`, flexShrink: 0 }} />
            <h2 style={{ fontFamily: "Syne, sans-serif", fontWeight: 700, fontSize: 16, color: "#c8dff2", letterSpacing: "-0.01em" }}>{title}</h2>
            <span style={{ fontFamily: "JetBrains Mono, monospace", fontSize: 10, fontWeight: 500, color: accent.primary, background: `${accent.primary}14`, border: `1px solid ${accent.primary}35`, borderRadius: 6, padding: "2px 7px", letterSpacing: "0.08em" }}>{circuitKey}</span>
          </div>
          <p style={{ fontFamily: "JetBrains Mono, monospace", fontSize: 10, color: "rgba(40,64,90,0.9)", letterSpacing: "0.04em" }}>{qubits}q full basis view · dominant |{dominantState.state}&gt;</p>
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <div style={{ display: "inline-flex", padding: 3, borderRadius: 999, background: "rgba(2,6,15,0.7)", border: "1px solid rgba(255,255,255,0.07)" }}>
            {(["probability", "counts"] as const).map((item) => (
              <button key={item} type="button" onClick={() => setMode(item)} style={{ borderRadius: 999, border: "none", background: mode === item ? `${accent.primary}18` : "transparent", color: mode === item ? accent.primary : "rgba(200,223,242,0.5)", padding: "5px 10px", cursor: "pointer", fontFamily: "JetBrains Mono, monospace", fontSize: 10, letterSpacing: "0.06em", textTransform: "uppercase" }}>
                {item}
              </button>
            ))}
          </div>
          <div style={{ fontFamily: "JetBrains Mono, monospace", fontSize: 10, color: hasData ? accent.primary : "rgba(40,64,90,0.7)", background: hasData ? `${accent.primary}10` : "transparent", border: `1px solid ${hasData ? `${accent.primary}30` : "rgba(255,255,255,0.06)"}`, borderRadius: 20, padding: "4px 12px", letterSpacing: "0.06em" }}>
            {hasData ? `${data.length} states` : "no data"}
          </div>
        </div>
      </div>

      <div style={{ height: 1, marginBottom: 20, background: `linear-gradient(90deg, ${accent.primary}40 0%, ${accent.secondary} 60%, transparent 100%)` }} />

      {isRunning && !hasData ? (
        <HistogramSkeleton accent={accent} />
      ) : hasData ? (
        <div style={{ height: 260 }}>
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={data} margin={{ top: 4, right: 4, left: -8, bottom: 0 }}>
              <defs>
                <linearGradient id={`barGrad-${circuitKey}`} x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor={accent.primary} stopOpacity={0.95} />
                  <stop offset="100%" stopColor={accent.primary} stopOpacity={0.28} />
                </linearGradient>
                <linearGradient id={`barDominant-${circuitKey}`} x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#ffd166" stopOpacity={1} />
                  <stop offset="100%" stopColor={accent.primary} stopOpacity={0.55} />
                </linearGradient>
              </defs>
              <CartesianGrid stroke="rgba(0,212,255,0.04)" horizontal vertical={false} />
              <XAxis dataKey="state" stroke="rgba(40,64,90,0.7)" tickLine={false} axisLine={false} tick={{ fontFamily: "JetBrains Mono, monospace", fontSize: 10, fill: "rgba(200,223,242,0.4)", letterSpacing: "0.04em" }} tickFormatter={(value) => `|${value}>`} interval={0} angle={data.length > 8 ? -28 : 0} textAnchor={data.length > 8 ? "end" : "middle"} height={data.length > 8 ? 48 : 30} />
              <YAxis stroke="rgba(40,64,90,0.7)" tickLine={false} axisLine={false} tick={{ fontFamily: "JetBrains Mono, monospace", fontSize: 9, fill: "rgba(40,64,90,0.8)" }} tickFormatter={(value) => (mode === "counts" ? String(value) : `${Math.round(Number(value) * 100)}%`)} />
              <Tooltip content={(props) => <CustomTooltip active={props.active} payload={props.payload as unknown as ReadonlyArray<{ payload: { count: number; probability: number } }>} label={props.label ? String(props.label) : undefined} accent={accent} mode={mode} />} cursor={{ fill: "rgba(255,255,255,0.025)" }} />
              <Bar dataKey="value" radius={[6, 6, 0, 0]} maxBarSize={48} animationDuration={420} animationEasing="ease-out">
                {data.map((entry) => (
                  <Cell key={entry.state} fill={entry.state === dominantState.state ? `url(#barDominant-${circuitKey})` : `url(#barGrad-${circuitKey})`} stroke={entry.state === dominantState.state ? "rgba(255,209,102,0.7)" : "transparent"} strokeWidth={entry.state === dominantState.state ? 1.2 : 0} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      ) : (
        <EmptyState accent={accent} />
      )}
    </section>
  );
}

export default memo(HistogramComponent);





