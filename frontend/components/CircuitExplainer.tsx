"use client";

import { useMemo, useState } from "react";
import type {
  CircuitComparison,
  CircuitExplanation,
  GateExplanation,
  OptimizationSuggestion,
  VariationalRunResponse,
} from "@/lib/types";
import { useCircuitStore } from "@/store/useCircuitStore";

// ─── Design tokens ────────────────────────────────────────────────────────────
const T = {
  bg:          "var(--panel)",
  surface:     "var(--card)",
  border:      "var(--border)",
  text:        "var(--foreground)",
  muted:       "var(--muted)",
  accent:      "var(--accent)",
  fontMono:    "JetBrains Mono, monospace",
  fontDisplay: "Syne, sans-serif",
  indigo:      "var(--accent)",
  sky:         "var(--accent-secondary)",
  emerald:     "var(--success)",
  violet:      "var(--accent-secondary)",
  amber:       "var(--warning)",
};

type ExplainerTab = "summary" | "gates" | "optimization" | "comparison";

interface CircuitExplainerProps {
  collapsed: boolean;
  onToggleCollapsed: () => void;
  highlightedGateIndex?: number | null;
  onSelectGateExplanation?: (gateIndex: number | null) => void;
}

// ─── Shared components ─────────────────────────────────────────────────────────
function EmptyState({ message }: { message: string }) {
  return (
    <div style={{
      border: "1px dashed var(--border)", borderRadius: 14, background: "var(--row-alt)",
      padding: "20px 18px", fontFamily: T.fontMono, fontSize: 11,
      color: "var(--muted)", lineHeight: 1.7, textAlign: "center",
    }}>
      {message}
    </div>
  );
}

function SectionLabel({ children, color = "var(--muted)" }: { children: React.ReactNode; color?: string }) {
  return (
    <div style={{
      fontFamily: T.fontMono, fontSize: 9, fontWeight: 800,
      color, textTransform: "uppercase" as const, letterSpacing: "0.2em", marginBottom: 6,
    }}>
      {children}
    </div>
  );
}

function InfoCard({ title, body, accent = T.indigo }: { title: string; body: string; accent?: string }) {
  return (
    <article style={{
      borderRadius: 14,
      border: "1px solid var(--border)",
      background: "var(--card)",
      padding: "14px 16px",
      borderLeft: `4px solid ${accent}`,
      boxShadow: "var(--shadow-card)",
    }}>
      <SectionLabel color={accent}>{title}</SectionLabel>
      <p style={{ fontFamily: T.fontDisplay, fontSize: 13, lineHeight: 1.75, color: "var(--foreground)", margin: 0 }}>{body}</p>
    </article>
  );
}

// ─── Summary tab ───────────────────────────────────────────────────────────────
function SummaryTab({ explanation }: { explanation: CircuitExplanation }) {
  return (
    <div style={{ display: "grid", gap: 10 }}>
      <InfoCard title="Circuit Summary"     body={explanation.circuit_summary}    accent={T.indigo} />
      <InfoCard title="Measurement Insight" body={explanation.measurement_insight} accent={T.sky}   />
    </div>
  );
}

// ─── Gate explanation accordion ────────────────────────────────────────────────
function GateExplanationItem({
  gate, gateIndex, highlighted, onSelect,
}: {
  gate: GateExplanation; gateIndex: number; highlighted: boolean;
  onSelect?: (idx: number | null) => void;
}) {
  const [open, setOpen] = useState(false);
  const label = `${gate.gate}${gate.control !== undefined ? ` ctrl:q${gate.control}` : ""}${gate.target !== undefined ? ` → q${gate.target}` : ""}`;

  const handleToggle = () => {
    const next = !open;
    setOpen(next);
    onSelect?.(next ? gateIndex : null);
  };

  return (
    <article style={{
      overflow: "hidden", borderRadius: 12,
      border: highlighted ? `1px solid ${T.accent}` : "1px solid var(--border)",
      background: highlighted ? "var(--hover)" : "var(--card)",
      transition: "all 0.2s ease",
      boxShadow: highlighted ? "var(--glow-cyan)" : "var(--shadow-card)",
    }}>
      <button type="button" onClick={handleToggle} style={{
        display: "flex", width: "100%", alignItems: "center",
        justifyContent: "space-between", gap: 12, padding: "12px 16px",
        background: "transparent", border: "none", cursor: "pointer", textAlign: "left" as const,
      }}>
        <div style={{ minWidth: 0 }}>
          <div style={{ fontFamily: T.fontMono, fontSize: 9, color: T.accent, letterSpacing: "0.15em", textTransform: "uppercase" as const, fontWeight: 700 }}>Gate {gateIndex+1}</div>
          <div style={{ fontFamily: T.fontMono, fontSize: 12, fontWeight: 800, color: "var(--foreground)", marginTop: 4 }}>{label}</div>
          <div style={{ fontFamily: T.fontDisplay, fontSize: 11, color: "var(--muted)", marginTop: 3 }}>{gate.effect}</div>
        </div>
        <span style={{
          flexShrink: 0, borderRadius: 8, border: "1px solid var(--border)",
          background: open ? "var(--hover)" : "var(--panel-secondary)", padding: "4px 12px",
          fontFamily: T.fontMono, fontSize: 9, fontWeight: 800,
          color: open ? T.accent : "var(--muted)", textTransform: "uppercase" as const, letterSpacing: "0.08em",
          transition: "all 0.15s ease",
        }}>
          {open ? "Hide" : "Details"}
        </span>
      </button>

      <div style={{ display: "grid", gridTemplateRows: open ? "1fr" : "0fr", transition: "grid-template-rows 0.22s cubic-bezier(0.4, 0, 0.2, 1)" }}>
        <div style={{ overflow: "hidden" }}>
          <div style={{ display: "grid", gap: 10, borderTop: "1px solid var(--border)", background: "var(--panel-secondary)", padding: "14px 16px" }}>
            {([
              { label: "State Before", content: gate.before_state, mono: true,  color: T.indigo  },
              { label: "State After",  content: gate.after_state,  mono: true,  color: T.emerald },
              { label: "Technical",    content: gate.technical,    mono: false, color: T.violet  },
              { label: "Interpretation", content: gate.intuitive,    mono: false, color: T.sky     },
            ] as const).map(({ label, content, mono, color }) => (
              <div key={label} style={{ borderRadius: 10, border: "1px solid var(--border)", background: "var(--card)", padding: "12px 14px", boxShadow: "inset 0 1px 0 rgba(255,255,255,0.02)" }}>
                <SectionLabel color={color}>{label}</SectionLabel>
                <div style={{
                  fontFamily: mono ? T.fontMono : T.fontDisplay,
                  fontSize: mono ? 11 : 12, lineHeight: 1.7,
                  color: mono ? color : "var(--foreground)", wordBreak: "break-all" as const,
                }}>{content}</div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </article>
  );
}

function GatesTab({ gateExplanations, highlightedGateIndex, onSelectGateExplanation }: {
  gateExplanations: GateExplanation[];
  highlightedGateIndex?: number | null;
  onSelectGateExplanation?: (idx: number | null) => void;
}) {
  if (!gateExplanations.length) return <EmptyState message="Run a circuit to inspect gate-by-gate state evolution." />;
  return (
    <div style={{ display: "grid", gap: 8 }}>
      {gateExplanations.map((gate, index) => (
        <GateExplanationItem key={`${gate.gate}-${index}`} gate={gate} gateIndex={index}
          highlighted={highlightedGateIndex === index} onSelect={onSelectGateExplanation} />
      ))}
    </div>
  );
}

// ─── Optimization tab ──────────────────────────────────────────────────────────
function OptimizationTab({ suggestions }: { suggestions: OptimizationSuggestion[] }) {
  if (!suggestions.length) return <EmptyState message="No optimization opportunities detected for the latest simulation." />;
  return (
    <div style={{ display: "grid", gap: 8 }}>
      {suggestions.map((s, index) => (
        <article key={`${s.issue}-${index}`} style={{
          borderRadius: 14, border: "1px solid var(--border)",
          background: "var(--card)", padding: "14px 16px", borderLeft: `4px solid var(--warning)`,
          boxShadow: "var(--shadow-card)",
        }}>
          <div style={{ fontFamily: T.fontMono, fontSize: 11, fontWeight: 700, color: "var(--warning)", marginBottom: 4 }}>{s.issue}</div>
          <div style={{ fontFamily: T.fontMono, fontSize: 9, color: "var(--muted)", letterSpacing: "0.12em", textTransform: "uppercase" as const, marginBottom: 8 }}>{s.location}</div>
          <p style={{ fontFamily: T.fontDisplay, fontSize: 12, lineHeight: 1.7, color: "var(--foreground)", margin: 0 }}>{s.fix}</p>
        </article>
      ))}
    </div>
  );
}

function formatVariationalTheta(theta: number) {
  return theta.toFixed(4).replace(/0+$/, "").replace(/\.$/, "");
}

function VariationalSummary({ variational }: { variational: VariationalRunResponse }) {
  return (
    <article style={{
      borderRadius: 14, border: "1px solid var(--border)",
      background: "var(--card)", padding: "14px 16px", borderLeft: `4px solid var(--success)`,
      boxShadow: "var(--shadow-card)",
    }}>
      <SectionLabel color="var(--success)">Variational Sweep</SectionLabel>
      <div style={{ display: "grid", gap: 8 }}>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(3, minmax(0, 1fr))", gap: 8 }}>
          <div style={{ borderRadius: 10, border: "1px solid var(--border)", background: "var(--panel-secondary)", padding: "8px 10px" }}>
            <div style={{ fontFamily: T.fontMono, fontSize: 9, color: "var(--muted)", textTransform: "uppercase" as const, letterSpacing: "0.12em" }}>Best Theta</div>
            <div style={{ fontFamily: T.fontMono, fontSize: 14, fontWeight: 700, color: "var(--success)", marginTop: 4 }}>{formatVariationalTheta(variational.best.theta)}</div>
          </div>
          <div style={{ borderRadius: 10, border: "1px solid var(--border)", background: "var(--panel-secondary)", padding: "8px 10px" }}>
            <div style={{ fontFamily: T.fontMono, fontSize: 9, color: "var(--muted)", textTransform: "uppercase" as const, letterSpacing: "0.12em" }}>Best Cost</div>
            <div style={{ fontFamily: T.fontMono, fontSize: 14, fontWeight: 700, color: "var(--accent)", marginTop: 4 }}>{variational.best.cost.toFixed(4)}</div>
          </div>
          <div style={{ borderRadius: 10, border: "1px solid var(--border)", background: "var(--panel-secondary)", padding: "8px 10px" }}>
            <div style={{ fontFamily: T.fontMono, fontSize: 9, color: "var(--muted)", textTransform: "uppercase" as const, letterSpacing: "0.12em" }}>Iterations</div>
            <div style={{ fontFamily: T.fontMono, fontSize: 14, fontWeight: 700, color: "var(--accent-secondary)", marginTop: 4 }}>{variational.history.length}</div>
          </div>
        </div>
        <div style={{ borderRadius: 10, border: "1px solid var(--border)", background: "var(--panel-secondary)", padding: "10px 12px" }}>
          <SectionLabel color="var(--accent-secondary)">Sweep History</SectionLabel>
          <div style={{ display: "grid", gap: 6 }}>
            {variational.history.map((entry, index) => {
              const active = entry.theta === variational.best.theta && entry.cost === variational.best.cost;
              return (
                <div key={`${entry.theta}-${index}`} style={{
                  display: "grid",
                  gridTemplateColumns: "40px 1fr 1fr",
                  gap: 8,
                  alignItems: "center",
                  borderRadius: 7,
                  padding: "6px 8px",
                  background: active ? "var(--hover)" : "var(--card)",
                  border: `1px solid ${active ? "var(--border-primary)" : "var(--border)"}`,
                }}>
                  <span style={{ fontFamily: T.fontMono, fontSize: 10, color: active ? "var(--success)" : "var(--muted)" }}>#{index + 1}</span>
                  <span style={{ fontFamily: T.fontMono, fontSize: 11, color: "var(--foreground)" }}>theta={formatVariationalTheta(entry.theta)}</span>
                  <span style={{ fontFamily: T.fontMono, fontSize: 11, color: "var(--foreground)", textAlign: "right" as const }}>cost={entry.cost.toFixed(4)}</span>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </article>
  );
}

// ─── Comparison tab ────────────────────────────────────────────────────────────
function MetricRow({ label, value, accent }: { label: string; value: string; accent?: boolean }) {
  return (
    <div style={{
      display: "flex", alignItems: "center", justifyContent: "space-between",
      borderRadius: 10, border: "1px solid var(--border)", background: "var(--card)", padding: "7px 12px",
    }}>
      <span style={{ fontFamily: T.fontDisplay, fontSize: 12, color: "var(--muted)" }}>{label}</span>
      <span style={{ fontFamily: T.fontMono, fontSize: 12, fontWeight: 700, color: accent ? "var(--accent)" : "var(--foreground)" }}>{value}</span>
    </div>
  );
}

function formatMetricValue(v: string | number) {
  if (typeof v !== "number") return v;
  return Number.isInteger(v) ? String(v) : v.toFixed(4).replace(/0+$/, "").replace(/\.$/, "");
}

function ComparisonTab({ comparison }: { comparison: CircuitComparison | null | undefined }) {
  if (!comparison) return <EmptyState message="Run A vs B to display backend comparison insights." />;
  const rows = [
    { label: "Winner",       value: `Circuit ${comparison.winner}`,                         accent: true  },
    { label: "A depth",      value: String(formatMetricValue(comparison.metrics.A.depth)),   accent: false },
    { label: "B depth",      value: String(formatMetricValue(comparison.metrics.B.depth)),   accent: false },
    { label: "A gate count", value: String(formatMetricValue(comparison.metrics.A.gate_count)), accent: false },
    { label: "B gate count", value: String(formatMetricValue(comparison.metrics.B.gate_count)), accent: false },
    { label: "Similarity",   value: String(formatMetricValue(comparison.metrics.output_similarity)), accent: false },
    { label: "Score gap",    value: String(formatMetricValue(comparison.metrics.score_gap)), accent: false },
  ];
  return (
    <div style={{ display: "grid", gap: 10 }}>
      <InfoCard title="Comparison Reasoning" body={comparison.reasoning} accent={T.emerald} />
      <article style={{ borderRadius: 14, border: "1px solid var(--border)", background: "var(--card)", padding: "12px 14px", boxShadow: "var(--shadow-card)" }}>
        <SectionLabel color="var(--accent)">Key Metrics</SectionLabel>
        <div style={{ display: "grid", gap: 6 }}>
          {rows.map((r) => <MetricRow key={r.label} label={r.label} value={r.value} accent={r.accent} />)}
        </div>
      </article>
    </div>
  );
}

// ─── Main export ───────────────────────────────────────────────────────────────
export function CircuitExplainer({
  collapsed, onToggleCollapsed,
  highlightedGateIndex = null, onSelectGateExplanation,
}: CircuitExplainerProps) {
  const activeCircuit = useCircuitStore((s) => s.activeCircuit);
  const result        = useCircuitStore((s) => s.results[s.activeCircuit]);
  const explanation   = result?.explanation;
  const comparison    = result?.comparison;
  const suggestions   = result?.suggestions ?? [];
  const variational   = result?.variational;

  const tabs = useMemo<ExplainerTab[]>(
    () => (comparison ? ["summary", "gates", "optimization", "comparison"] : ["summary", "gates", "optimization"]),
    [comparison],
  );
  const [activeTab, setActiveTab] = useState<ExplainerTab>("summary");
  const resolvedTab = tabs.includes(activeTab) ? activeTab : tabs[0];

  const tabConfig: Record<ExplainerTab, { label: string; color: string; bg: string }> = {
    summary:      { label: "Summary",  color: "var(--accent)",           bg: "var(--hover)"  },
    gates:        { label: "Gates",    color: "var(--accent-secondary)", bg: "rgba(139,92,246,0.14)"  },
    optimization: { label: "Optimize", color: "var(--warning)",          bg: "rgba(245,158,11,0.12)"   },
    comparison:   { label: "A vs B",   color: "var(--success)",          bg: "rgba(52,211,153,0.12)" },
  };

  return (
    <aside style={{
      borderRadius: 16,
      border: "1px solid var(--border)",
      background: "var(--panel)",
      overflow: "hidden",
      boxShadow: "var(--shadow-panel)",
      backdropFilter: "blur(20px)",
    }}>
      {/* Header */}
      <div style={{
        display: "flex", alignItems: "center", justifyContent: "space-between",
        gap: 12, borderBottom: "1px solid var(--border)", padding: "14px 18px",
        background: "rgba(15, 23, 42, 0.4)",
      }}>
        <div>
          <div style={{ fontFamily: T.fontMono, fontSize: 9, fontWeight: 700, color: "var(--accent)", textTransform: "uppercase" as const, letterSpacing: "0.2em" }}>
            Insight Engine
          </div>
          <div style={{ marginTop: 3, fontFamily: T.fontDisplay, fontSize: 13, fontWeight: 700, color: "var(--foreground)" }}>
            Circuit {activeCircuit} analysis
          </div>
        </div>
        <button type="button" onClick={onToggleCollapsed} className="quantum-button" style={{
          borderRadius: 8, border: "1px solid var(--border)", background: "var(--card)",
          color: "var(--accent)", padding: "5px 14px", fontFamily: T.fontMono,
          fontSize: 9, fontWeight: 700, cursor: "pointer", letterSpacing: "0.1em", textTransform: "uppercase" as const,
        }}>
          {collapsed ? "Expand" : "Collapse"}
        </button>
      </div>

      {!collapsed && (
        <div style={{ padding: 16, display: "grid", gap: 14 }}>
          {/* Tabs */}
          <div style={{ display: "flex", gap: 6, flexWrap: "wrap" as const, padding: 3, background: "var(--row-alt)", borderRadius: 12, border: "1px solid var(--border)" }}>
            {tabs.map((tab) => {
              const cfg = tabConfig[tab];
              const active = resolvedTab === tab;
              return (
                <button key={tab} type="button" onClick={() => setActiveTab(tab)} style={{
                  flex: 1,
                  borderRadius: 9,
                  border: active ? `1px solid ${cfg.color}55` : "1px solid transparent",
                  background: active ? "var(--card)" : "transparent",
                  color: active ? cfg.color : "var(--muted)",
                  padding: "6px 12px", fontFamily: T.fontMono, fontSize: 9, fontWeight: 700,
                  cursor: "pointer", letterSpacing: "0.08em", textTransform: "uppercase" as const,
                  transition: "all 0.15s ease",
                  boxShadow: active ? "0 2px 8px rgba(0,0,0,0.12)" : "none",
                }}>
                  {cfg.label}
                </button>
              );
            })}
          </div>

          {/* Content */}
          {resolvedTab === "summary" && (
            explanation ? (
              <SummaryTab explanation={explanation} />
            ) : (
              <EmptyState message="No summary payload has arrived yet. Run the active circuit, and if results appear elsewhere but this stays empty, restart the backend so it serves the new explanation fields." />
            )
          )}

          {resolvedTab === "gates" && (
            explanation ? (
              <GatesTab
                gateExplanations={explanation.gate_explanations}
                highlightedGateIndex={highlightedGateIndex}
                onSelectGateExplanation={onSelectGateExplanation}
              />
            ) : (
              <EmptyState message="No gate-level explanation payload has arrived yet. This usually means the backend response does not include the new explanation object." />
            )
          )}

          {resolvedTab === "optimization" && (
            variational || suggestions.length ? (
              <div style={{ display: "grid", gap: 10 }}>
                {variational && <VariationalSummary variational={variational} />}
                <OptimizationTab suggestions={suggestions} />
              </div>
            ) : (
              <EmptyState message="No optimization payload has arrived yet. Run a standard circuit or use Optimize on a variational preset to populate this tab." />
            )
          )}
          {resolvedTab === "comparison" && <ComparisonTab comparison={comparison} />}
        </div>
      )}
    </aside>
  );
}

export default CircuitExplainer;
