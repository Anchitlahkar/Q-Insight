import AlgorithmSelector from "@/components/AlgorithmSelector";
import CircuitBuilder from "@/components/CircuitBuilder";
import VisualizationPanel from "@/components/VisualizationPanel";
import Histogram from "@/components/Histogram";
import ComparisonTable from "@/components/ComparisonTable";

export default function HomePage() {
  return (
    <main
      style={{
        minHeight: "100vh",
        padding: "28px 28px 48px",
      }}
    >
      <div
        style={{
          margin: "0 auto",
          width: "100%",
          maxWidth: 1440,
          display: "flex",
          flexDirection: "column",
          gap: 0,
        }}
      >
        {/* ── Page header ── */}
        <header style={{ paddingBottom: 20 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            {/* Logo mark */}
            <div
              style={{
                width: 36,
                height: 36,
                borderRadius: 10,
                background: "linear-gradient(135deg, rgba(0,212,255,0.15) 0%, rgba(162,89,255,0.15) 100%)",
                border: "1px solid rgba(0,212,255,0.2)",
                boxShadow: "0 0 16px rgba(0,212,255,0.12), inset 0 0 12px rgba(0,212,255,0.06)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                flexShrink: 0,
              }}
            >
              <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
                <circle cx="9" cy="9" r="2.5" fill="#00d4ff" opacity="0.9" />
                <circle cx="9" cy="9" r="6" stroke="#00d4ff" strokeWidth="1" opacity="0.35" />
                <circle cx="9" cy="9" r="8.5" stroke="rgba(162,89,255,0.3)" strokeWidth="0.75" />
                <line x1="1" y1="9" x2="17" y2="9" stroke="#00d4ff" strokeWidth="0.5" opacity="0.2" />
                <line x1="9" y1="1" x2="9" y2="17" stroke="#00d4ff" strokeWidth="0.5" opacity="0.2" />
              </svg>
            </div>

            <div>
              <h1
                style={{
                  fontFamily: "Syne, sans-serif",
                  fontWeight: 800,
                  fontSize: "1.35rem",
                  letterSpacing: "-0.01em",
                  background: "linear-gradient(90deg, #c8dff2 0%, rgba(0,212,255,0.85) 60%, rgba(162,89,255,0.7) 100%)",
                  WebkitBackgroundClip: "text",
                  WebkitTextFillColor: "transparent",
                  backgroundClip: "text",
                  lineHeight: 1.2,
                  margin: 0,
                }}
              >
                Quantum Lab
              </h1>
              <p
                style={{
                  fontSize: "0.7rem",
                  color: "rgba(40,64,90,1)",
                  fontFamily: "JetBrains Mono, monospace",
                  letterSpacing: "0.08em",
                  textTransform: "uppercase",
                  marginTop: 2,
                }}
              >
                Circuit Simulator · v2.0
              </p>
            </div>
          </div>

          {/* Divider */}
          <div
            style={{
              height: 1,
              marginTop: 18,
              background: "linear-gradient(90deg, rgba(0,212,255,0.25) 0%, rgba(162,89,255,0.15) 50%, transparent 100%)",
            }}
          />
        </header>

        {/* ── Algorithm selector ── */}
        <section style={{ marginBottom: 16 }}>
          <AlgorithmSelector />
        </section>

        {/* ── Circuit builder ── */}
        <section style={{ marginBottom: 16 }}>
          <CircuitBuilder />
        </section>

        {/* ── Visualization panel ── */}
        <section style={{ marginBottom: 28 }}>
          <VisualizationPanel />
        </section>

        {/* ── Histograms ── */}
        <section
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(2, 1fr)",
            gap: 16,
            marginBottom: 20,
          }}
        >
          <Histogram circuitKey="A" title="Algorithm A" />
          <Histogram circuitKey="B" title="Algorithm B" />
        </section>

        {/* ── Comparison table ── */}
        <section style={{ marginBottom: 40 }}>
          <ComparisonTable />
        </section>

        {/* ── Footer ── */}
        <footer
          style={{
            textAlign: "center",
            fontSize: "0.68rem",
            fontFamily: "JetBrains Mono, monospace",
            color: "rgba(40,64,90,0.65)",
            letterSpacing: "0.08em",
            paddingTop: 8,
            borderTop: "1px solid rgba(255,255,255,0.04)",
          }}
        >
          QUANTUM NOIR · CIRCUIT SIMULATION ENGINE
        </footer>
      </div>
    </main>
  );
}