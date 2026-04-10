"use client";

import { memo, useMemo, useState } from "react";
import algorithms from "@/lib/algorithms.json";
import { useWebSocket } from "@/hooks/useWebSocket";
import { serializeCircuit } from "@/lib/circuit";
import { webSocketUrl } from "@/lib/env";
import type { AlgorithmDefinition } from "@/lib/types";
import { useCircuitStore } from "@/store/useCircuitStore";

type AlgorithmCatalog = Record<string, AlgorithmDefinition[]>;
const ALGORITHMS_BY_CATEGORY = algorithms as AlgorithmCatalog;

function getAlgorithmEntryKey(category: string, algorithmId: string, index: number) {
  return `${category}::${algorithmId}::${index}`;
}

// ── per-category accent colors ────────────────────────────────────────────────
const CATEGORY_ACCENTS: Record<string, { primary: string; glow: string; dim: string }> = {
  "Fundamentals":  { primary: "#00d4ff", glow: "rgba(0,212,255,0.18)",  dim: "rgba(0,212,255,0.06)"  },
  "Search":        { primary: "#a259ff", glow: "rgba(162,89,255,0.18)", dim: "rgba(162,89,255,0.06)" },
  "Cryptography":  { primary: "#ff5c7a", glow: "rgba(255,92,122,0.18)", dim: "rgba(255,92,122,0.06)" },
  "Optimization":  { primary: "#ffb340", glow: "rgba(255,179,64,0.18)", dim: "rgba(255,179,64,0.06)" },
  "Error Correction":{ primary: "#00e5a0", glow: "rgba(0,229,160,0.18)", dim: "rgba(0,229,160,0.06)"},
};
const DEFAULT_ACCENT = { primary: "#00d4ff", glow: "rgba(0,212,255,0.18)", dim: "rgba(0,212,255,0.06)" };

function accent(cat: string) { return CATEGORY_ACCENTS[cat] ?? DEFAULT_ACCENT; }

// ── mono + display tokens ─────────────────────────────────────────────────────
const MONO = "JetBrains Mono, monospace";
const DISP = "Syne, sans-serif";

// ── Category icon SVGs (inline, no external dep) ─────────────────────────────
function CategoryIcon({ category, color, size = 18 }: { category: string; color: string; size?: number }) {
  const s = size;
  if (category === "Search")
    return <svg width={s} height={s} viewBox="0 0 18 18" fill="none">
      <circle cx="7.5" cy="7.5" r="5" stroke={color} strokeWidth="1.5"/>
      <line x1="11.5" y1="11.5" x2="16" y2="16" stroke={color} strokeWidth="1.5" strokeLinecap="round"/>
    </svg>;
  if (category === "Cryptography")
    return <svg width={s} height={s} viewBox="0 0 18 18" fill="none">
      <rect x="4" y="8" width="10" height="8" rx="2" stroke={color} strokeWidth="1.5"/>
      <path d="M6 8V6a3 3 0 016 0v2" stroke={color} strokeWidth="1.5" strokeLinecap="round"/>
      <circle cx="9" cy="12" r="1.5" fill={color}/>
    </svg>;
  if (category === "Optimization")
    return <svg width={s} height={s} viewBox="0 0 18 18" fill="none">
      <polyline points="2,14 6,8 10,11 16,4" stroke={color} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
      <circle cx="16" cy="4" r="2" fill={color}/>
    </svg>;
  if (category === "Error Correction")
    return <svg width={s} height={s} viewBox="0 0 18 18" fill="none">
      <path d="M9 2L15.5 14H2.5L9 2z" stroke={color} strokeWidth="1.5" strokeLinejoin="round"/>
      <line x1="9" y1="7" x2="9" y2="10" stroke={color} strokeWidth="1.5" strokeLinecap="round"/>
      <circle cx="9" cy="12.5" r="0.75" fill={color}/>
    </svg>;
  // Fundamentals / default
  return <svg width={s} height={s} viewBox="0 0 18 18" fill="none">
    <circle cx="9" cy="9" r="3" fill={color} opacity="0.85"/>
    <circle cx="9" cy="9" r="6.5" stroke={color} strokeWidth="1" opacity="0.4"/>
    <line x1="9" y1="2" x2="9" y2="16" stroke={color} strokeWidth="1" opacity="0.3"/>
    <line x1="2" y1="9" x2="16" y2="9" stroke={color} strokeWidth="1" opacity="0.3"/>
  </svg>;
}

// ── main component ────────────────────────────────────────────────────────────
function AlgorithmSelectorComponent() {
  const activeCircuit = useCircuitStore((s) => s.activeCircuit);
  const loadAlgorithm = useCircuitStore((s) => s.loadAlgorithm);
  const setResult     = useCircuitStore((s) => s.setResult);
  const clearResult   = useCircuitStore((s) => s.clearResult);
  const clearCircuit  = useCircuitStore((s) => s.clearCircuit);
  const setQubitCount = useCircuitStore((s) => s.setQubitCount);
  const { simulateCircuit, isLoading } = useWebSocket(webSocketUrl);

  const [activeCategory, setActiveCategory] = useState<string | null>(null);
  const [runningKey,     setRunningKey]      = useState<string | null>(null);
  const [loadedKey,      setLoadedKey]       = useState<string | null>(null);
  const [toast, setToast] = useState<{ kind: "ok" | "err"; msg: string } | null>(null);

  const categoryEntries = useMemo(() => Object.entries(ALGORITHMS_BY_CATEGORY), []);
  const activeList = useMemo(
    () => (activeCategory ? ALGORITHMS_BY_CATEGORY[activeCategory] ?? [] : []),
    [activeCategory]
  );
  const activeEntries = useMemo(
    () =>
      activeCategory
        ? activeList.map((algorithm, index) => ({
            algorithm,
            entryKey: getAlgorithmEntryKey(activeCategory, algorithm.id, index),
          }))
        : [],
    [activeCategory, activeList]
  );

  const showToast = (kind: "ok" | "err", msg: string) => {
    setToast({ kind, msg });
    setTimeout(() => setToast(null), 3200);
  };

  const handleLoad = async (entryKey: string, algorithm: AlgorithmDefinition) => {
    setRunningKey(entryKey);
    try {
      clearResult(activeCircuit);

      if (algorithm.executionMode === "backend" && algorithm.backendAlgorithm) {
        setQubitCount(activeCircuit, algorithm.qubits);
        clearCircuit(activeCircuit);
        const result = await simulateCircuit({
          mode: "algorithm",
          algorithm: algorithm.backendAlgorithm,
          params: algorithm.backendParams,
        });
        setResult(activeCircuit, result);
      } else {
        loadAlgorithm(activeCircuit, algorithm);
        const nextCircuit = useCircuitStore.getState().circuits[activeCircuit];
        const result = await simulateCircuit(serializeCircuit(nextCircuit));
        setResult(activeCircuit, result);
      }

      setLoadedKey(entryKey);
      showToast("ok", `${algorithm.name} loaded into Circuit ${activeCircuit}`);
    } catch (e) {
      showToast("err", e instanceof Error ? e.message : "Unable to load algorithm.");
    } finally {
      setRunningKey(null);
    }
  };

  return (
    <section style={{
      background: "rgba(6,13,26,0.9)",
      border: "1px solid rgba(255,255,255,0.07)",
      borderRadius: 24,
      padding: 20,
      boxShadow: "0 0 0 1px rgba(0,212,255,0.04), 0 20px 56px rgba(0,0,0,0.65)",
      backdropFilter: "blur(14px)",
      position: "relative",
      overflow: "hidden",
    }}>
      {/* ambient top-left glow */}
      <div style={{
        position: "absolute", top: -40, left: -40, width: 160, height: 160,
        borderRadius: "50%", background: "radial-gradient(circle, rgba(0,212,255,0.06) 0%, transparent 70%)",
        pointerEvents: "none",
      }} />

      {/* ── header ── */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, marginBottom: 18 }}>
        <div>
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
            <div style={{ width: 3, height: 14, borderRadius: 2, background: "linear-gradient(180deg,#00d4ff,#a259ff)", boxShadow: "0 0 8px rgba(0,212,255,0.5)" }} />
            <h2 style={{ fontFamily: DISP, fontWeight: 800, fontSize: 15, color: "#c8dff2", margin: 0, letterSpacing: "-0.01em" }}>
              Algorithm Library
            </h2>
          </div>
          <p style={{ fontFamily: MONO, fontSize: 9.5, color: "rgba(40,64,90,0.9)", margin: 0, letterSpacing: "0.02em", lineHeight: 1.5 }}>
            {activeCategory
              ? `${activeList.length} algorithm${activeList.length !== 1 ? "s" : ""} in ${activeCategory}`
              : "Select a category to browse algorithms"}
          </p>
        </div>

        <div style={{
          fontFamily: MONO, fontSize: 9, color: "#00d4ff", letterSpacing: "0.1em",
          textTransform: "uppercase", padding: "5px 10px", borderRadius: 999,
          border: "1px solid rgba(0,212,255,0.22)", background: "rgba(0,212,255,0.07)",
          whiteSpace: "nowrap",
        }}>
          Circuit {activeCircuit}
        </div>
      </div>

      {/* ── two-column layout: categories (left) + algorithms (right) ── */}
      <div style={{ display: "grid", gridTemplateColumns: "200px 1fr", gap: 12 }}>

        {/* LEFT — category list */}
        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          {categoryEntries.map(([cat, list]) => {
            const ac = accent(cat);
            const isActive = activeCategory === cat;
            return (
              <button
                key={cat}
                type="button"
                onClick={() => setActiveCategory(isActive ? null : cat)}
                style={{
                  display: "flex", alignItems: "center", gap: 10,
                  padding: "11px 13px",
                  borderRadius: 13,
                  border: `1px solid ${isActive ? `${ac.primary}45` : "rgba(255,255,255,0.07)"}`,
                  background: isActive ? ac.dim : "rgba(2,6,15,0.5)",
                  cursor: "pointer",
                  transition: "all 0.15s ease",
                  textAlign: "left",
                  boxShadow: isActive ? `0 0 18px ${ac.glow}` : "none",
                  position: "relative",
                }}
                onMouseEnter={(e) => {
                  if (!isActive) {
                    e.currentTarget.style.borderColor = `${ac.primary}25`;
                    e.currentTarget.style.background  = `${ac.dim}`;
                  }
                }}
                onMouseLeave={(e) => {
                  if (!isActive) {
                    e.currentTarget.style.borderColor = "rgba(255,255,255,0.07)";
                    e.currentTarget.style.background  = "rgba(2,6,15,0.5)";
                  }
                }}
              >
                {/* active indicator bar */}
                {isActive && (
                  <div style={{
                    position: "absolute", left: 0, top: "20%", bottom: "20%",
                    width: 3, borderRadius: "0 2px 2px 0",
                    background: ac.primary,
                    boxShadow: `0 0 8px ${ac.primary}`,
                  }} />
                )}

                <CategoryIcon category={cat} color={isActive ? ac.primary : "rgba(40,64,90,0.8)"} size={16} />

                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{
                    fontFamily: DISP, fontWeight: 700, fontSize: 12,
                    color: isActive ? ac.primary : "rgba(200,223,242,0.7)",
                    letterSpacing: "0.02em",
                    transition: "color 0.15s",
                    textShadow: isActive ? `0 0 12px ${ac.primary}66` : "none",
                  }}>
                    {cat}
                  </div>
                  <div style={{
                    fontFamily: MONO, fontSize: 9, marginTop: 2,
                    color: isActive ? `${ac.primary}88` : "rgba(40,64,90,0.7)",
                    letterSpacing: "0.04em",
                  }}>
                    {list.length} algo{list.length !== 1 ? "s" : ""}
                  </div>
                </div>

                {/* chevron */}
                <svg width="10" height="10" viewBox="0 0 10 10" fill="none"
                  style={{ flexShrink: 0, opacity: isActive ? 1 : 0.35, transition: "transform 0.15s, opacity 0.15s", transform: isActive ? "rotate(90deg)" : "rotate(0deg)" }}>
                  <path d="M3 2l4 3-4 3" stroke={ac.primary} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                </svg>
              </button>
            );
          })}
        </div>

        {/* RIGHT — algorithm list or empty state */}
        <div style={{ minHeight: 220 }}>
          {!activeCategory ? (
            /* empty state */
            <div style={{
              height: "100%", display: "flex", flexDirection: "column",
              alignItems: "center", justifyContent: "center", gap: 12,
              border: "1px dashed rgba(255,255,255,0.06)",
              borderRadius: 18, background: "rgba(2,6,15,0.3)",
            }}>
              {/* orbital svg */}
              <svg width="44" height="44" viewBox="0 0 44 44" fill="none" opacity={0.25}>
                <circle cx="22" cy="22" r="8" stroke="#00d4ff" strokeWidth="1.5"/>
                <ellipse cx="22" cy="22" rx="20" ry="9" stroke="#00d4ff" strokeWidth="1" transform="rotate(0 22 22)"/>
                <ellipse cx="22" cy="22" rx="20" ry="9" stroke="#a259ff" strokeWidth="1" transform="rotate(60 22 22)"/>
                <ellipse cx="22" cy="22" rx="20" ry="9" stroke="#a259ff" strokeWidth="1" transform="rotate(120 22 22)"/>
                <circle cx="22" cy="22" r="3" fill="#00d4ff"/>
              </svg>
              <div style={{ fontFamily: MONO, fontSize: 10, color: "rgba(40,64,90,0.7)", letterSpacing: "0.06em", textAlign: "center", lineHeight: 1.6 }}>
                ← Pick a category<br/>to browse algorithms
              </div>
            </div>
          ) : (
            /* algorithm cards */
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {activeEntries.map(({ algorithm, entryKey }, i) => {
                const ac = accent(activeCategory);
                const isLoaded   = loadedKey === entryKey;
                const isRunning  = runningKey === entryKey;
                const isDisabled = isLoading;

                return (
                  <div
                    key={entryKey}
                    style={{
                      borderRadius: 15,
                      border: `1px solid ${isLoaded ? `${ac.primary}40` : "rgba(255,255,255,0.07)"}`,
                      background: isLoaded
                        ? `linear-gradient(135deg, ${ac.dim} 0%, rgba(2,6,15,0.92) 100%)`
                        : "rgba(2,6,15,0.6)",
                      padding: "13px 15px",
                      boxShadow: isLoaded ? `0 0 24px ${ac.glow}` : "none",
                      transition: "all 0.18s ease",
                      animation: `fadeSlideIn 0.2s ease both`,
                      animationDelay: `${i * 0.04}s`,
                    }}
                  >
                    {/* top row */}
                    <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 10 }}>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{
                          fontFamily: DISP, fontWeight: 700, fontSize: 14,
                          color: isLoaded ? ac.primary : "#c8dff2",
                          letterSpacing: "-0.01em",
                          textShadow: isLoaded ? `0 0 14px ${ac.primary}55` : "none",
                        }}>
                          {algorithm.name}
                        </div>
                        {algorithm.description && (
                          <div style={{
                            fontFamily: MONO, fontSize: 9.5, color: "rgba(200,223,242,0.5)",
                            marginTop: 4, lineHeight: 1.55, letterSpacing: "0.01em",
                          }}>
                            {algorithm.description}
                          </div>
                        )}
                      </div>

                      {/* Run button */}
                      <button
                        type="button"
                        onClick={() => void handleLoad(entryKey, algorithm)}
                        disabled={isDisabled}
                        style={{
                          flexShrink: 0,
                          display: "flex", alignItems: "center", gap: 6,
                          padding: "7px 14px",
                          borderRadius: 10,
                          border: `1px solid ${isLoaded ? `${ac.primary}50` : "rgba(255,255,255,0.1)"}`,
                          background: isLoaded
                            ? `linear-gradient(135deg, ${ac.primary}22, ${ac.primary}0a)`
                            : "rgba(255,255,255,0.04)",
                          color: isLoaded ? ac.primary : "rgba(200,223,242,0.65)",
                          fontFamily: DISP, fontWeight: 700, fontSize: 11,
                          letterSpacing: "0.04em",
                          cursor: isDisabled ? "not-allowed" : "pointer",
                          opacity: isDisabled && !isRunning ? 0.5 : 1,
                          transition: "all 0.15s",
                          whiteSpace: "nowrap",
                          boxShadow: isLoaded ? `0 0 14px ${ac.glow}` : "none",
                        }}
                        onMouseEnter={(e) => {
                          if (!isDisabled) {
                            e.currentTarget.style.borderColor = `${ac.primary}50`;
                            e.currentTarget.style.color = ac.primary;
                            e.currentTarget.style.background = `${ac.primary}14`;
                          }
                        }}
                        onMouseLeave={(e) => {
                          if (!isLoaded) {
                            e.currentTarget.style.borderColor = "rgba(255,255,255,0.1)";
                            e.currentTarget.style.color = "rgba(200,223,242,0.65)";
                            e.currentTarget.style.background = "rgba(255,255,255,0.04)";
                          }
                        }}
                      >
                        {isRunning ? (
                          <>
                            <span style={{ width: 7, height: 7, borderRadius: "50%", background: ac.primary, boxShadow: `0 0 6px ${ac.primary}`, animation: "pulse-dot 0.8s ease-in-out infinite", display: "inline-block" }} />
                            Running
                          </>
                        ) : isLoaded ? (
                          <>
                            <svg width="10" height="10" viewBox="0 0 10 10" fill="none">
                              <path d="M2 5l2.5 2.5L8 3" stroke={ac.primary} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                            </svg>
                            Loaded
                          </>
                        ) : (
                          <>
                            <svg width="9" height="9" viewBox="0 0 9 9" fill="none">
                              <path d="M2 1.5l5 3-5 3V1.5z" fill="currentColor"/>
                            </svg>
                            Load
                          </>
                        )}
                      </button>
                    </div>

                    {/* meta chips */}
                    <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginTop: 10 }}>
                      {[
                        `${algorithm.qubits} qubit${algorithm.qubits !== 1 ? "s" : ""}`,
                        algorithm.executionMode === "backend" ? "Backend" : "Builder",
                        algorithm.executionMode !== "backend" ? `${algorithm.gates?.length ?? 0} gates` : null,
                      ].filter(Boolean).map((chip) => (
                        <span key={chip!} style={{
                          fontFamily: MONO, fontSize: 8.5, letterSpacing: "0.06em",
                          color: isLoaded ? `${ac.primary}aa` : "rgba(40,64,90,0.9)",
                          background: isLoaded ? `${ac.primary}0e` : "rgba(255,255,255,0.04)",
                          border: `1px solid ${isLoaded ? `${ac.primary}28` : "rgba(255,255,255,0.06)"}`,
                          borderRadius: 6, padding: "3px 8px",
                          transition: "all 0.15s",
                        }}>
                          {chip}
                        </span>
                      ))}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {/* ── toast ── */}
      {toast && (
        <div style={{
          marginTop: 14,
          padding: "9px 13px",
          borderRadius: 11,
          fontFamily: MONO, fontSize: 9.5, letterSpacing: "0.02em", lineHeight: 1.5,
          border: `1px solid ${toast.kind === "ok" ? "rgba(0,229,160,0.3)" : "rgba(255,92,122,0.3)"}`,
          background: toast.kind === "ok" ? "rgba(0,229,160,0.07)" : "rgba(255,92,122,0.07)",
          color: toast.kind === "ok" ? "#00e5a0" : "#ff5c7a",
        }}>
          {toast.msg}
        </div>
      )}

      {/* ── keyframes injected inline ── */}
      <style>{`
        @keyframes fadeSlideIn {
          from { opacity: 0; transform: translateY(6px); }
          to   { opacity: 1; transform: translateY(0);  }
        }
        @keyframes pulse-dot {
          0%,100% { opacity:1; transform:scale(1);    }
          50%      { opacity:.5; transform:scale(.7); }
        }
      `}</style>
    </section>
  );
}

export default memo(AlgorithmSelectorComponent);
