/** Deterministic, stateless randomness: the same inputs always give the same output. */

/** 32-bit integer hash of any number of integers (murmur3 finaliser per step). */
export function hash32(...parts: number[]): number {
  let h = 0x811c9dc5;
  for (const p of parts) {
    h = Math.imul(h ^ (p | 0), 0x01000193);
    h ^= h >>> 16;
    h = Math.imul(h, 0x85ebca6b);
    h ^= h >>> 13;
    h = Math.imul(h, 0xc2b2ae35);
    h ^= h >>> 16;
  }
  return h >>> 0;
}

/** Uniform in [0, 1). */
export function unit(...parts: number[]): number {
  return hash32(...parts) / 4294967296;
}

/** Standard normal (Box–Muller) from two independent hashes. */
export function gauss(...parts: number[]): number {
  const u = Math.max(unit(...parts, 1), 1e-12);
  const v = unit(...parts, 2);
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
}
