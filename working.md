# QHack Working Notes

This file is the Markdown handoff note for the current state of the project. It is meant to be more implementation-focused than the README.

## Current Snapshot

- The project is a full-stack quantum circuit simulator and visualizer
- Frontend lives in `frontend/` and is built with Next.js + React + TypeScript
- Backend lives in `api/` and is built with FastAPI + Qiskit
- Primary runtime path is WebSocket simulation through `/ws`
- The UI is organized around two editable circuits, `A` and `B`
- Step-by-step visualization is implemented and working
- Live histogram in `VisualizationPanel` now reads statevectors using `{ real, imag }` amplitudes
- Backend explanation/insight engine is implemented
- Frontend explainer panel is implemented and reads from the same WebSocket result object as the rest of the simulator

## Detailed Project Pipeline

The QHack platform operates as a distributed reactive system where the frontend manages the user-facing circuit state and the backend provides high-fidelity simulation and deep structural analysis.

### 1. Frontend: State and Serialization

- **Local State Management**: Circuit definitions (gates, qubits) are stored in `useCircuitStore.ts` using Zustand.
- **Trigger**: When a user clicks "Run Circuit" or "Run A vs B", the current active circuit (and optionally the comparison target) is extracted.
- **Component Expansion**: The `serializeCircuit` function in `frontend/lib/circuit.ts` recursively expands `COMPONENT` type gates into their primitive gate sequences.
- **Payload Construction**: The final payload includes `qubits`, `gates` (fully serialized list), and an optional `compare_to` object containing the other circuit's definition.

### 2. Communication: WebSocket Transport

- **Channel**: A persistent WebSocket connection at `/ws` is managed by the `useWebSocket.ts` hook.
- **Lifecycle**:
  - `status`: Backend acknowledges receipt of the circuit.
  - `error`: Backend reports validation or execution failures.
  - `result`: Backend returns the completed simulation and analysis payload.
- **Normalization**: The frontend ensures the backend URL is correctly formatted (normalizing `http` to `ws`).

### 3. Backend: Compilation and Execution

- **Entry Point**: `api/main.py` parses the incoming JSON.
- **Gate Compilation**: `api/compiler/gate_compiler.py` performs low-level translations (e.g., decomposing `SWAP` gates) before the circuit is built in Qiskit.
- **Simulation Modes**:
  - **Standard (`circuit`)**: Builds a single `QuantumCircuit`, runs it through `AerSimulator` with 1024 shots. If no measurements are present and qubit count is $\le 8$, it captures the full statevector.
  - **Stepwise (`step_simulation`)**: Iteratively builds circuit prefixes for every gate index, capturing intermediate statevectors at each step to support the frontend playback UI.
  - **Algorithm (`algorithm`)**: Uses template builders in `api/algorithms/` to generate complex circuits like QFT or Grover's based on input parameters.

### 4. Backend: Analysis and Enrichment

Once simulation completes, the results are passed to the analysis layer in `api/analysis/explainer.py`.

- **Deterministic Explanation**:
  - The engine evolves a `Statevector` gate-by-gate.
  - It generates `gate_explanations` with `technical` (state change), `intuitive` (semantic meaning), and `effect` summaries.
  - It identifies `circuit_summary` properties: superposition, entanglement (via Von Neumann entropy), and dominant basis states.
- **Optimization Engine**:
  - Runs rule-based pattern matching on the gate list.
  - Detects self-inverse pairs (H-H, X-X), inverse pairs (T-TDG), and mergeable rotations (RY(0.1)-RY(0.2)).
- **Comparison Logic**:
  - Computes a weighted efficiency score based on `depth`, `gate_count`, `redundancy_penalty`, and `output_similarity`.
  - Determines a "winner" between Circuit A and B with human-readable reasoning.

### 5. Frontend: Result Processing

- **Zustand Update**: The `result` payload is stored in `useCircuitStore`.
- **Reactive Re-render**:
  - `Histogram.tsx`: Renders the probability distribution.
  - `CircuitExplainer.tsx`: Populates the tabbed analysis panel.
  - `ComparisonTable.tsx`: Updates side-by-side metrics.
  - `VisualizationPanel.tsx`: If in step mode, initializes the playback state in `useVisualizationStore`.

## Main User Flows

### 1. Build and run a circuit
(See Pipeline sections 1-5 above)

### 2. Compare two circuits
1. User edits both circuits in the same workspace.
2. User runs `A vs B`.
3. Frontend sends the active circuit with the other as `compare_to`.
4. Backend runs analysis on both and computes the comparison score.
5. Frontend renders side-by-side histograms and the comparison reasoning.

### 3. Step visualization
1. User clicks `Visualize` in `VisualizationPanel`.
2. Frontend requests `mode: "step_simulation"`.
3. Backend returns a list of intermediate statevectors.
4. Frontend modal allows scrubbing through the circuit with live Bloch spheres.

## Frontend Architecture

### App composition

`frontend/app/page.tsx` renders:

- `AlgorithmSelector`
- `CircuitBuilder`
- `VisualizationPanel`
- `Histogram` for Circuit A
- `Histogram` for Circuit B
- `ComparisonTable`

### State stores

#### `frontend/store/useCircuitStore.ts`

Owns:

- active circuit key
- circuit definitions for `A` and `B`
- simulation results
- socket status and errors
- loading state

Important behaviors:

- max builder qubits is `6`
- algorithm presets can be loaded as fully expanded gates
- algorithm presets can also be loaded as `COMPONENT` operations
- mock circuits are available through `loadMockData()`

#### `frontend/store/useVisualizationStore.ts`

Owns:

- current step
- visualization result payload
- play/pause state
- playback speed
- modal-related visualization lifecycle state

Important behavior:

- visualization state resets when active circuit, gate list, or qubit count changes

### Core components

#### `frontend/components/CircuitBuilder.tsx`

Responsibilities:

- main editor UI
- gate placement and deletion
- drag/drop support
- run active circuit
- run A vs B
- probability meter
- summary metric cards
- JSON editor integration
- WebSocket status badge integration
- explainer panel integration
- passes `compare_to` during simulation requests

Notable details:

- qubit labels are rendered in a sticky side column
- canvas supports zoom presets from `50%` to `150%`
- measurement-aware wire truncation is implemented
- clicking a placed gate deletes it
- clicking a gate explanation highlights the corresponding rendered operation on the circuit

#### `frontend/components/CircuitExplainer.tsx`

Responsibilities:

- read active-circuit result data from Zustand
- render tabbed summary, gates, optimization, and comparison sections
- keep gate-level content collapsed by default
- show fallback messaging when explanation data is not present
- let users highlight a gate on the builder by opening a gate explanation

Important implementation details:

- the panel is mounted in the right-side inspector area
- tabs are local UI state only; no extra backend requests are made
- `Summary` and `Gates` depend on `result.explanation`
- `Optimization` reads `result.suggestions`
- `Comparison` reads `result.comparison`

#### `frontend/components/GatePalette.tsx`

Responsibilities:

- choose gate type
- expose theta controls for parametric gates
- expose control/target helpers for two-qubit gates
- provide drag source payloads for the builder

#### `frontend/components/CircuitJsonEditor.tsx`

Responsibilities:

- show circuit as editable JSON
- parse several valid JSON shapes
- validate gate structure
- import via `Replace` or `Append`

Accepted forms:

- full circuit object
- object with `gates`
- bare array of gates
- single gate object

#### `frontend/components/AlgorithmSelector.tsx`

Responsibilities:

- browse presets from `frontend/lib/algorithms.json`
- switch across categories
- load preset into active circuit
- drag preset as a component onto the canvas

Important distinction:

- this is a frontend preset library
- it is not the same thing as backend `mode: "algorithm"` execution

#### `frontend/components/VisualizationPanel.tsx`

Responsibilities:

- request step simulation
- manage playback
- render modal visualization
- render live Bloch spheres
- render live histogram from the current step statevector

Important implementation detail:

- step histogram expects statevectors in serialized object form:
  - `{ real: number, imag: number }`

#### `frontend/components/Histogram.tsx`

Responsibilities:

- render distribution charts for circuit results
- toggle between probability and raw counts
- highlight dominant basis state

#### `frontend/components/ComparisonTable.tsx`

Responsibilities:

- compare metrics across circuits `A` and `B`
- explain winners for each metric
- compute a weighted efficiency-style summary

#### `frontend/components/WebSocketStatusBadge.tsx`

Responsibilities:

- render socket state for:
  - `connecting`
  - `connected`
  - `running`
  - `disconnected`
  - `error`

### Frontend utility modules

#### `frontend/lib/gates.ts`

Single source of truth for gate definitions:

- gate type
- label
- category
- color
- parameter support
- two-qubit behavior
- default theta

Supported frontend gates:

- `H`, `X`, `Y`, `Z`
- `S`, `SDG`, `T`, `TDG`
- `RX`, `RY`, `RZ`
- `CNOT`, `CZ`, `SWAP`
- `CRX`, `CRY`, `CRZ`
- `M`, `I`
- `COMPONENT`

#### `frontend/lib/circuit.ts`

Responsibilities:

- serialize circuits for backend transport
- expand components into real gates
- calculate metrics
- compute measurement maps
- compute classical bit probabilities

#### `frontend/lib/quantum.ts`

Responsibilities:

- convert serialized amplitudes
- compute Bloch vectors from a statevector

#### `frontend/hooks/useWebSocket.ts`

Responsibilities:

- maintain shared socket connection
- reconnect on disconnect
- track status and errors
- queue pending requests
- expose `simulateCircuit(...)`

Important implementation detail:

- simulation payloads are passed through unchanged, so new optional fields like `compare_to` do not require special hook logic

## Backend Architecture

### `api/main.py`

Responsibilities:

- define FastAPI app
- configure CORS
- host WebSocket endpoint `/ws`
- parse and validate incoming payloads
- dispatch simulations by mode
- enrich normal simulation results with analysis payloads
- expose `POST /variational/run`

Returned analysis fields:

- `explanation`
- `comparison`
- `suggestions`

### Simulation modes

#### Standard circuit mode

Expected payload:

- `qubits`
- `gates`
- optional `compare_to`

Behavior:

- build circuit
- compile gates
- simulate with Aer
- run explanation / optimization analysis
- optionally compare against `compare_to`
- return counts, optional statevector, depth, gate count, explanation, comparison, and suggestions

#### Step simulation mode

Expected payload:

- `mode: "step_simulation"`
- `qubits`
- `gates`
- optional `compare_to`

Behavior:

- compile gates
- rebuild the circuit prefix for each step
- capture intermediate statevectors when possible
- attach `steps` to final payload
- enrich the final payload with explanation / optimization / optional comparison

### Analysis layer

#### `api/analysis/explainer.py`

Responsibilities:

- evolve statevector gate by gate for deterministic explanations
- build gate-level explanation entries from actual before/after state summaries
- summarize circuit-level behavior including superposition and entanglement cues
- explain dominant measurement outcomes from final amplitudes and counts
- compare circuits using depth, gate count, redundancy penalty, and output similarity
- suggest rule-based simplifications

Current optimization rules:

- `X` followed by `X`
- `H` followed by `H`
- inverse phase pairs like `T` + `TDG`, `S` + `SDG`
- consecutive mergeable rotations
- identity and zero-angle cleanup

#### Algorithm mode

Expected payload:

- `mode: "algorithm"`
- `algorithm`
- optional `params`

Current backend-supported builders:

- `qft`
- `oracle`
- `grover`

Note:

- frontend does not currently use this mode in normal UI flows

### Compiler

#### `api/compiler/gate_compiler.py`

Current notable behavior:

- expands `SWAP` before execution

### Hybrid / variational support

#### `api/hybrid/variational.py`

Exposes a simple theta sweep:

- builds an `RY`-based parameterized circuit
- optionally chains entangling `CX` gates across qubits
- measures all qubits
- computes a simple cost against the all-zero outcome
- returns `best` and `history`

### Statevector policy

- `MAX_STATEVECTOR_QUBITS = 8`
- statevectors are serialized as objects:
  - `{ "real": ..., "imag": ... }`
- large circuits skip statevector payloads to keep responses manageable

## Known Constraints

- Builder max is `6` qubits
- Backend statevector max is `8` qubits
- CORS is currently open to `*`
- Backend Grover diffusion currently supports only `1` or `2` qubits
- The frontend algorithm library and backend algorithm mode are separate concepts
- There is no test suite yet for the current frontend/backend behavior
- The explainer panel will appear empty if the browser is still connected to an older backend instance that predates the analysis payload
- `frontend/.env` or `.env.local` should use `ws://.../ws` or `wss://.../ws`; the frontend now normalizes `http://` to `ws://`, but direct WebSocket URLs are preferred

## Files Worth Opening First

For UI work:

- `frontend/components/CircuitBuilder.tsx`
- `frontend/components/VisualizationPanel.tsx`
- `frontend/components/Histogram.tsx`
- `frontend/components/ComparisonTable.tsx`
- `frontend/components/CircuitJsonEditor.tsx`
- `frontend/store/useCircuitStore.ts`

For backend work:

- `api/main.py`
- `api/compiler/gate_compiler.py`
- `api/algorithms/registry.py`
- `api/hybrid/variational.py`

## Run Commands

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

### Frontend build check

```powershell
cd frontend
npm run build
```

## Recommended Next Work

- Add tests for serialization, gate validation, and simulation response shapes
- Add tests for `api/analysis/explainer.py`
- Add frontend tests that mount `CircuitExplainer` from mocked `useCircuitStore` results
- Tighten production CORS configuration
- Decide whether frontend should directly use backend `mode: "algorithm"`
- Add docs screenshots for builder and visualization
- Consider moving remaining working notes from `working.txt` into `working.md`
