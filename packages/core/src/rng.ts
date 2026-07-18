// Deterministic seeded PRNG (hook #1: MPPI/RL exploration must be reproducible
// so leaderboards + server-side replay re-verification stay fair).
export type Rng = { next(): number; seed: number };

// mulberry32 — small, fast, good enough, fully deterministic given the seed.
export function makeRng(seed: number): Rng {
  let a = seed >>> 0;
  return {
    seed,
    next(): number {
      a |= 0; a = (a + 0x6d2b79f5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    },
  };
}

// uniform in [lo, hi)
export function uniform(rng: Rng, lo: number, hi: number): number {
  return lo + (hi - lo) * rng.next();
}

// standard normal (Box–Muller) — for MPPI/RL Gaussian exploration later.
export function gaussian(rng: Rng): number {
  const u = Math.max(1e-12, rng.next());
  const v = rng.next();
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
}
