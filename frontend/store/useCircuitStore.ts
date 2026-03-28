// /store/useCircuitStore.ts
// Zustand store for the quantum circuit simulator.
// Unchanged external API - added theta pass-through on addGate/updateGate.

import { create } from "zustand";
import { immer } from "zustand/middleware/immer";
import { isParametricGate, isTwoQubitGate } from "@/lib/gates";
import {
  AlgorithmDefinition,
  Circuit,
  CircuitKey,
  GateOperation,
  SimulationResult,
  SocketStatus,
} from "@/lib/types";

interface CircuitState {
  activeCircuit: CircuitKey;
  circuits: Record<CircuitKey, Circuit>;
  results: Record<CircuitKey, SimulationResult | null>;
  socketStatus: SocketStatus;
  socketError: string | null;
  socket: WebSocket | null;
  isRunning: boolean;
}

interface CircuitActions {
  setActiveCircuit: (key: CircuitKey) => void;
  setQubitCount: (key: CircuitKey, count: number) => void;
  addGate: (key: CircuitKey, gate: GateOperation) => void;
  updateGate: (key: CircuitKey, id: string, patch: Partial<GateOperation>) => void;
  removeGate: (key: CircuitKey, id: string) => void;
  clearCircuit: (key: CircuitKey) => void;
  setResult: (key: CircuitKey, result: SimulationResult) => void;
  clearResult: (key: CircuitKey) => void;
  setSocketStatus: (status: SocketStatus) => void;
  setSocketError: (error: string | null) => void;
  setSocket: (socket: WebSocket | null) => void;
  setIsRunning: (running: boolean) => void;
  loadMockData: () => void;
  loadAlgorithm: (key: CircuitKey, algorithm: AlgorithmDefinition) => void;
}

type CircuitStore = CircuitState & CircuitActions;

const COL_W = 68;
const LANE_H = 84;
const MAX_QUBITS = 6;

const emptyCircuit = (qubits = 3): Circuit => ({ qubits, gates: [] });

const initialState: CircuitState = {
  activeCircuit: "A",
  circuits: {
    A: emptyCircuit(3),
    B: emptyCircuit(3),
  },
  results: { A: null, B: null },
  socketStatus: "disconnected",
  socketError: null,
  socket: null,
  isRunning: false,
};

const MOCK_CIRCUITS: Record<CircuitKey, Circuit> = {
  A: {
    qubits: 3,
    gates: [
      { id: "h-0", type: "H", target: 0, position: { x: 0, y: 0 } },
      { id: "cnot-1", type: "CNOT", target: 1, control: 0, position: { x: 66, y: 82 } },
      { id: "cnot-2", type: "CNOT", target: 2, control: 1, position: { x: 132, y: 164 } },
      { id: "m-0", type: "M", target: 0, position: { x: 264, y: 0 } },
      { id: "m-1", type: "M", target: 1, position: { x: 264, y: 82 } },
      { id: "m-2", type: "M", target: 2, position: { x: 264, y: 164 } },
    ],
  },
  B: {
    qubits: 3,
    gates: [
      { id: "h-b0", type: "H", target: 0, position: { x: 0, y: 0 } },
      { id: "rx-b0", type: "RX", target: 0, theta: Math.PI / 2, position: { x: 66, y: 0 } },
      { id: "ry-b1", type: "RY", target: 1, theta: Math.PI / 4, position: { x: 0, y: 82 } },
      { id: "rz-b2", type: "RZ", target: 2, theta: Math.PI, position: { x: 0, y: 164 } },
      { id: "cz-b1", type: "CZ", target: 1, control: 0, position: { x: 132, y: 82 } },
      { id: "swap-b", type: "SWAP", target: 2, control: 1, position: { x: 198, y: 164 } },
      { id: "m-b0", type: "M", target: 0, position: { x: 264, y: 0 } },
      { id: "m-b1", type: "M", target: 1, position: { x: 264, y: 82 } },
      { id: "m-b2", type: "M", target: 2, position: { x: 264, y: 164 } },
    ],
  },
};

function validateAlgorithm(algorithm: AlgorithmDefinition) {
  if (!Number.isInteger(algorithm.qubits) || algorithm.qubits < 1 || algorithm.qubits > MAX_QUBITS) {
    throw new Error(`Algorithms must declare between 1 and ${MAX_QUBITS} qubits.`);
  }

  algorithm.gates.forEach((gate, index) => {
    const label = `Gate ${index + 1} (${gate.type})`;

    if (!Number.isInteger(gate.target) || gate.target < 0 || gate.target >= algorithm.qubits) {
      throw new Error(`${label}: target must be a valid qubit index.`);
    }

    if (isTwoQubitGate(gate.type)) {
      if (gate.control === undefined) {
        throw new Error(`${label}: controlled/two-qubit gates require a control qubit.`);
      }
      if (!Number.isInteger(gate.control) || gate.control < 0 || gate.control >= algorithm.qubits) {
        throw new Error(`${label}: control must be a valid qubit index.`);
      }
      if (gate.control === gate.target) {
        throw new Error(`${label}: control and target must be different qubits.`);
      }
    }

    if (isParametricGate(gate.type)) {
      if (typeof gate.theta !== "number" || !Number.isFinite(gate.theta)) {
        throw new Error(`${label}: parametric gates require a finite theta value.`);
      }
    }
  });
}

function assignPositions(gates: AlgorithmDefinition["gates"]): GateOperation[] {
  const cursor: Record<number, number> = {};
  const getCursor = (qubit: number) => cursor[qubit] ?? 0;
  const advance = (qubit: number, column: number) => {
    cursor[qubit] = Math.max(getCursor(qubit), column) + 1;
  };

  return gates.map((gate, index) => {
    const touched = gate.control !== undefined ? [gate.target, gate.control] : [gate.target];
    const column = Math.max(...touched.map(getCursor));
    touched.forEach((qubit) => advance(qubit, column));

    return {
      id: `${gate.type.toLowerCase()}-algorithm-${Date.now()}-${index}`,
      type: gate.type,
      target: gate.target,
      ...(gate.control !== undefined ? { control: gate.control } : {}),
      ...(gate.theta !== undefined ? { theta: gate.theta } : {}),
      position: { x: column * COL_W, y: gate.target * LANE_H },
    };
  });
}

export const useCircuitStore = create<CircuitStore>()(
  immer((set) => ({
    ...initialState,

    setActiveCircuit: (key) =>
      set((state) => {
        state.activeCircuit = key;
      }),

    setQubitCount: (key, count) =>
      set((state) => {
        state.circuits[key].qubits = count;
        state.circuits[key].gates = state.circuits[key].gates.filter(
          (gate) => gate.target < count && (gate.control === undefined || gate.control < count)
        );
      }),

    addGate: (key, gate) =>
      set((state) => {
        state.circuits[key].gates.push(gate);
      }),

    updateGate: (key, id, patch) =>
      set((state) => {
        const index = state.circuits[key].gates.findIndex((gate) => gate.id === id);
        if (index !== -1) {
          Object.assign(state.circuits[key].gates[index], patch);
        }
      }),

    removeGate: (key, id) =>
      set((state) => {
        state.circuits[key].gates = state.circuits[key].gates.filter((gate) => gate.id !== id);
      }),

    clearCircuit: (key) =>
      set((state) => {
        state.circuits[key].gates = [];
      }),

    setResult: (key, result) =>
      set((state) => {
        state.results[key] = result;
      }),

    clearResult: (key) =>
      set((state) => {
        state.results[key] = null;
      }),

    setSocketStatus: (status) =>
      set((state) => {
        state.socketStatus = status;
      }),

    setSocketError: (error) =>
      set((state) => {
        state.socketError = error;
      }),

    setSocket: (socket) =>
      set((state) => {
        state.socket = socket;
      }),

    setIsRunning: (running) =>
      set((state) => {
        state.isRunning = running;
      }),

    loadMockData: () =>
      set((state) => {
        state.circuits.A = { ...MOCK_CIRCUITS.A, gates: [...MOCK_CIRCUITS.A.gates] };
        state.circuits.B = { ...MOCK_CIRCUITS.B, gates: [...MOCK_CIRCUITS.B.gates] };
        state.results = { A: null, B: null };
      }),

    loadAlgorithm: (key, algorithm) => {
      validateAlgorithm(algorithm);
      const gates = assignPositions(algorithm.gates);

      set((state) => {
        state.circuits[key] = {
          qubits: algorithm.qubits,
          gates,
        };
        state.results[key] = null;
      });
    },
  }))
);
