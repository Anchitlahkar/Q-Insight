from __future__ import annotations

from copy import deepcopy


def compile_circuit(gates: list[dict]) -> list[dict]:
    compiled: list[dict] = []

    for original_gate in gates:
        gate = deepcopy(original_gate)
        gate_type = gate.get("type")

        if gate_type == "SWAP":
            a = gate["control"]
            b = gate["target"]
            compiled.extend(
                [
                    {"type": "CNOT", "control": a, "target": b},
                    {"type": "CNOT", "control": b, "target": a},
                    {"type": "CNOT", "control": a, "target": b},
                ]
            )
        else:
            compiled.append(gate)

    return compiled
