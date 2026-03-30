# main.py

from json import JSONDecodeError
import json

from fastapi import FastAPI, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
from qiskit import QuantumCircuit
from qiskit_aer import AerSimulator

try:
    from api.algorithms import build_algorithm
    from api.compiler import compile_circuit
    from api.hybrid import optimize_variational
except ModuleNotFoundError:
    from algorithms import build_algorithm
    from compiler import compile_circuit
    from hybrid import optimize_variational

app = FastAPI()

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # replace with frontend URL later
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

simulator = AerSimulator()
MAX_STATEVECTOR_QUBITS = 8


def require_fields(gate, gate_type, *fields):
    missing = [field for field in fields if field not in gate]
    if missing:
        joined = ", ".join(missing)
        raise ValueError(f"{gate_type} gate is missing required field(s): {joined}")


def require_theta(gate, gate_type):
    require_fields(gate, gate_type, "theta")
    theta = gate["theta"]
    if not isinstance(theta, (int, float)):
        raise ValueError(f"{gate_type} gate requires a numeric theta value")
    return theta


def require_control_target(gate, gate_type):
    require_fields(gate, gate_type, "control", "target")
    control = gate["control"]
    target = gate["target"]
    if not isinstance(control, int) or not isinstance(target, int):
        raise ValueError(f"{gate_type} gate requires integer control and target indices")
    if control == target:
        raise ValueError(f"{gate_type} gate requires different control and target qubits")
    return control, target


def parse_request_payload(raw_message):
    try:
        payload = json.loads(raw_message)
    except JSONDecodeError as exc:
        raise ValueError("Request body must be valid JSON") from exc

    if not isinstance(payload, dict):
        raise ValueError("Request body must be a JSON object")

    return payload


@app.websocket("/ws")
async def websocket_endpoint(ws: WebSocket):
    await ws.accept()

    try:
        while True:
            data = await ws.receive_text()

            try:
                circuit_data = parse_request_payload(data)

                await ws.send_json({
                    "type": "status",
                    "message": "Circuit received"
                })

                result = run_simulation(circuit_data)
            except (JSONDecodeError, KeyError, TypeError, ValueError) as exc:
                await ws.send_json({
                    "type": "error",
                    "message": str(exc)
                })
                continue
            except Exception:
                await ws.send_json({
                    "type": "error",
                    "message": "Internal server error"
                })
                continue

            await ws.send_json({
                "type": "result",
                "payload": result
            })

    except WebSocketDisconnect:
        return


def serialize_statevector(statevector):
    return [
        {"real": float(c.real), "imag": float(c.imag)}
        for c in statevector
    ]


def apply_gate(qc, gate):
    t = gate["type"]

    if t == "H":
        qc.h(gate["target"])
    elif t == "X":
        qc.x(gate["target"])
    elif t == "Y":
        qc.y(gate["target"])
    elif t == "Z":
        qc.z(gate["target"])
    elif t == "CNOT":
        control, target = require_control_target(gate, t)
        qc.cx(control, target)
    elif t == "M":
        qc.measure(gate["target"], gate["target"])
    elif t == "S":
        qc.s(gate["target"])
    elif t == "SDG":
        qc.sdg(gate["target"])
    elif t == "T":
        qc.t(gate["target"])
    elif t == "TDG":
        qc.tdg(gate["target"])
    elif t == "RX":
        qc.rx(require_theta(gate, t), gate["target"])
    elif t == "RY":
        qc.ry(require_theta(gate, t), gate["target"])
    elif t == "RZ":
        qc.rz(require_theta(gate, t), gate["target"])
    elif t == "CZ":
        control, target = require_control_target(gate, t)
        qc.cz(control, target)
    elif t == "SWAP":
        control, target = require_control_target(gate, t)
        qc.swap(control, target)
    elif t == "CRX":
        control, target = require_control_target(gate, t)
        qc.crx(require_theta(gate, t), control, target)
    elif t == "CRY":
        control, target = require_control_target(gate, t)
        qc.cry(require_theta(gate, t), control, target)
    elif t == "CRZ":
        control, target = require_control_target(gate, t)
        qc.crz(require_theta(gate, t), control, target)
    elif t == "I":
        qc.id(gate["target"])
    else:
        raise ValueError(f"Unsupported gate type: {t}")


def maybe_capture_statevector(qc):
    qc = qc.copy()

    if qc.num_qubits > MAX_STATEVECTOR_QUBITS:
        return None

    qc.save_statevector()

    try:
        result = simulator.run(qc, shots=1).result()
        raw_sv = result.get_statevector().data
    except Exception:
        return None

    return serialize_statevector(raw_sv)



def simulate_quantum_circuit(qc):
    qc = qc.copy()
    qubits = qc.num_qubits
    has_measurements = any(instruction.operation.name == "measure" for instruction in qc.data)

    if not has_measurements:
        qc.save_statevector()

    result = simulator.run(qc, shots=1024).result()
    counts = result.get_counts()

    if not has_measurements and qubits <= MAX_STATEVECTOR_QUBITS:
        raw_sv = result.get_statevector().data
        statevector = serialize_statevector(raw_sv)
    else:
        statevector = None

    return {
        "counts": counts,
        "statevector": statevector,
        "depth": qc.depth(),
        "gate_count": qc.size()
    }



def build_circuit_from_gates(qubits, gates):
    qc = QuantumCircuit(qubits, qubits)
    compiled_gates = compile_circuit(gates)

    for gate in compiled_gates:
        apply_gate(qc, gate)

    return qc



def simulate_stepwise_circuit(qubits, gates):
    compiled_gates = compile_circuit(gates)
    steps = []

    for index, _gate in enumerate(compiled_gates):
        qc_step = QuantumCircuit(qubits, qubits)
        for prefix_gate in compiled_gates[: index + 1]:
            apply_gate(qc_step, prefix_gate)

        steps.append({
            "gate_index": index,
            "gate_type": compiled_gates[index]["type"],
            "statevector": maybe_capture_statevector(qc_step),
        })

    final_result = simulate_quantum_circuit(build_circuit_from_gates(qubits, gates))
    final_result["steps"] = steps
    return final_result



def run_simulation(data):
    mode = data.get("mode", "circuit")

    if mode == "algorithm":
        algorithm = data["algorithm"]
        params = data.get("params", {})
        algorithm_circuit = build_algorithm(algorithm, params)
        qc = build_circuit_from_gates(algorithm_circuit["qubits"], algorithm_circuit["gates"])
        return simulate_quantum_circuit(qc)

    qubits = data["qubits"]
    gates = data["gates"]

    if mode == "step_simulation":
        return simulate_stepwise_circuit(qubits, gates)

    qc = build_circuit_from_gates(qubits, gates)
    return simulate_quantum_circuit(qc)


@app.post("/variational/run")
async def variational_run(payload: dict):
    return optimize_variational(payload)

