from __future__ import annotations

import math

from qiskit import QuantumCircuit
from qiskit_aer import AerSimulator


def build_param_circuit(theta: float, qubits: int = 1) -> QuantumCircuit:
    if qubits < 1:
        raise ValueError("Variational circuits require at least one qubit.")

    qc = QuantumCircuit(qubits, qubits)

    for qubit in range(qubits):
        qc.ry(theta, qubit)

    if qubits >= 2:
        for qubit in range(qubits - 1):
            qc.cx(qubit, qubit + 1)

    qc.measure(range(qubits), range(qubits))
    return qc


def cost_function(counts: dict[str, int]) -> float:
    total = sum(counts.values())
    if total == 0:
        return 1.0

    zero_state = "0" * max((len(state) for state in counts), default=1)
    return 1.0 - (counts.get(zero_state, 0) / total)


def run_variational(theta: float, qubits: int = 1, shots: int = 1024) -> dict:
    qc = build_param_circuit(theta, qubits=qubits)
    simulator = AerSimulator()
    result = simulator.run(qc, shots=shots).result()
    counts = result.get_counts()
    cost = cost_function(counts)

    return {
        "theta": theta,
        "counts": counts,
        "cost": cost,
        "depth": qc.depth(),
        "gate_count": qc.size(),
    }


def optimize_variational(params: dict | None = None) -> dict:
    params = params or {}
    qubits = int(params.get("qubits", 1))
    iterations = int(params.get("iterations", 8))
    start = float(params.get("start", 0.0))
    stop = float(params.get("stop", 2 * math.pi))

    if iterations < 1:
        raise ValueError("Variational optimization requires at least one iteration.")

    if iterations == 1:
        thetas = [start]
    else:
        step = (stop - start) / (iterations - 1)
        thetas = [start + step * index for index in range(iterations)]

    history = [run_variational(theta, qubits=qubits) for theta in thetas]
    best = min(history, key=lambda item: item["cost"])

    return {
        "best": best,
        "history": history,
    }
