"use client";

import { memo, useMemo, useState } from "react";
import algorithms from "@/lib/algorithms.json";
import { useWebSocket } from "@/hooks/useWebSocket";
import { serializeCircuit } from "@/lib/circuit";
import { webSocketUrl } from "@/lib/env";
import type { AlgorithmDefinition } from "@/lib/types";
import { useCircuitStore } from "@/store/useCircuitStore";

const ALGORITHMS = algorithms as AlgorithmDefinition[];

function AlgorithmSelectorComponent() {
  const activeCircuit = useCircuitStore((state) => state.activeCircuit);
  const circuits = useCircuitStore((state) => state.circuits);
  const loadAlgorithm = useCircuitStore((state) => state.loadAlgorithm);
  const setResult = useCircuitStore((state) => state.setResult);
  const clearResult = useCircuitStore((state) => state.clearResult);
  const clearCircuit = useCircuitStore((state) => state.clearCircuit);
  const setQubitCount = useCircuitStore((state) => state.setQubitCount);
  const { simulateCircuit, isLoading } = useWebSocket(webSocketUrl);
  const [selectedName, setSelectedName] = useState(ALGORITHMS[0]?.name ?? "");
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const selectedAlgorithm = useMemo(
    () => ALGORITHMS.find((algorithm) => algorithm.name === selectedName) ?? null,
    [selectedName]
  );

  const handleLoad = async () => {
    if (!selectedAlgorithm) {
      setError("Choose an algorithm to load.");
      setMessage(null);
      return;
    }

    try {
      clearResult(activeCircuit);

      if (selectedAlgorithm.executionMode === "backend" && selectedAlgorithm.backendAlgorithm) {
        setQubitCount(activeCircuit, selectedAlgorithm.qubits);
        clearCircuit(activeCircuit);

        const result = await simulateCircuit({
          mode: "algorithm",
          algorithm: selectedAlgorithm.backendAlgorithm,
          params: selectedAlgorithm.backendParams,
        });

        setResult(activeCircuit, result);
        setMessage(`Loaded ${selectedAlgorithm.name} into Circuit ${activeCircuit} and ran the backend-built circuit.`);
      } else {
        loadAlgorithm(activeCircuit, selectedAlgorithm);
        const nextCircuit = useCircuitStore.getState().circuits[activeCircuit];
        const result = await simulateCircuit(serializeCircuit(nextCircuit));
        setResult(activeCircuit, result);
        setMessage(`Loaded ${selectedAlgorithm.name} into Circuit ${activeCircuit} and ran it immediately.`);
      }

      setError(null);
    } catch (caughtError) {
      setMessage(null);
      setError(caughtError instanceof Error ? caughtError.message : "Unable to load algorithm.");
    }
  };

  return (
    <section
      style={{
        background: "rgba(6,13,26,0.85)",
        border: "1px solid rgba(255,255,255,0.07)",
        borderRadius: 22,
        padding: 18,
        boxShadow: "0 0 0 1px rgba(0,212,255,0.04), 0 18px 48px rgba(0,0,0,0.55)",
        backdropFilter: "blur(12px)",
      }}
    >
      <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", justifyContent: "space-between", gap: 16 }}>
        <div>
          <h2 style={{ fontFamily: "Syne, sans-serif", fontWeight: 700, fontSize: 16, color: "#c8dff2", margin: 0 }}>
            Algorithm Library
          </h2>
          <p style={{ fontFamily: "JetBrains Mono, monospace", fontSize: 10, color: "rgba(40,64,90,0.9)", marginTop: 4 }}>
            Load once to run immediately. Backend algorithms execute from a single source of truth and only use the builder as a qubit placeholder.
          </p>
        </div>

        <div
          style={{
            fontFamily: "JetBrains Mono, monospace",
            fontSize: 10,
            color: "#00d4ff",
            letterSpacing: "0.08em",
            textTransform: "uppercase",
            padding: "6px 10px",
            borderRadius: 999,
            border: "1px solid rgba(0,212,255,0.22)",
            background: "rgba(0,212,255,0.08)",
          }}
        >
          Active Circuit: {activeCircuit}
        </div>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "minmax(0,1fr) auto", gap: 12, marginTop: 16 }}>
        <label style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          <span
            style={{
              fontFamily: "JetBrains Mono, monospace",
              fontSize: 9,
              color: "rgba(40,64,90,0.85)",
              letterSpacing: "0.08em",
              textTransform: "uppercase",
            }}
          >
            Algorithm
          </span>
          <select
            value={selectedName}
            onChange={(event) => setSelectedName(event.target.value)}
            style={{
              background: "rgba(2,6,15,0.85)",
              border: "1px solid rgba(255,255,255,0.08)",
              borderRadius: 12,
              padding: "10px 12px",
              color: "#c8dff2",
              fontFamily: "JetBrains Mono, monospace",
              fontSize: 12,
              outline: "none",
              cursor: "pointer",
            }}
          >
            {ALGORITHMS.map((algorithm) => (
              <option key={algorithm.name} value={algorithm.name}>
                {algorithm.name}
              </option>
            ))}
          </select>
        </label>

        <button
          type="button"
          onClick={() => void handleLoad()}
          disabled={isLoading}
          style={{
            alignSelf: "end",
            borderRadius: 12,
            padding: "10px 16px",
            fontFamily: "Syne, sans-serif",
            fontWeight: 700,
            fontSize: 12,
            letterSpacing: "0.04em",
            cursor: isLoading ? "progress" : "pointer",
            border: "1px solid rgba(0,212,255,0.38)",
            background: "linear-gradient(135deg, rgba(0,212,255,0.18), rgba(162,89,255,0.1))",
            color: "#c8dff2",
            boxShadow: "0 0 18px rgba(0,212,255,0.12)",
            opacity: isLoading ? 0.7 : 1,
          }}
        >
          {isLoading ? "Running..." : "Load Algorithm"}
        </button>
      </div>

      {selectedAlgorithm && (
        <div
          style={{
            marginTop: 14,
            padding: "10px 12px",
            borderRadius: 14,
            border: "1px solid rgba(255,255,255,0.06)",
            background: "rgba(2,6,15,0.65)",
            display: "flex",
            flexWrap: "wrap",
            gap: 14,
          }}
        >
          <div style={{ fontFamily: "JetBrains Mono, monospace", fontSize: 10, color: "rgba(200,223,242,0.7)" }}>
            {selectedAlgorithm.qubits} qubit{selectedAlgorithm.qubits === 1 ? "" : "s"}
          </div>
          <div style={{ fontFamily: "JetBrains Mono, monospace", fontSize: 10, color: selectedAlgorithm.executionMode === "backend" ? "#00e5a0" : "rgba(200,223,242,0.7)" }}>
            {selectedAlgorithm.executionMode === "backend" ? "Backend-built execution" : `${selectedAlgorithm.gates.length} gate builder circuit`}
          </div>
          {selectedAlgorithm.description && (
            <div style={{ width: "100%", fontFamily: "JetBrains Mono, monospace", fontSize: 10, color: "rgba(200,223,242,0.62)", lineHeight: 1.5 }}>
              {selectedAlgorithm.description}
            </div>
          )}
          {selectedAlgorithm.executionMode === "backend" && (
            <div style={{ width: "100%", fontFamily: "JetBrains Mono, monospace", fontSize: 10, color: "rgba(255,209,102,0.8)", lineHeight: 1.5 }}>
              Builder view stays schematic for this selection so the frontend does not display a circuit that differs from backend execution.
            </div>
          )}
        </div>
      )}

      {message && (
        <p style={{ margin: "12px 0 0", fontFamily: "JetBrains Mono, monospace", fontSize: 10, color: "#00e5a0" }}>
          {message}
        </p>
      )}
      {error && (
        <p style={{ margin: "12px 0 0", fontFamily: "JetBrains Mono, monospace", fontSize: 10, color: "#ff5c7a" }}>
          {error}
        </p>
      )}
    </section>
  );
}

export default memo(AlgorithmSelectorComponent);
