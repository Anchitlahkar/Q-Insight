import AlgorithmSelector from "@/components/AlgorithmSelector";
import CircuitBuilder from "@/components/CircuitBuilder";
import VisualizationPanel from "@/components/VisualizationPanel";
import Histogram from "@/components/Histogram";
import ComparisonTable from "@/components/ComparisonTable";
import Image from "next/image";

export default function HomePage() {
  return (
    <main className="qhack-app-shell">
      <div className="qhack-shell-inner">
        <header className="qhack-header">
          <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
            <div className="qhack-header-logo">
              <Image src="/logo.png" alt="Quantum Lab logo" width={40} height={40} priority style={{ width: "100%", height: "100%", objectFit: "contain" }} />
            </div>
            <div>
              <h1 className="qhack-title-gradient" style={{ margin: 0, fontFamily: "Syne, sans-serif", fontWeight: 800, fontSize: "1.65rem", letterSpacing: 0 }}>Quantum Lab</h1>
              <p style={{ margin: "4px 0 0", fontFamily: "JetBrains Mono, monospace", fontSize: "0.72rem", color: "#9CA3AF", letterSpacing: "0.08em", textTransform: "uppercase" }}>
                Cinematic Quantum Composer OS
              </p>
            </div>
          </div>
        </header>
        <AlgorithmSelector />
        <CircuitBuilder />
        <VisualizationPanel />

        <footer style={{ display: "grid", gap: 16 }}>
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
