from __future__ import annotations

from .oracle import oracle_mark_state


def diffusion(qubits: list[int]) -> list[dict]:
    gates: list[dict] = []

    for qubit in qubits:
        gates.append({"type": "H", "target": qubit})
    for qubit in qubits:
        gates.append({"type": "X", "target": qubit})

    if len(qubits) == 1:
        gates.append({"type": "Z", "target": qubits[0]})
    elif len(qubits) == 2:
        gates.append({"type": "CZ", "control": qubits[0], "target": qubits[1]})
    else:
        raise ValueError("The current gate-model Grover diffusion only supports 1 or 2 qubits.")

    for qubit in qubits:
        gates.append({"type": "X", "target": qubit})
    for qubit in qubits:
        gates.append({"type": "H", "target": qubit})

    return gates


def build_grover(params: dict | None = None) -> dict:
    params = params or {}
    target_state = str(params.get("target_state", "11"))
    iterations = int(params.get("iterations", 1))
    measure = bool(params.get("measure", True))
    qubits = len(target_state)

    if qubits < 1:
        raise ValueError("Grover requires a non-empty target_state.")
    if iterations < 1:
        raise ValueError("Grover requires at least one iteration.")

    working_qubits = list(range(qubits))
    gates: list[dict] = [{"type": "H", "target": qubit} for qubit in working_qubits]

    for _ in range(iterations):
        gates.extend(oracle_mark_state(target_state))
        gates.extend(diffusion(working_qubits))

    if measure:
        gates.extend({"type": "M", "target": qubit} for qubit in working_qubits)

    return {
        "qubits": qubits,
        "gates": gates,
    }
