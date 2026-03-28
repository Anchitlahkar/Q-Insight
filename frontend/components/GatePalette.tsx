"use client";

import { memo, useCallback, useEffect, useMemo, useState } from "react";
import {
  CATEGORY_COLOR,
  CATEGORY_ORDER,
  GATE_COLOR,
  GATES_BY_CATEGORY,
  GateCategory,
  GateDefinition,
  GateType,
  formatTheta,
  isParametricGate,
  isTwoQubitGate,
  parseTheta
} from "@/lib/gates";

export interface GatePaletteProps {
  selected: GateType | null;
  controlQubit: number;
  targetQubit: number;
  theta: number;
  qubits: number;
  onSelect: (type: GateType | null) => void;
  onControlChange: (v: number) => void;
  onTargetChange: (v: number) => void;
  onThetaChange: (v: number) => void;
}

const T = {
  mono: "JetBrains Mono, monospace",
  syne: "Syne, sans-serif",
  muted: "rgba(40,64,90,0.85)",
  border: "rgba(255,255,255,0.07)",
  bg: "rgba(2,6,15,0.8)"
} as const;

const STORAGE_KEY = "qlab:last-selected-gate";
const CATEGORY_STORAGE_KEY = "qlab:gate-category-state";

const DEFAULT_EXPANDED: Record<GateCategory, boolean> = {
  Basic: true,
  Phase: true,
  Rotation: true,
  Multi: true,
  Utility: false
};

const GateButton = memo(function GateButton({
  def,
  isSelected,
  hoveredGate,
  thetaPreview,
  onSelect,
  onHoverChange
}: {
  def: GateDefinition;
  isSelected: boolean;
  hoveredGate: GateDefinition | null;
  thetaPreview?: string | null;
  onSelect: () => void;
  onHoverChange: (gate: GateDefinition | null) => void;
}) {
  const color = def.color;

  return (
    <button
      type="button"
      onClick={onSelect}
      onMouseEnter={() => {
        if (hoveredGate?.type !== def.type) {
          onHoverChange(def);
        }
      }}
      onMouseLeave={() => onHoverChange(null)}
      style={{
        borderRadius: 10,
        padding: "9px 4px 7px",
        border: `1.5px solid ${isSelected ? color : T.border}`,
        background: isSelected ? `${color}18` : `${color}07`,
        cursor: "pointer",
        transition: "border-color 0.14s ease, background 0.14s ease",
        textAlign: "center",
        boxShadow: isSelected ? `0 0 14px ${color}2a, inset 0 0 8px ${color}09` : "none",
        position: "relative"
      }}
    >
      {def.hasParameter && (
        <span
          style={{
            position: "absolute",
            top: 4,
            right: 5,
            width: 4,
            height: 4,
            borderRadius: "50%",
            background: color,
            opacity: 0.65,
            boxShadow: `0 0 4px ${color}`
          }}
        />
      )}
      <div
        style={{
          fontFamily: T.syne,
          fontWeight: 800,
          fontSize: def.label.length > 2 ? 11 : 14,
          color,
          letterSpacing: "0.03em",
          lineHeight: 1,
          textShadow: isSelected ? `0 0 8px ${color}88` : "none"
        }}
      >
        {def.label}
      </div>
      <div
        style={{
          fontFamily: T.mono,
          fontSize: 7.5,
          color: T.muted,
          marginTop: 4,
          letterSpacing: "0.03em",
          whiteSpace: "nowrap",
          overflow: "hidden",
          textOverflow: "ellipsis"
        }}
      >
        {thetaPreview ?? def.description.split(" ")[0]}
      </div>
    </button>
  );
});

const ThetaPanel = memo(function ThetaPanel({
  theta,
  color,
  onChange
}: {
  theta: number;
  color: string;
  onChange: (v: number) => void;
}) {
  const [raw, setRaw] = useState(() => formatTheta(theta));
  const [err, setErr] = useState(false);

  useEffect(() => {
    setRaw(formatTheta(theta));
  }, [theta]);

  const presets: Array<{ label: string; value: number }> = [
    { label: "pi/4", value: Math.PI / 4 },
    { label: "pi/2", value: Math.PI / 2 },
    { label: "pi", value: Math.PI },
    { label: "2pi", value: 2 * Math.PI }
  ];

  const commit = useCallback(
    (value: string) => {
      const parsed = parseTheta(value);
      if (Number.isNaN(parsed)) {
        setErr(true);
        return;
      }
      setErr(false);
      onChange(parsed);
      setRaw(formatTheta(parsed));
    },
    [onChange]
  );

  return (
    <div
      style={{
        background: `${color}08`,
        border: `1px solid ${color}28`,
        borderRadius: 12,
        padding: 11,
        display: "flex",
        flexDirection: "column",
        gap: 9
      }}
    >
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <span
          style={{
            fontFamily: T.mono,
            fontSize: 9,
            color,
            letterSpacing: "0.1em",
            textTransform: "uppercase",
            opacity: 0.8
          }}
        >
          theta parameter
        </span>
        <span style={{ fontFamily: T.mono, fontSize: 10, color, opacity: 0.6 }}>
          {theta.toFixed(4)} rad
        </span>
      </div>

      <input
        type="text"
        value={raw}
        onChange={(event) => {
          setRaw(event.target.value);
          setErr(false);
        }}
        onBlur={(event) => commit(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === "Enter") commit((event.target as HTMLInputElement).value);
        }}
        placeholder="e.g. pi/2, 1.57"
        style={{
          width: "100%",
          background: T.bg,
          border: `1px solid ${err ? "#ff5c7a" : `${color}30`}`,
          borderRadius: 8,
          padding: "7px 10px",
          color: err ? "#ff5c7a" : "#c8dff2",
          fontFamily: T.mono,
          fontSize: 12,
          outline: "none",
          boxSizing: "border-box"
        }}
      />

      <div style={{ display: "flex", gap: 5 }}>
        {presets.map((preset) => {
          const active = Math.abs(theta - preset.value) < 0.001;
          return (
            <button
              key={preset.label}
              type="button"
              onClick={() => {
                onChange(preset.value);
                setRaw(formatTheta(preset.value));
                setErr(false);
              }}
              style={{
                flex: 1,
                borderRadius: 7,
                border: `1px solid ${active ? color : `${color}22`}`,
                background: active ? `${color}18` : "transparent",
                color: active ? color : T.muted,
                fontFamily: T.mono,
                fontSize: 9,
                padding: "4px 2px",
                cursor: "pointer"
              }}
            >
              {preset.label}
            </button>
          );
        })}
      </div>
    </div>
  );
});

const MultiQubitPanel = memo(function MultiQubitPanel({
  gateType,
  controlQubit,
  targetQubit,
  qubits,
  color,
  onControlChange,
  onTargetChange
}: {
  gateType: GateType;
  controlQubit: number;
  targetQubit: number;
  qubits: number;
  color: string;
  onControlChange: (v: number) => void;
  onTargetChange: (v: number) => void;
}) {
  const configs =
    gateType === "SWAP"
      ? [
          { label: "Qubit A", value: controlQubit, onChange: onControlChange },
          { label: "Qubit B", value: targetQubit, onChange: onTargetChange }
        ]
      : [
          { label: "Control", value: controlQubit, onChange: onControlChange },
          { label: "Target", value: targetQubit, onChange: onTargetChange }
        ];

  return (
    <div
      style={{
        background: `${color}08`,
        border: `1px solid ${color}25`,
        borderRadius: 12,
        padding: 11,
        display: "flex",
        flexDirection: "column",
        gap: 9
      }}
    >
      <span
        style={{
          fontFamily: T.mono,
          fontSize: 9,
          color,
          letterSpacing: "0.1em",
          textTransform: "uppercase",
          opacity: 0.8
        }}
      >
        {gateType} qubit config
      </span>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
        {configs.map(({ label, value, onChange }) => (
          <label key={label} style={{ display: "flex", flexDirection: "column", gap: 4 }}>
            <span style={{ fontFamily: T.mono, fontSize: 9.5, color, opacity: 0.65 }}>
              {label}
            </span>
            <select
              value={value}
              onChange={(event) => onChange(Number(event.target.value))}
              style={{
                background: T.bg,
                border: `1px solid ${color}28`,
                borderRadius: 8,
                padding: "6px 8px",
                color: "#c8dff2",
                fontFamily: T.mono,
                fontSize: 11,
                outline: "none",
                cursor: "pointer"
              }}
            >
              {Array.from({ length: qubits }, (_, index) => (
                <option key={index} value={index}>
                  q[{index}]
                </option>
              ))}
            </select>
          </label>
        ))}
      </div>
    </div>
  );
});

export const GatePalette = memo(function GatePalette({
  selected,
  controlQubit,
  targetQubit,
  theta,
  qubits,
  onSelect,
  onControlChange,
  onTargetChange,
  onThetaChange
}: GatePaletteProps) {
  const [hoveredGate, setHoveredGate] = useState<GateDefinition | null>(null);
  const [expanded, setExpanded] = useState<Record<GateCategory, boolean>>(DEFAULT_EXPANDED);

  useEffect(() => {
    try {
      const saved = window.localStorage.getItem(CATEGORY_STORAGE_KEY);
      if (saved) {
        setExpanded({ ...DEFAULT_EXPANDED, ...(JSON.parse(saved) as Record<GateCategory, boolean>) });
      }
    } catch {}
  }, []);

  useEffect(() => {
    try {
      window.localStorage.setItem(CATEGORY_STORAGE_KEY, JSON.stringify(expanded));
    } catch {}
  }, [expanded]);

  useEffect(() => {
    if (!selected) {
      try {
        const last = window.localStorage.getItem(STORAGE_KEY) as GateType | null;
        if (last) onSelect(last);
      } catch {}
    }
  }, [onSelect, selected]);

  useEffect(() => {
    if (!selected) return;
    try {
      window.localStorage.setItem(STORAGE_KEY, selected);
    } catch {}
  }, [selected]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.target instanceof HTMLInputElement || event.target instanceof HTMLTextAreaElement || event.target instanceof HTMLSelectElement) {
        return;
      }

      const key = event.key.toLowerCase();
      if (key === "h") onSelect("H");
      if (key === "x") onSelect("X");
    };

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [onSelect]);

  const selectedColor = selected ? GATE_COLOR[selected] : undefined;
  const showTheta = selected !== null && isParametricGate(selected);
  const showMulti = selected !== null && isTwoQubitGate(selected);
  const hoverPreview = useMemo(() => {
    if (!hoveredGate) return null;
    return isParametricGate(hoveredGate.type)
      ? `${hoveredGate.description} - theta ${formatTheta(theta)}`
      : hoveredGate.description;
  }, [hoveredGate, theta]);

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        gap: 14,
        background: "rgba(6,13,26,0.9)",
        border: "1px solid rgba(255,255,255,0.07)",
        borderRadius: 20,
        padding: "16px 14px",
        backdropFilter: "blur(12px)",
        overflowY: "auto",
        maxHeight: "calc(100vh - 180px)"
      }}
    >
      <div>
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
          <div
            style={{
              width: 3,
              height: 13,
              borderRadius: 2,
              background: "linear-gradient(180deg,#00d4ff,#a259ff)",
              boxShadow: "0 0 8px rgba(0,212,255,0.5)"
            }}
          />
          <span style={{ fontFamily: T.syne, fontWeight: 700, fontSize: 12, color: "#c8dff2", letterSpacing: "0.04em" }}>
            Gate Palette
          </span>
        </div>
        <p style={{ fontFamily: T.mono, fontSize: 9, color: T.muted, lineHeight: 1.5, letterSpacing: "0.03em" }}>
          Select ? click wire to place
          <br />
          Shortcuts: H = Hadamard, X = Pauli-X
        </p>
      </div>

      <div
        style={{
          minHeight: 36,
          borderRadius: 10,
          border: "1px solid rgba(255,255,255,0.06)",
          background: "rgba(2,6,15,0.7)",
          padding: "8px 10px",
          fontFamily: T.mono,
          fontSize: 9.5,
          color: "rgba(200,223,242,0.62)",
          lineHeight: 1.5,
          opacity: hoverPreview ? 1 : 0.3,
          transition: "opacity 0.12s ease",
          boxSizing: "border-box"
        }}
      >
        {hoverPreview ?? "Hover a gate to see details"}
      </div>

      {CATEGORY_ORDER.map((category) => {
        const gates = GATES_BY_CATEGORY[category];
        const isOpen = expanded[category];
        const catColor = CATEGORY_COLOR[category];

        return (
          <div key={category}>
            <button
              type="button"
              onClick={() => setExpanded((current) => ({ ...current, [category]: !current[category] }))}
              style={{
                width: "100%",
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                gap: 8,
                marginBottom: 7,
                marginTop: 4,
                background: "transparent",
                border: "none",
                padding: 0,
                cursor: "pointer"
              }}
            >
              <div style={{ display: "flex", alignItems: "center", gap: 7 }}>
                <div
                  style={{
                    width: 16,
                    height: 1.5,
                    background: catColor,
                    borderRadius: 1,
                    opacity: 0.7,
                    boxShadow: `0 0 4px ${catColor}`
                  }}
                />
                <span
                  style={{
                    fontFamily: T.mono,
                    fontSize: 9,
                    fontWeight: 500,
                    color: catColor,
                    letterSpacing: "0.12em",
                    textTransform: "uppercase",
                    opacity: 0.75
                  }}
                >
                  {category}
                </span>
              </div>
              <span style={{ fontFamily: T.mono, fontSize: 10, color: catColor, opacity: 0.7 }}>
                {isOpen ? "-" : "+"}
              </span>
            </button>

            {isOpen && (
              <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 6 }}>
                {gates.map((def) => (
                  <GateButton
                    key={def.type}
                    def={def}
                    isSelected={selected === def.type}
                    hoveredGate={hoveredGate}
                    thetaPreview={def.hasParameter ? formatTheta(theta) : null}
                    onHoverChange={setHoveredGate}
                    onSelect={() => onSelect(def.type)}
                  />
                ))}
              </div>
            )}
          </div>
        );
      })}

      {showTheta && selected && <ThetaPanel theta={theta} color={GATE_COLOR[selected]} onChange={onThetaChange} />}

      {showMulti && selected && (
        <MultiQubitPanel
          gateType={selected}
          controlQubit={controlQubit}
          targetQubit={targetQubit}
          qubits={qubits}
          color={GATE_COLOR[selected]}
          onControlChange={onControlChange}
          onTargetChange={onTargetChange}
        />
      )}

      <div
        style={{
          borderTop: "1px solid rgba(255,255,255,0.05)",
          paddingTop: 10,
          fontFamily: T.mono,
          fontSize: 9.5,
          color: selectedColor ?? T.muted,
          letterSpacing: "0.06em",
          textAlign: "center",
          transition: "color 0.2s"
        }}
      >
        {selected ? `placing: ${selected}${showTheta ? ` · theta=${formatTheta(theta)}` : ""}` : "no gate selected"}
      </div>
    </div>
  );
});

export default GatePalette;

