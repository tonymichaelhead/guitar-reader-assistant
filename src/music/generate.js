// Entry point of the music core: settings + seed -> Score.
//
// Score = {
//   seed, settings,
//   key (a key id from theory.js, or null: Random mode has no key),
//   tonality (the key's label, or null),
//   measures: [{ number, position, notes: [{ pitch, start, dur }] }]
// }
// `start` and `dur` are in sixteenths from the start of the measure; `pitch`
// is { letter, octave, alter, value, fingerings } (see pitch.js, fretboard.js).
import { keyPool, poolFor } from './fretboard.js';
import { musicalMelody } from './musical-melody.js';
import { planPositions } from './positions.js';
import { randomMelody } from './random-melody.js';
import { randomRhythm } from './rhythm.js';
import { mulberry32 } from './rng.js';
import { DEFAULT_KEY, keyById } from './theory.js';

export function generateScore(settings, seed) {
  const rng = mulberry32(seed);
  const count = settings.measures;
  const positions = planPositions(settings, count, rng);
  const musical = settings.melody === 'musical';
  // Settings that name no key on offer (they did not come through `sanitize`)
  // get the default one, so Musical mode is never without a key.
  const key = musical ? keyById(settings.key) || keyById(DEFAULT_KEY) : null;

  // Musical mode is given every note of the position, spelled for the key, and
  // decides for itself whether to leave the scale. Random mode draws straight
  // from the pool its accidentals setting describes.
  const { strings, accidentals } = settings;
  const byPosition = new Map();
  const pools = positions.map(position => {
    if (!byPosition.has(position)) {
      byPosition.set(position, musical
        ? keyPool(position, { strings }, key)
        : poolFor(position, { accidentals, strings }));
    }
    return byPosition.get(position);
  });

  let bars;
  if (musical) {
    bars = musicalMelody({ pools, positions, settings, key }, rng);
  } else {
    const rhythm = randomRhythm(settings.noteValues, count, rng);
    bars = randomMelody({ pools, rhythm, maxLeapSteps: settings.maxLeapSteps }, rng);
  }

  return {
    seed,
    settings: structuredClone(settings),
    key: key ? key.id : null,
    tonality: key ? key.label : null,
    measures: positions.map((position, i) => ({ number: i + 1, position, notes: bars[i] }))
  };
}
