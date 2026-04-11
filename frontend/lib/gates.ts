// ─────────────────────────────────────────────────────────────────────────────
// /lib/gates.ts
// Single source of truth for every gate the system supports.
// Add a new gate here and it propagates everywhere automatically.
// ─────────────────────────────────────────────────────────────────────────────

export type GateType =
  // Basic single-qubit
  | "H" | "X" | "Y" | "Z"
  // Phase
  | "S" | "SDG" | "T" | "TDG"
  // Rotation (parametric)
  | "RX" | "RY" | "RZ"
  // Multi-qubit
  | "CNOT" | "CZ" | "SWAP" | "CRX" | "CRY" | "CRZ"
  // Utility
  | "M" | "I"
  // Composite circuit components
  | "COMPONENT";

export type GateCategory =
  | "Basic"
  | "Phase"
  | "Rotation"
  | "Multi"
  | "Utility";

export interface GateDefinition {
  type: GateType;
  /** Short label rendered on the canvas gate box */
  label: string;
  /** Longer name shown as a subtitle in the palette */
  description: string;
  category: GateCategory;
  /** Hex color — drives both palette UI and SVG gate color */
  color: string;
  /** True for RX/RY/RZ — triggers θ input panel */
  hasParameter?: boolean;
  /** True for gates that span two wires (CNOT, CZ, SWAP) */
  isTwoQubit?: boolean;
  /** Default θ value in radians when hasParameter is true */
  defaultTheta?: number;
}

// ── Category ordering for palette rendering ───────────────────────────────────
export const CATEGORY_ORDER: GateCategory[] = [
  "Basic",
  "Phase",
  "Rotation",
  "Multi",
  "Utility",
];

// ── Category accent colors (used for section headers) ─────────────────────────
export const CATEGORY_COLOR: Record<GateCategory, string> = {
  Basic:    "#3B82F6",
  Phase:    "#3B82F6",
  Rotation: "#8B5CF6",
  Multi:    "#F59E0B",
  Utility:  "#6B7280",
};

// ── Master gate list ──────────────────────────────────────────────────────────
export const GATES: GateDefinition[] = [
  // ── Basic ─────────────────────────────────────────────────────────────────
  {
    type: "H",
    label: "H",
    description: "Hadamard",
    category: "Basic",
    color: "#3B82F6",
  },
  {
    type: "X",
    label: "X",
    description: "Pauli-X",
    category: "Basic",
    color: "#3B82F6",
  },
  {
    type: "Y",
    label: "Y",
    description: "Pauli-Y",
    category: "Basic",
    color: "#3B82F6",
  },
  {
    type: "Z",
    label: "Z",
    description: "Pauli-Z",
    category: "Basic",
    color: "#3B82F6",
  },

  // ── Phase ─────────────────────────────────────────────────────────────────
  {
    type: "S",
    label: "S",
    description: "S gate (√Z)",
    category: "Phase",
    color: "#3B82F6",
  },
  {
    type: "SDG",
    label: "S†",
    description: "S-dagger",
    category: "Phase",
    color: "#3B82F6",
  },
  {
    type: "T",
    label: "T",
    description: "T gate (π/8)",
    category: "Phase",
    color: "#3B82F6",
  },
  {
    type: "TDG",
    label: "T†",
    description: "T-dagger",
    category: "Phase",
    color: "#3B82F6",
  },

  // ── Rotation ──────────────────────────────────────────────────────────────
  {
    type: "RX",
    label: "Rx",
    description: "X-rotation",
    category: "Rotation",
    color: "#8B5CF6",
    hasParameter: true,
    defaultTheta: Math.PI / 2,
  },
  {
    type: "RY",
    label: "Ry",
    description: "Y-rotation",
    category: "Rotation",
    color: "#8B5CF6",
    hasParameter: true,
    defaultTheta: Math.PI / 2,
  },
  {
    type: "RZ",
    label: "Rz",
    description: "Z-rotation",
    category: "Rotation",
    color: "#8B5CF6",
    hasParameter: true,
    defaultTheta: Math.PI / 2,
  },

  // ── Multi-qubit ───────────────────────────────────────────────────────────
  {
    type: "CNOT",
    label: "CX",
    description: "Controlled-X",
    category: "Multi",
    color: "#F59E0B",
    isTwoQubit: true,
  },
  {
    type: "CZ",
    label: "CZ",
    description: "Controlled-Z",
    category: "Multi",
    color: "#F59E0B",
    isTwoQubit: true,
  },
  {
    type: "SWAP",
    label: "SW",
    description: "SWAP",
    category: "Multi",
    color: "#F59E0B",
    isTwoQubit: true,
  },
  {
    type: "CRX",
    label: "CRx",
    description: "Controlled X-rotation",
    category: "Multi",
    color: "#F59E0B",
    hasParameter: true,
    isTwoQubit: true,
    defaultTheta: Math.PI / 2,
  },
  {
    type: "CRY",
    label: "CRy",
    description: "Controlled Y-rotation",
    category: "Multi",
    color: "#F59E0B",
    hasParameter: true,
    isTwoQubit: true,
    defaultTheta: Math.PI / 2,
  },
  {
    type: "CRZ",
    label: "CRz",
    description: "Controlled Z-rotation",
    category: "Multi",
    color: "#F59E0B",
    hasParameter: true,
    isTwoQubit: true,
    defaultTheta: Math.PI / 2,
  },

  // ── Utility ───────────────────────────────────────────────────────────────
  {
    type: "M",
    label: "M",
    description: "Measure",
    category: "Utility",
    color: "#16A34A",
  },
  {
    type: "I",
    label: "I",
    description: "Identity",
    category: "Utility",
    color: "#6B7280",
  },
];

// ── Derived lookup maps (O(1) access everywhere) ──────────────────────────────

/** type → GateDefinition */
export const GATE_MAP: Map<GateType, GateDefinition> = new Map(
  GATES.map((g) => [g.type, g])
);

/** type → hex color string */
export const GATE_COLOR: Record<GateType, string> = Object.fromEntries(
  GATES.map((g) => [g.type, g.color])
) as Record<GateType, string>;
GATE_COLOR.COMPONENT = "#3B82F6";

/** Gates grouped by category, in CATEGORY_ORDER sequence */
export const GATES_BY_CATEGORY: Record<GateCategory, GateDefinition[]> = (() => {
  const grouped = {} as Record<GateCategory, GateDefinition[]>;
  for (const cat of CATEGORY_ORDER) grouped[cat] = [];
  for (const gate of GATES) grouped[gate.category].push(gate);
  return grouped;
})();

// ── Type-guard helpers ────────────────────────────────────────────────────────

export function isTwoQubitGate(type: GateType): boolean {
  return GATE_MAP.get(type)?.isTwoQubit === true;
}

export function isParametricGate(type: GateType): boolean {
  return GATE_MAP.get(type)?.hasParameter === true;
}

export function isMeasureGate(type: GateType): boolean {
  return type === "M";
}

export function isComponentType(type: GateType): boolean {
  return type === "COMPONENT";
}

export function getGateLabel(type: GateType): string {
  if (type === "COMPONENT") return "COMP";
  return GATE_MAP.get(type)?.label ?? type;
}

export function getDefaultTheta(type: GateType): number {
  return GATE_MAP.get(type)?.defaultTheta ?? Math.PI / 2;
}

// ── Theta formatting utilities ────────────────────────────────────────────────

/**
 * Format a radian value as a readable fraction of π.
 * e.g. 1.5707… → "π/2", 3.1415… → "π", 0 → "0"
 */
export function formatTheta(radians: number): string {
  const PI = Math.PI;
  const EPS = 0.001;

  if (Math.abs(radians) < EPS) return "0";
  if (Math.abs(radians - PI) < EPS) return "π";
  if (Math.abs(radians + PI) < EPS) return "-π";
  if (Math.abs(radians - PI / 2) < EPS) return "π/2";
  if (Math.abs(radians + PI / 2) < EPS) return "-π/2";
  if (Math.abs(radians - PI / 4) < EPS) return "π/4";
  if (Math.abs(radians + PI / 4) < EPS) return "-π/4";
  if (Math.abs(radians - (3 * PI) / 4) < EPS) return "3π/4";
  if (Math.abs(radians - 2 * PI) < EPS) return "2π";

  return radians.toFixed(3);
}

/**
 * Parse a string like "π/2", "3.14", "pi/4" into radians.
 * Returns NaN if the string cannot be parsed.
 */
export function parseTheta(raw: string): number {
  const s = raw.trim().replace(/pi/gi, "π");
  if (s === "π") return Math.PI;
  if (s === "-π") return -Math.PI;
  if (s === "2π") return 2 * Math.PI;

  const fracMatch = s.match(/^(-?)([\d.]*)\s*π\s*\/\s*([\d.]+)$/);
  if (fracMatch) {
    const sign = fracMatch[1] === "-" ? -1 : 1;
    const num  = fracMatch[2] ? parseFloat(fracMatch[2]) : 1;
    const den  = parseFloat(fracMatch[3]);
    return sign * num * Math.PI / den;
  }

  const mulMatch = s.match(/^(-?)([\d.]+)\s*\*?\s*π$/);
  if (mulMatch) {
    const sign = mulMatch[1] === "-" ? -1 : 1;
    return sign * parseFloat(mulMatch[2]) * Math.PI;
  }

  return parseFloat(s);
}
