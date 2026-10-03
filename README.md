# Q-Insight

Q-Insight is a source-available, browser-based workbench for building, simulating, and visualizing quantum circuits.

> **The hosted demo is currently offline. Run it locally in under 5 minutes using the steps below.**

<!-- TODO: add demo GIF here -->

## Features

- Drag-and-drop circuit canvas (or click-to-place) with two workspaces, Circuit A and Circuit B
- 19 gates plus composite algorithm blocks: H, X, Y, Z, S, S†, T, T†, RX, RY, RZ, CNOT, CZ, SWAP, CRX, CRY, CRZ, measurement, identity
- Step-by-step state evolution with a live Bloch sphere and per-step histograms
- Side-by-side circuit comparison of depth, gate counts, and output distributions
- Preset algorithm library: Bell, GHZ, W, Grover, Deutsch, Deutsch-Jozsa, QFT, QPE, VQE, HHL, teleportation, superdense coding, and more
- Complexity metrics and rule-based optimization suggestions
- JSON import and export of circuits

## Tech stack

- **Frontend:** Next.js, React, TypeScript, Tailwind CSS, Zustand
- **Backend:** FastAPI, Qiskit, Qiskit Aer, NumPy
- **Transport:** WebSocket (`/ws`) for simulation requests

## Quick start

You need **Python 3.10+**, **Node.js 20.9+** (required by the bundled Next.js 16), and npm.

Clone the repo:

```bash
git clone https://github.com/Anchitlahkar/Q-Insight.git
cd Q-Insight
```

**1. Backend** (terminal 1, serves on http://localhost:8000):

```bash
cd api
python -m venv .venv
source .venv/bin/activate        # Windows PowerShell: .venv\Scripts\Activate.ps1
pip install -r requirements.txt
uvicorn main:app --reload --port 8000
```

**2. Frontend** (terminal 2, serves on http://localhost:3000):

```bash
cd frontend
npm install
npm run dev
```

Open http://localhost:3000. The frontend connects to `ws://localhost:8000/ws` by default. To use a different backend, set `NEXT_PUBLIC_WEBSOCKET_URL` (for example in `frontend/.env.local`).

Run `uvicorn` from inside `api/`; the entry point is `main:app`.

## Try this first: a Bell state

1. Open Q-Insight. Circuit A starts with 3 qubits; the third stays in `|0⟩` and can be ignored.
2. Add an **H** gate on qubit 0.
3. Add a **CNOT** with qubit 0 as control and qubit 1 as target.
4. Click **▶ Visualize** and step through the circuit.
5. After H, qubit 0 is in superposition. After CNOT, the two qubits are entangled: the outcomes are `00` or `11`, each with probability 50%, and the individual Bloch vectors shrink toward the center because neither qubit has a pure state on its own.

You can also load **Bell State** from the preset algorithm library.

## Project structure

```
Q-Insight/
├── api/         FastAPI + Qiskit backend (WebSocket /ws, REST /variational/run)
│   ├── algorithms/   Server-side algorithm generators (Grover, QFT, oracle)
│   ├── analysis/     Explanations, optimization suggestions, comparison
│   ├── compiler/     Gate compilation (e.g. SWAP decomposition)
│   └── hybrid/       Variational parameter sweeps
├── frontend/    Next.js app (components, stores, hooks, lib)
├── working.md   Deep technical notes: math, API schemas, state machines
└── LICENSE.md   Apex Source License (ASL) v1.0
```

For the math (density matrices, Bloch projection, entropy) and API schemas, see [working.md](./working.md).

## Contributing

Contributions are welcome, whether that is a bug report, a new preset algorithm, a docs fix, or a UI improvement. Open an issue to discuss an idea, or send a pull request. Keep changes focused and small.

## License

Q-Insight is released under the [Apex Source License (ASL) v1.0](./LICENSE.md). It is source-available: you may view, study, and use it for education, research, and non-commercial purposes with attribution. Commercial use is restricted. Read the license for the full terms.
