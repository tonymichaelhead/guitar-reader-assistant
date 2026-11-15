// Random mode: every note is drawn uniformly from the measure's pool. The only
// shaping is the original app's: no immediate repeat, and no leap wider than
// `maxLeapSteps` diatonic steps (given up after 50 tries, e.g. when a position
// change puts the next pool out of reach).
import { diatonicIndex } from './pitch.js';
import { pick } from './rng.js';
import { barSlots } from './rhythm.js';

export function randomMelody({ pools, rhythm, maxLeapSteps }, rng) {
  let prev = null;
  return rhythm.map((barCells, bar) =>
    barSlots(barCells).map(slot => {
      const pool = pools[bar];
      let choice;
      let guard = 0;
      do {
        choice = pick(rng, pool);
        guard++;
      } while (
        prev &&
        guard < 50 &&
        (Math.abs(diatonicIndex(choice) - diatonicIndex(prev)) > maxLeapSteps ||
          choice.value === prev.value)
      );
      prev = choice;
      return { pitch: choice, ...slot };
    }));
}
