from __future__ import annotations

from dataclasses import dataclass
from math import isclose, log2
from typing import Any, Mapping

import numpy as np
from qiskit import QuantumCircuit
from qiskit.quantum_info import DensityMatrix, Statevector, partial_trace

try:
    from api.compiler import compile_circuit
except ModuleNotFoundError:
    from compiler import compile_circuit

JsonObject = dict[str, Any]
CompiledGate = dict[str, Any]

MAX_DISPLAY_STATES = 8
AMPLITUDE_EPSILON = 1e-9
ANGLE_EPSILON = 1e-9

SELF_INVERSE_GATES = {"H", "X", "Y", "Z", "CNOT", "CZ", "SWAP"}
ROTATION_GATES = {"RX", "RY", "RZ", "CRX", "CRY", "CRZ"}
INVERSE_GATE_PAIRS = {
    ("S", "SDG"),
    ("SDG", "S"),
    ("T", "TDG"),
    ("TDG", "T"),
}


@dataclass
class AnalysisContext:
    qubits: int
    compiled_gates: list[CompiledGate]
    gate_explanations: list[JsonObject]
    pre_measurement_state: Statevector
    measurement_probabilities: dict[str, float]
    counts: dict[str, int] | None
    has_measurements: bool
    circuit_summary: str
    measurement_insight: str
    optimization_suggestions: list[JsonObject]


def explain_circuit(circuit_json: Mapping[str, Any], counts: dict[str, int] | None = None) -> JsonObject:
    analysis = _analyze_circuit(circuit_json, counts=counts)
    return {
        "gate_explanations": analysis.gate_explanations,
        "circuit_summary": analysis.circuit_summary,
        "measurement_insight": analysis.measurement_insight,
        "comparison": None,
        "optimization_suggestions": analysis.optimization_suggestions,
    }


def compare_circuits(
    circuit_a: Mapping[str, Any],
    circuit_b: Mapping[str, Any],
    counts_a: dict[str, int] | None = None,
    counts_b: dict[str, int] | None = None,
) -> JsonObject:
    analysis_a = _analyze_circuit(circuit_a, counts=counts_a)
    analysis_b = _analyze_circuit(circuit_b, counts=counts_b)

    metrics = {
        "A": _comparison_metrics(analysis_a),
        "B": _comparison_metrics(analysis_b),
    }
    output_similarity = _distribution_similarity(
        analysis_a.measurement_probabilities,
        analysis_b.measurement_probabilities,
    )
    redundancy_penalty_a = _redundancy_penalty(analysis_a.optimization_suggestions)
    redundancy_penalty_b = _redundancy_penalty(analysis_b.optimization_suggestions)

    score_a = _comparison_score(metrics["A"], redundancy_penalty_a, output_similarity)
    score_b = _comparison_score(metrics["B"], redundancy_penalty_b, output_similarity)

    winner = "A" if score_a >= score_b else "B"
    loser = "B" if winner == "A" else "A"
    winner_metrics = metrics[winner]
    loser_metrics = metrics[loser]
    score_gap = round(abs(score_a - score_b), 4)

    reasons: list[str] = []
    if winner_metrics["depth"] != loser_metrics["depth"]:
        reasons.append(
            f"Circuit {winner} has lower depth ({winner_metrics['depth']} vs {loser_metrics['depth']})."
        )
    if winner_metrics["gate_count"] != loser_metrics["gate_count"]:
        reasons.append(
            f"Circuit {winner} uses fewer gates ({winner_metrics['gate_count']} vs {loser_metrics['gate_count']})."
        )
    if winner_metrics["redundancy_penalty"] != loser_metrics["redundancy_penalty"]:
        reasons.append(
            f"Circuit {winner} has less removable structure "
            f"({winner_metrics['redundancy_penalty']} vs {loser_metrics['redundancy_penalty']})."
        )
    reasons.append(f"Output similarity is {output_similarity:.4f}.")

    return {
        "winner": winner,
        "reasoning": " ".join(reasons),
        "metrics": {
            "A": {**winner_safe_metrics(metrics["A"]), "score": float(round(score_a, 4))},
            "B": {**winner_safe_metrics(metrics["B"]), "score": float(round(score_b, 4))},
            "output_similarity": float(round(output_similarity, 4)),
            "score_gap": float(score_gap),
            "scoring": {
                "depth_weight": 0.4,
                "gate_count_weight": 0.25,
                "redundancy_penalty_weight": 0.2,
                "output_similarity_weight": 0.15,
            },
        },
    }


def suggest_optimizations(circuit_json: Mapping[str, Any]) -> list[JsonObject]:
    compiled_gates = _compiled_gates_from_json(circuit_json)
    suggestions: list[JsonObject] = []

    for index, gate in enumerate(compiled_gates):
        gate_type = gate["type"]
        if gate_type == "I":
            suggestions.append({
                "issue": "identity gate",
                "location": f"compiled gate {index}",
                "fix": f"remove identity gate at compiled gate {index}",
            })
        if gate_type in ROTATION_GATES and _theta_from_gate(gate) is not None:
            theta = _theta_from_gate(gate)
            if theta is not None and isclose(_normalize_angle(theta), 0.0, abs_tol=ANGLE_EPSILON):
                suggestions.append({
                    "issue": "zero-angle rotation",
                    "location": f"compiled gate {index}",
                    "fix": f"remove {gate_type} at compiled gate {index} because theta is effectively 0",
                })

    for index in range(len(compiled_gates) - 1):
        first = compiled_gates[index]
        second = compiled_gates[index + 1]
        first_type = first["type"]
        second_type = second["type"]

        if _same_operand_signature(first, second):
            if first_type == second_type and first_type in SELF_INVERSE_GATES:
                suggestions.append({
                    "issue": "redundant gates",
                    "location": f"compiled gates {index}-{index + 1}",
                    "fix": f"remove compiled gates {index} and {index + 1}; {first_type} followed by {second_type} cancels to identity",
                })

            if (first_type, second_type) in INVERSE_GATE_PAIRS:
                suggestions.append({
                    "issue": "inverse gates cancel",
                    "location": f"compiled gates {index}-{index + 1}",
                    "fix": f"remove compiled gates {index} and {index + 1}; {first_type} and {second_type} are inverses",
                })

            if first_type == second_type and first_type in ROTATION_GATES:
                theta_a = _theta_from_gate(first)
                theta_b = _theta_from_gate(second)
                if theta_a is not None and theta_b is not None:
                    merged = _normalize_angle(theta_a + theta_b)
                    if isclose(merged, 0.0, abs_tol=ANGLE_EPSILON):
                        fix = (
                            f"remove compiled gates {index} and {index + 1}; "
                            f"their combined {first_type} rotation is 0"
                        )
                    else:
                        fix = (
                            f"merge compiled gates {index} and {index + 1} into one {first_type} "
                            f"with theta={merged:.6f}"
                        )
                    suggestions.append({
                        "issue": "merge consecutive rotations",
                        "location": f"compiled gates {index}-{index + 1}",
                        "fix": fix,
                    })

    return suggestions


def _analyze_circuit(circuit_json: Mapping[str, Any], counts: dict[str, int] | None = None) -> AnalysisContext:
    qubits = _extract_qubits(circuit_json)
    compiled_gates = _compiled_gates_from_json(circuit_json)
    state = Statevector.from_label("0" * qubits)
    gate_explanations: list[JsonObject] = []
    pre_measurement_state = state
    has_measurements = any(gate["type"] == "M" for gate in compiled_gates)

    for index, gate in enumerate(compiled_gates):
        gate_type = gate["type"]
        before_state = state

        if gate_type == "M":
            target = gate["target"]
            zero_probability, one_probability = _single_qubit_measurement_probabilities(before_state, qubits, target)
            gate_explanations.append({
                "gate": gate_type,
                "target": target,
                "before_state": _format_statevector(before_state),
                "after_state": _format_statevector(before_state),
                "technical": (
                    f"Qubit {target} is measured with P(0)={zero_probability:.4f} and "
                    f"P(1)={one_probability:.4f}; the coherent state shown here is the pre-measurement state."
                ),
                "intuitive": (
                    f"The circuit is now reading qubit {target}. "
                    f"It will report 0 about {zero_probability:.1%} of the time and 1 about {one_probability:.1%}."
                ),
                "effect": (
                    f"Measurement samples qubit {target} from the current amplitude distribution "
                    f"without introducing a single deterministic post-measurement branch."
                ),
            })
            continue

        state = _evolve_state(before_state, qubits, gate)
        pre_measurement_state = state
        gate_explanations.append(_build_gate_explanation(index, gate, before_state, state, qubits))

    measurement_probabilities = _probabilities_from_statevector(pre_measurement_state)
    circuit_summary = _build_circuit_summary(qubits, compiled_gates, pre_measurement_state, measurement_probabilities)
    measurement_insight = _build_measurement_insight(
        compiled_gates,
        pre_measurement_state,
        measurement_probabilities,
        counts,
        has_measurements,
    )

    return AnalysisContext(
        qubits=qubits,
        compiled_gates=compiled_gates,
        gate_explanations=gate_explanations,
        pre_measurement_state=pre_measurement_state,
        measurement_probabilities=measurement_probabilities,
        counts=counts,
        has_measurements=has_measurements,
        circuit_summary=circuit_summary,
        measurement_insight=measurement_insight,
        optimization_suggestions=suggest_optimizations(circuit_json),
    )


def _extract_qubits(circuit_json: Mapping[str, Any]) -> int:
    qubits = circuit_json.get("qubits")
    if not isinstance(qubits, int) or qubits < 1:
        raise ValueError("Circuit JSON must include a positive integer 'qubits' field")
    return qubits


def _compiled_gates_from_json(circuit_json: Mapping[str, Any]) -> list[CompiledGate]:
    gates = circuit_json.get("gates")
    if not isinstance(gates, list):
        raise ValueError("Circuit JSON must include a 'gates' list")
    return compile_circuit(gates)


def _build_gate_explanation(
    gate_index: int,
    gate: CompiledGate,
    before_state: Statevector,
    after_state: Statevector,
    qubits: int,
) -> JsonObject:
    gate_type = gate["type"]
    target = gate.get("target")
    before_summary = _dominant_basis_summary(before_state)
    after_summary = _dominant_basis_summary(after_state)
    moved_basis_states = _moved_basis_states(before_state, after_state)
    transition_text = ", ".join(moved_basis_states[:3]) if moved_basis_states else "no amplitude change"

    technical_parts = [
        f"Before gate {gate_index}, the state is {before_summary}.",
        f"After applying {gate_type}, it becomes {after_summary}.",
    ]
    if gate_type in {"RX", "RY", "RZ", "CRX", "CRY", "CRZ"} and "theta" in gate:
        technical_parts.append(f"The applied angle is {float(gate['theta']):.6f} radians.")
    if "control" in gate:
        technical_parts.append(
            f"Control-target action uses control qubit {gate['control']} and target qubit {gate['target']}."
        )
    if moved_basis_states:
        technical_parts.append(f"Amplitude moved across {transition_text}.")

    intuitive = _build_intuitive_gate_effect(gate, before_state, after_state, qubits)

    return {
        "gate": gate_type,
        "target": target,
        "control": gate.get("control"),
        "before_state": _format_statevector(before_state),
        "after_state": _format_statevector(after_state),
        "technical": " ".join(technical_parts),
        "intuitive": intuitive,
        "effect": f"state changed from {before_summary} -> {after_summary}",
    }


def _build_intuitive_gate_effect(
    gate: CompiledGate,
    before_state: Statevector,
    after_state: Statevector,
    qubits: int,
) -> str:
    gate_type = gate["type"]
    before_probs = _single_qubit_populations(before_state, qubits, gate.get("target"))
    after_probs = _single_qubit_populations(after_state, qubits, gate.get("target"))

    if gate_type == "H":
        return (
            f"Qubit {gate['target']} was driving {before_probs} and now spreads its weight across "
            f"{after_probs}, creating interference-ready branches visible in the amplitudes."
        )
    if gate_type in {"X", "Y", "Z"}:
        return (
            f"Qubit {gate['target']} changed from {before_probs} to {after_probs}; "
            f"the updated amplitudes show exactly which basis components were flipped or phase-shifted."
        )
    if gate_type in {"CNOT", "CZ", "CRX", "CRY", "CRZ"}:
        return (
            f"Only the branches where control qubit {gate['control']} is 1 were altered. "
            f"That conditional change reshaped the joint amplitudes into { _dominant_basis_summary(after_state) }."
        )
    if gate_type in {"RX", "RY", "RZ"}:
        return (
            f"Qubit {gate['target']} rotated from {before_probs} to {after_probs}; "
            f"the state update is the exact rotation outcome for theta={float(gate['theta']):.6f}."
        )
    if gate_type == "I":
        return "The identity gate leaves every amplitude untouched, so the state is unchanged."
    return (
        f"The gate transformed the dominant support from {_dominant_basis_summary(before_state)} "
        f"to {_dominant_basis_summary(after_state)}."
    )


def _build_circuit_summary(
    qubits: int,
    compiled_gates: list[CompiledGate],
    state: Statevector,
    measurement_probabilities: dict[str, float],
) -> str:
    superposition = len([prob for prob in measurement_probabilities.values() if prob > AMPLITUDE_EPSILON]) > 1
    entangled_pairs = _entangled_pairs(qubits, state)
    top_states = _top_probability_states(measurement_probabilities, top_n=3)
    top_state_text = ", ".join(f"{state_label} ({prob:.2%})" for state_label, prob in top_states)

    summary_parts: list[str] = []
    if superposition:
        summary_parts.append(
            f"The circuit ends in superposition with observable support on {len(measurement_probabilities)} basis states."
        )
    else:
        summary_parts.append("The circuit stays in a single basis state without measurable branching.")

    if entangled_pairs:
        pair_text = ", ".join(f"q{left}-q{right}" for left, right in entangled_pairs)
        summary_parts.append(
            f"Entanglement is present across {pair_text}; the reduced single-qubit states are mixed even though the joint state is pure."
        )
    else:
        summary_parts.append("No entangled qubit pair was detected from the final coherent state.")

    if top_state_text:
        summary_parts.append(f"The measurement distribution is concentrated on {top_state_text}.")

    if any(gate["type"] in {"CNOT", "CZ", "CRX", "CRY", "CRZ"} for gate in compiled_gates):
        summary_parts.append("Controlled operations are what turn single-qubit structure into joint-qubit correlations here.")

    return " ".join(summary_parts)


def _build_measurement_insight(
    compiled_gates: list[CompiledGate],
    state: Statevector,
    measurement_probabilities: dict[str, float],
    counts: dict[str, int] | None,
    has_measurements: bool,
) -> str:
    top_states = _top_probability_states(measurement_probabilities, top_n=3)
    if not top_states:
        return "No non-zero measurement probabilities were found."

    state_descriptions = ", ".join(f"{label} ({prob:.2%})" for label, prob in top_states)
    gate_story = _gate_story(compiled_gates)

    if counts and has_measurements:
        total_counts = max(sum(counts.values()), 1)
        observed = sorted(counts.items(), key=lambda item: (-item[1], item[0]))[:3]
        observed_text = ", ".join(
            f"{label} ({value / total_counts:.2%}, {value} counts)" for label, value in observed
        )
        return (
            f"The dominant exact outcomes are {state_descriptions}. "
            f"The shot-based results align as {observed_text}. {gate_story}"
        )

    return f"The dominant exact outcomes are {state_descriptions}. {gate_story}"


def _gate_story(compiled_gates: list[CompiledGate]) -> str:
    if not compiled_gates:
        return "No gates were applied."

    gate_names = [gate["type"] for gate in compiled_gates]
    if gate_names[:2] == ["H", "CNOT"]:
        return "An H gate first creates equal amplitude branches, and the following CNOT ties those branches together into correlated measurement outcomes."

    if "CNOT" in gate_names:
        return "The output pattern is shaped by a superposition-building stage followed by a CNOT that conditionally redirects amplitude between basis states."
    if "CZ" in gate_names:
        return "The output pattern is shaped by a superposition-building stage followed by a CZ that changes relative phase, which then affects interference."
    if any(gate in gate_names for gate in ("RX", "RY", "RZ", "CRX", "CRY", "CRZ")):
        return "The dominant states reflect the exact rotation angles applied, which determine how much amplitude remains in each basis branch."
    return "The dominant states are the ones that retained the most amplitude after the applied gate sequence."


def _comparison_metrics(analysis: AnalysisContext) -> JsonObject:
    non_zero_states = len([prob for prob in analysis.measurement_probabilities.values() if prob > AMPLITUDE_EPSILON])
    redundancy_penalty = _redundancy_penalty(analysis.optimization_suggestions)
    return {
        "depth": _estimated_depth(analysis.qubits, analysis.compiled_gates),
        "gate_count": len(analysis.compiled_gates),
        "redundancy_penalty": redundancy_penalty,
        "non_zero_states": non_zero_states,
    }


def _estimated_depth(qubits: int, gates: list[CompiledGate]) -> int:
    lane_depths = [0] * qubits
    for gate in gates:
        touched = [gate["target"]]
        if "control" in gate:
            touched.append(gate["control"])
        depth = max(lane_depths[qubit] for qubit in touched) + 1
        for qubit in touched:
            lane_depths[qubit] = depth
    return max(lane_depths, default=0)


def _comparison_score(metrics: JsonObject, redundancy_penalty: int, output_similarity: float) -> float:
    depth_score = 1.0 / (1.0 + float(metrics["depth"]))
    gate_score = 1.0 / (1.0 + float(metrics["gate_count"]))
    redundancy_score = 1.0 / (1.0 + redundancy_penalty)
    return (
        0.4 * depth_score
        + 0.25 * gate_score
        + 0.2 * redundancy_score
        + 0.15 * output_similarity
    )


def winner_safe_metrics(metrics: JsonObject) -> JsonObject:
    return {
        "depth": int(metrics["depth"]),
        "gate_count": int(metrics["gate_count"]),
        "redundancy_penalty": int(metrics["redundancy_penalty"]),
        "non_zero_states": int(metrics["non_zero_states"]),
    }


def _redundancy_penalty(suggestions: list[JsonObject]) -> int:
    return sum(1 for suggestion in suggestions if suggestion["issue"] != "identity gate")


def _distribution_similarity(distribution_a: dict[str, float], distribution_b: dict[str, float]) -> float:
    all_states = sorted(set(distribution_a) | set(distribution_b))
    return float(
        sum(np.sqrt(distribution_a.get(state, 0.0) * distribution_b.get(state, 0.0)) for state in all_states)
    )


def _evolve_state(state: Statevector, qubits: int, gate: CompiledGate) -> Statevector:
    qc = QuantumCircuit(qubits)
    _apply_gate_to_circuit(qc, gate)
    return state.evolve(qc)


def _apply_gate_to_circuit(qc: QuantumCircuit, gate: CompiledGate) -> None:
    gate_type = gate["type"]

    if gate_type == "H":
        qc.h(gate["target"])
    elif gate_type == "X":
        qc.x(gate["target"])
    elif gate_type == "Y":
        qc.y(gate["target"])
    elif gate_type == "Z":
        qc.z(gate["target"])
    elif gate_type == "CNOT":
        qc.cx(gate["control"], gate["target"])
    elif gate_type == "S":
        qc.s(gate["target"])
    elif gate_type == "SDG":
        qc.sdg(gate["target"])
    elif gate_type == "T":
        qc.t(gate["target"])
    elif gate_type == "TDG":
        qc.tdg(gate["target"])
    elif gate_type == "RX":
        qc.rx(float(gate["theta"]), gate["target"])
    elif gate_type == "RY":
        qc.ry(float(gate["theta"]), gate["target"])
    elif gate_type == "RZ":
        qc.rz(float(gate["theta"]), gate["target"])
    elif gate_type == "CZ":
        qc.cz(gate["control"], gate["target"])
    elif gate_type == "SWAP":
        qc.swap(gate["control"], gate["target"])
    elif gate_type == "CRX":
        qc.crx(float(gate["theta"]), gate["control"], gate["target"])
    elif gate_type == "CRY":
        qc.cry(float(gate["theta"]), gate["control"], gate["target"])
    elif gate_type == "CRZ":
        qc.crz(float(gate["theta"]), gate["control"], gate["target"])
    elif gate_type == "I":
        qc.id(gate["target"])
    elif gate_type == "M":
        return
    else:
        raise ValueError(f"Unsupported gate type: {gate_type}")


def _format_statevector(state: Statevector) -> str:
    parts: list[str] = []
    for index, amplitude in enumerate(state.data):
        if abs(amplitude) <= AMPLITUDE_EPSILON:
            continue
        bitstring = format(index, f"0{state.num_qubits}b")
        parts.append(f"{_format_complex(amplitude)}|{bitstring}>")
        if len(parts) >= MAX_DISPLAY_STATES:
            break

    if not parts:
        return "0"

    hidden_states = len([amp for amp in state.data if abs(amp) > AMPLITUDE_EPSILON]) - len(parts)
    if hidden_states > 0:
        parts.append(f"... (+{hidden_states} more)")
    return " + ".join(parts)


def _format_complex(value: complex) -> str:
    real = 0.0 if isclose(value.real, 0.0, abs_tol=AMPLITUDE_EPSILON) else value.real
    imag = 0.0 if isclose(value.imag, 0.0, abs_tol=AMPLITUDE_EPSILON) else value.imag

    if imag == 0.0:
        return f"{real:.3f}"
    if real == 0.0:
        return f"{imag:.3f}i"
    sign = "+" if imag >= 0 else "-"
    return f"{real:.3f}{sign}{abs(imag):.3f}i"


def _dominant_basis_summary(state: Statevector) -> str:
    ranked = sorted(
        (
            (format(index, f"0{state.num_qubits}b"), amplitude, abs(amplitude) ** 2)
            for index, amplitude in enumerate(state.data)
            if abs(amplitude) > AMPLITUDE_EPSILON
        ),
        key=lambda item: (-item[2], item[0]),
    )
    if not ranked:
        return "0"
    top = ranked[:3]
    return ", ".join(f"|{label}>:{_format_complex(amplitude)}" for label, amplitude, _ in top)


def _moved_basis_states(before_state: Statevector, after_state: Statevector) -> list[str]:
    changed: list[str] = []
    for index, (before_amp, after_amp) in enumerate(zip(before_state.data, after_state.data)):
        if abs(before_amp - after_amp) <= AMPLITUDE_EPSILON:
            continue
        bitstring = format(index, f"0{before_state.num_qubits}b")
        changed.append(f"|{bitstring}> ({_format_complex(before_amp)} -> {_format_complex(after_amp)})")
    return changed


def _single_qubit_measurement_probabilities(state: Statevector, qubits: int, target: int) -> tuple[float, float]:
    zero_probability = 0.0
    one_probability = 0.0

    for index, amplitude in enumerate(state.data):
        bit = (index >> target) & 1
        probability = abs(amplitude) ** 2
        if bit == 0:
            zero_probability += probability
        else:
            one_probability += probability

    return zero_probability, one_probability


def _single_qubit_populations(state: Statevector, qubits: int, target: int | None) -> str:
    if target is None:
        return "global amplitudes"
    zero_probability, one_probability = _single_qubit_measurement_probabilities(state, qubits, target)
    return f"q{target}: 0->{zero_probability:.2%}, 1->{one_probability:.2%}"


def _probabilities_from_statevector(state: Statevector) -> dict[str, float]:
    probabilities: dict[str, float] = {}
    for index, amplitude in enumerate(state.data):
        probability = abs(amplitude) ** 2
        if probability <= AMPLITUDE_EPSILON:
            continue
        bitstring = format(index, f"0{state.num_qubits}b")
        probabilities[bitstring] = float(probability)
    return probabilities


def _top_probability_states(probabilities: dict[str, float], top_n: int) -> list[tuple[str, float]]:
    return sorted(probabilities.items(), key=lambda item: (-item[1], item[0]))[:top_n]


def _entangled_pairs(qubits: int, state: Statevector) -> list[tuple[int, int]]:
    if qubits < 2:
        return []

    density = DensityMatrix(state)
    entangled: list[tuple[int, int]] = []

    for left in range(qubits):
        for right in range(left + 1, qubits):
            left_state = partial_trace(density, [index for index in range(qubits) if index != left])
            right_state = partial_trace(density, [index for index in range(qubits) if index != right])
            left_entropy = _von_neumann_entropy(left_state.data)
            right_entropy = _von_neumann_entropy(right_state.data)
            if left_entropy > 1e-6 and right_entropy > 1e-6:
                entangled.append((left, right))

    return entangled


def _same_operand_signature(first: CompiledGate, second: CompiledGate) -> bool:
    return (
        first.get("target") == second.get("target")
        and first.get("control") == second.get("control")
    )


def _theta_from_gate(gate: CompiledGate) -> float | None:
    theta = gate.get("theta")
    if isinstance(theta, (int, float)):
        return float(theta)
    return None


def _normalize_angle(theta: float) -> float:
    wrapped = (theta + np.pi) % (2 * np.pi) - np.pi
    if isclose(wrapped, -np.pi, abs_tol=ANGLE_EPSILON):
        return np.pi
    return float(wrapped)


def _von_neumann_entropy(matrix: np.ndarray) -> float:
    eigenvalues = np.real_if_close(np.linalg.eigvals(matrix))
    eigenvalues = np.clip(eigenvalues, 0.0, 1.0)
    return float(-sum(value * log2(value) for value in eigenvalues if value > AMPLITUDE_EPSILON))
