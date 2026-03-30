# QHack Quantum Lab

Quantum Lab is a full-stack quantum circuit simulator with a visual circuit builder, live Qiskit execution, and side-by-side comparison of two circuits.

The frontend is a Next.js app for building and inspecting circuits in the browser. The backend is a FastAPI WebSocket service that converts circuit JSON into Qiskit `QuantumCircuit` objects, runs them with `AerSimulator`, and returns counts, statevectors when available, and circuit metrics.

## What It Does

- Build circuits visually on qubit wires
- Compare Circuit `A` and Circuit `B` in the same workspace
- Run simulations live over WebSocket
- View probability histograms for measured states
- Inspect circuit metrics like depth and gate count
- Edit circuits directly as JSON
- Visualize step-by-step circuit evolution

## Tech Stack

- Frontend: Next.js, React, TypeScript, Zustand, Recharts
- Backend: FastAPI, WebSocket, Qiskit, Qiskit Aer
- Communication: WebSocket via `NEXT_PUBLIC_WEBSOCKET_URL`

## Project Structure

```text
QHack/
|- api/
|  |- main.py
|  |- requirements.txt
|  |- Procfile
|  `- runtime.txt
|- frontend/
|  |- app/
|  |- components/
|  |- hooks/
|  |- lib/
|  |- store/
|  |- .env
|  `- package.json
|- .gitignore
|- README.md
`- working.txt
```

## Supported Gates

- Single qubit: `H`, `X`, `Y`, `Z`, `S`, `SDG`, `T`, `TDG`, `I`
- Rotations: `RX`, `RY`, `RZ`
- Controlled rotations: `CRX`, `CRY`, `CRZ`
- Two-qubit: `CNOT`, `CZ`, `SWAP`
- Measurement: `M`

If you add a new gate to the frontend, make sure `api/main.py` handles it too.

## Local Setup

### Prerequisites

- Python 3.10+
- Node.js 18+ and npm

### 1. Start the backend

Create and activate a virtual environment, then install dependencies:

```powershell
python -m venv api\.venv
api\.venv\Scripts\Activate.ps1
pip install -r api\requirements.txt
```

Run the FastAPI server from the repository root:

```powershell
uvicorn api.main:app --reload --host 0.0.0.0 --port 8000
```

### 2. Configure the frontend

The frontend reads the backend WebSocket URL from [frontend/.env](frontend/.env):

```env
NEXT_PUBLIC_WEBSOCKET_URL=ws://localhost:8000/ws
```

Update this value when pointing the UI at a deployed backend.

### 3. Start the frontend

In a second terminal:

```powershell
cd frontend
npm install
npm run dev
```

Open `http://localhost:3000`.

## Backend Deployment on Railway

The backend is prepared for Railway with these files in `api/`:

- [api/requirements.txt](api/requirements.txt)
- [api/Procfile](api/Procfile)
- [api/runtime.txt](api/runtime.txt)

### Railway start command

`Procfile` uses:

```text
web: uvicorn main:app --host 0.0.0.0 --port $PORT
```

### Deploy notes

1. Create a Railway project for the backend.
2. Set the root directory to `api/` if Railway is deploying from the monorepo root.
3. Railway will install from `requirements.txt` and start from `Procfile`.
4. After deployment, copy the Railway backend WebSocket URL and update `NEXT_PUBLIC_WEBSOCKET_URL` in the frontend.

## Backend Behavior

- Exposes a WebSocket endpoint at `/ws`
- Accepts a JSON object per message
- Sends a status message after accepting a valid request
- Sends either:
  - a `result` message with simulation output
  - an `error` message for invalid input or runtime failures
- Uses `AerSimulator` for execution
- Uses `1024` shots for counts
- Returns serialized amplitudes only for circuits with `<= 8` qubits
- Includes permissive CORS for now and can be restricted to the frontend URL later

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

### Error examples

```json
{
  "type": "error",
  "message": "Request body must be valid JSON"
}
```

## Key Frontend Modules

- `frontend/components/CircuitBuilder.tsx`: SVG-based circuit editor
- `frontend/components/GatePalette.tsx`: gate selection and parameter input
- `frontend/components/CircuitJsonEditor.tsx`: direct JSON editing
- `frontend/components/Histogram.tsx`: probability visualization
- `frontend/components/ComparisonTable.tsx`: A/B circuit comparison
- `frontend/components/VisualizationPanel.tsx`: step-by-step visualization UI
- `frontend/hooks/useWebSocket.ts`: reconnecting WebSocket client
- `frontend/lib/env.ts`: frontend environment access
- `frontend/store/useCircuitStore.ts`: app state for circuits, results, and socket status

## Notes

- The frontend and backend must stay in sync on supported gate types.
- The frontend defaults to `ws://localhost:8000/ws` through `frontend/.env` for local development.
- CORS currently allows all origins for deployment convenience and should be tightened for production frontend domains.

## License

Add a license before distributing or open-sourcing the project.
