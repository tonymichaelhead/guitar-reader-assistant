// Which fretboard position each measure is played in.
import { pick, shuffle } from './rng.js';

// Rotation off: one of the enabled positions, drawn once, for every measure.
// Rotation on: the enabled positions in a shuffled order, one per measure; no
// position repeats until all have appeared, then the same order starts again
// and simply stops wherever the piece ends.
export function planPositions({ positions, rotatePositions }, measureCount, rng) {
  const enabled = [...positions].sort((a, b) => a - b);
  if (!rotatePositions) {
    return new Array(measureCount).fill(pick(rng, enabled));
  }
  const order = shuffle(rng, enabled);
  return Array.from({ length: measureCount }, (_, i) => order[i % order.length]);
}
