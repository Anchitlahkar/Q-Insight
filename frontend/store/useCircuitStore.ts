// ─────────────────────────────────────────────────────────────────────────────
// /store/useCircuitStore.ts
// Zustand store for the quantum circuit simulator.
// Unchanged external API — added theta pass-through on addGate/updateGate.
// ─────────────────────────────────────────────────────────────────────────────

import { create } from "zustand";
import { immer } from "zustand/middleware/immer";
import {
  Circuit,
  CircuitKey,
  GateOperation,
  SimulationResult,
  SocketStatus,
} from "@/lib/types";

// ── State shape ───────────────────────────────────────────────────────────────
interface CircuitState {
  activeCircuit: CircuitKey;
  circuits: Record<CircuitKey, Circuit>;
  results: Record<CircuitKey, SimulationResult | null>;

  // WebSocket meta (owned by store so downstream components can be reactive)
  socketStatus: SocketStatus;
  socketError: string | null;
  isRunning: boolean;
}

// ── Action shape ──────────────────────────────────────────────────────────────
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
  setIsRunning: (running: boolean) => void;
  loadMockData: () => void;
}

type CircuitStore = CircuitState & CircuitActions;

// ── Initial circuit factory ───────────────────────────────────────────────────
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
  isRunning: false,
};

// ── Mock data (demonstrates rotation gate in JSON) ────────────────────────────
const MOCK_CIRCUITS: Record<CircuitKey, Circuit> = {
  A: {
    qubits: 3,
    gates: [
      { id: "h-0",    type: "H",    target: 0, position: { x: 0,   y: 0   } },
      { id: "cnot-1", type: "CNOT", target: 1, control: 0, position: { x: 66,  y: 82  } },
      { id: "cnot-2", type: "CNOT", target: 2, control: 1, position: { x: 132, y: 164 } },
      { id: "m-0",    type: "M",    target: 0, position: { x: 264, y: 0   } },
      { id: "m-1",    type: "M",    target: 1, position: { x: 264, y: 82  } },
      { id: "m-2",    type: "M",    target: 2, position: { x: 264, y: 164 } },
    ],
  },
  B: {
    qubits: 3,
    gates: [
      { id: "h-b0",   type: "H",    target: 0, position: { x: 0,   y: 0   } },
      { id: "rx-b0",  type: "RX",   target: 0, theta: Math.PI / 2, position: { x: 66,  y: 0   } },
      { id: "ry-b1",  type: "RY",   target: 1, theta: Math.PI / 4, position: { x: 0,   y: 82  } },
      { id: "rz-b2",  type: "RZ",   target: 2, theta: Math.PI,     position: { x: 0,   y: 164 } },
      { id: "cz-b1",  type: "CZ",   target: 1, control: 0, position: { x: 132, y: 82  } },
      { id: "swap-b", type: "SWAP", target: 2, control: 1, position: { x: 198, y: 164 } },
      { id: "m-b0",   type: "M",    target: 0, position: { x: 264, y: 0   } },
      { id: "m-b1",   type: "M",    target: 1, position: { x: 264, y: 82  } },
      { id: "m-b2",   type: "M",    target: 2, position: { x: 264, y: 164 } },
    ],
  },
};

// ── Store ─────────────────────────────────────────────────────────────────────
export const useCircuitStore = create<CircuitStore>()(
  immer((set) => ({
    ...initialState,

    setActiveCircuit: (key) =>
      set((s) => { s.activeCircuit = key; }),

    setQubitCount: (key, count) =>
      set((s) => {
        s.circuits[key].qubits = count;
        // Remove any gates on qubits that no longer exist
        s.circuits[key].gates = s.circuits[key].gates.filter(
          (g) =>
            g.target < count &&
            (g.control === undefined || g.control < count)
        );
      }),

    addGate: (key, gate) =>
      set((s) => {
        s.circuits[key].gates.push(gate);
      }),

    updateGate: (key, id, patch) =>
      set((s) => {
        const idx = s.circuits[key].gates.findIndex((g) => g.id === id);
        if (idx !== -1) {
          Object.assign(s.circuits[key].gates[idx], patch);
        }
      }),

    removeGate: (key, id) =>
      set((s) => {
        s.circuits[key].gates = s.circuits[key].gates.filter((g) => g.id !== id);
      }),

    clearCircuit: (key) =>
      set((s) => {
        s.circuits[key].gates = [];
      }),

    setResult: (key, result) =>
      set((s) => { s.results[key] = result; }),

    clearResult: (key) =>
      set((s) => { s.results[key] = null; }),

    setSocketStatus: (status) =>
      set((s) => { s.socketStatus = status; }),

    setSocketError: (error) =>
      set((s) => { s.socketError = error; }),

    setIsRunning: (running) =>
      set((s) => { s.isRunning = running; }),

    loadMockData: () =>
      set((s) => {
        s.circuits.A = { ...MOCK_CIRCUITS.A, gates: [...MOCK_CIRCUITS.A.gates] };
        s.circuits.B = { ...MOCK_CIRCUITS.B, gates: [...MOCK_CIRCUITS.B.gates] };
        s.results = { A: null, B: null };
      }),
  }))
);
