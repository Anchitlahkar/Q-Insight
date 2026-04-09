"use client";

import { memo, useMemo, useState } from "react";
import algorithms from "@/lib/algorithms.json";
import { useWebSocket } from "@/hooks/useWebSocket";
import { serializeCircuit } from "@/lib/circuit";
import { webSocketUrl } from "@/lib/env";
import type { AlgorithmDefinition } from "@/lib/types";
import { useCircuitStore } from "@/store/useCircuitStore";

type AlgorithmCatalog = Record<string, AlgorithmDefinition[]>;

const ALGORITHMS_BY_CATEGORY = algorithms as AlgorithmCatalog;

function AlgorithmSelectorComponent() {
  const activeCircuit = useCircuitStore((state) => state.activeCircuit);
  const loadAlgorithm = useCircuitStore((state) => state.loadAlgorithm);
  const setResult = useCircuitStore((state) => state.setResult);
  const clearResult = useCircuitStore((state) => state.clearResult);
  const clearCircuit = useCircuitStore((state) => state.clearCircuit);
  const setQubitCount = useCircuitStore((state) => state.setQubitCount);
  const { simulateCircuit, isLoading } = useWebSocket(webSocketUrl);
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);
  const [selectedAlgorithmId, setSelectedAlgorithmId] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const categories = useMemo(() => Object.keys(ALGORITHMS_BY_CATEGORY), []);
  const algorithmLookup = useMemo(
    () => new Map(Object.values(ALGORITHMS_BY_CATEGORY).flat().map((algorithm) => [algorithm.id, algorithm])),
    []
  );
  const algorithmsInCategory = useMemo(
    () => (selectedCategory ? ALGORITHMS_BY_CATEGORY[selectedCategory] ?? [] : []),
    [selectedCategory]
  );
  const selectedAlgorithm = selectedAlgorithmId ? algorithmLookup.get(selectedAlgorithmId) ?? null : null;

  const handleCategorySelect = (category: string) => {
    setSelectedCategory(category);
    setSelectedAlgorithmId(null);
    setMessage(null);
    setError(null);
  };

  const handleBackToCategories = () => {
    setSelectedCategory(null);
    setSelectedAlgorithmId(null);
    setMessage(null);
    setError(null);
  };

  const handleLoad = async (algorithmId: string) => {
    setSelectedAlgorithmId(algorithmId);

    const algorithm = algorithmLookup.get(algorithmId);
    if (!algorithm) {
      setError("Choose an algorithm to load.");
      setMessage(null);
      return;
    }

    try {
      clearResult(activeCircuit);

      if (algorithm.executionMode === "backend" && algorithm.backendAlgorithm) {
        setQubitCount(activeCircuit, algorithm.qubits);
        clearCircuit(activeCircuit);

        const result = await simulateCircuit({
          mode: "algorithm",
          algorithm: algorithm.backendAlgorithm,
          params: algorithm.backendParams,
        });

        setResult(activeCircuit, result);
        setMessage(`Loaded ${algorithm.name} into Circuit ${activeCircuit} and ran the backend-built circuit.`);
      } else {
        loadAlgorithm(activeCircuit, algorithm);
        const nextCircuit = useCircuitStore.getState().circuits[activeCircuit];
        const result = await simulateCircuit(serializeCircuit(nextCircuit));
        setResult(activeCircuit, result);
        setMessage(`Loaded ${algorithm.name} into Circuit ${activeCircuit} and ran it immediately.`);
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
            Choose a category, then click an algorithm to load and run it immediately. Backend algorithms still execute from a single source of truth.
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

      {!selectedCategory ? (
        <div style={{ marginTop: 18, display: "flex", flexDirection: "column", gap: 12 }}>
          <div
            style={{
              fontFamily: "JetBrains Mono, monospace",
              fontSize: 9,
              color: "rgba(40,64,90,0.85)",
              letterSpacing: "0.08em",
              textTransform: "uppercase",
            }}
          >
            Select Category
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: 12 }}>
            {categories.map((category) => {
              const algorithmCount = ALGORITHMS_BY_CATEGORY[category]?.length ?? 0;

              return (
                <button
                  key={category}
                  type="button"
                  onClick={() => handleCategorySelect(category)}
                  style={{
                    textAlign: "left",
                    borderRadius: 16,
                    padding: "14px 16px",
                    border: "1px solid rgba(255,255,255,0.08)",
                    background: "linear-gradient(145deg, rgba(8,18,35,0.96), rgba(3,9,20,0.92))",
                    color: "#c8dff2",
                    cursor: "pointer",
                    transition: "transform 160ms ease, border-color 160ms ease, box-shadow 160ms ease",
                    boxShadow: "0 10px 24px rgba(0,0,0,0.24)",
                  }}
                >
                  <div style={{ fontFamily: "Syne, sans-serif", fontWeight: 700, fontSize: 14 }}>{category}</div>
                  <div style={{ marginTop: 8, fontFamily: "JetBrains Mono, monospace", fontSize: 10, color: "rgba(200,223,242,0.6)" }}>
                    {algorithmCount} algorithm{algorithmCount === 1 ? "" : "s"}
                  </div>
                </button>
              );
            })}
          </div>
        </div>
      ) : (
        <div style={{ marginTop: 18, display: "flex", flexDirection: "column", gap: 14 }}>
          <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", justifyContent: "space-between", gap: 12 }}>
            <button
              type="button"
              onClick={handleBackToCategories}
              style={{
                borderRadius: 999,
                padding: "8px 12px",
                fontFamily: "JetBrains Mono, monospace",
                fontSize: 10,
                border: "1px solid rgba(255,255,255,0.08)",
                background: "rgba(2,6,15,0.8)",
                color: "#c8dff2",
                cursor: "pointer",
              }}
            >
              ← Back to Categories
            </button>

            <div style={{ fontFamily: "JetBrains Mono, monospace", fontSize: 10, color: "rgba(200,223,242,0.62)" }}>
              Algorithms in {selectedCategory}
            </div>
          </div>

          {algorithmsInCategory.length > 0 ? (
            <div style={{ display: "grid", gap: 12 }}>
              {algorithmsInCategory.map((algorithm) => {
                const isSelected = selectedAlgorithmId === algorithm.id;
                const executionLabel = algorithm.executionMode === "backend" ? "Backend" : "Builder";

                return (
                  <button
                    key={algorithm.id}
                    type="button"
                    onClick={() => void handleLoad(algorithm.id)}
                    disabled={isLoading}
                    aria-pressed={isSelected}
                    style={{
                      textAlign: "left",
                      borderRadius: 16,
                      padding: "14px 16px",
                      border: isSelected ? "1px solid rgba(0,212,255,0.38)" : "1px solid rgba(255,255,255,0.08)",
                      background: isSelected
                        ? "linear-gradient(145deg, rgba(0,212,255,0.14), rgba(10,24,42,0.96))"
                        : "linear-gradient(145deg, rgba(8,18,35,0.96), rgba(3,9,20,0.92))",
                      color: "#c8dff2",
                      cursor: isLoading ? "progress" : "pointer",
                      opacity: isLoading ? 0.72 : 1,
                      boxShadow: isSelected ? "0 0 24px rgba(0,212,255,0.12)" : "0 10px 24px rgba(0,0,0,0.24)",
                    }}
                  >
                    <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", justifyContent: "space-between", gap: 10 }}>
                      <div style={{ fontFamily: "Syne, sans-serif", fontWeight: 700, fontSize: 14 }}>{algorithm.name}</div>
                      <div style={{ fontFamily: "JetBrains Mono, monospace", fontSize: 10, color: isSelected ? "#00d4ff" : "rgba(200,223,242,0.6)" }}>
                        {isLoading && isSelected ? "Running..." : "Load circuit"}
                      </div>
                    </div>

                    <div style={{ display: "flex", flexWrap: "wrap", gap: 12, marginTop: 8, fontFamily: "JetBrains Mono, monospace", fontSize: 10, color: "rgba(200,223,242,0.65)" }}>
                      <span>
                        {algorithm.qubits} qubit{algorithm.qubits === 1 ? "" : "s"}
                      </span>
                      <span>{executionLabel} execution</span>
                    </div>
                  </button>
                );
              })}
            </div>
          ) : (
            <div
              style={{
                padding: "12px 14px",
                borderRadius: 14,
                border: "1px solid rgba(255,255,255,0.06)",
                background: "rgba(2,6,15,0.65)",
                fontFamily: "JetBrains Mono, monospace",
                fontSize: 10,
                color: "rgba(200,223,242,0.62)",
              }}
            >
              No algorithms are available in this category yet.
            </div>
          )}
        </div>
      )}

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
          <div
            style={{
              fontFamily: "JetBrains Mono, monospace",
              fontSize: 10,
              color: selectedAlgorithm.executionMode === "backend" ? "#00e5a0" : "rgba(200,223,242,0.7)",
            }}
          >
            {selectedAlgorithm.executionMode === "backend"
              ? "Backend-built execution"
              : `${selectedAlgorithm.gates.length} gate builder circuit`}
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
