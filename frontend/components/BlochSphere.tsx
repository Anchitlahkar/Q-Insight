"use client";

import { memo, useEffect, useMemo, useRef, useState } from "react";
import { BlochVector, computeBlochAngles } from "@/lib/quantum";

interface BlochSphereProps {
  label: string;
  vector: BlochVector;
  active?: boolean;
  sphereSize?: number;
}

interface Point {
  x: number;
  y: number;
}

const SIZE = 160;
const CENTER = SIZE / 2;
const RADIUS = 58;

function project(point: { x: number; y: number; z: number }): Point {
  return {
    x: CENTER + (point.x - point.y * 0.34) * RADIUS,
    y: CENTER - (point.z + point.y * 0.2) * RADIUS,
  };
}

function fmt(value: number) {
  return value.toFixed(2);
}

export const BlochSphere = memo(function BlochSphere({
  label,
  vector,
  active = false,
  sphereSize,
}: BlochSphereProps) {
  const [display, setDisplay] = useState(vector);
  const frameRef = useRef<number | null>(null);

  useEffect(() => {
    const start = performance.now();
    const initial = { ...display };
    const duration = 240;

    const tick = (now: number) => {
      const t = Math.min((now - start) / duration, 1);
      const e = 1 - (1 - t) * (1 - t);

      setDisplay({
        ...vector,
        x: initial.x + (vector.x - initial.x) * e,
        y: initial.y + (vector.y - initial.y) * e,
        z: initial.z + (vector.z - initial.z) * e,
        magnitude: initial.magnitude + (vector.magnitude - initial.magnitude) * e,
        purity: initial.purity + (vector.purity - initial.purity) * e,
      });

      if (t < 1) frameRef.current = window.requestAnimationFrame(tick);
    };

    frameRef.current = window.requestAnimationFrame(tick);
    return () => {
      if (frameRef.current !== null) window.cancelAnimationFrame(frameRef.current);
    };
  }, [vector]); // eslint-disable-line react-hooks/exhaustive-deps

  const svgSize = sphereSize ?? SIZE;
  const tip = useMemo(() => project(display), [display]);
  const xAxis = useMemo(() => ({ s: project({ x: -1, y: 0, z: 0 }), e: project({ x: 1, y: 0, z: 0 }) }), []);
  const yAxis = useMemo(() => ({ s: project({ x: 0, y: -1, z: 0 }), e: project({ x: 0, y: 1, z: 0 }) }), []);
  const zAxis = useMemo(() => ({ s: project({ x: 0, y: 0, z: -1 }), e: project({ x: 0, y: 0, z: 1 }) }), []);
  const blochAngles = useMemo(
    () => computeBlochAngles(display.x, display.y, display.z),
    [display.x, display.y, display.z]
  );

  const isMixed = display.isMixed;
  const stateColor = isMixed ? "#ffb340" : "#00e5a0";
  const gradId = `bg-${label.replace(/[^a-z0-9]/gi, "_")}`;

  return (
    <div
      style={{
        background: active ? "linear-gradient(160deg, rgba(59,130,246,0.08) 0%, #ffffff 100%)" : "#ffffff",
        border: `1px solid ${active ? "rgba(59,130,246,0.28)" : "#E5E7EB"}`,
        borderRadius: 12,
        padding: "10px 12px 10px",
        boxShadow: active ? "0 10px 24px rgba(59,130,246,0.12)" : "0 8px 20px rgba(15,23,42,0.05)",
        transition: "all 180ms ease",
        display: "flex",
        flexDirection: "column",
        gap: 0,
      }}
    >
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          marginBottom: 8,
        }}
      >
        <span
          style={{
            fontFamily: "JetBrains Mono, monospace",
            fontSize: 11,
            fontWeight: 500,
            color: "#3B82F6",
            letterSpacing: "0.04em",
          }}
        >
          {label}
        </span>

        <span
          style={{
            fontFamily: "JetBrains Mono, monospace",
            fontSize: 9,
            fontWeight: 600,
            letterSpacing: "0.08em",
            textTransform: "uppercase",
            color: stateColor,
            background: isMixed ? "rgba(245,158,11,0.1)" : "rgba(22,163,74,0.1)",
            border: `1px solid ${isMixed ? "rgba(245,158,11,0.22)" : "rgba(22,163,74,0.18)"}`,
            borderRadius: 99,
            padding: "2px 7px",
          }}
        >
          {isMixed ? "mixed" : "pure"}
        </span>
      </div>

      <div style={{ display: "flex", justifyContent: "center" }}>
        <svg
          width={svgSize}
          height={svgSize}
          viewBox={`0 0 ${SIZE} ${SIZE}`}
          style={{ display: "block", overflow: "visible" }}
        >
          <defs>
            <radialGradient id={gradId} cx="42%" cy="38%" r="62%">
              <stop offset="0%" stopColor="rgba(59,130,246,0.14)" />
              <stop offset="60%" stopColor="rgba(147,197,253,0.12)" />
              <stop offset="100%" stopColor="rgba(255,255,255,0.02)" />
            </radialGradient>

            <filter id={`glow-${gradId}`} x="-40%" y="-40%" width="180%" height="180%">
              <feGaussianBlur stdDeviation="3.5" result="blur" />
              <feMerge>
                <feMergeNode in="blur" />
                <feMergeNode in="SourceGraphic" />
              </feMerge>
            </filter>
          </defs>

          <ellipse
            cx={CENTER}
            cy={CENTER}
            rx={RADIUS * 0.82}
            ry={RADIUS * 0.32}
            fill="none"
            stroke="rgba(148,163,184,0.25)"
            strokeDasharray="3 4"
          />

          <circle
            cx={CENTER}
            cy={CENTER}
            r={RADIUS}
            fill={`url(#${gradId})`}
            stroke="rgba(148,163,184,0.24)"
            strokeWidth="1.2"
          />

          <line x1={xAxis.s.x} y1={xAxis.s.y} x2={xAxis.e.x} y2={xAxis.e.y} stroke="rgba(239,68,68,0.42)" strokeWidth="1.2" />
          <line x1={yAxis.s.x} y1={yAxis.s.y} x2={yAxis.e.x} y2={yAxis.e.y} stroke="rgba(245,158,11,0.4)" strokeWidth="1.2" />
          <line x1={zAxis.s.x} y1={zAxis.s.y} x2={zAxis.e.x} y2={zAxis.e.y} stroke="rgba(59,130,246,0.42)" strokeWidth="1.2" />

          <text x={xAxis.e.x + 5} y={xAxis.e.y + 1} fontSize="9" fill="rgba(255,80,110,0.75)" dominantBaseline="middle">
            X
          </text>
          <text x={yAxis.e.x + 5} y={yAxis.e.y + 1} fontSize="9" fill="rgba(255,170,50,0.72)" dominantBaseline="middle">
            Y
          </text>
          <text x={zAxis.e.x + 3} y={zAxis.e.y - 5} fontSize="9" fill="rgba(0,212,255,0.82)">
            Z
          </text>

          <line
            x1={CENTER}
            y1={CENTER}
            x2={tip.x}
            y2={tip.y}
            stroke="rgba(59,130,246,0.18)"
            strokeWidth="5"
            strokeLinecap="round"
          />

          <line
            x1={CENTER}
            y1={CENTER}
            x2={tip.x}
            y2={tip.y}
            stroke="#3B82F6"
            strokeWidth="2.5"
            strokeLinecap="round"
            filter={`url(#glow-${gradId})`}
          />

          <circle cx={tip.x} cy={tip.y} r="5" fill="#3B82F6" filter={`url(#glow-${gradId})`} />
          <circle cx={CENTER} cy={CENTER} r="2.5" fill="rgba(31,41,55,0.72)" />
        </svg>
      </div>

      <div
        style={{
          marginTop: 8,
          padding: "9px 10px",
          borderRadius: 8,
          background: "#F9FAFB",
          border: "1px solid #E5E7EB",
        }}
      >
        <div
          style={{
            fontFamily: "JetBrains Mono, monospace",
            fontSize: 9,
            letterSpacing: "0.08em",
            textTransform: "uppercase",
            color: "#6B7280",
            marginBottom: 6,
          }}
        >
          Bloch Coordinates
        </div>
        {(
          [
            ["\u03B8", blochAngles.theta],
            ["\u03C6", blochAngles.phi],
          ] as [string, number][]
        ).map(([key, value]) => (
          <div
            key={key}
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              gap: 12,
              paddingTop: 4,
              fontFamily: "JetBrains Mono, monospace",
            }}
          >
            <span style={{ fontSize: 11, color: "#6B7280" }}>{key}</span>
            <span style={{ fontSize: 11, color: "#1F2937", fontWeight: 500 }}>{`${fmt(value)}\u00B0`}</span>
          </div>
        ))}
      </div>
    </div>
  );
});
