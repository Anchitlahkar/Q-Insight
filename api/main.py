# main.py

from fastapi import FastAPI, WebSocket, WebSocketDisconnect
from qiskit import QuantumCircuit
from qiskit_aer import AerSimulator
import json

app = FastAPI()

simulator = AerSimulator()


@app.websocket("/ws")
async def websocket_endpoint(ws: WebSocket):
    await ws.accept()

    try:
        while True:
            data = await ws.receive_text()
            circuit_data = json.loads(data)

            # Send status: received
            await ws.send_json({
                "type": "status",
                "message": "Circuit received"
            })

            result = run_simulation(circuit_data)

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


def run_simulation(data):
    qubits = data["qubits"]
    gates = data["gates"]

    qc = QuantumCircuit(qubits, qubits)

    for gate in gates:
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
            qc.cx(gate["control"], gate["target"])
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
            qc.rx(gate["theta"], gate["target"])
        elif t == "RY":
            qc.ry(gate["theta"], gate["target"])
        elif t == "RZ":
            qc.rz(gate["theta"], gate["target"])
        elif t == "CZ":
            qc.cz(gate["control"], gate["target"])
        elif t == "SWAP":
            qc.swap(gate["control"], gate["target"])

    qc.save_statevector()

    result = simulator.run(qc, shots=1024).result()

    counts = result.get_counts()

    # 🔴 FIX STARTS HERE
    raw_sv = result.get_statevector().data

    if qubits <= 8:
        statevector = serialize_statevector(raw_sv)
    else:
        statevector = None
    # 🔴 FIX ENDS HERE

    return {
        "counts": counts,
        "statevector": statevector,
        "depth": qc.depth(),
        "gate_count": qc.size()
    }
