import AlgorithmSelector from "@/components/AlgorithmSelector";
import CircuitBuilder from "@/components/CircuitBuilder";
import VisualizationPanel from "@/components/VisualizationPanel";
import Histogram from "@/components/Histogram";
import ComparisonTable from "@/components/ComparisonTable";
import Image from "next/image";

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
        {/* Page header */}
        <header style={{ paddingBottom: 20 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            <div
              style={{
                width: 52,
                height: 52,
                borderRadius: 14,
                background: "rgba(7, 16, 28, 0.82)",
                border: "1px solid rgba(0,212,255,0.18)",
                boxShadow: "0 0 18px rgba(0,212,255,0.12)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                flexShrink: 0,
                overflow: "hidden",
                padding: 6,
              }}
            >
              <Image
                src="/logo.png"
                alt="Quantum Lab logo"
                width={40}
                height={40}
                priority
                style={{ width: "100%", height: "100%", objectFit: "contain" }}
              />
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

          <div
            style={{
              height: 1,
              marginTop: 18,
              background: "linear-gradient(90deg, rgba(0,212,255,0.25) 0%, rgba(162,89,255,0.15) 50%, transparent 100%)",
            }}
          />
        </header>

        <section style={{ marginBottom: 16 }}>
          <AlgorithmSelector />
        </section>

        <section style={{ marginBottom: 16 }}>
          <CircuitBuilder />
        </section>

        <section style={{ marginBottom: 28 }}>
          <VisualizationPanel />
        </section>

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

        <section style={{ marginBottom: 40 }}>
          <ComparisonTable />
        </section>

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
