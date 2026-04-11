import { isComponentType, isMeasureGate, isTwoQubitGate } from "@/lib/gates";
import {
  Circuit,
  ClassicalBitProbability,
  ExpandedGate,
  GateOperation,
  SerializedCircuit,
  SerializedGate,
} from "@/lib/types";

export interface ComparisonMetrics {
  gateCount: number;
  depth: number;
  twoQubitGateCount: number;
  twoQubitLayerDepth: number;
  efficiencyScore: number;
}

export const getOperationQubits = (gate: GateOperation) => {
  if (isComponentType(gate.type)) {
    return gate.qubits ?? [gate.target];
  }

  return [gate.target, ...(gate.control !== undefined ? [gate.control] : [])];
};

const touchesQubit = (gate: GateOperation, qubit: number) => getOperationQubits(gate).includes(qubit);

function offsetSerializedGate(gate: SerializedGate, offset: number): SerializedGate {
  return {
    type: gate.type,
    target: gate.target + offset,
    ...(gate.control !== undefined ? { control: gate.control + offset } : {}),
    ...(gate.theta !== undefined ? { theta: gate.theta } : {}),
  };
}

export const expandCircuit = (circuit: Circuit): ExpandedGate[] =>
  circuit.gates
    .slice()
    .sort((left, right) => left.position.x - right.position.x)
    .flatMap((gate) => {
      if (isComponentType(gate.type) && gate.internalCircuit?.length) {
        return gate.internalCircuit.map((innerGate) => ({
          ...offsetSerializedGate(innerGate, gate.target),
          sourceOperationId: gate.id,
        }));
      }

      return [
        {
          type: gate.type as SerializedGate["type"],
          target: gate.target,
          ...(gate.control !== undefined ? { control: gate.control } : {}),
          ...(gate.theta !== undefined ? { theta: gate.theta } : {}),
          sourceOperationId: gate.id,
        },
      ];
    });

export const serializeCircuit = (circuit: Circuit): SerializedCircuit => ({
  qubits: circuit.qubits,
  gates: expandCircuit(circuit).map(({ sourceOperationId: _sourceOperationId, ...gate }) => gate)
});

export const calculateMetrics = (circuit: Circuit): ComparisonMetrics => {
  const sortedGates = expandCircuit(circuit);
  const laneDepths = new Array(circuit.qubits).fill(0);
  let twoQubitGateCount = 0;
  let twoQubitLayerDepth = 0;

  for (const gate of sortedGates) {
    const touched = [gate.target, ...(gate.control !== undefined ? [gate.control] : [])];
    const depth = Math.max(...touched.map((qubit) => laneDepths[qubit])) + 1;
    touched.forEach((qubit) => {
      laneDepths[qubit] = depth;
    });

    if (isTwoQubitGate(gate.type)) {
      twoQubitGateCount += 1;
      twoQubitLayerDepth = Math.max(twoQubitLayerDepth, depth);
    }
  }

  const gateCount = circuit.gates.length;
  const depth = laneDepths.length ? Math.max(...laneDepths) : 0;

  return {
    gateCount,
    depth,
    twoQubitGateCount,
    twoQubitLayerDepth,
    efficiencyScore: Number((depth * 0.6 + gateCount * 0.4).toFixed(2))
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

export const getMeasurementMap = (circuit: Circuit) => {
  const measurements = circuit.gates
    .filter((gate) => isMeasureGate(gate.type))
    .sort((left, right) => left.position.x - right.position.x);

  const map = new Map<number, { classicalBit: number; column: number; gateId: string }>();

  measurements.forEach((gate, index) => {
    const current = map.get(gate.target);
    const column = Math.max(0, Math.round(gate.position.x / 68));

    if (!current || column < current.column) {
      map.set(gate.target, {
        classicalBit: gate.classicalTarget ?? index,
        column,
        gateId: gate.id,
      });
    }
  });

  return map;
};

export const getClassicalBitProbabilities = (
  counts: Record<string, number>,
  classicalBits: number
): ClassicalBitProbability[] => {
  const total = Object.values(counts).reduce((sum, count) => sum + count, 0);

  return Array.from({ length: classicalBits }, (_, classicalBit) => {
    let oneCounts = 0;

    Object.entries(counts).forEach(([state, count]) => {
      const charIndex = state.length - 1 - classicalBit;
      const bit = charIndex >= 0 ? state[charIndex] : "0";
      if (bit === "1") {
        oneCounts += count;
      }
    });

    const oneProbability = total > 0 ? oneCounts / total : 0;

    return {
      classicalBit,
      oneProbability: Number(oneProbability.toFixed(4)),
      zeroProbability: Number((1 - oneProbability).toFixed(4)),
    };
  });
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
