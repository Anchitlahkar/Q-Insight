export type { GateType } from "./gates";

export type CircuitKey = "A" | "B";

export interface GateOperation {
  id: string;
  type: import("./gates").GateType;
  target: number;
  control?: number;
  theta?: number;
  position: { x: number; y: number };
}

export interface Circuit {
  qubits: number;
  gates: GateOperation[];
}

export interface SimulationResult {
  counts: Record<string, number>;
  statevector: unknown[] | null;
  depth?: number;
  gate_count?: number;
}

export type SocketStatus = "connecting" | "connected" | "running" | "disconnected" | "error";

export interface SerializedGate {
  type: string;
  target: number;
  control?: number;
  theta?: number;
}

export interface SerializedCircuit {
  qubits: number;
  gates: SerializedGate[];
}

