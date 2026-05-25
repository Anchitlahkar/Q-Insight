import { ComplexAmplitude } from "@/lib/types";

export interface BlochVector {
  x: number;
  y: number;
  z: number;
  magnitude: number;
  purity: number;
  isMixed: boolean;
}

export interface BlochAngles {
  theta: number;
  phi: number;
}

interface ComplexNumber {
  re: number;
  im: number;
}

type ComplexLike = ComplexAmplitude | { re: number; im: number } | [number, number] | null | undefined;

function toComplex(amplitude: ComplexLike): ComplexNumber {
  if (!amplitude) {
    return { re: 0, im: 0 };
  }

  if (Array.isArray(amplitude)) {
    return {
      re: typeof amplitude[0] === "number" ? amplitude[0] : 0,
      im: typeof amplitude[1] === "number" ? amplitude[1] : 0,
    };
  }

  if ("real" in amplitude && "imag" in amplitude) {
    return {
      re: typeof amplitude.real === "number" ? amplitude.real : 0,
      im: typeof amplitude.imag === "number" ? amplitude.imag : 0,
    };
  }

  if ("re" in amplitude && "im" in amplitude) {
    return {
      re: typeof amplitude.re === "number" ? amplitude.re : 0,
      im: typeof amplitude.im === "number" ? amplitude.im : 0,
    };
  }

  return { re: 0, im: 0 };
}

function absSquared(value: ComplexNumber) {
  return value.re * value.re + value.im * value.im;
}

function multiplyConjugate(left: ComplexNumber, right: ComplexNumber): ComplexNumber {
  return {
    re: left.re * right.re + left.im * right.im,
    im: left.re * right.im - left.im * right.re,
  };
}

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

function toDegrees(radians: number) {
  return (radians * 180) / Math.PI;
}

export function computeBlochAngles(x: number, y: number, z: number): BlochAngles {
  const theta = Math.acos(clamp(z, -1, 1));
  const phi = Math.atan2(y, x);

  return {
    theta: toDegrees(theta),
    phi: ((toDegrees(phi) % 360) + 360) % 360,
  };
}

export function getBlochVectors(statevector: ComplexAmplitude[] | null, qubits: number): BlochVector[] {
  if (!statevector || qubits < 1) {
    return Array.from({ length: qubits }, () => ({
      x: 0,
      y: 0,
      z: 1,
      magnitude: 1,
      purity: 1,
      isMixed: false,
    }));
  }

  const amplitudes = statevector.map(toComplex);

  return Array.from({ length: qubits }, (_, qubit) => {
    const mask = 1 << qubit;
    let x = 0;
    let y = 0;
    let z = 0;
    let coherenceRe = 0;
    let coherenceIm = 0;

    for (let index = 0; index < amplitudes.length; index += 1) {
      if ((index & mask) !== 0) continue;

      const alpha = amplitudes[index] ?? { re: 0, im: 0 };
      const beta = amplitudes[index | mask] ?? { re: 0, im: 0 };
      const overlap = multiplyConjugate(alpha, beta);

      x += 2 * overlap.re;
      y += 2 * overlap.im;
      z += absSquared(alpha) - absSquared(beta);
      coherenceRe += overlap.re;
      coherenceIm += overlap.im;
    }

    const rho00 = (1 + z) / 2;
    const rho11 = (1 - z) / 2;
    const purity = clamp(
      rho00 * rho00 + rho11 * rho11 + 2 * (coherenceRe * coherenceRe + coherenceIm * coherenceIm),
      0,
      1
    );
    const magnitude = Math.sqrt(x * x + y * y + z * z);

    return {
      x,
      y,
      z,
      magnitude,
      purity,
      isMixed: purity < 0.999,
    };
  });
}

