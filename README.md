# QHack Quantum Lab

Quantum Lab is a full-stack quantum circuit simulator with a visual circuit builder, live Qiskit execution, and side-by-side comparison of two algorithms.

The frontend is a Next.js app for building and inspecting circuits in the browser. The backend is a FastAPI WebSocket service that converts circuit JSON into Qiskit `QuantumCircuit` objects, runs them with `AerSimulator`, and returns measurement counts plus lightweight circuit metrics.

## What It Does

- Build circuits visually on qubit wires
- Compare Circuit `A` and Circuit `B` in the same workspace
- Run simulations live over WebSocket
- View probability histograms for measured states
- Inspect circuit metrics like depth and gate count
- Edit circuits directly as JSON
- Work with common single-qubit, controlled, swap, measurement, and rotation gates

## Tech Stack

- Frontend: Next.js, React, TypeScript, Zustand, Recharts
- Backend: FastAPI, WebSocket, Qiskit, Qiskit Aer
- Communication: WebSocket at `ws://localhost:8000/ws`

## Project Structure

```text
QHack/
|- api/
|  `- main.py               # FastAPI app + Qiskit simulation pipeline
|- frontend/
|  |- app/                  # Next.js app router
|  |- components/           # Circuit builder, charts, comparison UI
|  |- hooks/                # WebSocket client logic
|  |- lib/                  # Circuit and gate helpers
|  |- store/                # Zustand state
|  `- package.json
|- .gitignore
|- README.md
`- working.txt              # Project notes
```

## Supported Gates

- Single qubit: `H`, `X`, `Y`, `Z`, `S`, `SDG`, `T`, `TDG`
- Rotations: `RX`, `RY`, `RZ`
- Two-qubit: `CNOT`, `CZ`, `SWAP`
- Measurement: `M`

The frontend notes also mention `I`, but the backend currently simulates the gates listed above. If you add a new gate to the UI, make sure `api/main.py` handles it too.

## How It Works

1. Open the Next.js frontend.
2. Build or edit a circuit in the browser.
3. The frontend serializes the circuit into JSON.
4. The payload is sent to the FastAPI backend over WebSocket.
5. The backend maps the payload into a Qiskit `QuantumCircuit`.
6. `AerSimulator` runs the circuit with `1024` shots.
7. The backend returns:
   - `counts`
   - `statevector` for circuits up to 8 qubits
   - `depth`
   - `gate_count`
8. The frontend updates the histograms and comparison table.

## Local Setup

### Prerequisites

- Python 3.10+
- Node.js 18+ and npm

### 1. Start the backend

Create and activate a virtual environment, then install the required Python packages:

```powershell
python -m venv api\.venv
api\.venv\Scripts\Activate.ps1
pip install fastapi uvicorn qiskit qiskit-aer
```

Run the FastAPI server:

```powershell
uvicorn api.main:app --reload --host 0.0.0.0 --port 8000
```

### 2. Start the frontend

In a second terminal:

```powershell
cd frontend
npm install
npm run dev
```

Open `http://localhost:3000`.

## Development Workflow

- Backend endpoint: `ws://localhost:8000/ws`
- Frontend dev server: `http://localhost:3000`
- Live simulation works only when both frontend and backend are running
- The frontend includes mock circuit data for UI testing without a live backend

## WebSocket Contract

### Request payload

```json
{
  "qubits": 3,
  "gates": [
    { "type": "H", "target": 0 },
    { "type": "CNOT", "control": 0, "target": 1 },
    { "type": "M", "target": 0 },
    { "type": "M", "target": 1 }
  ]
}
```

### Status message

```json
{
  "type": "status",
  "message": "Circuit received"
}
```

### Result message

```json
{
  "type": "result",
  "payload": {
    "counts": { "00": 512, "11": 512 },
    "statevector": [
      { "real": 0.7071, "imag": 0.0 },
      { "real": 0.0, "imag": 0.0 },
      { "real": 0.0, "imag": 0.0 },
      { "real": 0.7071, "imag": 0.0 }
    ],
    "depth": 3,
    "gate_count": 4
  }
}
```

## Key Frontend Modules

- `frontend/components/CircuitBuilder.tsx`: SVG-based circuit editor
- `frontend/components/GatePalette.tsx`: gate selection and parameter input
- `frontend/components/CircuitJsonEditor.tsx`: direct JSON editing
- `frontend/components/Histogram.tsx`: probability visualization
- `frontend/components/ComparisonTable.tsx`: A/B circuit comparison
- `frontend/hooks/useWebSocket.ts`: reconnecting WebSocket client
- `frontend/store/useCircuitStore.ts`: app state for circuits, results, and socket status

## Current Backend Behavior

- Uses `AerSimulator` for execution
- Always saves the statevector
- Returns serialized amplitudes only for circuits with `<= 8` qubits
- Uses `1024` shots for counts
- Accepts connections over WebSocket only, not REST

## Known Gaps

- There is no pinned Python dependency file yet
- There is no frontend environment configuration for alternate backend URLs yet
- If you extend supported gates, frontend and backend support should stay in sync

## Next Improvements

- Add `api/requirements.txt`
- Add a frontend environment variable like `NEXT_PUBLIC_WS_URL`
- Add backend validation and structured error responses
- Add tests for serialization, gate mapping, and WebSocket flows
- Add Docker support for one-command startup

## License

Add a license before distributing or open-sourcing the project.
