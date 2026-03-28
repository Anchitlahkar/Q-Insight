# main.py

from fastapi import FastAPI, WebSocket, WebSocketDisconnect
from qiskit import QuantumCircuit
from qiskit_aer import AerSimulator
import json

try:
    from api.algorithms import build_algorithm
    from api.compiler import compile_circuit
    from api.hybrid import optimize_variational
except ModuleNotFoundError:
    from algorithms import build_algorithm
    from compiler import compile_circuit
    from hybrid import optimize_variational

app = FastAPI()

simulator = AerSimulator()


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


@app.websocket("/ws")
async def websocket_endpoint(ws: WebSocket):
    await ws.accept()

    try:
        while True:
            data = await ws.receive_text()
            circuit_data = json.loads(data)

            await ws.send_json({
                "type": "status",
                "message": "Circuit received"
            })

            try:
                result = run_simulation(circuit_data)
            except (KeyError, TypeError, ValueError) as exc:
                await ws.send_json({
                    "type": "error",
                    "message": str(exc)
                })
                continue

            await ws.send_json({
                "type": "result",
                "payload": result
            })

    except WebSocketDisconnect:
        print("Client disconnected")


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


def simulate_quantum_circuit(qc):
    qc = qc.copy()
    qubits = qc.num_qubits
    has_measurements = any(instruction.operation.name == "measure" for instruction in qc.data)

    if not has_measurements:
        qc.save_statevector()

    result = simulator.run(qc, shots=1024).result()
    counts = result.get_counts()

    if not has_measurements and qubits <= 8:
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
    qc = build_circuit_from_gates(qubits, gates)
    return simulate_quantum_circuit(qc)


@app.post("/variational/run")
async def variational_run(payload: dict):
    return optimize_variational(payload)
