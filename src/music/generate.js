// Entry point of the music core: settings + seed -> Score.
//
// Score = {
//   seed, settings, tonality (label or null),
//   measures: [{ number, position, notes: [{ pitch, start, dur }] }]
// }
// `start` and `dur` are in sixteenths from the start of the measure; `pitch`
// is { letter, octave, alter, value, fingerings } (see pitch.js, fretboard.js).
import { poolFor } from './fretboard.js';
import { musicalMelody } from './musical-melody.js';
import { planPositions } from './positions.js';
import { randomMelody } from './random-melody.js';
import { randomRhythm } from './rhythm.js';
import { mulberry32 } from './rng.js';

export function generateScore(settings, seed) {
  const rng = mulberry32(seed);
  const count = settings.measures;
  const positions = planPositions(settings, count, rng);
  const musical = settings.melody === 'musical';

  // Musical mode always needs the chromatic notes in view (it decides itself
  // whether to use them); Random mode draws straight from the filtered pool.
  const poolSettings = { strings: settings.strings, accidentals: musical || settings.accidentals };
  const byPosition = new Map();
  const pools = positions.map(position => {
    if (!byPosition.has(position)) byPosition.set(position, poolFor(position, poolSettings));
    return byPosition.get(position);
  });

  let bars;
  let tonality = null;
  if (musical) {
    ({ bars, tonality } = musicalMelody({ pools, positions, settings }, rng));
  } else {
    const rhythm = randomRhythm(settings.noteValues, count, rng);
    bars = randomMelody({ pools, rhythm, maxLeapSteps: settings.maxLeapSteps }, rng);
  }

  return {
    seed,
    settings: structuredClone(settings),
    tonality,
    measures: positions.map((position, i) => ({ number: i + 1, position, notes: bars[i] }))
  };
}
