/** Small seeded PRNG so battles can be replayed exactly in tests. */
export function makeRng(seed = Date.now()) {
  let a = seed >>> 0;
  const next = () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  next.int = (n) => Math.floor(next() * n);
  next.pick = (arr) => arr[Math.floor(next() * arr.length)];
  next.range = (lo, hi) => lo + next() * (hi - lo);
  next.chance = (p) => next() < p;
  return next;
}

export const clamp = (v, lo, hi) => (v < lo ? lo : v > hi ? hi : v);
