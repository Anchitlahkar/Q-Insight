# QHack Quantum Lab

QHack Quantum Lab is a full-stack quantum circuit playground for building, simulating, comparing, and visualizing quantum circuits. It combines a Next.js frontend with a FastAPI + Qiskit backend and uses WebSockets for live simulation updates.

The app is designed around two parallel circuits, `A` and `B`, so you can build alternatives side by side, run them independently or together, and compare their outputs and complexity metrics in one workspace.

## Highlights

- Dual-circuit workspace for `Circuit A` and `Circuit B`
- Interactive SVG circuit builder with drag-and-drop gate placement
- Sticky qubit labels, zoom controls, and measurement-aware wire rendering
- Gate palette with support for single-qubit, controlled, and parametric gates
- JSON editor with `replace` and `append` import modes
- Built-in algorithm library with categorized presets
- Ability to load presets as expanded gates or as reusable circuit components
- WebSocket-backed simulation with connection state and reconnect control
- Histogram views for basis-state distributions
- Probability meter for measured classical bits
- Comparison table for gate count, depth, measured states, and efficiency score
- Deterministic explanation engine derived from actual circuit state evolution
- Circuit explainer panel with tabbed views for:
  - summary
  - gate-by-gate explanations
  - optimization suggestions
  - backend comparison insights
- Step-by-step visualization modal with:
  - gate-by-gate playback
  - live circuit highlighting
  - Bloch sphere views
  - live statevector histogram
  - speed control and scrubbing
- Backend support for standard simulation, step simulation, and a variational scan endpoint

## Tech Stack

- Frontend: Next.js, React, TypeScript, Zustand, Recharts
- Backend: FastAPI, WebSocket, Qiskit, Qiskit Aer, NumPy
- Communication: WebSocket at `/ws`
- Deployment helpers:
  - Railway-friendly backend config in `api/`
  - Vercel-compatible frontend structure in `frontend/`

## Project Structure

```text
QHack/
|- api/
|  |- algorithms/
|  |- compiler/
|  |- hybrid/
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
|  |- package.json
|  `- tsconfig.json
|- README.md
|- working.md
`- working.txt
```

## Frontend Features

### Circuit Builder

- Switch between `Circuit A` and `Circuit B`
- Set qubit count from `2` to `6`
- Place gates by clicking pivots or dragging from the palette
- Build controlled/two-qubit gates across wires
- Delete placed operations directly from the canvas
- Load mock starter circuits
- Run the active circuit or run `A vs B`
- View a collapsible explainer panel beside the builder
- Click gate explanations to highlight matching operations on the canvas

### Circuit Explainer

The frontend includes `frontend/components/CircuitExplainer.tsx`, a reactive side-panel driven by the active circuit result in Zustand.

Tabs:

- `Summary`: circuit-level summary and measurement insight
- `Gates`: collapsible gate-level explanations with before/after state strings
- `Optimization`: rule-based cleanup suggestions from the backend
- `Comparison`: backend comparison result when a `compare_to` circuit is included

Notes:

- The explainer updates from the same WebSocket payload as counts and statevector
- It does not trigger additional requests
- `Run A vs B` and single-circuit runs both send a `compare_to` payload so comparison data can be returned

### Gate Palette

Supported gate families:

- Basic: `H`, `X`, `Y`, `Z`
- Phase: `S`, `SDG`, `T`, `TDG`
- Rotation: `RX`, `RY`, `RZ`
- Multi-qubit: `CNOT`, `CZ`, `SWAP`, `CRX`, `CRY`, `CRZ`
- Utility: `M`, `I`
- Composite frontend-only canvas item: `COMPONENT`

### JSON Editing

The JSON editor accepts:

- A full circuit object
- A `{ "gates": [...] }` object
- A bare array of gates
- A single gate object

Import modes:

- `Replace`: clears the current circuit and loads the pasted JSON
- `Append`: keeps the current circuit and appends imported gates after the last column

### Algorithm Library

The frontend includes categorized preset circuits from `frontend/lib/algorithms.json`, including categories such as:

- Quantum Foundations
- Search Algorithms
- Fourier Algorithms
- Variational Algorithms
- Linear Algebra Algorithms
- Quantum Communication
- Post-Quantum Cryptography
- Hardware Demonstrations

Each preset can be loaded in two ways:

- `Expanded`: convert the preset into regular gates in the active circuit
- `Component`: add the preset as a reusable circuit block on the canvas

Important distinction:

- The frontend algorithm library is currently loaded client-side from `frontend/lib/algorithms.json`
- The backend also has an `algorithm` execution mode, but the frontend currently simulates serialized gate lists rather than calling backend algorithm mode directly

### Visualization

The visualization panel supports:

- step simulation over WebSocket
- modal playback UI
- animated mini-circuit with active gate highlighting
- Bloch sphere inspection for each qubit
- live histogram from stepwise statevectors
- playback speed adjustment
- scrubbing to any step

## Backend Features

### WebSocket Simulation

The backend exposes a WebSocket endpoint at `/ws` and supports:

- standard circuit simulation
- step-by-step circuit simulation
- error reporting and status events
- statevector serialization when feasible
- deterministic circuit explanation and optimization analysis
- optional circuit-to-circuit comparison analysis

### Explanation Engine

The backend analysis layer lives in:

- `api/analysis/explainer.py`

It provides:

- `explain_circuit(...)`
- `compare_circuits(...)`
- `suggest_optimizations(...)`

The explanation flow is based on actual state evolution:

- build the circuit from serialized gates
- evolve a statevector gate by gate
- generate per-gate before/after state summaries
- infer circuit-level superposition and entanglement properties
- explain dominant measurement outcomes from the observed amplitude distribution
- detect rule-based optimization opportunities

### Variational Endpoint

The backend also exposes:

- `POST /variational/run`

This endpoint performs a simple parameter sweep over `theta` values and returns:

- `best` result
- full `history`
- counts, cost, depth, and gate count for each trial

### Backend Algorithm Builders

Backend-generated algorithms currently include:

- `qft`
- `oracle`
- `grover`

These are implemented in `api/algorithms/`.

## Simulation Behavior

- Simulations run with Qiskit Aer
- Standard execution uses `1024` shots
- Statevectors are serialized as:

```json
{ "real": 0.7071, "imag": 0.0 }
```

- Statevectors are only returned for circuits with at most `8` qubits
- The frontend builder currently allows at most `6` qubits
- Step simulation returns a `steps` array with per-step `gate_index`, `gate_type`, and `statevector`
- `SWAP` is compiled through the backend compiler before execution

## Local Development

### Prerequisites

- Python `3.10`
- Node.js `18+`
- npm

### 1. Start the backend

From the repository root:

```powershell
python -m venv api\.venv
api\.venv\Scripts\Activate.ps1
pip install -r api\requirements.txt
uvicorn api.main:app --reload --host 0.0.0.0 --port 8000
```

### 2. Configure the frontend

The frontend uses `NEXT_PUBLIC_WEBSOCKET_URL` when provided and otherwise falls back to:

```text
ws://localhost:8000/ws
```

If you want to set it explicitly, create `frontend/.env.local`:

```env
NEXT_PUBLIC_WEBSOCKET_URL=ws://localhost:8000/ws
```

If you use `frontend/.env`, make sure the value also uses the `ws://` or `wss://` scheme. The frontend now normalizes `http://...` to `ws://...`, but using the correct scheme directly is recommended.

### 3. Start the frontend

```powershell
cd frontend
npm install
npm run dev
```

Then open `http://localhost:3000`.

### 4. Production build check

```powershell
cd frontend
npm run build
```

## Frontend Scripts

Available in `frontend/package.json`:

- `npm run dev`
- `npm run build`
- `npm run start`
- `npm run lint`

## WebSocket Contract

### Standard circuit request

```json
{
  "qubits": 2,
  "gates": [
    { "type": "H", "target": 0 },
    { "type": "CNOT", "control": 0, "target": 1 },
    { "type": "M", "target": 0 },
    { "type": "M", "target": 1 }
  ]
}
```

Optional comparison payload:

```json
{
  "qubits": 2,
  "gates": [
    { "type": "H", "target": 0 },
    { "type": "CNOT", "control": 0, "target": 1 }
  ],
  "compare_to": {
    "qubits": 2,
    "gates": [
      { "type": "H", "target": 0 },
      { "type": "H", "target": 0 },
      { "type": "CNOT", "control": 0, "target": 1 }
    ]
  }
}
```

### Step simulation request

```json
{
  "mode": "step_simulation",
  "qubits": 2,
  "gates": [
    { "type": "H", "target": 0 },
    { "type": "CNOT", "control": 0, "target": 1 }
  ]
}
```

### Status event

```json
{
  "type": "status",
  "message": "Circuit received"
}
```

### Result event

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
    "gate_count": 4,
    "steps": [],
    "explanation": {
      "gate_explanations": [],
      "circuit_summary": "The circuit ends in superposition with observable support on 2 basis states. Entanglement is present across q0-q1; the reduced single-qubit states are mixed even though the joint state is pure. The measurement distribution is concentrated on 00 (50.00%), 11 (50.00%). Controlled operations are what turn single-qubit structure into joint-qubit correlations here.",
      "measurement_insight": "The dominant exact outcomes are 00 (50.00%), 11 (50.00%). The shot-based results align as 00 (50.00%, 512 counts), 11 (50.00%, 512 counts). An H gate first creates equal amplitude branches, and the following CNOT ties those branches together into correlated measurement outcomes.",
      "comparison": null,
      "optimization_suggestions": []
    },
    "comparison": null,
    "suggestions": []
  }
}
```

New top-level payload fields:

- `explanation`
- `comparison`
- `suggestions`

`explanation` shape:

```json
{
  "gate_explanations": [],
  "circuit_summary": "string",
  "measurement_insight": "string",
  "comparison": null,
  "optimization_suggestions": []
}
```

### Bell-state explanation example

For `H(0)` followed by `CNOT(0,1)`, the deterministic explanation payload includes gate-level state transitions such as:

```json
{
  "gate_explanations": [
    {
      "gate": "H",
      "target": 0,
      "before_state": "1.000|00>",
      "after_state": "0.707|00> + 0.707|01>",
      "technical": "Before gate 0, the state is |00>:1.000. After applying H, it becomes |00>:0.707, |01>:0.707. Amplitude moved across |00> (1.000 -> 0.707), |01> (0.000 -> 0.707).",
      "intuitive": "Qubit 0 was driving q0: 0->100.00%, 1->0.00% and now spreads its weight across q0: 0->50.00%, 1->50.00%, creating interference-ready branches visible in the amplitudes.",
      "effect": "state changed from |00>:1.000 -> |00>:0.707, |01>:0.707"
    },
    {
      "gate": "CNOT",
      "target": 1,
      "control": 0,
      "before_state": "0.707|00> + 0.707|01>",
      "after_state": "0.707|00> + 0.707|11>",
      "technical": "Before gate 1, the state is |00>:0.707, |01>:0.707. After applying CNOT, it becomes |00>:0.707, |11>:0.707. Control-target action uses control qubit 0 and target qubit 1. Amplitude moved across |01> (0.707 -> 0.000), |11> (0.000 -> 0.707).",
      "intuitive": "Only the branches where control qubit 0 is 1 were altered. That conditional change reshaped the joint amplitudes into |00>:0.707, |11>:0.707.",
      "effect": "state changed from |00>:0.707, |01>:0.707 -> |00>:0.707, |11>:0.707"
    }
  ],
  "circuit_summary": "The circuit ends in superposition with observable support on 2 basis states. Entanglement is present across q0-q1; the reduced single-qubit states are mixed even though the joint state is pure. The measurement distribution is concentrated on 00 (50.00%), 11 (50.00%). Controlled operations are what turn single-qubit structure into joint-qubit correlations here.",
  "measurement_insight": "The dominant exact outcomes are 00 (50.00%), 11 (50.00%). An H gate first creates equal amplitude branches, and the following CNOT ties those branches together into correlated measurement outcomes.",
  "comparison": null,
  "optimization_suggestions": []
}
```

### Error event

```json
{
  "type": "error",
  "message": "Unsupported gate type: FOO"
}
```

## REST Contract

### `POST /variational/run`

Example request:

```json
{
  "qubits": 2,
  "iterations": 8,
  "start": 0.0,
  "stop": 6.283185307179586
}
```

Example response shape:

```json
{
  "best": {
    "theta": 0.0,
    "counts": { "00": 1024 },
    "cost": 0.0,
    "depth": 2,
    "gate_count": 4
  },
  "history": []
}
```

## Key Modules

### Frontend

- `frontend/app/page.tsx`: main page composition
- `frontend/components/AlgorithmSelector.tsx`: categorized preset browser
- `frontend/components/CircuitBuilder.tsx`: main editing, execution, and metrics UI
- `frontend/components/CircuitExplainer.tsx`: tabbed explanation/optimization/comparison panel
- `frontend/components/CircuitJsonEditor.tsx`: structured JSON import/export editor
- `frontend/components/Histogram.tsx`: result distribution chart for circuits A and B
- `frontend/components/ComparisonTable.tsx`: side-by-side metrics comparison
- `frontend/components/VisualizationPanel.tsx`: step playback and state visualization
- `frontend/components/BlochSphere.tsx`: per-qubit Bloch rendering
- `frontend/components/WebSocketStatusBadge.tsx`: socket state UI
- `frontend/hooks/useWebSocket.ts`: shared reconnecting WebSocket client
- `frontend/store/useCircuitStore.ts`: circuit, result, and socket state
- `frontend/store/useVisualizationStore.ts`: step playback state

### Backend

- `api/main.py`: FastAPI app, WebSocket endpoint, simulation dispatch, variational endpoint
- `api/analysis/explainer.py`: deterministic explanation, comparison, and optimization engine
- `api/compiler/gate_compiler.py`: gate preprocessing and compilation
- `api/algorithms/registry.py`: backend algorithm dispatcher
- `api/algorithms/qft.py`: QFT builder
- `api/algorithms/oracle.py`: oracle builder
- `api/algorithms/grover.py`: Grover builder
- `api/hybrid/variational.py`: variational parameter scan

## Deployment Notes

### Backend

The backend includes Railway-oriented files:

- `api/Procfile`
- `api/runtime.txt`
- `api/requirements.txt`

`Procfile` start command:

```text
web: uvicorn main:app --host 0.0.0.0 --port $PORT
```

### Frontend

The frontend is a standard Next.js app and can be deployed to Vercel or any Node-compatible hosting platform. Make sure `NEXT_PUBLIC_WEBSOCKET_URL` points to your deployed backend WebSocket endpoint.

## Current Constraints

- Builder qubit count is capped at `6`
- Statevectors are capped at `8` qubits on the backend
- CORS is currently permissive: `allow_origins=["*"]`
- Backend `algorithm` mode exists but is not yet the main frontend execution path
- Grover diffusion in the backend currently supports only `1` or `2` qubits
- The repository does not currently declare a formal open-source license
- The explainer panel will remain empty if the frontend is connected to an older backend process that does not yet serve `explanation`, `comparison`, and `suggestions`

## Recommended Next Improvements

- Restrict CORS to trusted frontend origins
- Add automated tests for frontend stores and backend simulation handlers
- Add backend tests for explanation payload determinism and optimization rules
- Add frontend tests for explainer rendering from mocked WebSocket results
- Wire frontend algorithm execution to backend `mode: "algorithm"` where useful
- Add documentation screenshots or GIFs for the builder and visualization flow
- Add a formal license before distribution

## Additional Notes

- `working.md` contains a more implementation-oriented engineering handoff
- `working.txt` is still present in the repo, but `working.md` is now the preferred Markdown version
