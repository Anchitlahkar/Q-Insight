import { Circuit, GateOperation, SerializedCircuit } from "@/lib/types";

export interface ComparisonMetrics {
  gateCount: number;
  depth: number;
}

const touchesQubit = (gate: GateOperation, qubit: number) => gate.target === qubit || gate.control === qubit;

export const serializeCircuit = (circuit: Circuit): SerializedCircuit => ({
  qubits: circuit.qubits,
  gates: circuit.gates
    .slice()
    .sort((left, right) => left.position.x - right.position.x)
    .map((gate) => ({
      type: gate.type,
      target: gate.target,
      ...(gate.control !== undefined ? { control: gate.control } : {}),
      ...(gate.theta !== undefined ? { theta: gate.theta } : {})
    }))
});

export const calculateMetrics = (circuit: Circuit): ComparisonMetrics => {
  const sortedGates = circuit.gates.slice().sort((left, right) => left.position.x - right.position.x);
  const laneDepths = new Array(circuit.qubits).fill(0);

  for (const gate of sortedGates) {
    const touched = [gate.target, ...(gate.control !== undefined ? [gate.control] : [])];
    const depth = Math.max(...touched.map((qubit) => laneDepths[qubit])) + 1;
    touched.forEach((qubit) => {
      laneDepths[qubit] = depth;
    });
  }

  return {
    gateCount: circuit.gates.length,
    depth: laneDepths.length ? Math.max(...laneDepths) : 0
  };
};

export const getProbabilitySeries = (counts: Record<string, number>) => {
  const total = Object.values(counts).reduce((sum, count) => sum + count, 0);
  if (!total) return [];

  return Object.entries(counts)
    .map(([state, count]) => ({
      state,
      probability: Number((count / total).toFixed(4)),
      count
    }))
    .sort((left, right) => left.state.localeCompare(right.state));
};

export const getOccupiedColumns = (circuit: Circuit) => {
  const columns = new Map<number, GateOperation[]>();
  for (const gate of circuit.gates) {
    const column = Math.max(0, Math.round(gate.position.x / 68));
    const existing = columns.get(column) ?? [];
    existing.push(gate);
    columns.set(column, existing);
  }
  return columns;
};

export const gateTouchesQubit = touchesQubit;

