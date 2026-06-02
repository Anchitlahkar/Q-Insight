"use client";

import { memo, useCallback, useMemo, useState } from "react";
import type { DragEvent } from "react";
import { motion } from "framer-motion";
import algorithms from "@/lib/algorithms.json";
import { serializeCircuit } from "@/lib/circuit";
import { variationalUrl, webSocketUrl } from "@/lib/env";
import type { AlgorithmDefinition, VariationalRunResponse } from "@/lib/types";
import { useWebSocket } from "@/hooks/useWebSocket";
import { useCircuitStore } from "@/store/useCircuitStore";

type AlgorithmCatalog = Record<string, AlgorithmDefinition[]>;

const ALGORITHMS_BY_CATEGORY = algorithms as AlgorithmCatalog;

const CATEGORY_ORDER = [
  "Quantum Foundations",
  "Search Algorithms",
  "Fourier Algorithms",
  "Variational Algorithms",
  "Linear Algebra Algorithms",
  "Quantum Communication",
  "Post-Quantum Cryptography",
  "Hardware Demonstrations",
];

// Short labels for the tab strip (kept under ~12 chars so tabs stay compact)
const CATEGORY_SHORT: Record<string, string> = {
  "Quantum Foundations":       "Foundations",
  "Search Algorithms":         "Search",
  "Fourier Algorithms":        "Fourier",
  "Variational Algorithms":    "Variational",
  "Linear Algebra Algorithms": "Lin. Algebra",
  "Quantum Communication":     "Comms",
  "Post-Quantum Cryptography": "Post-Quantum",
  "Hardware Demonstrations":   "Hardware",
};

function dragPayload(algorithm: AlgorithmDefinition, category: string) {
  return JSON.stringify({
    entity: "component",
    algorithm: { ...algorithm, category },
  });
}

function isVariationalAlgorithm(category: string, algorithm: AlgorithmDefinition) {
  return algorithm.executionMode === "backend" || category === "Variational Algorithms";
}

function buildOptimizedVariationalDefinition(algorithm: AlgorithmDefinition, theta: number): AlgorithmDefinition {
  const gates = [
    ...Array.from({ length: algorithm.qubits }, (_, target) => ({ type: "RY" as const, target, theta })),
    ...Array.from({ length: Math.max(algorithm.qubits - 1, 0) }, (_, control) => ({
      type: "CNOT" as const,
      control,
      target: control + 1,
    })),
    ...Array.from({ length: algorithm.qubits }, (_, target) => ({ type: "M" as const, target })),
  ];

  return {
    ...algorithm,
    name: `${algorithm.name} (Optimized)`,
    gates,
  };
}

function AlgorithmSelectorComponent() {
  const activeCircuit          = useCircuitStore((s) => s.activeCircuit);
  const loadAlgorithm          = useCircuitStore((s) => s.loadAlgorithm);
  const loadAlgorithmComponent = useCircuitStore((s) => s.loadAlgorithmComponent);
  const setResult              = useCircuitStore((s) => s.setResult);
  const setSocketError         = useCircuitStore((s) => s.setSocketError);
  const setIsRunning           = useCircuitStore((s) => s.setIsRunning);
  const { simulateCircuit }    = useWebSocket(webSocketUrl);

  // Available categories (those that exist in the JSON)
  const availableCategories = useMemo(
    () => CATEGORY_ORDER.filter((cat) => ALGORITHMS_BY_CATEGORY[cat]?.length),
    []
  );

  const [selectedCategory, setSelectedCategory] = useState<string>(availableCategories[0] ?? "");
  const [optimizingId, setOptimizingId] = useState<string | null>(null);

  const currentAlgorithms = useMemo(
    () =>
      (ALGORITHMS_BY_CATEGORY[selectedCategory] ?? []).map((alg) => ({
        ...alg,
        category: selectedCategory,
      })),
    [selectedCategory]
  );

  const optimizeAlgorithm = useCallback(
    async (algorithm: AlgorithmDefinition) => {
      try {
        setOptimizingId(algorithm.id);
        setSocketError(null);
        setIsRunning(true);

        const response = await fetch(variationalUrl, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            qubits: algorithm.qubits,
            ...(algorithm.backendParams ?? {}),
          }),
        });

        if (!response.ok) {
          throw new Error(`Optimization failed with status ${response.status}.`);
        }

        const payload = (await response.json()) as VariationalRunResponse;
        const optimized = buildOptimizedVariationalDefinition(algorithm, payload.best.theta);

        loadAlgorithm(activeCircuit, optimized);

        const result = await simulateCircuit(serializeCircuit({
          qubits: optimized.qubits,
          gates: optimized.gates.map((gate, index) => ({
            id: `${optimized.id}-optimized-${index}`,
            type: gate.type,
            target: gate.target,
            ...(gate.control !== undefined ? { control: gate.control } : {}),
            ...(gate.theta !== undefined ? { theta: gate.theta } : {}),
            position: { x: index * 68, y: gate.target * 84 },
          })),
        }));

        setResult(activeCircuit, {
          ...result,
          variational: payload,
        });
      } catch (error) {
        setSocketError(error instanceof Error ? error.message : "Optimization failed.");
      } finally {
        setIsRunning(false);
        setOptimizingId(null);
      }
    },
    [activeCircuit, loadAlgorithm, setIsRunning, setResult, setSocketError, simulateCircuit]
  );

  return (
    <motion.section
      initial={{ opacity: 0, y: 14 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.38, ease: "easeOut" }}
      style={{
      borderRadius: 20,
      border: "1px solid rgba(148,163,184,0.16)",
      background: "linear-gradient(180deg, rgba(17,24,39,0.78), rgba(8,13,27,0.78))",
      padding: 24,
      display: "grid",
      gap: 20,
      boxShadow: "0 24px 70px rgba(0,0,0,0.34), inset 0 1px 0 rgba(255,255,255,0.04)",
      backdropFilter: "blur(18px)",
    }}>
      {/* Header */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 16 }}>
        <div>
          <h2 style={{ margin: 0, fontFamily: "Syne, sans-serif", fontSize: 18, fontWeight: 700, color: "#E5E7EB" }}>
            Algorithm Library
          </h2>
          <p style={{ margin: "6px 0 0", fontFamily: "JetBrains Mono, monospace", fontSize: 9, color: "#9CA3AF", lineHeight: 1.6 }}>
            Select a category, then drag or load an algorithm into the active circuit.
          </p>
        </div>
        <div style={{
          borderRadius: 999, border: "1px solid rgba(34,211,238,0.28)", background: "rgba(34,211,238,0.10)",
          color: "#67E8F9", padding: "6px 14px",
          fontFamily: "JetBrains Mono, monospace", fontSize: 9, textTransform: "uppercase", letterSpacing: "0.08em",
          whiteSpace: "nowrap",
        }}>
          Circuit {activeCircuit}
        </div>
      </div>

      {/* ── Level 1: Category tab strip ── */}
      {/*
        All categories rendered as compact pill buttons.
        They wrap naturally on small containers.
        No accordion — a single click switches the tile grid below instantly.
      */}
      <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
        {availableCategories.map((cat) => {
          const active = selectedCategory === cat;
          return (
            <button
              key={cat}
              type="button"
              onClick={() => setSelectedCategory(cat)}
              style={{
                borderRadius: 10,
                border: `1px solid ${active ? "rgba(34,211,238,0.36)" : "rgba(148,163,184,0.16)"}`,
                background: active ? "rgba(34,211,238,0.13)" : "rgba(15,23,42,0.68)",
                color: active ? "#67E8F9" : "#9CA3AF",
                padding: "6px 14px",
                fontFamily: "JetBrains Mono, monospace",
                fontSize: 10,
                cursor: "pointer",
                transition: "all 0.13s",
                fontWeight: active ? 600 : 400,
              }}>
              {CATEGORY_SHORT[cat] ?? cat}
            </button>
          );
        })}
      </div>

      {/* ── Level 2: Tile grid for the selected category ── */}
      {currentAlgorithms.length === 0 ? (
        <div style={{
          padding: "32px 0", textAlign: "center",
          fontFamily: "JetBrains Mono, monospace", fontSize: 10, color: "#9CA3AF",
        }}>
          No algorithms in this category yet.
        </div>
      ) : (
        <div style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fill, minmax(220px, 1fr))",
          gap: 12,
        }}>
          {currentAlgorithms.map((algorithm) => (
            <motion.div
              key={algorithm.id}
              draggable
              onDragStartCapture={(e) => {
                const dragEvent = e as unknown as DragEvent<HTMLDivElement>;
                dragEvent.dataTransfer.effectAllowed = "copy";
                dragEvent.dataTransfer.setData("application/x-qhack-operation", dragPayload(algorithm, selectedCategory));
              }}
              style={{
                borderRadius: 16,
                border: "1px solid rgba(148,163,184,0.16)",
                background: "rgba(15,23,42,0.72)",
                padding: "16px 18px",
                display: "flex",
                flexDirection: "column",
                gap: 8,
                cursor: "grab",
                boxShadow: "0 14px 34px rgba(0,0,0,0.22)",
              }}
              whileHover={{ y: -2, borderColor: "rgba(34,211,238,0.36)", boxShadow: "0 18px 44px rgba(0,0,0,0.30), 0 0 24px rgba(34,211,238,0.10)" }}
              whileTap={{ scale: 0.99 }}
            >
              {/* Algorithm name */}
              <div style={{
                fontFamily: "Syne, sans-serif", fontSize: 14, fontWeight: 700, color: "#E5E7EB",
                whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis",
              }}>
                {algorithm.name}
              </div>

              {/* Description */}
              {algorithm.description && (
                <div style={{
                  fontFamily: "JetBrains Mono, monospace", fontSize: 9, color: "#9CA3AF", lineHeight: 1.5,
                  display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical", overflow: "hidden",
                }}>
                  {algorithm.description}
                </div>
              )}

              {/* Qubit badge + action buttons */}
              <div style={{ display: "flex", alignItems: "center", gap: 6, marginTop: 2, flexWrap: "wrap" }}>
                <span style={{
                  borderRadius: 999, background: "rgba(148,163,184,0.10)", color: "#CBD5E1",
                  padding: "2px 8px", fontFamily: "JetBrains Mono, monospace", fontSize: 8,
                }}>
                  {algorithm.qubits}q
                </span>
                {isVariationalAlgorithm(selectedCategory, algorithm) && (
                  <button
                    type="button"
                    onClick={() => void optimizeAlgorithm(algorithm)}
                    disabled={optimizingId === algorithm.id}
                    style={{
                      borderRadius: 8, border: "1px solid rgba(245,158,11,0.35)", background: "rgba(245,158,11,0.12)",
                      color: "#FCD34D", padding: "4px 10px",
                      fontFamily: "JetBrains Mono, monospace", fontSize: 9, cursor: optimizingId === algorithm.id ? "progress" : "pointer",
                      opacity: optimizingId === algorithm.id ? 0.8 : 1,
                    }}
                  >
                    {optimizingId === algorithm.id ? "Optimizing..." : "Optimize"}
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => loadAlgorithmComponent(activeCircuit, algorithm)}
                  style={{
                    borderRadius: 8, border: "1px solid rgba(34,211,238,0.28)", background: "rgba(34,211,238,0.10)",
                    color: "#67E8F9", padding: "4px 10px",
                    fontFamily: "JetBrains Mono, monospace", fontSize: 9, cursor: "pointer",
                  }}>
                  Component
                </button>
                <button
                  type="button"
                  onClick={() => loadAlgorithm(activeCircuit, algorithm)}
                  style={{
                    borderRadius: 8, border: "1px solid rgba(148,163,184,0.16)", background: "rgba(15,23,42,0.84)",
                    color: "#E5E7EB", padding: "4px 10px",
                    fontFamily: "JetBrains Mono, monospace", fontSize: 9, cursor: "pointer",
                  }}>
                  Expanded
                </button>
              </div>
            </motion.div>
          ))}
        </div>
      )}
    </motion.section>
  );
}

export default memo(AlgorithmSelectorComponent);
