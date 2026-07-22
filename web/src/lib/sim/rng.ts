// Deterministic PRNG for the simulator. Every simulator artifact — the op
// stream, the choices `applyOp` resolves live state against, everything — is
// a pure function of a `mulberry32(seed)` generator. No `Date.now`,
// `Math.random`, or other non-deterministic source may appear anywhere under
// `src/lib/sim/`: a failing run must be exactly reproducible from its seed
// and op index alone.

/** mulberry32 — small, fast, good-enough-for-testing 32-bit PRNG. */
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return function rnd(): number {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Uniformly pick one element of `arr` using `rnd`. Throws on an empty array. */
export function pick<T>(rnd: () => number, arr: readonly T[]): T {
  const idx = Math.min(Math.floor(rnd() * arr.length), arr.length - 1);
  const item = arr[idx];
  if (item === undefined && arr.length === 0) {
    throw new Error('pick() called with an empty array');
  }
  return item as T;
}

/** Uniformly pick an integer in [min, max] (inclusive on both ends) using `rnd`. */
export function int(rnd: () => number, min: number, max: number): number {
  return min + Math.floor(rnd() * (max - min + 1));
}
