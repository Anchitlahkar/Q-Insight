# QHack Quantum Lab

QHack Quantum Lab is a full-stack quantum circuit workbench for composing, simulating, comparing, and explaining quantum circuits in a browser. It pairs a Next.js frontend with a FastAPI + Qiskit backend and uses a persistent WebSocket channel for low-latency simulation requests.

The product is built around two editable workspaces, `Circuit A` and `Circuit B`. Users can construct circuits manually, import JSON, load algorithm presets, inspect live complexity metrics, run simulations, compare alternatives, and replay intermediate quantum states step by step.

## What The Program Does

At a high level, the system supports five major activities:

1. Circuit authoring
2. Circuit execution
3. Side-by-side comparison
4. Step-by-step visualization
5. Deterministic explanation and optimization analysis

The frontend is responsible for interactive editing, serialization, rendering, and result presentation. The backend is responsible for circuit compilation, Qiskit execution, statevector capture, comparison analysis, and optimization suggestions.

## User-Facing Feature Set

### Builder and editing

- Dual workspace model: `Circuit A` and `Circuit B`
- SVG circuit canvas with per-qubit wires and numbered columns
- Sticky qubit labels and classical register labels
- Click-to-place gate workflow
- Drag-and-drop gate placement
- Drag-and-drop algorithm components
- Click-to-delete placed gates
- Zoom presets from `50%` to `150%`
- Measurement-aware wire truncation and classical wire rendering
- Gate highlighting driven by visualization playback and explanation selection

### Supported operations

The frontend gate catalog currently includes:

- Basic: `H`, `X`, `Y`, `Z`
- Phase: `S`, `SDG`, `T`, `TDG`
- Rotations: `RX`, `RY`, `RZ`
- Controlled and multi-qubit: `CNOT`, `CZ`, `SWAP`, `CRX`, `CRY`, `CRZ`
- Utility: `M`, `I`
- Composite operation: `COMPONENT`

### Preset algorithm library

The frontend ships with categorized presets stored in `frontend/lib/algorithms.json`, including examples from:

- Quantum foundations
- Search algorithms
- Fourier algorithms
- Variational algorithms
- Linear algebra algorithms
- Quantum communication
- Post-quantum cryptography

Each preset can be loaded in two ways:

- `Expanded`: replace the active circuit with concrete gates
- `Component`: insert the preset as a reusable composite block on the canvas

### Analysis and teaching features

- Circuit summary in natural language
- Measurement insight narrative
- Gate-by-gate before/after state explanations
- Technical and intuitive explanation text per gate
- Rule-based optimization suggestions
- Backend comparison reasoning between two circuits
- Frontend comparison dashboard with complexity metrics

### Visualization features

- Dedicated `Visualize` execution path
- Stepwise replay of gate application
- Animated modal playback UI
- Scrubbing slider
- Adjustable playback speed
- Live Bloch sphere display
- Live histogram from the current step statevector
- Active-gate glow and focus animation

### Data import/export and utilities

- JSON editor for the active circuit
- `Replace` and `Append` import modes
- Copy-to-clipboard export
- Multiple accepted JSON formats
- Mock circuit loader
- Live classical probability meter derived from measurement results
- Socket status badge and reconnect control

## End-To-End Pipeline

## 1. Input surfaces

The program accepts input from several entry points:

- Manual gate placement from `GatePalette`
- Algorithm loading from `AlgorithmSelector`
- JSON import from `CircuitJsonEditor`
- Visualization request from `VisualizationPanel`
- Standard simulation request from `CircuitBuilder`
- REST variational request to `POST /variational/run`

These inputs all converge on one of two backend execution paths:

- WebSocket simulation via `/ws`
- REST variational sweep via `/variational/run`

## 2. Frontend circuit state

Frontend circuit state is owned by [`frontend/store/useCircuitStore.ts`](/c:/Extra_s/Code/python/QHack/frontend/store/useCircuitStore.ts). That store manages:

- active circuit selection
- both circuit definitions
- simulation results for `A` and `B`
- shared socket state
- loading state

Each circuit stores:

- `qubits`
- `gates`

Each gate on the canvas is a UI operation with layout metadata such as:

- `id`
- `type`
- `target`
- optional `control`
- optional `theta`
- optional `classicalTarget`
- optional component metadata
- `position`

This means the frontend maintains a richer editing model than the backend transport format.

## 3. Serialization and component expansion

Before a circuit is sent to the backend, [`frontend/lib/circuit.ts`](/c:/Extra_s/Code/python/QHack/frontend/lib/circuit.ts) converts the editable circuit into a transport-safe structure:

- gates are sorted by `position.x`
- `COMPONENT` nodes are recursively expanded into primitive gates
- per-gate UI metadata is stripped out
- the final payload becomes `{ qubits, gates }`

This is the key boundary between UI composition and simulation execution.

## 4. WebSocket transport

The frontend uses [`frontend/hooks/useWebSocket.ts`](/c:/Extra_s/Code/python/QHack/frontend/hooks/useWebSocket.ts) as a shared reconnecting transport layer.

Important transport behavior:

- one shared browser WebSocket instance is reused across listeners
- requests are queued in FIFO order
- responses resolve pending promises in receive order
- reconnect uses exponential backoff up to `8000ms`
- socket lifecycle is mirrored into Zustand
- disconnecting the last listener closes the shared socket

Message envelope types:

- `status`
- `result`
- `error`

The default WebSocket endpoint is normalized in [`frontend/lib/env.ts`](/c:/Extra_s/Code/python/QHack/frontend/lib/env.ts):

- fallback: `ws://localhost:8000/ws`
- `http://...` is normalized to `ws://...`
- `https://...` is normalized to `wss://...`

## 5. Backend request parsing

The backend entry point is [`api/main.py`](/c:/Extra_s/Code/python/QHack/api/main.py).

The `/ws` endpoint:

- accepts the socket
- reads JSON text messages
- validates that the message is a JSON object
- sends a `status` event
- dispatches to `run_simulation(...)`
- returns either `result` or `error`

Supported execution modes:

- default circuit mode
- `step_simulation`
- `algorithm`

## 6. Compilation and simulation

Before execution, gates are passed through [`api/compiler/gate_compiler.py`](/c:/Extra_s/Code/python/QHack/api/compiler/gate_compiler.py).

Current compiler behavior:

- `SWAP` is decomposed into three `CNOT` gates

The backend then builds a `QuantumCircuit` and applies each compiled gate using explicit gate handlers in `apply_gate(...)`.

The simulator path uses Qiskit Aer:

- backend engine: `AerSimulator`
- normal shot count: `1024`
- statevector capture only when measurements are absent and qubit count is within limit

## 7. Analysis and enrichment

After simulation, the backend enriches the raw execution result with:

- `explanation`
- `comparison`
- `suggestions`

This work is handled in [`api/analysis/explainer.py`](/c:/Extra_s/Code/python/QHack/api/analysis/explainer.py).

The analysis layer:

- evolves the circuit gate by gate with `Statevector`
- records per-gate before/after summaries
- detects superposition structure
- detects entanglement via reduced-state entropy
- builds measurement narratives
- computes optimization suggestions
- compares two circuits using weighted scoring

## 8. Result fan-out in the frontend

Completed results are stored back into `useCircuitStore`, then rendered by multiple UI surfaces at once:

- `Histogram` renders basis-state distributions
- `CircuitExplainer` renders explanation, optimization, and backend comparison text
- `ComparisonTable` renders frontend-derived complexity metrics
- `ProbabilityMeter` renders classical-bit marginals
- `VisualizationPanel` consumes step payloads for replay

This is the core reactive loop of the application.

## Execution Paths In Detail

### Standard run

Triggered by `Run A` or `Run B` in [`frontend/components/CircuitBuilder.tsx`](/c:/Extra_s/Code/python/QHack/frontend/components/CircuitBuilder.tsx).

Flow:

1. Read active circuit from Zustand
2. Serialize active circuit
3. Serialize the opposite circuit as `compare_to`
4. Send request over WebSocket
5. Backend simulates the active circuit
6. Backend analyzes the active circuit and optionally compares it against `compare_to`
7. Frontend stores the result under the active circuit key

Important nuance:

- even a single-circuit run includes `compare_to`
- the comparison tab therefore depends on the latest result for the active circuit

### A vs B run

The `A vs B` button does not send one combined request. It fires two separate runs:

- one request for `Circuit A` with `compare_to = Circuit B`
- one request for `Circuit B` with `compare_to = Circuit A`

That means:

- both result slots are refreshed independently
- backend comparison exists from each circuit's point of view
- frontend global loading is shared across both calls

### Step visualization run

Triggered by `Visualize` in [`frontend/components/VisualizationPanel.tsx`](/c:/Extra_s/Code/python/QHack/frontend/components/VisualizationPanel.tsx).

Flow:

1. Serialize the active circuit
2. Send `mode: "step_simulation"`
3. Backend compiles the circuit
4. Backend rebuilds prefix circuits for each compiled gate
5. Backend attempts statevector capture at every prefix
6. Backend returns `steps[]` plus the final simulation payload
7. Frontend opens the visualization modal and starts playback

Visualization state lives in [`frontend/store/useVisualizationStore.ts`](/c:/Extra_s/Code/python/QHack/frontend/store/useVisualizationStore.ts).

That store tracks:

- `currentStep`
- `visualizationResult`
- `isVisualizing`
- `isPlaying`
- `speedMs`
- `modalOpen`

### Backend algorithm mode

The backend supports `mode: "algorithm"` through [`api/algorithms/registry.py`](/c:/Extra_s/Code/python/QHack/api/algorithms/registry.py), with current builders:

- `qft`
- `oracle`
- `grover`

This is implemented on the server but is not the main path used by the current frontend UI. The visible algorithm browser is frontend-driven and loads static preset gate lists instead.

### Variational REST path

`POST /variational/run` is implemented in [`api/hybrid/variational.py`](/c:/Extra_s/Code/python/QHack/api/hybrid/variational.py).

It performs:

- a simple theta sweep
- repeated `RY`-based circuit construction
- optional entangling `CX` chain for multi-qubit cases
- count-based cost evaluation against the all-zero state

The endpoint returns:

- `best`
- `history`

This endpoint is currently backend-only and is not wired into the main frontend workflow.

## Frontend Architecture

### Main page composition

[`frontend/app/page.tsx`](/c:/Extra_s/Code/python/QHack/frontend/app/page.tsx) assembles the application in this order:

1. Header
2. `AlgorithmSelector`
3. `CircuitBuilder`
4. `VisualizationPanel`
5. `Histogram` for `A`
6. `Histogram` for `B`
7. `ComparisonTable`

### Core components

[`frontend/components/AlgorithmSelector.tsx`](/c:/Extra_s/Code/python/QHack/frontend/components/AlgorithmSelector.tsx)

- loads static presets from `algorithms.json`
- groups presets by category
- supports drag as component
- supports direct load as expanded circuit

[`frontend/components/CircuitBuilder.tsx`](/c:/Extra_s/Code/python/QHack/frontend/components/CircuitBuilder.tsx)

- owns primary editing interactions
- manages gate selection, theta, control, target, preview, zoom, and highlighted gate state
- places or deletes operations
- triggers simulation
- displays live metrics and probability meter
- mounts the explainer and JSON editor

[`frontend/components/CircuitExplainer.tsx`](/c:/Extra_s/Code/python/QHack/frontend/components/CircuitExplainer.tsx)

- reads `result.explanation`
- reads `result.suggestions`
- reads `result.comparison`
- exposes `summary`, `gates`, `optimization`, and conditional `comparison` tabs
- lets users highlight a gate explanation back on the canvas

[`frontend/components/VisualizationPanel.tsx`](/c:/Extra_s/Code/python/QHack/frontend/components/VisualizationPanel.tsx)

- triggers step simulation
- manages replay
- renders modal visualization
- renders Bloch spheres and live histogram

[`frontend/components/CircuitJsonEditor.tsx`](/c:/Extra_s/Code/python/QHack/frontend/components/CircuitJsonEditor.tsx)

- exports the active circuit as JSON
- accepts a full circuit object, gates object, bare gate array, or single gate object
- validates gate structure
- supports aliases such as `cx`, `measure`, `identity`
- supports `Replace` and `Append`

[`frontend/components/Histogram.tsx`](/c:/Extra_s/Code/python/QHack/frontend/components/Histogram.tsx)

- renders full basis-state distributions for each circuit
- toggles between probability and raw counts
- highlights the dominant observed state

[`frontend/components/ComparisonTable.tsx`](/c:/Extra_s/Code/python/QHack/frontend/components/ComparisonTable.tsx)

- compares frontend-derived structural metrics
- is distinct from backend narrative comparison

### Stores, utilities, and hooks

[`frontend/store/useCircuitStore.ts`](/c:/Extra_s/Code/python/QHack/frontend/store/useCircuitStore.ts)

- source of truth for circuits, results, socket state, and run state

[`frontend/store/useVisualizationStore.ts`](/c:/Extra_s/Code/python/QHack/frontend/store/useVisualizationStore.ts)

- source of truth for step replay

[`frontend/hooks/useWebSocket.ts`](/c:/Extra_s/Code/python/QHack/frontend/hooks/useWebSocket.ts)

- shared transport layer with reconnect and request queueing

[`frontend/lib/circuit.ts`](/c:/Extra_s/Code/python/QHack/frontend/lib/circuit.ts)

- serialization
- component expansion
- metric calculation
- measurement map calculation
- classical probability derivation

[`frontend/lib/gates.ts`](/c:/Extra_s/Code/python/QHack/frontend/lib/gates.ts)

- single source of truth for gate metadata

[`frontend/lib/quantum.ts`](/c:/Extra_s/Code/python/QHack/frontend/lib/quantum.ts)

- Bloch vector conversion from serialized statevectors

## Backend Architecture

### Runtime entry points

[`api/main.py`](/c:/Extra_s/Code/python/QHack/api/main.py)

- FastAPI app setup
- permissive CORS configuration
- WebSocket endpoint at `/ws`
- variational REST endpoint at `/variational/run`

### Simulation and gate application

The backend directly supports these gate types in `apply_gate(...)`:

- `H`, `X`, `Y`, `Z`
- `CNOT`, `CZ`, `SWAP`
- `S`, `SDG`, `T`, `TDG`
- `RX`, `RY`, `RZ`
- `CRX`, `CRY`, `CRZ`
- `M`
- `I`

### Analysis engine

[`api/analysis/explainer.py`](/c:/Extra_s/Code/python/QHack/api/analysis/explainer.py)

Key outputs:

- `gate_explanations`
- `circuit_summary`
- `measurement_insight`
- `optimization_suggestions`
- comparison scoring payload

Current optimization rules include:

- identity removal
- zero-angle rotation removal
- self-inverse cancellation
- inverse phase cancellation
- consecutive rotation merging

### Algorithm builders

[`api/algorithms/registry.py`](/c:/Extra_s/Code/python/QHack/api/algorithms/registry.py)

- dispatches named algorithm builders

[`api/algorithms/qft.py`](/c:/Extra_s/Code/python/QHack/api/algorithms/qft.py)

- builds backend QFT circuits

[`api/algorithms/oracle.py`](/c:/Extra_s/Code/python/QHack/api/algorithms/oracle.py)

- constructs oracle marking gates

[`api/algorithms/grover.py`](/c:/Extra_s/Code/python/QHack/api/algorithms/grover.py)

- constructs Grover circuits

## Data Contracts

### Standard WebSocket request

```json
{
  "qubits": 2,
  "gates": [
    { "type": "H", "target": 0 },
    { "type": "CNOT", "control": 0, "target": 1 },
    { "type": "M", "target": 0 },
    { "type": "M", "target": 1 }
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

### Error event

```json
{
  "type": "error",
  "message": "Unsupported gate type: FOO"
}
```

### Result payload shape

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
    "explanation": {},
    "comparison": null,
    "suggestions": []
  }
}
```

### Variational REST request

```json
{
  "qubits": 2,
  "iterations": 8,
  "start": 0.0,
  "stop": 6.283185307179586
}
```

### Variational REST response

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

## Constraints And Current Behavior

- Builder qubit selector exposes `2` to `6` qubits
- Frontend store allows circuits up to `6` qubits
- Backend statevector capture is capped at `8` qubits
- Standard statevectors are only returned when the circuit has no measurement operations
- Step payload statevectors may be `null` when capture is not possible for a given prefix
- CORS is currently fully open with `allow_origins=["*"]`
- Backend algorithm mode exists but is not the dominant frontend path
- Variational REST mode exists but is not surfaced in the main UI
- `SWAP` is compiled to three `CNOT`s before backend analysis and execution
- ComparisonTable and backend `comparison` are related but not identical systems

## Running Locally

### Prerequisites

- Python `3.10`
- Node.js `18+`
- npm

### Backend

```powershell
python -m venv api\.venv
api\.venv\Scripts\Activate.ps1
pip install -r api\requirements.txt
uvicorn api.main:app --reload --host 0.0.0.0 --port 8000
```

### Frontend

```powershell
cd frontend
npm install
npm run dev
```

Open `http://localhost:3000`.

### Frontend environment

Optional file: `frontend/.env.local`

```env
NEXT_PUBLIC_WEBSOCKET_URL=ws://localhost:8000/ws
```

### Production build check

```powershell
cd frontend
npm run build
```

## Deployment Notes

### Backend

Deployment metadata lives in:

- [`api/Procfile`](/c:/Extra_s/Code/python/QHack/api/Procfile)
- [`api/runtime.txt`](/c:/Extra_s/Code/python/QHack/api/runtime.txt)
- [`api/requirements.txt`](/c:/Extra_s/Code/python/QHack/api/requirements.txt)

Current Procfile command:

```text
web: uvicorn main:app --host 0.0.0.0 --port $PORT
```

### Frontend

The frontend is a standard Next.js application and can be deployed on Vercel or another Node-compatible host. In production, `NEXT_PUBLIC_WEBSOCKET_URL` must point to the deployed backend WebSocket endpoint.

## Recommended Next Improvements

- Add automated backend tests for simulation modes and analysis determinism
- Add frontend tests for stores, transport flow, and explainer rendering
- Tighten CORS configuration for production
- Expose backend algorithm mode through the UI where appropriate
- Expose the variational endpoint through a dedicated frontend workflow
- Add persistence for saved circuits and presets
- Add richer deployment and operations documentation

## Deep Technical Notes

Implementation-level pipeline notes, internal hooks, stores, extension points, and engineering handoff material are maintained in [`working.md`](/c:/Extra_s/Code/python/QHack/working.md).
