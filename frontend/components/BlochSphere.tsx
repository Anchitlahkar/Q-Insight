"use client";

import { memo, useEffect, useMemo, useRef, useState } from "react";
import { BlochVector } from "@/lib/quantum";

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

const SIZE = 180;
const CENTER = SIZE / 2;
const RADIUS = 56;

function project(point: { x: number; y: number; z: number }): Point {
  return {
    x: CENTER + (point.x - point.y * 0.34) * RADIUS,
    y: CENTER - (point.z + point.y * 0.2) * RADIUS,
  };
}

function format(value: number) {
  return value.toFixed(2);
}

export const BlochSphere = memo(function BlochSphere({ label, vector, active = false, sphereSize }: BlochSphereProps) {
  const [display, setDisplay] = useState(vector);
  const frameRef = useRef<number | null>(null);

  useEffect(() => {
    const start = performance.now();
    const initial = display;
    const duration = 220;

    const tick = (now: number) => {
      const progress = Math.min((now - start) / duration, 1);
      const eased = 1 - (1 - progress) * (1 - progress);

      setDisplay({
        ...vector,
        x: initial.x + (vector.x - initial.x) * eased,
        y: initial.y + (vector.y - initial.y) * eased,
        z: initial.z + (vector.z - initial.z) * eased,
        magnitude: initial.magnitude + (vector.magnitude - initial.magnitude) * eased,
        purity: initial.purity + (vector.purity - initial.purity) * eased,
      });

      if (progress < 1) {
        frameRef.current = window.requestAnimationFrame(tick);
      }
    };

    frameRef.current = window.requestAnimationFrame(tick);

    return () => {
      if (frameRef.current !== null) {
        window.cancelAnimationFrame(frameRef.current);
      }
    };
  }, [vector]);

  const svgSize = sphereSize ?? SIZE;
  const tip = useMemo(() => project(display), [display]);
  const xAxis = useMemo(() => ({ start: project({ x: -1, y: 0, z: 0 }), end: project({ x: 1, y: 0, z: 0 }) }), []);
  const yAxis = useMemo(() => ({ start: project({ x: 0, y: -1, z: 0 }), end: project({ x: 0, y: 1, z: 0 }) }), []);
  const zAxis = useMemo(() => ({ start: project({ x: 0, y: 0, z: -1 }), end: project({ x: 0, y: 0, z: 1 }) }), []);

  return (
    <div style={{
      background: active ? "linear-gradient(180deg, rgba(0,212,255,0.16), rgba(4,11,24,0.94))" : "rgba(2,6,15,0.78)",
      border: active ? "1px solid rgba(0,212,255,0.34)" : "1px solid rgba(255,255,255,0.07)",
      borderRadius: 18,
      padding: 14,
      boxShadow: active ? "0 0 28px rgba(0,212,255,0.16)" : "none",
      transition: "all 160ms ease",
    }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
        <div>
          <div style={{
            fontFamily: "JetBrains Mono, monospace",
            fontSize: 10,
            letterSpacing: "0.08em",
            textTransform: "uppercase",
            color: "rgba(40,64,90,0.9)",
          }}>{label}</div>
          <div style={{ fontFamily: "Syne, sans-serif", fontSize: 18, fontWeight: 700, color: "#c8dff2" }}>
            Bloch Sphere
          </div>
        </div>
        <div style={{
          borderRadius: 999,
          padding: "5px 9px",
          fontFamily: "JetBrains Mono, monospace",
          fontSize: 10,
          color: display.isMixed ? "#ffb340" : "#00e5a0",
          background: display.isMixed ? "rgba(255,179,64,0.12)" : "rgba(0,229,160,0.12)",
          border: display.isMixed ? "1px solid rgba(255,179,64,0.25)" : "1px solid rgba(0,229,160,0.2)",
        }}>
          {display.isMixed ? "mixed" : "pure"}
        </div>
      </div>

      <svg width={svgSize} height={svgSize} viewBox={`0 0 ${SIZE} ${SIZE}`} style={{ display: "block" }}>
        <defs>
          <radialGradient id={`bloch-bg-${label}`} cx="50%" cy="40%" r="65%">
            <stop offset="0%" stopColor="rgba(23,62,99,0.22)" />
            <stop offset="100%" stopColor="rgba(3,10,22,0.02)" />
          </radialGradient>
        </defs>

        <ellipse cx={CENTER} cy={CENTER} rx={RADIUS * 0.82} ry={RADIUS * 0.34} fill="none" stroke="rgba(255,255,255,0.08)" strokeDasharray="4 4" />
        <circle cx={CENTER} cy={CENTER} r={RADIUS} fill={`url(#bloch-bg-${label})`} stroke="rgba(200,223,242,0.16)" strokeWidth="1.4" />

        <line x1={xAxis.start.x} y1={xAxis.start.y} x2={xAxis.end.x} y2={xAxis.end.y} stroke="rgba(255,99,132,0.5)" strokeWidth="1.5" />
        <line x1={yAxis.start.x} y1={yAxis.start.y} x2={yAxis.end.x} y2={yAxis.end.y} stroke="rgba(255,179,64,0.45)" strokeWidth="1.5" />
        <line x1={zAxis.start.x} y1={zAxis.start.y} x2={zAxis.end.x} y2={zAxis.end.y} stroke="rgba(0,212,255,0.45)" strokeWidth="1.5" />

        <text x={xAxis.end.x + 6} y={xAxis.end.y + 1} fontSize="10" fill="rgba(255,99,132,0.8)">X</text>
        <text x={yAxis.end.x + 6} y={yAxis.end.y + 1} fontSize="10" fill="rgba(255,179,64,0.8)">Y</text>
        <text x={zAxis.end.x + 4} y={zAxis.end.y - 6} fontSize="10" fill="rgba(0,212,255,0.85)">Z</text>

        <line x1={CENTER} y1={CENTER} x2={tip.x} y2={tip.y} stroke="#00d4ff" strokeWidth="3" strokeLinecap="round" style={{ filter: "drop-shadow(0 0 10px rgba(0,212,255,0.75))" }} />
        <circle cx={tip.x} cy={tip.y} r="5" fill="#00d4ff" style={{ filter: "drop-shadow(0 0 12px rgba(0,212,255,0.85))" }} />
        <circle cx={CENTER} cy={CENTER} r="3" fill="rgba(200,223,242,0.9)" />
      </svg>

      <div style={{
        display: "grid",
        gridTemplateColumns: "repeat(2, minmax(0, 1fr))",
        gap: 8,
        marginTop: 10,
        fontFamily: "JetBrains Mono, monospace",
        fontSize: 10,
        color: "rgba(200,223,242,0.72)",
      }}>
        <div>x {format(display.x)}</div>
        <div>y {format(display.y)}</div>
        <div>z {format(display.z)}</div>
        <div>|r| {format(display.magnitude)}</div>
      </div>
    </div>
  );
});





