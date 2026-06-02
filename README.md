# QHack Quantum Lab

QHack Quantum Lab is a full-stack quantum circuit workbench for composing, simulating, comparing, and explaining quantum circuits in a browser. It pairs a Next.js frontend with a FastAPI + Qiskit backend and uses a persistent WebSocket channel for low-latency simulation requests.

The product is built around two editable workspaces, `Circuit A` and `Circuit B`. Users can construct circuits manually, import JSON, load algorithm presets, inspect live complexity metrics, run simulations, compare alternatives, and replay intermediate quantum states step by step.

---

## What The Program Does

At a high level, the system supports five major activities:

1. **Circuit Authoring**: Drag-and-drop or click-to-place gates onto a multi-wire SVG canvas. Users can edit parameters, add controls, and place measurement readouts.
2. **Circuit Execution**: Simulates the circuit using the Qiskit Aer backend. The system calculates exact statevectors (when measurements are absent) or performs shot-based sampling ($1024$ shots).
3. **Side-by-Side Comparison**: Computes complexity metrics (depth, gate counts, efficiency scores) and overlaps output distributions using a Bhattacharyya coefficient to evaluate which circuit is more optimized.
4. **Step-by-Step Visualization**: Replays state evolution gate-by-gate, rendering active gate indicators, live Bloch spheres, and intermediate histograms.
5. **Deterministic Explanation and Optimization Analysis**: Evolves the state vector step-by-step to explain physical state changes. It also applies rule-based patterns to suggest circuit optimizations (such as cancelling self-inverses or merging consecutive rotations).

---

## User-Facing Feature Set

### Builder and Canvas Editor
* **Dual Workspace Model**: Toggle between `Circuit A` and `Circuit B` to compare designs side by side.
* **Interactive Canvas**: Renders wires as SVG lines with column alignments.
* **Flexible Input Methods**: Supports click-to-place gate entry, dragging gates from the sidebar palette, or importing circuits from JSON.
* **Component Blocks**: Allows loading algorithms as composite blocks (`COMPONENT`) that sit alongside other gates in the workspace.
* **Probability Meter**: Provides a real-time bar chart showing marginal measurement probabilities for each classical bit.

### Supported Quantum Operations
* **Basic Single-Qubit Gates**: Hadamard (`H`), Pauli-X (`X`), Pauli-Y (`Y`), Pauli-Z (`Z`).
* **Phase Gates**: Phase (`S`), S-Dagger (`SDG`), T-gate (`T`), T-Dagger (`TDG`).
* **Parametric Rotations**: X-Rotation (`RX`), Y-Rotation (`RY`), Z-Rotation (`RZ`).
* **Controlled & Multi-Qubit Gates**: Controlled-X (`CNOT`), Controlled-Z (`CZ`), Swap (`SWAP`), Controlled RX (`CRX`), Controlled RY (`CRY`), Controlled RZ (`CRZ`).
* **Utility Gates**: Measurement (`M`), Identity (`I`).
* **Composite Gates**: Component (`COMPONENT`).

### Preset Algorithm Library
Static algorithm presets are categorized in the selector panel:
* **Quantum Foundations**: Bell State, GHZ State, W State.
* **Search Algorithms**: Grover's Search (2-qubit iteration), Deutsch Algorithm, Deutsch-Jozsa.
* **Fourier Algorithms**: Quantum Fourier Transform (3-qubit), Quantum Phase Estimation.
* **Variational Algorithms**: VQE Ansatz, Layered VQE Ansatz.
* **Linear Algebra**: HHL Concept Demo.
* **Quantum Communication**: Quantum Teleportation, Superdense Coding.
* **Post-Quantum Cryptography**: Kyber Concept Demo, Dilithium Concept Demo.

---

## Directory Map and Codebase Inventory

### Frontend Modules
* [page.tsx](file:///C:/Extra_s/Code/python/QHack/frontend/app/page.tsx): Main entry point mapping the layout grid.
* [CircuitBuilder.tsx](file:///C:/Extra_s/Code/python/QHack/frontend/components/CircuitBuilder.tsx): Canvas editor, grid renderer, and simulation execution controls.
* [AlgorithmSelector.tsx](file:///C:/Extra_s/Code/python/QHack/frontend/components/AlgorithmSelector.tsx): Preset selection UI.
* [VisualizationPanel.tsx](file:///C:/Extra_s/Code/python/QHack/frontend/components/VisualizationPanel.tsx): Playback modal and controls for step-by-step simulation.
* [BlochSphere.tsx](file:///C:/Extra_s/Code/python/QHack/frontend/components/BlochSphere.tsx): SVG-based single-qubit Bloch vector visualizer.
* [CircuitExplainer.tsx](file:///C:/Extra_s/Code/python/QHack/frontend/components/CircuitExplainer.tsx): Displays explanations, optimizations, and comparisons.
* [ComparisonTable.tsx](file:///C:/Extra_s/Code/python/QHack/frontend/components/ComparisonTable.tsx): Frontend metric dashboard.
* [Histogram.tsx](file:///C:/Extra_s/Code/python/QHack/frontend/components/Histogram.tsx): Renders final counts and state probability distributions.
* [useWebSocket.ts](file:///C:/Extra_s/Code/python/QHack/frontend/hooks/useWebSocket.ts): Shared WebSocket transport hook.
* [useCircuitStore.ts](file:///C:/Extra_s/Code/python/QHack/frontend/store/useCircuitStore.ts): State store for circuits and results.
* [useVisualizationStore.ts](file:///C:/Extra_s/Code/python/QHack/frontend/store/useVisualizationStore.ts): State store for visualization playback.
* [circuit.ts](file:///C:/Extra_s/Code/python/QHack/frontend/lib/circuit.ts): Serialization and local metric calculations.
* [gates.ts](file:///C:/Extra_s/Code/python/QHack/frontend/lib/gates.ts): Master gate definitions, properties, and angle parser.
* [quantum.ts](file:///C:/Extra_s/Code/python/QHack/frontend/lib/quantum.ts): Density matrix partial trace and Bloch calculations.

### Backend Modules
* [main.py](file:///C:/Extra_s/Code/python/QHack/api/main.py): FastAPI app hosting WebSocket (`/ws`) and REST (`/variational/run`) endpoints.
* [explainer.py](file:///C:/Extra_s/Code/python/QHack/api/analysis/explainer.py): Context parser, state evolutionary tracker, and scorer.
* [gate_compiler.py](file:///C:/Extra_s/Code/python/QHack/api/compiler/gate_compiler.py): Compiler transpilation (SWAP decomposition).
* [variational.py](file:///C:/Extra_s/Code/python/QHack/api/hybrid/variational.py): Variational parameters sweep.
* [registry.py](file:///C:/Extra_s/Code/python/QHack/api/algorithms/registry.py): Server-side algorithm generator index.

---

## Execution Paths

### 1. Standard Simulation Run
1. The frontend serializes the circuit from `useCircuitStore`.
2. It expands any `COMPONENT` blocks into their primitive gates.
3. The serialized circuit is sent to the backend WebSocket endpoint (`/ws`).
4. The backend compiles the circuit (decomposing `SWAP` gates into CNOTs).
5. The Qiskit Aer simulator runs the circuit.
6. The backend generates explanations, optimization suggestions, and comparisons.
7. The enriched result is returned to the frontend and saved to the store.

### 2. Step-by-Step State Visualization
1. The user clicks "Visualize" on the control panel.
2. The circuit is serialized and sent to the backend with `"mode": "step_simulation"`.
3. The backend runs simulations for each circuit prefix to capture the statevector at every step.
4. The backend returns a list of step states to the frontend.
5. The visualization panel launches a playback modal to step through the state vectors.

---

## Getting Started: Local Installation and Execution

### Prerequisites
* Python 3.10
* Node.js (v18+)
* npm

### Running the Backend
```powershell
# Navigate to the workspace root
cd C:\Extra_s\Code\python\QHack

# Set up and activate virtual environment
python -m venv api\.venv
api\.venv\Scripts\Activate.ps1

# Install requirements
pip install -r api\requirements.txt

# Run the API server
uvicorn api.main:app --reload --host 0.0.0.0 --port 8000
```
The backend server runs on [http://localhost:8000](http://localhost:8000).

### Running the Frontend
```powershell
# Navigate to the frontend directory
cd C:\Extra_s\Code\python\QHack\frontend

# Install dependencies
npm install

# Start the Next.js development server
npm run dev
```
Open [http://localhost:3000](http://localhost:3000) in your browser.

---

## Deep Technical Architecture
For detailed information on the mathematical formulations (such as density matrix calculations, Bloch sphere projection equations, and von Neumann entropy calculations), as well as API schemas and state machine structures, see the [working.md](file:///C:/Extra_s/Code/python/QHack/working.md) documentation.
