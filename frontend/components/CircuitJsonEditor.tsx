"use client";

import { memo, useCallback, useEffect, useRef, useState } from "react";
import { GATE_MAP, GateType, isParametricGate, isTwoQubitGate } from "@/lib/gates";
import { CircuitKey, GateOperation } from "@/lib/types";
import { useCircuitStore } from "@/store/useCircuitStore";

// ── Design tokens (matches the white system used in CircuitBuilder) ───────────
const T = {
  bg:           "var(--panel)",
  bgSurface:    "var(--input)",
  border:       "var(--border)",
  borderFocus:  "var(--accent)",
  text:         "var(--foreground)",
  muted:        "var(--muted)",
  accent:       "var(--accent)",
  accentLight:  "var(--hover)",
  accentBorder: "var(--border-primary)",
  success:      "var(--success)",
  successLight: "rgba(52,211,153,0.12)",
  successBorder:"rgba(52,211,153,0.34)",
  error:        "var(--danger)",
  errorLight:   "rgba(248,113,113,0.12)",
  errorBorder:  "rgba(248,113,113,0.34)",
  warn:         "var(--warning)",
  warnLight:    "rgba(245,158,11,0.12)",
  warnBorder:   "rgba(245,158,11,0.34)",
  info:         "var(--accent)",
  infoLight:    "var(--hover)",
  infoBorder:   "var(--border-primary)",
  mono:         "JetBrains Mono, monospace",
  head:         "Syne, sans-serif",
} as const;

// ── Constants ─────────────────────────────────────────────────────────────────
const COL_W  = 68;
const LANE_H = 84;

// ── Types ─────────────────────────────────────────────────────────────────────
type ParsedGate = {
  type: GateType;
  target: number;
  control?: number;
  theta?: number;
};

type ParseResult =
  | { ok: true;  qubits: number | null; gates: ParsedGate[] }
  | { ok: false; message: string; line?: number };

type ToastKind = "success" | "error" | "info";

// ── Type aliases ──────────────────────────────────────────────────────────────
const TYPE_ALIASES: Record<string, GateType> = {
  cx: "CNOT", ccx: "CNOT", cz: "CZ", swap: "SWAP",
  hadamard: "H", pauli_x: "X", pauli_y: "Y", pauli_z: "Z",
  measure: "M", m: "M", id: "I", identity: "I",
  sdg: "SDG", tdg: "TDG",
  rx: "RX", ry: "RY", rz: "RZ",
  crx: "CRX", cry: "CRY", crz: "CRZ",
};

function normalizeGateType(raw: unknown): GateType | null {
  if (typeof raw !== "string") return null;
  const up = raw.toUpperCase() as GateType;
  if (GATE_MAP.has(up)) return up;
  return TYPE_ALIASES[raw.toLowerCase()] ?? null;
}

// ── Parser ────────────────────────────────────────────────────────────────────
function parseCircuitJson(text: string): ParseResult {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch (e) {
    const msg = e instanceof SyntaxError ? e.message : "Invalid JSON";
    const lineMatch = msg.match(/line (\d+)/i);
    return { ok: false, message: `JSON parse error: ${msg}`, line: lineMatch ? Number(lineMatch[1]) : undefined };
  }

  let qubits: number | null = null;
  let rawGates: unknown[];

  if (Array.isArray(parsed)) {
    rawGates = parsed;
  } else if (parsed !== null && typeof parsed === "object") {
    const obj = parsed as Record<string, unknown>;
    if ("qubits" in obj) {
      const q = obj["qubits"];
      if (typeof q !== "number" || !Number.isInteger(q) || q < 1 || q > 10)
        return { ok: false, message: `"qubits" must be an integer 1–10 (got ${JSON.stringify(q)})` };
      qubits = q;
    }
    if ("gates" in obj) {
      if (!Array.isArray(obj["gates"]))
        return { ok: false, message: '"gates" must be an array' };
      rawGates = obj["gates"] as unknown[];
    } else if ("type" in obj) {
      rawGates = [parsed];
    } else {
      return { ok: false, message: 'Expected an object with a "gates" array, array of gates, or single gate object' };
    }
  } else {
    return { ok: false, message: "Expected a JSON object or array" };
  }

  if (rawGates.length === 0)
    return { ok: false, message: "No gates found — the gates array is empty" };

  const gates: ParsedGate[] = [];
  for (let i = 0; i < rawGates.length; i++) {
    const raw = rawGates[i];
    const idx = i + 1;
    if (raw === null || typeof raw !== "object" || Array.isArray(raw))
      return { ok: false, message: `Gate ${idx}: expected an object` };

    const g = raw as Record<string, unknown>;
    const gtype = normalizeGateType(g["type"]);
    if (!gtype) {
      const valid = [...GATE_MAP.keys()].join(", ");
      return { ok: false, message: `Gate ${idx}: unknown type ${JSON.stringify(g["type"])}. Valid: ${valid}` };
    }

    if (!("target" in g))
      return { ok: false, message: `Gate ${idx} (${gtype}): missing "target"` };
    const target = g["target"];
    if (typeof target !== "number" || !Number.isInteger(target) || target < 0)
      return { ok: false, message: `Gate ${idx} (${gtype}): "target" must be a non-negative integer` };

    let control: number | undefined;
    if ("control" in g) {
      const ctrl = g["control"];
      if (typeof ctrl !== "number" || !Number.isInteger(ctrl) || ctrl < 0)
        return { ok: false, message: `Gate ${idx} (${gtype}): "control" must be a non-negative integer` };
      if (ctrl === target)
        return { ok: false, message: `Gate ${idx} (${gtype}): "control" and "target" must differ` };
      control = ctrl;
    } else if (isTwoQubitGate(gtype)) {
      return { ok: false, message: `Gate ${idx} (${gtype}): two-qubit gates require "control"` };
    }

    let theta: number | undefined;
    if ("theta" in g) {
      const t = g["theta"];
      if (typeof t !== "number" || !Number.isFinite(t))
        return { ok: false, message: `Gate ${idx} (${gtype}): "theta" must be a finite number` };
      theta = t;
    } else if (isParametricGate(gtype)) {
      return { ok: false, message: `Gate ${idx} (${gtype}): parametric gates require "theta"` };
    }

    gates.push({ type: gtype, target, control, theta });
  }

  return { ok: true, qubits, gates };
}

// ── Column assignment ─────────────────────────────────────────────────────────
function assignPositions(gates: ParsedGate[], startCol = 0): GateOperation[] {
  const cursor: Record<number, number> = {};
  const getCursor = (q: number) => cursor[q] ?? startCol;
  const advance   = (q: number, to: number) => { cursor[q] = Math.max(getCursor(q), to) + 1; };

  return gates.map((g) => {
    const qubits = g.control !== undefined ? [g.target, g.control] : [g.target];
    const col    = Math.max(...qubits.map(getCursor));
    qubits.forEach((q) => advance(q, col));
    return {
      id: `${g.type.toLowerCase()}-import-${Date.now()}-${Math.floor(Math.random() * 99999)}`,
      type: g.type,
      target: g.target,
      ...(g.control !== undefined ? { control: g.control } : {}),
      ...(g.theta   !== undefined ? { theta: g.theta }     : {}),
      position: { x: col * COL_W, y: g.target * LANE_H },
    };
  });
}

// ── Toast ─────────────────────────────────────────────────────────────────────
function Toast({ kind, message }: { kind: ToastKind; message: string }) {
  const palette: Record<ToastKind, { border: string; bg: string; text: string }> = {
    success: { border: T.successBorder, bg: T.successLight, text: T.success },
    error:   { border: T.errorBorder,   bg: T.errorLight,   text: T.error   },
    info:    { border: T.infoBorder,    bg: T.infoLight,    text: T.info    },
  };
  const c = palette[kind];
  return (
    <div style={{
      border: `1px solid ${c.border}`,
      background: c.bg,
      borderRadius: 9,
      padding: "7px 11px",
      fontFamily: T.mono,
      fontSize: 10,
      color: c.text,
      lineHeight: 1.5,
      wordBreak: "break-word",
    }}>
      {message}
    </div>
  );
}

// ── Icon button ───────────────────────────────────────────────────────────────
function IconBtn({
  label, title, onClick, danger = false,
}: {
  label: string; title: string; onClick: () => void; danger?: boolean;
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
        background: hov
          ? (danger ? T.errorLight : T.accentLight)
          : T.bg,
        border: `1px solid ${danger ? T.errorBorder : T.border}`,
        borderRadius: 7,
        padding: "3px 10px",
        fontFamily: T.mono,
        fontSize: 9,
        color: danger ? T.error : (hov ? T.accent : T.muted),
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
interface CircuitJsonEditorProps { circuitKey: CircuitKey; }

export const CircuitJsonEditor = memo(function CircuitJsonEditor({ circuitKey }: CircuitJsonEditorProps) {
  const circuit       = useCircuitStore((s) => s.circuits[circuitKey]);
  const addGate       = useCircuitStore((s) => s.addGate);
  const clearCircuit  = useCircuitStore((s) => s.clearCircuit);
  const setQubitCount = useCircuitStore((s) => s.setQubitCount);

  const [isDirty, setIsDirty] = useState(false);
  const [toast,   setToast]   = useState<{ kind: ToastKind; msg: string } | null>(null);
  const toastTimerRef         = useRef<ReturnType<typeof setTimeout> | null>(null);
  const textareaRef           = useRef<HTMLTextAreaElement>(null);

  const liveJson = JSON.stringify(
    {
      qubits: circuit.qubits,
      gates: circuit.gates.map(({ type, target, control, theta }) => ({
        type, target,
        ...(control !== undefined ? { control } : {}),
        ...(theta   !== undefined ? { theta }   : {}),
      })),
    },
    null, 2
  );

  useEffect(() => {
    if (!isDirty && textareaRef.current) textareaRef.current.value = liveJson;
  }, [liveJson, isDirty]);

  const showToast = useCallback((kind: ToastKind, msg: string, ms = 3000) => {
    if (toastTimerRef.current) clearTimeout(toastTimerRef.current);
    setToast({ kind, msg });
    if (ms > 0) toastTimerRef.current = setTimeout(() => setToast(null), ms);
  }, []);

  const handleCopy = useCallback(() => {
    const text = textareaRef.current?.value ?? liveJson;
    navigator.clipboard.writeText(text).then(() => showToast("info", "Copied to clipboard", 1800));
  }, [liveJson, showToast]);

  const handleReset = useCallback(() => {
    if (textareaRef.current) textareaRef.current.value = liveJson;
    setIsDirty(false);
    setToast(null);
  }, [liveJson]);

  const applyJson = useCallback(
    (mode: "replace" | "append") => {
      const raw    = textareaRef.current?.value ?? "";
      const result = parseCircuitJson(raw);

      if (!result.ok) {
        showToast("error", result.message, 0);
        return;
      }

      const { qubits: parsedQubits, gates: parsedGates } = result;

      if (mode === "replace") {
        const maxGateQubit = parsedGates.reduce((m, g) => {
          return Math.max(m, g.control !== undefined ? Math.max(g.target, g.control) : g.target);
        }, 0);
        const newQubits = parsedQubits ?? Math.max(circuit.qubits, maxGateQubit + 1);
        clearCircuit(circuitKey);
        setQubitCount(circuitKey, Math.min(newQubits, 6));
        assignPositions(parsedGates, 0).forEach((g) => addGate(circuitKey, g));
        showToast("success", `Replaced · ${parsedGates.length} gate${parsedGates.length !== 1 ? "s" : ""} loaded`);
      } else {
        const lastCol = circuit.gates.reduce((m, g) => {
          return Math.max(m, Math.max(0, Math.round(g.position.x / COL_W)));
        }, -1);
        const maxGateQubit = parsedGates.reduce((m, g) => {
          return Math.max(m, g.control !== undefined ? Math.max(g.target, g.control) : g.target);
        }, 0);
        if (maxGateQubit >= circuit.qubits) setQubitCount(circuitKey, Math.min(maxGateQubit + 1, 6));
        const ops = assignPositions(parsedGates, lastCol + 1);
        ops.forEach((g) => addGate(circuitKey, g));
        showToast("success", `Appended ${ops.length} gate${ops.length !== 1 ? "s" : ""}`);
      }

      setIsDirty(false);
    },
    [addGate, circuitKey, circuit.gates, circuit.qubits, clearCircuit, setQubitCount, showToast]
  );

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
      if ((e.ctrlKey || e.metaKey) && e.key === "Enter") { e.preventDefault(); applyJson("replace"); }
    },
    [applyJson]
  );

  const handleChange = useCallback(() => {
    const current = textareaRef.current?.value ?? "";
    setIsDirty(current !== liveJson);
    if (toast?.kind === "error") setToast(null);
  }, [liveJson, toast]);

  // ── Render ────────────────────────────────────────────────────────────────────
  return (
    <div style={{
      background: "var(--panel)",
      border: "1px solid var(--border)",
      borderRadius: 18,
      padding: 18,
      display: "flex",
      flexDirection: "column",
      gap: 12,
      boxShadow: "var(--shadow-panel)",
      backdropFilter: "blur(20px)",
    }}>

      {/* Header */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <h3 style={{ fontFamily: T.head, fontWeight: 800, fontSize: 13, color: "var(--foreground)", margin: 0, textTransform: "uppercase", letterSpacing: "0.1em" }}>
            Circuit JSON
          </h3>
          {/* Circuit key badge */}
          <span style={{
            fontFamily: T.mono, fontSize: 9, fontWeight: 700,
            color: "var(--accent)", background: "var(--hover)",
            border: "1px solid var(--border-primary)",
            borderRadius: 999, padding: "1px 8px",
            letterSpacing: "0.1em",
          }}>
            {circuitKey}
          </span>
          {/* Dirty indicator */}
          {isDirty && (
            <span style={{
              fontFamily: T.mono, fontSize: 8, fontWeight: 700,
              color: "var(--warning)", background: "rgba(245,158,11,0.12)",
              border: "1px solid rgba(245,158,11,0.28)",
              borderRadius: 6, padding: "1px 7px", letterSpacing: "0.08em",
              textTransform: "uppercase",
            }}>
              edited
            </span>
          )}
        </div>

        <div style={{ display: "flex", gap: 6 }}>
          <IconBtn label="copy"  title="Copy JSON to clipboard" onClick={handleCopy} />
          {isDirty && (
            <IconBtn label="reset" title="Discard edits" onClick={handleReset} danger />
          )}
        </div>
      </div>

      {/* Hint */}
      {!isDirty && (
        <p style={{ fontFamily: T.mono, fontSize: 9, color: "var(--muted)", margin: 0, lineHeight: 1.5 }}>
          Edit or paste JSON · <kbd style={{ color: "var(--accent)", fontStyle: "normal" }}>⌘/Ctrl+Enter</kbd> to replace · Append to merge
        </p>
      )}

      {/* Textarea */}
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
            minHeight: 200,
            maxHeight: 320,
            resize: "vertical",
            background: T.bgSurface,
            border: `1px solid ${isDirty ? T.accentBorder : "var(--border)"}`,
            borderRadius: 12,
            padding: "10px 12px",
            fontFamily: T.mono,
            fontSize: 10,
            color: "var(--foreground)",
            lineHeight: 1.7,
            outline: "none",
            boxSizing: "border-box",
            transition: "border-color 0.15s, box-shadow 0.15s",
            whiteSpace: "pre",
            overflowX: "auto",
            overflowY: "auto",
            display: "block",
          }}
          onFocus={(e) => { e.currentTarget.style.borderColor = T.borderFocus; e.currentTarget.style.boxShadow = "0 0 0 3px rgba(34,211,238,0.10), 0 0 26px rgba(34,211,238,0.12)"; }}
          onBlur={(e)  => { e.currentTarget.style.borderColor = isDirty ? T.accentBorder : "var(--border)"; e.currentTarget.style.boxShadow = "none"; }}
        />
      </div>

      {/* Toast */}
      {toast && <Toast kind={toast.kind} message={toast.msg} />}

      {/* Action buttons */}
      <div style={{ display: "flex", gap: 8 }}>
        {/* Replace — primary */}
        <button
          type="button"
          onClick={() => applyJson("replace")}
          title="Clear circuit and load this JSON (Ctrl+Enter)"
          style={{
            flex: 1,
            borderRadius: 12,
            padding: "10px 0",
            fontFamily: T.head,
            fontWeight: 800,
            fontSize: 11,
            letterSpacing: "0.05em",
            cursor: "pointer",
            border: isDirty ? `1px solid ${T.accentBorder}` : "1px solid var(--border)",
            background: isDirty ? "linear-gradient(135deg, var(--hover), rgba(34,211,238,0.12))" : "var(--panel-secondary)",
            color: isDirty ? "var(--accent)" : "var(--muted)",
            transition: "all 0.2s cubic-bezier(0.4, 0, 0.2, 1)",
            boxShadow: isDirty ? "0 4px 12px rgba(34,211,238,0.12), inset 0 1px 0 rgba(255,255,255,0.04)" : "none",
            textTransform: "uppercase",
          }}
          onMouseEnter={(e) => {
            if (isDirty) {
              e.currentTarget.style.transform = "translateY(-1px)";
              e.currentTarget.style.boxShadow = "0 6px 16px rgba(34,211,238,0.18), inset 0 1px 0 rgba(255,255,255,0.06)";
              e.currentTarget.style.borderColor = "var(--accent)";
            }
          }}
          onMouseLeave={(e) => {
            if (isDirty) {
              e.currentTarget.style.transform = "none";
              e.currentTarget.style.boxShadow = "0 4px 12px rgba(34,211,238,0.12), inset 0 1px 0 rgba(255,255,255,0.04)";
              e.currentTarget.style.borderColor = T.accentBorder;
            }
          }}
        >
          ↺ Replace
        </button>

        {/* Append — secondary */}
        <button
          type="button"
          onClick={() => applyJson("append")}
          title="Keep existing gates and append new ones"
          style={{
            flex: 1,
            borderRadius: 12,
            padding: "10px 0",
            fontFamily: T.head,
            fontWeight: 800,
            fontSize: 11,
            letterSpacing: "0.05em",
            cursor: "pointer",
            border: isDirty ? "1px solid rgba(139,92,246,0.35)" : "1px solid var(--border)",
            background: isDirty ? "rgba(139,92,246,0.12)" : "var(--panel-secondary)",
            color: isDirty ? "var(--accent-secondary)" : "var(--muted)",
            transition: "all 0.2s cubic-bezier(0.4, 0, 0.2, 1)",
            boxShadow: isDirty ? "0 4px 12px rgba(139,92,246,0.1), inset 0 1px 0 rgba(255,255,255,0.04)" : "none",
            textTransform: "uppercase",
          }}
          onMouseEnter={(e) => {
            if (isDirty) {
              e.currentTarget.style.transform = "translateY(-1px)";
              e.currentTarget.style.boxShadow = "0 6px 16px rgba(139,92,246,0.15), inset 0 1px 0 rgba(255,255,255,0.06)";
              e.currentTarget.style.borderColor = "var(--accent-secondary)";
            }
          }}
          onMouseLeave={(e) => {
            if (isDirty) {
              e.currentTarget.style.transform = "none";
              e.currentTarget.style.boxShadow = "0 4px 12px rgba(139,92,246,0.1), inset 0 1px 0 rgba(255,255,255,0.04)";
              e.currentTarget.style.borderColor = "rgba(139,92,246,0.35)";
            }
          }}
        >
          + Append
        </button>
      </div>
    </div>
  );
});

export default CircuitJsonEditor;
