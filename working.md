# QHack Working Notes

This document is the engineering-grade architecture and pipeline reference for the current implementation. It is intended to answer:

- what enters the system
- how state moves through the system
- what every major hook, store, component, and backend module does
- what data structures are transformed at each boundary
- what is actually implemented today versus merely scaffolded

Use this as the primary internal handoff document.

## System Model

QHack is a reactive dual-circuit quantum IDE with two distinct execution planes:

1. An interactive browser-side editing plane
2. A backend simulation and analysis plane

Those planes are connected primarily through a shared WebSocket request/response protocol and secondarily through a REST endpoint for variational sweeps.

The design is intentionally split so that:

- the frontend owns rich editing semantics and layout metadata
- the backend owns formal circuit execution and explanatory analysis

## Directory Map

### Frontend

- [`frontend/app/page.tsx`](/c:/Extra_s/Code/python/QHack/frontend/app/page.tsx): top-level composition
- [`frontend/components/AlgorithmSelector.tsx`](/c:/Extra_s/Code/python/QHack/frontend/components/AlgorithmSelector.tsx): preset browser and component loader
- [`frontend/components/CircuitBuilder.tsx`](/c:/Extra_s/Code/python/QHack/frontend/components/CircuitBuilder.tsx): main editor and run surface
- [`frontend/components/CircuitExplainer.tsx`](/c:/Extra_s/Code/python/QHack/frontend/components/CircuitExplainer.tsx): explanation and optimization UI
- [`frontend/components/CircuitJsonEditor.tsx`](/c:/Extra_s/Code/python/QHack/frontend/components/CircuitJsonEditor.tsx): JSON import/export
- [`frontend/components/VisualizationPanel.tsx`](/c:/Extra_s/Code/python/QHack/frontend/components/VisualizationPanel.tsx): step replay pipeline
- [`frontend/components/Histogram.tsx`](/c:/Extra_s/Code/python/QHack/frontend/components/Histogram.tsx): count/probability chart
- [`frontend/components/ComparisonTable.tsx`](/c:/Extra_s/Code/python/QHack/frontend/components/ComparisonTable.tsx): frontend metric comparison
- [`frontend/components/BlochSphere.tsx`](/c:/Extra_s/Code/python/QHack/frontend/components/BlochSphere.tsx): single-qubit visualization
- [`frontend/components/WebSocketStatusBadge.tsx`](/c:/Extra_s/Code/python/QHack/frontend/components/WebSocketStatusBadge.tsx): socket state indicator
- [`frontend/hooks/useWebSocket.ts`](/c:/Extra_s/Code/python/QHack/frontend/hooks/useWebSocket.ts): shared transport hook
- [`frontend/store/useCircuitStore.ts`](/c:/Extra_s/Code/python/QHack/frontend/store/useCircuitStore.ts): primary app state
- [`frontend/store/useVisualizationStore.ts`](/c:/Extra_s/Code/python/QHack/frontend/store/useVisualizationStore.ts): replay state
- [`frontend/lib/circuit.ts`](/c:/Extra_s/Code/python/QHack/frontend/lib/circuit.ts): serialization and metrics
- [`frontend/lib/gates.ts`](/c:/Extra_s/Code/python/QHack/frontend/lib/gates.ts): gate registry
- [`frontend/lib/quantum.ts`](/c:/Extra_s/Code/python/QHack/frontend/lib/quantum.ts): Bloch-vector helpers
- [`frontend/lib/types.ts`](/c:/Extra_s/Code/python/QHack/frontend/lib/types.ts): shared TypeScript contracts
- [`frontend/lib/env.ts`](/c:/Extra_s/Code/python/QHack/frontend/lib/env.ts): WebSocket URL normalization
- [`frontend/lib/algorithms.json`](/c:/Extra_s/Code/python/QHack/frontend/lib/algorithms.json): static preset library

### Backend

- [`api/main.py`](/c:/Extra_s/Code/python/QHack/api/main.py): FastAPI app and runtime dispatch
- [`api/compiler/gate_compiler.py`](/c:/Extra_s/Code/python/QHack/api/compiler/gate_compiler.py): gate preprocessing
- [`api/analysis/explainer.py`](/c:/Extra_s/Code/python/QHack/api/analysis/explainer.py): explanation, comparison, optimization
- [`api/algorithms/registry.py`](/c:/Extra_s/Code/python/QHack/api/algorithms/registry.py): server-side algorithm dispatch
- [`api/algorithms/qft.py`](/c:/Extra_s/Code/python/QHack/api/algorithms/qft.py): QFT builder
- [`api/algorithms/oracle.py`](/c:/Extra_s/Code/python/QHack/api/algorithms/oracle.py): oracle builder
- [`api/algorithms/grover.py`](/c:/Extra_s/Code/python/QHack/api/algorithms/grover.py): Grover builder
- [`api/hybrid/variational.py`](/c:/Extra_s/Code/python/QHack/api/hybrid/variational.py): theta-sweep optimizer

## Runtime Topology

The application has four logical subsystems:

1. Authoring subsystem
2. Transport subsystem
3. Simulation subsystem
4. Analysis and visualization subsystem

### Authoring subsystem

This is the editable canvas experience:

- gate selection
- algorithm loading
- JSON import
- qubit count changes
- circuit switching between `A` and `B`

### Transport subsystem

This is the shared WebSocket layer:

- connection open/close
- reconnect
- queued request dispatch
- status/result/error envelope handling

### Simulation subsystem

This is the Qiskit-backed execution plane:

- circuit compilation
- gate application
- shot-based simulation
- statevector capture
- stepwise prefix execution

### Analysis and visualization subsystem

This is the enrichment and interpretation layer:

- state evolution explanation
- optimization suggestion generation
- backend comparison scoring
- frontend histogram rendering
- frontend Bloch sphere rendering
- step playback and gate highlighting

## Data Shapes And Boundaries

There are three important gate representations in the system.

### 1. Editable gate operation

Defined in [`frontend/lib/types.ts`](/c:/Extra_s/Code/python/QHack/frontend/lib/types.ts) as `GateOperation`.

This is the richest representation and contains UI-only fields:

- `id`
- `type`
- `target`
- optional `control`
- optional `theta`
- optional `classicalTarget`
- optional `label`
- optional `qubits`
- optional `internalCircuit`
- optional `category`
- `position`

### 2. Serialized gate

Defined as `SerializedGate`.

This is what crosses the frontend/backend boundary:

- `type`
- `target`
- optional `control`
- optional `theta`

### 3. Compiled gate

This is the backend post-compiler representation.

Today the compiler mainly affects `SWAP`, which becomes:

1. `CNOT(a, b)`
2. `CNOT(b, a)`
3. `CNOT(a, b)`

That means backend metrics and optimization analysis are performed on compiled gates, not necessarily the exact frontend gate list.

## Frontend State Graph

## `useCircuitStore`

[`frontend/store/useCircuitStore.ts`](/c:/Extra_s/Code/python/QHack/frontend/store/useCircuitStore.ts) is the central application store.

### State fields

- `activeCircuit`
- `circuits`
- `results`
- `socketStatus`
- `socketError`
- `socket`
- `isRunning`

### Actions

- `setActiveCircuit`
- `setQubitCount`
- `addGate`
- `updateGate`
- `removeGate`
- `clearCircuit`
- `setResult`
- `clearResult`
- `setSocketStatus`
- `setSocketError`
- `setSocket`
- `setIsRunning`
- `loadMockData`
- `loadAlgorithm`
- `loadAlgorithmComponent`

### Important implementation behavior

- `MAX_QUBITS` is `6`
- changing qubit count drops gates that reference now-invalid qubits
- measurement gates default `classicalTarget` to `target`
- component operations are normalized with `qubits` and `label`
- `loadAlgorithm(...)` replaces the active circuit with positioned primitive gates
- `loadAlgorithmComponent(...)` inserts a composite block and expands qubit count if required

## `useVisualizationStore`

[`frontend/store/useVisualizationStore.ts`](/c:/Extra_s/Code/python/QHack/frontend/store/useVisualizationStore.ts) is a dedicated replay store.

### State fields

- `currentStep`
- `visualizationResult`
- `isVisualizing`
- `isPlaying`
- `speedMs`
- `modalOpen`

### Actions

- `setCurrentStep`
- `setVisualizationResult`
- `setIsVisualizing`
- `setIsPlaying`
- `setSpeedMs`
- `setModalOpen`
- `resetVisualization`

### Important implementation behavior

- `currentStep` starts at `-1`
- `speedMs` defaults to `600`
- visualization state is reset whenever the active circuit, gate list, or qubit count changes in `VisualizationPanel`

## Transport Hook

[`frontend/hooks/useWebSocket.ts`](/c:/Extra_s/Code/python/QHack/frontend/hooks/useWebSocket.ts) is not just a React hook; it is effectively a shared client-side socket manager with module-level singleton state.

### Shared module state

- `listeners`
- `pendingRequests`
- `sharedSocket`
- `reconnectTimeout`
- `reconnectAttempts`
- `activeUrl`
- `shouldReconnect`
- `skipReconnect`
- `sharedState`

### Shared state fields

- `status`
- `error`
- `isLoading`
- `statusMessage`
- `latencyMs`
- `lastCompletedAt`

### Operational semantics

- the first mounted consumer opens the socket
- additional consumers subscribe to the same socket state
- request promises are resolved in the order `result` messages arrive
- each request is pushed into `pendingRequests` before `send`
- `status` messages transition the shared state to `running`
- `result` messages shift one pending promise and resolve it
- `error` messages reject one pending promise
- reconnect backoff doubles until capped at `8000ms`
- if the final listener unmounts, the socket is closed

### Design consequence

Because the queue is global, independent components can safely share the same connection, but application-level assumptions depend on response ordering matching request ordering.

## Frontend Authoring Pipeline

## Gate selection and placement

Most editing behavior lives in [`frontend/components/CircuitBuilder.tsx`](/c:/Extra_s/Code/python/QHack/frontend/components/CircuitBuilder.tsx).

### Local component state in `CircuitBuilder`

- `selectedGate`
- `controlQubit`
- `targetQubit`
- `theta`
- `dragOverKey`
- `previewItem`
- `connectionDraft`
- `zoom`
- `explainerCollapsed`
- `highlightedGateIdx`

### Placement model

The builder uses a column-and-lane grid:

- columns are derived from `position.x`
- lanes are derived from qubit index
- the circuit is rendered as SVG

### Placement constraints

`canOccupy(...)` prevents illegal placement when:

- a qubit already has an operation in that column
- the new operation would be placed after a measurement on that qubit

### Two-qubit workflow

Two-qubit gates can be created in two ways:

- click workflow
- drag/drop workflow

For click placement:

1. first pivot click stores `connectionDraft`
2. second pivot click finalizes the two-qubit operation

For drag/drop placement:

- the builder uses `controlQubit` and `targetQubit` helper state from the palette

### Delete behavior

Placed operations are deleted by clicking them directly on the canvas.

## Gate palette behavior

`GatePalette` is the authoring control surface for:

- gate selection
- control-qubit selection
- target-qubit selection
- theta selection

The palette is driven by [`frontend/lib/gates.ts`](/c:/Extra_s/Code/python/QHack/frontend/lib/gates.ts), which is the single gate metadata registry.

### Gate metadata defined there

- display label
- long description
- category
- color
- whether the gate is parametric
- whether the gate is two-qubit
- default theta

### Helper functions exposed there

- `isTwoQubitGate`
- `isParametricGate`
- `isMeasureGate`
- `isComponentType`
- `getGateLabel`
- `getDefaultTheta`
- `formatTheta`
- `parseTheta`

## Algorithm ingestion pipeline

[`frontend/components/AlgorithmSelector.tsx`](/c:/Extra_s/Code/python/QHack/frontend/components/AlgorithmSelector.tsx) loads static preset algorithms.

### Source

- [`frontend/lib/algorithms.json`](/c:/Extra_s/Code/python/QHack/frontend/lib/algorithms.json)

### Category model

Presets are grouped into named categories such as:

- quantum foundations
- search
- Fourier
- variational
- communication
- post-quantum

### Actions offered by each tile

- `Component`
- `Expanded`

### Expanded path

`loadAlgorithm(...)`:

- validates qubit and gate structure
- assigns positions by lane cursor
- replaces the active circuit
- clears the old result for that circuit

### Component path

`loadAlgorithmComponent(...)`:

- validates the algorithm
- inserts a `COMPONENT` gate
- preserves the surrounding circuit
- may expand circuit qubit count

### Important distinction

This frontend algorithm library is separate from backend `mode: "algorithm"`.

## JSON ingestion pipeline

[`frontend/components/CircuitJsonEditor.tsx`](/c:/Extra_s/Code/python/QHack/frontend/components/CircuitJsonEditor.tsx) is the secondary authoring input surface.

### Accepted input shapes

- full circuit object: `{ "qubits": 3, "gates": [...] }`
- object with `gates`
- bare array of gates
- single gate object

### Type aliases accepted by parser

Examples:

- `cx` -> `CNOT`
- `measure` -> `M`
- `identity` -> `I`
- `rx`, `ry`, `rz`
- `crx`, `cry`, `crz`

### Validation performed

- JSON syntax validity
- known gate type
- valid target index
- valid control index for two-qubit gates
- distinct control/target
- numeric `theta` for parametric gates
- qubit count range `1-10` in input, later clamped by frontend replace logic

### Commit modes

#### Replace

- clears the active circuit
- sets qubit count
- assigns new positions from column `0`
- loads all parsed gates

#### Append

- preserves the existing circuit
- finds the last occupied column
- appends parsed gates after that column
- grows qubit count if needed, up to `6`

## Serialization pipeline

[`frontend/lib/circuit.ts`](/c:/Extra_s/Code/python/QHack/frontend/lib/circuit.ts) is the main shape-conversion module.

### `getOperationQubits(...)`

- returns all qubits touched by a gate
- for `COMPONENT`, returns the component qubit span

### `expandCircuit(...)`

- sorts gates by `position.x`
- expands component internal circuits
- offsets inner gate qubit indices by the component target
- preserves `sourceOperationId` so UI highlighting can map back to the parent operation

### `serializeCircuit(...)`

- strips `sourceOperationId`
- returns `{ qubits, gates }`

### `calculateMetrics(...)`

Computes frontend-only structural metrics:

- gate count
- depth
- two-qubit gate count
- two-qubit layer depth
- weighted efficiency score

### `getMeasurementMap(...)`

- finds the earliest measurement on each qubit
- assigns the classical bit mapping used by the UI

### `getClassicalBitProbabilities(...)`

- converts counts to per-classical-bit marginals
- powers the Probability Meter

## Execution Requests

## Single-circuit run path

In `CircuitBuilder`, `runSingleCircuit(key)`:

1. reads the requested circuit from the store
2. determines the opposite circuit key
3. serializes the requested circuit
4. serializes the opposite circuit as `compare_to`
5. calls `simulateCircuit(...)`
6. stores the result under that circuit key

### Important nuance

This means a plain `Run A` is not purely isolated; it also asks the backend to compare `A` against `B`.

## `A vs B` path

The `A vs B` button triggers:

- `runSingleCircuit("A")`
- `runSingleCircuit("B")`

This is two separate asynchronous requests, not one combined request.

### Consequences

- each circuit's result object is updated independently
- frontend `isRunning` is shared, so the final visible timing depends on request completion order
- backend `comparison` is stored in each circuit result separately

## Step visualization request path

`VisualizationPanel.startVisualization()` does:

1. serialize active circuit
2. send `{ mode: "step_simulation", ...serializedCircuit }`
3. store the returned result in `visualizationResult`
4. set `currentStep = 0`
5. set `isVisualizing = true`
6. set `isPlaying = true`
7. open the modal

## Visualization playback internals

The replay loop in `VisualizationPanel` uses:

- `playingRef`
- `speedRef`
- `tokenRef`

This avoids stale closure issues while stepping through the returned `steps[]`.

### Playback behavior

- play begins from current or first step
- each loop iteration sets `currentStep`
- waits `speedMs`
- advances to the next step
- on completion, playback stops and visualization mode is cleared

### Modal behavior

- `Escape` closes the modal
- clicking the backdrop closes the modal
- the inline panel remains as a compact entry point

### Visualization outputs

- `MiniCircuitSVG` highlights the active gate
- `BlochSphere` renders one sphere per qubit
- `LiveHistogram` reconstructs basis-state probabilities from the current step statevector

## Backend Request Handling

## WebSocket endpoint

[`api/main.py`](/c:/Extra_s/Code/python/QHack/api/main.py) defines `/ws`.

### Request loop

For each text message:

1. parse JSON
2. require object payload
3. send `{ type: "status", message: "Circuit received" }`
4. run simulation
5. send `{ type: "result", payload: result }`

### Error handling

The endpoint catches:

- JSON parse issues
- missing fields
- type errors
- value errors
- unexpected internal exceptions

Expected client-visible errors are returned as `type: "error"`.

## Backend gate validation helpers

`api/main.py` includes:

- `require_fields(...)`
- `require_theta(...)`
- `require_control_target(...)`

These enforce:

- required gate fields
- numeric theta
- integer control/target
- distinct control and target

## Simulation modes

## Default circuit mode

Input:

- `qubits`
- `gates`
- optional `compare_to`

Path:

1. compile gates
2. build `QuantumCircuit(qubits, qubits)`
3. apply all gates
4. run shot-based simulation
5. maybe capture statevector
6. enrich with explanation, comparison, and suggestions

## Step simulation mode

Input:

- `mode: "step_simulation"`
- `qubits`
- `gates`
- optional `compare_to`

Path:

1. compile gates
2. rebuild a fresh prefix circuit for each compiled gate index
3. attempt `save_statevector()` on each prefix
4. store `{ gate_index, gate_type, statevector }` in `steps`
5. separately compute the final result for the full circuit
6. enrich final result with analysis

### Important nuance

`steps` are indexed over compiled gates, not raw frontend gates. A `SWAP` therefore occupies three backend steps.

## Algorithm mode

Input:

- `mode: "algorithm"`
- `algorithm`
- optional `params`

Path:

1. dispatch to `build_algorithm(...)`
2. receive generated `{ qubits, gates }`
3. build and simulate the circuit
4. enrich results

Current registered names:

- `qft`
- `oracle`
- `grover`

## Backend Simulation Semantics

## Circuit construction

`build_circuit_from_gates(...)`:

- creates `QuantumCircuit(qubits, qubits)`
- compiles the gate list
- applies each compiled gate to the circuit

## Gate application coverage

`apply_gate(...)` currently covers:

- `H`, `X`, `Y`, `Z`
- `CNOT`
- `M`
- `S`, `SDG`, `T`, `TDG`
- `RX`, `RY`, `RZ`
- `CZ`, `SWAP`
- `CRX`, `CRY`, `CRZ`
- `I`

Unsupported types raise `ValueError`.

## Statevector capture policy

- max qubits: `8`
- standard mode captures a statevector only when there are no measurements
- statevectors are serialized as `{ real, imag }`
- step mode attempts per-prefix capture using a copied circuit and `save_statevector()`
- if capture fails, the step statevector is `null`

## Analysis Engine Internals

[`api/analysis/explainer.py`](/c:/Extra_s/Code/python/QHack/api/analysis/explainer.py) is the most research-oriented module in the backend.

## High-level responsibilities

- explain a single circuit
- compare two circuits
- suggest optimizations

## `_analyze_circuit(...)`

This is the core internal pipeline:

1. extract qubit count
2. compile gates
3. initialize `Statevector |0...0>`
4. iterate gate by gate
5. evolve coherent state for non-measurement gates
6. emit special explanation entries for measurement gates
7. compute final measurement probabilities from the pre-measurement state
8. build summary and measurement insight
9. attach optimization suggestions

## Measurement treatment

Measurement gates are not used to collapse the tracked coherent state. Instead, the analysis layer:

- computes `P(0)` and `P(1)` for the measured qubit
- records the pre-measurement state in both `before_state` and `after_state`
- explains measurement as sampling from the current amplitude distribution

This is pedagogically useful because it preserves the coherent story up to readout.

## Gate explanation construction

Each non-measurement gate produces:

- `gate`
- `target`
- optional `control`
- `before_state`
- `after_state`
- `technical`
- `intuitive`
- `effect`

### Technical text includes

- dominant basis summary before gate
- dominant basis summary after gate
- rotation angle when relevant
- control/target description when relevant
- moved basis-state amplitudes when detectable

### Intuitive text differs by gate family

- `H` emphasizes branching/interference preparation
- Pauli gates emphasize flips or phase shifts
- controlled gates emphasize conditional branch modification
- rotations emphasize exact theta-driven population change
- `I` explains no-op behavior explicitly

## Circuit summary generation

`_build_circuit_summary(...)` synthesizes:

- whether the final state has support on multiple basis states
- whether any entangled qubit pairs are detected
- the dominant measured basis states
- whether controlled operations contributed to the observed structure

### Entanglement heuristic

Entanglement is detected by:

- converting the state to a density matrix
- tracing out all but one qubit at a time
- computing single-qubit Von Neumann entropy
- marking pairs with non-zero reduced entropy

This is a lightweight but meaningful pedagogical signal for small systems.

## Measurement insight generation

`_build_measurement_insight(...)` combines:

- exact probabilities derived from the final coherent state
- shot-based counts when available
- a gate-sequence narrative from `_gate_story(...)`

Special narrative cases include:

- `H` followed by `CNOT`
- circuits containing `CNOT`
- circuits containing `CZ`
- circuits containing rotation gates

## Optimization engine

`suggest_optimizations(...)` operates on compiled gates.

### Current rule families

- identity gate removal
- zero-angle rotation removal
- self-inverse cancellation
- inverse phase pair cancellation
- mergeable consecutive rotations

### Important implication

Because optimization is run after compilation, a frontend `SWAP` may generate suggestions about the compiled `CNOT` sequence rather than about `SWAP` as a symbolic operation.

## Backend comparison engine

`compare_circuits(...)` analyzes both circuits independently, then computes:

- per-circuit depth
- per-circuit gate count
- redundancy penalty
- number of non-zero basis states
- output distribution similarity
- weighted comparison score

### Score weights

- depth: `0.4`
- gate count: `0.25`
- redundancy penalty: `0.2`
- output similarity: `0.15`

### Output similarity

Similarity is computed using a Bhattacharyya-style overlap:

- sum over `sqrt(p_a * p_b)` across all states

### Return payload

- `winner`
- `reasoning`
- `metrics.A`
- `metrics.B`
- `output_similarity`
- `score_gap`
- `scoring`

## Frontend Output Surfaces

## Histograms

[`frontend/components/Histogram.tsx`](/c:/Extra_s/Code/python/QHack/frontend/components/Histogram.tsx) renders the final counts distribution for each circuit.

### Behavior

- generates the full `2^n` basis-state axis
- fills missing states with zero counts
- toggles between probability and raw counts
- highlights the dominant observed state
- shows a skeleton while running and no data is present

## Probability meter

Embedded inside `CircuitBuilder`, the Probability Meter:

- inspects measurement placement via `getMeasurementMap(...)`
- converts counts into classical bit marginals
- renders one horizontal bar per classical bit

This is a distinctly classical readout derived from the quantum result distribution.

## Explainer

[`frontend/components/CircuitExplainer.tsx`](/c:/Extra_s/Code/python/QHack/frontend/components/CircuitExplainer.tsx) is the main analysis consumer.

### Tabs

- `Summary`
- `Gates`
- `Optimize`
- conditional `A vs B`

### Behavior

- if explanation is absent, it renders targeted fallback text
- gate explanation cards are collapsed by default
- opening a gate explanation can highlight the corresponding operation on the canvas

## Frontend comparison table

[`frontend/components/ComparisonTable.tsx`](/c:/Extra_s/Code/python/QHack/frontend/components/ComparisonTable.tsx) computes its own local metrics from frontend structure and latest result objects.

### This module is not the same as backend comparison

It uses:

- `calculateMetrics(...)`
- measured-state counts from results
- statevector length where present

It produces:

- a local winner badge
- per-row winner annotations
- high-level comparative insights

This is best understood as a UX-facing complexity dashboard rather than a formal backend adjudication.

## Hooks And Integration Points

The user asked for hooks and extension points explicitly, so this section lists them directly.

## React hooks in active use

### `useCircuitStore(...)`

Used throughout the UI to subscribe to shared circuit state.

### `useVisualizationStore(...)`

Used by visualization and builder highlighting paths.

### `useWebSocket(...)`

Used by:

- `CircuitBuilder`
- `VisualizationPanel`

### Local React hooks heavily used

- `useState`
- `useMemo`
- `useCallback`
- `useEffect`
- `useRef`

## Integration hooks between subsystems

### Builder -> serializer

- `serializeCircuit(...)`
- `expandCircuit(...)`

### Builder -> transport

- `simulateCircuit(...)`

### Result -> analysis UI

- `results[activeCircuit].explanation`
- `results[activeCircuit].suggestions`
- `results[activeCircuit].comparison`

### Result -> charts

- `results[A|B].counts`
- `results[A|B].statevector`

### Visualization -> builder highlighting

- `currentStep`
- expanded gate `sourceOperationId`

### Explainer -> builder highlighting

- `highlightedGateIdx`
- expanded gate `sourceOperationId`

## Inbound And Outbound Data Summary

## Inputs into the program

- user clicks
- drag/drop payloads
- algorithm presets
- JSON text
- WebSocket request payloads
- REST variational payloads
- environment variable `NEXT_PUBLIC_WEBSOCKET_URL`

## Outputs from the program

- rendered circuit diagrams
- final histograms
- live probability meter
- explanation cards
- optimization suggestions
- comparison metrics
- Bloch spheres
- step histograms
- WebSocket status messages
- REST variational response objects

## Non-obvious implementation facts

- `CircuitBuilder` uses the opposite circuit as `compare_to` even on a normal run
- visualization steps are indexed over compiled gates, not raw UI gates
- `ComparisonTable` winner can differ from backend `comparison.winner` because they use different scoring models
- analysis does not collapse the coherent state when describing measurement gates
- `CircuitJsonEditor` accepts more than one JSON shape and silently repositions imported gates into valid columns
- `frontend/lib/env.ts` rewrites `http` URLs into WebSocket URLs
- `modalOpen` exists in `useVisualizationStore`, but `VisualizationPanel` currently controls modal visibility through local component state

## Constraints, Risks, And Gaps

### Hard constraints

- frontend qubit ceiling: `6`
- backend statevector ceiling: `8`
- standard result statevectors unavailable once measurements are present
- open CORS policy

### Architectural gaps

- no automated test suite is present for the documented pipeline
- backend algorithm mode is not surfaced as a first-class frontend execution path
- variational REST mode is not wired into the UI
- no persistence layer for circuits or sessions
- no authentication or multitenancy concerns are implemented

### Documentation caveat

Some UX copy and comments in the source are aspirational or design-oriented. This document tracks executable behavior in code as of the current repo state.

## Local Run And Deployment Pointers

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

### Deployment files

- [`api/Procfile`](/c:/Extra_s/Code/python/QHack/api/Procfile)
- [`api/runtime.txt`](/c:/Extra_s/Code/python/QHack/api/runtime.txt)
- [`api/requirements.txt`](/c:/Extra_s/Code/python/QHack/api/requirements.txt)

Current Procfile command:

```text
web: uvicorn main:app --host 0.0.0.0 --port $PORT
```

## Recommended Next Engineering Work

- add backend tests for all simulation modes
- add deterministic snapshot tests for explanation payloads
- add frontend tests for serialization, JSON import, and chart rendering
- unify local and backend comparison semantics or document their intentional separation in the UI
- expose backend algorithm mode from the frontend where useful
- add a frontend surface for the variational endpoint
- add observability around socket queue depth and request latency
