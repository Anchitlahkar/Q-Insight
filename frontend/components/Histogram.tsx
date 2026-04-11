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

// ── Per-circuit colour palette (white-system) ─────────────────────────────────
const ACCENT: Record<CircuitKey, {
  primary: string;   // bar fill top / labels / accents
  secondary: string; // bar fill bottom
  dot: string;       // header indicator dot
  badge: string;     // badge background
  badgeBorder: string;
  dominant: string;  // dominant-state bar
}> = {
  A: {
    primary:      "#2563EB",
    secondary:    "#93C5FD",
    dot:          "#2563EB",
    badge:        "#EFF6FF",
    badgeBorder:  "#BFDBFE",
    dominant:     "#F59E0B",
  },
  B: {
    primary:      "#6D28D9",
    secondary:    "#C4B5FD",
    dot:          "#6D28D9",
    badge:        "#F5F3FF",
    badgeBorder:  "#C4B5FD",
    dominant:     "#F59E0B",
  },
};

const buildBasisStates = (qubits: number) =>
  Array.from({ length: 2 ** qubits }, (_, i) => i.toString(2).padStart(qubits, "0"));

// ── Skeleton shown while isRunning ────────────────────────────────────────────
function HistogramSkeleton({ accent }: { accent: typeof ACCENT[CircuitKey] }) {
  return (
    <div style={{ height: 240, display: "flex", alignItems: "flex-end", gap: 8, padding: "10px 4px 0" }}>
      {Array.from({ length: 8 }, (_, i) => (
        <div
          key={i}
          style={{
            flex: 1,
            height: `${30 + (i % 4) * 14}%`,
            borderRadius: "8px 8px 0 0",
            background: `${accent.primary}18`,
            border: `1px solid ${accent.badgeBorder}`,
            animation: `fadeIn ${0.2 + i * 0.06}s ease forwards`,
          }}
        />
      ))}
    </div>
  );
}

// ── Empty state ───────────────────────────────────────────────────────────────
function EmptyState({ accent }: { accent: typeof ACCENT[CircuitKey] }) {
  return (
    <div style={{
      height: 240,
      display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 12,
      border: `1px dashed ${accent.badgeBorder}`,
      borderRadius: 12,
      background: accent.badge,
    }}>
      <svg width="36" height="36" viewBox="0 0 36 36" fill="none">
        <circle cx="18" cy="18" r="6" stroke={accent.primary} strokeWidth="1.4" />
        <ellipse cx="18" cy="18" rx="15" ry="7" stroke={accent.primary} strokeWidth="1" />
        <ellipse cx="18" cy="18" rx="15" ry="7" stroke={accent.primary} strokeWidth="1" transform="rotate(60 18 18)" />
        <ellipse cx="18" cy="18" rx="15" ry="7" stroke={accent.primary} strokeWidth="1" transform="rotate(120 18 18)" />
        <circle cx="18" cy="18" r="2" fill={accent.primary} />
      </svg>
      <div style={{
        fontFamily: "JetBrains Mono, monospace", fontSize: 10, color: accent.primary,
        textAlign: "center", lineHeight: 1.6,
        opacity: 0.7,
      }}>
        Run a simulation to reveal<br />basis-state outcomes
      </div>
    </div>
  );
}

// ── Custom tooltip ────────────────────────────────────────────────────────────
function CustomTooltip({
  active, payload, label, accent, mode,
}: {
  active?: boolean;
  payload?: ReadonlyArray<{ payload: { count: number; probability: number } }>;
  label?: string;
  accent: typeof ACCENT[CircuitKey];
  mode: ChartMode;
}) {
  if (!active || !payload?.length) return null;
  const entry = payload[0].payload;
  return (
    <div style={{
      background: "#FFFFFF",
      border: `1px solid ${accent.badgeBorder}`,
      borderRadius: 10,
      padding: "8px 14px",
      boxShadow: "0 4px 16px rgba(15,23,42,0.1)",
    }}>
      <div style={{ fontFamily: "JetBrains Mono, monospace", fontSize: 10, color: accent.primary, marginBottom: 4 }}>
        |{label}⟩
      </div>
      <div style={{ fontFamily: "Syne, sans-serif", fontWeight: 700, fontSize: 18, color: "#1F2937" }}>
        {mode === "counts" ? `${entry.count} counts` : `${(entry.probability * 100).toFixed(2)}%`}
      </div>
      <div style={{ fontFamily: "JetBrains Mono, monospace", fontSize: 9, color: "#6B7280", marginTop: 3 }}>
        {(entry.probability * 100).toFixed(2)}% · {entry.count} raw counts
      </div>
    </div>
  );
}

// ── Main component ────────────────────────────────────────────────────────────
function HistogramComponent({ circuitKey, title }: HistogramProps) {
  const [mode, setMode] = useState<ChartMode>("probability");
  const result    = useCircuitStore((s) => s.results[circuitKey]);
  const qubits    = useCircuitStore((s) => s.circuits[circuitKey].qubits);
  const isRunning = useCircuitStore((s) => s.isRunning);
  const accent    = ACCENT[circuitKey];

  const data = useMemo(() => {
    const counts      = result?.counts ?? {};
    const basisStates = buildBasisStates(qubits);
    const total       = Math.max(1, Object.values(counts).reduce((s, c) => s + c, 0));

    return basisStates.map((state) => {
      const count = counts[state] ?? 0;
      return {
        state,
        count,
        probability: count / total,
        value: mode === "counts" ? count : count / total,
      };
    });
  }, [mode, qubits, result?.counts]);

  const dominantState = useMemo(
    () => data.reduce((best, e) => (e.count > best.count ? e : best), data[0] ?? { state: "—", count: 0, probability: 0, value: 0 }),
    [data]
  );
  const hasData = data.some((e) => e.count > 0);

  const gradId = `bar-${circuitKey}`;
  const domGradId = `bar-dom-${circuitKey}`;

  return (
    <section style={{
      background: "#FFFFFF",
      border: "1px solid #E5E7EB",
      borderRadius: 16,
      padding: 18,
      boxShadow: "0 4px 24px rgba(15,23,42,0.06)",
    }}>
      {/* Header */}
      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", marginBottom: 16, gap: 12, flexWrap: "wrap" }}>
        <div>
          <div style={{ display: "flex", alignItems: "center", gap: 7, marginBottom: 4 }}>
            {/* Circuit colour dot */}
            <span style={{ width: 10, height: 10, borderRadius: "50%", background: accent.dot, flexShrink: 0 }} />
            <h2 style={{ fontFamily: "Syne, sans-serif", fontWeight: 700, fontSize: 15, color: "#1F2937", margin: 0 }}>
              {title}
            </h2>
            {/* Circuit key badge */}
            <span style={{
              fontFamily: "JetBrains Mono, monospace", fontSize: 9, fontWeight: 600,
              color: accent.primary, background: accent.badge,
              border: `1px solid ${accent.badgeBorder}`,
              borderRadius: 6, padding: "2px 7px", letterSpacing: "0.08em",
            }}>
              {circuitKey}
            </span>
          </div>
          <p style={{ fontFamily: "JetBrains Mono, monospace", fontSize: 9, color: "#6B7280", margin: 0 }}>
            {qubits}q full basis · dominant |{dominantState.state}⟩
          </p>
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          {/* Mode toggle */}
          <div style={{
            display: "inline-flex", padding: 3,
            borderRadius: 999, background: "#F9FAFB", border: "1px solid #E5E7EB",
          }}>
            {(["probability", "counts"] as const).map((item) => (
              <button
                key={item}
                type="button"
                onClick={() => setMode(item)}
                style={{
                  borderRadius: 999, border: "none",
                  background: mode === item ? accent.badge : "transparent",
                  color: mode === item ? accent.primary : "#6B7280",
                  padding: "4px 10px", cursor: "pointer",
                  fontFamily: "JetBrains Mono, monospace", fontSize: 9,
                  letterSpacing: "0.06em", textTransform: "uppercase",
                  fontWeight: mode === item ? 600 : 400,
                  transition: "all 0.13s",
                }}
              >
                {item}
              </button>
            ))}
          </div>

          {/* State count pill */}
          <div style={{
            fontFamily: "JetBrains Mono, monospace", fontSize: 9,
            color: hasData ? accent.primary : "#9CA3AF",
            background: hasData ? accent.badge : "#F9FAFB",
            border: `1px solid ${hasData ? accent.badgeBorder : "#E5E7EB"}`,
            borderRadius: 999, padding: "4px 11px", letterSpacing: "0.06em",
          }}>
            {hasData ? `${data.length} states` : "no data"}
          </div>
        </div>
      </div>

      {/* Divider */}
      <div style={{ height: 1, marginBottom: 14, background: "#F3F4F6" }} />

      {/* Chart area */}
      {isRunning && !hasData ? (
        <HistogramSkeleton accent={accent} />
      ) : hasData ? (
        <div style={{ height: 240 }}>
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={data} margin={{ top: 4, right: 4, left: -8, bottom: 0 }}>
              <defs>
                <linearGradient id={gradId} x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%"   stopColor={accent.primary}   stopOpacity={0.85} />
                  <stop offset="100%" stopColor={accent.secondary} stopOpacity={0.35} />
                </linearGradient>
                <linearGradient id={domGradId} x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%"   stopColor={accent.dominant} stopOpacity={1}    />
                  <stop offset="100%" stopColor={accent.primary}  stopOpacity={0.45} />
                </linearGradient>
              </defs>

              <CartesianGrid stroke="#F3F4F6" horizontal vertical={false} />

              <XAxis
                dataKey="state"
                stroke="#D1D5DB"
                tickLine={false}
                axisLine={false}
                tick={{ fontFamily: "JetBrains Mono, monospace", fontSize: 9, fill: "#6B7280" }}
                tickFormatter={(v) => `|${v}⟩`}
                interval={0}
                angle={data.length > 8 ? -28 : 0}
                textAnchor={data.length > 8 ? "end" : "middle"}
                height={data.length > 8 ? 48 : 28}
              />

              <YAxis
                stroke="#D1D5DB"
                tickLine={false}
                axisLine={false}
                tick={{ fontFamily: "JetBrains Mono, monospace", fontSize: 9, fill: "#9CA3AF" }}
                tickFormatter={(v) =>
                  mode === "counts" ? String(v) : `${Math.round(Number(v) * 100)}%`
                }
              />

              <Tooltip
                content={(props) => (
                  <CustomTooltip
                    active={props.active}
                    payload={props.payload as unknown as ReadonlyArray<{ payload: { count: number; probability: number } }>}
                    label={props.label ? String(props.label) : undefined}
                    accent={accent}
                    mode={mode}
                  />
                )}
                cursor={{ fill: "rgba(0,0,0,0.03)" }}
              />

              <Bar dataKey="value" radius={[6, 6, 0, 0]} maxBarSize={48} animationDuration={380} animationEasing="ease-out">
                {data.map((entry) => (
                  <Cell
                    key={entry.state}
                    fill={entry.state === dominantState.state ? `url(#${domGradId})` : `url(#${gradId})`}
                    stroke={entry.state === dominantState.state ? accent.dominant : "transparent"}
                    strokeWidth={entry.state === dominantState.state ? 1.5 : 0}
                  />
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