import AlgorithmSelector from "@/components/AlgorithmSelector";
import CircuitBuilder from "@/components/CircuitBuilder";
import VisualizationPanel from "@/components/VisualizationPanel";
import Histogram from "@/components/Histogram";
import ComparisonTable from "@/components/ComparisonTable";

export default function HomePage() {
  return (
    <main className="min-h-screen px-4 py-6 sm:px-6 lg:px-8">
      <div className="mx-auto flex w-full max-w-[1440px] flex-col gap-6">
        {/* â”€â”€ Page header â”€â”€ */}
        <header className="flex flex-col gap-1 pb-2">
          <div className="flex items-center gap-3">
            {/* Glowing logo mark */}
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
                }}
              >
                Quantum Lab
              </h1>
              <p
                style={{
                  fontSize: "0.72rem",
                  color: "rgba(40, 64, 90, 1)",
                  fontFamily: "JetBrains Mono, monospace",
                  letterSpacing: "0.08em",
                  textTransform: "uppercase",
                  marginTop: 1,
                }}
              >
                Circuit Simulator Â· v2.0
              </p>
            </div>
          </div>
          {/* Thin rule */}
          <div
            style={{
              height: 1,
              marginTop: 16,
              background: "linear-gradient(90deg, rgba(0,212,255,0.25) 0%, rgba(162,89,255,0.15) 50%, transparent 100%)",
            }}
          />
        </header>

        {/* â”€â”€ Main builder â”€â”€ */}
        <div style={{
          display: "flex",
          flexDirection: "column",
          height: "100vh",
          overflow: "hidden",
        }}>
          <div style={{
            flex: "0 0 55%",
            overflow: "auto",
            borderBottom: "1px solid rgba(255,255,255,0.08)",
            paddingBottom: 16,
          }}>
            <AlgorithmSelector />
            <CircuitBuilder />
          </div>

          <VisualizationPanel />
        </div>

        {/* â”€â”€ Histograms â”€â”€ */}
        <section className="grid gap-5 lg:grid-cols-2">
          <Histogram circuitKey="A" title="Algorithm A" />
          <Histogram circuitKey="B" title="Algorithm B" />
        </section>

        {/* â”€â”€ Comparison â”€â”€ */}
        <ComparisonTable />

        {/* â”€â”€ Footer â”€â”€ */}
        <footer
          style={{
            textAlign: "center",
            paddingBottom: 24,
            fontSize: "0.7rem",
            fontFamily: "JetBrains Mono, monospace",
            color: "rgba(40, 64, 90, 0.7)",
            letterSpacing: "0.06em",
          }}
        >
          QUANTUM NOIR Â· CIRCUIT SIMULATION ENGINE
        </footer>
      </div>
    </main>
  );
}

