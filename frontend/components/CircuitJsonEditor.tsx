"use client";

// ─────────────────────────────────────────────────────────────────────────────
// CircuitJsonEditor.tsx
//
// Editable circuit JSON panel. Accepts:
//   • Full circuit  : { "qubits": 3, "gates": [...] }
//   • Gates-only    : { "gates": [...] }
//   • Bare array    : [ { "type": "H", "target": 0 }, ... ]
//   • Single gate   : { "type": "H", "target": 0 }
//
// Two commit modes:
//   Replace — clears the circuit, sets qubit count, loads all gates
//   Append  — leaves existing gates, adds new ones after them
//
// The textarea tracks "dirty" state: while the user is editing,
// live circuit changes (from clicking the canvas) don't overwrite their draft.
// ─────────────────────────────────────────────────────────────────────────────

import {
  memo,
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";
import { GATE_MAP, GateType, isParametricGate, isTwoQubitGate } from "@/lib/gates";
import { CircuitKey, GateOperation } from "@/lib/types";
import { useCircuitStore } from "@/store/useCircuitStore";

// ── Constants ─────────────────────────────────────────────────────────────────
const COL_W  = 68;   // must match CircuitBuilder
const LANE_H = 84;

// ── Type aliases used only inside this file ───────────────────────────────────
type ParsedGate = {
  type: GateType;
  target: number;
  control?: number;
  theta?: number;
};

type ParseResult =
  | { ok: true;  qubits: number | null; gates: ParsedGate[] }
  | { ok: false; message: string; line?: number };

// ── Known type aliases (lowercase / alternate spellings → canonical) ──────────
const TYPE_ALIASES: Record<string, GateType> = {
  cx:      "CNOT",
  ccx:     "CNOT",
  cz:      "CZ",
  swap:    "SWAP",
  hadamard:"H",
  pauli_x: "X",
  pauli_y: "Y",
  pauli_z: "Z",
  measure: "M",
  m:       "M",
  id:      "I",
  identity:"I",
  sdg:     "SDG",
  tdg:     "TDG",
  rx:      "RX",
  ry:      "RY",
  rz:      "RZ",
  crx:     "CRX",
  cry:     "CRY",
  crz:     "CRZ",
};

function normalizeGateType(raw: unknown): GateType | null {
  if (typeof raw !== "string") return null;
  const up = raw.toUpperCase() as GateType;
  if (GATE_MAP.has(up)) return up;
  const aliased = TYPE_ALIASES[raw.toLowerCase()];
  if (aliased) return aliased;
  return null;
}

// ── Core parser ───────────────────────────────────────────────────────────────
function parseCircuitJson(text: string): ParseResult {
  // 1. Parse JSON
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch (e) {
    const msg = e instanceof SyntaxError ? e.message : "Invalid JSON";
    // Extract line number from Chrome/FF error messages
    const lineMatch = msg.match(/line (\d+)/i);
    return { ok: false, message: `JSON parse error: ${msg}`, line: lineMatch ? Number(lineMatch[1]) : undefined };
  }

  // 2. Normalise to { qubits, rawGates }
  let qubits: number | null = null;
  let rawGates: unknown[];

  if (Array.isArray(parsed)) {
    // Bare array of gate objects
    rawGates = parsed;
  } else if (parsed !== null && typeof parsed === "object") {
    const obj = parsed as Record<string, unknown>;

    // Extract optional qubits
    if ("qubits" in obj) {
      const q = obj["qubits"];
      if (typeof q !== "number" || !Number.isInteger(q) || q < 1 || q > 10) {
        return { ok: false, message: `"qubits" must be an integer between 1 and 10 (got ${JSON.stringify(q)})` };
      }
      qubits = q;
    }

    // Extract gates
    if ("gates" in obj) {
      if (!Array.isArray(obj["gates"])) {
        return { ok: false, message: '"gates" must be an array' };
      }
      rawGates = obj["gates"] as unknown[];
    } else if ("type" in obj) {
      // Single gate object
      rawGates = [parsed];
    } else {
      return { ok: false, message: 'Expected an object with a "gates" array, an array of gates, or a single gate object' };
    }
  } else {
    return { ok: false, message: "Expected a JSON object or array" };
  }

  if (rawGates.length === 0) {
    return { ok: false, message: "No gates found — the gates array is empty" };
  }

  // 3. Validate each gate
  const gates: ParsedGate[] = [];
  for (let i = 0; i < rawGates.length; i++) {
    const raw = rawGates[i];
    const idx = i + 1; // 1-based for error messages

    if (raw === null || typeof raw !== "object" || Array.isArray(raw)) {
      return { ok: false, message: `Gate ${idx}: expected an object` };
    }

    const g = raw as Record<string, unknown>;

    // type
    const gtype = normalizeGateType(g["type"]);
    if (!gtype) {
      const given = JSON.stringify(g["type"]);
      const valid = [...GATE_MAP.keys()].join(", ");
      return { ok: false, message: `Gate ${idx}: unknown type ${given}. Valid types: ${valid}` };
    }

    // target
    if (!("target" in g)) {
      return { ok: false, message: `Gate ${idx} (${gtype}): missing required field "target"` };
    }
    const target = g["target"];
    if (typeof target !== "number" || !Number.isInteger(target) || target < 0) {
      return { ok: false, message: `Gate ${idx} (${gtype}): "target" must be a non-negative integer (got ${JSON.stringify(target)})` };
    }

    // control (optional but required for two-qubit gates)
    let control: number | undefined;
    if ("control" in g) {
      const ctrl = g["control"];
      if (typeof ctrl !== "number" || !Number.isInteger(ctrl) || ctrl < 0) {
        return { ok: false, message: `Gate ${idx} (${gtype}): "control" must be a non-negative integer` };
      }
      if (ctrl === target) {
        return { ok: false, message: `Gate ${idx} (${gtype}): "control" and "target" must be different qubits` };
      }
      control = ctrl;
    } else if (isTwoQubitGate(gtype)) {
      return { ok: false, message: `Gate ${idx} (${gtype}): two-qubit gates require a "control" field` };
    }

    // theta (required for parametric gates)
    let theta: number | undefined;
    if ("theta" in g) {
      const t = g["theta"];
      if (typeof t !== "number" || !Number.isFinite(t)) {
        return { ok: false, message: `Gate ${idx} (${gtype}): "theta" must be a finite number in radians` };
      }
      theta = t;
    } else if (isParametricGate(gtype)) {
      return { ok: false, message: `Gate ${idx} (${gtype}): parametric gates require a "theta" field` };
    }

    gates.push({ type: gtype, target, control, theta });
  }

  return { ok: true, qubits, gates };
}

// ── Auto-assign column positions ──────────────────────────────────────────────
// Packs gates left-to-right, advancing per-qubit cursors to avoid overlap.
function assignPositions(gates: ParsedGate[], startCol = 0): GateOperation[] {
  // cursor[q] = next free column for qubit q
  const cursor: Record<number, number> = {};
  const getCursor = (q: number) => cursor[q] ?? startCol;
  const advance   = (q: number, to: number) => { cursor[q] = Math.max(getCursor(q), to) + 1; };

  return gates.map((g) => {
    const qubits = g.control !== undefined ? [g.target, g.control] : [g.target];
    // The column is the max cursor across all involved qubits
    const col = Math.max(...qubits.map(getCursor));
    qubits.forEach((q) => advance(q, col));

    return {
      id: `${g.type.toLowerCase()}-import-${Date.now()}-${Math.floor(Math.random() * 99999)}`,
      type: g.type,
      target: g.target,
      ...(g.control  !== undefined ? { control: g.control }   : {}),
      ...(g.theta    !== undefined ? { theta: g.theta }        : {}),
      position: { x: col * COL_W, y: g.target * LANE_H },
    };
  });
}

// ── Tooltip ───────────────────────────────────────────────────────────────────
type ToastKind = "success" | "error" | "info";
function Toast({ kind, message }: { kind: ToastKind; message: string }) {
  const colors: Record<ToastKind, { border: string; bg: string; text: string }> = {
    success: { border: "rgba(0,229,160,0.35)",  bg: "rgba(0,229,160,0.08)",  text: "#00e5a0" },
    error:   { border: "rgba(255,92,122,0.35)", bg: "rgba(255,92,122,0.08)", text: "#ff5c7a" },
    info:    { border: "rgba(0,212,255,0.25)",  bg: "rgba(0,212,255,0.07)",  text: "rgba(0,212,255,0.7)" },
  };
  const c = colors[kind];
  return (
    <div style={{
      border: `1px solid ${c.border}`,
      background: c.bg,
      borderRadius: 9,
      padding: "7px 11px",
      fontFamily: "JetBrains Mono, monospace",
      fontSize: 9.5,
      color: c.text,
      lineHeight: 1.5,
      letterSpacing: "0.02em",
      wordBreak: "break-word",
    }}>
      {message}
    </div>
  );
}

// ── Icon buttons ──────────────────────────────────────────────────────────────
function IconBtn({
  label, title, onClick, color = "rgba(200,223,242,0.4)",
}: {
  label: string; title: string; onClick: () => void; color?: string;
}) {
  const [hov, setHov] = useState(false);
  return (
    <button
      type="button"
      title={title}
      onClick={onClick}
      onMouseEnter={() => setHov(true)}
      onMouseLeave={() => setHov(false)}
      style={{
        background: hov ? "rgba(255,255,255,0.05)" : "transparent",
        border: "1px solid rgba(255,255,255,0.07)",
        borderRadius: 7,
        padding: "3px 9px",
        fontFamily: "JetBrains Mono, monospace",
        fontSize: 9.5,
        color: hov ? "#c8dff2" : color,
        cursor: "pointer",
        transition: "all 0.12s",
        letterSpacing: "0.04em",
        whiteSpace: "nowrap",
      }}
    >
      {label}
    </button>
  );
}

// ── Main component ────────────────────────────────────────────────────────────
interface CircuitJsonEditorProps {
  circuitKey: CircuitKey;
}

export const CircuitJsonEditor = memo(function CircuitJsonEditor({
  circuitKey,
}: CircuitJsonEditorProps) {
  const circuit        = useCircuitStore((s) => s.circuits[circuitKey]);
  const addGate        = useCircuitStore((s) => s.addGate);
  const clearCircuit   = useCircuitStore((s) => s.clearCircuit);
  const setQubitCount  = useCircuitStore((s) => s.setQubitCount);

  // ── Draft state ──────────────────────────────────────────────────────────────
  // liveJson  : always-fresh serialization of the store (never set by user)
  // draft     : what's in the textarea (may diverge when user edits)
  // isDirty   : draft ≠ liveJson (user has unsaved edits)
  const [isDirty,  setIsDirty]  = useState(false);
  const [toast,    setToast]    = useState<{ kind: ToastKind; msg: string } | null>(null);
  const toastTimerRef           = useRef<ReturnType<typeof setTimeout> | null>(null);
  const textareaRef             = useRef<HTMLTextAreaElement>(null);

  // ── Live JSON (derived from store, never user-edited) ─────────────────────────
  const liveJson = JSON.stringify(
    {
      qubits: circuit.qubits,
      gates: circuit.gates.map(({ type, target, control, theta }) => ({
        type,
        target,
        ...(control !== undefined ? { control } : {}),
        ...(theta   !== undefined ? { theta }   : {}),
      })),
    },
    null,
    2
  );

  // ── Sync textarea with live JSON when NOT dirty ───────────────────────────────
  useEffect(() => {
    if (!isDirty && textareaRef.current) {
      textareaRef.current.value = liveJson;
    }
  }, [liveJson, isDirty]);

  // ── Flash a toast, auto-clear after `ms` ms ───────────────────────────────────
  const showToast = useCallback((kind: ToastKind, msg: string, ms = 3000) => {
    if (toastTimerRef.current) clearTimeout(toastTimerRef.current);
    setToast({ kind, msg });
    if (ms > 0) {
      toastTimerRef.current = setTimeout(() => setToast(null), ms);
    }
  }, []);

  // ── Copy to clipboard ─────────────────────────────────────────────────────────
  const handleCopy = useCallback(() => {
    const text = textareaRef.current?.value ?? liveJson;
    navigator.clipboard.writeText(text).then(() => showToast("info", "Copied to clipboard", 1800));
  }, [liveJson, showToast]);

  // ── Discard draft, revert to live JSON ───────────────────────────────────────
  const handleReset = useCallback(() => {
    if (textareaRef.current) textareaRef.current.value = liveJson;
    setIsDirty(false);
    setToast(null);
  }, [liveJson]);

  // ── Core apply logic ─────────────────────────────────────────────────────────
  const applyJson = useCallback(
    (mode: "replace" | "append") => {
      const raw = textareaRef.current?.value ?? "";
      const result = parseCircuitJson(raw);

      if (!result.ok) {
        showToast("error", result.message, 0); // 0 = sticky until next action
        return;
      }

      const { qubits: parsedQubits, gates: parsedGates } = result;

      if (mode === "replace") {
        // Determine qubit count: parsed > inferred from gate indices > current
        const maxGateQubit = parsedGates.reduce((m, g) => {
          const maxQ = g.control !== undefined ? Math.max(g.target, g.control) : g.target;
          return Math.max(m, maxQ);
        }, 0);
        const newQubits = parsedQubits ?? Math.max(circuit.qubits, maxGateQubit + 1);

        clearCircuit(circuitKey);
        setQubitCount(circuitKey, Math.min(newQubits, 6)); // cap at MAX_QUBITS
        const ops = assignPositions(parsedGates, 0);
        ops.forEach((g) => addGate(circuitKey, g));

        showToast(
          "success",
          `Replaced circuit · ${ops.length} gate${ops.length !== 1 ? "s" : ""} loaded`,
        );
      } else {
        // Append: find the rightmost column currently occupied
        const lastCol = circuit.gates.reduce((m, g) => {
          const col = Math.max(0, Math.round(g.position.x / COL_W));
          return Math.max(m, col);
        }, -1);
        const startCol = lastCol + 1;

        // Widen qubit count if necessary
        const maxGateQubit = parsedGates.reduce((m, g) => {
          const maxQ = g.control !== undefined ? Math.max(g.target, g.control) : g.target;
          return Math.max(m, maxQ);
        }, 0);
        if (maxGateQubit >= circuit.qubits) {
          setQubitCount(circuitKey, Math.min(maxGateQubit + 1, 6));
        }

        const ops = assignPositions(parsedGates, startCol);
        ops.forEach((g) => addGate(circuitKey, g));

        showToast(
          "success",
          `Appended ${ops.length} gate${ops.length !== 1 ? "s" : ""}`,
        );
      }

      setIsDirty(false);
    },
    [addGate, circuitKey, circuit.gates, circuit.qubits, clearCircuit, setQubitCount, showToast]
  );

  // ── Keyboard shortcut: Ctrl/Cmd+Enter → Replace ───────────────────────────────
  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
      if ((e.ctrlKey || e.metaKey) && e.key === "Enter") {
        e.preventDefault();
        applyJson("replace");
      }
    },
    [applyJson]
  );

  const handleChange = useCallback(() => {
    const current = textareaRef.current?.value ?? "";
    setIsDirty(current !== liveJson);
    // Clear sticky error while user is still typing
    if (toast?.kind === "error") setToast(null);
  }, [liveJson, toast]);

  // ── Render ────────────────────────────────────────────────────────────────────
  const borderColor = isDirty
    ? "rgba(0,212,255,0.3)"
    : "rgba(255,255,255,0.05)";

  return (
    <div style={{
      background: "rgba(2,6,15,0.7)",
      border: "1px solid rgba(255,255,255,0.07)",
      borderRadius: 18,
      padding: 15,
      display: "flex",
      flexDirection: "column",
      gap: 10,
    }}>
      {/* ── Header row ── */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <h3 style={{
            fontFamily: "Syne, sans-serif", fontWeight: 700, fontSize: 12,
            color: "#c8dff2", letterSpacing: "0.04em", margin: 0,
          }}>
            Circuit JSON
          </h3>
          <span style={{
            fontFamily: "JetBrains Mono, monospace", fontSize: 9,
            color: "rgba(0,212,255,0.5)", letterSpacing: "0.08em",
          }}>
            {circuitKey}
          </span>
          {isDirty && (
            <span style={{
              fontFamily: "JetBrains Mono, monospace", fontSize: 8.5,
              color: "#ffb340", letterSpacing: "0.06em",
              background: "rgba(255,179,64,0.1)",
              border: "1px solid rgba(255,179,64,0.22)",
              borderRadius: 5, padding: "1px 6px",
            }}>
              edited
            </span>
          )}
        </div>

        {/* Copy + Reset */}
        <div style={{ display: "flex", gap: 5 }}>
          <IconBtn label="copy" title="Copy JSON to clipboard" onClick={handleCopy} />
          {isDirty && (
            <IconBtn
              label="reset"
              title="Discard edits and revert to current circuit"
              onClick={handleReset}
              color="rgba(255,92,122,0.6)"
            />
          )}
        </div>
      </div>

      {/* ── Hint (only shown when not dirty) ── */}
      {!isDirty && (
        <p style={{
          fontFamily: "JetBrains Mono, monospace", fontSize: 9,
          color: "rgba(40,64,90,0.8)", margin: 0, lineHeight: 1.5,
          letterSpacing: "0.02em",
        }}>
          Edit or paste JSON below · <kbd style={{ color: "rgba(0,212,255,0.5)", fontStyle: "normal" }}>⌘/Ctrl+Enter</kbd> to replace · use Append to merge
        </p>
      )}

      {/* ── Textarea ── */}
      <div style={{ position: "relative" }}>
        <textarea
          ref={textareaRef}
          defaultValue={liveJson}
          onChange={handleChange}
          onKeyDown={handleKeyDown}
          spellCheck={false}
          autoComplete="off"
          autoCorrect="off"
          style={{
            width: "100%",
            minHeight: 220,
            maxHeight: 340,
            resize: "vertical",
            background: "rgba(2,6,15,0.85)",
            border: `1px solid ${borderColor}`,
            borderRadius: 10,
            padding: "10px 12px",
            fontFamily: "JetBrains Mono, monospace",
            fontSize: 9.5,
            color: isDirty ? "#c8dff2" : "rgba(0,212,255,0.5)",
            lineHeight: 1.7,
            outline: "none",
            boxSizing: "border-box",
            transition: "border-color 0.18s, color 0.18s",
            whiteSpace: "pre",
            overflowX: "auto",
            overflowY: "auto",
            display: "block",
          }}
          onFocus={() => {
            if (textareaRef.current) {
              textareaRef.current.style.borderColor = "rgba(0,212,255,0.4)";
            }
          }}
          onBlur={() => {
            if (textareaRef.current) {
              textareaRef.current.style.borderColor = isDirty
                ? "rgba(0,212,255,0.3)"
                : "rgba(255,255,255,0.05)";
            }
          }}
        />
      </div>

      {/* ── Toast feedback ── */}
      {toast && <Toast kind={toast.kind} message={toast.msg} />}

      {/* ── Action buttons (shown when dirty or always for usability) ── */}
      <div style={{ display: "flex", gap: 7 }}>
        {/* Replace — primary action */}
        <button
          type="button"
          onClick={() => applyJson("replace")}
          title="Clear circuit and load this JSON (Ctrl+Enter)"
          style={{
            flex: 1,
            borderRadius: 10,
            padding: "8px 0",
            fontFamily: "Syne, sans-serif",
            fontWeight: 700,
            fontSize: 11,
            letterSpacing: "0.05em",
            cursor: "pointer",
            border: `1px solid ${isDirty ? "rgba(0,212,255,0.45)" : "rgba(0,212,255,0.18)"}`,
            background: isDirty
              ? "linear-gradient(135deg,rgba(0,212,255,0.18),rgba(0,212,255,0.08))"
              : "rgba(0,212,255,0.05)",
            color: isDirty ? "#00d4ff" : "rgba(0,212,255,0.4)",
            boxShadow: isDirty ? "0 0 16px rgba(0,212,255,0.14)" : "none",
            transition: "all 0.16s",
          }}
        >
          ↺ Replace
        </button>

        {/* Append — secondary action */}
        <button
          type="button"
          onClick={() => applyJson("append")}
          title="Keep existing gates and append these gates after them"
          style={{
            flex: 1,
            borderRadius: 10,
            padding: "8px 0",
            fontFamily: "Syne, sans-serif",
            fontWeight: 700,
            fontSize: 11,
            letterSpacing: "0.05em",
            cursor: "pointer",
            border: `1px solid ${isDirty ? "rgba(162,89,255,0.4)" : "rgba(162,89,255,0.15)"}`,
            background: isDirty
              ? "linear-gradient(135deg,rgba(162,89,255,0.16),rgba(162,89,255,0.07))"
              : "rgba(162,89,255,0.04)",
            color: isDirty ? "#a259ff" : "rgba(162,89,255,0.4)",
            boxShadow: isDirty ? "0 0 14px rgba(162,89,255,0.12)" : "none",
            transition: "all 0.16s",
          }}
        >
          + Append
        </button>
      </div>
    </div>
  );
});

export default CircuitJsonEditor;
