"use client";

import { memo, useMemo } from "react";
import { calculateMetrics } from "@/lib/circuit";
import { useCircuitStore } from "@/store/useCircuitStore";

// ── Design tokens ─────────────────────────────────────────────────────────────
const T = {
  bg:        "#FFFFFF",
  surface:   "#F9FAFB",
  border:    "#E5E7EB",
  borderRow: "#F3F4F6",
  text:      "#1F2937",
  muted:     "#6B7280",
  hint:      "#9CA3AF",
  mono:      "JetBrains Mono, monospace",
  head:      "Syne, sans-serif",
  // Circuit A = blue
  a:         { text: "#1D4ED8", light: "#EFF6FF", border: "#BFDBFE", strong: "#1E40AF" },
  // Circuit B = violet (distinct from blue, avoids neon purple)
  b:         { text: "#6D28D9", light: "#F5F3FF", border: "#C4B5FD", strong: "#5B21B6" },
  // Win = green tint, lose = none, tie = gray
  win:       { text: "#065F46", light: "#ECFDF5", border: "#6EE7B7" },
} as const;

// ── Helpers ───────────────────────────────────────────────────────────────────
function percentDiff(base: number, compare: number) {
  if (base === 0) return compare === 0 ? 0 : 100;
  return Math.round((Math.abs(compare - base) / base) * 100);
}

function getWinner(a: number, b: number, lowerIsBetter = true): "A" | "B" | "tie" {
  if (a === b) return "tie";
  return lowerIsBetter ? (a < b ? "A" : "B") : (a > b ? "A" : "B");
}

function getDifferenceLabel(a: number, b: number) {
  const delta = b - a;
  if (delta === 0) return "±0";
  return `${delta > 0 ? "+" : ""}${delta}`;
}

function efficiencyImprovementPercent(worse: number, better: number) {
  if (worse === 0) return 0;
  return Math.round(((worse - better) / worse) * 100);
}

function buildExplanation(label: string, a: number, b: number, lowerIsBetter: boolean) {
  const winner = getWinner(a, b, lowerIsBetter);
  if (winner === "tie") return `Both circuits are identical for ${label.toLowerCase()}.`;

  if (label === "Efficiency Score") {
    const better = winner === "A" ? a : b;
    const worse  = winner === "A" ? b : a;
    return `Circuit ${winner} is ${efficiencyImprovementPercent(worse, better)}% more efficient on the weighted score.`;
  }
  if (label === "Gate Count") {
    const worse = winner === "A" ? b : a;
    const betterVal = winner === "A" ? a : b;
    return `Circuit ${winner} uses ${percentDiff(worse, betterVal)}% fewer gates.`;
  }
  if (label === "Circuit Depth")
    return winner === "A" ? "Circuit A is faster due to lower depth." : "Circuit B is faster due to lower depth.";
  if (label === "Two-Qubit Layer Depth")
    return winner === "A"
      ? "Circuit A pushes interactions deeper into the two-qubit portion."
      : "Circuit B pushes interactions deeper into the two-qubit portion.";
  if (label === "Measured States")
    return winner === "A"
      ? "Circuit A explores a broader output distribution."
      : "Circuit B explores a broader output distribution.";
  if (label === "Statevector Length")
    return `Both circuits occupy ${Math.max(a, b)} amplitude slots when an unmeasured statevector is available.`;

  return `Circuit ${winner} performs better on ${label.toLowerCase()}.`;
}

// ── Winner badge ──────────────────────────────────────────────────────────────
function WinnerBadge({ winner }: { winner: "A" | "B" | "tie" }) {
  const style =
    winner === "A" ? { bg: T.a.light, border: T.a.border, color: T.a.text } :
    winner === "B" ? { bg: T.b.light, border: T.b.border, color: T.b.text } :
                    { bg: T.surface,  border: T.border,   color: T.muted   };
  return (
    <span style={{
      display: "inline-block",
      background: style.bg,
      border: `1px solid ${style.border}`,
      color: style.color,
      borderRadius: 999,
      padding: "3px 10px",
      fontFamily: T.mono,
      fontSize: 10,
      fontWeight: 600,
      letterSpacing: "0.04em",
    }}>
      {winner === "tie" ? "Tie" : `Circuit ${winner}`}
    </span>
  );
}

// ── Value cell ────────────────────────────────────────────────────────────────
function ValueCell({
  value, delta, isWinner, circuit,
}: {
  value: number; delta: string; isWinner: boolean; circuit: "A" | "B";
}) {
  const palette = circuit === "A" ? T.a : T.b;
  return (
    <td style={{ padding: "13px 16px", verticalAlign: "top" }}>
      <div style={{
        fontFamily: T.mono,
        fontSize: 18,
        fontWeight: isWinner ? 700 : 400,
        color: isWinner ? palette.strong : T.hint,
        marginBottom: 4,
        lineHeight: 1,
      }}>
        {value}
      </div>
      {isWinner && (
        <div style={{
          display: "inline-flex", alignItems: "center", gap: 3,
          background: T.win.light, border: `1px solid ${T.win.border}`,
          borderRadius: 999, padding: "1px 7px",
          fontFamily: T.mono, fontSize: 8, color: T.win.text, letterSpacing: "0.06em",
        }}>
          ✓ better
        </div>
      )}
      {!isWinner && (
        <div style={{ fontFamily: T.mono, fontSize: 9, color: T.hint }}>
          {delta}
        </div>
      )}
    </td>
  );
}

// ── Main component ────────────────────────────────────────────────────────────
function ComparisonTableComponent() {
  const circuits = useCircuitStore((s) => s.circuits);
  const results  = useCircuitStore((s) => s.results);

  const metrics = useMemo(() => ({
    A: calculateMetrics(circuits.A),
    B: calculateMetrics(circuits.B),
  }), [circuits]);

  const measuredStates = useMemo(() => ({
    A: Object.keys(results.A?.counts ?? {}).length,
    B: Object.keys(results.B?.counts ?? {}).length,
  }), [results.A?.counts, results.B?.counts]);

  const rows = useMemo(() => {
    const svA = results.A?.statevector?.length ?? 0;
    const svB = results.B?.statevector?.length ?? 0;

    return [
      {
        label: "Efficiency Score",
        description: "Weighted: depth × 0.6 + gate count × 0.4",
        a: metrics.A.efficiencyScore, b: metrics.B.efficiencyScore, lowerIsBetter: true,
      },
      {
        label: "Gate Count",
        description: "Total quantum operations applied",
        a: metrics.A.gateCount, b: metrics.B.gateCount, lowerIsBetter: true,
      },
      {
        label: "Circuit Depth",
        description: "Maximum critical path length",
        a: metrics.A.depth, b: metrics.B.depth, lowerIsBetter: true,
      },
      {
        label: "Two-Qubit Layer Depth",
        description: "Deepest layer touched by any two-qubit gate",
        a: metrics.A.twoQubitLayerDepth, b: metrics.B.twoQubitLayerDepth, lowerIsBetter: false,
      },
      {
        label: "Measured States",
        description: "Distinct outcomes in basis-state distribution",
        a: measuredStates.A, b: measuredStates.B, lowerIsBetter: false,
      },
      {
        label: "Statevector Length",
        description: "Amplitude register size (unmeasured)",
        a: svA, b: svB, lowerIsBetter: false,
      },
    ].map((row) => ({
      ...row,
      winner:      getWinner(row.a, row.b, row.lowerIsBetter),
      explanation: buildExplanation(row.label, row.a, row.b, row.lowerIsBetter),
      deltaA:      getDifferenceLabel(row.b, row.a),
      deltaB:      getDifferenceLabel(row.a, row.b),
    }));
  }, [measuredStates, metrics, results]);

  const comparison = useMemo(() => {
    const effWinner    = getWinner(metrics.A.efficiencyScore, metrics.B.efficiencyScore, true);
    const depthWinner  = getWinner(metrics.A.depth,           metrics.B.depth,           true);
    const gateWinner   = getWinner(metrics.A.gateCount,       metrics.B.gateCount,       true);
    const tqWinner     = getWinner(metrics.A.twoQubitLayerDepth, metrics.B.twoQubitLayerDepth, false);
    const statesDiff   = measuredStates.A !== measuredStates.B;

    const insights: string[] = [];
    if      (effWinner === "A") insights.push(`Circuit A is ${efficiencyImprovementPercent(metrics.B.efficiencyScore, metrics.A.efficiencyScore)}% more efficient.`);
    else if (effWinner === "B") insights.push(`Circuit B is ${efficiencyImprovementPercent(metrics.A.efficiencyScore, metrics.B.efficiencyScore)}% more efficient.`);
    if      (depthWinner === "A") insights.push("Circuit A is faster due to lower depth.");
    else if (depthWinner === "B") insights.push("Circuit B is faster due to lower depth.");
    if      (gateWinner === "A") insights.push("Circuit A uses fewer gates.");
    else if (gateWinner === "B") insights.push("Circuit B uses fewer gates.");
    if (statesDiff) insights.push("Circuits produce different output distributions.");
    if      (tqWinner === "A") insights.push("Circuit A carries two-qubit interactions deeper.");
    else if (tqWinner === "B") insights.push("Circuit B carries two-qubit interactions deeper.");
    if (insights.length === 0) insights.push("Both circuits are evenly matched.");

    let winner: "A" | "B" | "tie" = "tie";
    let summary = "Both circuits are similarly efficient overall.";
    if      (effWinner   !== "tie") { winner = effWinner;   summary = `Circuit ${winner} is more efficient on the weighted depth + gate-count score.`; }
    else if (depthWinner !== "tie") { winner = depthWinner; summary = `Circuit ${winner} has the edge — depth most directly affects execution time.`; }
    else if (gateWinner  !== "tie") { winner = gateWinner;  summary = `Circuit ${winner} is more efficient due to reduced gate count.`; }

    return { insights, winner, summary };
  }, [measuredStates, metrics]);

  return (
    <section style={{
      background: T.bg,
      border: `1px solid ${T.border}`,
      borderRadius: 16,
      padding: 20,
      boxShadow: "0 4px 24px rgba(15,23,42,0.06)",
    }}>
      {/* ── Header ── */}
      <div style={{ display: "flex", flexWrap: "wrap", alignItems: "flex-start", justifyContent: "space-between", gap: 16, marginBottom: 20 }}>
        <div>
          <h2 style={{ margin: 0, fontFamily: T.head, fontWeight: 700, fontSize: 18, color: T.text }}>
            Comparison Metrics
          </h2>
          <p style={{ margin: "4px 0 0", fontFamily: T.mono, fontSize: 10, color: T.muted }}>
            Side-by-side circuit complexity and output analysis
          </p>
        </div>

        {/* Summary cards */}
        <div style={{ display: "grid", gap: 10, minWidth: 260, maxWidth: 440 }}>

          {/* Winner card */}
          <div style={{ background: T.surface, border: `1px solid ${T.border}`, borderRadius: 12, padding: "12px 16px" }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10, marginBottom: 8 }}>
              <span style={{ fontFamily: T.mono, fontSize: 9, color: T.muted, textTransform: "uppercase", letterSpacing: "0.1em" }}>
                Overall winner
              </span>
              <WinnerBadge winner={comparison.winner} />
            </div>
            <p style={{ margin: 0, fontFamily: T.head, fontWeight: 600, fontSize: 13, color: T.text, lineHeight: 1.45 }}>
              {comparison.summary}
            </p>
          </div>

          {/* Insights card */}
          <div style={{ background: T.surface, border: `1px solid ${T.border}`, borderRadius: 12, padding: "12px 16px" }}>
            <div style={{ fontFamily: T.mono, fontSize: 9, color: T.muted, textTransform: "uppercase", letterSpacing: "0.1em", marginBottom: 8 }}>
              Insights
            </div>
            <ul style={{ margin: 0, paddingLeft: 16, display: "grid", gap: 5 }}>
              {comparison.insights.map((insight) => (
                <li key={insight} style={{ fontFamily: T.mono, fontSize: 10, color: T.text, lineHeight: 1.5 }}>
                  {insight}
                </li>
              ))}
            </ul>
          </div>
        </div>
      </div>

      {/* ── Divider ── */}
      <div style={{ height: 1, marginBottom: 16, background: T.borderRow }} />

      {/* ── Table ── */}
      <div style={{ overflow: "hidden", borderRadius: 12, border: `1px solid ${T.border}` }}>
        <table style={{ width: "100%", borderCollapse: "collapse" }}>
          <thead>
            <tr style={{ background: T.surface }}>
              <th style={{ padding: "10px 16px", textAlign: "left", fontFamily: T.mono, fontSize: 9, fontWeight: 600, letterSpacing: "0.1em", textTransform: "uppercase", color: T.muted, width: "36%", borderBottom: `1px solid ${T.border}` }}>
                Metric
              </th>
              {/* Circuit A header */}
              <th style={{ padding: "10px 16px", textAlign: "left", fontFamily: T.mono, fontSize: 9, fontWeight: 600, letterSpacing: "0.1em", textTransform: "uppercase", color: T.a.text, width: "16%", borderBottom: `1px solid ${T.border}` }}>
                <span style={{ display: "flex", alignItems: "center", gap: 5 }}>
                  <span style={{ width: 8, height: 8, borderRadius: "50%", background: T.a.text, flexShrink: 0 }} />
                  Circuit A
                </span>
              </th>
              {/* Circuit B header */}
              <th style={{ padding: "10px 16px", textAlign: "left", fontFamily: T.mono, fontSize: 9, fontWeight: 600, letterSpacing: "0.1em", textTransform: "uppercase", color: T.b.text, width: "16%", borderBottom: `1px solid ${T.border}` }}>
                <span style={{ display: "flex", alignItems: "center", gap: 5 }}>
                  <span style={{ width: 8, height: 8, borderRadius: "50%", background: T.b.text, flexShrink: 0 }} />
                  Circuit B
                </span>
              </th>
              <th style={{ padding: "10px 16px", textAlign: "left", fontFamily: T.mono, fontSize: 9, fontWeight: 600, letterSpacing: "0.1em", textTransform: "uppercase", color: T.muted, width: "32%", borderBottom: `1px solid ${T.border}` }}>
                Insight
              </th>
            </tr>
          </thead>

          <tbody>
            {rows.map((row, index) => (
              <tr
                key={row.label}
                style={{
                  borderTop: index === 0 ? "none" : `1px solid ${T.borderRow}`,
                  background: index % 2 === 0 ? T.bg : T.surface,
                }}
              >
                {/* Metric label + description */}
                <td style={{ padding: "13px 16px", verticalAlign: "top" }}>
                  <div style={{ fontFamily: T.head, fontWeight: 600, fontSize: 13, color: T.text, marginBottom: 3 }}>
                    {row.label}
                  </div>
                  <div style={{ fontFamily: T.mono, fontSize: 9, color: T.muted, lineHeight: 1.4 }}>
                    {row.description}
                  </div>
                </td>

                {/* A value */}
                <ValueCell
                  value={row.a}
                  delta={`vs B: ${row.deltaA}`}
                  isWinner={row.winner === "A"}
                  circuit="A"
                />

                {/* B value */}
                <ValueCell
                  value={row.b}
                  delta={`vs A: ${row.deltaB}`}
                  isWinner={row.winner === "B"}
                  circuit="B"
                />

                {/* Insight */}
                <td style={{ padding: "13px 16px", verticalAlign: "top" }}>
                  <div style={{
                    fontFamily: T.mono, fontSize: 10,
                    color: row.winner === "tie" ? T.muted : T.text,
                    lineHeight: 1.55,
                  }}>
                    {row.explanation}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

export default memo(ComparisonTableComponent);