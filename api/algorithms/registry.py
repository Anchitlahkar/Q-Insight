from __future__ import annotations

from .grover import build_grover
from .oracle import oracle_mark_state
from .qft import build_qft


def build_oracle(params: dict | None = None) -> dict:
    params = params or {}
    target_state = str(params.get("target_state", "11"))
    qubits = len(target_state)
    measure = bool(params.get("measure", True))

    if qubits < 1:
        raise ValueError("Oracle requires a non-empty target_state.")

    gates = oracle_mark_state(target_state)

    if measure:
        gates.extend({"type": "M", "target": qubit} for qubit in range(qubits))

    return {
        "qubits": qubits,
        "gates": gates,
    }


ALGORITHM_BUILDERS = {
    "qft": build_qft,
    "oracle": build_oracle,
    "grover": build_grover,
}


def build_algorithm(name: str, params: dict | None = None) -> dict:
    key = name.lower()
    builder = ALGORITHM_BUILDERS.get(key)

    if builder is None:
        supported = ", ".join(sorted(ALGORITHM_BUILDERS))
        raise ValueError(f"Unsupported algorithm '{name}'. Supported algorithms: {supported}.")

    return builder(params)
