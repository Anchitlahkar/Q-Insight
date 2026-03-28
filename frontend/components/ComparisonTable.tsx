"use client";

import { memo, useMemo } from "react";
import { calculateMetrics } from "@/lib/circuit";
import { useCircuitStore } from "@/store/useCircuitStore";

type CompareRow = {
  label: string;
  description: string;
  a: number;
  b: number;
  lowerIsBetter?: boolean;
  explanation: string;
  differenceLabel: string;
};

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
  if (delta === 0) return "0";
  return `${delta > 0 ? "+" : "-"}${Math.abs(delta)}`;
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
    const worse = winner === "A" ? b : a;
    return `Circuit ${winner} is ${efficiencyImprovementPercent(worse, better)}% more efficient on the weighted score.`;
  }

  if (label === "Gate Count") {
    const better = winner === "A" ? "A" : "B";
    const worse = winner === "A" ? b : a;
    const betterValue = winner === "A" ? a : b;
    return `Circuit ${better} uses ${percentDiff(worse, betterValue)}% fewer gates.`;
  }

  if (label === "Circuit Depth") {
    return winner === "A"
      ? "Circuit A is faster due to lower depth."
      : "Circuit B is faster due to lower depth.";
  }

  if (label === "Two-Qubit Layer Depth") {
    return winner === "A"
      ? "Circuit A pushes interactions deeper into the two-qubit portion of the circuit."
      : "Circuit B pushes interactions deeper into the two-qubit portion of the circuit.";
  }

  if (label === "Measured States") {
    return winner === "A"
      ? "Circuit A explores a broader output distribution."
      : "Circuit B explores a broader output distribution.";
  }

  if (label === "Statevector Length") {
    return `Both circuits occupy ${Math.max(a, b)} amplitude slots when an unmeasured statevector is available.`;
  }

  return `Circuit ${winner} performs better on ${label.toLowerCase()}.`;
}

function ComparisonTableComponent() {
  const circuits = useCircuitStore((state) => state.circuits);
  const results = useCircuitStore((state) => state.results);

  const metrics = useMemo(
    () => ({
      A: calculateMetrics(circuits.A),
      B: calculateMetrics(circuits.B),
    }),
    [circuits]
  );

  const measuredStates = useMemo(
    () => ({
      A: Object.keys(results.A?.counts ?? {}).length,
      B: Object.keys(results.B?.counts ?? {}).length,
    }),
    [results.A?.counts, results.B?.counts]
  );

  const rows = useMemo<CompareRow[]>(() => {
    const statevectorA = results.A?.statevector?.length ?? 0;
    const statevectorB = results.B?.statevector?.length ?? 0;

    return [
      {
        label: "Efficiency Score",
        description: "Weighted score: depth x 0.6 + gate count x 0.4",
        a: metrics.A.efficiencyScore,
        b: metrics.B.efficiencyScore,
        lowerIsBetter: true,
        explanation: buildExplanation("Efficiency Score", metrics.A.efficiencyScore, metrics.B.efficiencyScore, true),
        differenceLabel: getDifferenceLabel(metrics.A.efficiencyScore, metrics.B.efficiencyScore),
      },
      {
        label: "Gate Count",
        description: "Total number of quantum operations applied",
        a: metrics.A.gateCount,
        b: metrics.B.gateCount,
        lowerIsBetter: true,
        explanation: buildExplanation("Gate Count", metrics.A.gateCount, metrics.B.gateCount, true),
        differenceLabel: getDifferenceLabel(metrics.A.gateCount, metrics.B.gateCount),
      },
      {
        label: "Circuit Depth",
        description: "Maximum critical path length",
        a: metrics.A.depth,
        b: metrics.B.depth,
        lowerIsBetter: true,
        explanation: buildExplanation("Circuit Depth", metrics.A.depth, metrics.B.depth, true),
        differenceLabel: getDifferenceLabel(metrics.A.depth, metrics.B.depth),
      },
      {
        label: "Two-Qubit Layer Depth",
        description: "Deepest layer touched by any two-qubit gate",
        a: metrics.A.twoQubitLayerDepth,
        b: metrics.B.twoQubitLayerDepth,
        lowerIsBetter: false,
        explanation: buildExplanation("Two-Qubit Layer Depth", metrics.A.twoQubitLayerDepth, metrics.B.twoQubitLayerDepth, false),
        differenceLabel: getDifferenceLabel(metrics.A.twoQubitLayerDepth, metrics.B.twoQubitLayerDepth),
      },
      {
        label: "Measured States",
        description: "Distinct outcomes in the basis-state distribution",
        a: measuredStates.A,
        b: measuredStates.B,
        lowerIsBetter: false,
        explanation: buildExplanation("Measured States", measuredStates.A, measuredStates.B, false),
        differenceLabel: getDifferenceLabel(measuredStates.A, measuredStates.B),
      },
      {
        label: "Statevector Length",
        description: "Size of the returned unmeasured amplitude register",
        a: statevectorA,
        b: statevectorB,
        lowerIsBetter: false,
        explanation: buildExplanation("Statevector Length", statevectorA, statevectorB, false),
        differenceLabel: getDifferenceLabel(statevectorA, statevectorB),
      },
    ];
  }, [measuredStates.A, measuredStates.B, metrics.A.depth, metrics.A.efficiencyScore, metrics.A.gateCount, metrics.A.twoQubitLayerDepth, metrics.B.depth, metrics.B.efficiencyScore, metrics.B.gateCount, metrics.B.twoQubitLayerDepth, results.A?.statevector?.length, results.B?.statevector?.length]);

  const comparison = useMemo(() => {
    const efficiencyWinner = getWinner(metrics.A.efficiencyScore, metrics.B.efficiencyScore, true);
    const depthWinner = getWinner(metrics.A.depth, metrics.B.depth, true);
    const gateWinner = getWinner(metrics.A.gateCount, metrics.B.gateCount, true);
    const twoQubitWinner = getWinner(metrics.A.twoQubitLayerDepth, metrics.B.twoQubitLayerDepth, false);
    const statesDifferent = measuredStates.A !== measuredStates.B;
    const insights: string[] = [];

    if (efficiencyWinner === "A") {
      insights.push(`Circuit A is ${efficiencyImprovementPercent(metrics.B.efficiencyScore, metrics.A.efficiencyScore)}% more efficient.`);
    } else if (efficiencyWinner === "B") {
      insights.push(`Circuit B is ${efficiencyImprovementPercent(metrics.A.efficiencyScore, metrics.B.efficiencyScore)}% more efficient.`);
    }

    if (depthWinner === "A") {
      insights.push("Circuit A is faster due to lower depth.");
    } else if (depthWinner === "B") {
      insights.push("Circuit B is faster due to lower depth.");
    }

    if (gateWinner === "A") {
      insights.push("Circuit A uses fewer gates.");
    } else if (gateWinner === "B") {
      insights.push("Circuit B uses fewer gates.");
    }

    if (statesDifferent) {
      insights.push("Circuits produce different output distributions.");
    }

    if (twoQubitWinner === "A") {
      insights.push("Circuit A carries two-qubit interactions deeper into the circuit.");
    } else if (twoQubitWinner === "B") {
      insights.push("Circuit B carries two-qubit interactions deeper into the circuit.");
    }

    if (insights.length === 0) {
      insights.push("Both circuits are evenly matched across the current structural metrics.");
    }

    let winner: "A" | "B" | "tie" = "tie";
    let summary = "Both circuits are similarly efficient overall.";

    if (efficiencyWinner !== "tie") {
      winner = efficiencyWinner;
      summary = `Circuit ${winner} is more efficient overall on the weighted depth and gate-count score.`;
    } else if (depthWinner !== "tie") {
      winner = depthWinner;
      summary = `Circuit ${winner} has the edge overall because depth most directly affects execution time.`;
    } else if (gateWinner !== "tie") {
      winner = gateWinner;
      summary = `Circuit ${winner} is more efficient overall due to reduced gate count.`;
    }

    return { insights, winner, summary };
  }, [measuredStates.A, measuredStates.B, metrics.A.depth, metrics.A.efficiencyScore, metrics.A.gateCount, metrics.A.twoQubitLayerDepth, metrics.B.depth, metrics.B.efficiencyScore, metrics.B.gateCount, metrics.B.twoQubitLayerDepth]);

  return (
    <section style={{ background: "rgba(6,13,26,0.85)", border: "1px solid rgba(255,255,255,0.07)", borderRadius: 24, padding: 20, boxShadow: "0 0 0 1px rgba(0,212,255,0.04), 0 16px 48px rgba(0,0,0,0.6)", backdropFilter: "blur(12px)" }}>
      <div style={{ display: "flex", flexWrap: "wrap", alignItems: "flex-start", justifyContent: "space-between", gap: 16, marginBottom: 20 }}>
        <div>
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 5 }}>
            <div style={{ width: 3, height: 14, borderRadius: 2, background: "linear-gradient(180deg, #00d4ff, #a259ff)", boxShadow: "0 0 8px rgba(0,212,255,0.5)" }} />
            <h2 style={{ fontFamily: "Syne, sans-serif", fontWeight: 700, fontSize: 16, color: "#c8dff2", letterSpacing: "-0.01em" }}>Comparison Metrics</h2>
          </div>
          <p style={{ fontFamily: "JetBrains Mono, monospace", fontSize: 10, color: "rgba(40,64,90,0.9)", letterSpacing: "0.04em" }}>
            Side-by-side circuit complexity and output analysis
          </p>
        </div>

        <div style={{ display: "grid", gap: 10, minWidth: 280, maxWidth: 460 }}>
          <div style={{ background: "rgba(2,6,15,0.7)", border: "1px solid rgba(255,255,255,0.07)", borderRadius: 14, padding: "10px 16px" }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10, marginBottom: 6 }}>
              <div style={{ fontFamily: "JetBrains Mono, monospace", fontSize: 9, color: "rgba(40,64,90,0.8)", letterSpacing: "0.1em", textTransform: "uppercase" }}>
                Winner
              </div>
              <div
                style={{
                  fontFamily: "JetBrains Mono, monospace",
                  fontSize: 10,
                  color: comparison.winner === "A" ? "#00d4ff" : comparison.winner === "B" ? "#a259ff" : "#c8dff2",
                  border: "1px solid rgba(255,255,255,0.08)",
                  borderRadius: 999,
                  padding: "4px 10px",
                  background: comparison.winner === "A"
                    ? "rgba(0,212,255,0.08)"
                    : comparison.winner === "B"
                      ? "rgba(162,89,255,0.1)"
                      : "rgba(255,255,255,0.03)",
                }}
              >
                {comparison.winner === "tie" ? "Tie" : `Circuit ${comparison.winner}`}
              </div>
            </div>
            <div style={{ fontFamily: "Syne, sans-serif", fontWeight: 700, fontSize: 13, color: "#c8dff2", lineHeight: 1.45 }}>
              {comparison.summary}
            </div>
          </div>

          <div style={{ background: "rgba(2,6,15,0.7)", border: "1px solid rgba(255,255,255,0.07)", borderRadius: 14, padding: "10px 16px" }}>
            <div style={{ fontFamily: "JetBrains Mono, monospace", fontSize: 9, color: "rgba(40,64,90,0.8)", letterSpacing: "0.1em", textTransform: "uppercase", marginBottom: 8 }}>
              Insights
            </div>
            <ul style={{ margin: 0, paddingLeft: 18, display: "grid", gap: 6 }}>
              {comparison.insights.map((insight) => (
                <li key={insight} style={{ fontFamily: "JetBrains Mono, monospace", fontSize: 10, color: "rgba(200,223,242,0.7)", lineHeight: 1.5 }}>
                  {insight}
                </li>
              ))}
            </ul>
          </div>
        </div>
      </div>

      <div style={{ height: 1, marginBottom: 16, background: "linear-gradient(90deg, rgba(0,212,255,0.2) 0%, rgba(162,89,255,0.15) 50%, transparent 100%)" }} />

      <div style={{ overflow: "hidden", borderRadius: 16, border: "1px solid rgba(255,255,255,0.07)" }}>
        <table style={{ width: "100%", borderCollapse: "collapse" }}>
          <thead>
            <tr style={{ background: "linear-gradient(90deg, rgba(0,212,255,0.06) 0%, rgba(162,89,255,0.04) 100%)" }}>
              <th style={{ padding: "12px 18px", textAlign: "left", fontFamily: "JetBrains Mono, monospace", fontSize: 9, fontWeight: 500, letterSpacing: "0.12em", textTransform: "uppercase", color: "rgba(40,64,90,0.9)", width: "36%", borderBottom: "1px solid rgba(255,255,255,0.06)" }}>Metric</th>
              <th style={{ padding: "12px 18px", textAlign: "left", fontFamily: "JetBrains Mono, monospace", fontSize: 9, fontWeight: 500, letterSpacing: "0.12em", textTransform: "uppercase", color: "#00d4ff", width: "18%", borderBottom: "1px solid rgba(255,255,255,0.06)" }}>Algorithm A</th>
              <th style={{ padding: "12px 18px", textAlign: "left", fontFamily: "JetBrains Mono, monospace", fontSize: 9, fontWeight: 500, letterSpacing: "0.12em", textTransform: "uppercase", color: "#a259ff", width: "18%", borderBottom: "1px solid rgba(255,255,255,0.06)" }}>Algorithm B</th>
              <th style={{ padding: "12px 18px", textAlign: "left", fontFamily: "JetBrains Mono, monospace", fontSize: 9, fontWeight: 500, letterSpacing: "0.12em", textTransform: "uppercase", color: "rgba(200,223,242,0.55)", width: "28%", borderBottom: "1px solid rgba(255,255,255,0.06)" }}>Insight</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row, index) => {
              const winner = getWinner(row.a, row.b, row.lowerIsBetter);
              return (
                <tr key={row.label} style={{ borderTop: index === 0 ? "none" : "1px solid rgba(255,255,255,0.05)", background: index % 2 === 0 ? "rgba(2,6,15,0.3)" : "transparent" }}>
                  <td style={{ padding: "14px 18px" }}>
                    <div style={{ fontFamily: "Syne, sans-serif", fontWeight: 600, fontSize: 13, color: "#c8dff2", marginBottom: 2 }}>{row.label}</div>
                    <div style={{ fontFamily: "JetBrains Mono, monospace", fontSize: 9, color: "rgba(40,64,90,0.8)", letterSpacing: "0.03em", lineHeight: 1.4 }}>{row.description}</div>
                  </td>
                  <td style={{ padding: "14px 18px" }}>
                    <div style={{ fontFamily: "JetBrains Mono, monospace", fontWeight: winner === "A" ? 600 : 400, fontSize: 14, color: winner === "A" ? "#00d4ff" : "rgba(200,223,242,0.6)", textShadow: winner === "A" ? "0 0 12px rgba(0,212,255,0.4)" : "none" }}>{row.a}</div>
                    <div style={{ fontFamily: "JetBrains Mono, monospace", fontSize: 9, color: "rgba(40,64,90,0.8)", marginTop: 5 }}>vs B: {getDifferenceLabel(row.b, row.a)}</div>
                  </td>
                  <td style={{ padding: "14px 18px" }}>
                    <div style={{ fontFamily: "JetBrains Mono, monospace", fontWeight: winner === "B" ? 600 : 400, fontSize: 14, color: winner === "B" ? "#a259ff" : "rgba(200,223,242,0.6)", textShadow: winner === "B" ? "0 0 12px rgba(162,89,255,0.4)" : "none" }}>{row.b}</div>
                    <div style={{ fontFamily: "JetBrains Mono, monospace", fontSize: 9, color: "rgba(40,64,90,0.8)", marginTop: 5 }}>vs A: {row.differenceLabel}</div>
                  </td>
                  <td style={{ padding: "14px 18px" }}>
                    <div style={{ fontFamily: "JetBrains Mono, monospace", fontSize: 10, color: winner === "A" ? "rgba(0,212,255,0.68)" : winner === "B" ? "rgba(162,89,255,0.68)" : "rgba(200,223,242,0.45)", lineHeight: 1.55 }}>
                      {row.explanation}
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </section>
  );
}

export default memo(ComparisonTableComponent);
