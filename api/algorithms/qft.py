from __future__ import annotations

import math


def build_qft(params: dict | None = None) -> dict:
    params = params or {}
    qubits = int(params.get("qubits", 3))
    measure = bool(params.get("measure", True))

    if qubits < 1:
        raise ValueError("QFT requires at least one qubit.")

    gates: list[dict] = []

    for i in range(qubits):
        gates.append({"type": "H", "target": i})
        for j in range(i + 1, qubits):
            gates.append({
                "type": "CRZ",
                "control": j,
                "target": i,
                "theta": math.pi / (2 ** (j - i)),
            })

    for i in range(qubits // 2):
        gates.append({"type": "SWAP", "control": i, "target": qubits - i - 1})

    if measure:
        gates.extend({"type": "M", "target": qubit} for qubit in range(qubits))

    return {
        "qubits": qubits,
        "gates": gates,
    }
