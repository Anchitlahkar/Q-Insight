"use client";

import { memo, useMemo, useState } from "react";
import algorithms from "@/lib/algorithms.json";
import type { AlgorithmDefinition } from "@/lib/types";
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

function AlgorithmSelectorComponent() {
  const activeCircuit          = useCircuitStore((s) => s.activeCircuit);
  const loadAlgorithm          = useCircuitStore((s) => s.loadAlgorithm);
  const loadAlgorithmComponent = useCircuitStore((s) => s.loadAlgorithmComponent);

  // Available categories (those that exist in the JSON)
  const availableCategories = useMemo(
    () => CATEGORY_ORDER.filter((cat) => ALGORITHMS_BY_CATEGORY[cat]?.length),
    []
  );

  const [selectedCategory, setSelectedCategory] = useState<string>(availableCategories[0] ?? "");

  const currentAlgorithms = useMemo(
    () =>
      (ALGORITHMS_BY_CATEGORY[selectedCategory] ?? []).map((alg) => ({
        ...alg,
        category: selectedCategory,
      })),
    [selectedCategory]
  );

  return (
    <section style={{
      borderRadius: 12,
      border: "1px solid #E5E7EB",
      background: "#FFFFFF",
      padding: 20,
      display: "grid",
      gap: 16,
    }}>
      {/* Header */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12 }}>
        <div>
          <h2 style={{ margin: 0, fontFamily: "Syne, sans-serif", fontSize: 18, fontWeight: 700, color: "#1F2937" }}>
            Algorithm Library
          </h2>
          <p style={{ margin: "4px 0 0", fontFamily: "JetBrains Mono, monospace", fontSize: 9, color: "#6B7280", lineHeight: 1.5 }}>
            Select a category, then drag or load an algorithm into the active circuit.
          </p>
        </div>
        <div style={{
          borderRadius: 999, border: "1px solid #DBEAFE", background: "#EFF6FF",
          color: "#3B82F6", padding: "5px 12px",
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
      <div style={{ display: "flex", flexWrap: "wrap", gap: 5 }}>
        {availableCategories.map((cat) => {
          const active = selectedCategory === cat;
          return (
            <button
              key={cat}
              type="button"
              onClick={() => setSelectedCategory(cat)}
              style={{
                borderRadius: 8,
                border: `1px solid ${active ? "#DBEAFE" : "#E5E7EB"}`,
                background: active ? "#EFF6FF" : "#FFFFFF",
                color: active ? "#3B82F6" : "#6B7280",
                padding: "5px 11px",
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
          padding: "24px 0", textAlign: "center",
          fontFamily: "JetBrains Mono, monospace", fontSize: 10, color: "#94a3b8",
        }}>
          No algorithms in this category yet.
        </div>
      ) : (
        <div style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fill, minmax(200px, 1fr))",
          gap: 10,
        }}>
          {currentAlgorithms.map((algorithm) => (
            <div
              key={algorithm.id}
              draggable
              onDragStart={(e) => {
                e.dataTransfer.effectAllowed = "copy";
                e.dataTransfer.setData("application/x-qhack-operation", dragPayload(algorithm, selectedCategory));
              }}
              style={{
                borderRadius: 12,
                border: "1px solid #E5E7EB",
                background: "#FFFFFF",
                padding: "12px 14px",
                display: "flex",
                flexDirection: "column",
                gap: 6,
                cursor: "grab",
                transition: "all 0.13s",
              }}
              onMouseEnter={(e) => {
                (e.currentTarget as HTMLDivElement).style.borderColor = "#DBEAFE";
                (e.currentTarget as HTMLDivElement).style.background  = "#F8FBFF";
                (e.currentTarget as HTMLDivElement).style.transform   = "translateY(-1px)";
              }}
              onMouseLeave={(e) => {
                (e.currentTarget as HTMLDivElement).style.borderColor = "#E5E7EB";
                (e.currentTarget as HTMLDivElement).style.background  = "#FFFFFF";
                (e.currentTarget as HTMLDivElement).style.transform   = "none";
              }}
            >
              {/* Algorithm name */}
              <div style={{
                fontFamily: "Syne, sans-serif", fontSize: 14, fontWeight: 700, color: "#1F2937",
                whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis",
              }}>
                {algorithm.name}
              </div>

              {/* Description */}
              {algorithm.description && (
                <div style={{
                  fontFamily: "JetBrains Mono, monospace", fontSize: 9, color: "#6B7280", lineHeight: 1.5,
                  display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical", overflow: "hidden",
                }}>
                  {algorithm.description}
                </div>
              )}

              {/* Qubit badge + action buttons */}
              <div style={{ display: "flex", alignItems: "center", gap: 6, marginTop: 2, flexWrap: "wrap" }}>
                <span style={{
                  borderRadius: 999, background: "#F1F5F9", color: "#475569",
                  padding: "2px 8px", fontFamily: "JetBrains Mono, monospace", fontSize: 8,
                }}>
                  {algorithm.qubits}q
                </span>
                <button
                  type="button"
                  onClick={() => loadAlgorithmComponent(activeCircuit, algorithm)}
                  style={{
                    borderRadius: 8, border: "1px solid #DBEAFE", background: "#EFF6FF",
                    color: "#3B82F6", padding: "4px 10px",
                    fontFamily: "JetBrains Mono, monospace", fontSize: 9, cursor: "pointer",
                  }}>
                  Component
                </button>
                <button
                  type="button"
                  onClick={() => loadAlgorithm(activeCircuit, algorithm)}
                  style={{
                    borderRadius: 8, border: "1px solid #E5E7EB", background: "#FFFFFF",
                    color: "#1F2937", padding: "4px 10px",
                    fontFamily: "JetBrains Mono, monospace", fontSize: 9, cursor: "pointer",
                  }}>
                  Expanded
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}

export default memo(AlgorithmSelectorComponent);