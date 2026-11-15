// Seeded randomness. Every generator takes an `rng` (a function returning a
// float in [0, 1)) instead of calling Math.random, so a seed reproduces a score.

export function mulberry32(seed) {
  let a = seed >>> 0;
  return function rng() {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export const pick = (rng, list) => list[Math.floor(rng() * list.length)];

// Pick one item with probability proportional to its weight. Falls back to a
// uniform pick when no weight is positive.
export function weightedPick(rng, items, weights) {
  let total = 0;
  for (const w of weights) total += w > 0 ? w : 0;
  if (total <= 0) return pick(rng, items);
  let roll = rng() * total;
  for (let i = 0; i < items.length; i++) {
    const w = weights[i] > 0 ? weights[i] : 0;
    if (roll < w) return items[i];
    roll -= w;
  }
  return items[items.length - 1];
}

export function shuffle(rng, list) {
  const out = [...list];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}
