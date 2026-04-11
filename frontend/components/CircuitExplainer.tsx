"use client";

import { useMemo, useState } from "react";
import type {
  CircuitComparison,
  CircuitExplanation,
  GateExplanation,
  OptimizationSuggestion,
} from "@/lib/types";
import { useCircuitStore } from "@/store/useCircuitStore";

// ─── Design tokens (light vibrant) ────────────────────────────────────────────
const T = {
  bg:          "#f0f4ff",
  surface:     "#ffffff",
  panel:       "#fafbff",
  border:      "#dde3f5",
  borderMid:   "#c7d2fe",
  text:        "#1e293b",
  textMid:     "#475569",
  textMuted:   "#94a3b8",
  indigo:      "#4f46e5",
  indigoBg:    "#eef2ff",
  violet:      "#7c3aed",
  violetBg:    "#f5f3ff",
  emerald:     "#059669",
  emeraldBg:   "#ecfdf5",
  amber:       "#d97706",
  amberBg:     "#fffbeb",
  rose:        "#e11d48",
  roseBg:      "#fff1f2",
  sky:         "#0284c7",
  skyBg:       "#e0f2fe",
  fontMono:    "JetBrains Mono, ui-monospace, monospace",
  fontDisplay: "Syne, ui-sans-serif, sans-serif",
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
      border: `1.5px dashed ${T.border}`, borderRadius: 10, background: T.panel,
      padding: "16px 14px", fontFamily: T.fontMono, fontSize: 11,
      color: T.textMuted, lineHeight: 1.7,
    }}>
      {message}
    </div>
  );
}

function SectionLabel({ children, color = T.textMuted }: { children: React.ReactNode; color?: string }) {
  return (
    <div style={{
      fontFamily: T.fontMono, fontSize: 9, fontWeight: 700,
      color, textTransform: "uppercase" as const, letterSpacing: "0.18em", marginBottom: 5,
    }}>
      {children}
    </div>
  );
}

function InfoCard({ title, body, accent = T.indigo }: { title: string; body: string; accent?: string }) {
  return (
    <article style={{
      borderRadius: 10, border: `1.5px solid ${T.border}`, background: T.surface,
      padding: "12px 14px", borderLeft: `3px solid ${accent}`,
    }}>
      <SectionLabel color={accent}>{title}</SectionLabel>
      <p style={{ fontFamily: T.fontDisplay, fontSize: 13, lineHeight: 1.75, color: T.text, margin: 0 }}>{body}</p>
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
      overflow: "hidden", borderRadius: 10,
      border: `1.5px solid ${highlighted ? T.indigo : T.border}`,
      background: highlighted ? T.indigoBg : T.surface,
      transition: "border-color 0.2s, background 0.2s",
      boxShadow: highlighted ? "0 0 0 3px rgba(79,70,229,0.12)" : "none",
    }}>
      <button type="button" onClick={handleToggle} style={{
        display: "flex", width: "100%", alignItems: "center",
        justifyContent: "space-between", gap: 12, padding: "10px 14px",
        background: "transparent", border: "none", cursor: "pointer", textAlign: "left" as const,
      }}>
        <div style={{ minWidth: 0 }}>
          <div style={{ fontFamily: T.fontMono, fontSize: 9, color: T.indigo, letterSpacing: "0.15em", textTransform: "uppercase" as const }}>Gate {gateIndex+1}</div>
          <div style={{ fontFamily: T.fontMono, fontSize: 12, fontWeight: 700, color: T.text, marginTop: 3 }}>{label}</div>
          <div style={{ fontFamily: T.fontDisplay, fontSize: 11, color: T.textMid, marginTop: 2 }}>{gate.effect}</div>
        </div>
        <span style={{
          flexShrink: 0, borderRadius: 6, border: `1.5px solid ${open ? T.indigo : T.border}`,
          background: open ? T.indigoBg : T.panel, padding: "3px 10px",
          fontFamily: T.fontMono, fontSize: 9, fontWeight: 700,
          color: open ? T.indigo : T.textMuted, textTransform: "uppercase" as const, letterSpacing: "0.1em",
        }}>
          {open ? "Hide" : "View"}
        </span>
      </button>

      <div style={{ display: "grid", gridTemplateRows: open ? "1fr" : "0fr", transition: "grid-template-rows 0.22s ease" }}>
        <div style={{ overflow: "hidden" }}>
          <div style={{ display: "grid", gap: 8, borderTop: `1.5px solid ${T.border}`, background: T.panel, padding: "12px 14px" }}>
            {([
              { label: "Before",    content: gate.before_state, mono: true,  color: T.indigo  },
              { label: "After",     content: gate.after_state,  mono: true,  color: T.emerald },
              { label: "Technical", content: gate.technical,    mono: false, color: T.violet  },
              { label: "Intuitive", content: gate.intuitive,    mono: false, color: T.sky     },
            ] as const).map(({ label, content, mono, color }) => (
              <div key={label} style={{ borderRadius: 8, border: `1.5px solid ${T.border}`, background: T.surface, padding: "10px 12px" }}>
                <SectionLabel color={color}>{label}</SectionLabel>
                <div style={{
                  fontFamily: mono ? T.fontMono : T.fontDisplay,
                  fontSize: mono ? 11 : 12, lineHeight: 1.7,
                  color: mono ? color : T.text, wordBreak: "break-all" as const,
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
          borderRadius: 10, border: `1.5px solid ${T.border}`,
          background: T.amberBg, padding: "12px 14px", borderLeft: `3px solid ${T.amber}`,
        }}>
          <div style={{ fontFamily: T.fontMono, fontSize: 11, fontWeight: 700, color: T.amber, marginBottom: 4 }}>{s.issue}</div>
          <div style={{ fontFamily: T.fontMono, fontSize: 9, color: T.textMuted, letterSpacing: "0.12em", textTransform: "uppercase" as const, marginBottom: 8 }}>{s.location}</div>
          <p style={{ fontFamily: T.fontDisplay, fontSize: 12, lineHeight: 1.7, color: T.text, margin: 0 }}>{s.fix}</p>
        </article>
      ))}
    </div>
  );
}

// ─── Comparison tab ────────────────────────────────────────────────────────────
function MetricRow({ label, value, accent }: { label: string; value: string; accent?: boolean }) {
  return (
    <div style={{
      display: "flex", alignItems: "center", justifyContent: "space-between",
      borderRadius: 8, border: `1.5px solid ${T.border}`, background: T.surface, padding: "7px 12px",
    }}>
      <span style={{ fontFamily: T.fontDisplay, fontSize: 12, color: T.textMid }}>{label}</span>
      <span style={{ fontFamily: T.fontMono, fontSize: 12, fontWeight: 700, color: accent ? T.indigo : T.text }}>{value}</span>
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
      <article style={{ borderRadius: 10, border: `1.5px solid ${T.border}`, background: T.surface, padding: "12px 14px" }}>
        <SectionLabel color={T.indigo}>Key Metrics</SectionLabel>
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

  const tabs = useMemo<ExplainerTab[]>(
    () => (comparison ? ["summary", "gates", "optimization", "comparison"] : ["summary", "gates", "optimization"]),
    [comparison],
  );
  const [activeTab, setActiveTab] = useState<ExplainerTab>("summary");
  const resolvedTab = tabs.includes(activeTab) ? activeTab : tabs[0];

  const tabConfig: Record<ExplainerTab, { label: string; color: string; bg: string }> = {
    summary:      { label: "Summary",  color: T.indigo,  bg: T.indigoBg  },
    gates:        { label: "Gates",    color: T.violet,  bg: T.violetBg  },
    optimization: { label: "Optimize", color: T.amber,   bg: T.amberBg   },
    comparison:   { label: "A vs B",   color: T.emerald, bg: T.emeraldBg },
  };

  return (
    <aside style={{ borderRadius: 12, border: `1.5px solid ${T.border}`, background: T.surface, overflow: "hidden" }}>
      {/* Header */}
      <div style={{
        display: "flex", alignItems: "center", justifyContent: "space-between",
        gap: 12, borderBottom: `1.5px solid ${T.border}`, padding: "12px 16px",
        background: T.indigoBg,
      }}>
        <div>
          <div style={{ fontFamily: T.fontMono, fontSize: 9, fontWeight: 700, color: T.indigo, textTransform: "uppercase" as const, letterSpacing: "0.18em" }}>
            Insight Engine
          </div>
          <div style={{ marginTop: 2, fontFamily: T.fontDisplay, fontSize: 13, fontWeight: 700, color: T.text }}>
            Circuit {activeCircuit} explainer
          </div>
        </div>
        <button type="button" onClick={onToggleCollapsed} style={{
          borderRadius: 6, border: `1.5px solid ${T.borderMid}`, background: T.surface,
          color: T.indigo, padding: "4px 12px", fontFamily: T.fontMono,
          fontSize: 9, fontWeight: 700, cursor: "pointer", letterSpacing: "0.1em", textTransform: "uppercase" as const,
        }}>
          {collapsed ? "Expand" : "Collapse"}
        </button>
      </div>

      {!collapsed && (
        <div style={{ padding: 14, display: "grid", gap: 12 }}>
          {/* Tabs */}
          <div style={{ display: "flex", gap: 6, flexWrap: "wrap" as const }}>
            {tabs.map((tab) => {
              const cfg = tabConfig[tab];
              const active = resolvedTab === tab;
              return (
                <button key={tab} type="button" onClick={() => setActiveTab(tab)} style={{
                  borderRadius: 7, border: `1.5px solid ${active ? cfg.color : T.border}`,
                  background: active ? cfg.bg : T.panel,
                  color: active ? cfg.color : T.textMid,
                  padding: "5px 13px", fontFamily: T.fontMono, fontSize: 9, fontWeight: 700,
                  cursor: "pointer", letterSpacing: "0.1em", textTransform: "uppercase" as const,
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

          {resolvedTab === "optimization" && <OptimizationTab suggestions={suggestions} />}
          {resolvedTab === "comparison" && <ComparisonTab comparison={comparison} />}
        </div>
      )}
    </aside>
  );
}

export default CircuitExplainer;
