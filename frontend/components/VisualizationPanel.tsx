"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { BlochSphere } from "@/components/BlochSphere";
import { useWebSocket } from "@/hooks/useWebSocket";
import { serializeCircuit } from "@/lib/circuit";
import { getBlochVectors } from "@/lib/quantum";
import { StepSimulationRequest } from "@/lib/types";
import { useCircuitStore } from "@/store/useCircuitStore";
import { useVisualizationStore } from "@/store/useVisualizationStore";

const WS_URL = "ws://localhost:8000/ws";

export default function VisualizationPanel() {
  const activeCircuit = useCircuitStore((s) => s.activeCircuit);
  const circuit = useCircuitStore((s) => s.circuits[s.activeCircuit]);

  const {
    currentStep,
    visualizationResult,
    isVisualizing,
    isPlaying,
    speedMs,
    setCurrentStep,
    setVisualizationResult,
    setIsVisualizing,
    setIsPlaying,
    setSpeedMs,
    resetVisualization,
  } = useVisualizationStore();

  const [collapsed, setCollapsed] = useState(false);
  const { simulateCircuit } = useWebSocket(WS_URL);

  const playingRef = useRef(isPlaying);
  const speedRef = useRef(speedMs);
  const tokenRef = useRef(0);

  useEffect(() => {
    playingRef.current = isPlaying;
  }, [isPlaying]);

  useEffect(() => {
    speedRef.current = speedMs;
  }, [speedMs]);

  useEffect(() => {
    resetVisualization();
  }, [activeCircuit, circuit.gates, circuit.qubits, resetVisualization]);

  const steps = visualizationResult?.steps ?? [];
  const activeStep = currentStep >= 0 ? steps[currentStep] : null;
  const displayStatevector = activeStep?.statevector ?? visualizationResult?.statevector ?? null;
  const blochVectors = getBlochVectors(displayStatevector, circuit.qubits);

  const startVisualization = useCallback(async () => {
    const payload: StepSimulationRequest = {
      mode: "step_simulation",
      ...serializeCircuit(circuit),
    };

    const result = await simulateCircuit(payload);
    setVisualizationResult(result);
    setCurrentStep(0);
    setIsVisualizing(true);
    setIsPlaying(true);
    setCollapsed(false);
  }, [circuit, setCollapsed, setCurrentStep, setIsPlaying, setIsVisualizing, setVisualizationResult, simulateCircuit]);

  const play = useCallback(() => setIsPlaying(true), [setIsPlaying]);
  const pause = useCallback(() => setIsPlaying(false), [setIsPlaying]);

  useEffect(() => {
    if (!isPlaying || steps.length === 0) return;

    tokenRef.current += 1;
    const token = tokenRef.current;

    const run = async () => {
      let index = currentStep < 0 ? 0 : currentStep;

      while (playingRef.current && index < steps.length) {
        setCurrentStep(index);
        await new Promise((resolve) => window.setTimeout(resolve, speedRef.current));
        index += 1;

        if (tokenRef.current !== token) {
          return;
        }
      }

      if (index >= steps.length) {
        setIsPlaying(false);
        setIsVisualizing(false);
      }
    };

    run();

    return () => {
      tokenRef.current += 1;
    };
  }, [currentStep, isPlaying, setCurrentStep, setIsPlaying, setIsVisualizing, steps.length]);

  return (
    <div
      style={{
        flex: collapsed ? "0 0 48px" : "1",
        transition: "all 0.2s ease",
        overflow: "hidden",
        borderTop: "1px solid rgba(255,255,255,0.06)",
        background: "rgba(6,13,26,0.9)",
      }}
    >
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          padding: "8px 12px",
          background: "rgba(10,15,25,0.9)",
          borderBottom: "1px solid rgba(255,255,255,0.06)",
        }}
      >
        <span
          style={{
            fontFamily: "Syne, sans-serif",
            fontWeight: 700,
            fontSize: 13,
            color: "#c8dff2",
            letterSpacing: "0.04em",
          }}
        >
          Visualization
        </span>

        <div style={{ display: "flex", gap: 8 }}>
          <button
            type="button"
            onClick={startVisualization}
            style={{
              borderRadius: 10,
              padding: "6px 12px",
              fontFamily: "JetBrains Mono, monospace",
              fontSize: 11,
              cursor: "pointer",
              border: "1px solid rgba(0,229,160,0.34)",
              background: "linear-gradient(135deg,rgba(0,229,160,0.18),rgba(0,229,160,0.07))",
              color: "#00e5a0",
            }}
          >
            Visualize
          </button>

          <button
            type="button"
            onClick={() => setCollapsed((value) => !value)}
            style={{
              borderRadius: 10,
              padding: "6px 12px",
              fontFamily: "JetBrains Mono, monospace",
              fontSize: 11,
              cursor: "pointer",
              border: "1px solid rgba(255,255,255,0.12)",
              color: "rgba(200,223,242,0.85)",
              background: "rgba(255,255,255,0.04)",
            }}
          >
            {collapsed ? "Expand" : "Collapse"}
          </button>
        </div>
      </div>

      {!collapsed && (
        <>
          <div
            style={{
              display: "flex",
              gap: 10,
              padding: 10,
              alignItems: "center",
              borderBottom: "1px solid rgba(255,255,255,0.06)",
              background: "rgba(4,9,18,0.9)",
            }}
          >
            <button
              type="button"
              onClick={play}
              disabled={steps.length === 0}
              style={{
                borderRadius: 8,
                padding: "6px 10px",
                fontFamily: "JetBrains Mono, monospace",
                fontSize: 11,
                cursor: "pointer",
                border: "1px solid rgba(0,212,255,0.35)",
                color: "#c8dff2",
                background: "rgba(0,212,255,0.1)",
              }}
            >
              Play
            </button>

            <button
              type="button"
              onClick={pause}
              disabled={steps.length === 0}
              style={{
                borderRadius: 8,
                padding: "6px 10px",
                fontFamily: "JetBrains Mono, monospace",
                fontSize: 11,
                cursor: "pointer",
                border: "1px solid rgba(255,179,64,0.35)",
                color: "#ffcf7a",
                background: "rgba(255,179,64,0.1)",
              }}
            >
              Pause
            </button>

            <label
              style={{
                fontFamily: "JetBrains Mono, monospace",
                fontSize: 11,
                color: "rgba(200,223,242,0.7)",
              }}
            >
              Speed
            </label>

            <input
              type="range"
              min="200"
              max="1500"
              step="100"
              value={speedMs}
              onChange={(e) => setSpeedMs(Number(e.target.value))}
            />

            <span style={{ fontFamily: "JetBrains Mono, monospace", fontSize: 11, color: "rgba(200,223,242,0.7)" }}>
              {speedMs}ms
            </span>

            <div style={{ marginLeft: "auto", fontFamily: "JetBrains Mono, monospace", fontSize: 11, color: "rgba(200,223,242,0.7)" }}>
              {isVisualizing ? `step ${Math.max(currentStep + 1, 0)}/${steps.length}` : "idle"}
            </div>
          </div>

          <div style={{ maxHeight: 320, overflowY: "auto", padding: 12 }}>
            <div
              style={{
                display: "flex",
                flexWrap: "wrap",
                justifyContent: "center",
                gap: 16,
              }}
            >
              {blochVectors.map((vector, qubitIndex) => (
                <div key={qubitIndex} style={{ width: 140, textAlign: "center" }}>
                  <div style={{ fontFamily: "JetBrains Mono, monospace", fontSize: 11, color: "rgba(200,223,242,0.7)", marginBottom: 6 }}>
                    Qubit {qubitIndex}
                  </div>
                  <BlochSphere label={`q[${qubitIndex}]`} vector={vector} sphereSize={140} />
                </div>
              ))}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
