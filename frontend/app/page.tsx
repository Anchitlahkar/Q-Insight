import AlgorithmSelector from "@/components/AlgorithmSelector";
import CircuitBuilder from "@/components/CircuitBuilder";
import VisualizationPanel from "@/components/VisualizationPanel";
import Histogram from "@/components/Histogram";
import ComparisonTable from "@/components/ComparisonTable";
import Image from "next/image";

export default function HomePage() {
  return (
    <main style={{ minHeight: "100vh", padding: "24px", background: "#F6F8FB" }}>
      <div style={{ margin: "0 auto", width: "100%", maxWidth: 1440, display: "grid", gap: 16 }}>
        <header style={{ borderRadius: 12, border: "1px solid #E5E7EB", background: "#FFFFFF", padding: 20, boxShadow: "0 18px 36px rgba(15,23,42,0.04)" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
            <div style={{ width: 56, height: 56, borderRadius: 12, background: "#EFF6FF", border: "1px solid #DBEAFE", display: "flex", alignItems: "center", justifyContent: "center", padding: 8 }}>
              <Image src="/logo.png" alt="Quantum Lab logo" width={40} height={40} priority style={{ width: "100%", height: "100%", objectFit: "contain" }} />
            </div>
            <div>
              <h1 style={{ margin: 0, fontFamily: "Syne, sans-serif", fontWeight: 800, fontSize: "1.65rem", color: "#1F2937", letterSpacing: "-0.02em" }}>Quantum Lab</h1>
              <p style={{ margin: "4px 0 0", fontFamily: "JetBrains Mono, monospace", fontSize: "0.72rem", color: "#6B7280", letterSpacing: "0.08em", textTransform: "uppercase" }}>
                Compact Quantum Composer UI
              </p>
            </div>
          </div>
        </header>

        <CircuitBuilder />
        <VisualizationPanel />

        <footer style={{ display: "grid", gap: 16 }}>
          <AlgorithmSelector />
          <section style={{ display: "grid", gridTemplateColumns: "repeat(2, minmax(0, 1fr))", gap: 16 }}>
            <Histogram circuitKey="A" title="Circuit A Distribution" />
            <Histogram circuitKey="B" title="Circuit B Distribution" />
          </section>
          <ComparisonTable />
        </footer>
      </div>
    </main>
  );
}
