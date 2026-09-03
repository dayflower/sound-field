function isPowerOfTwo(value: number): boolean {
  return value > 0 && (value & (value - 1)) === 0;
}

function valueAt(values: Float64Array, index: number): number {
  return values[index] ?? 0;
}

/** Performs an in-place radix-2 Cooley-Tukey FFT. */
export function fft(
  real: Float64Array,
  imaginary: Float64Array,
  inverse = false,
): void {
  const size = real.length;
  if (imaginary.length !== size || !isPowerOfTwo(size)) {
    throw new RangeError("FFT buffers must have equal, power-of-two lengths.");
  }

  for (let index = 1, reversed = 0; index < size; index++) {
    let bit = size >> 1;
    for (; reversed & bit; bit >>= 1) reversed ^= bit;
    reversed ^= bit;
    if (index < reversed) {
      [real[index], real[reversed]] = [
        valueAt(real, reversed),
        valueAt(real, index),
      ];
      [imaginary[index], imaginary[reversed]] = [
        valueAt(imaginary, reversed),
        valueAt(imaginary, index),
      ];
    }
  }

  for (let length = 2; length <= size; length <<= 1) {
    const angle = ((inverse ? 2 : -2) * Math.PI) / length;
    const stepReal = Math.cos(angle);
    const stepImaginary = Math.sin(angle);
    for (let offset = 0; offset < size; offset += length) {
      let twiddleReal = 1;
      let twiddleImaginary = 0;
      for (let index = 0; index < length / 2; index++) {
        const even = offset + index;
        const odd = even + length / 2;
        const oddReal =
          valueAt(real, odd) * twiddleReal -
          valueAt(imaginary, odd) * twiddleImaginary;
        const oddImaginary =
          valueAt(real, odd) * twiddleImaginary +
          valueAt(imaginary, odd) * twiddleReal;
        real[odd] = valueAt(real, even) - oddReal;
        imaginary[odd] = valueAt(imaginary, even) - oddImaginary;
        real[even] = valueAt(real, even) + oddReal;
        imaginary[even] = valueAt(imaginary, even) + oddImaginary;
        const nextReal =
          twiddleReal * stepReal - twiddleImaginary * stepImaginary;
        twiddleImaginary =
          twiddleReal * stepImaginary + twiddleImaginary * stepReal;
        twiddleReal = nextReal;
      }
    }
  }

  if (inverse) {
    for (let index = 0; index < size; index++) {
      real[index] = valueAt(real, index) / size;
      imaginary[index] = valueAt(imaginary, index) / size;
    }
  }
}
