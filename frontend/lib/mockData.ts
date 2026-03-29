import { Circuit, SimulationResult } from "@/lib/types";

export const mockCircuits: Record<"A" | "B", Circuit> = {
  A: {
    qubits: 2,
    gates: [
      { id: "a-h-1", type: "H", target: 0, position: { x: 180, y: 28 } },
      { id: "a-cnot-1", type: "CNOT", target: 1, control: 0, position: { x: 360, y: 120 } },
      { id: "a-measure-1", type: "M", target: 0, position: { x: 540, y: 28 } },
      { id: "a-measure-2", type: "M", target: 1, position: { x: 720, y: 120 } }
    ]
  },
  B: {
    qubits: 2,
    gates: [
      { id: "b-x-1", type: "X", target: 1, position: { x: 180, y: 120 } },
      { id: "b-h-1", type: "H", target: 0, position: { x: 360, y: 28 } },
      { id: "b-measure-1", type: "M", target: 0, position: { x: 540, y: 28 } },
      { id: "b-measure-2", type: "M", target: 1, position: { x: 720, y: 120 } }
    ]
  }
};

export const mockResults: Record<"A" | "B", SimulationResult> = {
  A: {
    counts: { "00": 512, "11": 512 },
    statevector: [
      { real: 0.7071, imag: 0 },
      { real: 0, imag: 0 },
      { real: 0, imag: 0 },
      { real: 0.7071, imag: 0 }
    ]
  },
  B: {
    counts: { "01": 495, "11": 529 },
    statevector: [
      { real: 0, imag: 0 },
      { real: 0.6999, imag: 0 },
      { real: 0, imag: 0 },
      { real: 0.7142, imag: 0 }
    ]
  }
};
