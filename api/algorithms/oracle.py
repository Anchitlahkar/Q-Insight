from __future__ import annotations


def oracle_mark_state(target_state: str) -> list[dict]:
    num_qubits = len(target_state)

    if num_qubits == 0:
        raise ValueError("Oracle target_state cannot be empty.")
    if any(bit not in {"0", "1"} for bit in target_state):
        raise ValueError("Oracle target_state must be a bitstring like '11' or '101'.")
    if num_qubits > 2:
        raise ValueError("The current gate-model oracle only supports 1 or 2 qubits.")

    gates: list[dict] = []
    flipped_qubits: list[int] = []

    for index, bit in enumerate(target_state):
        if bit == "0":
            gates.append({"type": "X", "target": index})
            flipped_qubits.append(index)

    if num_qubits == 1:
        gates.append({"type": "Z", "target": 0})
    else:
        gates.append({"type": "CZ", "control": 0, "target": 1})

    for index in reversed(flipped_qubits):
        gates.append({"type": "X", "target": index})

    return gates
