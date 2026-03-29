import type { GateType } from "./gates";

export type { GateType } from "./gates";

export type CircuitKey = "A" | "B";

export interface GateOperation {
  id: string;
  type: GateType;
  target: number;
  control?: number;
  theta?: number;
  position: { x: number; y: number };
}

export interface Circuit {
  qubits: number;
  gates: GateOperation[];
}

export interface ComplexAmplitude {
  real: number;
  imag: number;
}

export interface SimulationStep {
  gate_index: number;
  gate_type: GateType;
  statevector: ComplexAmplitude[] | null;
}

export interface SimulationResult {
  counts: Record<string, number>;
  statevector: ComplexAmplitude[] | null;
  depth?: number;
  gate_count?: number;
  steps?: SimulationStep[];
}

export type SocketStatus = "connecting" | "connected" | "running" | "disconnected" | "error";

export interface SerializedGate {
  type: GateType;
  target: number;
  control?: number;
  theta?: number;
}

export interface SerializedCircuit {
  qubits: number;
  gates: SerializedGate[];
}

export interface AlgorithmDefinition {
  name: string;
  qubits: number;
  gates: SerializedGate[];
  description?: string;
  executionMode?: "load" | "backend";
  backendAlgorithm?: string;
  backendParams?: Record<string, unknown>;
}

export interface AlgorithmExecutionRequest {
  mode: "algorithm";
  algorithm: string;
  params?: Record<string, unknown>;
}

export interface StepSimulationRequest extends SerializedCircuit {
  mode: "step_simulation";
}

export type SimulationRequest = SerializedCircuit | AlgorithmExecutionRequest | StepSimulationRequest;

