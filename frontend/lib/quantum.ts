import { ComplexAmplitude } from "@/lib/types";

export interface BlochVector {
  x: number;
  y: number;
  z: number;
  magnitude: number;
  purity: number;
  isMixed: boolean;
}

interface ComplexNumber {
  re: number;
  im: number;
}

function toComplex(amplitude: ComplexAmplitude): ComplexNumber {
  return { re: amplitude.real, im: amplitude.imag };
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

      const alpha = amplitudes[index];
      const beta = amplitudes[index | mask];
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

