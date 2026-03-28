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

function buildExplanation(label: string, a: number, b: number, lowerIsBetter: boolean) {
  const winner = getWinner(a, b, lowerIsBetter);
  if (winner === "tie") return `Both circuits are identical for ${label.toLowerCase()}.`;

  if (label === "Gate Count") {
    const better = winner === "A" ? "A" : "B";
    const worse = winner === "A" ? b : a;
    const betterValue = winner === "A" ? a : b;
    return `Circuit ${better} uses ${percentDiff(worse, betterValue)}% fewer gates.`;
  }

  if (label === "Circuit Depth") {
    if (winner === "A") return `Circuit A is shallower, so it should have lower execution latency.`;
    return `Circuit A is deeper, so Circuit B should execute with lower latency.`;
  }

  if (label === "Measured States") {
    const better = winner === "A" ? "A" : "B";
    return `Circuit ${better} explores a broader output distribution.`;
  }

  if (label === "Statevector Length") {
    return `Both circuits occupy ${Math.max(a, b)} amplitude slots, reflecting the simulated state space size.`;
  }

  return `Circuit ${winner} performs better on ${label.toLowerCase()}.`;
}

function ComparisonTableComponent() {
  const circuits = useCircuitStore((state) => state.circuits);
  const results = useCircuitStore((state) => state.results);

  const metrics = useMemo(() => ({
    A: calculateMetrics(circuits.A),
    B: calculateMetrics(circuits.B)
  }), [circuits]);

  const rows = useMemo<CompareRow[]>(() => {
    const measuredA = Object.keys(results.A?.counts ?? {}).length;
    const measuredB = Object.keys(results.B?.counts ?? {}).length;
    const statevectorA = results.A?.statevector?.length ?? 0;
    const statevectorB = results.B?.statevector?.length ?? 0;

    return [
      {
        label: "Gate Count",
        description: "Total number of quantum operations applied",
        a: metrics.A.gateCount,
        b: metrics.B.gateCount,
        lowerIsBetter: true,
        explanation: buildExplanation("Gate Count", metrics.A.gateCount, metrics.B.gateCount, true),
        differenceLabel: getDifferenceLabel(metrics.A.gateCount, metrics.B.gateCount)
      },
      {
        label: "Circuit Depth",
        description: "Maximum critical path length",
        a: metrics.A.depth,
        b: metrics.B.depth,
        lowerIsBetter: true,
        explanation: buildExplanation("Circuit Depth", metrics.A.depth, metrics.B.depth, true),
        differenceLabel: getDifferenceLabel(metrics.A.depth, metrics.B.depth)
      },
      {
        label: "Measured States",
        description: "Distinct outcomes in the basis-state distribution",
        a: measuredA,
        b: measuredB,
        lowerIsBetter: false,
        explanation: buildExplanation("Measured States", measuredA, measuredB, false),
        differenceLabel: getDifferenceLabel(measuredA, measuredB)
      },
      {
        label: "Statevector Length",
        description: "Size of the returned amplitude register",
        a: statevectorA,
        b: statevectorB,
        lowerIsBetter: false,
        explanation: buildExplanation("Statevector Length", statevectorA, statevectorB, false),
        differenceLabel: getDifferenceLabel(statevectorA, statevectorB)
      }
    ];
  }, [metrics, results.A?.counts, results.A?.statevector?.length, results.B?.counts, results.B?.statevector?.length]);

  const overallSummary = useMemo(() => {
    const gateWinner = getWinner(metrics.A.gateCount, metrics.B.gateCount, true);
    const depthWinner = getWinner(metrics.A.depth, metrics.B.depth, true);
    const stateWinner = getWinner(Object.keys(results.A?.counts ?? {}).length, Object.keys(results.B?.counts ?? {}).length, false);

    if (gateWinner === "tie" && depthWinner === "tie") {
      return "Both circuits are similarly efficient, so the choice depends on which output distribution you prefer.";
    }

    if (gateWinner === depthWinner && gateWinner !== "tie") {
      return `Circuit ${gateWinner} is more efficient due to lower depth and gate count.`;
    }

    if (stateWinner !== "tie" && stateWinner !== gateWinner) {
      return `Circuit ${gateWinner === "tie" ? depthWinner : gateWinner} is computationally leaner, while Circuit ${stateWinner} produces the broader output distribution.`;
    }

    return `Circuit ${depthWinner === "tie" ? gateWinner : depthWinner} currently has the stronger efficiency profile.`;
  }, [metrics.A.depth, metrics.A.gateCount, metrics.B.depth, metrics.B.gateCount, results.A?.counts, results.B?.counts]);

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

        <div style={{ maxWidth: 420, background: "rgba(2,6,15,0.7)", border: "1px solid rgba(255,255,255,0.07)", borderRadius: 14, padding: "10px 16px" }}>
          <div style={{ fontFamily: "JetBrains Mono, monospace", fontSize: 9, color: "rgba(40,64,90,0.8)", letterSpacing: "0.1em", textTransform: "uppercase", marginBottom: 6 }}>
            Overall Summary
          </div>
          <div style={{ fontFamily: "Syne, sans-serif", fontWeight: 700, fontSize: 13, color: "#c8dff2", lineHeight: 1.45 }}>
            {overallSummary}
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
                    <div style={{ fontFamily: "JetBrains Mono, monospace", fontSize: 9, color: "rgba(40,64,90,0.8)", marginTop: 5 }}>? {getDifferenceLabel(row.b, row.a)}</div>
                  </td>
                  <td style={{ padding: "14px 18px" }}>
                    <div style={{ fontFamily: "JetBrains Mono, monospace", fontWeight: winner === "B" ? 600 : 400, fontSize: 14, color: winner === "B" ? "#a259ff" : "rgba(200,223,242,0.6)", textShadow: winner === "B" ? "0 0 12px rgba(162,89,255,0.4)" : "none" }}>{row.b}</div>
                    <div style={{ fontFamily: "JetBrains Mono, monospace", fontSize: 9, color: "rgba(40,64,90,0.8)", marginTop: 5 }}>? {row.differenceLabel}</div>
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

